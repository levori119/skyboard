#!/usr/bin/env node
/**
 * codemod משלים — עוטף JSX text ש**צמוד לביטוי**:
 *     {icon} תצוגה {arrow}   →   {icon} {tr('ctrl.view')} {arrow}
 *
 * ה-codemod הראשון חיפש רק `>טקסט<` ולכן פספס טקסט שיושב בין `}` ל-`{`.
 * זה היה הבאג: "תצוגה" בסרגל העליון נשאר בעברית באנגלית.
 *
 * שמרנות (כדי לא לשבור קוד):
 *   - שורה אחת בלבד
 *   - נדחה אם התוכן נראה כמו קוד (=>, ;, `, ${, style, className...)
 *   - **נדחה אם יש `$` בתוכן או backtick בשורה** — סימן ל-template literal, לא ל-JSX text
 *
 * שימוש:  node scripts/i18n-codemod-adjacent.mjs [--write]
 */
import fs from 'fs';
import path from 'path';

const write = process.argv.includes('--write');
const HEB = /[֐-׿]/;

// דחייה של קוד. שני ניסיונות קודמים היו חלשים מדי — tsc תפס את שניהם:
//   1. טרנרי בתוך style object:   } : fzFlashMsg.startsWith('אין') || ... ? {
//   2. attributes בתוך תגית:      } mode="full" label="כותרת" size={
// שניהם "טקסט" בין } ל-{ שמכיל עברית — אבל אינם JSX text.
const CODEISH = [
  /=>|;|`|\$|\breturn\b/,          // תחביר בסיסי
  /\|\||&&|\?|===|!==/,            // אופרטורים לוגיים/טרנרי
  /\w\.\w/,                        // גישה לשדה:  obj.prop
  /\w\(/,                          // קריאה לפונקציה:  fn(   ("GRF (" עם רווח — מותר)
  /\w\s*=/,                        // attribute:  label="..."  /  size={...}
  /\bstyle\b|\bclassName\b/,
];
const isCode = s => CODEISH.some(re => re.test(s));

const JSX_TEXT = /([>}])([^<>{}\n]*[֐-׿][^<>{}\n]*)([<{])/g;

const walk = d => fs.readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

const files = [...walk('src/components').filter(f => f.endsWith('.tsx')), 'src/App.tsx'];
const collected = new Set();
let total = 0;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  let n = 0;

  const out = lines.map(line => {
    if (line.includes('`')) return line;            // template literal — לא נוגעים
    // ⚠️ regex literal: `{` ו-`}` הם כמתים ({2,5}) — ה-regex שלנו רואה בהם גבולות JSX
    //    ובולע את תוכן ה-regex. **tsc לא תופס** (הליטרל נשאר תקין תחבירית) — היה
    //    נשבר רק בזמן ריצה. דוגמה שנשברה: /\b(\d{2,5})\s+עד\s+(\d{2,5})\b/
    if (/\/[^/\s]*\\[dwsb]/.test(line) || /\.match\(|\.split\(|\.replace\(|\.test\(/.test(line)) return line;
    return line.replace(JSX_TEXT, (m, open, raw, close) => {
      const text = raw.trim();
      if (!text || !HEB.test(text) || isCode(raw)) return m;
      if (open === '>' && close === '<') return m;  // כבר טופל ב-codemod הראשון
      const lead = raw.match(/^\s*/)[0];
      const tail = raw.match(/\s*$/)[0];
      collected.add(text);
      n++;
      return `${open}${lead}{tr(${JSON.stringify(text)})}${tail}${close}`;
    });
  }).join('\n');

  if (n === 0) continue;
  total += n;
  console.log(`${path.basename(f).padEnd(28)} ${String(n).padStart(4)}`);
  if (write) fs.writeFileSync(f, out);
}

console.log(`\nסה"כ: ${total} עטיפות | ${collected.size} מחרוזות ייחודיות`);
fs.writeFileSync('scripts/.i18n-adjacent-extracted.json', JSON.stringify([...collected].sort(), null, 1));
console.log(write ? '✅ נכתב' : '(dry-run — הוסף --write)');
