// מטוסים בהקפה שכבתה - "היפוך הקפה". ראה PATTERN_FLIP_SPEC.md.
//
// הקפה מוצגת רק כשהקצה שלה בשימוש. כשהפקח הופך כיוון, מטוס שכבר היה בהקפה
// הישנה נשאר משויך אליה - ועד כאן זה קרה **בשקט**: בתלת מימד הוא נעלם, והמעקב
// האוטומטי הפסיק לעקוב אחריו. כאן הוא מסומן `pending`, וכל עמדות המגדל מקבלות
// התראה מרוכזת עד שמישהו מכריע: ממשיך בהקפה (`kept`) או עובר להקפה פעילה.

import { resolveEndUse, runwayGroupPairs } from './runwayState.js';

const norm = (s) => String(s ?? '').trim().toUpperCase();

/**
 * המעברים הנדרשים - פונקציה טהורה.
 *
 * "פעיל" = קצה בשימוש להמראה **או** לנחיתה - אותו כלל של `activePatterns`
 * בלקוח, כדי שהשרת והמפה לא יחלקו על איזו הקפה מוצגת.
 *
 * @param {{id:number, runway_ident:string, pattern_orphan:string|null, flight_status?:string|null}[]} rows
 *   מטוסים עם הקפה; `runway_ident` הוא של **ההקפה** (לא של המטוס).
 * @param {Iterable<string>} activeEnds
 */
export function orphanTransitions(rows, activeEnds) {
  const active = new Set([...activeEnds].map(norm).filter(Boolean));
  const toPending = [], toClear = [];
  for (const r of rows) {
    const on = active.has(norm(r.runway_ident));
    if (!on && !r.pattern_orphan && r.flight_status !== 'landed') toPending.push(r.id);
    else if (on && r.pattern_orphan) toClear.push(r.id);
  }
  return { toPending, toClear };
}

/** הקצוות שבשימוש בשדה, אחרי מיזוג המסלולים המקושרים. */
export async function activeEndsOf(query, airfieldId) {
  const ends = await resolveEndUse(query, airfieldId);
  return ends.filter(e => e.in_takeoff || e.in_landing).map(e => String(e.end_name));
}

/** סימון/ניקוי לשדה אחד. מחזיר כמה שורות השתנו. */
export async function reconcilePatternOrphans(query, airfieldId) {
  const id = Number(airfieldId);
  if (!id) return { pending: 0, cleared: 0 };
  const active = await activeEndsOf(query, id);
  const { rows } = await query(
    `SELECT jpa.id, ap.runway_ident, jpa.pattern_orphan, sa.flight_status
       FROM joining_point_aircraft jpa
       JOIN airfield_patterns ap ON ap.id = jpa.pattern_id
       LEFT JOIN strip_aircraft sa ON sa.strip_id = jpa.strip_id AND sa.idx = jpa.aircraft_idx
      WHERE ap.airfield_id = $1`, [id]);
  const { toPending, toClear } = orphanTransitions(rows, active);
  if (toPending.length) {
    await query(`UPDATE joining_point_aircraft SET pattern_orphan = 'pending', updated_at = NOW()
                  WHERE id = ANY($1::int[]) AND pattern_orphan IS NULL`, [toPending]);
  }
  if (toClear.length) {
    await query(`UPDATE joining_point_aircraft SET pattern_orphan = NULL, updated_at = NOW()
                  WHERE id = ANY($1::int[])`, [toClear]);
  }
  return { pending: toPending.length, cleared: toClear.length };
}

/**
 * השדה של המסלול **והשדות המקושרים** אליו. מסלולים בשימוש משותפים לקבוצת
 * הקישור (`resolveEndUse`), ולכן היפוך בשדה אחד מכבה הקפה גם בשכן.
 */
export async function airfieldsSharingRunway(query, runwayId) {
  const { rows } = await query('SELECT airfield_id FROM airfield_runways WHERE id = $1', [Number(runwayId)]);
  const own = rows[0]?.airfield_id;
  if (own == null) return [];
  const { pairs } = await runwayGroupPairs(query, own);
  const ids = new Set([Number(own)]);
  for (const { src } of pairs) if (src.airfield_id != null) ids.add(Number(src.airfield_id));
  return [...ids];
}
