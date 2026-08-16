// אימות מקצה-לקצה של העבודה המנותקת.
//
// לא בדיקת יחידה: מרים שרת מרכזי מדומה, את שרת ה-API המקומי האמיתי ואת שרת
// העמדה מעליהם, ומריץ את התרחיש כפי שהוא קורה במגדל - כניסה, נפילת הקשר,
// עבודה בנתק, והפעלה מחדש של העמדה בזמן שאין קשר.
//
// שלושת הדברים שנבדקים כאן ואי אפשר לבדוק בבדיקת יחידה:
//   1. הפקח **אינו מנותק** כשהקשר נופל באמצע משמרת (החלפת אסימון).
//   2. הפקח **יכול להיכנס** לעמדה שעולה כשהיא כבר מנותקת (אסמכתא שמורה).
//   3. גרירת פ"מ בנתק **נשמרת על הדיסק** ושורדת סגירה של השרת.
import { fork } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DB_DIR = path.join(ROOT, '.e2e-local-db');

const PERSONAL = '1234567';
const PASSWORD = 'סיסמת-בדיקה-1234';

fs.rmSync(DB_DIR, { recursive: true, force: true });

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}${extra ? ' → ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? ' → ' + extra : ''}`); }
};

// ── שרת מרכזי מדומה ──────────────────────────────────────────────────────────
// מנפיק אסימון בפורמט של SKY-KING אבל **בסוד משלו**. זה בדיוק המצב האמיתי:
// לשרת המקומי סוד אחר, ולכן בלי גשר הזהות האסימון הזה נדחה אצלו ב-401.
const b64url = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
const centralToken = `v1.${b64url({
  crewMemberId: 42, personalId: PERSONAL, name: 'בקר בדיקה',
  isAdmin: true, isTeamLead: false, isManpower: false, approvedWorkstations: [],
  iat: Date.now(), exp: Date.now() + 3600_000,
})}.not-verifiable-by-the-local-server`; // ASCII בלבד: זו כותרת HTTP

let centralAlive = true;
const central = http.createServer((req, res) => {
  if (!centralAlive) { req.socket.destroy(); return; }
  const url = (req.url || '').split('?')[0];
  const json = (code, body) => {
    const b = Buffer.from(JSON.stringify(body), 'utf8');
    res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': b.length });
    res.end(b);
  };
  if (url === '/api/health') return json(200, { ok: true, phase: 'ready' });
  if (url === '/api/auth/mirage-login') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (body.personalNumber !== PERSONAL || body.password !== PASSWORD) {
        return json(401, { error: 'bad_credentials' });
      }
      json(200, {
        crewMember: { id: 42, name: 'בקר בדיקה', personal_id: PERSONAL, is_admin: true, approved_workstations: [] },
        roles: ['admin'], source: 'mirage', token: centralToken, expiresInMs: 3600_000,
      });
    });
    return;
  }
  return json(200, []);
});
await new Promise(r => central.listen(0, '127.0.0.1', r));
const CENTRAL_URL = `http://127.0.0.1:${central.address().port}`;

// ── 1. המאגר המקומי ──────────────────────────────────────────────────────────
console.log('1. מעלה את המאגר המקומי בעמדה (סוד חתימה משלו, לא של המרכזי)...');
const child = fork(path.join(ROOT, 'server', 'local.js'), [], {
  // בכוונה בלי AUTH_SECRET: העמדה מייצרת סוד משלה, כמו בשטח.
  env: { ...process.env, SKYKING_LOCAL_DB_DIR: DB_DIR, SKYKING_LOCAL_API_PORT: '0', AUTH_SECRET: '' },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
child.stdout.on('data', d => process.stdout.write('   ' + d));
child.stderr.on('data', d => process.stderr.write('   ! ' + d));

const localApi = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('השרת המקומי לא עלה תוך 120ש')), 120_000);
  child.on('message', m => {
    if (m?.type === 'local-api-ready') { clearTimeout(t); resolve(m); }
    if (m?.type === 'local-api-failed') { clearTimeout(t); reject(new Error(m.error)); }
  });
  child.on('exit', c => { clearTimeout(t); reject(new Error(`השרת המקומי יצא עם קוד ${c}`)); });
});
ok('המאגר המקומי עלה', !!localApi.url, localApi.url);

// ── 2. שרת העמדה ─────────────────────────────────────────────────────────────
console.log('\n2. מעלה את שרת העמדה מול השרת המרכזי (חי)...');
const { createStationServer, STATION_STATUS_PATH } = await import('../electron/stationServer.cjs');
const station = await createStationServer({
  distDir: path.join(ROOT, 'dist'),
  apiTarget: CENTRAL_URL,
  localApiTarget: () => localApi.url,
  localMode: 'auto',
  timeoutMs: 2000,
});
const S = (p) => `${station.url}${p}`;
const status0 = await (await fetch(S(STATION_STATUS_PATH))).json();
ok('העמדה משרתת מהשרת המרכזי', status0.serving === 'remote', `serving=${status0.serving}`);

// ── 3. כניסת הפקח ────────────────────────────────────────────────────────────
console.log('\n3. הפקח נכנס לעמדה בזמן שיש קשר:');
const login = await fetch(S('/api/auth/mirage-login'), {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ personalNumber: PERSONAL, password: PASSWORD }),
});
const loginBody = await login.json();
ok('הכניסה הצליחה מול המרכזי', login.ok && loginBody.source === 'mirage', `source=${loginBody.source}`);

await new Promise(r => setTimeout(r, 1500)); // שמירת האסמכתא רצה אחרי התשובה
const status1 = await (await fetch(S(STATION_STATUS_PATH))).json();
ok('העמדה שמרה אסמכתא לעבודה בנתק', status1.offlineSessions === 1, `sessions=${status1.offlineSessions}`);

