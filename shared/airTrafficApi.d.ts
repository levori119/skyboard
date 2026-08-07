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
  /** שעון **המאגר** במילישניות. לא של העמדה. */
  t: number;
  /** טיק 1Hz נגזר-זמן. מונוטוני, דטרמיניסטי, שורד אתחול. */
  seq: number;
  tracks: AirTrack[];
}

export declare const MAX_TRACKS: number;
export declare const CLASSIFICATIONS: Classification[];
export declare const CLASSIFICATION_HE: Record<Classification, string>;
export declare const CLASSIFICATION_COLOR: Record<Classification, string>;
export declare const AIRCRAFT_TYPES: string[];

export declare function normHeading(deg: unknown): number;
export declare function normalizeTrack(raw: unknown): AirTrack | null;
export declare function buildSnapshot(tMs: number, tracks: unknown[]): AirSnapshot;
/** אימות סנאפשוט נכנס. `null` = לא ניתן לצייר. */
export declare function parseSnapshot(obj: unknown): AirSnapshot | null;
