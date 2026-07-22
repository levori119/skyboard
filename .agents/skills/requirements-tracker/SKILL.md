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

## Versioning — כל דרישה חדשה = גרסה חדשה
Each requirement row gets its own **semantic version** in column A. The baseline of everything logged before this scheme is **1.0.0**.

- The patch number bumps by **+1 for every new requirement row** (`1.0.0` → `1.0.1` → `1.0.2` …).
- If a message splits into N rows, each row gets the next consecutive version (e.g. `1.0.3`, `1.0.4`).
- Read the **latest** version already in the sheet and bump from there — never reset.

> minor/major bumps are manual (the team decides "מעכשיו 1.1.0" / "2.0.0"); the skill only ever bumps the patch.

The latest version + timestamp are mirrored into `src/version.ts` (`APP_VERSION`, `APP_VERSION_DATE`), which the **LOGIN screen** displays on startup. The Step 3 script updates this file automatically — keep them in sync.

## Step 3 — Write to Excel

Use `bash` (NOT code_execution — ESM/CJS conflict in this workspace):

```bash
node --input-type=commonjs << 'NODEJS'
async function main() {
  const XLSX = (await import('/home/runner/workspace/node_modules/xlsx/xlsx.js')).default;
  const fs = require('fs');
  const FILE = '/home/runner/workspace/project-requirements.xlsx';
  const HEADERS = ['גרסה', 'תאריך ושעה', 'קטגוריה', 'תיאור', 'בוצע?', 'הערות'];
  const bumpPatch = v => {
    const m = String(v || '1.0.0').match(/(\d+)\.(\d+)\.(\d+)/);
    return m ? `${m[1]}.${m[2]}.${+m[3] + 1}` : '1.0.1';
  };
  let wb, ws;
  if (fs.existsSync(FILE)) {
    wb = XLSX.readFile(FILE);
    ws = wb.Sheets['דרישות'] || wb.Sheets[wb.SheetNames[0]];
  } else {
    wb = XLSX.utils.book_new();
    ws = XLSX.utils.aoa_to_sheet([HEADERS]);
    ws['!cols'] = [{ wch: 9 }, { wch: 16 }, { wch: 24 }, { wch: 72 }, { wch: 8 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'דרישות');
  }
  const now = new Date();
  const ts = `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const existing = XLSX.utils.sheet_to_json(ws, { header: 1 });
  let nextRow = existing.length;
  // find latest version already in the sheet (column A), baseline 1.0.0
  let ver = '1.0.0';
  for (let i = existing.length - 1; i >= 1; i--) {
    if (existing[i] && /\d+\.\d+\.\d+/.test(String(existing[i][0]))) { ver = String(existing[i][0]); break; }
  }
  const rows = [
    { category: 'תקלה', description: 'תיאור קצר של הבעיה' },
    { category: 'תכולה חדשה', description: 'תיאור הפיצ\'ר' },
  ];
  for (const row of rows) {
    ver = bumpPatch(ver); // each new requirement = next patch version
    XLSX.utils.sheet_add_aoa(ws, [[ver, ts, row.category, row.description, '', '']], { origin: nextRow });
    nextRow++;
  }
  XLSX.writeFile(wb, FILE);
  // keep the login-screen version in sync (single source of truth read by the frontend)
  const VFILE = FILE.replace('project-requirements.xlsx', 'src/version.ts');
  if (fs.existsSync(VFILE)) {
    let v = fs.readFileSync(VFILE, 'utf8');
    v = v.replace(/APP_VERSION\s*=\s*'[^']*'/, `APP_VERSION = '${ver}'`)
         .replace(/APP_VERSION_DATE\s*=\s*'[^']*'/, `APP_VERSION_DATE = '${ts}'`);
    fs.writeFileSync(VFILE, v);
  }
  console.log(`✅ נוספו ${rows.length} שורות (עד גרסה ${ver})`);
}
main().catch(console.error);
NODEJS
```

## Step 4 — Confirm
Reply to user with one line including the assigned version, e.g. `✅ נרשם בקובץ הדרישות — גרסה 1.0.1` — then proceed to implement.

## Column Schema

| Col | Header | Content |
|---|---|---|
| A | גרסה | Semantic version, patch bumps per requirement (1.0.0 baseline → 1.0.1 …) |
| B | תאריך ושעה | YYYY-MM-DD HH:MM (auto) |
| C | קטגוריה | תקלה / תכולה חדשה / שיפור לתכולה קיימת |
| D | תיאור | Short Hebrew description |
| E | בוצע? | Left empty for user |
| F | הערות | Left empty for user |
