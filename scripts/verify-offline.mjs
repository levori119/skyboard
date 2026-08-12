// אימות מקצה-לקצה של הדרישה: "כשאין קשר לשרת - לגרור פ"מ על מפה, לנקודת
// מעבר, להצטרפות, ולשמור במאגר מקומי".
//
// לא בדיקת יחידה: מרים את שרת ה-API המקומי האמיתי, מרים מעליו את שרת העמדה
// כשהשרת המרכזי מוגדר לכתובת **מתה**, ומבצע את הפעולות דרך HTTP בדיוק כפי
// שהדפדפן של הבקר עושה. בסוף בודק שהשורות באמת יושבות במאגר שעל הדיסק.
import { fork } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, '..', '.e2e-local-db');
const DEAD_REMOTE = 'http://127.0.0.1:9'; // discard port - לעולם לא עונה
const AUTH_SECRET = 'e2e-verification-secret-at-least-32-chars-long';
// גם בתהליך הזה: signToken חותם עם AUTH_SECRET שלו, וסוד שונה = 401.
// זו בדיוק המלכודת שהופכת את המעבר למאגר מקומי לניתוק הפקח - ראה §הזדהות.
process.env.AUTH_SECRET = AUTH_SECRET;

fs.rmSync(DB_DIR, { recursive: true, force: true });

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}${extra ? ' → ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? ' → ' + extra : ''}`); }
};

// ── 1. שרת ה-API המקומי ──────────────────────────────────────────────────────
console.log('1. מעלה את המאגר המקומי בעמדה (בלי רשת, בלי שרת מרכזי)...');
const child = fork(path.join(__dirname, '..', 'server', 'local.js'), [], {
  env: { ...process.env, SKYKING_LOCAL_DB_DIR: DB_DIR, SKYKING_LOCAL_API_PORT: '0', AUTH_SECRET },
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

// ── 2. שרת העמדה, מול שרת מרכזי מת ───────────────────────────────────────────
console.log('\n2. מעלה את שרת העמדה כשהשרת המרכזי מוגדר לכתובת מתה...');
const { createStationServer, STATION_STATUS_PATH } = await import('../electron/stationServer.cjs');
const station = await createStationServer({
  distDir: path.join(__dirname, '..', 'dist'),
  apiTarget: DEAD_REMOTE,
  localApiTarget: () => localApi.url,
  localMode: 'auto',
  timeoutMs: 2000,
});
ok('שרת העמדה עלה', !!station.url, station.url);

const S = (p) => `${station.url}${p}`;
const { signToken } = await import('../server/auth/token.js');
const token = signToken({ sub: 'e2e', crewMemberId: 1, is_admin: true, roles: ['admin'] });
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

const status0 = await (await fetch(S(STATION_STATUS_PATH))).json();
ok('העמדה מדווחת שהיא מתחילה מול השרת המרכזי', status0.serving === 'remote', `serving=${status0.serving}`);

// ── 3. הנתק מתגלה ────────────────────────────────────────────────────────────
console.log('\n3. הבקר מנסה לעבוד. השרת המרכזי מת - כמה בקשות ייכשלו עד שהעמדה תבין:');
for (let i = 1; i <= 3; i++) {
  const r = await fetch(S('/api/sectors'), { headers: H }).catch(e => ({ status: 0, err: e.message }));
  console.log(`   בקשה ${i}: HTTP ${r.status}`);
}
const status1 = await (await fetch(S(STATION_STATUS_PATH))).json();
ok('העמדה עברה למאגר המקומי אחרי סף הכשלים', status1.serving === 'local', `serving=${status1.serving}`);

// ── 4. הפעולות שהמשתמש ביקש ──────────────────────────────────────────────────
console.log('\n4. הפעולות שהתבקשו - דרך אותו /api בדיוק, בלי שרת:');

// גוף הבקשה בדיוק כפי שהלקוח שולח (callSign/onMap ב-camelCase, id מוחזר עם 's')
const mk = await fetch(S('/api/strips'), {
  method: 'POST', headers: H,
  body: JSON.stringify({ callSign: 'NETEK1', sq: '4321', alt: '150', task: 'CAP', manual_entry: true }),
});
const strip = await mk.json().catch(() => ({}));
const stripId = strip?.id;
ok('יצירת פ"מ בנתק', mk.ok && !!stripId, `HTTP ${mk.status} id=${stripId}`);

const drag = await fetch(S(`/api/strips/${stripId}`), {
  method: 'PUT', headers: H,
  body: JSON.stringify({ onMap: true, x: 0.31, y: 0.62 }),
});
const dragBody = await drag.json().catch(() => ({}));
ok('גרירת פ"מ על המפה בנתק', drag.ok, `HTTP ${drag.status} ${JSON.stringify(dragBody)}`);

const numericId = String(stripId).replace(/^s/, '');
const read = await fetch(S(`/api/strips`), { headers: H });
const raw = await read.json().catch(() => []);
const list = Array.isArray(raw) ? raw : (raw?.strips ?? []);
const found = list.find(s => String(s.id).replace(/^s/, '') === numericId);
ok('הפ"מ נקרא חזרה עם המיקום החדש', !!found && (found.on_map === true || found.onMap === true),
   found ? `on_map=${found.on_map ?? found.onMap} x=${found.x} y=${found.y}` : `לא נמצא (${list.length} פ"מים ברשימה)`);

// ── 5. באמת על הדיסק ─────────────────────────────────────────────────────────
console.log('\n5. אימות שהמידע יושב במאגר שעל המחשב האישי, ולא בזיכרון:');
const dbFiles = fs.existsSync(DB_DIR) ? fs.readdirSync(DB_DIR).length : 0;
ok('תיקיית המאגר קיימת על הדיסק', dbFiles > 0, `${DB_DIR} (${dbFiles} פריטים)`);

await station.close();
child.kill();
await new Promise(r => setTimeout(r, 500));

// קריאה ישירה מהמאגר, אחרי שהשרת נסגר - מוכיח התמדה ולא cache
process.env.SKYKING_LOCAL_DB = '1';
process.env.SKYKING_LOCAL_DB_DIR = DB_DIR;
const { createLocalPool } = await import('../server/db/localPool.js');
const pool = createLocalPool({ dataDir: DB_DIR });
const row = await pool.query(`SELECT callsign, on_map, x, y, map_lat FROM strips WHERE callsign='NETEK1'`);
ok('הפ"מ שרד את סגירת השרת ונקרא מהדיסק', row.rows.length === 1, JSON.stringify(row.rows[0]));
await pool.end();

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} עברו · ${fail} נכשלו`);
process.exit(fail === 0 ? 0 : 1);
