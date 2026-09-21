import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import {
  createStationServer, contentTypeFor, shouldProxy, resolveStaticPath, isAssetLike,
} from './stationServer.cjs';

describe('shouldProxy', () => {
  it('בקשות API ונהג עוברות לשרת האמיתי', () => {
    expect(shouldProxy('/api/strips')).toBe(true);
    expect(shouldProxy('/api')).toBe(true);
    expect(shouldProxy('/driver/x')).toBe(true);
  });
  it('נכסים מוגשים מקומית', () => {
    expect(shouldProxy('/')).toBe(false);
    expect(shouldProxy('/assets/index.js')).toBe(false);
    expect(shouldProxy('/apifoo')).toBe(false);   // לא /api/
  });
});

describe('contentTypeFor', () => {
  it('סוגי הקבצים שה-build מייצר', () => {
    expect(contentTypeFor('/a/index.html')).toMatch(/text\/html/);
    expect(contentTypeFor('/a/index-abc.js')).toMatch(/javascript/);
    expect(contentTypeFor('/a/style.css')).toMatch(/text\/css/);
    expect(contentTypeFor('/a/favicon.svg')).toBe('image/svg+xml');
    expect(contentTypeFor('/a/font.woff2')).toBe('font/woff2');
  });
  it('סיומת לא מוכרת אינה מוגשת כ-HTML', () => {
    expect(contentTypeFor('/a/x.bin')).toBe('application/octet-stream');
  });
});

describe('resolveStaticPath — הגנת path traversal', () => {
  const root = path.resolve('/srv/dist');
  it('נתיב רגיל נפתר בתוך התיקייה', () => {
    expect(resolveStaticPath(root, '/assets/app.js')).toBe(path.join(root, 'assets', 'app.js'));
  });
  it('שורש נפתר ל-index.html', () => {
    expect(resolveStaticPath(root, '/')).toBe(path.join(root, 'index.html'));
  });
  it('בריחה מהתיקייה נחסמת', () => {
    for (const bad of ['/../secret', '/../../etc/passwd', '/assets/../../secret']) {
      expect(resolveStaticPath(root, bad)).toBeNull();
    }
  });
  it('בריחה מקודדת נחסמת', () => {
    expect(resolveStaticPath(root, '/%2e%2e/%2e%2e/secret')).toBeNull();
  });
  it('null byte נחסם', () => {
    expect(resolveStaticPath(root, '/a%00.js')).toBeNull();
  });
  it('אחוזים לא חוקיים אינם מפילים', () => {
    expect(resolveStaticPath(root, '/%zz')).toBeNull();
  });
});

describe('isAssetLike', () => {
  it('נתיב עם סיומת הוא נכס (404 אמיתי)', () => {
    expect(isAssetLike('/assets/app.js')).toBe(true);
  });
  it('נתיב בלי סיומת הוא ניתוב לקוח (index.html)', () => {
    expect(isAssetLike('/dashboard')).toBe(false);
    expect(isAssetLike('/')).toBe(false);
  });
});

