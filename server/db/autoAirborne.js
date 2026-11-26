// המראה אוטומטית - פ"מ שסומן `strips.auto_airborne` מסומן "מאוויר" לבד כשמגיע
// זמן ההמראה שלו (`takeoff_time`).
//
// **opt-in פר פ"מ, כבוי כברירת מחדל.** "מאוויר" הוא בדרך כלל עובדה שהפקח מאשר
// (המטוס באמת עזב את הקרקע), וזמן ההמראה הוא רק תכנון - ולכן המערכת לא מסיקה
// אותו לבד אלא לפ"מים שביקשו זאת במפורש (תרגול, הדגמה, תרחיש מתוזמן).
//
// רץ מ-server.js כל AUTO_AIRBORNE_TICK_MS על public ועל כל סביבות התרגול.
// הסימון נרשם ב-FLOW של הפ"מ (`airborne`), בדיוק כמו סימון ידני.
//
// **חד-פעמי:** אותו UPDATE מכבה את `auto_airborne`. בלי זה כל סבב החזיר לאוויר
// פ"מ שהפקח ביטל לו "מאוויר" או שנחת - וכך פ"מים שהונחתו ב-2026-11-26 חזרו
// לאוויר תוך 15 שניות. ומאותה סיבה גם `landed` נבדק: נחיתה נרשמת שם
// (joiningPoints, GAPI) ולא ב-status.

import pool from './pool.js';
import { recordFlowEvent } from './stripFlowEvents.js';

export const AUTO_AIRBORNE_TICK_MS = 15_000;

/** סבב אחד. מחזיר את הפ"מים שהמריאו בסבב הזה. */
export async function runAutoAirborneOnce(db = pool) {
  const { rows } = await db.query(`
    UPDATE strips SET airborne = TRUE, auto_airborne = FALSE
     WHERE auto_airborne IS TRUE
       AND airborne IS NOT TRUE
       AND landed IS NOT TRUE
       AND takeoff_time IS NOT NULL
       AND takeoff_time <= NOW()
       AND COALESCE(status, '') <> 'landed'
    RETURNING id, callsign, workstation_preset_id`);
  for (const r of rows) {
    await recordFlowEvent(db, {
      strip_id: r.id, kind: 'airborne', callsign: r.callsign, preset_id: r.workstation_preset_id,
      details: { airborne: true, auto: true },
    });
  }
  if (rows.length) console.log(`[auto-airborne] המריאו: ${rows.map(r => r.callsign).join(', ')}`);
  return rows;
}
