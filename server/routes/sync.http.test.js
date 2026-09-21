// סנכרון עבודה מנותקת - השרשרת דרך HTTP, מול Postgres אמיתי (PGlite).
//
// בדיקת האינטגרציה של המנוע (server/sync/sync.integration.test.js) הוכיחה את
// הטריגר, את האיחוד ואת בדיקת הגרסה. כאן נבדק מה שמחבר ביניהם ואי אפשר לבדוק
// בנפרד: הטריגר רושם → /api/sync/outbound מאחד → /api/sync/ack מסמן →
// /api/sync/resolve מאמץ את גרסת השרת **בלי** לרשום אותה ליומן מחדש.
//
// השורה האחרונה היא כל העניין: אימוץ שנרשם ליומן היה נדחף חזרה למרכז בסיבוב
// הבא, ומייצר סתירה חדשה מתוך יישוב הסתירה הקודמת - לולאה שקטה.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

const STATION = 'twr-under-test';

let pool, server, base, STATUS, JOURNAL_TABLE;

const call = (path, init = {}) => fetch(`${base}${path}`, {
  ...init,
  headers: { 'Content-Type': 'application/json', 'X-Station': STATION, ...(init.headers || {}) },
});

const json = async (path, init) => {
  const res = await call(path, init);
  return { status: res.status, body: await res.json().catch(() => null) };
};

const journal = async () => (await pool.query(
  `SELECT id, op, status, conflict_reason FROM ${JOURNAL_TABLE} ORDER BY id`)).rows;

const strip = async (id) => (await pool.query(
  `SELECT id, callsign, alt, rev FROM public.strips WHERE id = $1`, [id])).rows[0];

beforeAll(async () => {
  // חייב להיקבע **לפני** ייבוא pool.js: הבחירה בין Neon למאגר המקומי נעשית
  // בזמן טעינת המודול.
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';

  ({ default: pool } = await import('../db/pool.js'));
  const sj = await import('../db/syncJournal.js');
  const { touchFunctionDdl, triggerDdl } = await import('../db/versionedTables.js');
  const { actionContextMiddleware } = await import('../middleware/actionContext.js');
  const { default: syncRouter } = await import('./sync.js');
  const { listen } = await import('../listen.js');
  STATUS = sj.STATUS;
  JOURNAL_TABLE = sj.JOURNAL_TABLE;

  await pool.query(`CREATE TABLE public.strips (
    id SERIAL PRIMARY KEY, callsign TEXT NOT NULL, alt TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(), rev BIGINT NOT NULL DEFAULT 0)`);
  await pool.query(touchFunctionDdl());
  for (const sql of triggerDdl('strips')) await pool.query(sql);
  for (const sql of sj.syncJournalDdl()) await pool.query(sql);
  await pool.query(sj.syncFunctionDdl());
  for (const sql of sj.installSyncTriggersDdl('public', ['strips'])) await pool.query(sql);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { crewMemberId: 7, name: 'בודק', role: 'user' }; next(); });
  app.use(actionContextMiddleware);
  app.use(syncRouter);

  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 60000);

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

beforeEach(async () => {
  await pool.query('DELETE FROM public.strips');
  await pool.query(`DELETE FROM ${JOURNAL_TABLE}`);
  await pool.query(
    `INSERT INTO public.strips (id, callsign, alt, rev) VALUES (1, 'ABC', '100', 4)`);
  await pool.query(`DELETE FROM ${JOURNAL_TABLE}`); // ההכנסה שלמעלה אינה עבודת מפעיל
});

