---
name: requirements-tracker
description: רישום כל בקשת משתמש לקובץ project-requirements.xlsx. הפעל אחרי כל בקשה, באג, או פיצ'ר — לפני המימוש. גרסה portable (עובדת גם מקומית וגם ב-Replit).
---

# Requirements Tracker (portable)

אחרי כל בקשת משתמש — רשום אותה ל-`project-requirements.xlsx` שבשורש הפרויקט.

> גרסה זו משתמשת בנתיב **יחסי** (`./project-requirements.xlsx`) כך שעובדת גם מקומית
> (Windows) וגם ב-Replit. הגרסה הישנה תחת `.agents/skills/` קיבעה נתיב Replit בלבד.

## מתי
אחרי כל בקשה — **לפני** המימוש.
**אכיפה:** hook מסוג `UserPromptSubmit` ב-`.claude/settings.json` מזריק תזכורת לכך בכל הודעת משתמש.

## ניהול הקובץ
הקובץ מנוהל **לפי תאריך ושעה**: אחרי כל הוספה הסקריפט ממיין את כל השורות
כרונולוגית לפי עמודה A (`YYYY-MM-DD HH:MM`).

## שלב 1 — סיווג
| סימן בהודעה | קטגוריה |
|---|---|
| "תקלה", "באג", "לא עובד", "שבור", "בעיה", "לא מעדכן", "לא מציג", התנהגות שגויה | **תקלה** |
| "רוצה", "הוסף", "צור", "חדש", "חסר", "feature", בניית משהו שלא קיים | **תכולה חדשה** |
| "שפר", "יותר", "שנה", "קצת", שינוי של משהו קיים | **שיפור לתכולה קיימת** |

## שלב 2 — פיצול
הודעה עם כמה בקשות נפרדות (רשימה ממוספרת, "גם X וגם Y") → שורה לכל פריט, מסווגת בנפרד.
תיאור תמציתי (עד ~120 תווים), בעברית.

## שלב 3 — כתיבה ל-Excel
הרץ דרך `bash` (לא code_execution — קונפליקט ESM/CJS):

```bash
node --input-type=commonjs << 'NODEJS'
async function main() {
  const XLSX = (await import('./node_modules/xlsx/xlsx.js')).default;
  const fs = require('fs');
  const FILE = './project-requirements.xlsx';
  const HEADERS = ['גרסה', 'תאריך ושעה', 'קטגוריה', 'תיאור', 'בוצע?', 'הערות'];
  let wb, ws;
  if (fs.existsSync(FILE)) {
    wb = XLSX.readFile(FILE);
    ws = wb.Sheets['דרישות'] || wb.Sheets[wb.SheetNames[0]];
  } else {
    wb = XLSX.utils.book_new();
    ws = XLSX.utils.aoa_to_sheet([HEADERS]);
    XLSX.utils.book_append_sheet(wb, ws, 'דרישות');
  }
  const now = new Date();
  const ts = `${now.toISOString().slice(0,10)} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const existing = XLSX.utils.sheet_to_json(ws, { header: 1 });
  // ── ערוך רק את rows: שורה לכל בקשה ──
  const rows = [
    { category: 'תכולה חדשה', description: 'תיאור הבקשה' },
  ];
  const header = existing[0] && existing[0].length ? existing[0] : HEADERS;
  // יישור שורות ישנות בנות 5 עמודות (ללא גרסה) לסכמת 6 העמודות
  const data = existing.slice(1).filter(r => r && r.length).map(r => r.length === 5 ? ['', ...r] : r);
  for (const row of rows) data.push(['', ts, row.category, row.description, '', '']);
  // ניהול לפי תאריך ושעה: מיון כרונולוגי קבוע לפי עמודה B (YYYY-MM-DD HH:MM ממוין לקסיקוגרפית)
  data.sort((a, b) => String(a[1] || '').localeCompare(String(b[1] || '')));
  const newWs = XLSX.utils.aoa_to_sheet([header, ...data]);
  newWs['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 26 }, { wch: 72 }, { wch: 14 }, { wch: 40 }];
  wb.Sheets[wb.SheetNames.includes('דרישות') ? 'דרישות' : wb.SheetNames[0]] = newWs;
  XLSX.writeFile(wb, FILE);
  console.log(`✅ נוספו ${rows.length} שורות (הקובץ ממוין לפי תאריך ושעה)`);
}
main().catch(console.error);
NODEJS
```

## שלב 4 — אישור
ענה למשתמש שורה אחת: `✅ נרשם בקובץ הדרישות` — ואז ממש.

## סכמת עמודות
| עמודה | כותרת | תוכן |
|---|---|---|
| A | גרסה | legacy (1.0.0–1.0.3 בשורות ישנות); בשורות חדשות ריק |
| B | תאריך ושעה | YYYY-MM-DD HH:MM (אוטומטי) — עמודת המיון |
| C | קטגוריה | תקלה / תכולה חדשה / שיפור לתכולה קיימת |
| D | תיאור | תיאור קצר בעברית |
| E | בוצע? | ריק / "כן" |
| F | הערות | הפניית קומיט / הסבר (בסימון רטרואקטיבי) |
```
