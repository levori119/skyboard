// מפתח הדחיפה חייב להיות **בדיוק** המפתח הראשי (ביקורת קוד #3, ממצא 3).
//
// ההתאמה לשורה היא `to_jsonb(t) @> pk`, ו-`{}` מוכל בכל שורה. דחיפה של
// `{"op":"D","table_name":"strips","pk":{}}` מחקה את **כל** הפ"מים בסביבה, וכל
// משתמש מחובר יכול היה לשלוח אותה. מפתח חלקי בטבלה עם מפתח מורכב (פ"מ בטבלת
// עמדה) פגע באותו אופן בכל השורות של אותו פ"מ.
//
// PGlite ולא mock: הסכנה חיה ב-SQL עצמו (`@>`), ו-mock היה בודק רק שהמחרוזת
// שכתבנו היא המחרוזת שציפינו לה.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { applyOps, RESULT, REASON } from './apply.js';

let db;
const client = () => ({ query: (sql, params) => db.query(sql, params ?? []) });

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = await PGlite.create();
  await db.exec(`
    CREATE TABLE public.strips (
      id SERIAL PRIMARY KEY,
      callsign TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      rev BIGINT NOT NULL DEFAULT 0
    );
    CREATE TABLE public.strip_table_assignments (
      strip_id INTEGER NOT NULL,
      preset_id INTEGER NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      rev BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (strip_id, preset_id)
    );
  `);
}, 60_000);

afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec(`
    TRUNCATE public.strips, public.strip_table_assignments;
    INSERT INTO public.strips (id, callsign) VALUES (1, 'א'), (2, 'ב'), (3, 'ג');
    INSERT INTO public.strip_table_assignments (strip_id, preset_id) VALUES (1, 10), (1, 11), (2, 10);
  `);
});

const push = async (ops) => {
  await db.query('BEGIN');
  const results = await applyOps(client(), ops.map((o, i) => ({ key: `k${i}`, baseRev: null, journalIds: [i], ...o })), 'public');
  await db.query('COMMIT');
  return results;
};
const countOf = async (table) => (await db.query(`SELECT COUNT(*)::int AS n FROM public.${table}`)).rows[0].n;

describe('מפתח שאינו המפתח הראשי המלא - נדחה, ושום שורה לא נוגעת', () => {
  it('מחיקה עם pk ריק אינה מוחקת את כל הפ"מים', async () => {
    const [r] = await push([{ op: 'D', table_name: 'strips', pk: {} }]);
    expect(r.status).toBe(RESULT.ERROR);
    expect(r.reason).toBe(REASON.INVALID_PK);
    expect(await countOf('strips')).toBe(3);
  });

  it('עדכון עם pk ריק אינו דורס את כל הפ"מים', async () => {
    const [r] = await push([{ op: 'U', table_name: 'strips', pk: {}, row: { callsign: 'X' } }]);
    expect(r.status).toBe(RESULT.ERROR);
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM public.strips WHERE callsign = 'X'`);
    expect(rows[0].n).toBe(0);
  });

  it('מפתח חלקי בטבלה עם מפתח מורכב - לא מוחק את כל השיבוצים של הפ"מ', async () => {
    const [r] = await push([{ op: 'D', table_name: 'strip_table_assignments', pk: { strip_id: 1 } }]);
    expect(r.status).toBe(RESULT.ERROR);
    expect(r.reason).toBe(REASON.INVALID_PK);
    expect(await countOf('strip_table_assignments')).toBe(3);
  });

  it('ערך null, אובייקט או מערך במפתח - נדחה', async () => {
    const results = await push([
      { op: 'D', table_name: 'strips', pk: { id: null } },
      { op: 'D', table_name: 'strips', pk: { id: {} } },
      { op: 'D', table_name: 'strips', pk: { id: [1] } },
    ]);
    for (const r of results) expect(r.reason).toBe(REASON.INVALID_PK);
    expect(await countOf('strips')).toBe(3);
  });

  it('עמודה נוספת שאינה חלק מהמפתח - נדחה (המפתח אינו מסנן חופשי)', async () => {
    const [r] = await push([{ op: 'D', table_name: 'strips', pk: { id: 1, callsign: 'א' } }]);
    expect(r.reason).toBe(REASON.INVALID_PK);
    expect(await countOf('strips')).toBe(3);
  });

  it('pk שאינו אובייקט - נדחה', async () => {
    const results = await push([
      { op: 'D', table_name: 'strips', pk: null },
      { op: 'D', table_name: 'strips', pk: 'id=1' },
    ]);
    for (const r of results) expect(r.reason).toBe(REASON.INVALID_PK);
    expect(await countOf('strips')).toBe(3);
  });
});

describe('מפתח מלא - ממשיך לעבוד כרגיל', () => {
  it('מחיקה לפי id מוחקת שורה אחת בלבד', async () => {
    const [r] = await push([{ op: 'D', table_name: 'strips', pk: { id: 2 } }]);
    expect(r.status).toBe(RESULT.APPLIED);
    expect(await countOf('strips')).toBe(2);
  });

  it('מפתח מורכב מלא מוחק שיבוץ אחד בלבד', async () => {
    const [r] = await push([{ op: 'D', table_name: 'strip_table_assignments', pk: { strip_id: 1, preset_id: 10 } }]);
    expect(r.status).toBe(RESULT.APPLIED);
    expect(await countOf('strip_table_assignments')).toBe(2);
  });

  it('מזהה כמחרוזת (כפי שמגיע ב-JSON מהיומן) עדיין מתקבל', async () => {
    const [r] = await push([{ op: 'D', table_name: 'strips', pk: { id: '3' } }]);
    expect(r.status).not.toBe(RESULT.ERROR);
  });
});