describe('מצב הסנכרון', () => {
  it('שינוי מקומי מופיע כממתין', async () => {
    await pool.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    const { body } = await json('/api/sync/state');
    expect(body.pending).toBe(1);
    expect(body.conflicts).toEqual([]);
    // טווח המזהים המקומי נחשף לממשק, כדי שאפשר יהיה לזהות פ"מ שנולד בנתק
    expect(body.localIdStart).toBeGreaterThanOrEqual(1_500_000_000);
  });

  it('שני שינויים לאותה שורה מאוחדים לפעולה אחת', async () => {
    await pool.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    await pool.query(`UPDATE public.strips SET alt = '300' WHERE id = 1`);
    const { body } = await json('/api/sync/outbound');
    expect(body.total).toBe(1);
    expect(body.ops[0]).toMatchObject({ op: 'U', table_name: 'strips', baseRev: 4 });
    expect(body.ops[0].row.alt).toBe('300');
    expect(body.ops[0].journalIds).toHaveLength(2);
  });
});

describe('סימון תוצאות', () => {
  it('הוחל - השורות מסומנות כמסונכרנות ויוצאות מהתור', async () => {
    await pool.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    const { body: out } = await json('/api/sync/outbound');
    const ids = out.ops[0].journalIds;

    await json('/api/sync/ack', {
      method: 'POST',
      body: JSON.stringify({ results: [{ status: 'applied', journalIds: ids }] }),
    });

    const { body } = await json('/api/sync/state');
    expect(body.pending).toBe(0);
    expect((await journal()).every(r => r.status === STATUS.SYNCED)).toBe(true);
  });

  it('סתירה - עולה למסך ההכרעה עם שתי הגרסאות', async () => {
    await pool.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    const { body: out } = await json('/api/sync/outbound');

    await json('/api/sync/ack', {
      method: 'POST',
      body: JSON.stringify({
        results: [{
          status: 'conflict', reason: 'changed', journalIds: out.ops[0].journalIds,
          serverRow: { id: 1, callsign: 'ABC', alt: '900', rev: 9 },
        }],
      }),
    });

    const { body } = await json('/api/sync/state');
    expect(body.pending).toBe(0);
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0]).toMatchObject({ table: 'strips', reason: 'changed' });
    expect(body.conflicts[0].mine.alt).toBe('250');
    expect(body.conflicts[0].serverRow.alt).toBe('900');
  });
});

describe('הכרעת הבקר', () => {
  /** מביא את העמדה למצב שבו יש סתירה פתוחה אחת. */
  async function conflict(serverAlt = '900') {
    await pool.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    const { body: out } = await json('/api/sync/outbound');
    await json('/api/sync/ack', {
      method: 'POST',
      body: JSON.stringify({
        results: [{
          status: 'conflict', reason: 'changed', journalIds: out.ops[0].journalIds,
          serverRow: serverAlt === null ? null : { id: 1, callsign: 'ABC', alt: serverAlt, rev: 9 },
        }],
      }),
    });
    const { body } = await json('/api/sync/state');
    return body.conflicts[0];
  }

  it('"הגרסה שלי" - השורות חוזרות לתור והדחיפה הבאה תהיה בכפייה', async () => {
    const c = await conflict();
    const { body } = await json('/api/sync/resolve', {
      method: 'POST', body: JSON.stringify({ key: c.key, choice: 'mine' }),
    });
    expect(body).toMatchObject({ ok: true, force: true });

    const { body: state } = await json('/api/sync/state');
    expect(state.pending).toBe(c.journalIds.length);
    expect(state.conflicts).toHaveLength(0);
    // הגרסה המקומית נשארה על המסך - לא נגענו בשורה
    expect((await strip(1)).alt).toBe('250');
  });

  it('"גרסת המרכז" - השורה המקומית מאומצת, והאימוץ אינו נרשם ליומן', async () => {
    const c = await conflict('900');
    await json('/api/sync/resolve', {
      method: 'POST', body: JSON.stringify({ key: c.key, choice: 'theirs' }),
    });

    expect((await strip(1)).alt).toBe('900');
    const { body: state } = await json('/api/sync/state');
    expect(state.conflicts).toHaveLength(0);
    // ⚠️ הלב של הבדיקה: אילו האימוץ היה נרשם ליומן, הוא היה נדחף חזרה למרכז
    // בסיבוב הבא ומייצר סתירה חדשה מתוך יישוב הסתירה הקודמת.
    expect(state.pending).toBe(0);
    expect((await journal()).every(r => r.status === STATUS.DROPPED)).toBe(true);
  });

  it('"גרסת המרכז" כשהשורה נמחקה שם - היא יורדת גם כאן', async () => {
    const c = await conflict(null);
    await json('/api/sync/resolve', {
      method: 'POST', body: JSON.stringify({ key: c.key, choice: 'theirs' }),
    });
    expect(await strip(1)).toBeUndefined();
    const { body: state } = await json('/api/sync/state');
    expect(state.pending).toBe(0);
  });

  it('סתירה שכבר הוכרעה - 404 ולא הכרעה כפולה', async () => {
    const c = await conflict();
    await json('/api/sync/resolve', {
      method: 'POST', body: JSON.stringify({ key: c.key, choice: 'theirs' }),
    });
    const { status } = await json('/api/sync/resolve', {
      method: 'POST', body: JSON.stringify({ key: c.key, choice: 'theirs' }),
    });
    expect(status).toBe(404);
  });

  it('בחירה לא חוקית נדחית', async () => {
    const { status } = await json('/api/sync/resolve', {
      method: 'POST', body: JSON.stringify({ key: 'x', choice: 'merge' }),
    });
    expect(status).toBe(400);
  });
});

