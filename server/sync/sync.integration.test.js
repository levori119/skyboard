// סנכרון חזרה מהמאגר המקומי למרכז - בדיקת אינטגרציה מול **שני** Postgres
// אמיתיים (PGlite): אחד משחק את העמדה המנותקת, השני את השרת המרכזי.
//
// למה שניים ולא mock: כל המנגנון חי בתוך ה-DB - טריגר plpgsql שרושם את היומן,
// `rev` שעולה בטריגר אחר, `to_jsonb` ו-`jsonb_populate_record` שמחזירים שורה
// לטיפוסיה. mock היה בודק שהמחרוזות שכתבנו הן המחרוזות שציפינו להן, ולא
// ש**הפ"מ באמת חזר למרכז** ושסתירה באמת נעצרה.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { touchFunctionDdl, triggerDdl } from '../db/versionedTables.js';
import { syncJournalDdl, syncFunctionDdl, installSyncTriggersDdl, withoutJournal, STATUS } from '../db/syncJournal.js';
import { coalesceJournal } from './coalesce.js';
import { applyOps, RESULT, REASON } from './apply.js';

let localDb, centralDb;

/** מתאם לצורת ה-client של node-postgres. */
const clientFor = (db) => ({ query: (sql, params) => db.query(sql, params ?? []) });

const SCHEMA_SQL = `
  CREATE TABLE public.strips (
    id SERIAL PRIMARY KEY,
    callsign TEXT NOT NULL,
    alt TEXT,
    on_map BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    rev BIGINT NOT NULL DEFAULT 0
  );
  CREATE TABLE public.strip_transfers (
    id TEXT PRIMARY KEY,
    strip_id INTEGER REFERENCES public.strips(id) ON DELETE CASCADE,
    status TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    rev BIGINT NOT NULL DEFAULT 0
  );
`;

async function makeDb({ withJournal }) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create();
  await db.exec(SCHEMA_SQL);
  await db.exec(touchFunctionDdl());
  for (const t of ['strips', 'strip_transfers']) {
    for (const sql of triggerDdl(t)) await db.exec(sql);
  }
  if (withJournal) {
    for (const sql of syncJournalDdl()) await db.exec(sql);
    await db.exec(syncFunctionDdl());
    for (const sql of installSyncTriggersDdl('public', ['strips', 'strip_transfers'])) await db.exec(sql);
  }
  return db;
}

/** מה שהעמדה צברה וטרם נדחף. */
const pending = async () => (await localDb.query(
  `SELECT id, at, table_schema, table_name, op, pk, before, after
     FROM public.local_sync_journal WHERE status = '${STATUS.PENDING}' ORDER BY id`)).rows;

/**
 * דוחפת את כל מה שממתין, ומחזירה את תוצאות ההחלה.
 *
 * `mutate` מאפשר לקבוע את `localAt` במפורש. ההכרעה היא "האחרון מנצח", ושתי
 * כתיבות באותה מילישנייה על אותה מכונה הן תיקו - כלומר בדיקה מהבהבת. קביעת
 * הזמן ביד הופכת את הבדיקה לדטרמיניסטית, ובודקת בדיוק את מה שמכריע בפועל.
 */
async function push(opts = {}, mutate = null) {
  const ops = coalesceJournal(await pending());
  if (mutate) ops.forEach(mutate);
  const c = clientFor(centralDb);
  await centralDb.query('BEGIN');
  const results = await applyOps(c, ops, 'public', opts);
  await centralDb.query('COMMIT');
  return results;
}

/** חותמת זמן יחסית לעכשיו, בשניות. */
const secsAgo = (s) => new Date(Date.now() - s * 1000).toISOString();
const secsAhead = (s) => new Date(Date.now() + s * 1000).toISOString();

/** קליטת "מראה" מהמרכז - חייבת לא להירשם ביומן. */
const mirror = (sql, params) =>
  withoutJournal(clientFor(localDb), () => localDb.query(sql, params ?? []));

const centralStrip = async (id) => (await centralDb.query(
  'SELECT id, callsign, alt, on_map, rev FROM public.strips WHERE id = $1', [id])).rows[0];

beforeAll(async () => {
  localDb = await makeDb({ withJournal: true });
  centralDb = await makeDb({ withJournal: false });
}, 60000);

afterAll(async () => {
  await localDb?.close();
  await centralDb?.close();
});

beforeEach(async () => {
  for (const db of [localDb, centralDb]) {
    await db.exec('DELETE FROM public.strip_transfers; DELETE FROM public.strips;');
  }
  await localDb.exec('DELETE FROM public.local_sync_journal');
});

