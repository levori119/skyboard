const { app, BrowserWindow, dialog, shell, ipcMain, session, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { resolveSttPaths, sttStatus, transcribeWav } = require('./electron/whisper.cjs');
const { createStationServer } = require('./electron/stationServer.cjs');
const { createScreenRecorder } = require('./electron/screenRecorder.cjs');

const isDev = !app.isPackaged;

// ── יעד העמדה ────────────────────────────────────────────────────────────────
// שלושה מצבים, לפי מה שנארז בגרסה:
//
//   bundled — ⭐ **המצב לרשת מבודדת (נתיב רקיע).** ה-dist ארוז בתוך העמדה
//             ומוגש משרת מקומי זעיר (electron/stationServer.cjs) שמפרוקסס את
//             /api לשרת האמיתי. כשכבל הרשת מנותק האפליקציה עדיין עולה,
//             ושכבת ה-offline בלקוח מגישה את המידע האחרון מ-IndexedDB.
//   local   — legacy: שרת Express מלא בתוך העמדה (דורש DATABASE_URL).
//   remote  — לקוח דק: גם ה-HTML נטען מהשרת. **אינו שורד נתק** — אין מה לטעון.
//
// סדר קדימויות:
//   1. SKYKING_STATION_URL   (משתנה סביבה - גובר על הכל, נוח לבדיקות)
//      (לא SKYKING_URL - זה כבר משמש את מיראז' ככתובת ה-API של SKY-KING)
//   2. config.json → mode: "local"    (שרת מקומי מלא, legacy)
//   3. config.json → mode: "bundled"  (או זיהוי אוטומטי: יש dist ואין server.js)
//   4. config.json → APP_URL          (כתובת אחרת לעמדה, בלי בנייה מחדש)
//   5. פיתוח → vite מקומי | הפצה → DEFAULT_APP_URL
const DEFAULT_APP_URL = 'https://sky-king.up.railway.app/';
const DEV_APP_URL = 'http://localhost:5000';

const distDir = () => path.join(__dirname, 'dist');

/**
 * גרסת "עמדה עצמאית": ה-dist ארוז אך אין server.js. זהו הסימן החד-משמעי
 * שהגרסה נבנתה עם electron-builder.station.json, ולכן אין צורך בדגל ידני.
 */
function hasBundledApp() {
  try {
    return fs.existsSync(path.join(distDir(), 'index.html'))
      && !fs.existsSync(path.join(__dirname, 'server.js'));
  } catch {
    return false;
  }
}

const STATUS_PAGE = path.join(__dirname, 'electron-status.html');

// השהיית ניסיון חוזר: 2, 4, 8, 16, 30 שניות (Railway יכול להתעורר לאט)
const RETRY_STEPS_MS = [2000, 4000, 8000, 16000, 30000];

let mainWindow = null;
let target = null;
let retryTimer = null;
let attempt = 0;
let stationServer = null;
let screenRecorder = null;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
  try {
    const p = configPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
  } catch (e) {
    console.error('[config] קריאת config.json נכשלה:', e.message);
    return {};
  }
}

// בהתקנה חדשה נוצר config.json עם הכתובת, כדי שאפשר יהיה להפנות עמדה
// לכתובת אחרת (סביבת בדיקות / שרת פנימי) בלי לבנות מחדש.
function writeConfigTemplate(extra) {
  try {
    const p = configPath();
    if (fs.existsSync(p)) return;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(extra, null, 2), 'utf8');
  } catch (e) {
    console.error('[config] יצירת config.json נכשלה:', e.message);
  }
}

function writeRemoteConfigTemplate() {
  writeConfigTemplate({
    _readme: 'APP_URL - הכתובת שהעמדה טוענת. mode: "local" מריץ שרת מקומי במקום (דורש DATABASE_URL).',
    APP_URL: DEFAULT_APP_URL
  });
}

