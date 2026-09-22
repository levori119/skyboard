// שירות המראה - מה שהופך את המאגר המקומי ממשהו שמתמלא "אם" למשהו שמתמלא תמיד.
//
// התקלה שזה מתעד: הסנכרון רץ בדפדפן, ולכן די היה שהעמדה סגורה או שאיש אינו
// מחובר כדי שהמאגר המקומי יישאר ריק - וזה התגלה רק כשהקשר נפל והמסך התרוקן.
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

let pool, central, centralUrl, seen;

/** מרכז מדומה: מחזיר רשימת טבלאות ואז צילום לכל קבוצה. */
const startCentral = () => {
  seen = { tables: 0, batches: [], headers: [], fail: 0 };
  const srv = http.createServer((req, res) => {
    seen.headers.push({
      token: req.headers['x-station-token'],
      key: req.headers['x-station-key'],
      env: req.headers['x-env'],
    });
    if (seen.fail > 0) { seen.fail--; res.writeHead(503); res.end('{}'); return; }

    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/sync/mirror/tables') {
      seen.tables++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tables: ['strips', 'notes'] }));
      return;
    }
    if (url.pathname === '/api/sync/mirror') {
      const names = (url.searchParams.get('tables') || '').split(',').filter(Boolean);
      seen.batches.push(names);
      const rowsFor = t => (t === 'strips'
        ? [{ id: 1, callsign: 'ALPHA' }, { id: 2, callsign: 'BRAVO' }]
        : [{ id: 7, body: 'הערה' }]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ schema: 'public', at: new Date().toISOString(),
        tables: names.map(t => ({ table: t, rows: rowsFor(t) })) }));
      return;
    }
    res.writeHead(404); res.end('{}');
  });
  return srv;
};

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  await pool.query(`CREATE TABLE strips (id INTEGER PRIMARY KEY, callsign VARCHAR(50))`);
  await pool.query(`CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)`);

  central = startCentral();
  await new Promise(r => central.listen(0, '127.0.0.1', r));
  centralUrl = `http://127.0.0.1:${central.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise(r => central.close(r));
  await pool.end?.();
});

beforeEach(async () => {
  // הילד לפני ההורה: `child_rows` (נוצרת בהמשך הקובץ) מצביעה ל-`strips`,
  // וניקוי בסדר ההפוך מפיל את ההכנה עצמה על אותו מפתח זר שהבדיקה בודקת.
  await pool.query('DELETE FROM child_rows').catch(() => {});
  await pool.query('DELETE FROM strips');
  await pool.query('DELETE FROM notes');
});

const noKeys = async () => new Set();

const runDaemonOnce = async (opts = {}) => {
  const { __internals } = await import('./daemon.js');
  return __internals.runOnce({
    central: centralUrl,
    headers: { 'X-Station-Token': 'T', 'X-Station-Key': 'twr-1', 'X-Env': '1' },
    pool, schema: 'public', protectedKeys: noKeys, log: () => {},
    ...opts,
  });
};

describe('שירות המראה', () => {
  it('ממלא את המאגר המקומי מהמרכז, בלי דפדפן ובלי מי שמחובר', async () => {
    await runDaemonOnce();
    const { rows } = await pool.query('SELECT callsign FROM strips ORDER BY id');
    expect(rows.map(r => r.callsign)).toEqual(['ALPHA', 'BRAVO']);
    const notes = await pool.query('SELECT body FROM notes');
    expect(notes.rows[0].body).toBe('הערה');
  });

  it('מושך את רשימת הטבלאות ואז קבוצות - לא בקשה אחת ענקית', async () => {
    seen.batches = [];
    await runDaemonOnce();
    expect(seen.batches.length).toBeGreaterThan(0);
    expect(seen.batches.flat().sort()).toEqual(['notes', 'strips']);
  });

  it('כל בקשה נושאת את אסימון העמדה ואת הסביבה', async () => {
    seen.headers = [];
    await runDaemonOnce();
    expect(seen.headers.every(h => h.token === 'T' && h.key === 'twr-1' && h.env === '1')).toBe(true);
  });

  // ⚠️ הכלל הקריטי: המראה לעולם אינה דורסת עבודה שטרם סונכרנה. בלעדיו סיבוב
  // אחד של השירות היה מוחק בשקט מה שהמפעיל עשה בנתק.
  it('שורה שממתינה ביומן אינה נדרסת', async () => {
    await pool.query(`INSERT INTO strips (id, callsign) VALUES (1, 'שלי-בנתק')`);
    const { mirrorRowKey } = await import('./mirror.js');
    const guard = async () => new Set([mirrorRowKey('strips', { id: 1 })]);
    await runDaemonOnce({ protectedKeys: guard });

    const mine = await pool.query('SELECT callsign FROM strips WHERE id = 1');
    expect(mine.rows[0].callsign).toBe('שלי-בנתק');
    // ומה שאינו מוגן כן מתעדכן
    const other = await pool.query('SELECT callsign FROM strips WHERE id = 2');
    expect(other.rows[0].callsign).toBe('BRAVO');
  });

  it('כשל מהמרכז מתפוצץ ואינו נבלע - הלולאה היא שמחליטה מה לעשות', async () => {
    seen.fail = 1;
    await expect(runDaemonOnce()).rejects.toThrow(/HTTP 503/);
  });

  it('בלי כתובת או אסימון - השירות אינו נדלק, והעמדה ממשיכה לעבוד', async () => {
    const { startMirrorDaemon, mirrorDaemonState } = await import('./daemon.js');
    const stop = startMirrorDaemon({ central: '', token: '', pool, log: () => {} });
    expect(mirrorDaemonState().enabled).toBe(false);
    stop();
  });
});

// ── ילד שמגיע לפני ההורה ─────────────────────────────────────────────────────
// התקלה מהייצור: `joining_point_strips` יושב במקום 5 ברשימת הטבלאות ו-`strips`
// שהוא ההורה שלו במקום 70, ולכן הילד נמשך 65 מקומות לפני ההורה ונפל על מפתח
// זר - ואיתו **כל סיבוב המראה**. בנוסף `maps` אינה נשלחת כלל (כבדה מדי), וכ-66
// טבלאות מצביעות עליה.
//
// הפתרון אינו ניחוש סדר טוב יותר אלא **קליטת רפליקציה**: הצילום נלקח בטרנזקציה
// אחת במרכז, שם האילוצים כבר נאכפו, ואכיפה חוזרת כאן אינה מוסיפה אמת.
describe('קליטה בסדר לא תקין - מפתחות זרים אינם נאכפים', () => {
  beforeAll(async () => {
    await pool.query(`CREATE TABLE child_rows (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER NOT NULL REFERENCES strips(id),
      label TEXT)`);
  });

  const ingest = async (tables) => {
    const { ingestSnapshot } = await import('./mirror.js');
    return ingestSnapshot({ query: (sql, p) => pool.query(sql, p) }, 'public',
      { schema: 'public', at: '', tables }, new Set());
  };

  it('ילד שההורה שלו טרם הגיע נכנס, והסיבוב אינו נופל', async () => {
    const r = await ingest([{ table: 'child_rows', rows: [{ id: 1, parent_id: 55, label: 'לפני-ההורה' }] }]);
    expect(r.failedTables).toHaveLength(0);
    expect(r.upserted).toBe(1);
    const { rows } = await pool.query('SELECT label FROM child_rows WHERE id = 1');
    expect(rows[0].label).toBe('לפני-ההורה');
  });

  // הורה שכלל אינו נשלח במראה (כמו `maps`) - הילדים שלו עדיין מגיעים. זה
  // ההבדל בין מאגר שחסרות בו 66 טבלאות לבין מאגר מלא.
  it('הורה שאינו במראה כלל אינו מונע מהילדים להיכנס', async () => {
    const r = await ingest([
      { table: 'child_rows', rows: [{ id: 9, parent_id: 999999, label: 'הורה-לא-נשלח' }] },
      { table: 'notes', rows: [{ id: 3, body: 'נכנס גם הוא' }] },
    ]);
    expect(r.failedTables).toHaveLength(0);
    const c = await pool.query('SELECT label FROM child_rows WHERE id = 9');
    expect(c.rows[0].label).toBe('הורה-לא-נשלח');
    const n = await pool.query('SELECT body FROM notes WHERE id = 3');
    expect(n.rows[0].body).toBe('נכנס גם הוא');
  });

  // ⚠️ `SET LOCAL` ולא `SET`: התוקף נגמר ב-COMMIT. בלי זה כל כתיבה תפעולית
  // אחרי הקליטה הייתה רצה בלי אכיפת מפתחות זרים - כלומר המאגר המקומי מפסיק
  // להגן על עצמו אחרי המראה הראשונה.
  it('אחרי הקליטה אכיפת המפתחות הזרים חוזרת', async () => {
    await ingest([{ table: 'notes', rows: [{ id: 4, body: 'x' }] }]);
    await expect(
      pool.query(`INSERT INTO child_rows (id, parent_id, label) VALUES (77, 888888, 'ידני')`)
    ).rejects.toThrow(/foreign key|violates/i);
  });
});
