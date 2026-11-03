/**
 * **פ"מ שנגרר על אייקון של תמונ"א** - איזה מטוס, ובאיזה בלוק של האזור הוא נמצא.
 *
 * התמונ"א מצוירת על canvas, ולכן אין אלמנט DOM לפגוע בו בשחרור. ההחלטה נעשית
 * כאן, באותה מערכת קואורדינטות של האזורים: אחוזי תמונת המפה (`PlacedTrack.x/y`).
 *
 * - **המטוס**: הקרוב ביותר לנקודת השחרור, בתוך רדיוס האייקון (בפיקסלי תוכן).
 * - **הבלוק**: בלוק הגובה של האזור שמכיל את גובה המטוס. גבהי הבלוקים באזור
 *   נשמרים כ"מאות רגל" (FL), וגובה המטוס ברגל.
 */
import type { PlacedTrack } from './track';

export function trackAtMapPoint(
  tracks: PlacedTrack[], xPct: number, yPct: number, imgW: number, imgH: number, radiusPx: number,
): PlacedTrack | null {
  if (!(imgW > 0 && imgH > 0)) return null;
  let best: PlacedTrack | null = null, bd = radiusPx * radiusPx;
  for (const t of tracks) {
    const dx = ((t.x - xPct) / 100) * imgW, dy = ((t.y - yPct) / 100) * imgH;
    const d = dx * dx + dy * dy;
    if (d <= bd) { bd = d; best = t; }
  }
  return best;
}

export interface RangeLike { id: number; name?: string | null; alt_min: number | null; alt_max: number | null }

/** גבול בלוק → רגל. ערך מתחת ל-1000 הוא FL (מאות רגל), ממנו ומעלה - רגל */
const toFt = (v: number) => (Math.abs(v) < 1000 ? v * 100 : v);

/** בלוק הגובה שמכיל את `altFt`; אם אף אחד לא מכיל - הקרוב ביותר */
export function blockForAltitude<T extends RangeLike>(ranges: T[], altFt: number): T | null {
  if (!ranges.length || !Number.isFinite(altFt)) return null;
  let best: T | null = null, bd = Infinity;
  for (const r of ranges) {
    const lo = r.alt_min == null ? -Infinity : toFt(r.alt_min);
    const hi = r.alt_max == null ? Infinity : toFt(r.alt_max);
    if (altFt >= lo && altFt <= hi) return r;
    const d = altFt < lo ? lo - altFt : altFt - hi;
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