function writeBundledConfigTemplate() {
  writeConfigTemplate({
    _readme: 'עמדה עצמאית: האפליקציה ארוזה בעמדה. API_URL - כתובת שרת SKY-KING ברשת. ' +
      'בנתק העמדה ממשיכה לעבוד על המידע האחרון ששמרה. ' +
      'AGENT: true - העמדה רצה בלי חלון והפקח פותח אותה בדפדפן (כתובת 127.0.0.1 ו-STATION_PORT). ' +
      'LOCAL_DB: false - כיבוי המאגר המקומי; נתק יאפשר צפייה בלבד.',
    mode: 'bundled',
    API_URL: DEFAULT_APP_URL,
    STATION_PORT: DEFAULT_STATION_PORT,
    AGENT: false
  });
}

function resolveTarget() {
  const envUrl = (process.env.SKYKING_STATION_URL || '').trim();
  if (envUrl) return { mode: 'remote', url: envUrl, cfg: {} };

  const cfg = isDev ? {} : readConfig();

  if (process.env.SKYKING_MODE === 'local' || cfg.mode === 'local') {
    return { mode: 'local', url: null, cfg };
  }

  // עמדה עצמאית — מזוהה מהאריזה עצמה, כדי שלא תלויה בקובץ הגדרות שנשכח.
  // `mode: "remote"` בקובץ ההגדרות עוקף במפורש (לצורכי אבחון).
  const wantsBundled = process.env.SKYKING_MODE === 'bundled' || cfg.mode === 'bundled'
    || (!isDev && cfg.mode !== 'remote' && hasBundledApp());
  if (wantsBundled) {
    const apiTarget = (typeof cfg.API_URL === 'string' && cfg.API_URL.trim())
      || (typeof cfg.APP_URL === 'string' && cfg.APP_URL.trim())
      || DEFAULT_APP_URL;
    writeBundledConfigTemplate();
    // תמונ"א: כתובת המאגר נקראת מ-config.json של העמדה (או ממשתנה סביבה),
    // ולא מ-SKY-KING. כשהיא מוגדרת, שרת העמדה פונה למאגר **ישירות** - זו
    // הדרישה "חיבור ישיר לעמדה בלי מאגר SKY-KING". הטוקן נשאר כאן ולא מגיע
    // ל-renderer. בלי כתובת, הבקשה מרולה דרך SKY-KING כמסלול גיבוי.
    const airPictureTarget = (process.env.SKYKING_AIR_PICTURE_URL || '').trim()
      || (typeof cfg.AIR_PICTURE_URL === 'string' ? cfg.AIR_PICTURE_URL.trim() : '')
      || null;
    const airPictureToken = (process.env.SKYKING_AIR_PICTURE_TOKEN || '').trim()
      || (typeof cfg.AIR_PICTURE_TOKEN === 'string' ? cfg.AIR_PICTURE_TOKEN.trim() : '')
      || null;
    return { mode: 'bundled', url: null, apiTarget, airPictureTarget, airPictureToken, cfg };
  }

  const cfgUrl = typeof cfg.APP_URL === 'string' ? cfg.APP_URL.trim() : '';
  if (cfgUrl) return { mode: 'remote', url: cfgUrl, cfg };

  if (isDev) return { mode: 'remote', url: DEV_APP_URL, cfg };

  writeRemoteConfigTemplate();
  return { mode: 'remote', url: DEFAULT_APP_URL, cfg };
}

// ── המאגר המקומי בעמדה (PGlite) ───────────────────────────────────────────────
// זה מה שהופך עמדה מנותקת מ"מסך צפייה" ל"עמדה עובדת": אותו Express, אותם
// endpoints, מול מאגר שיושב בעמדה עצמה (server/local.js).
//
// **תהליך בן ולא באותו תהליך**: initDb על PGlite לוקח שניות ארוכות, ו-WASM
// שרץ בתהליך ה-main של Electron היה מקפיא את חלון העמדה בזמן העלייה. התהליך
// הבן מודיע על עצמו ב-IPC ברגע שהוא מוכן.
//
// כיבוי מכוון: `"LOCAL_DB": false` בקובץ התצורה של העמדה. הפעולה היחידה שהוא
// מונע היא עבודה בנתק - הצפייה מה-cache ממשיכה לעבוד גם בלעדיו.
const localDb = { url: null, child: null };

