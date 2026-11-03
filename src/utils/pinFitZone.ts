/**
 * **התאם תצוגת פ"מ לגודל אזור** - גודל הכתב של פין שיושב באזור.
 *
 * בברירת המחדל לפין גודל קבוע על המסך: באזור קטן הוא חורג מהאזור ומכסה את
 * השכנים, ובאזור גדול הוא נבלע. כשהמצב דלוק, הכתב נגזר מגודל האזור על המסך -
 * כך שהתווית (או"ק, גובה, סטטוס) נכנסת באזור - בתוך גבולות קריאות.
 *
 * הכל בפיקסלי **מסך**: גודל האזור על המסך הוא גודלו בתוכן כפול זום המפה.
 */
export const PIN_FIT_MIN_PX = 8;
/** תקרה נמוכה בכוונה: באזור ענק הפין לא אמור להשתלט על המפה */
export const PIN_FIT_MAX_PX = 16;
/** רוחב ממוצע של תו ביחס לגודל הגופן */
const CHAR_W = 0.62;
/** כמה שורות יושבות בפין: או"ק, גובה, סטטוס */
const LINES = 2.8;

export function pinFontForZone(
  polygonPct: { x: number; y: number }[] | null | undefined,
  imgWidthPx: number, imgHeightPx: number, mapZoom: number, labelChars: number,
): number | null {
  if (!polygonPct || polygonPct.length < 3 || !(imgWidthPx > 0 && imgHeightPx > 0)) return null;
  const xs = polygonPct.map(p => p.x), ys = polygonPct.map(p => p.y);
  const w = ((Math.max(...xs) - Math.min(...xs)) / 100) * imgWidthPx * mapZoom;
  const h = ((Math.max(...ys) - Math.min(...ys)) / 100) * imgHeightPx * mapZoom;
  if (!(w > 0 && h > 0)) return null;
  // התווית תופסת עד ~60% מרוחב האזור ו-~45% מגובהו - נשאר מרווח לפינים אחרים
  const byW = (w * 0.6) / (Math.max(3, labelChars) * CHAR_W);
  const byH = (h * 0.45) / LINES;
  return Math.round(Math.min(PIN_FIT_MAX_PX, Math.max(PIN_FIT_MIN_PX, Math.min(byW, byH))) * 10) / 10;
}
