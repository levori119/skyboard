// נעילת שפת ממשק לפריסה - מקור אמת יחיד לשרת וללקוח.
//
// מערכת "רק באנגלית" אינה ענף קוד נפרד: זה אותו קוד, ופריסה אחת מוגדרת
// `UI_LANGUAGE=en` בשרת. הלקוח עולה בשפה הנעולה, בכיוון שלה, ובלי בורר שפה.
// ערך ריק או לא מוכר = אין נעילה (הבחירה החופשית הרגילה, עברית ברירת מחדל).

/** @typedef {'he' | 'en'} UiLang */

/** @returns {UiLang | null} */
export function normalizeUiLanguage(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'en' || v === 'english') return 'en';
  if (v === 'he' || v === 'hebrew' || v === 'iw') return 'he';
  return null;
}

/**
 * תשובת `GET /api/ui-config`.
 * `authoritative=false` במאגר המקומי שבעמדה: לשרת המקומי אין את ההגדרה של
 * הפריסה, ותשובה "אין נעילה" ממנו הייתה מבטלת את הנעילה בכל נתק.
 */
export function buildUiConfig(env, { localDb = false } = {}) {
  return { uiLanguage: localDb ? null : normalizeUiLanguage(env.UI_LANGUAGE), authoritative: !localDb };
}

/**
 * מה הלקוח עושה עם התשובה: `keep` = להשאיר את מה ששמור, אחרת הנעילה החדשה
 * (או null = לבטל נעילה).
 * @returns {{ action: 'keep' } | { action: 'set', lock: UiLang | null }}
 */
export function resolveLock(cfg) {
  if (!cfg || typeof cfg !== 'object' || cfg.authoritative !== true) return { action: 'keep' };
  return { action: 'set', lock: normalizeUiLanguage(cfg.uiLanguage) };
}
