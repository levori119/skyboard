// עמדה עצמאית — שרת סטטי זעיר בתוך ה-Electron.
//
// למה זה קיים: בברירת המחדל הקודמת העמדה הייתה **לקוח דק** — גם ה-HTML/JS
// נטענו מהשרת המרוחק. כשכבל הרשת מנותק אין אפילו אפליקציה לטעון, ולכן אי אפשר
// "להמשיך לעבוד על המידע הקיים". כאן ה-dist ארוז בתוך העמדה ומוגש מקומית.
//
// למה שרת מקומי ולא file:// — שלוש סיבות:
//   1. תחת file:// ה-origin הוא null: CORS, IndexedDB ו-service worker מתנהגים
//      אחרת או נחסמים. ה-cache המקומי שלנו יושב על IndexedDB.
//   2. הפרוקסי ל-/api שומר את הבקשות **same-origin**, ולכן `API_URL='/api'`
//      ממשיך לעבוד כמו שהוא — אפס שינוי במאות אתרי ה-fetch בקוד.
//   3. בדיקת ה-origin ב-IPC (senderAllowed) ממשיכה לעבוד.
//
// כשהשרת המרוחק לא זמין, הפרוקסי נכשל **מהר** (502) במקום לתלות את הבקשה עד
// timeout של TCP — כך שכבת ה-offline בלקוח מגישה את ה-cache תוך שבריר שנייה.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { createApiRouter } = require('./apiRouter.cjs');
const { createAuthBridge } = require('./authBridge.cjs');

/** מצב העמדה - מאיזה מאגר היא משרתת כרגע. נענה מקומית, גם בנתק מלא. */
const STATION_STATUS_PATH = '/api/__station/status';

/** הדלקה וכיבוי של נתק מדומה **בעמדה הזו בלבד**. */
const STATION_OUTAGE_PATH = '/api/__station/outage';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

function contentTypeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** נתיבים שאינם נכס סטטי אלא בקשה לשרת האמיתי. */
/** הנתיב היחיד שהלקוח מכיר לתמונ"א. שתי הכרעות שונות בצד השרת - ראה createStationServer. */
const AIR_PICTURE_PATH = '/api/air-picture/live';

function shouldProxy(urlPath) {
  return urlPath === '/api' || urlPath.startsWith('/api/')
    || urlPath === '/driver' || urlPath.startsWith('/driver/');
}

/**
 * ממפה נתיב URL לקובץ בתוך distDir.
 * מחזיר null אם הנתיב בורח מהתיקייה (path traversal) — שרת מקומי שמגיש
 * `../../` היה חושף את דיסק העמדה לכל קוד שרץ בעמוד.
 */
function resolveStaticPath(distDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null; // אחוזים לא חוקיים
  }
  if (decoded.includes('\0')) return null;
  const rel = decoded.replace(/^\/+/, '');
  const root = path.resolve(distDir);
  const full = path.resolve(root, rel === '' ? 'index.html' : rel);
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (full !== root && !full.startsWith(withSep)) return null;
  return full;
}

/** נתיב שאינו קובץ קיים ואינו נכס — מוגש כ-index.html (ניתוב בצד הלקוח). */
function isAssetLike(urlPath) {
  return path.extname(urlPath.split('?')[0]) !== '';
}

/**
 * פרוקסי לבקשת הכניסה, עם האזנה לתוצאה.
 *
 * זו הבקשה **היחידה** שהעמדה קוראת את גופה, ומסיבה אחת: זהו הרגע שבו קיימת
 * בו-זמנית סיסמה שאומתה וזהות שאושרה. בלי ללכוד אותו כאן, עמדה שתתנתק מאוחר
 * יותר לא תוכל לזהות אף אחד. ראה electron/authBridge.cjs.
 *
 * `accept-encoding: identity` נכפה כדי שהתשובה תגיע כ-JSON קריא ולא דחוסה —
 * גוף הכניסה הוא מאות בתים, ואין מה לחסוך בדחיסה שתחייב פענוח כאן.
 */
