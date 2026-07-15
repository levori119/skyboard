#!/usr/bin/env node
// סורק JSX text שנמצא **צמוד לביטויים** — בין } ל-{ , בין > ל-{ , בין } ל-< .
// זה הפער שה-codemod הראשון פספס (הוא חיפש רק >טקסט<).
import fs from 'fs';
import path from 'path';

const HEB = /[֐-׿]/;
const CODEISH = /=>|;|`|\$\{|\breturn\b|=\s*['"]|\bstyle\b|\bclassName\b/;

// טקסט JSX מתחיל אחרי > או } ומסתיים לפני < או {
const JSX_TEXT = /([>}])([^<>{}\n]*[֐-׿][^<>{}\n]*)([<{])/g;

const walk = d => fs.readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

const files = [...walk('src/components').filter(f => f.endsWith('.tsx')), 'src/App.tsx'];
const found = new Map();
let occ = 0;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(JSX_TEXT)) {
    const raw = m[2];
    const text = raw.trim();
    if (!text || !HEB.test(text) || CODEISH.test(raw)) continue;
    // דילוג על מה שכבר נתפס ע"י ה-codemod הראשון (>טקסט<)
    if (m[1] === '>' && m[3] === '<') continue;
    found.set(text, (found.get(text) || 0) + 1);
    occ++;
  }
}

const arr = [...found.entries()].sort((a, b) => b[1] - a[1]);
console.log(`מחרוזות צמודות-לביטוי שפוספסו: ${arr.length} ייחודיות | ${occ} מופעים\n`);
arr.slice(0, 30).forEach(([s, c]) => console.log(String(c).padStart(3), '×', JSON.stringify(s)));
fs.writeFileSync('scripts/.i18n-adjacent.json', JSON.stringify(arr.map(([s]) => s), null, 1));
