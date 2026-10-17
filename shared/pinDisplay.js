// סגנונות התצוגה של פ"מ על מפת אזורים - **רשימה אחת** לשרת (ולידציה של
// strips.pin_display) ולעמדה (בורר הסגנון, תפריט הפין, הניהול). ESM רגיל
// כמו shared/formationCount.js, כדי ששני הצדדים ייבאו את אותו קובץ.
//
// סגנון שאינו ברשימה = "ברירת מחדל" (null) בשרת, ו-handwrite בעמדה. לכן הוספת
// סגנון היא שורה כאן + ענף ציור ב-MapPinLabel, ותו לא.

/** הסדר הוא סדר ההצגה בבורר. */
export const PIN_DISPLAY_MODES = ['handwrite', 'text', 'tag', 'block', 'small', 'strip', 'icon'];

export const DEFAULT_PIN_DISPLAY = 'handwrite';

/** @param {unknown} v @returns {boolean} */
export function isPinDisplay(v) {
  return typeof v === 'string' && PIN_DISPLAY_MODES.includes(v);
}

/**
 * @template F
 * @param {unknown} v
 * @param {F} fallback
 */
export function normalizePinDisplay(v, fallback) {
  return isPinDisplay(v) ? v : fallback;
}
