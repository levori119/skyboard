// המאגר המקומי — האם המתאם באמת נראה ל-457 ה-endpoints כמו pg.Pool.
//
// כל בדיקה כאן מכסה הנחה שהקוד הקיים מסתמך עליה בשקט. אם אחת מהן נשברת,
// התסמין בעמדה אינו שגיאה ברורה אלא התנהגות שגויה: 404 על פ"מ שקיים,
// טרנזקציות שמשתרגות, או `rowCount` שמדווח 0 על עדכון שהצליח.
//
// רץ מול PGlite בזיכרון (בלי dataDir) — כ-2ש' עלייה, בלי לגעת בדיסק.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createLocalPool, isLocalDbMode } from './localPool.js';

describe('isLocalDbMode', () => {
  it('כבוי כברירת מחדל — עמדה עובדת מול השרת המרכזי אלא אם נאמר אחרת', () => {
    const prev = process.env.SKYKING_LOCAL_DB;
    delete process.env.SKYKING_LOCAL_DB;
    expect(isLocalDbMode()).toBe(false);
    process.env.SKYKING_LOCAL_DB = '1';
    expect(isLocalDbMode()).toBe(true);
    if (prev === undefined) delete process.env.SKYKING_LOCAL_DB; else process.env.SKYKING_LOCAL_DB = prev;
  });
});

