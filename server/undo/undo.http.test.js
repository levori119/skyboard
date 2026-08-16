// ביטול פעולה — השרשרת המלאה דרך HTTP, מול Postgres אמיתי (PGlite).
//
// בדיקת האינטגרציה הקודמת הוכיחה את הטריגר ואת ההיפוך. כאן נבדק מה שמחבר
// ביניהם ואי אפשר לבדוק בנפרד:
//   middleware פותח פעולה  →  pool מזריק SET LOCAL בטרנזקציה  →  הטריגר רושם
//   →  /api/undo/next רואה אותה  →  /api/undo/:id מחזיר את המידע לאחור
//
// זו הבדיקה שהייתה תופסת החלפת שם כותרת, סדר middleware שגוי, או כתיבה שיצאה
// מחוץ לטרנזקציה ולכן לא נרשמה - שלושה כשלים **שקטים** שכל שכבה בנפרד עוברת.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

const STATION = 'station-under-test';
const CREW = 77;

let pool, server, base, actionHeader;

/** קריאה כמפעיל מזוהה מהעמדה הנבדקת. */
const call = (path, init = {}) => fetch(`${base}${path}`, {
  ...init,
  headers: { 'Content-Type': 'application/json', 'X-Station': STATION, ...(init.headers || {}) },
});

const strips = async () => (await pool.query(
  `SELECT id, callsign, altitude FROM public.test_strips ORDER BY id`)).rows;

beforeAll(async () => {
  // חייב להיקבע **לפני** ייבוא pool.js: הבחירה בין Neon למאגר המקומי נעשית
  // בזמן טעינת המודול.
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';

  ({ default: pool } = await import('../db/pool.js'));
  const { journalTablesDdl, journalFunctionDdl, installTriggersDdl } = await import('../db/undoJournal.js');
  const { actionContextMiddleware, ACTION_HEADER } = await import('../middleware/actionContext.js');
  const { default: undoRouter } = await import('../routes/undo.js');
  const { listen } = await import('../listen.js');
  actionHeader = ACTION_HEADER;

  await pool.query(`CREATE TABLE public.test_strips (
    id SERIAL PRIMARY KEY, callsign TEXT NOT NULL, altitude INTEGER)`);
  await pool.query(`CREATE TABLE public.activity_log (
    id SERIAL PRIMARY KEY, timestamp TIMESTAMPTZ DEFAULT NOW(), event_type VARCHAR(64) NOT NULL,
    severity VARCHAR(16), crew_member_id INTEGER, crew_member_name VARCHAR(255), details JSONB)`);
  for (const stmt of journalTablesDdl()) await pool.query(stmt);
  await pool.query(journalFunctionDdl());
  await pool.query(installTriggersDdl('public'));

  const app = express();
  app.use(express.json());
  // האימות והסביבה נבדקים במקום אחר; כאן די בזהות קבועה כדי לבחון את השרשרת.
  app.use((req, _res, next) => { req.user = { crewMemberId: CREW, name: 'בודק', role: 'user' }; next(); });
  app.use(actionContextMiddleware);
  app.use(undoRouter);

  // "endpoint תפעולי" מייצג - כותב כמו כל route אחר, בלי לדעת דבר על ביטול
  app.post('/api/strips', async (req, res) => {
    const r = await pool.query(
      `INSERT INTO public.test_strips (callsign, altitude) VALUES ($1,$2) RETURNING *`,
      [req.body.callsign, req.body.altitude ?? null]);
    res.json(r.rows[0]);
  });
  app.put('/api/strips/:id', async (req, res) => {
    const r = await pool.query(
      `UPDATE public.test_strips SET altitude = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, req.body.altitude]);
    res.json(r.rows[0] || null);
  });
  app.delete('/api/strips/:id', async (req, res) => {
    await pool.query(`DELETE FROM public.test_strips WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  });

  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

beforeEach(async () => {
  await pool.query(`DELETE FROM public.undo_journal`);
  await pool.query(`DELETE FROM public.undo_actions`);
  await pool.query(`DELETE FROM public.test_strips`);
  await pool.query(`DELETE FROM public.activity_log`);
});

describe('פתיחת פעולה', () => {
  it('כתיבה מחזירה מזהה פעולה בכותרת', async () => {
    const res = await call('/api/strips', { method: 'POST', body: JSON.stringify({ callsign: 'AAA' }) });
    expect(res.headers.get(actionHeader)).toBeTruthy();
  });

  it('קריאה אינה פותחת פעולה', async () => {
    const res = await call('/api/undo/stack');
    expect(res.headers.get(actionHeader)).toBeNull();
  });

  it('בלי כותרת עמדה - הבקשה עובדת, פשוט בלי ביטול (לקוח ישן לא נשבר)', async () => {
    const res = await fetch(`${base}/api/strips`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callsign: 'NOSTATION' }),
    });
    expect(res.ok).toBe(true);
    expect(res.headers.get(actionHeader)).toBeNull();
    expect((await strips()).map(s => s.callsign)).toEqual(['NOSTATION']);
  });
});

describe('המחסנית', () => {
  it('הפעולה האחרונה בראש, עם התווית שלה', async () => {
    await call('/api/strips', { method: 'POST', body: JSON.stringify({ callsign: 'FIRST' }) });
    await call('/api/strips', { method: 'POST', body: JSON.stringify({ callsign: 'SECOND' }) });

    const stack = await (await call('/api/undo/stack')).json();
    expect(stack).toHaveLength(2);
    expect(stack[0].labelKey).toBe('undo.createStrip');
    expect(stack[0].undoable).toBe(true);
  });

  it('עמדה אחרת אינה רואה את הפעולות שלי (החלטת אפיון §2)', async () => {
    await call('/api/strips', { method: 'POST', body: JSON.stringify({ callsign: 'MINE' }) });
    const other = await (await fetch(`${base}/api/undo/stack`, { headers: { 'X-Station': 'another-station' } })).json();
    expect(other).toEqual([]);
  });

  it('בקשה שלא שינתה דבר אינה נכנסת למחסנית', async () => {
    await call('/api/strips/9999', { method: 'PUT', body: JSON.stringify({ altitude: 100 }) });
    expect(await (await call('/api/undo/stack')).json()).toEqual([]);
  });
});

