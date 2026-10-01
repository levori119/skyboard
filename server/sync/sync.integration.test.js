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

// ── פ"מ בנקודת העברה, נתק וחזרה ──────────────────────────────────────────────
// התרחיש שדווח: "מטוס בנקודת העברה, מנתק ומחבר את הקשר למרכז - זה לא קובע מה
// שיש בעמדה עצמה, אלא מסנכרן מה שיש במאגר".
//
// ⚠️ **הלב כאן הוא הסדר.** כשהקשר חוזר רצים **שני** מנגנונים בלי תיאום
// ביניהם: שירות המראה (בתהליך המאגר, כל 5 דקות) והדחיפה (בדפדפן, כל 10
// שניות). אם המראה מקדימה, היא מביאה את גרסת המרכז אל שורה שהעמדה שינתה
// בנתק - ואם ההגנה לא תופסת, העבודה נמחקת **לפני** שהספיקה להידחף.
describe('פ"מ בנקודת העברה - נתק וחזרה', () => {
  const ingestMirror = async (snapshotTables) => {
    const { ingestSnapshot } = await import('./mirror.js');
    const { protectedKeys } = await import('../routes/sync.js');
    // בדיוק כמו שירות המראה: קודם קורא מה מוגן ביומן, ואז קולט
    const keys = await protectedKeys((sql, params) => localDb.query(sql, params ?? []));
    return ingestSnapshot(clientFor(localDb), 'public', {
      schema: 'public', at: new Date().toISOString(), tables: snapshotTables,
    }, keys);
  };

  /** צילום המרכז, כמו שהוא מגיע מ-/api/sync/mirror */
  const snapshotOfCentral = async () => {
    const strips = (await centralDb.query('SELECT to_jsonb(t) AS row FROM public.strips t')).rows.map(r => r.row);
    const trs = (await centralDb.query('SELECT to_jsonb(t) AS row FROM public.strip_transfers t')).rows.map(r => r.row);
    return [{ table: 'strips', rows: strips }, { table: 'strip_transfers', rows: trs }];
  };

  const localTransfer = async (id) => (await localDb.query(
    'SELECT status FROM public.strip_transfers WHERE id = $1', [id])).rows[0];
  const centralTransfer = async (id) => (await centralDb.query(
    'SELECT status FROM public.strip_transfers WHERE id = $1', [id])).rows[0];

  beforeEach(async () => {
    for (const db of [localDb, centralDb]) {
      await db.query('DELETE FROM public.strip_transfers');
      await db.query('DELETE FROM public.strips');
    }
  });

  it('העמדה קיבלה את הפ"מ בנתק - המראה שרצה לפני הדחיפה אינה מוחקת זאת', { timeout: 30000 }, async () => {
    // מצב פתיחה: פ"מ בהעברה, זהה בשני הצדדים
    await centralDb.query(`INSERT INTO public.strips (id, callsign) VALUES (1, 'ע402')`);
    await centralDb.query(
      `INSERT INTO public.strip_transfers (id, strip_id, status) VALUES ('tr1', 1, 'pending')`);
    await mirror(`INSERT INTO public.strips (id, callsign) VALUES (1, 'ע402')`);
    await mirror(
      `INSERT INTO public.strip_transfers (id, strip_id, status) VALUES ('tr1', 1, 'pending')`);

    // בנתק: הפקח קיבל את הפ"מ בנקודת ההעברה
    await localDb.query(`UPDATE public.strip_transfers SET status = 'accepted' WHERE id = 'tr1'`);
    expect((await localTransfer('tr1')).status).toBe('accepted');
    expect(await pending()).toHaveLength(1);

    // הקשר חוזר. ⚠️ המראה מקדימה את הדחיפה - זה המצב שדווח.
    await ingestMirror(await snapshotOfCentral());

    // ההגנה חייבת לתפוס: מה שהפקח עשה עדיין שם, והיומן עדיין ממתין
    expect((await localTransfer('tr1')).status).toBe('accepted');
    expect(await pending()).toHaveLength(1);

    // ורק אז הדחיפה - והעמדה קובעת
    const results = await push();
    expect(results.every(r => r.status === RESULT.APPLIED)).toBe(true);
    expect((await centralTransfer('tr1')).status).toBe('accepted');
  });

  it('גם כשהמרכז שינה את אותה העברה בינתיים - העמדה קובעת', async () => {
    await centralDb.query(`INSERT INTO public.strips (id, callsign) VALUES (1, 'ע402')`);
    await centralDb.query(
      `INSERT INTO public.strip_transfers (id, strip_id, status) VALUES ('tr1', 1, 'pending')`);
    await mirror(`INSERT INTO public.strips (id, callsign) VALUES (1, 'ע402')`);
    await mirror(
      `INSERT INTO public.strip_transfers (id, strip_id, status) VALUES ('tr1', 1, 'pending')`);

    await localDb.query(`UPDATE public.strip_transfers SET status = 'accepted' WHERE id = 'tr1'`);
    await centralDb.query(`UPDATE public.strip_transfers SET status = 'cancelled' WHERE id = 'tr1'`);

    await ingestMirror(await snapshotOfCentral());
    expect((await localTransfer('tr1')).status).toBe('accepted');   // לא נדרס

    await push();
    expect((await centralTransfer('tr1')).status).toBe('accepted'); // העמדה קובעת
  });

  // העברה **שנולדה** בעמדה בנתק אינה קיימת במרכז כלל, ולכן המראה "רואה" שורה
  // מקומית שאין לה מקבילה - ובטבלה מסונכרנת זה בדיוק מה שהיא מוחקת.
  it('העברה שנוצרה בנתק אינה נמחקת ע"י המראה', async () => {
    await centralDb.query(`INSERT INTO public.strips (id, callsign) VALUES (1, 'ע402')`);
    await mirror(`INSERT INTO public.strips (id, callsign) VALUES (1, 'ע402')`);

    await localDb.query(
      `INSERT INTO public.strip_transfers (id, strip_id, status) VALUES ('new-in-outage', 1, 'pending')`);

    await ingestMirror(await snapshotOfCentral());
    expect(await localTransfer('new-in-outage')).toBeTruthy();

    await push();
    expect((await centralTransfer('new-in-outage')).status).toBe('pending');
  });
});