describe('מאגר מקומי — תאימות ל-pg.Pool', () => {
  let pool;

  beforeAll(async () => {
    pool = createLocalPool({ dataDir: 'memory://' });
    await pool.query(`CREATE TABLE t (id SERIAL PRIMARY KEY, name TEXT, j JSONB DEFAULT '[]', ts TIMESTAMPTZ DEFAULT NOW())`);
  }, 120_000);

  afterAll(async () => { await pool?.end(); });

  it('העלייה עצלה — המאגר לא עולה לפני השאילתה הראשונה', () => {
    const idle = createLocalPool({ dataDir: 'memory://' });
    expect(idle.isBooted()).toBe(false);
  });

  // ── צורת התשובה ────────────────────────────────────────────────────────────
  // ה-routes בודקים `rowCount === 0` כדי להחזיר 404, וקוראים `rows[0]`.

  it('INSERT ... RETURNING מחזיר rows ו-rowCount', async () => {
    const r = await pool.query(`INSERT INTO t (name) VALUES ($1) RETURNING id, name`, ['alpha']);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].name).toBe('alpha');
    expect(r.rowCount).toBe(1);
  });

  it('SELECT מחזיר rowCount לפי מספר השורות שחזרו', async () => {
    await pool.query(`INSERT INTO t (name) VALUES ('bravo'), ('charlie')`);
    const r = await pool.query(`SELECT * FROM t WHERE name IN ('bravo','charlie')`);
    expect(r.rows).toHaveLength(2);
    expect(r.rowCount).toBe(2);
  });

  it('UPDATE מחזיר את מספר השורות שהושפעו, גם בלי RETURNING', async () => {
    const r = await pool.query(`UPDATE t SET name = 'delta' WHERE name = 'bravo'`);
    expect(r.rowCount).toBe(1);
  });

  it('UPDATE שלא תפס שורה מחזיר rowCount=0 — זה מה שהופך ל-404', async () => {
    const r = await pool.query(`UPDATE t SET name='x' WHERE name='אין-כזה'`);
    expect(r.rowCount).toBe(0);
  });

  it('DELETE מחזיר rowCount', async () => {
    await pool.query(`INSERT INTO t (name) VALUES ('todelete')`);
    const r = await pool.query(`DELETE FROM t WHERE name='todelete'`);
    expect(r.rowCount).toBe(1);
  });

  // ── צורות הקריאה שהקוד משתמש בהן ──────────────────────────────────────────

  it('תומך בצורת { text, values } ולא רק במחרוזת', async () => {
    const r = await pool.query({ text: `SELECT $1::text AS v`, values: ['ok'] });
    expect(r.rows[0].v).toBe('ok');
  });

  it('פרמטר NULL עובר כמו שהוא', async () => {
    const r = await pool.query(`SELECT $1::text AS v`, [null]);
    expect(r.rows[0].v).toBeNull();
  });

  it('פרמטר מערך — ANY($1::int[]) בשימוש ב-strips ובהעברות', async () => {
    const ins = await pool.query(`INSERT INTO t (name) VALUES ('arr') RETURNING id`);
    const r = await pool.query(`SELECT id FROM t WHERE id = ANY($1::int[])`, [[ins.rows[0].id]]);
    expect(r.rows).toHaveLength(1);
  });

  it('JSONB חוזר כאובייקט מפוענח, כמו ב-pg', async () => {
    const ins = await pool.query(`INSERT INTO t (name, j) VALUES ('js', $1::jsonb) RETURNING id`, [JSON.stringify(['A', 'B'])]);
    const r = await pool.query(`SELECT j FROM t WHERE id=$1`, [ins.rows[0].id]);
    expect(r.rows[0].j).toEqual(['A', 'B']);
  });

  it('TIMESTAMPTZ חוזר כ-Date, כמו ב-pg', async () => {
    const r = await pool.query(`SELECT NOW() AS n`);
    expect(r.rows[0].n).toBeInstanceOf(Date);
  });

  it('ריבוי פקודות בשאילתה אחת נופל ל-exec ולא נכשל', async () => {
    await pool.query(`CREATE TABLE m1 (i INT); CREATE TABLE m2 (i INT)`);
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM pg_tables WHERE tablename IN ('m1','m2')`);
    expect(r.rows[0].n).toBe(2);
  });

  it('שגיאה נושאת SQLSTATE — pool.js מסווג לפיו כשל connection זמני', async () => {
    await expect(pool.query(`SELECT * FROM אין_טבלה_כזו`)).rejects.toMatchObject({ code: '42P01' });
  });

  // ── בידוד טרנזקציות: הסיכון האמיתי בחיבור יחיד ────────────────────────────

  it('connect() מחזיק את המאגר — טרנזקציות מקבילות אינן משתרגות', async () => {
    await pool.query(`CREATE TABLE txn (id INT PRIMARY KEY, v INT)`);
    await pool.query(`INSERT INTO txn VALUES (1, 0)`);

    // 10 קוראים־קוראים־כותבים במקביל. בלי נעילה, שניים היו קוראים את אותו ערך
    // וכותבים אותו בחזרה, והמונה היה מגיע ל-1 במקום ל-10 (lost update).
    await Promise.all(Array.from({ length: 10 }, () => (async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const cur = await c.query(`SELECT v FROM txn WHERE id=1`);
        await c.query(`UPDATE txn SET v=$1 WHERE id=1`, [cur.rows[0].v + 1]);
        await c.query('COMMIT');
      } finally { c.release(); }
    })()));

    const r = await pool.query(`SELECT v FROM txn WHERE id=1`);
    expect(r.rows[0].v).toBe(10);
  });

  it('ROLLBACK מבטל רק את הטרנזקציה שלו', async () => {
    await pool.query(`UPDATE txn SET v=100 WHERE id=1`);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`UPDATE txn SET v=999 WHERE id=1`);
      await c.query('ROLLBACK');
    } finally { c.release(); }
    const r = await pool.query(`SELECT v FROM txn WHERE id=1`);
    expect(r.rows[0].v).toBe(100);
  });

  it('release() כפול אינו משחרר את התור פעמיים', async () => {
    const c = await pool.connect();
    c.release();
    c.release(); // אם זה היה משחרר שוב, המחזיק הבא היה מקבל את החיבור במקביל
    const r = await pool.query(`SELECT 1 AS ok`);
    expect(r.rows[0].ok).toBe(1);
  });

  it('שאילתה רגילה ממתינה לטרנזקציה שמחזיקה ואינה נכנסת לתוכה', async () => {
    const order = [];
    const c = await pool.connect();
    await c.query('BEGIN');
    const pending = pool.query(`SELECT 1 AS ok`).then(() => order.push('query'));
    await new Promise(r => setTimeout(r, 30)); // די והותר כדי שהשאילתה תרוץ אם לא נחסמה
    order.push('txn-end');
    await c.query('COMMIT');
    c.release();
    await pending;
    expect(order).toEqual(['txn-end', 'query']);
  });
});