/**
 * איפה יושב שרת ה-API המקומי, לפי איך שהעמדה מורצת.
 *
 * שתי צורות, ובכוונה:
 *   · **התקנה** - `electron/local-server.mjs`, קובץ אחד שנארז ב-build
 *     (scripts/build-local-server.mjs). זה מה שמגיע לעמדה בשטח.
 *   · **ריפו** - `server/local.js` המקורי, כדי שפיתוח לא ידרוש bundling בכל
 *     שינוי בשרת.
 *
 * ⚠️ **§asar.** התהליך הבן הוא Node רגיל ואינו יודע לקרוא מתוך `app.asar`.
 * לכן ה-bundle ו-PGlite מוצאים מה-asar (`asarUnpack`), וכאן מתורגם הנתיב.
 * בלי התרגום ה-fork נופל ב-ENOENT, `localDb.url` נשאר null, והעמדה חוזרת
 * בשקט להיות מסך צפייה - בדיוק הכשל שהסתיר את הפיצ'ר עד כה.
 */
function localServerEntry() {
  const unpacked = __dirname.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const candidates = [
    path.join(unpacked, 'electron', 'local-server.mjs'),
    path.join(__dirname, 'electron', 'local-server.mjs'),
    path.join(__dirname, 'server', 'local.js'),
  ];
  return candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

function startLocalDbServer(cfg) {
  if (cfg && cfg.LOCAL_DB === false) return;
  const entry = localServerEntry();
  if (!entry) {
    console.warn('[station] אין שרת מקומי ארוז - נתק יאפשר צפייה בלבד');
    return;
  }

  try {
    const { fork } = require('child_process');
    localDb.child = fork(entry, [], {
      env: {
        ...process.env,
        SKYKING_LOCAL_DB: '1',
        // מזהה העמדה קובע את גוש המזהים המקומי (server/db/localIds.js). בלעדיו
        // שתי עמדות שמנותקות בו-זמנית עלולות לחלק את אותו `id` לשני פ"מים.
        SKYKING_STATION_KEY: (cfg && cfg.STATION_KEY) || require('os').hostname(),
        SKYKING_LOCAL_DB_DIR: (cfg && cfg.LOCAL_DB_DIR)
          || path.join(app.getPath('userData'), 'local-db'),
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    localDb.child.on('message', msg => {
      if (msg && msg.type === 'local-api-ready') {
        localDb.url = msg.url;
        console.log(`[station] המאגר המקומי מוכן: ${msg.url} · ${msg.dataDir}`);
      }
      if (msg && msg.type === 'local-api-failed') {
        console.error('[station] המאגר המקומי לא עלה:', msg.error);
      }
    });
    // מוות של התהליך הבן אינו מפיל את העמדה - הוא רק מחזיר אותה למצב שבו
    // נתק פירושו צפייה בלבד. `url = null` מחזיר את הנתב למרכז.
    localDb.child.on('exit', code => {
      localDb.url = null;
      localDb.child = null;
      if (code) console.error(`[station] תהליך המאגר המקומי הסתיים (${code})`);
    });
  } catch (err) {
    console.error('[station] לא ניתן להפעיל את המאגר המקומי:', err.message);
  }
}

// ── מצב legacy: שרת מקומי בתוך העמדה ─────────────────────────────────────────
// נשמר למי שמריץ בלי ענן. לא נדרש במצב הרגיל (לקוח מרוחק).
async function startLocalServer(cfg) {
  if (isDev) return `http://localhost:${process.env.PORT || 3001}`;

  const p = configPath();

  if (!fs.existsSync(path.join(__dirname, 'server.js'))) {
    dialog.showErrorBox('SKY KING - מצב לא נתמך',
      'גרסת עמדה זו היא לקוח מרוחק בלבד ואינה כוללת שרת מקומי.\n' +
      `הסר את mode: "local" מהקובץ:\n${p}`);
    return null;
  }

  if (cfg.DATABASE_URL) process.env.DATABASE_URL = cfg.DATABASE_URL;
  if (cfg.PORT) process.env.PORT = String(cfg.PORT);

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('user:password')) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'SKY KING - שגיאת הגדרות',
      buttons: ['אישור'],
      message: 'DATABASE_URL לא הוגדר.',
      detail: `יש לערוך את הקובץ:\n${p}\n\nולהגדיר DATABASE_URL תקין.`
    });
    shell.openPath(p);
    return null;
  }

  process.env.PORT = process.env.PORT || '3001';
  process.env.NODE_ENV = 'production';

  try {
    await import('./server.js');
  } catch (err) {
    dialog.showErrorBox('SKY KING - שגיאת שרת', `השרת לא הצליח לעלות:\n${err.message}`);
    return null;
  }

  await new Promise(resolve => setTimeout(resolve, 1200));
  return `http://localhost:${process.env.PORT}`;
}

