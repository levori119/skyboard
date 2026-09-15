// ה-store של התמונ"א - **מחוץ ל-React**.
//
// זו ההחלטה החשובה ביותר בכל הפיצ'ר (AIR_PICTURE_SPEC.md §5.2). אילו הסנאפשוט
// היה יושב ב-useState בתוך SectorDashboard (17,894 שורות), כל דגימה הייתה
// מרנדרת מחדש את **כל** מסך הבקר - כולל הסטריפים, לוחות ההעברה וטבלאות
// הבד"ח - 30 פעם בדקה.
//
// כאן זה מודול רגיל: ה-poller כותב, ורק <AirPictureLayer/> נרשם דרך
// useSyncExternalStore. אף רכיב-אב לא מקבל props של תמונ"א ולא מחזיק state שלה.
// אותה תבנית של src/offline/useNetStatus.ts.

import type { AirTrack } from '../../shared/airTrafficApi';
import { updateTrendRefs, type TrendRef, type VertTrend } from './trend';
import { STALE_AFTER_SEC } from './track';

export type AirPictureStatus =
  /** לא מוגדר / כבוי בעמדה - השכבה כלל לא מרונדרת. */
  | 'off'
  /** דגימה טרייה. */
  | 'live'
  /** התקבלה דגימה, אבל היא ישנה מדי (ראה STALE_AFTER_SEC). */
  | 'stale'
  /** המאגר לא נענה - השרת של SKY-KING כן, והוא זה שדיווח על כך. */
  | 'down'
  /**
   * **השרת של SKY-KING** לא נענה. מצב נפרד מ-`down` בכוונה: "אין קשר למאגר"
   * שולח את הפקח לבדוק את המאגר, בזמן שהתקלה בכלל אצלנו. ההודעה קובעת לאן
   * הוא הולך לחפש, ולכן היא חייבת להצביע על האשם הנכון.
   */
  | 'server'
  /**
   * הסשן פג / אין הרשאה (401/403). **לא** נפילת שרת: השרת ענה, והוא זה
   * שדחה. ההודעה "שרת SKY-KING לא זמין" במצב הזה שלחה לבדוק שרת שעובד.
   */
  | 'unauth'
  /**
   * **המאגר החזיר תמונה של סביבה אחרת.** מצב נפרד מכל השאר כי הוא אינו תקלת
   * רשת אלא תקלת חיווט: פרוקסי שאיבד את `X-Env`, או מאגר שהוגדר לא נכון.
   *
   * זה המצב היחיד שבו המטוסים **נמחקים** מהמסך ולא נשארים עם חיווי גיל
   * (בניגוד ל-`stale`/`down`). הסיבה: בסביבת תרגול, תמונה מהסביבה החיה היא
   * תנועה אמיתית שנראית כמו תרגיל - ותצוגה שגויה כאן גרועה מאין תצוגה בכלל.
   */
  | 'envmismatch';

export interface AirPictureState {
  /** שעון המאגר בדגימה האחרונה. 0 = טרם התקבלה דגימה. */
  t: number;
  seq: number;
  tracks: AirTrack[];
  status: AirPictureStatus;
  /** שעון **העמדה** בקבלת הדגימה - הבסיס לחישוב-החשבון בלולאת הציור. */
  receivedAt: number;
  /** הודעת השגיאה האחרונה, לחיווי בפאנל הבקרות. */
  error: string | null;
  /**
   * מגמה אנכית לכל מטוס - **נגזרת כאן ולא מדווחת על ידי המאגר**
   * (ראה trend.ts). החישוב יושב ב-store ולא ברכיבים, כדי שהמבט מלמעלה
   * והסצנה התלת מימדית לעולם לא יציגו חצים שונים לאותו מטוס.
   */
  trends: Map<string, VertTrend>;
}

const EMPTY: AirPictureState = {
  t: 0, seq: 0, tracks: [], status: 'off', receivedAt: 0, error: null, trends: new Map(),
};

/** נקודות הייחוס של המגמה - מצב פנימי, לא חלק מה-snapshot שהרכיבים קוראים. */
let trendRefs: Map<string, TrendRef> = new Map();

