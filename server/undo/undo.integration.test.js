// יומן הביטול — בדיקת אינטגרציה מול **Postgres אמיתי** (PGlite, בלי רשת).
//
// למה אינטגרציה ולא mock: כל המנגנון חי בתוך ה-DB — טריגר plpgsql, `to_jsonb`,
// `jsonb_populate_record`, `current_setting`, `SET LOCAL` בתוך טרנזקציה. mock
// של pg היה בודק שהמחרוזות שכתבנו זהות למחרוזות שציפינו להן, ולא שהביטול
// באמת מחזיר את השורה. PGlite הוא PostgreSQL מהודר ל-WASM, ולכן זו אותה
// התנהגות בדיוק — וגם ה-CI מריץ אותה בלי DATABASE_URL.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  journalTablesDdl, journalFunctionDdl, installTriggersDdl, DENIED_TABLES,
} from '../db/undoJournal.js';
import { conflictsFor, revertEntries, blockedTableIn } from './revert.js';

let db;
/** מתאם לצורת ה-client של node-postgres, שזה מה ש-revert.js מצפה לו. */
const client = { query: (sql, params) => db.query(sql, params ?? []) };

const ACTION = '11111111-2222-3333-4444-555555555555';

/** מריץ כתיבות בתוך טרנזקציה הנושאת מזהה פעולה — בדיוק כמו pool.js. */
async function asAction(actionId, fn) {
  await db.query('BEGIN');
  try {
    await db.query(`SELECT set_config('app.action_id', $1, true)`, [actionId]);
    const out = await fn();
    await db.query('COMMIT');
    return out;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

const journalOf = async (actionId) => (await db.query(
  `SELECT id, table_schema, table_name, op, pk, before, after
     FROM public.undo_journal WHERE action_id = $1 ORDER BY id`, [actionId])).rows;

const stripsNow = async () => (await db.query(
  `SELECT id, callsign, altitude FROM public.test_strips ORDER BY id`)).rows;

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = await PGlite.create();

  await db.exec(`
    CREATE TABLE public.test_strips (
      id SERIAL PRIMARY KEY,
      callsign TEXT NOT NULL,
      altitude INTEGER,
      rev BIGINT NOT NULL DEFAULT 0
    );
    CREATE TABLE public.strip_transfers (
      id SERIAL PRIMARY KEY,
      note TEXT
    );
    CREATE TABLE public.test_no_pk (
      value TEXT
    );
  `);

  for (const stmt of journalTablesDdl()) await db.exec(stmt);
  await db.exec(journalFunctionDdl());
  await db.exec(installTriggersDdl('public'));
}, 120_000);

afterAll(async () => { await db?.close?.(); });

beforeEach(async () => {
  await db.exec(`
    DELETE FROM public.undo_journal;
    DELETE FROM public.undo_actions;
    DELETE FROM public.test_strips;
    DELETE FROM public.test_no_pk;
  `);
  await db.query(
    `INSERT INTO public.undo_actions (id, station_key, method, path, label_key)
     VALUES ($1, 'station-a', 'POST', '/api/test', 'undo.updateStrip')`, [ACTION]);
});