// ── מסך מצב מקומי (מתחבר / אין חיבור) ────────────────────────────────────────
// בעמדה אין שורת כתובת ואין טאבים, ולכן כשל רשת חייב להיראות על המסך -
// לא מסך לבן ריק.
function showStatus(state, info) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const search = new URLSearchParams(Object.assign({ state }, info)).toString();
  mainWindow.loadFile(STATUS_PAGE, { search: `?${search}` }).catch(() => {});
}

function loadTarget() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearTimeout(retryTimer);
  retryTimer = null;
  mainWindow.loadURL(target.url).catch(() => {});
}

function scheduleRetry(reason) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearTimeout(retryTimer);
  const delayMs = RETRY_STEPS_MS[Math.min(attempt, RETRY_STEPS_MS.length - 1)];
  attempt += 1;
  showStatus('offline', {
    attempt: String(attempt),
    delay: String(Math.round(delayMs / 1000)),
    url: target.url,
    reason: reason || ''
  });
  retryTimer = setTimeout(loadTarget, delayMs);
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// ── תמלול קולי מקומי ─────────────────────────────────────────────────────────
// ה-Web Speech API לא עובד ב-Electron (נשען על שירות ענן של גוגל שהמפתחות אליו
// קומפלו רק לתוך Chrome), ולכן העמדה מתמללת בעצמה עם whisper.cpp. האודיו לא
// עוזב את העמדה. ראה electron/whisper.cjs.
function sttPaths() {
  return resolveSttPaths({
    isDev,
    appDir: __dirname,
    resourcesPath: process.resourcesPath,
    cfg: (target && target.cfg) || {},
  });
}

// העמוד נטען מכתובת מרוחקת, ולכן כל קריאת IPC מאומתת מול ה-origin של האפליקציה.
// גם אם מישהו יצליח להריץ קוד בעמוד אחר בחלון - הוא לא יגיע למנוע.
function senderAllowed(event) {
  if (!target) return false;
  const appOrigin = originOf(target.url);
  let senderUrl = '';
  try {
    senderUrl = event.senderFrame ? event.senderFrame.url : '';
  } catch {
    return false;   // ה-frame כבר נהרס
  }
  return !!appOrigin && originOf(senderUrl) === appOrigin;
}

// בסיס ה-API שלה התהליך הראשי פונה בעצמו (קריאת תצורת ההקלטה).
// במצב bundled זה שרת העמדה המקומי, שממילא מפרוקסס את /api לשרת האמיתי -
// ולכן אותה כתובת עובדת בשלושת המצבים בלי הפרדה.
function apiBase() {
  return (target && target.url) || DEFAULT_APP_URL;
}

/**
 * הקלטת פעולות במסך - חמשת הערוצים. כל אחד מתודה אחת
 * וללא נתיב בפרמטרים - הנתיב נשאב מהשרת בתוך screenRecorder.cjs.
 */