describe('שרת העמדה (אינטגרציה)', () => {
  let dist, station, upstream, upstreamUrl, upstreamAlive = true;

  const get = (url, opts = {}) => new Promise((resolve, reject) => {
    const req = http.request(url, opts, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });

  beforeAll(async () => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'skyking-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<html>SKY-KING</html>');
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');

    upstream = http.createServer((req, res) => {
      if (!upstreamAlive) { req.socket.destroy(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ path: req.url, method: req.method, env: req.headers['x-env'] || null }));
    });
    await new Promise(r => upstream.listen(0, '127.0.0.1', r));
    upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
    station = await createStationServer({ distDir: dist, apiTarget: upstreamUrl, timeoutMs: 500 });
  });

  afterAll(async () => {
    await station.close();
    await new Promise(r => upstream.close(r));
    fs.rmSync(dist, { recursive: true, force: true });
  });

  it('מגיש את האפליקציה מהדיסק המקומי', async () => {
    const r = await get(`${station.url}/`);
    expect(r.status).toBe(200);
    expect(r.body).toContain('SKY-KING');
    expect(r.headers['content-type']).toMatch(/text\/html/);
  });

  it('ה-HTML אינו מטומן — עדכון גרסה נראה מיד', async () => {
    const r = await get(`${station.url}/index.html`);
    expect(r.headers['cache-control']).toBe('no-cache');
  });

  it('נכסים מוגשים עם טיפוס נכון', async () => {
    const r = await get(`${station.url}/assets/app.js`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/javascript/);
  });

  it('ניתוב לקוח נופל ל-index.html', async () => {
    const r = await get(`${station.url}/dashboard`);
    expect(r.status).toBe(200);
    expect(r.body).toContain('SKY-KING');
  });

  it('נכס חסר מחזיר 404 ולא HTML', async () => {
    const r = await get(`${station.url}/assets/missing.js`);
    expect(r.status).toBe(404);
  });

  it('בריחה מהתיקייה נחסמת', async () => {
    const r = await get(`${station.url}/../package.json`);
    expect([403, 404]).toContain(r.status);
    expect(r.body).not.toContain('"name"');
  });

  it('/api מועבר לשרת האמיתי עם הכותרות', async () => {
    const r = await get(`${station.url}/api/strips`, { headers: { 'X-Env': '12' } });
    expect(r.status).toBe(200);
    const d = JSON.parse(r.body);
    expect(d.path).toBe('/api/strips');
    expect(d.env).toBe('12');   // X-Env שורד את הפרוקסי — בידוד סביבות נשמר
  });

  it('כתיבה מועברת גם היא', async () => {
    const r = await get(`${station.url}/api/strips`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(JSON.parse(r.body).method).toBe('POST');
  });

  it('⚠ כשהשרת המרוחק נופל: האפליקציה עדיין נטענת, ורק ה-API נכשל מהר', async () => {
    upstreamAlive = false;
    try {
      const app = await get(`${station.url}/`);
      expect(app.status).toBe(200);           // העמדה ממשיכה לעבוד
      expect(app.body).toContain('SKY-KING');

      const api = await get(`${station.url}/api/strips`);
      expect(api.status).toBe(502);           // כשל מהיר → שכבת ה-cache נכנסת
    } finally {
      upstreamAlive = true;
    }
  });
});

// ── התמונ"א: החיבור הישיר, וכותרת הסביבה שעוברת בו ─────────────────────────
//
// זה המסלול שעמדת היעד עובדת בו: הבקשה יוצאת מהעמדה **ישירות למאגר**, בלי
// לעבור דרך שרת SKY-KING. שתי תכונות נבדקות כאן, ושתיהן שקטות מטבען:
//   1. הטוקן מוזרק בשרת העמדה ולא מגיע ל-renderer.
//   2. **`X-Env` עובר הלאה.** לכל סביבה תמונ"א משלה, ופרוקסי שמאבד את הכותרת
//      היה מחזיר לעמדת תרגול את התמונה החיה - כלומר תנועה אמיתית בתוך תרגיל.
describe('שרת העמדה - תמונ"א ישירה מהמאגר', () => {
  let dist, station, repo, repoUrl, seen;

  const get = (url, opts = {}) => new Promise((resolve, reject) => {
    const req = http.request(url, opts, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });

  beforeAll(async () => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'skyking-ap-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<html>SKY-KING</html>');
    // "מאגר" מדומה שמחזיר את מה שקיבל - כך רואים מה באמת עבר בחוט.
    repo = http.createServer((req, res) => {
      seen = { path: req.url, env: req.headers['x-env'] || null, auth: req.headers.authorization || null };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ v: '1.1', t: 1000, seq: 1, env: Number(req.headers['x-env'] || 1), tracks: [] }));
    });
    await new Promise(r => repo.listen(0, '127.0.0.1', r));
    repoUrl = `http://127.0.0.1:${repo.address().port}`;
    station = await createStationServer({
      distDir: dist, apiTarget: repoUrl, airPictureTarget: repoUrl,
      airPictureToken: 'sekret', timeoutMs: 500,
    });
  });

  afterAll(async () => {
    await station.close();
    await new Promise(r => repo.close(r));
    fs.rmSync(dist, { recursive: true, force: true });
  });

  it('הבקשה מגיעה למאגר על /air-picture, לא על נתיב SKY-KING', async () => {
    await get(`${station.url}/api/air-picture/live`);
    expect(seen.path).toBe('/air-picture');
  });

  it('הטוקן מוזרק בשרת העמדה', async () => {
    await get(`${station.url}/api/air-picture/live`);
    expect(seen.auth).toBe('Bearer sekret');
  });

  it('**X-Env עובר למאגר כמות שהוא** - כל סביבה והתמונ"א שלה', async () => {
    for (const env of ['1', '17', '50']) {
      await get(`${station.url}/api/air-picture/live`, { headers: { 'X-Env': env } });
      expect(seen.env).toBe(env);
    }
  });

  it('בלי כותרת סביבה - המאגר מחליט (התמונה החיה), והפרוקסי לא ממציא', async () => {
    await get(`${station.url}/api/air-picture/live`);
    expect(seen.env).toBeNull();
  });
});

