// סביבות תרגול — ניהול סכמות env_11..env_50 (יצירה עצלה, סנכרון, איפוס).
//
// עיקרון: public הוא מקור האמת היחיד למבנה (initDb מתחזק אותו כרגיל).
// סכמת סביבה נבנית כשיבוט מבני של הטבלאות התפעוליות בלבד:
//   CREATE TABLE (LIKE public.T INCLUDING ALL)  ← עמודות, defaults, אינדקסים
//   + שכפול FKs (LIKE לא מעתיק אותם) דרך pg_get_constraintdef, שרץ תחת
//     search_path env_NN,public — כך FK תפעולי→תפעולי מצביע פנימה (CASCADE נשמר)
//     ו-FK תפעולי→קונפיג נופל ל-public.
//   + העתקת שורות לטבלאות היברידיות (הגדרות שדה שסטטוס חי יושב עליהן).
// הערה: ברירות המחדל של SERIAL מצביעות על ה-sequences של public — משותפים
// בכוונה: id ייחודי גלובלית, בלי התנגשויות בין סביבות.
//
// הכל רץ בטרנזקציה אחת עם SET LOCAL (בטוח מול ה-pooler של Neon) + advisory lock
// נגד יצירה מקבילה. סנכרון boot מוסיף טבלאות/עמודות חדשות לסכמות קיימות.
import { rawPool } from './pool.js';
import { isValidEnv, schemaForEnv, runWithEnv, FLYING_MAX, ENV_MAX, ENV_MIN } from './env-context.js';
import { OPERATIONAL_TABLES, HYBRID_SEED_TABLES } from './env-tables.js';

const ensured = new Set(); // סביבות שאומתו מאז ה-boot — חוסך round-trips בכל בקשה

function assertTrainingEnv(env) {
  if (!isValidEnv(env) || env <= FLYING_MAX) {
    throw new Error(`not a training environment: ${String(env)}`);
  }
}

