// "קליק רפאים" של עט ואצבע.
//
// תפריט שנפתח ב-`pointerup` (למשל נגיעה בקו אזור) נסגר מיד בעט/במגע: אחרי
// pointerup הדפדפן שולח את אירועי העכבר ה"תואמים" (mousedown → mouseup → click)
// **באותה נקודה**, והם נוחתים על שכבת "לחיצה בחוץ = סגירה" שכבר מרונדרת מתחת
// לתפריט. בעכבר זה לא קורה, כי ה-mousedown קרה **לפני** שהתפריט נפתח - ולכן
// ה-click הולך לאב המשותף ולא לשכבה. (2026-11-25, Cintiq + Pro Pen 3.)
//
// הפתרון: שכבת הסגירה מתעלמת מ-click שמגיע מיד אחרי הפתיחה. חצי שנייה ארוכה
// מכל רצף אירועי תאימות, וקצרה מכדי שפקח יספיק להחליט ולסגור בכוונה.

export const GHOST_CLICK_MS = 500;

/** האם click הגיע מוקדם מדי אחרי הפתיחה, ולכן הוא שארית של הנגיעה שפתחה. */
export function isGhostClick(openedAt: number | null | undefined, now: number): boolean {
  if (openedAt == null || !Number.isFinite(openedAt)) return false;
  return now - openedAt >= 0 && now - openedAt < GHOST_CLICK_MS;
}
