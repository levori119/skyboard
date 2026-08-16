// הצהרות טיפוסים ל-shared/airTrafficApi.js - המימוש הוא ESM רגיל כדי ששרת Node
// (JS), מאגר התמונ"א (JS) והעמדה (TS/Vite) יוכלו לייבא את **אותו קובץ**, בלי
// שכפול החוזה. אותה תבנית של shared/sanitizeHtml.d.ts.

/** סיווג המטוס - קוד, לא טקסט מתורגם. */
export type Classification = 'friend' | 'hostile' | 'unknown' | 'civil';

/**
 * מטוס **פיזי בשמיים** כפי שהמאגר מוסר אותו.
 * זה **אינו** פ"מ: הפ"מ הוא הרישום ויושב ב-DB של SKY-KING. `cs` הוא שם הפ"מ
 * שהמטוס שייך לו - הגשר בין השניים. ראה AIR_PICTURE_SPEC.md §0.
 */
export interface AirTrack {
  /** מזהה יציב לאורך זמן היותו באוויר. נשאר קבוע גם כששם הפ"מ משתנה. */
  id: string;
  /** שם הפ"מ. */
  cs: string;
  lat: number;
  lon: number;
  /** גובה ברגל. */
  alt: number;
  /** מהירות קרקע בקשר. */
  spd: number;
  /** כיוון במעלות, 0..359. */
  hdg: number;
  cls: Classification;
  /** מפתח מ-AircraftIconType (src/utils/aircraft.ts). */
  typ: string;
  /** אחראיות. */
  resp: string;
}

export interface AirSnapshot {
  /** גרסת החוזה שהמאגר מדווח. `null` = מאגר ותיק שאינו מדווח גרסה. */
  v?: string | null;
  /** שעון **המאגר** במילישניות. לא של העמדה. */
  t: number;
  /** טיק 1Hz נגזר-זמן. מונוטוני, דטרמיניסטי, שורד אתחול. */
  seq: number;
  /**
   * הסביבה שממנה נבנתה התמונה. `null` **רק** ב-`parseSnapshot`, כשהמאגר ותיק
   * ואינו מדווח סביבה - וזה מצב שונה מ"הסביבה החיה", ראה `envBucket`.
   */
  env: number | null;
  tracks: AirTrack[];
}

export declare const AIR_TRAFFIC_API_VERSION: string;
export declare const MAX_TRACKS: number;
export declare const CLASSIFICATIONS: Classification[];
export declare const CLASSIFICATION_HE: Record<Classification, string>;
export declare const CLASSIFICATION_COLOR: Record<Classification, string>;
export declare const AIRCRAFT_TYPES: string[];

// ── סביבות ───────────────────────────────────────────────────────────────────
// 50 הסביבות של SKY-KING. 1-10 הן סביבה חיה **אחת** (כמו schemaForEnv → public),
// ו-11-50 הן סביבות סימולציה מבודדות. ראה AIR_PICTURE_SPEC.md §7.1.
export declare const ENV_MIN: number;
export declare const ENV_MAX: number;
export declare const FLYING_MAX: number;
export declare const DEFAULT_ENV: number;

export declare function isValidEnv(env: unknown): boolean;
/** דלי הסביבה: `'live'` לטסות, `'env17'` לתרגול. **זורק** על סביבה פסולה. */
export declare function envBucket(env: number): string;
/** פירוק `X-Env`/`?env=`. חסר → הסביבה החיה; זבל → `null` (הקורא מחזיר 400). */
export declare function parseEnv(raw: unknown): number | null;
/** הסביבה של תרחיש. תרחיש בלי `env` הוא חי - התנהגות לאחור. */
export declare function scenarioEnv(sc: unknown): number;

export declare function normHeading(deg: unknown): number;
export declare function normalizeTrack(raw: unknown): AirTrack | null;
export declare function buildSnapshot(tMs: number, tracks: unknown[], env?: number): AirSnapshot;
/** אימות סנאפשוט נכנס. `null` = לא ניתן לצייר. */
export declare function parseSnapshot(obj: unknown): AirSnapshot | null;

/** האם גרסת המאגר תואמת לעמדה. `null` נחשב תואם (מאגר ותיק). */
export declare function versionCompatible(v: unknown): boolean;