async function ensureRegistryTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS public.environments (
    env_number INTEGER PRIMARY KEY CHECK (env_number BETWEEN ${ENV_MIN} AND ${ENV_MAX}),
    schema_created BOOLEAN NOT NULL DEFAULT FALSE,
    last_entered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

// כל עמודות הטבלאות התפעוליות בסכמה נתונה — שאילתה אחת (לא פר-טבלה).
// מחזיר Map<table, Map<col,{type,default_expr}>>. מונע מאות round-trips מול Neon.
async function columnsBySchema(client, schema) {
  const { rows } = await client.query(
    `SELECT c.relname AS tbl, a.attname AS name,
            format_type(a.atttypid, a.atttypmod) AS type,
            pg_get_expr(d.adbin, d.adrelid) AS default_expr
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE n.nspname = $1 AND c.relname = ANY($2) AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [schema, OPERATIONAL_TABLES],
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.tbl)) map.set(r.tbl, new Map());
    map.get(r.tbl).set(r.name, { type: r.type, default_expr: r.default_expr });
  }
  return map;
}

// כל ה-FKs של הטבלאות התפעוליות בסכמה — שאילתה אחת. מחזיר Map<table, [{name,def}]>.
async function fksBySchema(client, schema) {
  const { rows } = await client.query(
    `SELECT c.relname AS tbl, con.conname AS name, pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE con.contype = 'f' AND n.nspname = $1 AND c.relname = ANY($2)`,
    [schema, OPERATIONAL_TABLES],
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.tbl)) map.set(r.tbl, []);
    map.get(r.tbl).push({ name: r.name, def: r.def });
  }
  return map;
}

// יצירה/סנכרון של סכמת סביבה — idempotent, טרנזקציה אחת. כל ה-DDL נבנה כמחרוזת
// אחת ונשלח ב-round-trip בודד (יצירת 39 טבלאות פר-טבלה נמשכה >100ש' מול Neon).
async function initEnvSchema(env) {
  assertTrainingEnv(env);
  const schema = schemaForEnv(env); // env_NN — נבנה רק ממספר מאומת
  const client = await rawPool.connect();
  try {
    await client.query('BEGIN');
    // מסלק מרוץ יצירה בין בקשות/שרתים מקבילים
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`skyking_env_init_${env}`]);
    await ensureRegistryTable(client);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    // קריטי לבידוד: שולפים את ה-FK defs כש-public בלבד על ה-search_path, כדי
    // ש-pg_get_constraintdef ירנדר את שמות המטרה **לא-מסוימי-סכמה**. אחרת מטרה
    // תפעולית עלולה להתקבע ל-public.strips ולשבור את הבידוד (תרגול→אמת).
    await client.query(`SET LOCAL search_path TO public`);

    // מיפוי המצב הקיים (2 שאילתות במקום מאות): אילו טבלאות/עמודות/FKs כבר יש
    const { rows: existingRows } = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`, [schema]);
    const existing = new Set(existingRows.map(r => r.table_name));
    const pubCols = await columnsBySchema(client, 'public');
    const pubFks = await fksBySchema(client, 'public');
    const envCols = await columnsBySchema(client, schema); // ריק אם הסכמה טרייה

    // FK defs נשלפו כש-public על ה-search_path → שמות מטרה שאינם מסוימי-סכמה.
    // כשה-ALTER ירוץ תחת search_path=schema,public: מטרה תפעולית תיפתר ל-schema
    // (בידוד) ומטרת קונפיג תיפול ל-public — בדיוק הסמנטיקה הרצויה.
    const ddl = [`SET LOCAL search_path TO ${schema}, public`];

    for (const table of OPERATIONAL_TABLES) {
      if (!existing.has(table)) {
        // טבלה חדשה: שיבוט מבני מלא (עמודות, defaults, אינדקסים) — FKs נוספים בנפרד
        ddl.push(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
      } else {
        // סנכרון עמודות שנוספו ל-public מאז (ALTER מצטבר של initDb)
        const have = envCols.get(table) || new Map();
        for (const [name, col] of (pubCols.get(table) || new Map())) {
          if (have.has(name)) continue;
          const def = col.default_expr ? ` DEFAULT ${col.default_expr}` : '';
          ddl.push(`ALTER TABLE ${schema}.${table} ADD COLUMN IF NOT EXISTS "${name}" ${col.type}${def}`);
        }
      }
    }

    // FKs — לכל הטבלאות (חדשות וגם כאלה שנוסף להן FK ב-public). אחרי שכל
    // ה-CREATE TABLE נכללו ב-DDL, כל טבלאות היעד קיימות בזמן ה-ALTER.
    const envFks = await fksBySchema(client, schema);
    for (const table of OPERATIONAL_TABLES) {
      const have = new Set((envFks.get(table) || []).map(f => f.name));
      for (const fk of (pubFks.get(table) || [])) {
        if (have.has(fk.name)) continue;
        ddl.push(`ALTER TABLE ${schema}.${table} ADD CONSTRAINT "${fk.name}" ${fk.def}`);
      }
    }

    // טבלאות היברידיות: העתקת שורות ההגדרה מ-public (שורות חדשות בלבד אם קיימת)
    for (const table of HYBRID_SEED_TABLES) {
      if (!existing.has(table)) {
        ddl.push(`INSERT INTO ${schema}.${table} SELECT * FROM public.${table}`);
      } else {
        ddl.push(
          `INSERT INTO ${schema}.${table} SELECT * FROM public.${table} p ` +
          `WHERE NOT EXISTS (SELECT 1 FROM ${schema}.${table} e WHERE e.id = p.id)`);
      }
    }

    // round-trip בודד לכל ה-DDL (SET LOCAL תקף לכל המחרוזת בתוך הטרנזקציה)
    if (ddl.length > 1) await client.query(ddl.join(';\n'));

    await client.query(
      `INSERT INTO public.environments (env_number, schema_created)
       VALUES ($1, TRUE)
       ON CONFLICT (env_number) DO UPDATE SET schema_created = TRUE`,
      [env],
    );
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection כנראה מת */ }
    throw err;
  } finally {
    client.release();
  }
}

