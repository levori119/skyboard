// סביבות תרגול — middleware שקובע את הקשר הסביבה לכל בקשה.
// קורא כותרת X-Env (ברירת מחדל 1), מאמת, מוודא שסכמת הסביבה קיימת (יצירה עצלה),
// ואז מריץ את שאר ה-handler בתוך runWithEnv — כך pool.query מכוון אוטומטית
// לסכמה הנכונה בלי לגעת ב-353 ה-routes. סביבות טסות (1-10) → public, מסלול מהיר.
import { isValidEnv, runWithEnv, DEFAULT_ENV, FLYING_MAX } from '../db/env-context.js';

export function createEnvironmentMiddleware({ ensure }) {
  return async function environmentMiddleware(req, res, next) {
    const raw = req.get('X-Env');
    let env = DEFAULT_ENV;
    if (raw != null && raw !== '') {
      const n = Number(raw);
      if (!Number.isInteger(n) || !isValidEnv(n)) {
        return res.status(400).json({ error: `סביבה לא חוקית: ${raw}` });
      }
      env = n;
    }

    if (env > FLYING_MAX) {
      try {
        await ensure(env); // יצירה/אימות עצלים של סכמת התרגול לפני השאילתה הראשונה
      } catch (err) {
        console.error(`[environments] הכנת סביבה ${env} נכשלה:`, err.message);
        return res.status(503).json({ error: 'סביבת התרגול אינה זמינה כרגע' });
      }
    }

    runWithEnv(env, () => next());
  };
}
