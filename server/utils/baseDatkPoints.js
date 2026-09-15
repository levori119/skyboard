// נקודות הדת"ק של **בסיס האב** - מקור אחד לחלוקה למסלולים ולסנכרון בניהול.
//
// לבסיס יש כמה שדות (בחא 8: קרקעי, אווירי, הקפה), וכל אחד מחזיק נקודות משלו.
// אבל הדת"קים הם של הבסיס: "דת"ק 1" הוא אותו דת"ק בכל השדות. בפועל סדר העדיפויות
// הוגדר בשדה האווירי ונקודות ההצטרפות יושבות בשדה ההקפה - וחיפוש בשדה של הנקודה
// בלבד לא מצא דבר, והמבנה לא חולק.
//
// שדה בלי בסיס אב רואה רק את הנקודות של עצמו.
import { datkNumberOf } from '../../shared/landingPriority.js';

/** נקודות הדת"ק בכל השדות של הבסיס של `$1`. השדה עצמו ראשון - הגדרה שלו גוברת. */
export const BASE_DATK_POINTS_SQL = `
  SELECT ap.id, ap.airfield_id, ap.name, ap.point_type, ap.landing_priority
    FROM airfield_points ap
    JOIN airfields af ON af.id = ap.airfield_id
   WHERE ap.point_type = 'datk'
     AND (ap.airfield_id = $1
          OR af.base_id = (SELECT base_id FROM airfields WHERE id = $1))
   ORDER BY (ap.airfield_id = $1) DESC, ap.airfield_id, ap.id`;

/** @param {{ query: Function }} q  pool או client של טרנזקציה */
export async function baseDatkPoints(q, airfieldId) {
  const id = Number(airfieldId);
  if (!Number.isFinite(id)) return [];
  return (await q.query(BASE_DATK_POINTS_SQL, [id])).rows;
}

/**
 * סנכרון: הרשימה שנשמרה לנקודת דת"ק נכתבת לאותו מספר דת"ק בשאר השדות של הבסיס.
 * @returns {Promise<number>} כמה נקודות נוספות עודכנו
 */
export async function syncBaseLandingPriority(q, point, list) {
  if (String(point?.point_type ?? '').trim() !== 'datk') return 0;
  const n = datkNumberOf(point.name);
  if (n == null) return 0;
  const siblings = (await baseDatkPoints(q, point.airfield_id))
    .filter(p => Number(p.id) !== Number(point.id) && datkNumberOf(p.name) === n);
  if (!siblings.length) return 0;
  await q.query(
    'UPDATE airfield_points SET landing_priority = $1::jsonb WHERE id = ANY($2::int[])',
    [JSON.stringify(list), siblings.map(p => Number(p.id))],
  );
  return siblings.length;
}
