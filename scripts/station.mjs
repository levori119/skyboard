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
//        --token=<אסימון עמדה> - מדליק את שירות המראה ברקע · --env=<מספר סביבה>
//        --config=<קובץ> · --log=<קובץ>  (ראה scripts/station-service.ps1)

import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import { existsSync, readFileSync, appendFileSync, mkdirSync, statSync, renameSync } from 'fs';
import { hostname } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createStationServer } = require('../electron/stationServer.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const rawArg = (name) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const flag = (name) => process.argv.includes(`--${name}`);

/**
 * תצורה מקובץ, לסוכן שרץ כשירות.
 *
 * ⚠️ **האסימון אינו נכנס לשורת הפקודה.** משימה מתוזמנת ב-Windows חושפת את
 * שורת הפקודה שלה לכל משתמש מקומי (`schtasks /query /v`), ואסימון עמדה שם
 * הוא סוד שדולף בלי שאיש ישים לב. הקובץ הזה נוצר עם ACL מצומצם
 * (scripts/station-service.ps1), והוא **מחוץ לגיט**.
 *
 * סדר הקדימויות: דגל בשורת הפקודה → קובץ התצורה → משתנה סביבה → ברירת מחדל.
 */
const CONFIG_PATH = rawArg('config')
  || process.env.SKYKING_STATION_CONFIG
  || path.join(ROOT, 'station-agent.json');

let fileCfg = {};
if (existsSync(CONFIG_PATH)) {
  try {
    fileCfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) || {};
  } catch (err) {
    // ⚠️ **נופלים, ולא ממשיכים בלי תצורה.** קובץ פגום פירושו סוכן בלי אסימון
    // ובלי לוג - כלומר עמדה שעולה, נראית תקינה, והמאגר המקומי שלה לעולם לא
    // מתמלא. כשירות ברקע אין מי שיראה את ההודעה על stdout, ולכן דווקא כאן
    // עדיף למות: מדיניות ההתאוששות של המשימה תנסה שוב, ו-`-Status` יצעק.
    // (נתיב Windows ב-JSON בלי escape הוא הדרך הקלה להגיע לזה.)
    console.error(`[station] קובץ התצורה ${CONFIG_PATH} אינו תקין: ${err.message}`);
    console.error('[station] עצירה. לתקן את הקובץ, או להריץ מחדש את station-service.ps1 -Install');
    process.exit(1);
  }
}

const arg = (name, fallback) => {
  const cli = rawArg(name);
  if (cli !== undefined) return cli;
  if (fileCfg[name] !== undefined && fileCfg[name] !== '') return String(fileCfg[name]);
  return fallback;
};

// ── לוג לקובץ ────────────────────────────────────────────────────────────────
// שירות שרץ ברקע בלי חלון: בלי לוג, "הסוכן לא עובד" הוא דיווח שאי אפשר לעשות
// איתו דבר. סיבוב פשוט בגודל, כדי שקובץ אחד לא יגדל בלי גבול על עמדה.
const LOG_PATH = arg('log', process.env.SKYKING_STATION_LOG || '');
const LOG_MAX_BYTES = 5 * 1024 * 1024;

if (LOG_PATH) {
  try {
    mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    try {
      if (statSync(LOG_PATH).size > LOG_MAX_BYTES) renameSync(LOG_PATH, `${LOG_PATH}.1`);
    } catch { /* אין קובץ עדיין */ }
    const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
    const write = (level, args) => {
      const line = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ');
      try { appendFileSync(LOG_PATH, `${stamp()} ${level} ${line}
`); } catch { /* דיסק מלא */ }
    };
    const origLog = console.log.bind(console);
    const origErr = console.error.bind(console);
    console.log = (...a) => { origLog(...a); write('INFO', a); };
    console.error = (...a) => { origErr(...a); write('ERR ', a); };
    console.log(`[station] לוג: ${LOG_PATH}`);
  } catch (err) {
    console.error(`[station] לא ניתן לכתוב ללוג ${LOG_PATH}: ${err.message}`);
  }
}

const PORT = Number(arg('port', process.env.SKYKING_STATION_PORT || 5100));
const API = arg('api', process.env.SKYKING_API_TARGET || `http://127.0.0.1:${process.env.PORT || 3001}`);
const VITE = arg('vite', process.env.SKYKING_VITE_URL || 'http://127.0.0.1:5000');
const STATION_KEY = arg('station', process.env.SKYKING_STATION_KEY || hostname());

// כשל שלא נתפס בשירות ברקע = תהליך שמת בשקט. לפחות שיישאר עקבות בלוג.
process.on('uncaughtException', err => { console.error('[station] כשל לא נתפס:', err?.stack || err); process.exit(1); });
process.on('unhandledRejection', err => { console.error('[station] דחייה לא מטופלת:', err?.stack || err); });

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
      // שירות המראה בתוך תהליך המאגר. בלי אסימון עמדה הוא אינו נדלק.
      SKYKING_CENTRAL_URL: API,
      SKYKING_STATION_TOKEN: arg('token', process.env.SKYKING_STATION_TOKEN || ''),
      SKYKING_STATION_ENV: arg('env', process.env.SKYKING_STATION_ENV || '1'),
    },
    // ⚠️ **`pipe` ולא `inherit` כשיש לוג.** התהליך הבן (המאגר המקומי ושירות
    // המראה) כותב ישירות ל-fd של ההורה, ולכן `inherit` עוקף את ה-console
    // המפונה ללוג - וכל שורות ה-`[mirror]` **חסרות מקובץ הלוג**. בשירות
    // שרץ ברקע בלי חלון, זה בדיוק המידע היחיד שיש.
    stdio: ['ignore', LOG_PATH ? 'pipe' : 'inherit', LOG_PATH ? 'pipe' : 'inherit', 'ipc'],
  });
  if (LOG_PATH) {
    const NEWLINE_RE = new RegExp('\r?\n');
    const relay = (stream) => {
      let buf = '';
      stream.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split(NEWLINE_RE);
        buf = lines.pop() || '';
        for (const line of lines) if (line.trim()) console.log(line);
      });
    };
    relay(child.stdout);
    relay(child.stderr);
  }
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

// מאיפה תגיע האפליקציה, ולאן לפתוח בפועל. ההבחנה הזו נולדה מתקלה: סוכן
// שהורם בלי `--dist` הפנה את הדפדפן ל-Vite שלא רץ, והמפעיל קיבל
// `ECONNREFUSED 127.0.0.1:5000` במקום אפליקציה.
const hasDist = existsSync(path.join(ROOT, 'dist', 'index.html'));
const assets = flag('dist')
  ? `${path.join(ROOT, 'dist')} (build)`
  : `${VITE} (Vite)${hasDist ? ' · נפילה אחורה ל-dist' : ' · אם אינו רץ - הפניה למרכז'}`;
const openAt = flag('dist') || hasDist ? station.url : API;

console.log(`
┌─ SKY-KING · עמדה מקומית ─────────────────────────────────────────
│  פתח בדפדפן:   ${openAt}
│  הסוכן:         ${station.url}
│  API מרכזי:     ${API}
│  נכסים:         ${assets}
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
