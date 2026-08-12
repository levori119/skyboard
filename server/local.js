// שרת ה-API המקומי של העמדה — אותו Express, מאגר אחר.
//
// זהו התאום של server.js למצב מנותק: אותו `app` בדיוק, אותם 457 endpoints,
// אבל מול המאגר המקומי (PGlite) במקום מול Postgres מרוחק. כך "לעבוד בנתק"
// אינו מסלול קוד שני שצריך לזכור לתחזק — זו אותה מערכת מול מאגר אחר.
//
// שלושה הבדלים מ-server.js, וכולם מכוונים:
//
//   1. **127.0.0.1 בלבד.** המאגר המקומי מכיל מידע שדה מבצעי ואין לו הזדהות
//      ברמת הרשת. שרת שמאזין ל-0.0.0.0 היה חושף אותו לכל מי שברשת העמדה.
//   2. **בלי עובדי GAPI.** אין טעם לנסות לסנכרן מול שו"ב חיצוני מעמדה
//      מנותקת; ה-outbox של GAPI שייך לשרת המרכזי.
//   3. **סוד חתימה מתמיד על הדיסק.** בשרת המרכזי סוד חסר בפרודקשן הוא שגיאה
//      קשה. בעמדה מנותקת אין מי שיזריק אותו, וסוד אקראי לכל הרצה היה מנתק את
//      הפקח בכל הפעלה מחדש — באמצע משמרת. לכן נוצר פעם אחת ונשמר ליד המאגר.

import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

/** הפורט שהעמדה תשתמש בו. 0 = פורט חופשי שהמערכת בוחרת (ברירת המחדל). */
const PORT = Number(process.env.SKYKING_LOCAL_API_PORT) || 0;
const HOST = '127.0.0.1';

/**
 * סוד חתימה שנשאר בין הפעלות.
 *
 * נשמר ליד המאגר המקומי ולא ב-.env: מי שמגיע לקובץ הזה כבר מחזיק את המאגר
 * עצמו, ולכן אין כאן הרעה — אבל יש שיפור בשרידות, כי הפקח לא מנותק בכל
 * הפעלה מחדש של העמדה.
 */
function ensureLocalAuthSecret(dataDir) {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32) return 'env';
  const file = path.join(dataDir, 'auth-secret');
  try {
    if (fs.existsSync(file)) {
      const v = fs.readFileSync(file, 'utf8').trim();
      if (v.length >= 32) { process.env.AUTH_SECRET = v; return 'file'; }
    }
    fs.mkdirSync(dataDir, { recursive: true });
    const v = randomBytes(48).toString('base64url');
    fs.writeFileSync(file, v, { mode: 0o600 });
    process.env.AUTH_SECRET = v;
    return 'created';
  } catch (err) {
    // כשל כתיבה אינו עוצר את העמדה: היא תעלה עם סוד להרצה זו בלבד, והפקח
    // יצטרך להתחבר שוב אחרי הפעלה מחדש. עדיף מעמדה שלא עולה.
    console.warn(`[local] לא ניתן לשמור סוד חתימה (${err.message}) — ההזדהות תתאפס בהפעלה מחדש`);
    process.env.AUTH_SECRET = randomBytes(48).toString('base64url');
    return 'ephemeral';
  }
}

export async function startLocalServer({ port = PORT, host = HOST } = {}) {
  process.env.SKYKING_LOCAL_DB = '1';

  // נטען **אחרי** קביעת SKYKING_LOCAL_DB: pool.js בוחר את הדרייבר בזמן
  // טעינת המודול, וטעינה מוקדמת הייתה מקבעת אותו על Postgres מרוחק.
  const { createLocalPool } = await import('./db/localPool.js');
  const dataDir = createLocalPool().dataDir;
  const secretSource = ensureLocalAuthSecret(dataDir);

  const { initDb } = await import('./db/init.js');
  const { seedDb } = await import('./db/seed.js');
  const { syncAllEnvSchemas } = await import('./db/envs.js');
  const { markReady, markFailed } = await import('./boot-state.js');
  const { default: app } = await import('./app.js');
  const { listen } = await import('./listen.js');

  // מדידה פר-שלב, כמו ב-server.js: בלעדיה "העמדה לא עולה" הוא דיווח שאי אפשר
  // לעשות איתו דבר, ועם שרשרת של ארבעה שלבים כבדים זה בדיוק מה שקורה.
  const t0 = Date.now();
  const timed = async (label, fn) => {
    const t = Date.now();
    const r = await fn();
    console.log(`[local] ${label} — ${Date.now() - t}ms`);
    return r;
  };
  try {
    await timed('initDb', initDb);
    await timed('seedDb', seedDb);
    await timed('syncAllEnvSchemas', syncAllEnvSchemas);
    markReady();
  } catch (err) {
    markFailed(err);
    console.error('[local] עליית המאגר המקומי נכשלה:', err.message);
    throw err;
  }

  const server = await listen(app, port, host);
  const actual = server.address().port;
  console.log(`[local] המאגר המקומי מוכן תוך ${Date.now() - t0}ms — http://${host}:${actual} (סוד: ${secretSource})`);

  return {
    url: `http://${host}:${actual}`,
    port: actual,
    dataDir,
    close: () => new Promise(r => server.close(() => r())),
  };
}

// ── הרצה כתהליך בן של Electron ────────────────────────────────────────────────
// מודיע להורה את הפורט דרך IPC כשיש (fork), ומדפיס אותו גם ל-stdout כדי
// שאפשר יהיה להריץ ידנית לאבחון: `node server/local.js`.
const isDirectRun = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isDirectRun) {
  startLocalServer()
    .then(({ url, port, dataDir }) => {
      console.log(`SKY-KING local API on ${url} · מאגר: ${dataDir}`);
      process.send?.({ type: 'local-api-ready', port, url, dataDir });
    })
    .catch(err => {
      console.error('[local] כשל בעליית השרת המקומי:', err);
      process.send?.({ type: 'local-api-failed', error: String(err?.message || err) });
      process.exit(1);
    });
}
