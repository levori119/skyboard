// העדפות תצוגת המז"א בעמדה - **בסשן, לא ב-DB**.
//
// אותה תבנית של התמונ"א (airPicture/prefs.ts): הפקח מדליק שכבה, מזיז בהירות
// ומכבה - והכול חי בסשן שלו. כתיבה ל-DB בכל הזזת סליידר הייתה משנה את ההגדרה
// לכל מי שיעלה בעמדה אחריו.

import { DEFAULT_OVERLAY, isWindyOverlay, type WindyOverlay } from './windy';

/**
 * מצב המיזוג של שכבת המז"א מול מפת השדה.
 *
 * ⚠️ **נמדד בדפדפן מול Windy אמיתי, לא הונח.** ההנחה הראשונה הייתה ש-`screen`
 * יעלים את רקע המפה של Windy - היא שגויה: הרקע שלו הוא **אפור בהיר** (~#8a8a8a)
 * ולא כמעט-שחור, ולכן `screen` מלבין את מפת השדה עד שכיתוב וקווים נבלעים.
 * מנגד `multiply` על סדק כהה חונק את המז"א עצמו כמעט לחלוטין.
 *
 * `normal`   - בלי מיזוג. **ברירת המחדל בתמה כהה** - היחיד שמשאיר גם את קווי
 *              המפה וגם את הכיתוב קריאים, כשהבהירות שולטת בעוצמה.
 * `multiply` - מכהה. ברירת המחדל בתמה **בהירה**, שם הוא שומר על רוויית הצבע
 *              של המז"א ועל קווי המפה השחורים.
 * `screen`   - מבהיר. שימושי לשכבות שהעניין בהן בהיר על רקע כהה (ברקים).
 */
export type WeatherBlend = 'normal' | 'screen' | 'multiply';

export interface WeatherPrefs {
  /** תצוגת המז"א דלוקה בעמדה הזו כרגע. */
  on: boolean;
  overlay: WindyOverlay;
  /** בהירות השכבה, 0.15..1. */
  opacity: number;
  blend: WeatherBlend;
  /** תפריט השכבות פרוש (כמו התפריט הפתוח באפיון) או מכווץ לכפתור. */
  menuOpen: boolean;
}

/** תמה בהירה מקבלת מיזוג מכהה; ocean היא תמה **כהה** ולכן מתנהגת כמו dark. */
export const defaultBlendFor = (themeMode: 'light' | 'dark' | 'ocean'): WeatherBlend =>
  themeMode === 'light' ? 'multiply' : 'normal';

/**
 * `opacity: 0.45` היא החלטה תפעולית ולא טעם: המז"א הוא **מודעות מצבית**, ומפת
 * השדה עם הפ"מים עליה חייבת להישאר הדבר הקריא. הערך נבחר במדידה - בבהירות זו
 * קווי המפה, שם המסלול ותוויות האזורים נשארו קריאים מעל שכבת רוח מלאה.
 */
export const DEFAULT_PREFS: WeatherPrefs = {
  on: false,
  overlay: DEFAULT_OVERLAY,
  opacity: 0.45,
  blend: 'normal',
  menuOpen: true,
};

const KEY = (presetId: number | string) => `skyking.weather.${presetId}`;

const clamp = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

const BLENDS: WeatherBlend[] = ['normal', 'screen', 'multiply'];

/** מנקה קלט משני מקורות (ברירת מחדל בקוד + מה שנשמר בסשן) לערך שמיש. */
export function mergePrefs(
  sessionPrefs: Partial<WeatherPrefs> | null | undefined,
  themeMode: 'light' | 'dark' | 'ocean' = 'dark',
): WeatherPrefs {
  const raw = { ...DEFAULT_PREFS, blend: defaultBlendFor(themeMode), ...(sessionPrefs || {}) };
  return {
    on: raw.on === true,
    overlay: isWindyOverlay(raw.overlay) ? raw.overlay : DEFAULT_OVERLAY,
    opacity: clamp(raw.opacity, 0.15, 1, DEFAULT_PREFS.opacity),
    blend: BLENDS.includes(raw.blend as WeatherBlend) ? (raw.blend as WeatherBlend) : defaultBlendFor(themeMode),
    menuOpen: raw.menuOpen !== false,
  };
}

export function loadPrefs(
  presetId: number | string, themeMode: 'light' | 'dark' | 'ocean' = 'dark',
): WeatherPrefs {
  let session: Partial<WeatherPrefs> | null = null;
  try {
    const raw = sessionStorage.getItem(KEY(presetId));
    if (raw) session = JSON.parse(raw);
  } catch { /* sessionStorage חסום או JSON פגום - נופלים לברירת המחדל */ }
  return mergePrefs(session, themeMode);
}

export function savePrefs(presetId: number | string, prefs: WeatherPrefs): void {
  try { sessionStorage.setItem(KEY(presetId), JSON.stringify(prefs)); }
  catch { /* אין אחסון - ההעדפה תחיה עד לרענון. לא שווה להפיל את העמדה */ }
}
