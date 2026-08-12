// העדפות התמונ"א בעמדה - **בסשן, לא ב-DB**.
//
// אותה תבנית של `data_windows` (data-model.md): ה-DB מחזיק את ברירת המחדל של
// העמדה, והפקח מזיז/מכבה/מסנן בסשן שלו בלי לשנות אותה. כתיבה ל-DB בכל הזזת
// סליידר הייתה מייצרת עשרות UPDATE בדקה על workstation_presets - ובעיקר,
// היא הייתה משנה את ההגדרה לכל מי שיעלה בעמדה אחריו.

import type { Classification } from '../../shared/airTrafficApi';
import { CLASSIFICATIONS } from '../../shared/airTrafficApi';

export interface AirPicturePrefs {
  /** התמונ"א דלוקה בעמדה הזו כרגע. */
  on: boolean;
  /** גודל הסמל והתווית, 0.6..1.6. */
  scale: number;
  /** בהירות, 0.15..1. ברירת המחדל נמוכה בכוונה - ראה DEFAULT_PREFS. */
  opacity: number;
  /** הצגת תווית (שם פ"מ, גובה, מהירות) ולא רק סמל. */
  labels: boolean;
  classes: Classification[];
  altMin: number | null;
  altMax: number | null;
  resp: string;
}

/**
 * `opacity: 0.45` היא החלטה תפעולית ולא טעם: התמונ"א היא **מודעות מצבית ולא
 * כלי עבודה**, והפ"מים של SKY-KING חייבים להישאר הדבר הבולט על המפה. זה גם
 * מה שהאפיון ביקש - "לשים ברקע את האייקונים, בהירות שלא יפריעו".
 */
export const DEFAULT_PREFS: AirPicturePrefs = {
  on: true,
  scale: 1,
  opacity: 0.45,
  labels: true,
  classes: [...CLASSIFICATIONS],
  altMin: null,
  altMax: null,
  resp: '',
};

const KEY = (presetId: number | string) => `skyking.airPicture.${presetId}`;

const clamp = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * מיזוג של שלוש שכבות, מהחלשה לחזקה:
 * ברירת מחדל בקוד → ברירת המחדל של העמדה (מה-DB) → מה שהפקח שינה בסשן.
 * כל שכבה מנוקה בנפרד, כדי שערך פגום באחת מהן לא יפיל את השכבה כולה.
 */
export function mergePrefs(
  stationDefaults: Partial<AirPicturePrefs> | null | undefined,
  sessionPrefs: Partial<AirPicturePrefs> | null | undefined,
): AirPicturePrefs {
  const raw = { ...DEFAULT_PREFS, ...(stationDefaults || {}), ...(sessionPrefs || {}) };
  const classes = Array.isArray(raw.classes)
    ? raw.classes.filter((c): c is Classification => CLASSIFICATIONS.includes(c))
    : DEFAULT_PREFS.classes;
  return {
    on: raw.on !== false,
    scale: clamp(raw.scale, 0.6, 1.6, DEFAULT_PREFS.scale),
    opacity: clamp(raw.opacity, 0.15, 1, DEFAULT_PREFS.opacity),
    labels: raw.labels !== false,
    // רשימה ריקה נשמרת כפי שהיא: "כיביתי את כל הסיווגים" הוא מצב לגיטימי,
    // ואיפוס שלו ל"הכול" היה מחזיר לפקח מטוסים שהוא בכוונה הסתיר.
    classes,
    altMin: numOrNull(raw.altMin),
    altMax: numOrNull(raw.altMax),
    resp: typeof raw.resp === 'string' ? raw.resp : '',
  };
}

export function loadPrefs(
  presetId: number | string, stationDefaults?: Partial<AirPicturePrefs> | null,
): AirPicturePrefs {
  let session: Partial<AirPicturePrefs> | null = null;
  try {
    const raw = sessionStorage.getItem(KEY(presetId));
    if (raw) session = JSON.parse(raw);
  } catch { /* sessionStorage חסום או JSON פגום - נופלים לברירת המחדל */ }
  return mergePrefs(stationDefaults, session);
}

export function savePrefs(presetId: number | string, prefs: AirPicturePrefs): void {
  try { sessionStorage.setItem(KEY(presetId), JSON.stringify(prefs)); }
  catch { /* אין אחסון - ההעדפה תחיה עד לרענון. לא שווה להפיל את העמדה */ }
}
