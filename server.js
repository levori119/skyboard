import 'dotenv/config';
import { initDb, cleanupExpiredStrips } from './server/db/init.js';
import { seedDb } from './server/db/seed.js';
import { cleanupProvisionalTransferPoints } from './server/routes/provisional-transfers.js';
import { checkTableClassification } from './server/db/env-tables.js';
import { syncAllEnvSchemas, forEachEnvironment } from './server/db/envs.js';
import { rawPool } from './server/db/pool.js';
import { markReady, markFailed } from './server/boot-state.js';
import app from './server/app.js';
import { listen } from './server/listen.js';

const PORT = Number(process.env.PORT) || 3001;

// מדידת זמן פר-שלב: שרשרת העלייה מול Neon לוקחת עשרות שניות עד דקות,
// ובלי הפירוק הזה אי אפשר לדעת מהלוג איזה שלב הוא זה שתקוע.
async function timed(label, fn) {
  const t0 = Date.now();
  const res = await fn();
  console.log(`[startup] ${label} — ${Date.now() - t0}ms`);
  return res;
}

// עליית DB עמידה ל-cold-start של Neon (auto-suspend): מנסה שוב במקום ליפול מיד.
async function startWithDbRetry() {
  const MAX = 6;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      await timed('initDb', initDb);
      await timed('seedDb', seedDb);
      // סביבות תרגול: לוודא שכל טבלה ב-public מסווגת (מונע זליגת תרגול↔אמת),
      // ואז להחיל טבלאות/עמודות חדשות על סכמות התרגול הקיימות.
      await timed('checkTableClassification', () => checkTableClassification(rawPool));
      await timed('syncAllEnvSchemas', syncAllEnvSchemas);
      return;
    } catch (err) {
      const wait = Math.min(1500 * attempt, 8000);
      console.error(`[startup] DB לא זמין (ניסיון ${attempt}/${MAX}): ${err.message}`);
      if (attempt === MAX) throw err;
      console.log(`[startup] Neon כנראה בהתעוררות — ניסיון חוזר בעוד ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// ── 1. להאזין מיד ─────────────────────────────────────────────────────────────
// קריטי לפריסה בענן: הפורט נתפס **לפני** עליית ה-DB. קודם ה-listen חיכה
// לסיום כל שרשרת ה-DB, וכל עוד היא רצה (או נתקעה) הקונטיינר היה חי בלי מאזין —
// מה שגרם ל-"Application failed to respond" (502) ב-Railway בלי שום שגיאה בלוג.
// עכשיו /api/health עונה מיד ומדווח אם ה-DB עוד עולה או נכשל.
// listen() ולא app.listen(..., cb): ב-Express 5 ה-callback משמש גם כמאזין
// ל-'error', ולכן bind כושל היה מדפיס "listening" והתהליך היה נשאר חי בלי פורט.
// כל /api חזר אז 500 דרך פרוקסי Vite, והמשתמש ראה "שגיאה בכניסה" במסך ה-LOGIN.
listen(app, PORT, '0.0.0.0')
  .then(() => {
    console.log(`SKY-KING API listening on 0.0.0.0:${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
    console.log('[startup] מתחיל עליית DB ברקע — /api/health מדווח על ההתקדמות');
  })
  .catch((err) => {
    console.error(`[startup] כשל בהאזנה על פורט ${PORT}: ${err.message}`);
    if (err.code === 'EADDRINUSE') {
      console.error(`[startup] הפורט תפוס — כנראה רץ כבר שרת SKY-KING. סגור אותו או קבע PORT אחר.`);
    }
    process.exit(1);
  });

// ── 2. לעלות את ה-DB ברקע ─────────────────────────────────────────────────────
startWithDbRetry()
  .then(() => {
    markReady();
    console.log('[startup] ה-DB מוכן — השרת משרת בקשות במלואן');
    // ניקוי תקופתי רץ על public + כל סכמות התרגול הקיימות (כל אחת בהקשר שלה)
    const cleanupAllEnvs = () => {
      forEachEnvironment(() => cleanupExpiredStrips());
      forEachEnvironment(() => cleanupProvisionalTransferPoints());
    };
    cleanupAllEnvs();
    setInterval(cleanupAllEnvs, 60 * 60 * 1000);
  })
  .catch(err => {
    // לא יוצאים עם exit(1): תהליך שמת מייד מוחלף ב-502 אילם ולולאת restart.
    // נשארים חיים כדי ש-/api/health יחזיר 503 עם סיבת הכשל ושהלוג יהיה קריא.
    markFailed(err);
    console.error('Startup error (אחרי כל הניסיונות):', err);
    console.error('[startup] השרת ממשיך להאזין — GET /api/health יחזיר 503 עם הסיבה');
  });