/** מצב פתיחה: פ"מ קיים בשני הצדדים, כאילו הגיע לעמדה במראה לפני הנתק. */
async function seedMirrored({ id = 1, callsign = 'ABC', alt = '100' } = {}) {
  await centralDb.query(
    `INSERT INTO public.strips (id, callsign, alt) VALUES ($1, $2, $3)`, [id, callsign, alt]);
  const row = await centralStrip(id);
  await mirror(
    `INSERT INTO public.strips (id, callsign, alt, rev) VALUES ($1, $2, $3, $4)`,
    [id, callsign, alt, row.rev]);
  return row;
}

describe('יומן הפעולות המקומיות', () => {
  it('כתיבה בעמדה מנותקת נרשמת ביומן', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    const rows = await pending();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ table_name: 'strips', op: 'U' });
    expect(rows[0].after.alt).toBe('250');
  });

  it('קליטת מראה מהמרכז אינה נרשמת ביומן', async () => {
    await mirror(`INSERT INTO public.strips (id, callsign) VALUES (77, 'MIRROR')`);
    await mirror(`UPDATE public.strips SET alt = '300' WHERE id = 77`);
    expect(await pending()).toHaveLength(0);
  });

  it('עדכון שלא שינה דבר אינו נרשם', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = alt WHERE id = 1`);
    expect(await pending()).toHaveLength(0);
  });
});

describe('דחיפה למרכז', () => {
  it('אף אחד לא נגע - העדכון עובר והמרכז מתעדכן', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250', on_map = TRUE WHERE id = 1`);

    const [r] = await push();
    expect(r.status).toBe(RESULT.APPLIED);
    const now = await centralStrip(1);
    expect(now.alt).toBe('250');
    expect(now.on_map).toBe(true);
  });

  // ⚠️ **זה החוזה שהשתנה ב-2026-09-24** (הכרעת אורי): "בחזרה מנתק מה שבוצע
  // בעמדה הספציפית דורס את המאגר המרכזי". קודם ניצח מי שכתב מאוחר יותר,
  // ועבודה שנעשתה בנתק "נעלמה" ברגע החיבור מחדש.
  it('המרכז עודכן מאוחר יותר - ובכל זאת העמדה שעבדה בנתק מנצחת', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    // בזמן הנתק מישהו שינה את אותו פ"מ במרכז, ואחרי העמדה
    await centralDb.query(`UPDATE public.strips SET alt = '400' WHERE id = 1`);

    const [r] = await push({}, op => { op.localAt = secsAgo(60); });
    expect(r.status).toBe(RESULT.APPLIED);
    expect(r.resolved).toBe('mine');
    expect((await centralStrip(1)).alt).toBe('250');
  });

  // המדיניות הישנה נשמרה כאפשרות מפורשת, ועדיין נבדקת - כדי ש"האחרון מנצח"
  // יהיה החלטה שמישהו מקבל, ולא קוד שנרקב.
  it('policy: lww מפורש - שם עדיין המרכז מנצח כשעדכן מאוחר יותר', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    await centralDb.query(`UPDATE public.strips SET alt = '400' WHERE id = 1`);

    const [r] = await push({ policy: 'lww' }, op => { op.localAt = secsAgo(60); });
    expect(r.status).toBe(RESULT.SUPERSEDED);
    expect(r.reason).toBe(REASON.NEWER_THERE);
    expect((await centralStrip(1)).alt).toBe('400');
  });

  it('שני הצדדים נגעו, והעמדה עדכנה מאוחר יותר - גרסתה עוברת, בלי לשאול', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    await centralDb.query(`UPDATE public.strips SET alt = '400' WHERE id = 1`);

    const [r] = await push({}, op => { op.localAt = secsAhead(60); });
    expect(r.status).toBe(RESULT.APPLIED);
    expect(r.reason).toBe(REASON.NEWER_HERE);
    expect(r.resolved).toBe('mine');
    expect((await centralStrip(1)).alt).toBe('250');
  });

  it('הפרש שעונים מתוקן לפני ההשוואה', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    await centralDb.query(`UPDATE public.strips SET alt = '400' WHERE id = 1`);

    // שעון העמדה מפגר בשעה. בלי תיקון היא הייתה מפסידה תמיד; עם `skewMs`
    // הזמן שלה מתורגם לשעון המרכז והיא מנצחת, כי בפועל עדכנה אחרי.
    const [r] = await push({ policy: 'lww', skewMs: 3600_000 }, op => { op.localAt = secsAgo(3500); });
    expect(r.status).toBe(RESULT.APPLIED);
    expect((await centralStrip(1)).alt).toBe('250');
  });

  // חותמת זמן חסרה כבר אינה חוסמת: אין מה להשוות כשההכרעה אינה לפי זמן.
  it('בלי חותמת זמן - העמדה עדיין מנצחת, ואין מסך שעוצר את הבקר', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    await centralDb.query(`UPDATE public.strips SET alt = '400' WHERE id = 1`);

    const [r] = await push({}, op => { op.localAt = null; });
    expect(r.status).toBe(RESULT.APPLIED);
    expect((await centralStrip(1)).alt).toBe('250');
  });

  it('policy: lww בלי חותמת זמן - שם אי אפשר להכריע, ועולה לבקר', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    await centralDb.query(`UPDATE public.strips SET alt = '400' WHERE id = 1`);

    const [r] = await push({ policy: 'lww' }, op => { op.localAt = null; });
    expect(r.status).toBe(RESULT.CONFLICT);
    expect(r.reason).toBe(REASON.NO_TIMESTAMP);
    expect((await centralStrip(1)).alt).toBe('400');
  });

  it('היפוך ידני של הבקר דוחף בכפייה, בלי להשוות זמנים', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    await centralDb.query(`UPDATE public.strips SET alt = '400' WHERE id = 1`);

    const [r] = await push({ force: true }, op => { op.localAt = secsAgo(3600); });
    expect(r.status).toBe(RESULT.APPLIED);
    expect((await centralStrip(1)).alt).toBe('250');
  });

  it('פ"מ שנוצר בנתק מגיע למרכז עם המזהה המקומי שלו', async () => {
    await localDb.query(
      `INSERT INTO public.strips (id, callsign, alt) VALUES (1500000001, 'NEW', '80')`);
    const [r] = await push();
    expect(r.status).toBe(RESULT.APPLIED);
    expect((await centralStrip(1500000001)).callsign).toBe('NEW');
  });

  it('פ"מ שנוצר ונמחק באותו נתק - לא נדחף דבר', async () => {
    await localDb.query(`INSERT INTO public.strips (id, callsign) VALUES (1500000002, 'GHOST')`);
    await localDb.query(`DELETE FROM public.strips WHERE id = 1500000002`);
    const [r] = await push();
    expect(r.status).toBe(RESULT.SKIPPED);
    expect(r.reason).toBe(REASON.LOCAL_ONLY);
    expect(await centralStrip(1500000002)).toBeUndefined();
  });

  it('מחיקה בנתק מוחקת במרכז', async () => {
    await seedMirrored();
    await localDb.query(`DELETE FROM public.strips WHERE id = 1`);
    const [r] = await push();
    expect(r.status).toBe(RESULT.APPLIED);
    expect(await centralStrip(1)).toBeUndefined();
  });

  it('מחיקה שכבר בוצעה במרכז - אידמפוטנטית, לא סתירה', async () => {
    await seedMirrored();
    await localDb.query(`DELETE FROM public.strips WHERE id = 1`);
    await centralDb.query(`DELETE FROM public.strips WHERE id = 1`);
    const [r] = await push();
    expect(r.status).toBe(RESULT.APPLIED);
  });

  it('עדכון לשורה שנמחקה במרכז - המחיקה מנצחת, ואין מטוס רפאים', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    await centralDb.query(`DELETE FROM public.strips WHERE id = 1`);

    // מחיקה במרכז היא פעולה מכוונת (פ"מ שנחת והוסר). שחזור השורה היה מחזיר
    // מטוס שכבר אינו בשמיים אל המפה - ולכן היא אינה נשקלת מול הזמן.
    const [r] = await push({}, op => { op.localAt = secsAhead(3600); });
    expect(r.status).toBe(RESULT.SUPERSEDED);
    expect(r.reason).toBe(REASON.DELETED_THERE);
    expect(await centralStrip(1)).toBeUndefined();
  });

  it('הבקר יכול בכל זאת להחזיר פ"מ שנמחק במרכז', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    await centralDb.query(`DELETE FROM public.strips WHERE id = 1`);

    const [r] = await push({ force: true });
    expect(r.status).toBe(RESULT.APPLIED);
    expect((await centralStrip(1)).alt).toBe('250');
  });

  it('עשר גרירות לאותו פ"מ - כתיבה אחת במרכז עם הערך האחרון', async () => {
    await seedMirrored();
    for (let i = 1; i <= 10; i++) {
      await localDb.query(`UPDATE public.strips SET alt = $1 WHERE id = 1`, [String(i * 100 + 50)]);
    }
    expect(await pending()).toHaveLength(10);
    const results = await push();
    expect(results).toHaveLength(1);
    expect(results[0].journalIds).toHaveLength(10);
    expect((await centralStrip(1)).alt).toBe('1050');
    // גרסה אחת בלבד עלתה במרכז - לא עשר
    expect(Number((await centralStrip(1)).rev)).toBe(1);
  });

  it('פ"מ חדש וההעברה שלו - האב נכנס לפני הבן', async () => {
    await localDb.query(`INSERT INTO public.strips (id, callsign) VALUES (1500000003, 'PAIR')`);
    await localDb.query(
      `INSERT INTO public.strip_transfers (id, strip_id, status) VALUES ('t1', 1500000003, 'pending')`);
    const results = await push();
    expect(results.every(r => r.status === RESULT.APPLIED)).toBe(true);
    const tr = (await centralDb.query(`SELECT strip_id FROM public.strip_transfers WHERE id = 't1'`)).rows[0];
    expect(Number(tr.strip_id)).toBe(1500000003);
  });

  // כל מה שהעמדה נגעה בו בנתק עובר, גם כשהמרכז שינה חלק מזה בינתיים.
  it('שני פ"מים שנגעו בהם בנתק - שניהם דורסים את המרכז', async () => {
    await seedMirrored({ id: 1 });
    await seedMirrored({ id: 2, callsign: 'DEF' });
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id IN (1, 2)`);
    await centralDb.query(`UPDATE public.strips SET alt = '999' WHERE id = 1`);

    const results = await push({}, op => { op.localAt = secsAgo(60); });
    const byId = Object.fromEntries(results.map(r => [r.pk.id, r]));
    expect(byId[1].status).toBe(RESULT.APPLIED);
    expect(byId[2].status).toBe(RESULT.APPLIED);
    expect((await centralStrip(1)).alt).toBe('250');
    expect((await centralStrip(2)).alt).toBe('250');
  });

  // ⚠️ הגבול של "העמדה דורסת": **רק מה שהיא נגעה בו**. שורה שהמרכז שינה
  // והעמדה לא - נשארת כפי שהמרכז קבע, ואינה נדחפת בכלל כי אינה ביומן.
  it('שורה שהעמדה לא נגעה בה בנתק - המרכז נשאר הקובע', async () => {
    await seedMirrored({ id: 1 });
    await seedMirrored({ id: 2, callsign: 'DEF' });
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    await centralDb.query(`UPDATE public.strips SET alt = '999' WHERE id = 2`);

    const results = await push({}, op => { op.localAt = secsAgo(60); });
    expect(results.map(r => r.pk.id)).toEqual([1]);       // רק מה שנגעו בו נדחף
    expect((await centralStrip(1)).alt).toBe('250');      // העמדה דרסה
    expect((await centralStrip(2)).alt).toBe('999');      // המרכז נשאר
  });

  // הכרעה לרעת העמדה עדיין קיימת ב-lww, ושם שורה אחת אינה מפילה את השאר.
  it('policy: lww - הכרעה לרעת העמדה בפ"מ אחד אינה מפילה את השאר', async () => {
    await seedMirrored({ id: 1 });
    await seedMirrored({ id: 2, callsign: 'DEF' });
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id IN (1, 2)`);
    await centralDb.query(`UPDATE public.strips SET alt = '999' WHERE id = 1`);

    const results = await push({ policy: 'lww' }, op => { op.localAt = secsAgo(60); });
    const byId = Object.fromEntries(results.map(r => [r.pk.id, r]));
    expect(byId[1].status).toBe(RESULT.SUPERSEDED);
    expect(byId[2].status).toBe(RESULT.APPLIED);
    expect((await centralStrip(2)).alt).toBe('250');
  });

  it('טבלה שאינה ברשימת הסנכרון נדחית', async () => {
    const c = clientFor(centralDb);
    await centralDb.query('BEGIN');
    const [r] = await applyOps(c, [{
      key: 'x', table_schema: 'public', table_name: 'crew_members',
      pk: { id: 1 }, op: 'U', baseRev: null, row: { id: 1 }, journalIds: [1],
    }], 'public');
    await centralDb.query('COMMIT');
    expect(r.status).toBe(RESULT.ERROR);
    expect(r.reason).toBe(REASON.NOT_SYNCED);
  });
});