// ── נתק מדומה וניתוב מפורש ────────────────────────────────────────────────────
// שני הדברים שהופכים את "עמידות בנתק" לדבר שאפשר לראות ולבדוק: כפתור שמנתק
// **עמדה אחת**, ונתיבים שמאפשרים לשכבת הסנכרון לדבר עם שני הצדדים.
describe('נתק מדומה וניתוב מפורש בשרת העמדה', () => {
  let dist, station, central, centralUrl, local, localUrl, centralSeen, localSeen;

  const call = (url, opts = {}) => new Promise((resolve, reject) => {
    const req = http.request(url, opts, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', err => resolve({ status: 0, headers: {}, body: '', err }));
    if (opts.body) req.write(opts.body);
    req.end();
  });

  const echo = (seen) => http.createServer((req, res) => {
    seen.path = req.url;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ who: seen.name, path: req.url }));
  });

  beforeAll(async () => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'skyking-dist-sim-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<html>SKY-KING</html>');

    centralSeen = { name: 'central' };
    localSeen = { name: 'local' };
    central = echo(centralSeen);
    local = echo(localSeen);
    await new Promise(r => central.listen(0, '127.0.0.1', r));
    await new Promise(r => local.listen(0, '127.0.0.1', r));
    centralUrl = `http://127.0.0.1:${central.address().port}`;
    localUrl = `http://127.0.0.1:${local.address().port}`;

    station = await createStationServer({
      distDir: dist, apiTarget: centralUrl, localApiTarget: () => localUrl, timeoutMs: 500,
    });
  });

  afterAll(async () => {
    await station.close();
    await new Promise(r => central.close(r));
    await new Promise(r => local.close(r));
    fs.rmSync(dist, { recursive: true, force: true });
  });

  const outage = (on) => call(`${station.url}/api/__station/outage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }),
  });

  it('בלי דימוי - הבקשות הולכות למרכז', async () => {
    const r = await call(`${station.url}/api/strips`);
    expect(JSON.parse(r.body).who).toBe('central');
  });

  it('הדלקת הדימוי מעבירה את העמדה למאגר המקומי', async () => {
    const res = await outage(true);
    expect(JSON.parse(res.body)).toMatchObject({ simulated: true, serving: 'local' });

    const r = await call(`${station.url}/api/strips`);
    expect(JSON.parse(r.body).who).toBe('local');
  });

  it('מצב העמדה מדווח על הדימוי - וזה מה שמזין את החיווי', async () => {
    const r = await call(`${station.url}/api/__station/status`);
    expect(JSON.parse(r.body)).toMatchObject({ simulated: true, serving: 'local', localReady: true });
  });

  it('בזמן דימוי הנתיב המפורש למרכז נחסם - אחרת הדימוי אינו מדמה דבר', async () => {
    const r = await call(`${station.url}/api/__remote/sync/mirror`);
    expect(r.status).toBe(503);
    expect(JSON.parse(r.body).code).toBe('SIMULATED_OUTAGE');
  });

  it('בזמן דימוי הנתיב המפורש למקומי עובד - שם יושב יומן הסנכרון', async () => {
    const r = await call(`${station.url}/api/__local/sync/state`);
    expect(JSON.parse(r.body).who).toBe('local');
    // התחילית מוסרת: השרת המקומי מקבל את הנתיב האמיתי
    expect(localSeen.path).toBe('/api/sync/state');
  });

  it('כיבוי הדימוי מחזיר את העמדה למרכז', async () => {
    const res = await outage(false);
    expect(JSON.parse(res.body)).toMatchObject({ simulated: false, serving: 'remote' });

    const r = await call(`${station.url}/api/strips`);
    expect(JSON.parse(r.body).who).toBe('central');
  });

  it('אחרי הכיבוי הנתיב המפורש למרכז נפתח, והתחילית מוסרת', async () => {
    const r = await call(`${station.url}/api/__remote/sync/push?x=1`);
    expect(JSON.parse(r.body).who).toBe('central');
    expect(centralSeen.path).toBe('/api/sync/push?x=1');
  });

  it('שיטה שאינה POST על נתיב הדימוי נדחית', async () => {
    const r = await call(`${station.url}/api/__station/outage`);
    expect(r.status).toBe(405);
  });
});
