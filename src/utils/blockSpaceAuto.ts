/**
 * **חלוקה אוטומטית למרחבי בלוקים לפי מיקום המטרה** (מוד טבלה, דגל עמדה
 * `auto_block_space_by_target`).
 *
 * המטרה הקובעת היא השורה המסומנת "ראשונה לביצוע" בטבלת נקודות המכוון. בלי
 * סימון - השורה העליונה שיש לה נ"צ תקין. שורה מסומנת בלי נ"צ תקין לא קובעת.
 *
 * המטרה לא חייבת להיות **בתוך** מרחב: מהמרחב יוצאים לתקוף אותה, ולכן הפ"מ
 * משויך למרחב שהפוליגון שלו הכי קרוב - מבין המרחבים שמותר לאייש (טופס העזר
 * בעמדה). כך הגזרות הקדמיות, הקרובות למטרות, גוברות על האחוריות. וקודם לכן
 * **הנתיב**: המרחבים שהמטרה מולם לרוחב ציר התקיפה (ממרכז המרחבים אל מרכז כל
 * המטרות בטבלה) - מטרה מול הגזרות הדרומיות לא תלך לצפונית שקצה שלה קרוב בקצת.
 *
 * פ"מ **בלי מטרות** משויך לגזרה האחורית הרחוקה - המרחב הרחוק ממרכז המטרות של
 * שאר הפ"מים בלוח - כדי לא לתפוס מקום בגזרות הקדמיות.
 */
import { nearestSpaceInLane, farthestSpace } from '../../shared/blockSpaceGeo.js';
import { coordToLatLon, toAimPoints } from '../types/aimPoints';

type SpaceLike = { id: number | string; center_lat?: number | null; center_lon?: number | null; polygons?: { lat: number; lon: number }[][] | null };

/** אינדקס השורה הקובעת בטבלת נקודות המכוון, או -1 כשאין נ"צ תקין באף שורה */
export function firstExecIndex(targets: unknown): number {
  const rows = toAimPoints(targets);
  const flagged = rows.findIndex(r => r.first_exec && coordToLatLon(r.coord));
  if (flagged >= 0) return flagged;
  return rows.findIndex(r => coordToLatLon(r.coord));
}

export function firstExecTarget(targets: unknown): { lat: number; lon: number } | null {
  const i = firstExecIndex(targets);
  return i < 0 ? null : coordToLatLon(toAimPoints(targets)[i].coord);
}

/**
 * המרחבים שמותר לשייך אליהם אוטומטית: יש להם מיקום על המפה, והם מסומנים
 * בטופס העזר. `allowedIds` null/undefined = הטופס לא נערך, כל המרחבים מותרים.
 */
export function autoAssignableSpaces<T extends SpaceLike>(spaces: T[], allowedIds?: unknown): T[] {
  const located = spaces.filter(s => s.center_lat != null && s.center_lon != null);
  if (!Array.isArray(allowedIds)) return located;
  const allowed = new Set(allowedIds.map(Number));
  return located.filter(s => allowed.has(Number(s.id)));
}

type LatLon = { lat: number; lon: number };

/**
 * id של המרחב המומלץ לפ"מ, או null כשאין מטרה עם נ"צ או אין מרחב עם מיקום.
 * `axisToward` - מרכז המטרות (`allTargetsAnchor`), שקובע את ציר התקיפה; בלעדיו - הקרוב.
 */
export function recommendBlockSpaceId(targets: unknown, spaces: SpaceLike[], axisToward?: LatLon | null): number | null {
  const best = nearestSpaceInLane(firstExecTarget(targets), spaces, axisToward);
  return best ? Number(best.id) : null;
}

/** מרכז המטרות הקובעות של הפ"מים - ממנו נמדד "רחוק" לפ"מ בלי מטרות. null בלי אף מטרה */
export function targetsAnchor(targetsList: unknown[]): { lat: number; lon: number } | null {
  const pts = targetsList.map(firstExecTarget).filter((p): p is { lat: number; lon: number } => !!p);
  if (!pts.length) return null;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length };
}

/**
 * מרכז **כל** המטרות של הפ"מים (לא רק הקובעות) - יעד ציר התקיפה. יותר נקודות =
 * ציר יציב, שלא מסתובב כשנוסף פ"מ אחד. null בלי אף מטרה עם נ"צ
 */
export function allTargetsAnchor(targetsList: unknown[]): LatLon | null {
  const pts = targetsList.flatMap(t => toAimPoints(t).map(r => coordToLatLon(r.coord))).filter((p): p is LatLon => !!p);
  if (!pts.length) return null;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length };
}

/**
 * המרחב לפ"מ בחלוקה האוטומטית: עם מטרה - הנתיב שמולה והקרוב בו; בלי מטרה -
 * הגזרה הרחוקה ממרכז המטרות (`anchor`). null כשאין על מה להחליט.
 */
export function autoSpaceFor(targets: unknown, spaces: SpaceLike[], anchor: LatLon | null, axisToward?: LatLon | null): number | null {
  if (firstExecTarget(targets)) return recommendBlockSpaceId(targets, spaces, axisToward);
  const far = farthestSpace(anchor, spaces);
  return far ? Number(far.id) : null;
}

/** מפתח המטרה הקובעת - שינוי בה מחשב מחדש שיוך שנעשה אוטומטית */
export function firstExecKey(targets: unknown): string {
  const t = firstExecTarget(targets);
  return t ? `${t.lat.toFixed(5)},${t.lon.toFixed(5)}` : '';
}
