// מפעיל את אפליקציית העמדה (Electron) בפיתוח.
//
// למה סקריפט ולא `electron .` ישירות: טרמינלים מוטמעים (VS Code / Claude Code)
// מגדירים ELECTRON_RUN_AS_NODE=1 לתהליכי הבן שלהם. עם המשתנה הזה הבינארי של
// Electron רץ כ-Node רגיל, `app` יוצא undefined, והריצה מתה מיד עם
// "Cannot read properties of undefined (reading 'isPackaged')" - בלי שום חלון.
// כאן מנקים את המשתנה לפני ההרצה, כך שהעמדה עולה מכל טרמינל.
//
// דגלים (גם ב-Windows, בלי cross-env):
//   --url=<כתובת>   כתובת שהעמדה תטען (ברירת מחדל בפיתוח: vite מקומי)
//   --windowed      חלון רגיל עם מסגרת במקום kiosk, לתחזוקה ובדיקות
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const passthrough = [];
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--url=')) env.SKYKING_STATION_URL = arg.slice('--url='.length);
  else if (arg === '--windowed') env.SKYKING_WINDOWED = '1';
  else passthrough.push(arg);
}

const child = spawn(electronPath, ['.', ...passthrough], { stdio: 'inherit', env });
child.on('close', code => process.exit(code ?? 0));
