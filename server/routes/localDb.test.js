// הצצה אל המאגר המקומי - הדף שעונה על "האם בכלל יש כאן משהו".
//
// למה זה קיים: עד שהדף נבנה, הדרך היחידה לדעת אם המראה מהמרכז הצליחה הייתה
// **לנתק את העמדה ולראות מסך ריק** - כלומר לגלות את התקלה ברגע הכי גרוע.
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;

const get = async (path) => {
  const r = await fetch(`${base}${path}`);
  return { status: r.status, json: await r.json().catch(() => null) };
};

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: router } = await import('./localDb.js');
  const { listen } = await import('../listen.js');

  await pool.query(`CREATE TABLE strips (id SERIAL PRIMARY KEY, callsign VARCHAR(50), extra JSONB)`);
  await pool.query(`CREATE TABLE empty_one (id SERIAL PRIMARY KEY, note TEXT)`);
  await pool.query(`INSERT INTO strips (callsign, extra) VALUES ('ABC', '{"k":1}'), ('DEF', NULL)`);

  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise(r => server.close(r));
  await pool.end?.();
});

describe('סיכום המאגר המקומי', () => {
  it('מחזיר את כל הטבלאות עם מספר השורות בכל אחת', async () => {
    const { status, json } = await get('/api/__localdb/summary');
    expect(status).toBe(200);
    const byName = Object.fromEntries(json.tables.map(t => [t.table, t.rows]));
    expect(byName.strips).toBe(2);
    expect(byName.empty_one).toBe(0);
  });

  // ספירה אמיתית ולא הערכה מ-reltuples: הערכה שמראה 0 על טבלה מלאה היא בדיוק
  // המידע השגוי שהדף בא למנוע.
  it('סך השורות הוא סכום אמיתי', async () => {
    const { json } = await get('/api/__localdb/summary');
    expect(json.totalRows).toBe(json.tables.reduce((a, t) => a + (t.rows || 0), 0));
    expect(json.tableCount).toBe(json.tables.length);
  });
});

describe('תוכן טבלה', () => {
  it('מחזיר עמודות, סך הכל ושורות', async () => {
    const { status, json } = await get('/api/__localdb/rows?table=strips&limit=1');
    expect(status).toBe(200);
    expect(json.columns.map(c => c.name)).toEqual(['id', 'callsign', 'extra']);
    expect(json.total).toBe(2);
    expect(json.rows).toHaveLength(1);
  });

  it('offset מזיז, ו-limit מוגבל בתקרה', async () => {
    const first = await get('/api/__localdb/rows?table=strips&limit=1&offset=0');
    const second = await get('/api/__localdb/rows?table=strips&limit=1&offset=1');
    expect(first.json.rows[0].callsign).not.toBe(second.json.rows[0].callsign);

    const huge = await get('/api/__localdb/rows?table=strips&limit=99999');
    expect(huge.json.limit).toBe(500);
  });

  // ⚠️ שם הטבלה מגיע מה-query ונכנס לשאילתה. ציטוט לבדו אינו מספיק: שם שאינו
  // קיים היה מייצר שגיאת SQL גולמית שנשלחת ללקוח, ושם של טבלת מערכת היה נקרא
  // בשמחה. רשימת ההיתר היא הקטלוג של הסכמה, ותו לא.
  it('טבלה שאינה בסכמה - 404, ולא שגיאת SQL', async () => {
    const r = await get('/api/__localdb/rows?table=pg_shadow');
    expect(r.status).toBe(404);
    expect(r.json.error).toContain('לא קיימת');
  });

  it('ניסיון הזרקה דרך שם הטבלה נדחה, והטבלה שורדת', async () => {
    const evil = encodeURIComponent('strips"; DROP TABLE strips;--');
    const r = await get(`/api/__localdb/rows?table=${evil}`);
    expect(r.status).toBe(404);
    const still = await get('/api/__localdb/rows?table=strips');
    expect(still.json.total).toBe(2);
  });

  it('בלי שם טבלה - 404', async () => {
    expect((await get('/api/__localdb/rows')).status).toBe(404);
  });
});
