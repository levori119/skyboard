// רוחב פאנל "פ"מ עמדה" (הסרגל שליד המפה).
//
// הפקח קובע **רוחב בסיס** בספליטר, והרוחב בפועל הוא הבסיס כפול גודל הגופן של
// הלוח (+/-, utils/stripListSort). כך הגדלת הטקסט מרחיבה את הפאנל באותו יחס,
// ושום כרטיס לא נחתך - בלי שהפקח יצטרך לגרור אחרי כל לחיצה על +.

export const SIDEBAR_BASE_DEFAULT = 240;
export const SIDEBAR_BASE_MIN = 180;
export const SIDEBAR_BASE_MAX = 520;
/** תקרה לרוחב בפועל (אחרי ההכפלה בגופן) - שהפאנל לא יבלע את המפה */
export const SIDEBAR_WIDTH_MAX = 760;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** הרוחב בפועל: בסיס × גודל הגופן, מעוגל, בגבולות */
export function effectiveSidebarWidth(base: number, scale: number): number {
  const b = clamp(Number.isFinite(base) ? base : SIDEBAR_BASE_DEFAULT, SIDEBAR_BASE_MIN, SIDEBAR_BASE_MAX);
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.round(clamp(b * s, SIDEBAR_BASE_MIN, SIDEBAR_WIDTH_MAX));
}

/** גרירת הספליטר לרוחב W (ביחידות העמוד) → רוחב הבסיס שיישמר */
export function sidebarBaseFromWidth(width: number, scale: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.round(clamp(width / s, SIDEBAR_BASE_MIN, SIDEBAR_BASE_MAX));
}

/** ערך שנשמר (localStorage) → בסיס תקין. כל דבר אחר - ברירת המחדל */
export function parseSidebarBase(raw: unknown): number {
  const n = Number(raw);
  if (raw == null || raw === '' || !Number.isFinite(n) || n <= 0) return SIDEBAR_BASE_DEFAULT;
  return Math.round(clamp(n, SIDEBAR_BASE_MIN, SIDEBAR_BASE_MAX));
}