describe('רישום ביומן', () => {
  it('בלי הקשר פעולה — לא נרשם דבר (המסלול המהיר נשאר נקי)', async () => {
    await db.query(`INSERT INTO public.test_strips (callsign) VALUES ('NO-CTX')`);
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM public.undo_journal`);
    expect(rows[0].n).toBe(0);
  });

  it('INSERT נרשם עם after ובלי before', async () => {
    await asAction(ACTION, () =>
      db.query(`INSERT INTO public.test_strips (callsign, altitude) VALUES ('AAA', 100)`));
    const [entry] = await journalOf(ACTION);
    expect(entry.op).toBe('I');
    expect(entry.before).toBeNull();
    expect(entry.after.callsign).toBe('AAA');
    expect(entry.pk).toEqual({ id: entry.after.id });
  });

  it('UPDATE נרשם עם שני הצדדים', async () => {
    await db.query(`INSERT INTO public.test_strips (callsign, altitude) VALUES ('BBB', 100)`);
    await asAction(ACTION, () =>
      db.query(`UPDATE public.test_strips SET altitude = 250 WHERE callsign = 'BBB'`));
    const [entry] = await journalOf(ACTION);
    expect(entry.op).toBe('U');
    expect(entry.before.altitude).toBe(100);
    expect(entry.after.altitude).toBe(250);
  });

  it('DELETE נרשם עם before ובלי after', async () => {
    await db.query(`INSERT INTO public.test_strips (callsign) VALUES ('CCC')`);
    await asAction(ACTION, () =>
      db.query(`DELETE FROM public.test_strips WHERE callsign = 'CCC'`));
    const [entry] = await journalOf(ACTION);
    expect(entry.op).toBe('D');
    expect(entry.before.callsign).toBe('CCC');
    expect(entry.after).toBeNull();
  });

  it('עדכון שלא שינה דבר אינו פעולה שאפשר לבטל', async () => {
    await db.query(`INSERT INTO public.test_strips (callsign, altitude) VALUES ('DDD', 100)`);
    await asAction(ACTION, () =>
      db.query(`UPDATE public.test_strips SET altitude = 100 WHERE callsign = 'DDD'`));
    expect(await journalOf(ACTION)).toHaveLength(0);
  });

  it('כמה שורות בפעולה אחת נשמרות תחת אותו מזהה, בסדר הכתיבה', async () => {
    await asAction(ACTION, async () => {
      await db.query(`INSERT INTO public.test_strips (callsign) VALUES ('E1')`);
      await db.query(`INSERT INTO public.test_strips (callsign) VALUES ('E2')`);
    });
    const entries = await journalOf(ACTION);
    expect(entries.map(e => e.after.callsign)).toEqual(['E1', 'E2']);
  });

  it('טבלה ברשימת החסימה אינה מקבלת טריגר כלל', async () => {
    expect(DENIED_TABLES).toContain('strip_transfers');
    await asAction(ACTION, () =>
      db.query(`INSERT INTO public.strip_transfers (note) VALUES ('חסום')`));
    expect(await journalOf(ACTION)).toHaveLength(0);
  });

  it('טבלה בלי מפתח ראשי חוסמת את הפעולה במקום להבטיח ביטול שלא יעבוד', async () => {
    await asAction(ACTION, () =>
      db.query(`INSERT INTO public.test_no_pk (value) VALUES ('x')`));
    expect(await journalOf(ACTION)).toHaveLength(0);
    const { rows } = await db.query(`SELECT status, block_reason FROM public.undo_actions WHERE id = $1`, [ACTION]);
    expect(rows[0]).toMatchObject({ status: 'blocked', block_reason: 'no_pk' });
  });
});

describe('ביצוע הביטול', () => {
  it('מבטל יצירה — השורה נעלמת', async () => {
    await asAction(ACTION, () =>
      db.query(`INSERT INTO public.test_strips (callsign) VALUES ('GONE')`));
    await revertEntries(client, await journalOf(ACTION));
    expect(await stripsNow()).toHaveLength(0);
  });

  it('מבטל עדכון — הערכים חוזרים', async () => {
    await db.query(`INSERT INTO public.test_strips (callsign, altitude) VALUES ('HHH', 100)`);
    await asAction(ACTION, () =>
      db.query(`UPDATE public.test_strips SET altitude = 300, callsign = 'CHANGED'`));
    await revertEntries(client, await journalOf(ACTION));
    expect(await stripsNow()).toEqual([expect.objectContaining({ callsign: 'HHH', altitude: 100 })]);
  });

  it('מבטל מחיקה — השורה חוזרת עם אותו מזהה', async () => {
    const ins = await db.query(
      `INSERT INTO public.test_strips (callsign, altitude) VALUES ('BACK', 70) RETURNING id`);
    const id = ins.rows[0].id;
    await asAction(ACTION, () => db.query(`DELETE FROM public.test_strips WHERE id = $1`, [id]));
    expect(await stripsNow()).toHaveLength(0);

    await revertEntries(client, await journalOf(ACTION));
    expect(await stripsNow()).toEqual([expect.objectContaining({ id, callsign: 'BACK', altitude: 70 })]);
  });

  it('פעולה שנגעה בכמה שורות מתבטלת בסדר הפוך ובשלמותה', async () => {
    await db.query(`INSERT INTO public.test_strips (callsign, altitude) VALUES ('KEEP', 10)`);
    await asAction(ACTION, async () => {
      await db.query(`INSERT INTO public.test_strips (callsign, altitude) VALUES ('NEW', 20)`);
      await db.query(`UPDATE public.test_strips SET altitude = 99 WHERE callsign = 'KEEP'`);
      await db.query(`DELETE FROM public.test_strips WHERE callsign = 'NEW'`);
    });
    await revertEntries(client, await journalOf(ACTION));
    expect(await stripsNow()).toEqual([expect.objectContaining({ callsign: 'KEEP', altitude: 10 })]);
  });

  it('ביטול הביטול אינו נרשם — הביטול עצמו רץ בלי הקשר פעולה', async () => {
    await asAction(ACTION, () =>
      db.query(`INSERT INTO public.test_strips (callsign) VALUES ('ONCE')`));
    const before = (await db.query(`SELECT COUNT(*)::int AS n FROM public.undo_journal`)).rows[0].n;
    await revertEntries(client, await journalOf(ACTION));
    const after = (await db.query(`SELECT COUNT(*)::int AS n FROM public.undo_journal`)).rows[0].n;
    expect(after).toBe(before);
  });
});

describe('זיהוי התנגשות', () => {
  it('אף אחד לא נגע — אין התנגשות', async () => {
    await db.query(`INSERT INTO public.test_strips (callsign, altitude) VALUES ('CLEAN', 100)`);
    await asAction(ACTION, () =>
      db.query(`UPDATE public.test_strips SET altitude = 200 WHERE callsign = 'CLEAN'`));
    expect(await conflictsFor(client, await journalOf(ACTION))).toEqual([]);
  });

  it('מפעיל אחר שינה את השורה מאז — התנגשות changed', async () => {
    await db.query(`INSERT INTO public.test_strips (callsign, altitude) VALUES ('RACE', 100)`);
    await asAction(ACTION, () =>
      db.query(`UPDATE public.test_strips SET altitude = 200 WHERE callsign = 'RACE'`));
    // עמדה אחרת, בלי הקשר פעולה
    await db.query(`UPDATE public.test_strips SET altitude = 350 WHERE callsign = 'RACE'`);

    const conflicts = await conflictsFor(client, await journalOf(ACTION));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('changed');
  });

  it('השורה נמחקה בינתיים — התנגשות missing', async () => {
    await db.query(`INSERT INTO public.test_strips (callsign, altitude) VALUES ('VANISH', 100)`);
    await asAction(ACTION, () =>
      db.query(`UPDATE public.test_strips SET altitude = 200 WHERE callsign = 'VANISH'`));
    await db.query(`DELETE FROM public.test_strips WHERE callsign = 'VANISH'`);

    const conflicts = await conflictsFor(client, await journalOf(ACTION));
    expect(conflicts[0].type).toBe('missing');
  });

  it('מישהו יצר מחדש שורה באותו מפתח — התנגשות exists', async () => {
    const ins = await db.query(
      `INSERT INTO public.test_strips (callsign) VALUES ('DUP') RETURNING id`);
    const id = ins.rows[0].id;
    await asAction(ACTION, () => db.query(`DELETE FROM public.test_strips WHERE id = $1`, [id]));
    await db.query(`INSERT INTO public.test_strips (id, callsign) VALUES ($1, 'OTHER')`, [id]);

    const conflicts = await conflictsFor(client, await journalOf(ACTION));
    expect(conflicts[0].type).toBe('exists');
  });

  it('השורה שיצרנו כבר נמחקה — אין התנגשות, אין מה לבטל', async () => {
    await asAction(ACTION, () =>
      db.query(`INSERT INTO public.test_strips (callsign) VALUES ('ALREADY')`));
    await db.query(`DELETE FROM public.test_strips WHERE callsign = 'ALREADY'`);
    expect(await conflictsFor(client, await journalOf(ACTION))).toEqual([]);
  });
});

describe('שכבת ההגנה השנייה', () => {
  it('שורת יומן של טבלה חסומה נתפסת גם בזמן הביטול', () => {
    expect(blockedTableIn([{ table_name: 'test_strips' }])).toBeNull();
    expect(blockedTableIn([{ table_name: 'gapi_outbox' }])).toMatchObject({ table: 'gapi_outbox' });
  });
});
