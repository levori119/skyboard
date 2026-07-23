// סביבות תרגול — בדיקת אינטגרציה מול Neon אמיתי: בידוד מוחלט בין סכמות.
// זו בדיקת הבטיחות הקריטית: תרגול (env_49) לעולם לא נוגע במידע הטס (public).
// כותבת אך ורק לסכמת env_49 (נוצרת ונמחקת כאן) + שורת רישום ב-environments.
// רצה רק כשיש DATABASE_URL (מקומית / CI עם secret); אחרת מדולגת.
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const HAS_DB = !!process.env.DATABASE_URL;
const TEST_ENV = 49;
const MARKER = 'TEST_ENV_ISOL_49';

describe.skipIf(!HAS_DB)('בידוד סכמות סביבה (אינטגרציה, Neon)', () => {
  let pool, runWithEnv, ensureEnvSchema, dropEnvSchema, OPERATIONAL_TABLES;

  beforeAll(async () => {
    ({ default: pool } = await import('./pool.js'));
    ({ runWithEnv } = await import('./env-context.js'));
    ({ ensureEnvSchema, dropEnvSchema } = await import('./envs.js'));
    ({ OPERATIONAL_TABLES } = await import('./env-tables.js'));
    await dropEnvSchema(TEST_ENV);        // התחלה נקייה
    await ensureEnvSchema(TEST_ENV);      // יצירה טרייה — מה שנבדק
  }, 120_000);

  afterAll(async () => {
    if (!pool) return;
    await dropEnvSchema(TEST_ENV);
    await pool.query(`DELETE FROM environments WHERE env_number = $1`, [TEST_ENV]);
    await pool.end?.();
  }, 60_000);

  it('כל הטבלאות התפעוליות קיימות בסכמת env_49 (אין fallthrough שקט)', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [`env_${TEST_ENV}`],
    );
    const inEnv = new Set(rows.map(r => r.table_name));
    const missing = OPERATIONAL_TABLES.filter(t => !inEnv.has(t));
    expect(missing).toEqual([]);
  }, 30_000);

  it('טבלה היברידית — שורות ההגדרה הועתקו מ-public', async () => {
    const pub = await pool.query(`SELECT COUNT(*)::int AS n FROM public.airfield_elements`);
    const env = await pool.query(`SELECT COUNT(*)::int AS n FROM env_${TEST_ENV}.airfield_elements`);
    expect(env.rows[0].n).toBe(pub.rows[0].n);
  }, 30_000);

  it('כתיבה בסביבה 49 לא נראית ב-public ולהפך', async () => {
    await runWithEnv(TEST_ENV, () =>
      pool.query(`INSERT INTO strips (callsign) VALUES ($1)`, [MARKER]));

    const inEnv = await runWithEnv(TEST_ENV, () =>
      pool.query(`SELECT id FROM strips WHERE callsign = $1`, [MARKER]));
    expect(inEnv.rows.length).toBe(1);

    // ב-public (בלי הקשר) — הסימון אסור שיופיע
    const inPublic = await pool.query(`SELECT id FROM strips WHERE callsign = $1`, [MARKER]);
    expect(inPublic.rows.length).toBe(0);

    // וגם דרך סביבה טסה (3 → public) — אסור שיופיע
    const inFlying = await runWithEnv(3, () =>
      pool.query(`SELECT id FROM strips WHERE callsign = $1`, [MARKER]));
    expect(inFlying.rows.length).toBe(0);
  }, 30_000);

  it('קונפיגורציה משותפת — sectors נקראת מ-public גם בהקשר סביבת תרגול', async () => {
    const pub = await pool.query(`SELECT COUNT(*)::int AS n FROM public.sectors`);
    const viaEnv = await runWithEnv(TEST_ENV, () =>
      pool.query(`SELECT COUNT(*)::int AS n FROM sectors`));
    expect(viaEnv.rows[0].n).toBe(pub.rows[0].n);
  }, 30_000);

  it('FK עם CASCADE שוכפל: מחיקת פ"מ מוחקת את מטוסיו בתוך הסביבה', async () => {
    await runWithEnv(TEST_ENV, async () => {
      const { rows: [s] } = await pool.query(
        `INSERT INTO strips (callsign) VALUES ($1) RETURNING id`, [`${MARKER}_FK`]);
      await pool.query(
        `INSERT INTO strip_aircraft (strip_id, idx) VALUES ($1, 1)`, [s.id]);
      await pool.query(`DELETE FROM strips WHERE id = $1`, [s.id]);
      const orphans = await pool.query(
        `SELECT id FROM strip_aircraft WHERE strip_id = $1`, [s.id]);
      expect(orphans.rows.length).toBe(0);
    });
  }, 30_000);

  it('טרנזקציה מפורשת (pool.connect + BEGIN/COMMIT) מכבדת את הסביבה', async () => {
    await runWithEnv(TEST_ENV, async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO strips (callsign) VALUES ($1)`, [`${MARKER}_TX`]);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    });
    const inPublic = await pool.query(
      `SELECT id FROM strips WHERE callsign = $1`, [`${MARKER}_TX`]);
    expect(inPublic.rows.length).toBe(0);
    const inEnv = await pool.query(
      `SELECT id FROM env_${TEST_ENV}.strips WHERE callsign = $1`, [`${MARKER}_TX`]);
    expect(inEnv.rows.length).toBe(1);
  }, 30_000);
});
