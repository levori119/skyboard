/**
 * **חלוקה אוטומטית למרחבי בלוקים לפי מיקום המטרה** (מוד טבלה, דגל עמדה
 * `auto_block_space_by_target`).
 *
 * המטרה הקובעת היא השורה המסומנת "ראשונה לביצוע" בטבלת נקודות המכוון. בלי
 * סימון - השורה העליונה שיש לה נ"צ תקין. שורה מסומנת בלי נ"צ תקין לא קובעת.
 */
import { nearestSpace } from '../../shared/blockSpaceGeo.js';
import { coordToLatLon, toAimPoints } from '../types/aimPoints';

export function firstExecTarget(targets: unknown): { lat: number; lon: number } | null {
  const rows = toAimPoints(targets);
  const flagged = rows.find(r => r.first_exec && coordToLatLon(r.coord));
  if (flagged) return coordToLatLon(flagged.coord);
  for (const r of rows) {
    const p = coordToLatLon(r.coord);
    if (p) return p;
  }
  return null;
}

/** id של המרחב המומלץ לפ"מ, או null כשאין מטרה עם נ"צ או אין מרחב עם מרכז */
export function recommendBlockSpaceId(
  targets: unknown,
  spaces: { id: number | string; center_lat?: number | null; center_lon?: number | null }[],
): number | null {
  const best = nearestSpace(firstExecTarget(targets), spaces);
  return best ? Number(best.id) : null;
}
