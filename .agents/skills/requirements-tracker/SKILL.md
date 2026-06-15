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

Use `code_execution`:

```javascript
const mod = require('/home/runner/workspace/.agents/skills/requirements-tracker/update-excel.js');
const result = await mod.addRows([
  { category: 'תקלה', description: 'תיאור קצר של הבעיה' },
  { category: 'תכולה חדשה', description: 'תיאור הפיצ\'ר' },
  // one object per split item
]);
console.log(result);
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
