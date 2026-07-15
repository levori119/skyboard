#!/usr/bin/env node
/**
 * codemod שלישי — JSX text שה-`>`/`}` וה-`<`/`{` שלו **בשורות סמוכות**:
 *
 *     <button ...>
 *       🖊️ דסק חופשי        ← שני ה-codemods הקודמים עבדו שורה-שורה ופספסו את זה
 *     </button>
 *
 *     ⚙ הגדרות עמדה {arrow}   ← ה-`>` בשורה הקודמת
 *
 * הטקסט עצמו חייב להיות בשורה אחת ובלי <>{} — רק הגבולות יכולים לחצות שורות.
 */
import fs from 'fs';
import path from 'path';

const write = process.argv.includes('--write');
const HEB = /[֐-׿]/;

const CODEISH = [
  /=>|;|`|\$|\breturn\b/,
  /\|\||&&|\?|===|!==/,
  /\w\.\w/,
  /\w\(/,
  /\w\s*=/,
  /\bstyle\b|\bclassName\b/,
];
const isCode = s => CODEISH.some(re => re.test(s));

// גבולות יכולים לחצות שורות (\s), אבל הטקסט עצמו — שורה אחת, בלי <>{}
const JSX_TEXT = /([>}])(\s*)([^<>{}\n]*[֐-׿][^<>{}\n]*?)(\s*)([<{])/g;

const walk = d => fs.readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = [...walk('src/components').filter(f => f.endsWith('.tsx')), 'src/App.tsx'];

const collected = new Set();
let total = 0;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let n = 0;

  const out = src.replace(JSX_TEXT, (m, open, lead, raw, tail, close, off) => {
    const text = raw.trim();
    if (!text || !HEB.test(text) || isCode(raw)) return m;

    // השורה שבה יושב הטקסט — הגנה מפני regex/template literal
    const lineStart = src.lastIndexOf('\n', off + open.length + lead.length) + 1;
    const lineEnd = src.indexOf('\n', lineStart);
    const line = src.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
    if (line.includes('`')) return m;
    if (/\.(match|split|replace|test)\(/.test(line)) return m;

    collected.add(text);
    n++;
    return `${open}${lead}{tr(${JSON.stringify(text)})}${tail}${close}`;
  });

  if (n === 0) continue;
  total += n;
  console.log(`${path.basename(f).padEnd(28)} ${String(n).padStart(4)}`);
  if (write) fs.writeFileSync(f, out);
}

console.log(`\nסה"כ: ${total} עטיפות | ${collected.size} ייחודיות`);
fs.writeFileSync('scripts/.i18n-multiline-extracted.json', JSON.stringify([...collected].sort(), null, 1));
console.log(write ? '✅ נכתב' : '(dry-run — הוסף --write)');
