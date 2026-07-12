#!/usr/bin/env node
/**
 * codemod: עוטף טקסט תצוגה עברי ב-tr().
 *
 * עוטף **רק**:
 *   1. JSX text nodes:      >בטל<            → >{tr('בטל')}<
 *   2. attributes תצוגה:    title="בטל"      → title={tr('בטל')}
 *
 * **לא נוגע** במחרוזות אחרות (literals) — הן עלולות להיות ערכי-נתונים
 * (סטטוסים כמו 'תקין'/'עוזב אזור') שמושווים/נשמרים ב-DB. תרגומם ישבור לוגיקה.
 *
 * שימוש:  node scripts/i18n-codemod.mjs <file> [--write]
 */
import fs from 'fs';

const file = process.argv[2];
const write = process.argv.includes('--write');
if (!file) { console.error('usage: i18n-codemod.mjs <file> [--write]'); process.exit(1); }

const HEB = /[֐-׿]/;
let src = fs.readFileSync(file, 'utf8');
const collected = new Set();
let nText = 0, nAttr = 0;

// ── 1. attributes תצוגה: title="..." / placeholder='...' ─────────────────────
src = src.replace(
  /\b(title|placeholder|aria-label|alt)=(["'])([^"'\n{}]*)\2/g,
  (m, attr, q, val) => {
    if (!HEB.test(val)) return m;
    collected.add(val);
    nAttr++;
    return `${attr}={tr(${JSON.stringify(val)})}`;
  }
);

// ── 2. JSX text nodes:  >טקסט עברי<  ─────────────────────────────────────────
// חייב להיות **חד-שורתי**: שתי מחלקות התווים אוסרות \n. (באג קודם: המחלקה השנייה
// התירה \n, ולכן ההתאמה בלעה שורות קוד שלמות עד ה-'<' הבא ושברה את הקובץ.)
const CODEISH = /=>|;|\/\/|`|\$\{|\breturn\b|=\s*['"]/; // סימני קוד — לא טקסט תצוגה
src = src.replace(/>([^<>{}\n]*[֐-׿][^<>{}\n]*)</g, (m, raw) => {
  const text = raw.trim();
  if (!text || !HEB.test(text)) return m;
  if (CODEISH.test(raw)) return m; // ליתר ביטחון — נראה כמו קוד, לא נוגעים
  const lead = raw.match(/^\s*/)[0];
  const tail = raw.match(/\s*$/)[0];
  collected.add(text);
  nText++;
  return `>${lead}{tr(${JSON.stringify(text)})}${tail}<`;
});

console.log(`JSX text עטופים: ${nText}`);
console.log(`attributes עטופים: ${nAttr}`);
console.log(`מחרוזות ייחודיות: ${collected.size}`);

if (write) {
  fs.writeFileSync(file, src);
  console.log(`✅ נכתב: ${file}`);
} else {
  console.log('(dry-run — הוסף --write כדי לכתוב)');
}

// מייצא את רשימת המחרוזות לתרגום
fs.writeFileSync('scripts/.i18n-extracted.json', JSON.stringify([...collected].sort(), null, 1));
console.log('רשימת המחרוזות: scripts/.i18n-extracted.json');
