// ─── משטח הציור של שדה בלי מפת רקע ────────────────────────────────────────────
//
// שדה תעופה יכול להיבנות **סכמטית בלבד**: מסלולים, הקפות, אלמנטים ופוליגונים
// מצוירים על משטח ריק, בלי תצלום/מפה מתחתם. כל שכבות המפה ממוקמות לפי גבולות
// התמונה המרונדרת (`imgBounds`), ולכן כשאין תמונה - אין גבולות, ואף שכבה אינה
// מרונדרת: השרטוט פשוט "לא נטען".
//
// הקואורדינטות נשמרות ב**אחוזים** של המשטח, ולכן היחס שלו הוא חלק מהנתון:
// אותו משטח חייב לשמש בעמדת הניהול (שם מציירים) ובעמדה (שם מציגים). הקבוע כאן
// הוא המקור היחיד לשניהם - ערך שמתפצל בין שני מסכים מחזיר בדיוק את העיוות
// שהוא נועד למנוע.

/** יחס משטח הציור הסכמטי (רוחב/גובה). */
export const SCHEMATIC_ASPECT = 4 / 3;

/** אותו יחס בכתיב CSS, ל-`aspectRatio`. */
export const SCHEMATIC_ASPECT_CSS = '4 / 3';

export interface Bounds { left: number; top: number; width: number; height: number }

/**
 * גבולות משטח ביחס נתון בתוך מכולה, כמו `object-fit: contain`:
 * ממלא את הציר הצר וממורכז בציר השני. זו אותה נוסחה שחלה על תמונת מפה אמיתית -
 * ההבדל היחיד הוא מאיפה מגיע ה-`aspect` (מהתמונה, או `SCHEMATIC_ASPECT`).
 *
 * מחזיר `null` כשאין עדיין מידות או שהיחס אינו חוקי: עדיף בלי שכבות מאשר שכבות
 * במקום שגוי.
 */
export function containBounds(containerW: number, containerH: number, aspect: number): Bounds | null {
  if (!(containerW > 0) || !(containerH > 0) || !(aspect > 0) || !Number.isFinite(aspect)) return null;
  const containerAspect = containerW / containerH;
  if (aspect > containerAspect) {
    // רחב מהמכולה - ממלא לרוחב, שוליים למעלה ולמטה
    const height = containerW / aspect;
    return { left: 0, top: (containerH - height) / 2, width: containerW, height };
  }
  // גבוה מהמכולה - ממלא לגובה, שוליים מהצדדים
  const width = containerH * aspect;
  return { left: (containerW - width) / 2, top: 0, width, height: containerH };
}
