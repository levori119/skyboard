// עמדה אמיתית על המחשב הזה - עם מאגר מקומי, לפיתוח ולבדיקה.
//
// **למה זה נחוץ, ולמה בלעדיו "נתק" לא עובד:** ב-`npm run dev` הדפדפן מדבר
// ישירות עם שרת ה-API דרך ה-proxy של Vite. אין שרת עמדה, אין מאגר מקומי,
// ואין לאן לכתוב כשמנתקים - ולכן כפתור הנתק מגיע למצב "צפייה בלבד": ההעברות
// נחסמות, והערה וגובה פשוט לא נשמרים. זה בדיוק מה שדווח.
//
// כאן מורמת העמדה כפי שהיא בשדה:
//
//   דפדפן ──> שרת העמדה ──┬──> שרת ה-API המרכזי  (כשיש קשר)
//                          └──> server/local.js + PGlite  (בנתק)
//
// הרצה:
//   חלון 1:  npm run dev        (שרת ה-API + Vite)
//   חלון 2:  npm run station    (העמדה)
//   ואז לפתוח את הכתובת שמודפסת כאן - **לא** את 5000.
//
// דגלים: --port · --api=<url> · --vite=<url> · --dist (להגיש build במקום Vite)

import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import { existsSync } from 'fs';
import { hostname } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createStationServer } = require('../electron/stationServer.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const PORT = Number(arg('port', process.env.SKYKING_STATION_PORT || 5100));
const API = arg('api', process.env.SKYKING_API_TARGET || `http://127.0.0.1:${process.env.PORT || 3001}`);
const VITE = arg('vite', process.env.SKYKING_VITE_URL || 'http://127.0.0.1:5000');
const STATION_KEY = arg('station', process.env.SKYKING_STATION_KEY || hostname());

/**
 * מרים את המאגר המקומי כתהליך בן.
 *
 * תהליך נפרד ולא כאן: PGlite הוא WASM ו-`initDb` עליו לוקח שניות ארוכות.
 * בתהליך אחד הוא היה חוסם את שרת העמדה בדיוק כשהדפדפן מנסה להיטען.
 */
function startLocalDb() {
  const state = { url: null };
  // המקור כשיש ריפו, ואחרת ה-bundle שנבנה ב-`npm run build:local-server` -
  // כך אותו סקריפט משמש גם עותק ארוז בלי `server/`.
  const entry = [
    path.join(ROOT, 'server', 'local.js'),
    path.join(ROOT, 'electron', 'local-server.mjs'),
  ].find(p => existsSync(p));
  if (!entry) {
    console.error('[station] אין שרת מקומי - הרץ `npm run build:local-server` או עבוד מתוך הריפו');
    return { state, child: { kill() {}, on() {} } };
  }
  const child = fork(entry, [], {
    cwd: ROOT,
    env: {
      ...process.env,
      SKYKING_LOCAL_DB: '1',
      SKYKING_STATION_KEY: STATION_KEY,
      SKYKING_LOCAL_DB_DIR: arg('db', path.join(ROOT, '.skyking-local-db')),
    },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  child.on('message', msg => {
    if (msg?.type === 'local-api-ready') {
      state.url = msg.url;
      console.log(`\n[station] ✅ המאגר המקומי מוכן: ${msg.url}\n          ${msg.dataDir}\n`);
    }
    if (msg?.type === 'local-api-failed') {
      console.error(`[station] ❌ המאגר המקומי לא עלה: ${msg.error}`);
      console.error('[station]    הנתק יעבוד בצפייה בלבד.');
    }
  });
  child.on('exit', code => {
    state.url = null;
    if (code) console.error(`[station] תהליך המאגר המקומי הסתיים (${code})`);
  });
  return { state, child };
}

const { state: localDb, child } = startLocalDb();

const station = await createStationServer({
  distDir: path.join(ROOT, 'dist'),
  apiTarget: API,
  // בלי --dist הנכסים מגיעים מ-Vite, ולכן אין צורך ב-build אחרי כל שינוי
  staticTarget: flag('dist') ? null : VITE,
  localApiTarget: () => localDb.url,
  port: PORT,
  // בפיתוח הדף נפתח גם מ-5000 (Vite) וגם מהסוכן עצמו; שניהם לוקלהוסט
  // ולכן מותרים ממילא. הדגל קיים כדי לבדוק פריסה עם כתובת אמיתית.
  allowedOrigins: (arg('origins', '') || '').split(',').map(s => s.trim()).filter(Boolean),
});

console.log(`
┌─ SKY-KING · עמדה מקומית ─────────────────────────────────────────
│  פתח בדפדפן:   ${station.url}
│  API מרכזי:     ${API}
│  נכסים:         ${flag('dist') ? `${path.join(ROOT, 'dist')} (build)` : `${VITE} (Vite)`}
│  מפתח עמדה:     ${STATION_KEY}
│
│  כפתור הנתק בפינה השמאלית התחתונה מנתק **את העמדה הזו בלבד**.
│  עמדה שנייה: npm run station -- --port=5101 --station=twr-2
└──────────────────────────────────────────────────────────────────
`);

const shutdown = async () => {
  try { child.kill(); } catch { /* כבר מת */ }
  await station.close().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