function proxyLoginRequest(req, res, apiTarget, timeoutMs, bridge, onResult) {
  let targetUrl;
  try {
    targetUrl = new URL(req.url, apiTarget);
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad api target' }));
    return;
  }
  const reqChunks = [];
  req.on('data', c => reqChunks.push(c));
  req.on('error', () => { /* הלקוח ניתק - אין למי לענות */ });
  req.on('end', () => {
    const reqBody = Buffer.concat(reqChunks);
    const mod = targetUrl.protocol === 'https:' ? https : http;
    const headers = {
      ...req.headers, host: targetUrl.host,
      'accept-encoding': 'identity', 'content-length': String(reqBody.length),
    };
    const upstream = mod.request(targetUrl, { method: req.method, headers }, up => {
      onResult(true);
      const outChunks = [];
      up.on('data', c => outChunks.push(c));
      up.on('end', () => {
        const resBody = Buffer.concat(outChunks);
        const outHeaders = { ...up.headers };
        delete outHeaders['content-encoding'];
        outHeaders['content-length'] = String(resBody.length);
        res.writeHead(up.statusCode || 502, outHeaders);
        res.end(resBody);
        // אחרי שהלקוח כבר קיבל תשובה: שמירת האסמכתא לא מעכבת את הכניסה,
        // וכשלון בה לא הופך כניסה מוצלחת לכושלת.
        if (up.statusCode === 200) {
          Promise.resolve(bridge.onLoginSuccess(reqBody, resBody)).catch(() => {});
        }
      });
    });
    upstream.setTimeout(timeoutMs, () => upstream.destroy(new Error('upstream timeout')));
    upstream.on('error', err => {
      onResult(false);
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream unreachable', detail: err.message }));
    });
    upstream.end(reqBody);
  });
}

function proxyRequest(req, res, apiTarget, timeoutMs, opts) {
  let targetUrl;
  try {
    targetUrl = new URL(opts && opts.rewritePath ? opts.rewritePath : req.url, apiTarget);
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad api target' }));
    return;
  }
  const mod = targetUrl.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: targetUrl.host, ...((opts && opts.extraHeaders) || {}) };
  // מדווח לנתב אם היעד ענה. תשובה - גם 4xx וגם 5xx - היא עדות שהיעד **חי**;
  // רק היעדר תשובה הוא כשל קשר. בלי ההבחנה הזו שגיאת יישום אחת בשרת המרכזי
  // הייתה מגלגלת את כל העמדה למאגר המקומי.
  const onResult = (opts && opts.onResult) || (() => {});
  const upstream = mod.request(targetUrl, { method: req.method, headers }, up => {
    // הסטטוס עובר הלאה כי הוא מה שמבדיל בין "היעד חי" לבין "היעד חי **וקיבל
    // את הזהות הזו**" - והשני הוא מה שמאפשר להנפיק אסימון מקומי מקביל.
    onResult(true, up.statusCode || 0);
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  // כשל מהיר: 502 מיידי משחרר את הלקוח לשכבת ה-cache במקום לתקוע אותו
  upstream.setTimeout(timeoutMs, () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', err => {
    onResult(false);
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream unreachable', detail: err.message }));
  });
  req.pipe(upstream);
}

