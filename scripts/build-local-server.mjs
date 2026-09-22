// אריזת שרת ה-API המקומי לקובץ אחד, כדי שהוא באמת יגיע לעמדה המותקנת.
//
// למה זה קיים: `startLocalDbServer` ב-electron-main מריץ `fork` על
// `server/local.js`, אבל שלושת קובצי ה-electron-builder מחריגים
// `"!server/**/*"` ו-`"!node_modules/**/*"`. התוצאה הייתה שהמאגר המקומי עבד
// **רק** כשמריצים Electron מתוך הריפו: בכל התקנה מותקנת `fs.existsSync`
// נכשל, הפונקציה חזרה בשקט, והפקח ראה "נתק יאפשר צפייה בלבד" - לנצח.
//
// למה bundle ולא "להוסיף server/** לאריזה": ה-tree הוא 81 חבילות (express,
// cors, pg והתלויות שלהן). רשימה כזו ב-JSON מתיישנת בכל `npm i`, ומתיישנת
// **בשקט** - הבנייה עוברת והעמדה נשברת. כאן esbuild גוזר את הסגור בזמן
// בנייה, ומה שנארז הוא בדיוק מה שהקוד צורך.
//
// ⚠️ **PGlite נשאר חיצוני.** הוא 16MB של WASM + data שנטענים מהדיסק בזמן
// ריצה; bundling שלו היה שובר את טעינתם. הוא נארז כחבילה ומוצא מה-asar
// (`asarUnpack`) - ראה §asar למטה.
//
// ⚠️ **§asar.** התהליך הבן הוא Node רגיל, ולא Electron. Node אינו יודע לקרוא
// מתוך `app.asar` - ולכן גם ה-bundle וגם PGlite חייבים לשבת ב-`asarUnpack`,
// אחרת ה-fork נכשל ב-MODULE_NOT_FOUND. זו אותה תקלה שהסתירה את הפיצ'ר עד כה,
// רק במסווה אחר.

import { build } from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'electron', 'local-server.mjs');

/**
 * מה נשאר מחוץ ל-bundle.
 *
 * `pg-native` ו-`cloudflare:sockets` הם ענפים אופציונליים ש-`pg` עוטף
 * ב-try/catch - הם לעולם אינם נטענים בעמדה, ובלי ההחרגה esbuild נופל על
 * "could not resolve" של משהו שממילא לא רץ.
 */
const EXTERNAL = ['@electric-sql/pglite', 'pg-native', 'cloudflare:sockets'];

const result = await build({
  entryPoints: [path.join(ROOT, 'server', 'local.js')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: EXTERNAL,
  // ESM מתוך CJS: express ו-pg הם CommonJS ומצפים ל-require/__dirname.
  // `inject` ולא `banner` - הוא מחליף מזהים **חופשיים** בלבד, ולכן מודול
  // שמגדיר לעצמו `__dirname` נשאר כמו שהוא (ראה scripts/local-server-shim.mjs).
  inject: [path.join(ROOT, 'scripts', 'local-server-shim.mjs')],
  // ⚠️ `require` דווקא ב-banner, וזו אינה חוסר-עקביות. esbuild מייצר לפלט ESM
  // עוזר `__require` שנוסחתו `typeof require !== "undefined" ? require : (זורק)`,
  // והוא יושב **מעל** כל המודולים - הזרקה פר-מודול אינה נראית לו. בלי הכרזה
  // ברמת הקובץ כל `require('events')` בתוך express/pg נופל בזמן ריצה על
  // "Dynamic require of "events" is not supported".
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
  logLevel: 'info',
  metafile: true,
});

const bytes = fs.statSync(OUT).size;
const modules = Object.keys(result.metafile.inputs).length;
console.log(`[local-server] ${path.relative(ROOT, OUT)} — ${(bytes / 1024).toFixed(0)}KB מתוך ${modules} מודולים`);
