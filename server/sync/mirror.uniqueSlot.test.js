// מראה מול אינדקס ייחודי שאינו המפתח הראשי (2026-10-11).
//
// הלוג של סוכן העמדה: בכל סיבוב מראה, מאות סיבובים ברצף -
//   "סיבוב שני: 1 טבלאות נפלו · עדיין נופלות: station_sessions"
//
// `station_sessions` מחזיקה אינדקס ייחודי חלקי: סשן **פתוח** אחד לכל עמדה
// (`preset_id WHERE exited_at IS NULL`). שורה פתוחה ישנה במאגר המקומי - שהמרכז
// כבר סגר או מחק - תופסת את המשבצת, והסשן הפתוח החדש מהמרכז נדחה. הטבלה כולה
// מתגלגלת אחורה בסייפפוינט שלה, ולכן גם השורה הישנה לא מתעדכנת לעולם: התקלה
// מנציחה את עצמה, וכל סיבוב משלם משיכה שנייה מהמרכז בשבילה.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ingestSnapshot, mirrorRowKey } from './mirror.js';

let localDb;
const client = () => ({ query: (sql, params) => localDb.query(sql, params ?? []) });

const SCHEMA = `
  CREATE TABLE public.station_sessions (
    id SERIAL PRIMARY KEY,
    preset_id INTEGER,
    entered_at TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 hour',
    exited_at TIMESTAMPTZ
  );
  CREATE UNIQUE INDEX idx_station_sessions_open
    ON public.station_sessions(preset_id) WHERE exited_at IS NULL;
`;

const AT = new Date().toISOString();
const OLD = new Date(Date.now() - 3600_000).toISOString();
const snap = (rows) => ({ at: AT, tables: [{ table: 'station_sessions', rows }] });
const ingest = (s, pending) => ingestSnapshot(client(), 'public', s, pending);
const rows = async () => (await localDb.query(
  'SELECT id, preset_id, exited_at IS NULL AS open FROM public.station_sessions ORDER BY id')).rows;

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  localDb = await PGlite.create();
  await localDb.exec(SCHEMA);
}, 120000);

afterAll(async () => { await localDb?.close(); });

beforeEach(async () => { await localDb.exec('DELETE FROM public.station_sessions'); });

describe('מראה מול אינדקס ייחודי חלקי', () => {
  it('שורה פתוחה ישנה שהמרכז מחק אינה חוסמת את הסשן הפתוח של המרכז', async () => {
    await localDb.query(`INSERT INTO public.station_sessions (id, preset_id, entered_at) VALUES (1, 5, $1)`, [OLD]);
    const stats = await ingest(snap([{ id: 2, preset_id: 5, entered_at: OLD, exited_at: null }]));
    expect(stats.failedTables).toEqual([]);
    expect(await rows()).toEqual([{ id: 2, preset_id: 5, open: true }]);
  });

  it('המרכז סגר את הישנה ופתח חדשה - הסדר בצילום אינו משנה', async () => {
    await localDb.query(`INSERT INTO public.station_sessions (id, preset_id, entered_at) VALUES (1, 5, $1)`, [OLD]);
    // החדשה **לפני** סגירת הישנה - זה הסדר שנכשל
    const stats = await ingest(snap([
      { id: 2, preset_id: 5, entered_at: OLD, exited_at: null },
      { id: 1, preset_id: 5, entered_at: OLD, exited_at: OLD },
    ]));
    expect(stats.failedTables).toEqual([]);
    expect(await rows()).toEqual([
      { id: 1, preset_id: 5, open: false },
      { id: 2, preset_id: 5, open: true },
    ]);
  });

  it('שורה שממתינה ביומן אינה נמחקת כדי לפנות מקום - עבודת המפעיל קודמת', async () => {
    await localDb.query(`INSERT INTO public.station_sessions (id, preset_id, entered_at) VALUES (1, 5, $1)`, [OLD]);
    const pending = new Set([mirrorRowKey('station_sessions', { id: 1 })]);
    const stats = await ingest(snap([{ id: 2, preset_id: 5, entered_at: OLD, exited_at: null }]), pending);
    // עדיין נכשלת - וזה נכון: ההכרעה שייכת לדחיפה, לא למראה
    expect(stats.failedTables.map(f => f.table)).toEqual(['station_sessions']);
    expect(await rows()).toEqual([{ id: 1, preset_id: 5, open: true }]);
  });

  it('בלי התנגשות - שורות מקומיות שאינן במרכז נשארות כמו קודם (טבלה שאינה REPLACE)', async () => {
    await localDb.query(`INSERT INTO public.station_sessions (id, preset_id, entered_at, exited_at) VALUES (1, 7, $1, $1)`, [OLD]);
    const stats = await ingest(snap([{ id: 2, preset_id: 5, entered_at: OLD, exited_at: null }]));
    expect(stats.failedTables).toEqual([]);
    expect((await rows()).map(r => r.id)).toEqual([1, 2]);
  });
});