function serveStatic(res, distDir, urlPath) {
  const filePath = resolveStaticPath(distDir, urlPath);
  if (!filePath) { res.writeHead(403); res.end('forbidden'); return; }

  fs.stat(filePath, (err, stat) => {
    const send = (p) => {
      res.writeHead(200, {
        'Content-Type': contentTypeFor(p),
        // ה-HTML לעולם לא מטומן: אחרת עדכון גרסה בעמדה לא נראה עד ניקוי ידני.
        'Cache-Control': p.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      fs.createReadStream(p).pipe(res);
    };
    if (!err && stat.isFile()) return send(filePath);
    if (isAssetLike(urlPath)) { res.writeHead(404); res.end('not found'); return; }
    const index = path.join(path.resolve(distDir), 'index.html');
    fs.access(index, fs.constants.R_OK, e2 => {
      if (e2) { res.writeHead(404); res.end('not found'); return; }
      send(index);
    });
  });
}

/**
 * תקרת הזמן לבקשה, לפי הנתיב.
 *
 * ⚠️ **בקשת סנכרון אינה בקשה תפעולית.** תקרת 8 השניות קיימת כדי שנתק יזוהה
 * מהר והעמדה תיפול למאגר שלה - אבל המראה מהמרכז היא 4.6MB על פני 128 טבלאות,
 * ולכן **חרגה ממנה תמיד** וחזרה 502. התוצאה: המאגר המקומי נשאר ריק, ובמעבר
 * לנתק המסך התרוקן. הלקוח מושך היום בחלקים (MIRROR_BATCH), והתקרה הרחבה כאן
 * היא רשת הביטחון השנייה - רשת איטית לא תחזיר אותנו למצב הזה.
 *
 * הנתיבים האלה אינם משמשים להכרעת "האם השרת חי" - לכך יש `/api/health`.
 */
const SYNC_TIMEOUT_MS = 120_000;
const isSyncPath = (p) => p.startsWith('/api/sync/') || p.includes('/sync/mirror');
const timeoutFor = (base) => (urlPath) => (isSyncPath(urlPath || '') ? SYNC_TIMEOUT_MS : base);

// ── מי מורשה לדבר עם הסוכן ────────────────────────────────────────────────────
// הסוכן מאזין על 127.0.0.1 בלבד, ולכן אינו חשוף לרשת - אבל **כל** אתר שהמפעיל
// פותח בטאב אחר יכול לשלוח אליו בקשות מהדפדפן שלו. בלי שער מקורות, דף זדוני
// היה קורא את מידע השדה שבעמדה וכותב אליו. זהו ממצא SK-07 בגרסתו המקומית.
//
// מורשים: המקור של השרת המרכזי שהסוכן מוגדר מולו (זה הדף שהפקח פותח), לוקלהוסט
// לפיתוח, ומה שנוסף במפורש ב-`ALLOWED_ORIGINS` בקובץ התצורה.
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function createOriginGate(apiTarget, extra = []) {
  const allowed = new Set();
  try { allowed.add(new URL(apiTarget).origin); } catch { /* יעד לא תקין */ }
  for (const o of extra) {
    try { allowed.add(new URL(o).origin); } catch { /* ערך שגוי בתצורה */ }
  }
  return (origin) => !!origin && (allowed.has(origin) || LOCALHOST_ORIGIN.test(origin));
}

/** הכותרות שהלקוח שולח. מפורטות ולא `*`, כי `*` אינו תקף עם Authorization. */
const CORS_REQUEST_HEADERS = 'Content-Type, Authorization, X-Env, X-Action-Id, X-Workstation, X-Station-Key';
/** כותרות תשובה שהלקוח חייב לראות - בלעדיהן אין ביטול פעולה ואין חיווי גיל. */
const CORS_EXPOSE_HEADERS = 'X-Undo-Action, x-skyking-from-cache, x-skyking-cached-at';

/**
 * עונה על preflight ומוסיפה כותרות CORS לתשובה. מחזירה false אם הטיפול הסתיים.
 *
 * ⚠️ `Access-Control-Allow-Private-Network` נחוץ בכרום: בקשה מדף ציבורי
 * (https) אל כתובת ברשת הפרטית (127.0.0.1) עוברת בדיקת Private Network Access
 * נפרדת, ובלי הכותרת היא נחסמת - גם כששאר ה-CORS תקין לחלוטין.
 */
function applyCors(req, res, allowOrigin) {
  const origin = req.headers.origin;
  if (!origin) return true;                    // בקשה מאותו מקור - אין CORS
  if (!allowOrigin(origin)) {
    if (req.method === 'OPTIONS') { res.writeHead(403); res.end(); return false; }
    return true;   // הבקשה תיענה, והדפדפן יחסום אותה בעצמו בהיעדר הכותרות
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Expose-Headers', CORS_EXPOSE_HEADERS);
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] || CORS_REQUEST_HEADERS);
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    res.writeHead(204);
    res.end();
    return false;
  }
  return true;
}

