// "פתח באפליקציה חיצונית" בחלון הקריאה - הקובץ נפתח ב-PowerPoint / Word /
// קורא ה-PDF של המחשב, ולא כלשונית דפדפן.
//
// למה דרך התהליך הראשי: הקובץ יושב בשרת מאחורי אסימון, ולשונית חדשה אינה
// נושאת אותו - היא קיבלה דף HTML במקום הקובץ (2026-10-11). העמוד מושך את
// הבתים עם האסימון, ומוסר אותם לכאן; כאן הם נכתבים לתיקייה זמנית קבועה
// ונפתחים ב-`shell.openPath` - כלומר באפליקציה שמערכת ההפעלה משייכת לסיומת.
//
// ⚠️ אבטחה - העמוד נטען מכתובת מרוחקת, והשם מגיע ממנו. לכן:
//   1. **שם בלבד** - כל נתיב נחתך; הכתיבה תמיד לתיקייה שנקבעת כאן.
//   2. **רק סיומות של מסמכים** - `openPath` על .exe / .bat / .lnk היה מריץ
//      אותו. עמוד עוין לא יכול להפיל קובץ הרצה ולהפעיל אותו.

const fs = require('fs');
const os = require('os');
const path = require('path');

/** מה מותר לפתוח באפליקציה חיצונית: מסמכים ותמונות בלבד. */
const OPENABLE_EXTS = [
  'pdf', 'pptx', 'ppt', 'ppsx', 'pps', 'docx', 'doc', 'rtf', 'odt', 'odp', 'ods',
  'xlsx', 'xls', 'xlsm', 'csv', 'txt',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp',
];

/** תקרה לקובץ בודד - כמו התקרה של PostgreSQL לשדה (1GB). */
const MAX_BYTES = 1024 * 1024 * 1024;

/** שם בטוח לקובץ, או null אם אסור לפתוח אותו. */
function safeDocName(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const base = raw.split(/[\\/]/).pop().trim();
  const clean = base.replace(/[<>:"|?*\x00-\x1f]/g, '_').slice(0, 180);
  const m = /\.([A-Za-z0-9]+)$/.exec(clean);
  if (!m || !OPENABLE_EXTS.includes(m[1].toLowerCase())) return null;
  return clean;
}

/**
 * כותב את הבתים לתיקייה הזמנית ופותח באפליקציה של מערכת ההפעלה.
 * @returns {Promise<{ok:true, path:string} | {ok:false, reason:string}>}
 */
async function openDocExternally({ shell, name, bytes, dir = path.join(os.tmpdir(), 'skyking-docs') }) {
  const fileName = safeDocName(name);
  if (!fileName) return { ok: false, reason: 'type' };
  const buf = bytes instanceof Uint8Array ? Buffer.from(bytes) : null;
  if (!buf || !buf.length) return { ok: false, reason: 'empty' };
  if (buf.length > MAX_BYTES) return { ok: false, reason: 'size' };
  await fs.promises.mkdir(dir, { recursive: true });
  const target = path.join(dir, fileName);
  try {
    await fs.promises.writeFile(target, buf);
  } catch {
    // הקובץ פתוח כבר ב-PowerPoint (נעול) - שם חדש במקום להיכשל
    const alt = path.join(dir, `${Date.now()}-${fileName}`);
    await fs.promises.writeFile(alt, buf);
    const err = await shell.openPath(alt);
    return err ? { ok: false, reason: 'open', error: err } : { ok: true, path: alt };
  }
  // openPath מחזיר מחרוזת שגיאה, או '' בהצלחה (למשל: אין אפליקציה לסיומת)
  const err = await shell.openPath(target);
  return err ? { ok: false, reason: 'open', error: err } : { ok: true, path: target };
}

module.exports = { safeDocName, openDocExternally, OPENABLE_EXTS };
