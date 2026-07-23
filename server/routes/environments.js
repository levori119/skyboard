// סביבות תרגול — API לניהול הסביבות (רשימה למסך הכניסה, חותמת כניסה, איפוס).
// שים לב: ה-router הזה נטען *לפני* ה-middleware של הסביבה ב-app.js, כי הוא
// עובד ישירות מול טבלת הרישום ב-public ולא צריך (ולא רוצה) הקשר סביבה.
import { Router } from 'express';
import { listEnvironments, touchEnvironment, resetEnvSchema, ensureEnvSchema } from '../db/envs.js';
import { isValidEnv, FLYING_MAX } from '../db/env-context.js';

const router = Router();

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
