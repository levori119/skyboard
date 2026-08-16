// ─── תמונת סמל שמועלית ממסך הניהול — פענוח ואימות ────────────────────────────
// הסמלים נשמרים ב-DB כ-data URL (אותה תבנית כמו `maps.image_data`), ומוגשים
// חזרה כתמונה בינארית דרך `server/routes/emblem.js`. הפונקציה כאן היא **שער
// הכניסה היחיד**: כל כתיבה של סמל עוברת דרכה.
//
// למה נדחה SVG: הסמל מוגש מאותו origin של המערכת, ו-SVG הוא מסמך שיכול להריץ
// סקריפט. אותו שיקול קיים כבר בצד הלקוח (`isImageDataUrl` ב-src/utils/missionDesk.ts).

// תקרת גודל לתמונה מפוענחת. הלקוח מכווץ ל-350px לפני ההעלאה (~50KB), אז
// התקרה כאן היא רשת ביטחון מול העלאה ישירה דרך ה-API, לא מגבלת עבודה.
export const MAX_EMBLEM_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const DATA_URL_RE = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/**
 * מפענח data URL של סמל ומאמת אותו.
 * @param {unknown} value
 * @returns {{ mime: string, buffer: Buffer, dataUrl: string }}
 * @throws {Error} עם הודעה בעברית, מוכנה להחזרה ללקוח
 */
export function parseEmblemDataUrl(value) {
  if (typeof value !== 'string' || !value) {
    throw new Error('לא התקבלה תמונה');
  }
  const m = DATA_URL_RE.exec(value.trim());
  if (!m) {
    throw new Error('התמונה חייבת להישלח כ-data URL בקידוד base64');
  }
  const mime = m[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error(`סוג קובץ לא נתמך (${mime}) - PNG, JPEG, WebP או GIF בלבד`);
  }
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length === 0) {
    throw new Error('התמונה ריקה');
  }
  if (buffer.length > MAX_EMBLEM_BYTES) {
    throw new Error(`התמונה גדולה מדי (${Math.round(buffer.length / 1024)}KB) - התקרה היא ${Math.round(MAX_EMBLEM_BYTES / 1024)}KB`);
  }
  return { mime, buffer, dataUrl: value.trim() };
}
