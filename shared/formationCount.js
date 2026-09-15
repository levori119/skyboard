// כמה מטוסים צפויים בפ"מ - **כלל אחד** לשרת (יציאה מנקודת הצטרפות, נחת) ולעמדה
// (מעקב הקפה אוטומטי). ESM רגיל כמו shared/sanitizeHtml.js, כדי ששני הצדדים
// ייבאו את אותו קובץ.
//
// למה לא פשוט "מספר השורות ב-strip_aircraft": שורה נוצרת רק למטוס **שנגעו בו**.
// ברביעייה שרק למטוס 1 יש שורה, ספירת שורות אומרת "מטוס אחד" - ומטוס 1 שיצא
// להקפה (או נחת) הוציא את כל המבנה מהטבלה. ראה PATTERN_AUTOTRACK_SPEC.md §8.

/**
 * @param {{ rows: number, formation: unknown, indices: number[] | null }} p
 *   rows - שורות strip_aircraft · formation - number_of_formation (VARCHAR) ·
 *   indices - aircraft_indices של פ"מ מפוצל (`null` = המבנה כולו)
 * @returns {number}
 */
export function expectedFormationCount({ rows, formation, indices }) {
  if (Array.isArray(indices) && indices.length) return indices.length;
  return Math.max(Number(rows) || 0, parseInt(String(formation ?? ''), 10) || 0);
}
