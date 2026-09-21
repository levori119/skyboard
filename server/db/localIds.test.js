// טווח המזהים המקומי - מה שמונע משני פ"מים שונים לשאת את אותו `id`.
//
// הבדיקה כאן היא על הגבולות: גוש שיוצא מהטווח של int4 היה מפיל כל הכנסה
// בעמדה מנותקת, והזזת רצף אחורה הייתה מחלקת שוב מזהה שכבר תפוס - כלומר
// בדיוק ההתנגשות שהמנגנון בא למנוע.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  LOCAL_ID_BASE, LOCAL_ID_BLOCK, LOCAL_ID_BLOCKS,
  isLocalId, blockIndexOf, localIdStart, applyLocalIdRange,
} from './localIds.js';

const INT4_MAX = 2147483647;

afterEach(() => { delete process.env.SKYKING_STATION_ORDINAL; });

describe('גבולות הטווח', () => {
  it('הגוש האחרון עדיין נכנס ב-int4', () => {
    const top = LOCAL_ID_BASE + LOCAL_ID_BLOCKS * LOCAL_ID_BLOCK;
    expect(top).toBeLessThan(INT4_MAX);
  });

  it('מזהה מהטווח המקומי מזוהה, ומזהה רגיל לא', () => {
    expect(isLocalId(LOCAL_ID_BASE)).toBe(true);
    expect(isLocalId(LOCAL_ID_BASE + 5)).toBe(true);
    expect(isLocalId(42)).toBe(false);
    expect(isLocalId(LOCAL_ID_BASE - 1)).toBe(false);
  });

  it('ערך שאינו מספר אינו "מקומי" - מפתח טקסט (UUID) לא ייפול לכאן', () => {
    expect(isLocalId('abc')).toBe(false);
    expect(isLocalId(null)).toBe(false);
    expect(isLocalId(undefined)).toBe(false);
  });
});

describe('בחירת הגוש', () => {
  it('אותה עמדה מקבלת את אותו גוש בכל עלייה', () => {
    expect(blockIndexOf('twr-01')).toBe(blockIndexOf('twr-01'));
  });

  it('עמדות שונות מקבלות גושים שונים', () => {
    expect(blockIndexOf('twr-01')).not.toBe(blockIndexOf('twr-02'));
  });

  it('הגוש תמיד בתוך הטווח', () => {
    for (const key of ['a', 'twr-99', 'ctrl-main', '', 'עמדה']) {
      const b = blockIndexOf(key);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(LOCAL_ID_BLOCKS);
    }
  });

  it('מספר עמדה מפורש גובר על הגיבוב', () => {
    process.env.SKYKING_STATION_ORDINAL = '3';
    expect(localIdStart('כל שם שהוא')).toBe(LOCAL_ID_BASE + 3 * LOCAL_ID_BLOCK);
  });

  it('מספר עמדה לא חוקי נופל חזרה לגיבוב ולא מייצר טווח פסול', () => {
    process.env.SKYKING_STATION_ORDINAL = '999999';
    expect(localIdStart('twr-01')).toBe(LOCAL_ID_BASE + blockIndexOf('twr-01') * LOCAL_ID_BLOCK);
  });
});

describe('הזזת הרצפים', () => {
  let db, pool;

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    db = await PGlite.create();
    pool = { query: (sql, params) => db.query(sql, params ?? []) };
    await db.exec(`
      CREATE TABLE public.strips (id SERIAL PRIMARY KEY, callsign TEXT);
      CREATE TABLE public.no_serial (id TEXT PRIMARY KEY);
    `);
  }, 60000);

  afterAll(async () => { await db?.close(); });

  it('מזהה שנוצר אחרי ההזזה נמצא בטווח המקומי', async () => {
    process.env.SKYKING_STATION_ORDINAL = '1';
    const before = await db.query(`INSERT INTO public.strips (callsign) VALUES ('OLD') RETURNING id`);
    expect(isLocalId(before.rows[0].id)).toBe(false);

    const moved = await applyLocalIdRange(pool, 'twr-01');
    expect(moved).toBe(1); // רק ל-strips יש רצף

    const after = await db.query(`INSERT INTO public.strips (callsign) VALUES ('NEW') RETURNING id`);
    expect(after.rows[0].id).toBe(LOCAL_ID_BASE + LOCAL_ID_BLOCK);
    expect(isLocalId(after.rows[0].id)).toBe(true);
  });

  it('הרצה חוזרת אינה מזיזה אחורה ואינה מחלקת מזהה שכבר ניתן', async () => {
    process.env.SKYKING_STATION_ORDINAL = '1';
    const first = await db.query(`INSERT INTO public.strips (callsign) VALUES ('A') RETURNING id`);
    const moved = await applyLocalIdRange(pool, 'twr-01');
    expect(moved).toBe(0); // כבר בגוש - לא נגעו
    const second = await db.query(`INSERT INTO public.strips (callsign) VALUES ('B') RETURNING id`);
    expect(second.rows[0].id).toBeGreaterThan(first.rows[0].id);
  });
});
