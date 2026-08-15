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
    onResult(true);
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
 * מרים את שרת העמדה.
 * @param {{distDir: string, apiTarget: string, port?: number, host?: string, timeoutMs?: number}} opts
 * @returns {Promise<{url: string, port: number, close: () => Promise<void>}>}
 */
function createStationServer({
  distDir, apiTarget, airPictureTarget, airPictureToken,
  port = 0, host = '127.0.0.1', timeoutMs = 8000,
  localApiTarget = () => null, localMode = 'auto',
}) {
  // הנתב מחזיק את מצב הקשר לשרת המרכזי ומכריע לאן כל בקשת /api הולכת.
  const router = createApiRouter({ apiTarget, localTarget: localApiTarget, mode: localMode, timeoutMs });
  // גשר הזהות: לוכד כניסה מוצלחת כדי שאפשר יהיה להיכנס ולעבוד גם בנתק.
  const authBridge = createAuthBridge({ localTarget: localApiTarget, timeoutMs });

  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    // ── מצב העמדה ────────────────────────────────────────────────────────────
    // נתיב מקומי לחלוטין שאינו מגיע לאף שרת: הוא **חייב** לענות גם בנתק מלא,
    // כי זה בדיוק המצב שעליו הוא מדווח. הבאנר בממשק קורא ממנו כדי לומר לבקר
    // מאיזה מאגר המידע שלפניו מגיע.
    if (urlPath === STATION_STATUS_PATH) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ...router.status(), offlineSessions: authBridge.knownSessions() }));
      return;
    }
    // ── תמונ"א: חיבור **ישיר** מהעמדה למאגר ──────────────────────────────────
    // הדרישה באפיון היא שהתמונ"א תגיע לעמדה בלי לעבור דרך מאגר SKY-KING. כאן
    // זה קורה: כשהעמדה יודעת את כתובת המאגר, הבקשה יוצאת אליו ישירות ו-SKY-KING
    // כלל לא מעורב. הטוקן מוזרק **כאן** ולא ב-renderer, ולכן הוא לא מגיע לדפדפן.
    // בלי כתובת מוגדרת הבקשה נופלת חזרה לפרוקסי הרגיל, ששם היא מרולה דרך
    // SKY-KING - מסלול הגיבוי לעמדות דפדפן ולפיתוח.
    if (urlPath === AIR_PICTURE_PATH && airPictureTarget) {
      return proxyRequest(req, res, airPictureTarget, timeoutMs, {
        rewritePath: '/air-picture',
        extraHeaders: airPictureToken ? { authorization: `Bearer ${airPictureToken}` } : undefined,
      });
    }
    if (shouldProxy(urlPath)) {
      const { which, target } = router.resolve();
      const onResult = ok => router.report(which, ok);

      // כניסה מול השרת המרכזי - נלכדת כדי לאפשר עבודה בנתק אחר כך.
      // כניסה שכבר מנותבת למקומי אינה נלכדת: אין שם מה ללמוד, השרת המקומי
      // הוא כבר זה שמאמת.
      if (which === 'remote' && req.method === 'POST' && urlPath === authBridge.LOGIN_PATH) {
        return proxyLoginRequest(req, res, target, timeoutMs, authBridge, onResult);
      }

      // ניתוב למאגר המקומי: האסימון המרכזי מוחלף במקומי, אחרת כל בקשה
      // הייתה חוזרת 401 והפקח היה מנותק בדיוק ברגע שהקשר נפל.
      const extraHeaders = {};
      if (which === 'local') {
        const swapped = authBridge.swapAuthHeader(req.headers.authorization);
        if (swapped) extraHeaders.authorization = swapped;
      }
      return proxyRequest(req, res, target, timeoutMs, { onResult, extraHeaders });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    serveStatic(res, distDir, req.url || '/');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
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
  resolveStaticPath,
  isAssetLike,
};
