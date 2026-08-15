// ─── תמת התצוגה השמורה ─────────────────────────────────────────────────────────
// מקור אמת יחיד לקריאת התמה שנבחרה בעמדה (אור / שחור / כחול). קיים כדי שמסכים
// שעולים **לפני** העמדה — מסך הטעינה של הכניסה — יצבעו את עצמם באותה תמה שהעמדה
// תיפתח בה, ולא יבזיקו בצבע אחר ברגע שהיא עולה.
//
// `bt-lightMode` הוא המפתח הישן (בוליאני, לפני שנוספה התמה הכחולה) ונקרא רק
// כשאין `bt-themeMode` — עמדה שלא שינתה תמה מאז לא מאבדת את בחירתה.

export type ThemeMode = 'light' | 'dark' | 'ocean';

export const THEME_STORAGE_KEY = 'bt-themeMode';

export function readStoredThemeMode(): ThemeMode {
  try {
    const s = localStorage.getItem(THEME_STORAGE_KEY);
    if (s === 'light' || s === 'dark' || s === 'ocean') return s;
    return localStorage.getItem('bt-lightMode') === 'true' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}
