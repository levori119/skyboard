/**
 * פאנלים נפתחים של כלים **משותפים** בסרגל המפה (איחוד עמדה / דו-מפה / דסק).
 *
 * כשעל המסך כמה מפות, לכל אחת סרגל כלים משלה. חלק מהכלים משפיעים על **כל**
 * המפות (תמונ"א והגדרותיה, מז"א, ציור, סגירות, תצוגת פ"מ) וחלק פר-מפה (זום,
 * הסחה, בהירות, מפה עיוורת). ההגדרה של כלי משותף היא state אחד - אבל הפאנל
 * שלו נפתח **רק בסרגל שנלחץ**: אותו פאנל פתוח פעמיים על המסך הוא רעש, ובנוסף
 * מכסה את המפה השנייה בלי סיבה.
 *
 * לכל פאנל "בעלים" - ה-panKey של המפה שבה נפתח. בלי בעלים (נפתח ממקום אחר)
 * הפאנל מוצג כמו קודם, בכל סרגל.
 */
export type SharedMapFlyout = 'airPicture' | 'closures' | 'pinType' | 'pinOnMap';
export type MapFlyoutOwners = Partial<Record<SharedMapFlyout, string>>;

/** האם הפאנל מוצג בסרגל של המפה הזו (בהנחה שהוא פתוח). */
export function flyoutShownOn(owners: MapFlyoutOwners, f: SharedMapFlyout, panKey: string): boolean {
  const o = owners[f];
  return o == null || o === panKey;
}

/**
 * לחיצה על כפתור הכלי בסרגל של `panKey`. פאנל שפתוח במפה **אחרת** עובר לכאן
 * ונשאר פתוח - הפקח לחץ כדי לראות אותו ליד המפה שהוא עובד עליה, לא כדי לסגור.
 * אחרת - פתיחה/סגירה רגילה.
 */
export function toggleFlyout(
  open: boolean, owners: MapFlyoutOwners, f: SharedMapFlyout, panKey: string,
): { open: boolean; owners: MapFlyoutOwners } {
  const moving = open && !flyoutShownOn(owners, f, panKey);
  return { open: moving ? true : !open, owners: { ...owners, [f]: panKey } };
}
