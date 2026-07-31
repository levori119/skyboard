const { app, BrowserWindow, dialog, shell, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { resolveSttPaths, sttStatus, transcribeWav } = require('./electron/whisper.cjs');

const isDev = !app.isPackaged;

// ── יעד העמדה ────────────────────────────────────────────────────────────────
// ברירת המחדל: האפליקציה שרצה בענן (Railway). העמדה היא לקוח דק - אין שרת
// מקומי ואין DATABASE_URL להגדיר בעמדה.
//
// סדר קדימויות:
//   1. SKYKING_STATION_URL   (משתנה סביבה - גובר על הכל, נוח לבדיקות)
//      (לא SKYKING_URL - זה כבר משמש את מיראז' ככתובת ה-API של SKY-KING)
//   2. config.json → mode: "local"   (מריץ שרת מקומי, מצב legacy)
//   3. config.json → APP_URL         (כתובת אחרת לעמדה, בלי בנייה מחדש)
//   4. פיתוח → vite מקומי | הפצה → DEFAULT_APP_URL
const DEFAULT_APP_URL = 'https://sky-king.up.railway.app/';
const DEV_APP_URL = 'http://localhost:5000';

const STATUS_PAGE = path.join(__dirname, 'electron-status.html');

// השהיית ניסיון חוזר: 2, 4, 8, 16, 30 שניות (Railway יכול להתעורר לאט)
const RETRY_STEPS_MS = [2000, 4000, 8000, 16000, 30000];

let mainWindow = null;
let target = null;
let retryTimer = null;
let attempt = 0;

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
function writeRemoteConfigTemplate() {
  try {
    const p = configPath();
    if (fs.existsSync(p)) return;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({
      _readme: 'APP_URL - הכתובת שהעמדה טוענת. mode: "local" מריץ שרת מקומי במקום (דורש DATABASE_URL).',
      APP_URL: DEFAULT_APP_URL
    }, null, 2), 'utf8');
  } catch (e) {
    console.error('[config] יצירת config.json נכשלה:', e.message);
  }
}

function resolveTarget() {
  const envUrl = (process.env.SKYKING_STATION_URL || '').trim();
  if (envUrl) return { mode: 'remote', url: envUrl, cfg: {} };

  const cfg = isDev ? {} : readConfig();

  if (process.env.SKYKING_MODE === 'local' || cfg.mode === 'local') {
    return { mode: 'local', url: null, cfg };
  }

  const cfgUrl = typeof cfg.APP_URL === 'string' ? cfg.APP_URL.trim() : '';
  if (cfgUrl) return { mode: 'remote', url: cfgUrl, cfg };

  if (isDev) return { mode: 'remote', url: DEV_APP_URL, cfg };

  writeRemoteConfigTemplate();
  return { mode: 'remote', url: DEFAULT_APP_URL, cfg };
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
  return createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});