describe('ביטול מקצה לקצה', () => {
  it('יצירה → CTRL+Z → הפ"מ נעלם', async () => {
    await call('/api/strips', { method: 'POST', body: JSON.stringify({ callsign: 'UNDOME', altitude: 200 }) });
    expect(await strips()).toHaveLength(1);

    const next = await (await call('/api/undo/next')).json();
    expect(next.action.labelKey).toBe('undo.createStrip');
    expect(next.conflicts).toEqual([]);

    const done = await (await call(`/api/undo/${next.action.id}`, { method: 'POST', body: '{}' })).json();
    expect(done.ok).toBe(true);
    expect(await strips()).toHaveLength(0);
  });

  it('עדכון → CTRL+Z → הגובה הקודם חוזר', async () => {
    const created = await (await call('/api/strips', {
      method: 'POST', body: JSON.stringify({ callsign: 'ALT', altitude: 100 }) })).json();
    await call(`/api/strips/${created.id}`, { method: 'PUT', body: JSON.stringify({ altitude: 350 }) });
    expect((await strips())[0].altitude).toBe(350);

    const next = await (await call('/api/undo/next')).json();
    expect(next.action.labelKey).toBe('undo.updateStrip');
    await call(`/api/undo/${next.action.id}`, { method: 'POST', body: '{}' });
    expect((await strips())[0].altitude).toBe(100);
  });

  it('מחיקה → CTRL+Z → הפ"מ חוזר עם אותו מזהה', async () => {
    const created = await (await call('/api/strips', {
      method: 'POST', body: JSON.stringify({ callsign: 'GONE', altitude: 50 }) })).json();
    await call(`/api/strips/${created.id}`, { method: 'DELETE' });
    expect(await strips()).toHaveLength(0);

    const next = await (await call('/api/undo/next')).json();
    await call(`/api/undo/${next.action.id}`, { method: 'POST', body: '{}' });
    expect(await strips()).toEqual([{ id: created.id, callsign: 'GONE', altitude: 50 }]);
  });

  it('שני ביטולים ברצף חוזרים שתי פעולות אחורה', async () => {
    await call('/api/strips', { method: 'POST', body: JSON.stringify({ callsign: 'ONE' }) });
    await call('/api/strips', { method: 'POST', body: JSON.stringify({ callsign: 'TWO' }) });

    for (let i = 0; i < 2; i++) {
      const next = await (await call('/api/undo/next')).json();
      await call(`/api/undo/${next.action.id}`, { method: 'POST', body: '{}' });
    }
    expect(await strips()).toHaveLength(0);
  });

  it('פעולה שבוטלה יורדת מהמחסנית ואינה ניתנת לביטול פעמיים', async () => {
    await call('/api/strips', { method: 'POST', body: JSON.stringify({ callsign: 'ONCE' }) });
    const next = await (await call('/api/undo/next')).json();
    await call(`/api/undo/${next.action.id}`, { method: 'POST', body: '{}' });

    const again = await call(`/api/undo/${next.action.id}`, { method: 'POST', body: '{}' });
    expect(again.status).toBe(409);
    expect(await (await call('/api/undo/stack')).json()).toEqual([]);
  });

  it('הביטול נרשם ביומן הביקורת - מי ביטל מה', async () => {
    await call('/api/strips', { method: 'POST', body: JSON.stringify({ callsign: 'AUDIT' }) });
    const next = await (await call('/api/undo/next')).json();
    await call(`/api/undo/${next.action.id}`, { method: 'POST', body: '{}' });

    // הרישום יוצא אחרי התשובה (fire-and-forget) - ממתינים לו
    await new Promise(r => setTimeout(r, 150));
    const log = await pool.query(`SELECT event_type, crew_member_id, details FROM public.activity_log`);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].event_type).toBe('undo');
    expect(log.rows[0].crew_member_id).toBe(CREW);
    expect(log.rows[0].details.label_key).toBe('undo.createStrip');
  });
});

describe('התנגשות בין עמדות', () => {
  it('מפעיל אחר שינה מאז - הביטול נעצר ומדווח, ולא דורס בשקט', async () => {
    const created = await (await call('/api/strips', {
      method: 'POST', body: JSON.stringify({ callsign: 'RACE', altitude: 100 }) })).json();
    await call(`/api/strips/${created.id}`, { method: 'PUT', body: JSON.stringify({ altitude: 200 }) });

    // עמדה אחרת נוגעת באותו פ"מ
    await pool.query(`UPDATE public.test_strips SET altitude = 400 WHERE id = $1`, [created.id]);

    const next = await (await call('/api/undo/next')).json();
    expect(next.conflicts).toHaveLength(1);
    expect(next.conflicts[0].type).toBe('changed');

    const blocked = await call(`/api/undo/${next.action.id}`, { method: 'POST', body: '{}' });
    expect(blocked.status).toBe(409);
    expect((await strips())[0].altitude).toBe(400); // לא נגענו

    // אחרי שהמפעיל ראה את האזהרה ואישר
    const forced = await call(`/api/undo/${next.action.id}`, { method: 'POST', body: JSON.stringify({ force: true }) });
    expect(forced.status).toBe(200);
    expect((await strips())[0].altitude).toBe(100);
  });
});