// אימות אחרי יצירה: כל הטבלאות התפעוליות חייבות להתקיים בסכמה.
// טבלה חסרה = fallthrough שקט ל-public (תרגול כותב לאמת) — עדיף להפיל את הסביבה.
async function verifyEnvSchema(env) {
  const schema = schemaForEnv(env);
  const { rows } = await rawPool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`, [schema]);
  const inEnv = new Set(rows.map(r => r.table_name));
  const missing = OPERATIONAL_TABLES.filter(t => !inEnv.has(t));
  if (missing.length) {
    throw new Error(`[environments] סכמה ${schema} חסרה טבלאות תפעוליות: ${missing.join(', ')}`);
  }
}

// יצירה עצלה — נקראת מה-middleware בכל בקשת סביבת תרגול (memoized אחרי הראשונה)
export async function ensureEnvSchema(env) {
  if (isValidEnv(env) && env <= FLYING_MAX) return; // טסות — public, אין מה ליצור
  assertTrainingEnv(env);
  if (ensured.has(env)) return;
  await initEnvSchema(env);
  await verifyEnvSchema(env);
  ensured.add(env);
}

// איפוס/מחיקה — סביבות תרגול בלבד. משמש גם את בדיקות האינטגרציה.
export async function dropEnvSchema(env) {
  assertTrainingEnv(env);
  const schema = schemaForEnv(env);
  await rawPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await rawPool.query(
    `UPDATE environments SET schema_created = FALSE WHERE env_number = $1`, [env],
  ).catch(() => { /* טבלת הרישום אולי עוד לא קיימת */ });
  ensured.delete(env);
}

export async function resetEnvSchema(env) {
  await dropEnvSchema(env);
  await ensureEnvSchema(env);
}

// סנכרון boot: מיישם על כל סכמות התרגול הקיימות טבלאות/עמודות/FKs שנוספו
// ל-public מאז (initDb כבר רץ). סביבות שטרם נוצרו לא נבנות כאן — רק בכניסה.
export async function syncAllEnvSchemas() {
  const { rows } = await rawPool.query(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name ~ '^env_[0-9]+$'`);
  const t0 = Date.now();
  for (const { schema_name } of rows) {
    const env = Number(schema_name.slice(4));
    if (!isValidEnv(env) || env <= FLYING_MAX) continue;
    try {
      await initEnvSchema(env);
      await verifyEnvSchema(env);
      ensured.add(env);
    } catch (err) {
      console.error(`[environments] סנכרון ${schema_name} נכשל:`, err.message);
    }
  }
  if (rows.length) {
    console.log(`[environments] סונכרנו ${rows.length} סכמות תרגול (${Date.now() - t0}ms)`);
  }
}

// חותמת כניסה לסביבה (מוצג במסך הכניסה: אילו סביבות פעילות)
export async function touchEnvironment(env) {
  if (!isValidEnv(env)) throw new Error(`invalid environment: ${String(env)}`);
  const client = await rawPool.connect();
  try {
    await ensureRegistryTable(client);
    await client.query(
      `INSERT INTO public.environments (env_number, schema_created, last_entered_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (env_number) DO UPDATE SET last_entered_at = NOW()`,
      [env, env > FLYING_MAX],
    );
  } finally {
    client.release();
  }
}

// רשימת 50 הסביבות למסך הכניסה
export async function listEnvironments() {
  const { rows } = await rawPool.query(
    `SELECT env_number, schema_created, last_entered_at FROM environments`,
  ).catch(() => ({ rows: [] }));
  const byNum = new Map(rows.map(r => [r.env_number, r]));
  const out = [];
  for (let env = ENV_MIN; env <= ENV_MAX; env++) {
    const r = byNum.get(env);
    out.push({
      env,
      type: env <= FLYING_MAX ? 'flying' : 'training',
      schema_created: env <= FLYING_MAX ? true : Boolean(r?.schema_created),
      last_entered_at: r?.last_entered_at ?? null,
    });
  }
  return out;
}

// הרצת פעולה (ניקוי תקופתי וכו') על public + כל סכמות התרגול הקיימות
export async function forEachEnvironment(fn) {
  const targets = [1];
  try {
    const { rows } = await rawPool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name ~ '^env_[0-9]+$'`);
    for (const { schema_name } of rows) {
      const env = Number(schema_name.slice(4));
      if (isValidEnv(env) && env > FLYING_MAX) targets.push(env);
    }
  } catch (err) {
    console.error('[environments] איתור סכמות נכשל:', err.message);
  }
  for (const env of targets) {
    try {
      await runWithEnv(env, fn);
    } catch (err) {
      console.error(`[environments] פעולה תקופתית נכשלה בסביבה ${env}:`, err.message);
    }
  }
}
