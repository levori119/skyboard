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
