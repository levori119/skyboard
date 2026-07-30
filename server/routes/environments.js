// סביבות תרגול — API לניהול הסביבות (רשימה למסך הכניסה, חותמת כניסה, איפוס).
// שים לב: ה-router הזה נטען *לפני* ה-middleware של הסביבה ב-app.js, כי הוא
// עובד ישירות מול טבלת הרישום ב-public ולא צריך (ולא רוצה) הקשר סביבה.
import { Router } from 'express';
import { listEnvironments, touchEnvironment, resetEnvSchema, ensureEnvSchema } from '../db/envs.js';
import { isValidEnv, FLYING_MAX } from '../db/env-context.js';
import { rawPool } from '../db/pool.js';

const router = Router();

// אבחון: לאיזה DB endpoint השרת *החי* מחובר ומה מצב הסביבות — לאימות פרודקשן
// מול Neon (למשל: "env_15 קיים ב-dev אבל לא ב-production"). מדבר ישירות מול
// rawPool/public (בלי הקשר סביבה). לעולם לא חושף credentials — endpoint host בלבד.
// אבטחה: אם מוגדר DIAG_TOKEN — חובה ?token= תואם; אחרת פתוח (נעל/מחק אחרי שימוש).
router.get('/api/_diag/env', async (req, res) => {
  const need = process.env.DIAG_TOKEN;
  if (need && req.query.token !== need) return res.status(403).json({ error: 'forbidden' });

  const dbUrl = process.env.DATABASE_URL || '';
  const host = (dbUrl.match(/@([^/]+)\//) || [])[1] || null;              // host בלבד — בלי user:pass
  const endpointId = host ? (host.match(/^(ep-[a-z0-9-]+?)-pooler/) || [, null])[1] : null;

  const out = {
    ok: true,
    server: {
      node: process.version,
      nodeEnv: process.env.NODE_ENV || null,
      uptimeSec: Math.round(process.uptime()),
      commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || process.env.SOURCE_COMMIT || null,
      railwayEnv: process.env.RAILWAY_ENVIRONMENT_NAME || null,
    },
    db: { endpointHost: host, endpointId },
  };

  try {
    const meta = await rawPool.query(
      `SELECT current_database() AS db, current_user AS usr, inet_server_addr()::text AS srv_addr`);
    out.db.currentDatabase = meta.rows[0].db;
    out.db.currentUser = meta.rows[0].usr;
    out.db.serverAddr = meta.rows[0].srv_addr;

    const reg = await rawPool.query(`SELECT to_regclass('public.environments') AS reg`);
    const registryExists = !!reg.rows[0].reg;
    out.environments = { registryTableExists: registryExists, rows: [] };
    if (registryExists) {
      const r = await rawPool.query(
        `SELECT env_number, schema_created, last_entered_at
         FROM public.environments ORDER BY env_number`);
      out.environments.rows = r.rows;
    }
    const sch = await rawPool.query(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name ~ '^env_[0-9]+$' ORDER BY 1`);
    out.environments.schemas = sch.rows.map(x => x.schema_name);

    res.json(out);
  } catch (err) {
    console.error('[environments] _diag נכשל:', err.message);
    res.status(500).json({ ...out, ok: false, error: err.message });
  }
});

// רשימת 50 הסביבות + סטטוס (טסה/תרגול, האם נוצרה, כניסה אחרונה) — למסך הכניסה
router.get('/api/environments', async (_req, res) => {
  try {
    res.json(await listEnvironments());
  } catch (err) {
    console.error('[environments] list נכשל:', err.message);
    res.status(500).json({ error: 'טעינת הסביבות נכשלה' });
  }
});

// כניסה לסביבה — יוצר את סכמת התרגול (פעם ראשונה בלבד) ומעדכן חותמת. הלקוח
// ממתין לתשובה לפני טעינת הדשבורד, כך שהיצירה החד-פעמית (~15ש') קורית פעם אחת
// בזמן ה-LOGIN (עם מצב טעינה) ולא חוסמת poll אקראי בהמשך.
router.post('/api/environments/:env/enter', async (req, res) => {
  const env = Number(req.params.env);
  if (!isValidEnv(env)) return res.status(400).json({ error: 'סביבה לא חוקית' });
  try {
    if (env > FLYING_MAX) await ensureEnvSchema(env); // תרגול — ודא סכמה מוכנה
    await touchEnvironment(env);
    res.json({ ok: true, env });
  } catch (err) {
    console.error(`[environments] enter ${env} נכשל:`, err.message);
    res.status(503).json({ error: 'הכנת סביבת התרגול נכשלה' });
  }
});

// איפוס סביבת תרגול — DROP + יצירה מחדש. תרגול בלבד (לעולם לא סביבה טסה/public).
router.post('/api/environments/:env/reset', async (req, res) => {
  const env = Number(req.params.env);
  if (!isValidEnv(env) || env <= FLYING_MAX) {
    return res.status(400).json({ error: 'אפשר לאפס רק סביבת תרגול (11-50)' });
  }
  try {
    await resetEnvSchema(env);
    res.json({ ok: true, env });
  } catch (err) {
    console.error(`[environments] reset ${env} נכשל:`, err.message);
    res.status(500).json({ error: 'איפוס הסביבה נכשל' });
  }
});

export default router;
