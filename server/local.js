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
import { hostname } from 'node:os';

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

let stopMirror = () => {};

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
    // ⚠️ **נתוני אתחול מדולגים בעמדה, בכוונה.** `seedDb` יוצר סקטורים, עמדות
    // ומצבי תצוגה עם מזהים משלו, והמראה מביאה את אותם דברים מהמרכז עם מזהים
    // אחרים - כלומר שתי מערכות סקטורים על אותו מסך, ואיש לא יבין מאיפה
    // הגיעה השנייה. תמונת המצב של העמדה מגיעה **רק** מהמרכז.
    // `SKYKING_LOCAL_SEED=1` מחזיר את הזריעה, לעמדה עצמאית בלי מרכז כלל.
    if (process.env.SKYKING_LOCAL_SEED === '1') await timed('seedDb', seedDb);
    else console.log('[local] seedDb דולג - תמונת המצב מגיעה מהמראה של המרכז');
    await timed('syncAllEnvSchemas', syncAllEnvSchemas);
    // אסמכתאות הכניסה בנתק — טבלה של העמדה בלבד, ולכן היא נוצרת כאן ולא
    // ב-initDb המשותף: למאגר המרכזי אין צורך בטביעות סיסמה, ועמודה כזו שם
    // היא משטח תקיפה בלי תמורה.
    await timed('אסמכתאות מקומיות', async () => {
      const { default: pool } = await import('./db/pool.js');
      const { ensureLocalCredentialsTable, purgeExpiredCredentials } = await import('./auth/localCredentials.js');
      await ensureLocalCredentialsTable(pool);
      const purged = await purgeExpiredCredentials(pool);
      if (purged) console.log(`[local] ${purged} אסמכתאות שפג תוקפן נמחקו`);
    });
    // יומן הסנכרון וטווח המזהים — **אחרי** initDb ו-seedDb, ובכוונה:
    //   · הטריגר מוקלט מרגע התקנתו, ונתוני האתחול אינם עבודה של מפעיל שצריך
    //     לדחוף למרכז. התקנה מוקדמת הייתה מייצרת תור סנכרון מלא בזבל בעלייה.
    //   · הזזת הרצפים אחרי ה-seed משאירה לנתוני האתחול מזהים רגילים, וכך רק
    //     מה שנולד **בעמדה** נושא מזהה מהטווח המקומי.
    await timed('יומן סנכרון מקומי', async () => {
      const { default: pool } = await import('./db/pool.js');
      const { syncJournalDdl, syncFunctionDdl, installSyncTriggersDdl } = await import('./db/syncJournal.js');
      const { applyLocalIdRange, localIdStart } = await import('./db/localIds.js');

      for (const sql of syncJournalDdl()) await pool.query(sql);
      await pool.query(syncFunctionDdl());

      // גם בסכמות התרגול: עמדה שמתנתקת באמצע תרגול צריכה לסנכרן חזרה בדיוק
      // כמו בסביבה טסה. בלי זה תרגול היה עובד בנתק ואובד בשקט.
      const { rows: schemas } = await pool.query(
        `SELECT nspname FROM pg_namespace WHERE nspname = 'public' OR nspname LIKE 'env\\_%'`);
      for (const { nspname } of schemas) {
        for (const sql of installSyncTriggersDdl(nspname)) {
          try { await pool.query(sql); } catch { /* טבלה שאינה בסכמה הזו */ }
        }
      }

      const key = process.env.SKYKING_STATION_KEY || hostname();
      const moved = await applyLocalIdRange(pool, key);
      console.log(`[local] טווח מזהים מקומי מ-${localIdStart(key)} (${moved} רצפים הוזזו)`);
    });
    // ── שירות המראה ────────────────────────────────────────────────────────
    // רץ **בתוך התהליך הזה** ולא כאפליקציה נפרדת: PGlite נועל את תיקיית
    // המאגר, ותהליך שני לא יכול לפתוח אותה. זו דווקא הקלה - הצד המקומי הוא
    // קריאת DB ישירה, ורק הצד המרכזי הוא HTTP.
    //
    // כבוי עד שמגדירים `SKYKING_CENTRAL_URL` ו-`SKYKING_STATION_TOKEN`.
    await timed('שירות המראה', async () => {
      const { default: pool } = await import('./db/pool.js');
      const { startMirrorDaemon } = await import('./sync/daemon.js');
      const { protectedKeys } = await import('./routes/sync.js');
      stopMirror = startMirrorDaemon({
        central: (process.env.SKYKING_CENTRAL_URL || '').trim(),
        token: (process.env.SKYKING_STATION_TOKEN || '').trim(),
        stationKey: process.env.SKYKING_STATION_KEY || hostname(),
        env: process.env.SKYKING_STATION_ENV || '1',
        pool,
        protectedKeys,
      });
    });
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
    close: () => new Promise(r => { stopMirror(); server.close(() => r()); }),
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