function registerRecordingHandlers() {
  screenRecorder = createScreenRecorder({ apiBase });

  ipcMain.handle('rec:status', (event) => {
    if (!senderAllowed(event)) return { available: false, reason: 'forbidden' };
    return screenRecorder.status();
  });

  ipcMain.handle('rec:start', async (event, opts) => {
    if (!senderAllowed(event)) return { ok: false, reason: 'forbidden' };
    const o = opts && typeof opts === 'object' ? opts : {};
    return screenRecorder.start({
      baseId: Number(o.baseId) || 0,
      presetName: typeof o.presetName === 'string' ? o.presetName : '',
      token: typeof o.token === 'string' ? o.token : '',
      ext: o.ext === 'mp4' ? 'mp4' : 'webm',
      manual: Boolean(o.manual),
    });
  });

  ipcMain.handle('rec:chunk', async (event, data) => {
    if (!senderAllowed(event)) return { ok: false, reason: 'forbidden' };
    return screenRecorder.chunk(data);
  });

  ipcMain.handle('rec:rotate', async (event) => {
    if (!senderAllowed(event)) return { ok: false, reason: 'forbidden' };
    return screenRecorder.rotate();
  });

  ipcMain.handle('rec:keep', async (event) => {
    if (!senderAllowed(event)) return { ok: false, reason: 'forbidden' };
    return screenRecorder.keep();
  });

  ipcMain.handle('rec:stop', async (event) => {
    if (!senderAllowed(event)) return { ok: false, reason: 'forbidden' };
    return screenRecorder.stop();
  });
}

function registerSttHandlers() {
  ipcMain.handle('stt:available', (event) => {
    if (!senderAllowed(event)) return { ok: false, code: 'stt-forbidden' };
    return sttStatus(sttPaths());
  });

  ipcMain.handle('stt:transcribe', async (event, wavBase64) => {
    if (!senderAllowed(event)) return { ok: false, code: 'stt-forbidden' };
    if (typeof wavBase64 !== 'string' || !wavBase64) return { ok: false, code: 'stt-failed' };
    const wav = Buffer.from(wavBase64, 'base64');
    // רשת ביטחון: הקלטה תקינה חסומה ל-15 שניות (ראה speech.ts), כלומר ~480KB.
    if (wav.length < 45 || wav.length > 4 * 1024 * 1024) return { ok: false, code: 'stt-failed' };
    return transcribeWav(wav, sttPaths());
  });
}

// ── פורט העמדה ומצב סוכן ─────────────────────────────────────────────────────
// **הפורט קבוע, וזה לא קוסמטיקה.** ה-cache בנתק יושב ב-IndexedDB, והוא משויך
// ל-origin. פורט אקראי בכל הפעלה פירושו origin חדש בכל הפעלה, כלומר עמדה
// שמאבדת את כל המידע השמור שלה בכל הדלקה מחדש - בדיוק כשהוא הכי נחוץ.
const DEFAULT_STATION_PORT = 5100;

const stationPort = (cfg) => Number(
  process.env.SKYKING_STATION_PORT || (cfg && cfg.STATION_PORT) || DEFAULT_STATION_PORT);

/**
 * מצב סוכן: העמדה רצה **בלי חלון**, ומי שפותח אותה הוא הדפדפן שעל המחשב.
 *
 * למה: עמדה שעולה ב-WEB אינה יכולה להחזיק מאגר מקומי - אין בדפדפן תהליך Node
 * להריץ בו את PGlite ואת 457 ה-endpoints. הסוכן הוא אותה עמדה **בדיוק** (אותו
 * stationServer, אותו server/local.js, אותו נתב) רק בלי ה-kiosk: הפקח פותח
 * את הכתובת בכרום ומקבל את המאגר שעל המחשב שלו.
 *
 * לכן זו אינה עמדה שנייה לתחזק אלא דגל אחד: `"AGENT": true` ב-config.json
 * של העמדה, או `SKYKING_AGENT=1`.
 */
const isAgentMode = (cfg) => process.env.SKYKING_AGENT === '1' || !!(cfg && cfg.AGENT === true);

