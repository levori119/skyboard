// הסיבוב המהיר (דלתא) - רק מה שהשתנה, ובלי למחוק את כל השאר.
//
// **למה זו הבדיקה המסוכנת ביותר במנגנון:** הצילום המלא קובע "מה שאינו בצילום
// נמחק". בדלתא `rows` מכיל רק את מה שזז, ולכן אותה שורת מחיקה בדיוק הייתה
// מוחקת את **כל** המאגר המקומי בסיבוב הראשון. ההפרדה בין `rows` (מה השתנה)
// לבין `keys` (מה קיים) היא כל ההבדל, והיא נבדקת כאן משני הכיוונים.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { touchFunctionDdl, triggerDdl } from '../db/versionedTables.js';
import { snapshotDelta, ingestSnapshot, mirrorRowKey, FAST_TABLES } from './mirror.js';

let centralDb, localDb;
const clientFor = (db) => ({ query: (sql, params) => db.query(sql, params ?? []) });

const SCHEMA = `
  CREATE TABLE public.strips (
    id SERIAL PRIMARY KEY,
    callsign TEXT NOT NULL,
    alt TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    rev BIGINT NOT NULL DEFAULT 0
  );
`;

async function makeDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create();
  await db.exec(SCHEMA);
  await db.exec(touchFunctionDdl());
  for (const sql of triggerDdl('strips')) await db.exec(sql);
  return db;
}

/** צילום דלתא מהמרכז, בדיוק כפי שהנתיב עושה. */
const delta = (since) => snapshotDelta(clientFor(centralDb), 'public', since);

/** קליטה בעמדה. */
const ingest = (snap, pending = new Set()) =>
  ingestSnapshot(clientFor(localDb), 'public', snap, pending);

const localStrips = async () => (await localDb.query(
  'SELECT id, callsign, alt FROM public.strips ORDER BY id')).rows;

beforeAll(async () => {
  centralDb = await makeDb();
  localDb = await makeDb();
}, 120000);

afterAll(async () => {
  await centralDb?.close();
  await localDb?.close();
});

beforeEach(async () => {
  for (const db of [centralDb, localDb]) await db.exec('DELETE FROM public.strips');
  // שלושה פ"מים, זהים בשני הצדדים - כאילו סיבוב מלא כבר רץ.
  //
  // ⚠️ `updated_at` **בעבר**, ובכוונה: לדלתא יש חפיפה לאחור של שתי שניות,
  // ולכן שורה שנכתבה ברגע זה נכללת בכל דלתא - והבדיקה הייתה עוברת גם אילו
  // הסינון כלל לא עבד. שעה אחורה מוציאה אותן מהחלון בוודאות.
  for (const db of [centralDb, localDb]) {
    await db.query(
      `INSERT INTO public.strips (id, callsign, alt, updated_at) VALUES
         (1, 'AAA', '100', NOW() - INTERVAL '1 hour'),
         (2, 'BBB', '200', NOW() - INTERVAL '1 hour'),
         (3, 'CCC', '300', NOW() - INTERVAL '1 hour')`);
  }
});

