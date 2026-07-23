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
  let pool, rawPool, runWithEnv, ensureEnvSchema, dropEnvSchema, OPERATIONAL_TABLES;

  beforeAll(async () => {
    ({ default: pool, rawPool } = await import('./pool.js'));
    ({ runWithEnv } = await import('./env-context.js'));
    ({ ensureEnvSchema, dropEnvSchema } = await import('./envs.js'));
    ({ OPERATIONAL_TABLES } = await import('./env-tables.js'));
    await dropEnvSchema(TEST_ENV);        // התחלה נקייה
    await ensureEnvSchema(TEST_ENV);      // יצירה טרייה — מה שנבדק
  }, 120_000);

  afterAll(async () => {
    if (!rawPool) return;
    await dropEnvSchema(TEST_ENV);
    // ניקוי דרך rawPool (public) — כולל שורות MARKER שאולי דלפו בריצה שנכשלה
    await rawPool.query(`DELETE FROM public.strips WHERE callsign LIKE $1`, [`${MARKER}%`]).catch(() => {});
    await rawPool.query(`DELETE FROM environments WHERE env_number = $1`, [TEST_ENV]).catch(() => {});
    await rawPool.end().catch(() => {});
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

  it('FKs שוכפלו במלואם — env_49 מכיל בדיוק את אותם FKs כמו public', async () => {
    const fkNames = (schema) => pool // דרך rawPool דה-פקטו: אותה שאילתה, ללא הקשר
      && rawPool.query(
        `SELECT c.relname||'.'||con.conname AS id
         FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
         JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE con.contype='f' AND n.nspname=$1 AND c.relname = ANY($2)`,
        [schema, OPERATIONAL_TABLES]).then(r => new Set(r.rows.map(x => x.id)));
    const inPublic = await fkNames('public');
    const inEnv = await fkNames(`env_${TEST_ENV}`);
    expect([...inEnv].sort()).toEqual([...inPublic].sort());
    expect(inPublic.size).toBeGreaterThan(0);
  }, 30_000);

  it('FK חוצה-סכמה לקונפיג נאכף: preset לא קיים נדחה, קיים מתקבל', async () => {
    // strips.workstation_preset_id → public.workstation_presets (ON DELETE SET NULL).
    // בהקשר env_49 ה-FK חייב להיפתר ל-public (קונפיג משותף) ולהיאכף.
    const { rows: presets } = await rawPool.query(`SELECT id FROM public.workstation_presets LIMIT 1`);
    await runWithEnv(TEST_ENV, async () => {
      // preset לא קיים → הפרת FK
      await expect(
        pool.query(`INSERT INTO strips (callsign, workstation_preset_id) VALUES ($1, $2)`,
          [`${MARKER}_BADFK`, 2147483000]),
      ).rejects.toThrow();
      // preset אמיתי מ-public → מתקבל (מוכיח שה-FK נפתר ל-public)
      if (presets.length) {
        const ok = await pool.query(
          `INSERT INTO strips (callsign, workstation_preset_id) VALUES ($1, $2) RETURNING id`,
          [`${MARKER}_OKFK`, presets[0].id]);
        expect(ok.rows.length).toBe(1);
      }
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
    // הכתיבה חייבת להיות רק ב-env
    const inEnv = await rawPool.query(
      `SELECT id FROM env_${TEST_ENV}.strips WHERE callsign = $1`, [`${MARKER}_TX`]);
    expect(inEnv.rows.length).toBe(1);
    // רגרסיה קריטית: connection ששירת את הטרנזקציה המפורשת אסור שיחזור ל-pool
    // עם search_path של תרגול. קריאות public רבות (בהקשר טסה) חייבות *כולן* לא
    // לראות את הכתיבה — קריאה בודדת עלולה לפגוע ב-connection נקי ולפספס דליפה.
    for (let i = 0; i < 20; i++) {
      const inPublic = await pool.query( // ברירת מחדל = סביבה 1 → public
        `SELECT id FROM strips WHERE callsign = $1`, [`${MARKER}_TX`]);
      expect(inPublic.rows.length, `public read #${i} ראה כתיבת תרגול (דליפת search_path)`).toBe(0);
    }
  }, 30_000);
});