// ── הכרעה ברמת השדה ──────────────────────────────────────────────────────────
// המלצת אורי (2026-10-01): "לשים לכל שדה שעודכן timestamp, ולפי זה לדעת מה
// השדה המעודכן ביותר ולעדכן".
//
// המימוש אינו עמודת חותמת לכל שדה אלא גזירה מהיומן: `before`/`after` כבר
// אומרים **בדיוק** אילו שדות העמדה נגעה בהם ומתי, בלי מיגרציה ובלי עמודה
// שצריך לתחזק. מה שהעמדה לא נגעה בו - לא נכתב, ולכן לא נדרס.
describe('הכרעה ברמת השדה - לא דורסים שדות שלא נגעו בהם', () => {
  it('העמדה שינתה גובה, המרכז שינה סימון מפה - שניהם שורדים', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    // בזמן הנתק מישהו במרכז הזיז את אותו פ"מ על המפה
    await centralDb.query(`UPDATE public.strips SET on_map = TRUE WHERE id = 1`);

    await push();

    const now = await centralStrip(1);
    expect(now.alt).toBe('250');        // מה שהעמדה שינתה - נכתב
    expect(now.on_map).toBe(true);      // ⚠️ מה שהיא לא נגעה בו - שרד
  });

  it('שינוי חוזר באותו שדה - עדיין רק הוא נכתב', async () => {
    await seedMirrored();
    for (const v of ['100', '200', '300']) {
      await localDb.query(`UPDATE public.strips SET alt = $1 WHERE id = 1`, [v]);
    }
    await centralDb.query(`UPDATE public.strips SET on_map = TRUE WHERE id = 1`);

    const ops = coalesceJournal(await pending());
    expect(ops[0].changed).toEqual(['alt']);

    await push();
    const now = await centralStrip(1);
    expect(now.alt).toBe('300');
    expect(now.on_map).toBe(true);
  });

  it('שני שדות שהעמדה שינתה - שניהם עוברים', async () => {
    await seedMirrored();
    await localDb.query(`UPDATE public.strips SET alt = '250', callsign = 'ע999' WHERE id = 1`);

    const ops = coalesceJournal(await pending());
    expect(ops[0].changed.sort()).toEqual(['alt', 'callsign']);

    await push();
    const now = await centralStrip(1);
    expect(now.alt).toBe('250');
    expect(now.callsign).toBe('ע999');
  });

  // הכנסה כותבת את השורה כולה - אין "שדה שלא נגעו בו" בשורה שנולדה בעמדה.
  it('הכנסה אינה מצומצמת', async () => {
    await localDb.query(
      `INSERT INTO public.strips (id, callsign, alt) VALUES (1500000099, 'חדש', '120')`);
    const ops = coalesceJournal(await pending());
    expect(ops[0].op).toBe('I');
    expect(ops[0].changed).toBeNull();
    await push();
    const now = await centralStrip(1500000099);
    expect(now.callsign).toBe('חדש');
    expect(now.alt).toBe('120');
  });
});