describe('מראה', () => {
  it('קליטת מראה מעדכנת את המאגר המקומי ואינה מייצרת תור לדחיפה', async () => {
    const snap = {
      schema: 'public',
      tables: [{ table: 'strips', rows: [{ id: 1, callsign: 'ABC', alt: '777', rev: 9 }], truncated: false }],
    };
    const { body } = await json('/api/sync/mirror', { method: 'POST', body: JSON.stringify(snap) });
    expect(body.ok).toBe(true);
    expect((await strip(1)).alt).toBe('777');

    const { body: state } = await json('/api/sync/state');
    expect(state.pending).toBe(0);
  });

  it('מראה **אינה** דורסת שורה שממתינה לדחיפה', async () => {
    await pool.query(`UPDATE public.strips SET alt = '250' WHERE id = 1`);
    const snap = {
      schema: 'public',
      tables: [{ table: 'strips', rows: [{ id: 1, callsign: 'ABC', alt: '777', rev: 9 }], truncated: false }],
    };
    const { body } = await json('/api/sync/mirror', { method: 'POST', body: JSON.stringify(snap) });
    expect(body.skipped).toBe(1);
    // מה שהפקח שינה נשאר על המסך עד שנדחף או שהסתירה הוכרעה
    expect((await strip(1)).alt).toBe('250');
  });

  it('שורה שנעלמה במרכז נמחקת בעמדה', async () => {
    const snap = { schema: 'public', tables: [{ table: 'strips', rows: [], truncated: false }] };
    await json('/api/sync/mirror', { method: 'POST', body: JSON.stringify(snap) });
    expect(await strip(1)).toBeUndefined();
  });

  it('פ"מ שנוצר בעמדה אינו נמחק רק משום שהמרכז אינו מכיר אותו', async () => {
    await pool.query(
      `INSERT INTO public.strips (id, callsign, alt) VALUES (1500000009, 'LOCAL', '50')`);
    // מדמים שהעבודה כבר נדחפה, כדי שההגנה תהיה **טווח המזהים** ולא התור
    await pool.query(`UPDATE ${JOURNAL_TABLE} SET status = $1`, [STATUS.SYNCED]);

    const snap = { schema: 'public', tables: [{ table: 'strips', rows: [], truncated: false }] };
    await json('/api/sync/mirror', { method: 'POST', body: JSON.stringify(snap) });
    expect((await strip(1500000009))?.callsign).toBe('LOCAL');
  });

  it('צילום לא תקין נדחה', async () => {
    const { status } = await json('/api/sync/mirror', { method: 'POST', body: JSON.stringify({}) });
    expect(status).toBe(400);
  });
});
