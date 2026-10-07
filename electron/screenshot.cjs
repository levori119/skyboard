// צילום מסך (כפתור 📷) - צד העמדה (Electron).
//
// התהליך הראשי מצלם את החלון ב-capturePage - פיקסל-לפיקסל כמו שהפקח רואה,
// כולל אריחי מפה, קנבס ו-WebGL (תלת-ממד) שצילום DOM מפספס - וכותב ישר
// ל-Downloads של המשתמש. בלי דיאלוג "שמור בשם": לחיצה אחת, קובץ אחד.
//
// ⚠️ העמוד מוסר **שם קובץ בלבד**. התיקייה נקבעת כאן (app.getPath('downloads')),
// והשם עובר safePngName: חיתוך לשם בלבד + סיומת png. כך עמוד עוין שיושב על
// ה-origin שלנו יכול לכל היותר לשים PNG ב-Downloads, ולא לכתוב לשום מקום אחר.

const fs = require('fs');
const path = require('path');

const FALLBACK = 'SKYKING.png';

/** שם קובץ בטוח: בלי תיקיות, בלי תווים אסורים, תמיד ‎.png */
function safePngName(name) {
  if (typeof name !== 'string') return FALLBACK;
  // גם '\' וגם '/' - path.basename של POSIX לא מכיר את המפריד של Windows
  const base = name.split(/[\\/]/).pop() || '';
  const clean = base.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '');
  if (!clean) return FALLBACK;
  return /\.png$/i.test(clean) ? clean : `${clean}.png`;
}

/** כותב את התמונה לתיקייה בלי לדרוס קובץ קיים ("a (2).png") */
function saveScreenshot({ dir, name, png }) {
  if (!png || !png.length) return { ok: false, reason: 'empty' };
  const file = safePngName(name);
  const ext = path.extname(file);
  const stem = file.slice(0, -ext.length);
  for (let i = 1; i < 1000; i++) {
    const full = path.join(dir, i === 1 ? file : `${stem} (${i})${ext}`);
    try {
      // 'wx' - נכשל אם הקובץ קיים, בלי חלון זמן בין בדיקה לכתיבה
      fs.writeFileSync(full, png, { flag: 'wx' });
      return { ok: true, path: full };
    } catch (e) {
      if (e && e.code === 'EEXIST') continue;
      return { ok: false, reason: 'write', error: String(e && e.message || e) };
    }
  }
  return { ok: false, reason: 'exists' };
}

module.exports = { safePngName, saveScreenshot };
