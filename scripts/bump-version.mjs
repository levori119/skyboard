#!/usr/bin/env node
// עדכון גרסת המערכת: bump של patch (או גרסה מפורשת) + חותמת תאריך ושעה נוכחית.
// מקור-אמת יחיד: src/version.ts - נצרך במסך הכניסה ובחלון העזרה בעמדה.
//
// שימוש:
//   npm run version:bump          1.0.3 -> 1.0.4 + חותמת זמן עכשיו
//   npm run version:bump 1.1.0    גרסה מפורשת (minor/major)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(root, 'src', 'version.ts');

const src = readFileSync(FILE, 'utf8');
const current = src.match(/APP_VERSION\s*=\s*'([^']*)'/)?.[1];
if (!current) {
  console.error(`✖ לא נמצא APP_VERSION בקובץ ${FILE}`);
  process.exit(1);
}

const explicit = process.argv[2];
let next;
if (explicit) {
  if (!/^\d+\.\d+\.\d+$/.test(explicit)) {
    console.error(`✖ גרסה לא חוקית: "${explicit}" (צפוי X.Y.Z)`);
    process.exit(1);
  }
  next = explicit;
} else {
  const [maj, min, patch] = current.split('.').map(Number);
  next = `${maj}.${min}.${patch + 1}`;
}

const now = new Date();
const p = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;

const out = src
  .replace(/APP_VERSION\s*=\s*'[^']*'/, `APP_VERSION = '${next}'`)
  .replace(/APP_VERSION_DATE\s*=\s*'[^']*'/, `APP_VERSION_DATE = '${stamp}'`);

writeFileSync(FILE, out, 'utf8');

console.log(`✅ גרסה: ${current} -> ${next}   (${stamp})`);
console.log('   מוצג במסך הכניסה (פוטר) ובחלון העזרה בעמדה.');
console.log(`   git add src/version.ts && git commit -m "chore(version): v${next}"`);
