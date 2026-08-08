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
  | 'unauth';

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
}

const EMPTY: AirPictureState = {
  t: 0, seq: 0, tracks: [], status: 'off', receivedAt: 0, error: null,
};

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
    state = { t, seq, tracks, status: 'live', receivedAt: nowMs, error: null };
    emit();
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

  /** ניתוק מלא - כיבוי בעמדה או החלפת עמדה. */
  reset(): void {
    if (state === EMPTY) return;
    state = EMPTY;
    emit();
  },
};
