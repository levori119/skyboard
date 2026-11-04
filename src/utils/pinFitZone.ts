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

/** הקצה הקטן ביותר שבו הכתב עוד קריא כשהפ"מ **חייב** להיכנס באזור */
export const PIN_FIT_INSIDE_MIN_PX = 5;

/**
 * המרחב הפנוי בתוך הפוליגון סביב נקודה, לאורך ציר אחד: חיתוכי הקו האופקי
 * (או האנכי) דרך הנקודה עם צלעות הפוליגון, והקטע שמכיל את הנקודה.
 * מחזיר את המרחק לקצה הקרוב משני הצדדים, או null כשהנקודה מחוץ לפוליגון.
 */
function halfSpan(poly: { x: number; y: number }[], px: number, py: number, axis: 'x' | 'y'): number | null {
  const hits: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    // ציר x: קו אופקי דרך הנקודה (y קבוע); ציר y: קו אנכי (x קבוע)
    const [ac, bc, ao, bo, cross] = axis === 'x'
      ? [a.y, b.y, a.x, b.x, py]
      : [a.x, b.x, a.y, b.y, px];
    if ((ac > cross) === (bc > cross)) continue;
    const t = (cross - ac) / (bc - ac);
    hits.push(ao + t * (bo - ao));
  }
  const at = axis === 'x' ? px : py;
  hits.sort((m, n) => m - n);
  for (let i = 0; i + 1 < hits.length; i += 2) {
    if (at >= hits[i] && at <= hits[i + 1]) return Math.min(at - hits[i], hits[i + 1] - at);
  }
  return null;
}

/**
 * **הפין כולו בתוך האזור** - גודל הכתב כך שהתווית, שממורכזת על נקודת הפ"מ,
 * לא חורגת מגבולות הפוליגון: לפי המרחב הפנוי בפועל סביב הנקודה (ימינה/שמאלה
 * ולמעלה/למטה), ולא לפי המלבן החוסם - באזור משופע או צר המלבן גדול בהרבה
 * מהאזור, ופין שלא יושב במרכז חרג גם כשהאזור "גדול". מקדם ביטחון 0.9.
 */
export function pinFontInsideZone(
  polygonPct: { x: number; y: number }[] | null | undefined, pointPct: { x: number; y: number },
  imgWidthPx: number, imgHeightPx: number, mapZoom: number, labelChars: number,
): number | null {
  if (!polygonPct || polygonPct.length < 3 || !(imgWidthPx > 0 && imgHeightPx > 0)) return null;
  const hx = halfSpan(polygonPct, pointPct.x, pointPct.y, 'x');
  const hy = halfSpan(polygonPct, pointPct.x, pointPct.y, 'y');
  // הנקודה מחוץ לאזור - נופלים לחישוב לפי גודל האזור
  if (hx == null || hy == null) return pinFontForZone(polygonPct, imgWidthPx, imgHeightPx, mapZoom, labelChars);
  const wHalf = (hx / 100) * imgWidthPx * mapZoom;
  const hHalf = (hy / 100) * imgHeightPx * mapZoom;
  const byW = (2 * wHalf * 0.9) / (Math.max(3, labelChars) * CHAR_W);
  const byH = (2 * hHalf * 0.9) / LINES;
  return Math.round(Math.min(PIN_FIT_MAX_PX, Math.max(PIN_FIT_INSIDE_MIN_PX, Math.min(byW, byH))) * 10) / 10;
}