/**
 * מרים את שרת העמדה.
 * @param {{distDir: string, apiTarget: string, port?: number, host?: string, timeoutMs?: number}} opts
 * @returns {Promise<{url: string, port: number, close: () => Promise<void>}>}
 */
function createStationServer({
  distDir, apiTarget, airPictureTarget, airPictureToken,
  port = 0, host = '127.0.0.1', timeoutMs: baseTimeoutMs = 8000,
  localApiTarget = () => null, localMode = 'auto',
  // בפיתוח: שרת ה-Vite. הנכסים מפורקססים אליו במקום להיקרא מ-dist, ולכן
  // אפשר לעבוד על העמדה האמיתית - עם המאגר המקומי ועם כפתור הנתק - בלי
  // build אחרי כל שינוי. בייצור הוא null, והנכסים מגיעים מהדיסק.
  staticTarget = null,
  // מקורות נוספים שמותר להם לדבר עם הסוכן, מעבר ל-`apiTarget` וללוקלהוסט.
  // ברירת המחדל ריקה בכוונה: הרשימה הזו היא כל מה שעומד בין מידע השדה שבעמדה
  // לבין אתר אקראי שהמפעיל פתח בטאב אחר.
  allowedOrigins = [],
}) {
  // הנתב מחזיק את מצב הקשר לשרת המרכזי ומכריע לאן כל בקשת /api הולכת.
  const router = createApiRouter({ apiTarget, localTarget: localApiTarget, mode: localMode, timeoutMs: baseTimeoutMs });
  // גשר הזהות: לוכד כניסה מוצלחת כדי שאפשר יהיה להיכנס ולעבוד גם בנתק.
  const authBridge = createAuthBridge({ localTarget: localApiTarget, timeoutMs: baseTimeoutMs });

  const allowOrigin = createOriginGate(apiTarget, allowedOrigins);
  const timeoutForPath = timeoutFor(baseTimeoutMs);

  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    // ── הדפדפן שעל המחשב ─────────────────────────────────────────────────────
    // עמדה שעולה ב-WEB פותחת את הכתובת של SKY-KING, ולא את הסוכן - ולכן כל
    // בקשה אליו היא cross-origin. בלי הכותרות האלה הדפדפן בולע אותה עוד לפני
    // שהיא יוצאת, והמפעיל רואה "אין מאגר מקומי" בזמן שהסוכן רץ ומחכה.
    if (!applyCors(req, res, allowOrigin)) return;

    // ── מצב העמדה ────────────────────────────────────────────────────────────
    // נתיב מקומי לחלוטין שאינו מגיע לאף שרת: הוא **חייב** לענות גם בנתק מלא,
    // כי זה בדיוק המצב שעליו הוא מדווח. הבאנר בממשק קורא ממנו כדי לומר לבקר
    // מאיזה מאגר המידע שלפניו מגיע.
    if (urlPath === STATION_STATUS_PATH) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      // `apiTarget` אינו קישוט: הדפדפן משווה אותו למקור של הדף, ומסרב לעבוד
      // מול סוכן שהוגדר מול שרת אחר. ראה src/offline/stationAgent.ts.
      res.end(JSON.stringify({
        ...router.status(),
        apiTarget,
        offlineSessions: authBridge.knownSessions(),
      }));
      return;
    }

    // ── נתק מדומה - בעמדה הזו בלבד ───────────────────────────────────────────
    // כפתור בממשק מדליק ומכבה אותו. מקומי לחלוטין: השרת המרכזי אינו יודע
    // עליו דבר, ושאר העמדות ממשיכות לעבוד מולו כרגיל. זה מה שהופך אותו לכלי
    // תרגול ולא לתקלה מכוונת בשדה.
    if (urlPath === STATION_OUTAGE_PATH) {
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('error', () => { /* הלקוח ניתק */ });
      req.on('end', () => {
        let on = false;
        try { on = !!JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}').on; } catch { /* גוף ריק = כיבוי */ }
        const status = router.setSimulatedOutage(on);
        console.log(`[station] נתק מדומה ${on ? 'הודלק' : 'כובה'} - משרת מ-${status.serving}`);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(status));
      });
      return;
    }

    // ── ניתוב מפורש: /api/__local/... ו-/api/__remote/... ────────────────────
    // שכבת הסנכרון היא הצרכן היחיד שלהם, ומסיבה אחת: היא חייבת לדבר עם **שני**
    // הצדדים באותה נשימה - לקרוא את היומן מהמאגר המקומי ולדחוף אותו למרכז.
    // `/api/...` הרגיל מנותב לפי מצב הקשר ויכול להגיע רק לאחד מהם.
    //
    // הדפדפן הוא שמריץ את הסנכרון, כי הוא היחיד שמחזיק אסימון תקף לשני
    // הצדדים. שרת מקומי שהיה פונה למרכז בעצמו היה זקוק לזהות משלו.
    const forced = urlPath.startsWith('/api/__local/') ? 'local'
      : urlPath.startsWith('/api/__remote/') ? 'remote' : null;
    if (forced) {
      // נתק מדומה חוסם גם את הנתיב המפורש. אחרת העמדה הייתה ממשיכה למשוך
      // מראה מהמרכז בזמן ש"אין לה קשר" - דימוי שאינו מדמה דבר.
      if (forced === 'remote' && router.isSimulated()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'simulated outage', code: 'SIMULATED_OUTAGE' }));
        return;
      }
      const { which, target } = router.resolveForced(forced);
      if (!target) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `${forced} target unavailable` }));
        return;
      }
      const prefix = forced === 'local' ? '/api/__local' : '/api/__remote';
      const extraHeaders = {};
      if (which === 'local') {
        const swapped = authBridge.swapAuthHeader(req.headers.authorization);
        if (swapped) extraHeaders.authorization = swapped;
      }
      return proxyRequest(req, res, target, timeoutForPath(urlPath), {
        rewritePath: (req.url || '').replace(prefix, '/api'),
        extraHeaders,
        onResult: ok => router.report(which, ok),
      });
    }
    // ── תמונ"א: חיבור **ישיר** מהעמדה למאגר ──────────────────────────────────
    // הדרישה באפיון היא שהתמונ"א תגיע לעמדה בלי לעבור דרך מאגר SKY-KING. כאן
    // זה קורה: כשהעמדה יודעת את כתובת המאגר, הבקשה יוצאת אליו ישירות ו-SKY-KING
    // כלל לא מעורב. הטוקן מוזרק **כאן** ולא ב-renderer, ולכן הוא לא מגיע לדפדפן.
    // בלי כתובת מוגדרת הבקשה נופלת חזרה לפרוקסי הרגיל, ששם היא מרולה דרך
    // SKY-KING - מסלול הגיבוי לעמדות דפדפן ולפיתוח.
    if (urlPath === AIR_PICTURE_PATH && airPictureTarget) {
      return proxyRequest(req, res, airPictureTarget, timeoutForPath(urlPath), {
        rewritePath: '/air-picture',
        extraHeaders: airPictureToken ? { authorization: `Bearer ${airPictureToken}` } : undefined,
      });
    }
    if (shouldProxy(urlPath)) {
      const { which, target } = router.resolve();

      // נתק מדומה בעמדה **בלי** מאגר מקומי: אין לאן לנתב, ולכן הבקשה נכשלת
      // כמו בנתק אמיתי. הסוקט נסגר בלי תשובה בכוונה - שכבת ה-offline בלקוח
      // מזהה כשל רשת ומגישה את ה-cache, בעוד תשובת 5xx הייתה נקראת אצלה
      // כ"השרת חי" והחיווי היה מטעה.
      if (which === 'none') { req.destroy(); res.destroy(); return; }

      // תשובה מהמרכז שאינה 4xx היא עדות שהאסימון הזה תקף **עכשיו**, ומכאן
      // העמדה מנפיקה לו מקביל מקומי. בלי זה פקח שרענן את הדף (ולכן לא עבר
      // כניסה חדשה) היה מקבל 401 על כל בקשה ברגע המעבר למאגר המקומי - וזה
      // נראה בדיוק כמו "בנתק שום דבר לא נשמר".
      const onResult = (ok, status) => {
        router.report(which, ok);
        if (which === 'remote' && ok && status && status < 400) {
          authBridge.noteAccepted(req.headers.authorization);
        }
      };

      // כניסה מול השרת המרכזי - נלכדת כדי לאפשר עבודה בנתק אחר כך.
      // כניסה שכבר מנותבת למקומי אינה נלכדת: אין שם מה ללמוד, השרת המקומי
      // הוא כבר זה שמאמת.
      if (which === 'remote' && req.method === 'POST' && urlPath === authBridge.LOGIN_PATH) {
        return proxyLoginRequest(req, res, target, timeoutForPath(urlPath), authBridge, onResult);
      }

      // ניתוב למאגר המקומי: האסימון המרכזי מוחלף במקומי, אחרת כל בקשה
      // הייתה חוזרת 401 והפקח היה מנותק בדיוק ברגע שהקשר נפל.
      const extraHeaders = {};
      if (which === 'local') {
        const swapped = authBridge.swapAuthHeader(req.headers.authorization);
        if (swapped) extraHeaders.authorization = swapped;
      }
      return proxyRequest(req, res, target, timeoutForPath(urlPath), { onResult, extraHeaders });
    }
    // בפיתוח הנכסים מגיעים משרת ה-Vite (כולל HMR), ולא מ-dist שנבנה.
    if (staticTarget) return proxyRequest(req, res, staticTarget, timeoutForPath(urlPath));
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    serveStatic(res, distDir, req.url || '/');
  });

  return new Promise((resolve, reject) => {
    // ⚠️ **פורט תפוס אינו כישלון.** הפורט הקבוע הוא מה ששומר על ה-origin בין
    // הפעלות, ואיתו על ה-cache ב-IndexedDB - אבל עמדה שנייה על אותו מחשב
    // הייתה נופלת עליו, וה-catch אצל הקורא היה מחזיר אותה בשקט ללקוח דק.
    // לכן נסיגה לפורט חופשי: העמדה עולה, ומשלמת רק ב-cache שמתחיל מחדש.
    let retried = false;
    server.on('error', err => {
      if (!retried && port !== 0 && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
        retried = true;
        console.warn(`[station] פורט ${port} תפוס - עולים על פורט חופשי (ה-cache של העמדה יתחיל מחדש)`);
        server.listen(0, host);
        return;
      }
      reject(err);
    });
    // 127.0.0.1 בלבד: שרת העמדה אינו מאזין לרשת ואינו משטח תקיפה חדש
    server.listen(port, host, () => {
      const actual = server.address().port;
      resolve({
        url: `http://${host}:${actual}`,
        port: actual,
        router,
        authBridge,
        close: () => new Promise(r => { router.health.stop(); server.close(() => r()); }),
      });
    });
  });
}

module.exports = {
  createStationServer,
  contentTypeFor,
  shouldProxy,
  AIR_PICTURE_PATH,
  STATION_STATUS_PATH,
  STATION_OUTAGE_PATH,
  createOriginGate,
  applyCors,
  timeoutFor,
  SYNC_TIMEOUT_MS,
  resolveStaticPath,
  isAssetLike,
};
