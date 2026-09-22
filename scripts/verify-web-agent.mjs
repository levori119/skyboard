// אימות מקצה-לקצה: עמדה שעולה ב-WEB מקבלת את המאגר שעל המחשב.
//
// לא בדיקת יחידה. כאן מורם המצב האמיתי - דף שמוגש ממקור אחד, סוכן עמדה על
// מקור אחר, ודפדפן אמיתי באמצע - כי **כל** מה שיכול להישבר כאן נשבר דווקא
// בדפדפן: CORS, Private Network Access, וסדר יירוטי ה-fetch.
//
// ארבעת הדברים שאי אפשר לבדוק בלי דפדפן:
//   1. הדפדפן **מרשה** לדף לדבר עם 127.0.0.1 (CORS + PNA).
//   2. ה-`Authorization` וה-`X-Env` שורדים את השכתוב לכתובת מוחלטת - זו
//      המלכודת: היירוטים מצרפים אותם לנתיב **יחסי** בלבד.
//   3. כשיש קשר התשובה עדיין מגיעה מהשרת המרכזי (הסוכן מפרקסס, לא חוטף).
//   4. בנתק התשובה מגיעה מהמאגר שבעמדה.
//
// הרצה:  npm run build && node scripts/verify-web-agent.mjs

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CENTRAL_PORT = 5199;
const AGENT_PORT = 5198;
const PAGE = `http://127.0.0.1:${CENTRAL_PORT}`;
const DB_DIR = path.join(os.tmpdir(), 'skyking-verify-web-agent-db');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('אין dist. הרץ קודם: npm run build');
  process.exit(1);
}
fs.rmSync(DB_DIR, { recursive: true, force: true });

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}${extra ? ' → ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? ' → ' + extra : ''}`); }
};

// ── "SKY-KING ברשת" מדומה: מגיש את הדף ועונה על ה-API ────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
};
const central = http.createServer((req, res) => {
  const p = (req.url || '/').split('?')[0];
  if (p.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, who: 'central', path: p }));
    return;
  }
  const file = path.join(DIST, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
  fs.readFile(file, (err, buf) => {
    if (err) {
      // ניתוב בצד הלקוח
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(fs.readFileSync(path.join(DIST, 'index.html')));
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => central.listen(CENTRAL_PORT, '127.0.0.1', r));

// ── הסוכן ────────────────────────────────────────────────────────────────────
console.log('מרים סוכן עמדה (המאגר המקומי לוקח כ-15 שניות)...');
const agent = spawn(process.execPath, [
  path.join(ROOT, 'scripts', 'station.mjs'),
  `--port=${AGENT_PORT}`, `--api=${PAGE}`, '--dist', `--db=${DB_DIR}`,
], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

const agentReady = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('הסוכן לא עלה תוך 90 שניות')), 90_000);
  agent.stdout.on('data', d => {
    if (String(d).includes('המאגר המקומי מוכן')) { clearTimeout(timer); resolve(); }
  });
  agent.on('exit', code => { clearTimeout(timer); reject(new Error(`הסוכן הסתיים (${code})`)); });
});

const shutdown = () => {
  try { agent.kill(); } catch { /* כבר מת */ }
  central.close();
};

try {
  await agentReady;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  // לפני טעינת המודולים: authToken קורא את sessionStorage פעם אחת בעלייה
  await ctx.addInitScript(() => { try { sessionStorage.setItem('bt-auth-token', 'v1.verify.token'); } catch { /* מצב פרטי */ } });
  // הדף מחפש את הסוכן בפורט הקבוע; כאן הוא על פורט בדיקה
  await ctx.addInitScript(port => {
    try { localStorage.setItem('skyking.stationAgent', `http://127.0.0.1:${port}`); } catch { /* מצב פרטי */ }
  }, AGENT_PORT);
  const page = await ctx.newPage();

  const seen = [];
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/strips')) seen.push({ host: u.host, headers: r.headers() });
  });

  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const status = await page.evaluate(() =>
    fetch('/api/__station/status', { cache: 'no-store' }).then(r => r.json()).catch(e => ({ error: String(e) })));
  ok('הדף רואה מאגר מקומי', status && status.localReady === true, JSON.stringify(status).slice(0, 80));

  const body = await page.evaluate(() => fetch('/api/strips?airfield_id=3').then(r => r.text()).catch(e => String(e)));
  const hit = seen[0];
  ok('הבקשה יצאה לסוכן', !!hit && hit.host === `127.0.0.1:${AGENT_PORT}`, hit && hit.host);
  ok('האסימון שרד את השכתוב', !!hit && hit.headers.authorization === 'Bearer v1.verify.token', hit && hit.headers.authorization);
  ok('כותרת הסביבה שרדה', !!hit && !!hit.headers['x-env'], hit && hit.headers['x-env']);
  ok('כשיש קשר - התשובה מהמרכז', body.includes('"who":"central"'), body.slice(0, 60));

  const setOutage = on => page.evaluate(v => fetch('/api/__station/outage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: v }),
  }).then(r => r.json()), on);

  const off = await setOutage(true);
  ok('בנתק העמדה משרתת מהמאגר שלה', off && off.serving === 'local', off && off.serving);
  const local = await page.evaluate(() =>
    fetch('/api/health', { cache: 'no-store' }).then(r => r.json()).catch(e => ({ error: String(e) })));
  ok('התשובה בנתק אינה מהמרכז', local && local.who !== 'central' && local.ok === true, JSON.stringify(local).slice(0, 70));
  await setOutage(false);

  await browser.close();
} catch (err) {
  fail++;
  console.log(`  ✗ ${err.message}`);
} finally {
  shutdown();
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
