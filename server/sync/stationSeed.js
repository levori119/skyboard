// חבילת אתחול - עמדה שעולה בנתק מלא, גם אם מעולם לא ראתה את השרת המרכזי.
//
// **הבעיה:** המאגר המקומי מתמלא רק מהמראה (daemon.js), והמראה רצה רק כשיש
// קשר. עמדה שמותקנת ברשת מנותקת עולה עם מאגר ריק לגמרי - בלי סקטורים, בלי
// עמדות, בלי שדה, ובלי משתמשי מיראז'. כלומר אי אפשר אפילו להיכנס.
//
// **הפתרון:** צילום מראה מלא שנשמר לקובץ (`npm run station:seed`) ומגיע לעמדה
// ביד - דיסק און קי, או ארוז עם ההתקנה. אותו צילום בדיוק שהמראה מושכת, ונקלט
// באותה פונקציה (`ingestSnapshot`), כך שאין כאן מסלול טעינה שני שיכול להתפצל.
//
// **מתי נקלט:** רק אם הוא **חדש** ממה שכבר בעמדה. סימון הזמן (`snapshot-at`)
// נכתב גם כאן וגם בכל סיבוב מראה מוצלח, ולכן:
//   · עמדה חדשה - החבילה נקלטת
//   · עמדה שסונכרנה אחרי שהחבילה נוצרה - החבילה הישנה מדולגת ולא דורסת
//   · חבילה טרייה שהובאה לעמדה מנותקת - נקלטת, וכך מעדכנים עמדה בלי רשת
//
// ⚠️ **החבילה נושאת טביעות סיסמה** (משתמשי המיראז'). זה קובץ רגיש כמו המאגר
// עצמו, ומקומו במדיה מבוקרת - לא בתיקייה משותפת.

import fs from 'fs';
import path from 'path';
import { ingestSnapshot } from './mirror.js';
import { replaceMirageUsers } from '../auth/mirageReplica.js';

/** כמה טבלאות בבקשה - כמו בשירות המראה, מאותה סיבה (תקרת הזמן של הפרוקסי). */
const DEFAULT_BATCH = 12;

const MARKER_FILE = 'snapshot-at';

/** זמן הצילום האחרון שנקלט בעמדה (ms), או null. */
export function readSnapshotMarker(dataDir) {
  try {
    const v = Number(fs.readFileSync(path.join(dataDir, MARKER_FILE), 'utf8').trim());
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** רושם זמן צילום שנקלט. לא יורד אחורה - צילום ישן אינו "מחדש" את העמדה. */
export function writeSnapshotMarker(dataDir, atMs) {
  if (!dataDir || !Number.isFinite(atMs)) return;
  const prev = readSnapshotMarker(dataDir);
  if (prev && prev >= atMs) return;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, MARKER_FILE), String(atMs));
  } catch (err) {
    console.warn(`[seed] לא ניתן לרשום את זמן הצילום (${err.message})`);
  }
}

/**
 * צילום מלא מהמרכז לקובץ חבילה. משמש את `scripts/station-seed.mjs`.
 *
 * ⚠️ **כשל בכל חלק מפיל את כולו.** חבילה חלקית (חצי מהטבלאות, או בלי
 * משתמשים) הייתה עולה בעמדה כמאגר שנראה תקין וחסר בו מידע - גרוע יותר
 * מחבילה שלא נוצרה ומדווחת על כך.
 */
export async function fetchStationSeed({
  central, token, stationKey = 'seed', env = '1', batch = DEFAULT_BATCH, fetchImpl = fetch,
}) {
  const base = String(central || '').replace(/\/+$/, '');
  if (!base || !token) throw new Error('נדרשים כתובת השרת המרכזי ואסימון עמדה');
  const headers = { 'X-Station-Token': token, 'X-Station-Key': stationKey, 'X-Env': String(env), 'Cache-Control': 'no-store' };
  const get = async (p) => {
    const res = await fetchImpl(`${base}${p}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${p.replace(/\?.*/, '')}`);
    return res.json();
  };

  const { tables } = await get('/api/sync/mirror/tables');
  if (!Array.isArray(tables) || !tables.length) throw new Error('רשימת טבלאות ריקה');

  const out = { schema: 'public', at: null, tables: [], mirageUsers: [] };
  for (let i = 0; i < tables.length; i += batch) {
    const part = tables.slice(i, i + batch);
    const snap = await get(`/api/sync/mirror?tables=${encodeURIComponent(part.join(','))}`);
    out.schema = snap.schema || out.schema;
    // הזמן של החבילה הוא של החלק **הראשון** - המוקדם. כך עמדה שתתחבר אחר כך
    // לעולם לא תחשוב שהחבילה חדשה ממה שבאמת יש בה.
    out.at ??= snap.at;
    out.tables.push(...(snap.tables || []));
  }

  const mirage = await get('/api/sync/mirror/mirage-users');
  if (mirage?.ok !== true || !Array.isArray(mirage.users)) throw new Error('משתמשי המיראז\' לא התקבלו');
  out.mirageUsers = mirage.users;
  out.at ??= new Date().toISOString();
  return out;
}

/**
 * קולט חבילת אתחול אם היא חדשה ממה שבעמדה. לעולם אינו זורק - חבילה פגומה
 * אינה סיבה שהעמדה לא תעלה.
 *
 * @returns {Promise<{applied: boolean, reason?: string, at?: string, stats?: object, users?: number}>}
 */
export async function applySeedIfNewer({ pool, file, dataDir, schema = 'public', protectedKeys }) {
  if (!file || !fs.existsSync(file)) return { applied: false, reason: 'no_file' };

  let seed;
  try {
    seed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`[seed] חבילת האתחול פגומה (${file}): ${err.message}`);
    return { applied: false, reason: 'invalid' };
  }
  const atMs = Date.parse(seed?.at ?? '');
  if (!Array.isArray(seed?.tables) || !Number.isFinite(atMs)) {
    console.error(`[seed] חבילת האתחול אינה צילום תקין: ${file}`);
    return { applied: false, reason: 'invalid' };
  }

  const have = readSnapshotMarker(dataDir);
  if (have && have >= atMs) return { applied: false, reason: 'older', at: seed.at };

  // ⚠️ `pool.query` ולא `pool.connect()`: במאגר המקומי יש חיבור יחיד.
  const q = (sql, params) => pool.query(sql, params);
  const keys = protectedKeys ? await protectedKeys(q) : new Set();
  const stats = await ingestSnapshot({ query: q }, schema, seed, keys);

  let users = 0;
  if (Array.isArray(seed.mirageUsers)) {
    users = (await replaceMirageUsers(pool, seed.mirageUsers)).count;
  }
  writeSnapshotMarker(dataDir, atMs);
  console.log(`[seed] חבילת אתחול נקלטה (${seed.at}): ${stats.tables} טבלאות · ${stats.upserted} שורות · ${users} משתמשי מיראז'`
    + (stats.failedTables.length ? ` · נכשלו: ${stats.failedTables.map(f => f.table).join(', ')}` : ''));
  return { applied: true, at: seed.at, stats, users };
}