/**
 * שעון העמדה בתשובה **התקינה** האחרונה מהמאגר - דגימה חדשה **או 304**.
 *
 * מחוץ ל-snapshot בכוונה: 304 מגיע כל 2 שניות כשהתמונה לא זזה, ועדכון state
 * עליו היה מרנדר כל מנוי בלי שדבר השתנה. המנועים קוראים אותו בטיימר שלהם.
 */
let confirmedAt = 0;

/**
 * האם התמונה **עדיין נכונה** - הבסיס של המנועים (מעקב הקפה, חריגה מאזור).
 *
 * ⚠ לא לפי `t` של הדגימה. ה-ETag של המאגר הוא על התוכן בלבד, ולכן תמונה שלא
 * זזה (שמיים ריקים, מטוסים עומדים) מקבלת 304 ו-`t` אינו מתקדם. המנועים ראו
 * בה "תמונה ישנה" וקפאו: דרקון 3 - המטוס האחרון שנחת - נעלם, השמיים התרוקנו,
 * וספירת 30 השניות של הנחיתה לא הושלמה לעולם (2026-09-15).
 */
export function pictureFresh(snap: Pick<AirPictureState, 'status'>, confirmedAtMs: number, nowMs: number): boolean {
  return snap.status === 'live' && confirmedAtMs > 0 && (nowMs - confirmedAtMs) / 1000 <= STALE_AFTER_SEC;
}

// ה-snapshot חייב להיות **אותה הפניה** כל עוד לא השתנה: useSyncExternalStore
// משווה בזהות, וייצור אובייקט חדש בכל קריאה מייצר לולאת רינדור אינסופית.
let state: AirPictureState = EMPTY;
const listeners = new Set<() => void>();

const emit = () => { for (const fn of listeners) fn(); };

export const airPictureStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  getSnapshot(): AirPictureState {
    return state;
  },

  /** דגימה חדשה מהמאגר. */
  setSnapshot(t: number, seq: number, tracks: AirTrack[], nowMs: number): void {
    trendRefs = updateTrendRefs(trendRefs, tracks, nowMs);
    const trends = new Map<string, VertTrend>();
    for (const [id, r] of trendRefs) trends.set(id, r.trend);
    state = { t, seq, tracks, status: 'live', receivedAt: nowMs, error: null, trends };
    confirmedAt = nowMs;
    emit();
  },

  /** 304 - המאגר אישר שהתמונה לא השתנתה. מעדכן טריות בלבד, בלי רינדור. */
  confirm(nowMs: number): void {
    confirmedAt = nowMs;
  },

  lastConfirmedAt(): number {
    return confirmedAt;
  },

  /**
   * שינוי מצב בלי לגעת בנתונים. חשוב במיוחד ב-`stale`/`down`: המטוסים
   * **נשארים** על המסך עם חיווי גיל, ולא נמחקים. תמונה שנעלמת פתאום נקראת
   * כ"אין תנועה", וזו טעות תפעולית גרועה מתמונה ישנה שמסומנת ככזו.
   */
  setStatus(status: AirPictureStatus, error: string | null = null): void {
    if (state.status === status && state.error === error) return;
    state = { ...state, status, error };
    emit();
  },

  /**
   * המאגר החזיר סביבה אחרת - **מנקה את המטוסים** ומסמן את הסיבה, בפעולה אחת.
   * החריג היחיד לכלל "מצב משתנה, נתונים נשארים" שכתוב מעל `setStatus`, ומאותה
   * סיבה בדיוק: כאן הנתונים עצמם הם הבעיה.
   */
  setEnvMismatch(error: string): void {
    trendRefs = new Map();
    confirmedAt = 0;
    if (state.status === 'envmismatch' && state.error === error) return;
    state = { ...EMPTY, status: 'envmismatch', error };
    emit();
  },

  /** ניתוק מלא - כיבוי בעמדה או החלפת עמדה. */
  reset(): void {
    trendRefs = new Map();
    confirmedAt = 0;
    if (state === EMPTY) return;
    state = EMPTY;
    emit();
  },
};
