// יוצר חבילת אתחול לעמדה עצמאית - צילום מלא של המרכז + משתמשי המיראז'.
//
// לעמדה שמותקנת ברשת מנותקת ולא תראה את השרת המרכזי לעולם (או לא בהתקנה):
// מריצים כאן, במחשב שיש לו קשר, ומעבירים את הקובץ לעמדה ביד.
//
//   npm run station:seed -- --central=https://sky-king.up.railway.app --token=<STATION_TOKEN>
//   npm run station:seed -- --out=D:\station-seed.json
//
// בלי דגלים: SKYKING_CENTRAL_URL ו-SKYKING_STATION_TOKEN (או STATION_TOKEN) מהסביבה / .env.
//
// בעמדה: מעתיקים את הקובץ ל-%APPDATA%\sky-king\station-seed.json (ליד config.json),
// או מצביעים עליו ב-SEED_FILE בקובץ התצורה. הוא נקלט בעלייה הבאה, ורק אם הוא
// חדש ממה שכבר בעמדה. ראה server/sync/stationSeed.js.
//
// ⚠️ הקובץ נושא את כל מידע השדה **ואת טביעות הסיסמה** של המורשים. מדיה מבוקרת בלבד.
import fs from 'node:fs';
import path from 'node:path';
import { fetchStationSeed } from '../server/sync/stationSeed.js';

const arg = (name) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const central = arg('central') || process.env.SKYKING_CENTRAL_URL || 'https://sky-king.up.railway.app';
const token = arg('token') || process.env.SKYKING_STATION_TOKEN || process.env.STATION_TOKEN || '';
const env = arg('env') || process.env.SKYKING_STATION_ENV || '1';
const out = path.resolve(arg('out') || 'station-seed.json');

if (!token) {
  console.error('חסר אסימון עמדה: --token=<STATION_TOKEN> (או SKYKING_STATION_TOKEN בסביבה)');
  process.exit(2);
}

const t0 = Date.now();
console.log(`מושך צילום מלא מ-${central} ...`);
try {
  const seed = await fetchStationSeed({ central, token, env, stationKey: 'station-seed' });
  fs.writeFileSync(out, JSON.stringify(seed));
  const rows = seed.tables.reduce((n, t) => n + t.rows.length, 0);
  const truncated = seed.tables.filter(t => t.truncated).map(t => t.table);
  console.log(`✅ ${out}`);
  console.log(`   ${seed.tables.length} טבלאות · ${rows} שורות · ${seed.mirageUsers.length} משתמשי מיראז' · `
    + `${(fs.statSync(out).size / 1e6).toFixed(1)}MB · ${((Date.now() - t0) / 1000).toFixed(1)}ש'`);
  console.log(`   זמן הצילום: ${seed.at}`);
  if (truncated.length) console.warn(`   ⚠️ טבלאות שנחתכו בתקרת השורות: ${truncated.join(', ')}`);
  console.log('   ⚠️ הקובץ מכיל טביעות סיסמה - להעביר במדיה מבוקרת בלבד.');
} catch (err) {
  console.error(`❌ החבילה לא נוצרה: ${err.message}`);
  process.exit(1);
}
