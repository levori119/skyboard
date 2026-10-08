#!/usr/bin/env node
// מעטפת ל-electron-builder: מזריקה את גרסת המערכת מ-src/version.ts לעמדה הארוזה.
//
// בלעדיה electron-builder לוקח את `version` מ-package.json, שתקוע על 1.0.0 -
// והמתקין יצא `Setup-1.0.0.exe`, ו-app.getVersion() ומאפייני הקובץ ב-Windows
// הראו 1.0.0 בזמן שמסך הכניסה הראה את הגרסה האמיתית.
//
// בכוונה **לא** מסנכרנים את package.json ב-`version:bump`: שורת גרסה בו (וב-lock)
// בכל קומיט היא קונפליקט ב-rebase של כל שני סוכנים. src/version.ts נשאר מקור-אמת
// יחיד, והגרסה נכנסת לאריזה דרך extraMetadata - רק ברגע הבנייה.
//
// שימוש: כמו electron-builder, כל הארגומנטים עוברים כמו שהם.
//   node scripts/electron-builder.mjs --config electron-builder.station.json
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function readAppVersion(src) {
  const v = src.match(/APP_VERSION\s*=\s*'([^']*)'/)?.[1];
  if (!v || !/^\d+\.\d+\.\d+$/.test(v)) return null;
  return v;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const version = readAppVersion(readFileSync(join(root, 'src', 'version.ts'), 'utf8'));
  if (!version) {
    console.error('✖ לא נמצאה APP_VERSION חוקית ב-src/version.ts');
    process.exit(1);
  }
  console.log(`📦 electron-builder - גרסה ${version} (מ-src/version.ts)`);
  const args = [...process.argv.slice(2), `-c.extraMetadata.version=${version}`];
  const r = spawnSync('npx', ['electron-builder', ...args], { cwd: root, stdio: 'inherit', shell: true });
  process.exit(r.status ?? 1);
}