describe('snapshotDelta', () => {
  it('נוגע רק בטבלאות שמשתנות תוך כדי משמרת', () => {
    expect(FAST_TABLES).toContain('strips');
    expect(FAST_TABLES).toContain('strip_transfers');
    expect(FAST_TABLES).not.toContain('maps');
    expect(FAST_TABLES).not.toContain('workstation_presets');
  });

  it('בלי `since` מחזיר הכל - כמו צילום מלא של שש הטבלאות', async () => {
    const snap = await delta(null);
    const t = snap.tables.find(x => x.table === 'strips');
    expect(snap.delta).toBe(true);
    expect(t.rows).toHaveLength(3);
    expect(t.full).toBe(true);
  });

  it('עם `since` מחזיר **רק** את מה שהשתנה', async () => {
    const base = await delta(null);
    await centralDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 2`);

    const snap = await delta(base.at);
    const t = snap.tables.find(x => x.table === 'strips');
    expect(t.rows).toHaveLength(1);
    expect(Number(t.rows[0].id)).toBe(2);
    expect(t.full).toBe(false);
  });

  it('רשימת המפתחות **מלאה תמיד** - זה מה שמאפשר לזהות מחיקות', async () => {
    const base = await delta(null);
    await centralDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 2`);

    const snap = await delta(base.at);
    const t = snap.tables.find(x => x.table === 'strips');
    expect(t.rows).toHaveLength(1);           // השתנתה אחת
    expect(t.keys.map(k => Number(k.id)).sort()).toEqual([1, 2, 3]); // וקיימות שלוש
  });

  it('כשאין שינויים התשובה ריקה משורות - וזה מה שמאפשר להריץ אותה כל הזמן', async () => {
    const base = await delta(null);
    const snap = await delta(base.at);
    expect(snap.tables.find(x => x.table === 'strips').rows).toHaveLength(0);
  });
});

describe('קליטת דלתא בעמדה', () => {
  it('שורה שהשתנתה מתעדכנת, והשאר **אינן נמחקות**', async () => {
    // ⚠️ זו התקלה שהבדיקה הזו קיימת בשבילה: עם הלוגיקה של צילום מלא,
    // שתי השורות שלא השתנו היו נמחקות כאן.
    const base = await delta(null);
    await centralDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 2`);

    const stats = await ingest(await delta(base.at));
    expect(stats.deleted).toBe(0);

    const rows = await localStrips();
    expect(rows).toHaveLength(3);
    expect(rows.find(r => Number(r.id) === 2).alt).toBe('250');
  });

  it('שורה שנמחקה במרכז יורדת גם בעמדה - בלי להמתין לסיבוב המלא', async () => {
    const base = await delta(null);
    await centralDb.query(`DELETE FROM public.strips WHERE id = 3`);

    const stats = await ingest(await delta(base.at));
    expect(stats.deleted).toBe(1);
    expect((await localStrips()).map(r => Number(r.id))).toEqual([1, 2]);
  });

  it('דלתא **בלי** keys אינה מוחקת דבר - גרסאות מרכז/עמדה שאינן תואמות', async () => {
    const base = await delta(null);
    await centralDb.query(`DELETE FROM public.strips WHERE id = 3`);

    const snap = await delta(base.at);
    for (const t of snap.tables) delete t.keys;   // כאילו הגיע ממרכז ישן

    const stats = await ingest(snap);
    expect(stats.deleted).toBe(0);
    // עדיף שורה שנמחקה במרכז ושורדת דקה נוספת, מאשר מאגר שמתרוקן
    expect(await localStrips()).toHaveLength(3);
  });

  it('עבודה שממתינה ביומן אינה נדרסת ואינה נמחקת גם בדלתא', async () => {
    await localDb.query(`UPDATE public.strips SET alt = 'שלי' WHERE id = 2`);
    const base = await delta(null);
    await centralDb.query(`UPDATE public.strips SET alt = '999' WHERE id = 2`);
    await centralDb.query(`DELETE FROM public.strips WHERE id = 2`);

    const pending = new Set([mirrorRowKey('strips', { id: 2 })]);
    const stats = await ingest(await delta(base.at), pending);

    expect(stats.deleted).toBe(0);
    expect((await localStrips()).find(r => Number(r.id) === 2).alt).toBe('שלי');
  });

  it('פ"מ שנוצר במרכז מגיע בדלתא הראשונה שאחריו', async () => {
    const base = await delta(null);
    await centralDb.query(
      `INSERT INTO public.strips (id, callsign, alt) VALUES (9, 'NEW', '400')`);

    await ingest(await delta(base.at));
    expect((await localStrips()).find(r => Number(r.id) === 9).callsign).toBe('NEW');
  });
});
