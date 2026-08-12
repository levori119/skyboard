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
  const upstream = mod.request(targetUrl, { method: req.method, headers }, up => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  // כשל מהיר: 502 מיידי משחרר את הלקוח לשכבת ה-cache במקום לתקוע אותו
  upstream.setTimeout(timeoutMs, () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', err => {
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
function createStationServer({ distDir, apiTarget, airPictureTarget, airPictureToken, port = 0, host = '127.0.0.1', timeoutMs = 8000 }) {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
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
    if (shouldProxy(urlPath)) return proxyRequest(req, res, apiTarget, timeoutMs);
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
        close: () => new Promise(r => server.close(() => r())),
      });
    });
  });
}

module.exports = {
  createStationServer,
  contentTypeFor,
  shouldProxy,
  AIR_PICTURE_PATH,
  resolveStaticPath,
  isAssetLike,
};
