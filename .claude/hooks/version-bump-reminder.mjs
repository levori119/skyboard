#!/usr/bin/env node
// SKY-KING - PreToolUse hook: bump גרסה לפני קימוט/דחיפה
// ------------------------------------------------------
// רץ לפני כל פקודת Bash/PowerShell. אם הפקודה מקמטת או דוחפת לגיט ו-src/version.ts
// לא בומפ - מזריק ל-Claude תזכורת מחייבת להריץ `npm run version:bump` תחילה.
//
// למה: הגרסה והתאריך מוצגים במסך הכניסה ובחלון העזרה בעמדה. קוד שנדחף בלי bump
// מציג למשתמש גרסה שקרית. ראה CLAUDE.md §גרסת המערכת ו-/ship.
//
// ההוק **לא חוסם** - הוא מזכיר. החסימה הקשיחה היא ב-.githooks/pre-push (דחיפה ל-main).
// עקיפה: SKIP_VERSION_BUMP=1 בתוך הפקודה עצמה.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const VERSION_FILE = 'src/version.ts';
const quiet = () => process.exit(0);

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  quiet();
}

const cmd = String(payload?.tool_input?.command ?? '');

// רק קימוט/דחיפה מעניינים אותנו
if (!/\bgit\b[\s\S]*\b(commit|push)\b/.test(cmd)) quiet();
// עקיפה מפורשת של המשתמש
if (/SKIP_VERSION_BUMP/.test(cmd)) quiet();
// ההוק של git עצמו יוצר קומיט גרסה - לא להזכיר עליו
if (/chore\(version\)/.test(cmd)) quiet();

const git = (args, cwd) =>
  execFileSync('git', args, { encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'ignore'] }).trim();

let root;
try {
  root = git(['rev-parse', '--show-toplevel']);
} catch {
  quiet(); // לא בריפו גיט
}

try {
  // (1) version.ts כבר שונה בעץ (modified / staged) - בומפ, אין מה להזכיר
  if (git(['status', '--porcelain', '--', VERSION_FILE], root)) quiet();
} catch {
  quiet();
}

// (2) כבר בומפ בקומיטים שטרם נדחפו ל-main - אין מה להזכיר
try {
  const base = git(['rev-parse', '--verify', '--quiet', 'origin/main'], root);
  if (base && git(['diff', '--name-only', `${base}...HEAD`, '--', VERSION_FILE], root)) quiet();
} catch {
  // אין origin/main מקומי - ממשיכים לתזכורת
}

const reminder =
  'SKY-KING - כלל אכוף: כל קימוט/דחיפה לגיט מתחיל ב-bump גרסה. ' +
  '`src/version.ts` לא עודכן. הרץ עכשיו `npm run version:bump`, הוסף את ' +
  '`src/version.ts` לאותו קומיט, ורק אז המשך. ' +
  'הזרימה המלאה: /ship. דילוג מכוון: SKIP_VERSION_BUMP=1 בתוך הפקודה.';

process.stdout.write(
  JSON.stringify({
    systemMessage: '🔖 הגרסה לא בומפה - יש להריץ npm run version:bump לפני הקימוט (CLAUDE.md §גרסת המערכת)',
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: reminder,
    },
  })
);