const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${loginBody.token}` };

// ── 4. הקשר נופל באמצע משמרת ─────────────────────────────────────────────────
console.log('\n4. הכבל מנותק באמצע המשמרת:');
centralAlive = false;
for (let i = 1; i <= 3; i++) {
  const r = await fetch(S('/api/sectors'), { headers: H }).catch(() => ({ status: 0 }));
  process.stdout.write(`   בקשה ${i}: HTTP ${r.status}  `);
}
console.log();
const status2 = await (await fetch(S(STATION_STATUS_PATH))).json();
ok('העמדה עברה למאגר המקומי', status2.serving === 'local', `serving=${status2.serving}`);

// ── 5. הדרישה: הפקח לא מנותק ─────────────────────────────────────────────────
console.log('\n5. הפקח ממשיך לעבוד עם אותו אסימון בדיוק, בלי להתחבר מחדש:');
const mk = await fetch(S('/api/strips'), {
  method: 'POST', headers: H,
  body: JSON.stringify({ callSign: 'NETEK1', sq: '4321', alt: '150', task: 'CAP', manual_entry: true }),
});
const strip = await mk.json().catch(() => ({}));
ok('יצירת פ"מ בנתק (האסימון המרכזי הוחלף במקומי)', mk.ok && !!strip?.id, `HTTP ${mk.status} id=${strip?.id}`);

const drag = await fetch(S(`/api/strips/${strip?.id}`), {
  method: 'PUT', headers: H, body: JSON.stringify({ onMap: true, x: 0.31, y: 0.62 }),
});
ok('גרירת פ"מ על המפה בנתק', drag.ok, `HTTP ${drag.status}`);

const list = await (await fetch(S('/api/strips'), { headers: H })).json().catch(() => []);
const numericId = String(strip?.id).replace(/^s/, '');
const found = (Array.isArray(list) ? list : []).find(s => String(s.id).replace(/^s/, '') === numericId);
// GET /api/strips מחזיר camelCase (on_map → onMap), בניגוד לשם העמודה ב-DB
ok('הפ"מ נקרא חזרה עם המיקום החדש', !!found && found.onMap === true,
   found ? `onMap=${found.onMap} x=${found.x} y=${found.y}` : 'לא נמצא');

// ── 6. הדרישה: כניסה לעמדה שכבר מנותקת ───────────────────────────────────────
console.log('\n6. העמדה מופעלת מחדש בזמן נתק - הפקח מתחבר בלי שרת:');
const offlineLogin = await fetch(S('/api/auth/mirage-login'), {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ personalNumber: PERSONAL, password: PASSWORD }),
});
const offlineBody = await offlineLogin.json();
ok('כניסה מקומית מול האסמכתא השמורה', offlineLogin.ok && offlineBody.source === 'local',
   `HTTP ${offlineLogin.status} source=${offlineBody.source}`);
ok('הזהות נשמרה (מנהל, מזהה איש צוות)', offlineBody?.crewMember?.id === 42, JSON.stringify(offlineBody?.roles));

const badLogin = await fetch(S('/api/auth/mirage-login'), {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ personalNumber: PERSONAL, password: 'סיסמה-שגויה' }),
});
ok('סיסמה שגויה נדחית גם בנתק', badLogin.status === 401, `HTTP ${badLogin.status}`);

const strangerLogin = await fetch(S('/api/auth/mirage-login'), {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ personalNumber: '7654321', password: 'כל-סיסמה' }),
});
ok('מי שלא נכנס בעמדה הזו אינו נכנס בנתק', strangerLogin.status === 403, `HTTP ${strangerLogin.status}`);

// האסימון מהכניסה המקומית עובד על המאגר המקומי
const localTokenWorks = await fetch(S('/api/strips'), {
  headers: { Authorization: `Bearer ${offlineBody.token}` },
});
ok('האסימון מהכניסה המקומית תקף', localTokenWorks.ok, `HTTP ${localTokenWorks.status}`);

// ── 7. חזרת הקשר ─────────────────────────────────────────────────────────────
console.log('\n7. הקשר חוזר:');
centralAlive = true;
await new Promise(r => setTimeout(r, 6000)); // הבדיקה התקופתית רצה כל 5ש'
const status3 = await (await fetch(S(STATION_STATUS_PATH))).json();
ok('העמדה חזרה לשרת המרכזי מעצמה', status3.serving === 'remote', `serving=${status3.serving}`);

// ── 8. המידע על הדיסק ────────────────────────────────────────────────────────
console.log('\n8. המידע יושב על המחשב האישי, לא בזיכרון:');
await station.close();
central.close();
child.kill();
await new Promise(r => setTimeout(r, 800));

process.env.SKYKING_LOCAL_DB = '1';
const { createLocalPool } = await import('../server/db/localPool.js');
const pool = createLocalPool({ dataDir: DB_DIR });
const row = await pool.query(`SELECT callsign, on_map, x, y FROM strips WHERE callsign='NETEK1'`);
ok('הפ"מ שרד את סגירת השרת ונקרא מהדיסק', row.rows.length === 1, JSON.stringify(row.rows[0]));
const cred = await pool.query(`SELECT personal_number, expires_at FROM local_credentials`);
ok('האסמכתא שמורה על הדיסק עם תוקף', cred.rows.length === 1,
   cred.rows[0] ? `${cred.rows[0].personal_number} עד ${new Date(cred.rows[0].expires_at).toISOString().slice(0, 10)}` : '');
await pool.end();

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} עברו · ${fail} נכשלו`);
process.exit(fail === 0 ? 0 : 1);
