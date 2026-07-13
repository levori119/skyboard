#!/usr/bin/env node
/**
 * ממיר  tr('טקסט עברי')  →  t('group.key')  לפי scripts/.i18n-keymap.json.
 * אחרי ההמרה, המחרוזת העברית חיה **רק** ב-registry — לא בקוד.
 * כך אפשר לשנות גם עברית וגם אנגלית בלי לגעת בקוד.
 */
import fs from 'fs';
import path from 'path';

const keymap = JSON.parse(fs.readFileSync('scripts/.i18n-keymap.json', 'utf8'));
const write = process.argv.includes('--write');

const FILES = fs.readdirSync('src/components', { recursive: true })
  .filter(f => typeof f === 'string' && f.endsWith('.tsx'))
  .map(f => path.join('src/components', f).split(path.sep).join('/'));

let totalRepl = 0, totalMiss = 0;
const missing = new Set();

for (const f of FILES) {
  let src = fs.readFileSync(f, 'utf8');
  if (!/\btr\(/.test(src)) continue;
  let n = 0;

  src = src.replace(/\btr\(\s*("(?:\\.|[^"\\])*")\s*\)/g, (m, lit) => {
    let he;
    try { he = JSON.parse(lit); } catch { return m; }
    const key = keymap[he];
    if (!key) { missing.add(he); totalMiss++; return m; }
    n++;
    return `t('${key}')`;
  });

  if (n === 0) continue;

  // החלפת ה-import של tr ב-useTranslation... אבל t חייב להיות ב-scope.
  // הפתרון: מייצאים t ברמת מודול מ-src/i18n/t.ts (עוטף את i18n.t) — אותה תבנית כמו tr.
  src = src.replace(/^import \{ tr \} from '(.*?)\/tr';$/m, (_m, p) => `import { t } from '${p}/t';`);

  totalRepl += n;
  if (write) fs.writeFileSync(f, src);
  console.log(`${path.basename(f).padEnd(28)} ${String(n).padStart(4)} החלפות`);
}

console.log(`\nסה"כ החלפות: ${totalRepl}`);
if (totalMiss) {
  console.log(`⚠️ לא נמצאו במפה: ${totalMiss} (${missing.size} ייחודיות)`);
  console.log([...missing].slice(0, 10));
}
console.log(write ? '✅ נכתב' : '(dry-run — הוסף --write)');