// ── המרוץ שמחק פ"מ מנקודת העברה ──────────────────────────────────────────────
// הדיווח: "בנתק שמתי פ"מ בנקודת העברה. בחזרה מנתק הפ"מ נעלם מנקודת העברה."
//
// הרצף שגרם לזה:
//   1. הקשר חוזר. המראה מצלמת את `strip_transfers` במרכז - ההעברה עדיין לא שם
//   2. הדפדפן דוחף אותה. המרכז מקבל, והיומן עובר ל-synced
//   3. המראה קולטת, קוראת את המוגנים - ההעברה כבר אינה ממתינה, ולכן אינה מוגנת
//   4. פסקת המחיקה רואה שורה מקומית שאינה בצילום (הישן) - ומוחקת אותה
//
// ⚠️ `strip_transfers.id` הוא UUID, ו-`isLocalId` בודק **טווח מספרי** - ולכן
// ההגנה על "שורה שנולדה בעמדה" לא חלה עליה. דווקא היא נפגעה.
describe('מרוץ צילום-קליטה - פ"מ בנקודת העברה אינו נמחק', () => {
  const ingest = async (snapshot, pendingKeys = new Set()) => {
    const { ingestSnapshot } = await import('./mirror.js');
    return ingestSnapshot(clientFor(localDb), 'public', snapshot, pendingKeys);
  };

  beforeEach(async () => {
    for (const db of [localDb, centralDb]) {
      await db.query('DELETE FROM public.strip_transfers');
      await db.query('DELETE FROM public.strips');
    }
  });

  it('העברה שנדחפה אחרי שהצילום נלקח - שורדת', async () => {
    await centralDb.query(`INSERT INTO public.strips (id, callsign) VALUES (1, 'ע402')`);
    await mirror(`INSERT INTO public.strips (id, callsign) VALUES (1, 'ע402')`);

    // (1) הצילום נלקח במרכז - ההעברה עדיין לא קיימת בשום מקום
    const snapshotAt = new Date(Date.now() - 1000).toISOString();

    // (2) בנתק: הפקח שם את הפ"מ בנקודת ההעברה
    await localDb.query(
      `INSERT INTO public.strip_transfers (id, strip_id, status) VALUES ('uuid-abc', 1, 'pending')`);
    // (3) הדחיפה הצליחה, והיומן כבר אינו "ממתין" - כלומר אין הגנה
    await push();
    expect((await centralDb.query(
      `SELECT 1 FROM public.strip_transfers WHERE id = 'uuid-abc'`)).rows).toHaveLength(1);

    // (4) ועכשיו נקלט הצילום **הישן**, בלי ההעברה ובלי שום מפתח מוגן
    const stats = await ingest({
      schema: 'public', at: snapshotAt,
      tables: [{ table: 'strip_transfers', rows: [] }],
    }, new Set());

    const still = await localDb.query(`SELECT status FROM public.strip_transfers WHERE id = 'uuid-abc'`);
    expect(still.rows).toHaveLength(1);           // ⚠️ זה מה שנעלם קודם
    expect(still.rows[0].status).toBe('pending');
    expect(stats.keptNewer).toBeGreaterThan(0);
  });

  // הצד השני של המטבע: מחיקה אמיתית במרכז **כן** חייבת להגיע לעמדה, אחרת
  // העמדה תחזיק לנצח העברות שבוטלו.
  it('שורה ישנה שנמחקה במרכז - עדיין נמחקת בעמדה', async () => {
    await mirror(`INSERT INTO public.strips (id, callsign) VALUES (1, 'ע402')`);
    await mirror(
      `INSERT INTO public.strip_transfers (id, strip_id, status, updated_at)
       VALUES ('uuid-old', 1, 'pending', NOW() - INTERVAL '1 hour')`);

    const stats = await ingest({
      schema: 'public', at: new Date().toISOString(),
      tables: [{ table: 'strip_transfers', rows: [] }],
    }, new Set());

    expect((await localDb.query(
      `SELECT 1 FROM public.strip_transfers WHERE id = 'uuid-old'`)).rows).toHaveLength(0);
    expect(stats.deleted).toBeGreaterThan(0);
  });

  it('צילום בלי חותמת זמן - חוזרים להתנהגות הישנה ולא שומרים בטעות', async () => {
    await mirror(`INSERT INTO public.strips (id, callsign) VALUES (1, 'ע402')`);
    await mirror(`INSERT INTO public.strip_transfers (id, strip_id, status) VALUES ('uuid-x', 1, 'pending')`);

    const stats = await ingest({
      schema: 'public', at: null,
      tables: [{ table: 'strip_transfers', rows: [] }],
    }, new Set());
    expect(stats.deleted).toBeGreaterThan(0);
  });
});
