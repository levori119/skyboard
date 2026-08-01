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
