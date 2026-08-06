// Screen-size scaling is now handled by a single global `zoom: var(--s)` on #root
// (see App.css). These helpers are kept as identity passthroughs so existing
// call sites keep working without double-scaling. --s drives the global zoom only.
export const scale = 1;

// Identity — global zoom already scales every pixel; do not scale again here.
export const sc = (n: number): number => n;

// ── סקייל נקודתי לכפתורי סרגל ──────────────────────────────────────────────
// הזום הגלובלי (--s) מגדיל הכל באופן אחיד, ולכן כפתור זעיר נשאר זעיר *ביחס*
// לשאר המסך גם ב-24". בסרגלי כלים צפופים (כפתורי 20-28px) זה לא מספיק למגע/עט
// על Cintiq 24 - לכן הכפתורים בלבד מקבלים מכפיל נוסף לפי גודל המסך.
// מפתחות: index.html כותב data-screen="15"|"16"|"18"|"24" (מ-localStorage או
// מזיהוי אלכסון). '15.6' נתמך ליתר ביטחון.
export const TOOLBAR_SCALE_MAP: Record<string, number> = {
  '15': 1.0,
  '15.6': 1.0,
  '16': 1.1,
  '18': 1.2,
  '24': 1.4,
};

// גודל מסך → מכפיל כפתורים. ערך לא מוכר נופל ל-1 (לעולם לא שובר סרגל קיים).
export const getToolbarScale = (screen?: string | null): number =>
  (screen && TOOLBAR_SCALE_MAP[screen]) || 1;

// px מעוגל - שברי פיקסל מטשטשים גבולות וטקסט בסרגל צפוף.
export const tbPx = (n: number, s: number): string => `${Math.round(n * s)}px`;

// קורא את גודל המסך הנוכחי מה-DOM (מקור אמת יחיד: data-screen על <html>).
export const readToolbarScale = (): number =>
  typeof document === 'undefined' ? 1 : getToolbarScale(document.documentElement.getAttribute('data-screen'));

// ── כיווץ טקסט-על-מפה לפי גודל המסך ────────────────────────────────────────
// הזום הגלובלי (--s) מגדיל **הכל** אחיד, כולל תוויות שיושבות על המפה. לכפתור
// זה טוב (ראה TOOLBAR_SCALE_MAP), אבל לתווית זה רע: היא גדלה עם המסך בעוד
// שהצורה שמתחתיה נשארת באותו יחס, ובמסך גדול היא מכסה את המפה. שמות צלעות
// ההקפה על מסך 24" חנקו את השרטוט.
//
// המכפיל כאן **מקטין** את התווית ככל שהמסך גדל, כך שהיא נשארת קריאה אך תופסת
// פחות מהמפה. לא 1/--s מלא (זה היה מקפיא אותה בגודל פיזי קבוע וב-24" היא
// הייתה נראית זעירה) אלא כיווץ חלקי.
export const MAP_LABEL_SCALE_MAP: Record<string, number> = {
  '15': 1.0,
  '15.6': 1.0,
  '16': 0.92,
  '18': 0.84,
  '24': 0.7,
};

/** גודל מסך → מכפיל תוויות מפה. ערך לא מוכר נופל ל-1. */
export const getMapLabelScale = (screen?: string | null): number =>
  (screen && MAP_LABEL_SCALE_MAP[screen]) || 1;

/** קורא את מכפיל התוויות מה-DOM (מקור אמת יחיד: data-screen על <html>). */
export const readMapLabelScale = (): number =>
  typeof document === 'undefined' ? 1 : getMapLabelScale(document.documentElement.getAttribute('data-screen'));
