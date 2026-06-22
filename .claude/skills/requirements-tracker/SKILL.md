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
  const HEADERS = ['תאריך ושעה', 'קטגוריה', 'תיאור', 'בוצע?', 'הערות'];
  let wb, ws;
  if (fs.existsSync(FILE)) {
    wb = XLSX.readFile(FILE);
    ws = wb.Sheets['דרישות'] || wb.Sheets[wb.SheetNames[0]];
  } else {
    wb = XLSX.utils.book_new();
    ws = XLSX.utils.aoa_to_sheet([HEADERS]);
    ws['!cols'] = [{ wch: 16 }, { wch: 26 }, { wch: 72 }, { wch: 10 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'דרישות');
  }
  const now = new Date();
  const ts = `${now.toISOString().slice(0,10)} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const existing = XLSX.utils.sheet_to_json(ws, { header: 1 });
  let nextRow = existing.length;
  // ── ערוך רק את rows: שורה לכל בקשה ──
  const rows = [
    { category: 'תכולה חדשה', description: 'תיאור הבקשה' },
  ];
  for (const row of rows) {
    XLSX.utils.sheet_add_aoa(ws, [[ts, row.category, row.description, '', '']], { origin: nextRow });
    nextRow++;
  }
  XLSX.writeFile(wb, FILE);
  console.log(`✅ נוספו ${rows.length} שורות`);
}
main().catch(console.error);
NODEJS
```

## שלב 4 — אישור
ענה למשתמש שורה אחת: `✅ נרשם בקובץ הדרישות` — ואז ממש.

## סכמת עמודות
| עמודה | כותרת | תוכן |
|---|---|---|
| A | תאריך ושעה | YYYY-MM-DD HH:MM (אוטומטי) |
| B | קטגוריה | תקלה / תכולה חדשה / שיפור לתכולה קיימת |
| C | תיאור | תיאור קצר בעברית |
| D | בוצע? | ריק / "כן" |
| E | הערות | ריק |
```
