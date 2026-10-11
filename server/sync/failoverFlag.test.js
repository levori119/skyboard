// דגל "התחשבות בנתק" - האם העמדה נופלת למאגר המקומי כשהמרכז לא עונה.
//
// הבקשה (אורי, 2026-10-11): "FLAG שמגדיר אם מתחשבים בנתק או לא - כמו פעם,
// לפני שהגדרנו גיבוי מקומי. מוגדר בניהול, וכל עלייה בודקת ב-DB".
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FAILOVER_KEY, parseFailover, readFailover, writeFailover, resolveFailoverAtBoot } from './failoverFlag.js';

let db;
const q = (sql, params) => db.query(sql, params ?? []);

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = await PGlite.create();
  await db.exec(`CREATE TABLE system_defaults (key VARCHAR(100) PRIMARY KEY, value TEXT DEFAULT '', updated_at TIMESTAMPTZ DEFAULT NOW())`);
}, 120000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('DELETE FROM system_defaults'); });

describe('parseFailover', () => {
  it('לא הוגדר מעולם = דלוק - ההתנהגות של היום לא משתנה בלי שמישהו בחר', () => {
    expect(parseFailover(undefined)).toBe(true);
    expect(parseFailover(null)).toBe(true);
    expect(parseFailover('')).toBe(true);
  });
  it('ערכי כיבוי', () => {
    for (const v of ['0', 'false', 'off', 'OFF', ' 0 ']) expect(parseFailover(v)).toBe(false);
  });
  it('ערכי הדלקה', () => {
    for (const v of ['1', 'true', 'on']) expect(parseFailover(v)).toBe(true);
  });
});

describe('קריאה וכתיבה ב-system_defaults', () => {
  it('ברירת מחדל דלוק כשאין שורה', async () => {
    expect(await readFailover(q)).toBe(true);
  });
  it('כתיבה וקריאה חוזרת', async () => {
    await writeFailover(q, false);
    expect(await readFailover(q)).toBe(false);
    const { rows } = await q(`SELECT value FROM system_defaults WHERE key = $1`, [FAILOVER_KEY]);
    expect(rows[0].value).toBe('0');
    await writeFailover(q, true);
    expect(await readFailover(q)).toBe(true);
  });
});

describe('הכרעה בעליית העמדה', () => {
  it('המרכז עונה - הוא הסמכות', async () => {
    const r = await resolveFailoverAtBoot({ fetchCentral: async () => false, readLocal: async () => true });
    expect(r).toEqual({ enabled: false, source: 'central' });
  });
  it('אין קשר למרכז - הערך האחרון שהגיע במראה למאגר המקומי', async () => {
    const r = await resolveFailoverAtBoot({
      fetchCentral: async () => { throw new Error('offline'); }, readLocal: async () => false,
    });
    expect(r).toEqual({ enabled: false, source: 'local' });
  });
  it('אין מרכז ואין מאגר מקומי - דלוק (ההתנהגות הקיימת)', async () => {
    const r = await resolveFailoverAtBoot({
      fetchCentral: async () => null, readLocal: async () => { throw new Error('x'); },
    });
    expect(r).toEqual({ enabled: true, source: 'default' });
  });
});
