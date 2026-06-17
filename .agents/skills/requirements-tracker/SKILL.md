---
name: requirements-tracker
description: After EVERY user request in this project, automatically classify it and append rows to the requirements Excel file at project-requirements.xlsx. Use this skill whenever the user writes any request, bug report, or feature ask. Triggers on every user message.
---

# Requirements Tracker

After every user message, log the request into `project-requirements.xlsx`.

## File Location
`/home/runner/workspace/project-requirements.xlsx`

## When to Run
After EVERY user request — do this BEFORE implementing the change.

## Step 1 — Classify

| Signal in message | Category |
|---|---|
| "תקלה", "באג", "לא עובד", "שבור", "בעיה", "טעות", "לא מעדכן", "לא מציג", "לא מופיע", wrong/unexpected behavior | **תקלה** |
| "רוצה", "הוסף", "צור", "חדש", "חסר", "SKILL", "feature", building something that doesn't exist | **תכולה חדשה** |
| "שפר", "יותר", "קטן יותר", "גדול יותר", "טיפה", "קצת", "שנה", changing how something existing works | **שיפור לתכולה קיימת** |

## Step 2 — Split
If the user message contains multiple distinct asks (numbered list, "גם X וגם Y", separate sentences with different subjects) → one row per item, each classified independently.

Keep each description concise (max ~120 chars), in Hebrew.

## Step 3 — Write to Excel

Use `bash` (NOT code_execution — ESM/CJS conflict in this workspace):

```bash
node --input-type=commonjs << 'NODEJS'
async function main() {
  const XLSX = (await import('/home/runner/workspace/node_modules/xlsx/xlsx.js')).default;
  const fs = require('fs');
  const FILE = '/home/runner/workspace/project-requirements.xlsx';
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
  const ts = `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const existing = XLSX.utils.sheet_to_json(ws, { header: 1 });
  let nextRow = existing.length;
  const rows = [
    { category: 'תקלה', description: 'תיאור קצר של הבעיה' },
    { category: 'תכולה חדשה', description: 'תיאור הפיצ\'ר' },
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

## Step 4 — Confirm
Reply to user with one line: `✅ נרשם בקובץ הדרישות` — then proceed to implement.

## Column Schema

| Col | Header | Content |
|---|---|---|
| A | תאריך ושעה | YYYY-MM-DD HH:MM (auto) |
| B | קטגוריה | תקלה / תכולה חדשה / שיפור לתכולה קיימת |
| C | תיאור | Short Hebrew description |
| D | בוצע? | Left empty for user |
| E | הערות | Left empty for user |