async function createWindow() {
  target = resolveTarget();

  if (target.mode === 'local') {
    const url = await startLocalServer(target.cfg);
    if (!url) {
      app.quit();
      return;
    }
    target = { mode: 'local', url, cfg: target.cfg };
  }

  // עמדה עצמאית: השרת המקומי מגיש את ה-dist ומפרוקסס את /api. אם הוא לא עולה
  // (פורט תפוס וכד') נופלים ללקוח דק — עדיף עמדה שעובדת מול השרת מאשר עמדה
  // שלא עולה בכלל; החיווי בממשק ידווח על אובדן ה-cache.
  if (target.mode === 'bundled') {
    try {
      // המאגר המקומי עולה **ברקע**: הוא לוקח כמה שניות (PGlite + initDb), ואין
      // סיבה להשהות בגללו את חלון העמדה. עד שיהיה מוכן `localApiTarget` מחזיר
      // null, והנתב ממשיך לנתב למרכז - בדיוק ההתנהגות הנכונה.
      startLocalDbServer(target.cfg);
      const station = await createStationServer({
        distDir: distDir(), apiTarget: target.apiTarget,
        airPictureTarget: target.airPictureTarget, airPictureToken: target.airPictureToken,
        localApiTarget: () => localDb.url,
        port: stationPort(target.cfg),
      });
      stationServer = station;
      target = { mode: 'bundled', url: station.url, apiTarget: target.apiTarget, cfg: target.cfg };
      console.log(`[station] עמדה עצמאית: ${station.url} → API ${target.apiTarget}`);
    } catch (err) {
      console.error('[station] שרת העמדה לא עלה, נופלים ללקוח דק:', err.message);
      target = { mode: 'remote', url: target.apiTarget, cfg: target.cfg };
    }
  }

  // ── מצב סוכן: אין חלון, יש עמדה ───────────────────────────────────────────
  // הסוכן מסתיים כאן בכוונה: שרת העמדה והמאגר המקומי כבר רצים, והדפדפן שעל
  // המחשב הוא ה-UI. `agentMode` נבדק **אחרי** הרמת שרת העמדה, כי סוכן בלי
  // שרת עמדה הוא תהליך שלא עושה דבר.
  if (isAgentMode(target.cfg)) {
    if (target.mode !== 'bundled') {
      dialog.showErrorBox('SKY KING - מצב סוכן',
        'מצב סוכן דורש גרסת עמדה עם ה-dist ארוז (electron-builder.station.json).\n' +
        'בגרסת לקוח דק אין מה להגיש לדפדפן.');
      app.quit();
      return;
    }
    console.log(`\n┌─ SKY-KING · סוכן עמדה ─────────────────────────────────\n`
      + `│  פתח בדפדפן:  ${target.url}\n`
      + `│  API מרכזי:    ${target.apiTarget}\n`
      + `│  המאגר המקומי עולה ברקע (כ-15 שניות בהפעלה ראשונה).\n`
      + `└────────────────────────────────────────────────────────\n`);
    return;
  }

  // ── חלון העמדה: kiosk ─────────────────────────────────────────────────────
  // העמדה עולה במסך מלא נעול: בלי שורת כתובת וטאבים, ובלי מסגרת חלון
  // (X / מקסום / מיזעור). גם בפיתוח וגם בגרסת ההפצה - כדי שמה שנבדק הוא
  // מה שרץ בעמדה. הרצה בחלון רגיל לתחזוקה: SKYKING_WINDOWED=1
  const windowed = process.env.SKYKING_WINDOWED === '1';

  // בגרסה הארוזה האייקון יושב במשאבי ה-exe (electron-builder). בפיתוח אין exe
  // כזה, ולכן טוענים ידנית את build/icon.png כדי ששורת המשימות תיראה כמו בעמדה.
  const devIcon = path.join(__dirname, 'build', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'SKY KING - לוח שמיים',
    ...(fs.existsSync(devIcon) ? { icon: devIcon } : {}),
    backgroundColor: '#0b1017',   // בלי הבזק לבן בעלייה בחדר חשוך
    fullscreen: !windowed,
    frame: windowed,      // false = בלי מסגרת חלון כלל
    kiosk: !windowed,     // נועל את המסך המלא (לא ניתן לצאת בטעות)
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // חושף מתודה אחת בלבד לתמלול המקומי (electron-preload.cjs). בלי זה העמוד
      // לא יכול לדבר עם whisper, וזיהוי קולי לא יעבוד בעמדה.
      preload: path.join(__dirname, 'electron-preload.cjs'),
    },
  });

  const wc = mainWindow.webContents;
  const appOrigin = originOf(target.url);

  // ── הרשאות ────────────────────────────────────────────────────────────────
  // ברירת המחדל של Electron היא לאשר הכל. מכאן ואילך מאשרים את אותן הרשאות
  // (כולל מיקרופון, שנדרש לתמלול) אבל **רק** ל-origin של האפליקציה - כל עמוד
  // אחר שיגיע לחלון לא יקבל גישה למיקרופון.
  const permittedFor = (url) => originOf(url) === appOrigin;
  session.defaultSession.setPermissionRequestHandler((contents, _permission, callback) => {
    callback(permittedFor(contents.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, _permission, requestingOrigin) => {
    return requestingOrigin === appOrigin;
  });

  // הקלטת המסך: בורר המקור נענה **אוטומטית** במסך שעליו העמדה.
  // בלי ה-handler הזה getDisplayMedia נכשל ב-Electron, ואיתו בלי useSystemPicker
  // לא נפתח דיאלוג "בחר מה לשתף" - בעמדה תפעולית אין מי שילחץ עליו,
  // והקלטה שממתינה לאישור היא הקלטה שלא קורת.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!permittedFor(request.frame ? request.frame.url : '')) { callback({}); return; }
    desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
      if (!sources.length) { callback({}); return; }
      // הצג שעליו חלון העמדה יושב בפועל, ולא "הראשון שברשימה"
      let pick = sources[0];
      try {
        const b = mainWindow.getBounds();
        const disp = screen.getDisplayNearestPoint({ x: b.x + Math.floor(b.width / 2), y: b.y + Math.floor(b.height / 2) });
        pick = sources.find(src => String(src.display_id) === String(disp.id)) || sources[0];
      } catch { /* מסך בודד - הראשון הוא הנכון */ }
      callback({ video: pick });
    }).catch(() => callback({}));
  }, { useSystemPicker: false });

  // רענון דף או נפילת עמוד משאירים קובץ פתוח ללא מקליט - סוגרים אותו
  // כדי שהקטע יישאר נגין; העמדה מתחילה מחדש כשהדף עולה שוב.
  wc.on('render-process-gone', () => { if (screenRecorder) screenRecorder.stop().catch(() => {}); });
  // רק ניווט של **המסגרת הראשית**. קודם היה כאן `did-start-loading`,
  // שנורה גם על טעינות פנימיות (לעמדה יש iframes - סרגל ההצצה, מפות) -
  // ולכן הקלטה הייתה נעצרת בשקט שניות אחרי שהתחילה, בלי שום הודעה.
  wc.on('did-start-navigation', (details) => {
    if (details && details.isMainFrame === false) return;
    if (screenRecorder) screenRecorder.stop().catch(() => {});
  });

  console.log(`[window] mode=${target.mode} url=${target.url} kiosk=${mainWindow.isKiosk()} frame=${windowed}`);

  const stt = sttStatus(sttPaths());
  console.log(`[stt] ${stt.ok ? 'מנוע התמלול מוכן' : `לא זמין (${stt.code})`} - ${sttPaths().dir}`);

  // קיצורים לתחזוקה בעמדה (אין שורת כתובת, אין X):
  //   F11        - שחרור/החזרה של נעילת המסך המלא
  //   F5 / Ctrl+R - טעינה מחדש של האפליקציה (עובד גם ממסך "אין חיבור")
  //   Ctrl+Shift+I - כלי פיתוח
  wc.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      mainWindow.setKiosk(!mainWindow.isKiosk());
    } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      attempt = 0;
      loadTarget();
    } else if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      wc.toggleDevTools();
    }
  });

  // קישורים חיצוניים (מפות Google וכו') נפתחים בדפדפן המערכת - העמדה עצמה
  // נשארת נעולה על האפליקציה.
  wc.setWindowOpenHandler(({ url }) => {
    if (originOf(url) === appOrigin) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  wc.on('will-navigate', (event, url) => {
    if (originOf(url) === appOrigin) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  wc.on('did-fail-load', (_e, errorCode, errorDesc, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return;                              // ERR_ABORTED - הניווט הוחלף
    if (String(validatedURL).startsWith('file://')) return;    // מסך המצב עצמו
    console.error(`[load] נכשל (${errorCode} ${errorDesc}) ${validatedURL}`);
    scheduleRetry(errorDesc);
  });

  // כשל ברמת HTTP אינו did-fail-load: השרת ענה, אבל בעמוד שגיאה (למשל 502
  // בזמן פריסה מחדש ב-Railway, או 404 אם הכתובת שגויה). בעמדה זה נראה כמו
  // עמוד זר על המסך, ולכן מטפלים בו כמו נפילת רשת.
  wc.on('did-navigate', (_e, navUrl, httpResponseCode, httpStatusText) => {
    if (httpResponseCode < 400) return;
    if (navUrl.replace(/\/$/, '') !== target.url.replace(/\/$/, '')) return;
    console.error(`[load] סטטוס ${httpResponseCode} ${httpStatusText} מ-${navUrl}`);
    scheduleRetry(`HTTP ${httpResponseCode}`);
  });

  wc.on('did-finish-load', () => {
    if (wc.getURL().startsWith('file://')) return;
    if (retryTimer) return;   // עמוד השגיאה סיים להיטען בזמן שכבר נקבע ניסיון חוזר
    attempt = 0;
    // מסך מגע (Cintiq): נטרול pinch-zoom כדי שמחווה מקרית לא תזיז את הסקייל
    wc.setVisualZoomLevelLimits(1, 1);
    console.log(`[load] ${wc.getURL()}`);
  });

  wc.on('render-process-gone', (_e, details) => {
    console.error('[renderer] התהליך נפל:', details.reason);
    scheduleRetry(details.reason);
  });

  mainWindow.on('closed', () => {
    clearTimeout(retryTimer);
    retryTimer = null;
    mainWindow = null;
  });

  // מסך "מתחבר" עולה ראשון (Railway יכול להתעורר כמה שניות), ורק אחריו
  // מנווטים לאפליקציה. ה-kick הוא ביטוח למקרה שמסך המצב לא נטען.
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    loadTarget();
  };

  showStatus('connecting', { url: target.url });
  const kick = setTimeout(start, 1500);
  wc.once('did-finish-load', () => {
    clearTimeout(kick);
    setTimeout(start, 250);
  });
}

app.whenReady().then(() => {
  registerSttHandlers();   // פעם אחת לכל חיי האפליקציה, לא לכל חלון
  registerRecordingHandlers();
  return createWindow();
});

app.on('window-all-closed', () => {
  // בסוכן אין חלון מלכתחילה, והאירוע הזה היה מכבה אותו ברגע שהוא עולה.
  if (isAgentMode(target && target.cfg)) return;
  app.quit();
});

// סגירת שרת העמדה לפני יציאה — אחרת הפורט נשאר תפוס והפעלה חוזרת מהירה
// (סגירה ופתיחה של העמדה) הייתה נופלת ללקוח דק.
app.on('before-quit', () => {
  if (stationServer) { stationServer.close().catch(() => {}); stationServer = null; }
  // תהליך המאגר המקומי מחזיק קבצים פתוחים; בלי הריגה הוא שורד את העמדה
  // ומחזיק את תיקיית המאגר נעולה בהפעלה הבאה.
  if (localDb.child) { try { localDb.child.kill(); } catch { /* כבר מת */ } localDb.child = null; }
  // הקלטה שלא נסגרה משאירה קובץ בלי זנב - ב-fMP4/WebM הוא ניגן, אבל בלי אורך
  if (screenRecorder) { screenRecorder.stop().catch(() => {}); }
});

app.on('activate', () => {
  if (isAgentMode(target && target.cfg)) return;
  if (!mainWindow) createWindow();
});
