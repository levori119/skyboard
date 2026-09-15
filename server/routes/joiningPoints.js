// ─── נקודות הצטרפות (STAR) ────────────────────────────────────────────────────
//
// נקודת הצטרפות דומה לנקודת העברה - מקבלת פ"ממים מעמדה אחרת דרך **אותו מנגנון
// העברות** - אבל התצוגה שונה: הנקודה נפרסת לטבלת בלוקי גבהים ופ"מ יושב בבלוק
// לפי גובהו. רלוונטית רק לעמדה מסוג שדה.
//
// **ההגדרה שייכת לשדה ולא לעמדה** (כמו מסלולים והקפות), ולעמדה יש דריסת
// **תצוגה** בלבד. זה הלקח מקישורי המסלולים: הצמדת ההגדרה לעמדה אפשרה לשתי
// עמדות באותו שדה לחלוק על מה שקיים בשדה.
//
// חלוקת הנתיבים אינה שרירותית - היא מקבילה לחלוקת ההרשאות ב-middleware/auth.js:
//   /api/joining-points*        = הגדרה   -> ראש צוות או מנהל
//   /api/joining-point-strips*  = מצב חי  -> כל מזוהה (הפקח בעמדה)
//   /api/joining-point-aircraft = מצב חי  -> כל מזוהה
import { Router } from 'express';
import pool from '../db/pool.js';
import { aircraftFaultsSubquery } from '../db/aircraftFaults.js';
import { captureChange } from '../gapi/hooks.js';
import { recordFlowEvent } from '../db/stripFlowEvents.js';
import { expectedFormationCount } from '../../shared/formationCount.js';
import { planLandingRunways } from '../../shared/landingPriority.js';
import { resolveEndUse } from '../utils/runwayState.js';
import { resolveAircraftOnly } from '../../shared/joiningPointProps.js';

const router = new Router();

/**
 * האם **כל** מטוסי הפ"מ כבר אינם ממתינים בנקודת ההצטרפות - בהקפה או נחתו.
 *
 * הגודל הצפוי מגיע מ-`expectedFormationCount` (shared) ולא מספירת שורות:
 * שורת `strip_aircraft` / `joining_point_aircraft` נוצרת רק למטוס שנגעו בו,
 * וספירת שורות הוציאה מבנה שלם מהטבלה ברגע שהמטוס **היחיד** עם שורה יצא
 * להקפה או נחת - בזמן ששאר המבנה עדיין המתין בנקודה (PATTERN_AUTOTRACK_SPEC §8).
 */
async function formationLeftPoint(q, sid) {
  const { rows } = await q.query(
    `SELECT (SELECT COUNT(*) FROM strip_aircraft WHERE strip_id = $1) AS total,
            s.number_of_formation AS formation, s.aircraft_indices AS indices,
            (SELECT COUNT(DISTINCT g.idx) FROM (
               SELECT aircraft_idx AS idx FROM joining_point_aircraft WHERE strip_id = $1 AND in_pattern = TRUE
               UNION
               SELECT idx FROM strip_aircraft WHERE strip_id = $1 AND flight_status = 'landed'
             ) g) AS gone
       FROM strips s WHERE s.id = $1`,
    [sid],
  );
  const r = rows[0];
  if (!r) return false;
  const expected = expectedFormationCount({
    rows: Number(r.total), formation: r.formation, indices: Array.isArray(r.indices) ? r.indices : null,
  });
  return expected > 0 && Number(r.gone) >= expected;
}

const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
/** מזהה פ"מ מגיע מהלקוח גם כ-`s123` (ראה routes/strips.js). */
const stripId = (v) => int(String(v ?? '').replace(/^s/, ''));

/** סטטוסי הנחיתה של המטוס. "זה עובר לסטטוס מטוס" - ולכן נשמר על strip_aircraft. */
// חמישה מצבים בלעדיים: המקום שבו המטוס נמצא בהקפה, או ירוקים, או שנחת.
// `cleared_to_land` נשמר כשם היסטורי של "פיינל" כדי שרשומות ותיקות לא יישברו.
const FLIGHT_STATUSES = new Set(['none', 'downwind', 'base', 'final', 'cleared_to_land', 'landed']);

/**
 * רישום ליומן הביקורת.
 * ⚠️ הזהות נלקחת מ-`req.user` (האסימון החתום) ולא מגוף הבקשה - זה SK-18:
 * כשהלקוח קבע crew_member_id/name, כל אחד יכול היה לרשום פעולה בשם בקר אחר.
 * `details` הוא JSONB, ולכן **אובייקט** ולא מחרוזת - מסך התחקיר קורא ממנו מפתחות.
 */
async function logActivity(req, fields) {
  try {
    await pool.query(
      `INSERT INTO activity_log (event_type, severity, workstation_preset_id, workstation_name,
         crew_member_id, crew_member_name, strip_id, strip_callsign, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [fields.event_type, fields.severity || 'normal', fields.preset_id || null, fields.preset_name || '',
        req.user?.crewMemberId ?? null, req.user?.name ?? null, fields.strip_id != null ? String(fields.strip_id) : null,
        fields.strip_callsign || '', JSON.stringify(fields.details || {})],
    );
  } catch (err) {
    // יומן הביקורת לא מפיל פעולה תפעולית - הפקח לא יכול לחכות ל-INSERT הזה
    console.error('[joining-points] activity_log נכשל:', err.message);
  }
}

/**
 * סדר עדיפויות לנחיתה לדת"ק - חלוקת מבנה **שהגיע עכשיו** לנקודה למסלולים.
 *
 * כל מטוס מקבל את המסלול הראשון ברשימת העדיפויות של הדת"ק שלו
 * (`airfield_points.landing_priority`, נקודה מסוג `datk` בשדה של הנקודה) **שפתוח
 * כרגע לנחיתות** (`runway_end_use` אחרי מיזוג המסלולים המקושרים - אותו מקור
 * כמו פאנל "מסלולים בשימוש"). ההקפה של המסלול נרשמת איתו, כמו בבחירה ידנית.
 *
 * רץ **רק בכניסה לנקודה** ולא בכל שיבוץ: מסלול שהפקח ניקה בכוונה לא חוזר בשינוי
 * גובה. מטוס שכבר יש לו מסלול (או שבהקפה) לא נדרס - תנאי ה-WHERE ב-upsert
 * אוכף את זה גם מול בחירה ידנית שנכתבה באותו רגע מעמדה אחרת.
 *
 * `reorder` = הפעולה "סדר מחדש מסלולים לפי דת"קים": מחלקים מחדש **גם** מטוסים
 * שכבר יש להם מסלול (אוטומטי או ידני), כי המצב בשדה השתנה. מטוס בהקפה לא נוגעים
 * בו, ומטוס שאין לו תוצאה (בלי דת"ק / אף מסלול לא פתוח) שומר את המסלול שלו.
 *
 * כל מסלול שנכתב כאן מסומן `runway_auto` - כך הפקח רואה בטבלה מה נבחר אוטומטית
 * ומה בחר בעצמו. בחירה ידנית (PUT על המטוס) מכבה את הסימון.
 *
 * `q` הוא ה-client של הטרנזקציה כשיש כזה: `pool.query` באמצע handler שמחזיק
 * client נתקע מול PGlite (localPool = חיבור יחיד).
 * @returns {Promise<{ idx: number, runway_ident: string }[]>}
 */
async function autoAssignLandingRunways(q, pointId, sid, { reorder = false } = {}) {
  const pt = await q.query('SELECT airfield_id FROM airfield_joining_points WHERE id = $1', [pointId]);
  const airfieldId = pt.rows[0]?.airfield_id;
  if (!airfieldId) return [];
  const { rows: points } = await q.query(
    `SELECT name, point_type, landing_priority FROM airfield_points
      WHERE airfield_id = $1 AND point_type = 'datk' AND jsonb_array_length(landing_priority) > 0`,
    [airfieldId],
  );
  if (!points.length) return [];
  const landingRunways = (await resolveEndUse((sql, params) => q.query(sql, params), airfieldId))
    .filter(r => r.in_landing).map(r => String(r.end_name));
  if (!landingRunways.length) return [];

  // פ"מ מפוצל מחזיק רק חלק מהמטוסים - לא לשבץ מטוסים שיושבים בפ"מ אחר
  const { rows: [strip] } = await q.query('SELECT aircraft_indices FROM strips WHERE id = $1', [sid]);
  const own = Array.isArray(strip?.aircraft_indices) && strip.aircraft_indices.length
    ? new Set(strip.aircraft_indices.map(Number)) : null;
  const { rows: aircraft } = await q.query(
    `SELECT sa.idx, sa.datk, COALESCE(jpa.runway_ident, '') AS runway_ident, COALESCE(jpa.in_pattern, FALSE) AS in_pattern
       FROM strip_aircraft sa
       LEFT JOIN joining_point_aircraft jpa ON jpa.strip_id = sa.strip_id AND jpa.aircraft_idx = sa.idx
      WHERE sa.strip_id = $1 ORDER BY sa.idx`,
    [sid],
  );
  const plan = planLandingRunways({
    aircraft: aircraft
      .filter(a => (!own || own.has(Number(a.idx))) && !a.in_pattern)
      // בסידור מחדש המסלול הקיים לא מונע חלוקה - הוא בדיוק מה שמחליפים
      .map(a => (reorder ? { ...a, runway_ident: '' } : a)),
    points, landingRunways,
  });
  if (!plan.length) return [];

  const { rows: patterns } = await q.query(
    'SELECT id, runway_ident FROM airfield_patterns WHERE airfield_id = $1 ORDER BY sort_order, id', [airfieldId],
  );
  const done = [];
  for (const { idx, runway_ident } of plan) {
    const patternId = patterns.find(p => String(p.runway_ident || '').trim() === runway_ident)?.id ?? null;
    const { rowCount } = await q.query(
      `INSERT INTO joining_point_aircraft (joining_point_id, strip_id, aircraft_idx, runway_ident, pattern_id, runway_auto)
       VALUES ($1,$2,$3,$4,$5,TRUE)
       ON CONFLICT (strip_id, aircraft_idx) DO UPDATE SET
         runway_ident = EXCLUDED.runway_ident, pattern_id = EXCLUDED.pattern_id,
         runway_auto = TRUE, updated_at = NOW()
       WHERE joining_point_aircraft.in_pattern = FALSE
         AND ($6::boolean OR COALESCE(joining_point_aircraft.runway_ident, '') = '')`,
      [pointId, sid, idx, runway_ident, patternId, reorder],
    );
    if (rowCount) done.push({ idx, runway_ident });
  }
  return done;
}

/** החלוקה האוטומטית לא מפילה שיבוץ: הפ"מ כבר בנקודה, והמסלול נבחר ידנית כמו תמיד. */
async function safeAutoAssign(q, pointId, sid) {
  try {
    return await autoAssignLandingRunways(q, pointId, sid);
  } catch (err) {
    console.error('[joining-points] חלוקה אוטומטית למסלולים נכשלה:', err.message);
    return [];
  }
}

/** שקיפות: הפקח (ותחקיר) יודעים שהמסלול נבחר אוטומטית ולפי מה. */
async function logAutoRunways(req, b, pointId, sid, assigned, reorder = false) {
  if (!assigned.length) return;
  await logActivity(req, {
    event_type: 'joining_point_auto_runway', preset_id: int(b.preset_id), preset_name: b.preset_name,
    strip_id: sid, strip_callsign: b.callsign || '',
    details: { joiningPointId: pointId, reorder, assignments: assigned.map(a => ({ aircraftIdx: a.idx, runwayIdent: a.runway_ident })) },
  });
}

// ── ולידציה של טווחי ההפרשים ─────────────────────────────────────────────────
// חפיפה בין טווחים הייתה יוצרת בלוקים כפולים או חסרים בטבלה - טעות **בטיחותית**
// (בלוק חסר = מטוס שאינו נראה). לכן היא נחסמת בשמירה ולא מתוקנת בשקט.
function stepsError(steps) {
  const norm = (steps || []).map(s => ({
    from: Math.min(int(s?.from_ft) ?? 0, int(s?.to_ft) ?? 0),
    to: Math.max(int(s?.from_ft) ?? 0, int(s?.to_ft) ?? 0),
    step: int(s?.step_ft) ?? 0,
  }));
  for (const s of norm) {
    if (s.to <= s.from) return 'טווח הפרשים ריק או הפוך';
    if (s.step <= 0) return 'הפרש גבהים חייב להיות חיובי';
  }
  for (let i = 0; i < norm.length; i++) {
    for (let j = i + 1; j < norm.length; j++) {
      if (Math.max(norm[i].from, norm[j].from) < Math.min(norm[i].to, norm[j].to)) {
        return 'טווחי ההפרשים חופפים';
      }
    }
  }
  return null;
}

async function loadSteps(pointIds) {
  if (!pointIds.length) return new Map();
  const { rows } = await pool.query(
    `SELECT id, joining_point_id, from_ft, to_ft, step_ft, sort_order
       FROM joining_point_alt_steps WHERE joining_point_id = ANY($1::int[])
      ORDER BY sort_order, from_ft`,
    [pointIds],
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.joining_point_id)) map.set(r.joining_point_id, []);
    map.get(r.joining_point_id).push(r);
  }
  return map;
}

async function replaceSteps(client, pointId, steps) {
  await client.query('DELETE FROM joining_point_alt_steps WHERE joining_point_id = $1', [pointId]);
  const list = Array.isArray(steps) ? steps : [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    await client.query(
      `INSERT INTO joining_point_alt_steps (joining_point_id, from_ft, to_ft, step_ft, sort_order)
       VALUES ($1,$2,$3,$4,$5)`,
      [pointId, int(s?.from_ft) ?? 0, int(s?.to_ft) ?? 0, int(s?.step_ft) ?? 0, i],
    );
  }
}

// ── GET /api/joining-points — התמונה האפקטיבית ────────────────────────────────
// כמו ב-map-transfer-points: ההגדרה של השדה, כשדריסת העמדה מחליפה את המיקום
// ומצב התצוגה של הנקודה המקבילה (`is_override: true`). ההגדרה עצמה - טווח
// הגבהים, ההפרשים והנקודה המקושרת - **אינה** ניתנת לדריסה בכוונה.
router.get('/api/joining-points', async (req, res) => {
  try {
    const airfieldId = int(req.query.airfield_id);
    const presetId = int(req.query.preset_id);
    if (!airfieldId) return res.status(400).json({ error: 'airfield_id נדרש' });

    const { rows } = await pool.query(
      `SELECT jp.*, s.name AS sector_name
         FROM airfield_joining_points jp
         LEFT JOIN sectors s ON s.id = jp.sector_id
        WHERE jp.airfield_id = $1
        ORDER BY jp.sort_order, jp.id`,
      [airfieldId],
    );
    const steps = await loadSteps(rows.map(r => r.id));

    let overrides = new Map();
    if (presetId) {
      const ov = await pool.query(
        `SELECT * FROM joining_point_preset_overrides
          WHERE preset_id = $1 AND joining_point_id = ANY($2::int[])`,
        [presetId, rows.map(r => r.id)],
      );
      overrides = new Map(ov.rows.map(r => [r.joining_point_id, r]));
    }

    res.json(rows.map(r => {
      const o = overrides.get(r.id);
      const aircraftOnly = resolveAircraftOnly(r.expand_aircraft, o?.expand_aircraft);
      return {
        ...r,
        steps: steps.get(r.id) || [],
        x_pct: o && o.x_pct != null ? o.x_pct : r.x_pct,
        y_pct: o && o.y_pct != null ? o.y_pct : r.y_pct,
        display_mode: o?.display_mode || 'pin',
        is_override: !!o,
        // מטוסים בלבד: בחירת העמדה גוברת על הניהול. שני השדות הנוספים מאפשרים
        // למאפייני הנקודה בעמדה להציג את ברירת המחדל והאם היא נדרסה.
        expand_aircraft: aircraftOnly.value,
        expand_aircraft_default: aircraftOnly.defaultValue,
        expand_aircraft_override: aircraftOnly.fromStation ? o.expand_aircraft : null,
      };
    }));
  } catch (err) {
    console.error('GET /api/joining-points:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/joining-points', async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const err = stepsError(b.steps);
    if (err) return res.status(400).json({ error: err });
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO airfield_joining_points
         (airfield_id, name, alt_min_ft, alt_max_ft, default_step_ft, sector_id, sub_label, x_pct, y_pct, color, sort_order, expand_aircraft)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [int(b.airfield_id), String(b.name || '').slice(0, 100), int(b.alt_min_ft) ?? 0, int(b.alt_max_ft) ?? 0,
        int(b.default_step_ft) ?? 1000, int(b.sector_id), b.sub_label || null,
        b.x_pct ?? null, b.y_pct ?? null, String(b.color || '#38bdf8').slice(0, 20), int(b.sort_order) ?? 0,
        b.expand_aircraft === true],
    );
    await replaceSteps(client, rows[0].id, b.steps);
    await client.query('COMMIT');
    res.json({ ...rows[0], steps: (b.steps || []) });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/joining-points:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.put('/api/joining-points/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const err = stepsError(b.steps);
    if (err) return res.status(400).json({ error: err });
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE airfield_joining_points SET
         name=$1, alt_min_ft=$2, alt_max_ft=$3, default_step_ft=$4, sector_id=$5,
         sub_label=$6, x_pct=$7, y_pct=$8, color=$9, sort_order=$10,
         -- COALESCE: קריאה שאינה נושאת את הדגל לא מאפסת אותו בשקט
         expand_aircraft=COALESCE($12, expand_aircraft)
       WHERE id=$11 RETURNING *`,
      [String(b.name || '').slice(0, 100), int(b.alt_min_ft) ?? 0, int(b.alt_max_ft) ?? 0,
        int(b.default_step_ft) ?? 1000, int(b.sector_id), b.sub_label || null,
        b.x_pct ?? null, b.y_pct ?? null, String(b.color || '#38bdf8').slice(0, 20),
        int(b.sort_order) ?? 0, int(req.params.id),
        typeof b.expand_aircraft === 'boolean' ? b.expand_aircraft : null],
    );
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'לא נמצאה' }); }
    if (b.steps !== undefined) await replaceSteps(client, rows[0].id, b.steps);
    await client.query('COMMIT');
    res.json({ ...rows[0], steps: b.steps || [] });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PUT /api/joining-points/:id:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/joining-points/:id/reorder-runways — "סדר מחדש מסלולים לפי דת"קים".
// הפקח לוחץ כשהמצב בשדה השתנה (מסלול נסגר/נפתח לנחיתה): כל המטוסים שממתינים
// בנקודה מחולקים מחדש לפי סדר העדיפויות של הדת"ק שלהם - גם מי שנבחר לו ידנית.
// האישור מול דריסת בחירה ידנית נעשה בעמדה, לפני הבקשה.
router.post('/api/joining-points/:id/reorder-runways', async (req, res) => {
  try {
    const b = req.body || {};
    const pointId = int(req.params.id);
    const pt = await pool.query('SELECT id FROM airfield_joining_points WHERE id = $1', [pointId]);
    if (!pt.rows.length) return res.status(404).json({ error: 'לא נמצא' });
    const { rows: strips } = await pool.query(
      `SELECT jps.strip_id, s.callsign FROM joining_point_strips jps JOIN strips s ON s.id = jps.strip_id
        WHERE jps.joining_point_id = $1 ORDER BY jps.created_at`,
      [pointId],
    );
    const assigned = [];
    for (const s of strips) {
      const done = await autoAssignLandingRunways(pool, pointId, s.strip_id, { reorder: true });
      await logAutoRunways(req, { ...b, callsign: s.callsign }, pointId, s.strip_id, done, true);
      assigned.push(...done.map(d => ({ strip_id: s.strip_id, ...d })));
    }
    res.json({ assigned });
  } catch (err) {
    console.error('POST reorder-runways:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/joining-points/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_joining_points WHERE id = $1', [int(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/joining-points/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// דריסת עמדה - מיקום ומצב תצוגה בלבד.
router.put('/api/joining-points/:id/override', async (req, res) => {
  try {
    const b = req.body || {};
    const presetId = int(b.preset_id);
    if (!presetId) return res.status(400).json({ error: 'preset_id נדרש' });
    const { rows } = await pool.query(
      `INSERT INTO joining_point_preset_overrides (joining_point_id, preset_id, x_pct, y_pct, display_mode)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (joining_point_id, preset_id) DO UPDATE
         SET x_pct=EXCLUDED.x_pct, y_pct=EXCLUDED.y_pct, display_mode=EXCLUDED.display_mode, updated_at=NOW()
       RETURNING *`,
      [int(req.params.id), presetId, b.x_pct ?? null, b.y_pct ?? null,
        b.display_mode === 'full' ? 'full' : 'pin'],
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/joining-points/:id/override:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// מאפייני הנקודה **בעמדה** - "מטוסים בלבד" לעמדה הזו בלבד. עדכון חלקי: לא נוגע
// במיקום ובמצב התצוגה שנשמרו לעמדה (ה-override למעלה דורס את שלושתם יחד).
// expand_aircraft: true/false = בחירת העמדה · null = חזרה לברירת המחדל של הניהול.
router.put('/api/joining-points/:id/station-props', async (req, res) => {
  try {
    const b = req.body || {};
    const presetId = int(b.preset_id);
    const pointId = int(req.params.id);
    if (!presetId || !pointId) return res.status(400).json({ error: 'preset_id נדרש' });
    const choice = typeof b.expand_aircraft === 'boolean' ? b.expand_aircraft : null;
    const { rows } = await pool.query(
      `INSERT INTO joining_point_preset_overrides (joining_point_id, preset_id, expand_aircraft)
       VALUES ($1,$2,$3)
       ON CONFLICT (joining_point_id, preset_id) DO UPDATE
         SET expand_aircraft = EXCLUDED.expand_aircraft, updated_at = NOW()
       RETURNING *`,
      [pointId, presetId, choice],
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/joining-points/:id/station-props:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/joining-points/:id/override/:presetId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM joining_point_preset_overrides WHERE joining_point_id=$1 AND preset_id=$2',
      [int(req.params.id), int(req.params.presetId)],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE joining point override:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── מצב חי ────────────────────────────────────────────────────────────────────

// GET /api/joining-point-strips?airfield_id= — מי יושב בנקודות של השדה, ומה מצב
// המטוסים. הגובה **אינו** מוחזר מכאן אלא מ-strips.alt, ולכן מצורף ל-JOIN:
// שני מקורות אמת לגובה של אותו פ"מ הם באג שמחכה לקרות.
router.get('/api/joining-point-strips', async (req, res) => {
  try {
    const airfieldId = int(req.query.airfield_id);
    if (!airfieldId) return res.status(400).json({ error: 'airfield_id נדרש' });
    const { rows } = await pool.query(
      `SELECT jps.id, jps.joining_point_id, jps.strip_id, jps.is_coordinated, jps.coordination_note,
              jps.planned_alt,
              s.callsign, s.sq, s.alt, s.squadron, s.number_of_formation, s.notes, s.task,
              s.aircraft_indices, s.original_formation_count, s.workstation_preset_id,
              -- מטוס בתקלה שנכנס לנקודת ההצטרפות משנה את סדר הקליטה, ולכן
              -- הפקח רואה את התג על הפ"מ בבלוק הגובה ולא רק בפתיחת המבנה
              ${aircraftFaultsSubquery('s')} AS aircraft_faults
         FROM joining_point_strips jps
         JOIN airfield_joining_points jp ON jp.id = jps.joining_point_id
         JOIN strips s ON s.id = jps.strip_id
        WHERE jp.airfield_id = $1
        ORDER BY jps.created_at`,
      [airfieldId],
    );
    // מטוס שנכנס להקפה עוזב את טבלת ההצטרפות אבל נשאר על ההקפה, ולכן הוא נמשך
    // גם דרך ההקפה שלו - **בתוך אותו שדה בלבד**. תנאי `in_pattern` גורף היה
    // מציג בעמדה מטוסים בהקפות של שדות אחרים.
    // ה-או"ק מצורף כאן ולא נשלף בלקוח: מטוס שכל הפ"מ שלו נכנס להקפה יוצא
    // מטבלת ההצטרפות, ואז חיפוש הפ"מ ברשימת העמדה מחזיר ריק - והתווית על
    // ההקפה הצטמצמה למספר בלבד במקום לאות הקריאה המלאה.
    const ac = await pool.query(
      `SELECT jpa.*, s.callsign, s.aircraft_indices, s.number_of_formation,
              s.original_formation_count, s.workstation_preset_id,
              COALESCE(sa.flight_status, 'none') AS flight_status,
              COALESCE(sa.greens, FALSE) AS greens
         FROM joining_point_aircraft jpa
         JOIN strips s ON s.id = jpa.strip_id
         -- סטטוס הטיסה נוסע **עם שורת ההקפה**: פ"מ שנחת יוצא מרשימת העמדה,
         -- ואז חיפוש הסטטוס ברשימה מחזיר ריק - והמטוס נשאר תקוע על ההקפה.
         -- העמודה ב-strip_aircraft היא idx ולא aircraft_idx (זה השם רק
         -- ב-joining_point_aircraft). ההצמדה השגויה הפילה את כל הבקשה, ואיתה
         -- את המצב החי של הנקודה - הטבלה נראתה ריקה ושום שיבוץ לא הופיע.
         LEFT JOIN strip_aircraft sa
                ON sa.strip_id = jpa.strip_id AND sa.idx = jpa.aircraft_idx
         LEFT JOIN airfield_joining_points jp ON jp.id = jpa.joining_point_id
         LEFT JOIN airfield_patterns ap ON ap.id = jpa.pattern_id
        WHERE jp.airfield_id = $1 OR ap.airfield_id = $1`,
      [airfieldId],
    );
    res.json({ strips: rows, aircraft: ac.rows });
  } catch (err) {
    console.error('GET /api/joining-point-strips:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/joining-point-strips — שיבוץ פ"מ לבלוק גובה.
// זו הפעולה שמחליפה את הכתיבה בצ'ינו: שיוך לנקודה + קביעת הגובה בשורה אחת.
// **לא** מחליף את מנגנון ההעברות: הקבלה עצמה נעשית ב-/api/transfers/:id/accept
// כמו בכל נקודת העברה, והשיבוץ קורה אחריה.
router.post('/api/joining-point-strips', async (req, res) => {
  try {
    const b = req.body || {};
    const pointId = int(b.joining_point_id);
    const sid = stripId(b.strip_id);
    if (!pointId || !sid) return res.status(400).json({ error: 'joining_point_id ו-strip_id נדרשים' });

    const alt = b.alt !== undefined && b.alt !== null && String(b.alt) !== '' ? String(b.alt).slice(0, 10) : null;

    // הגובה נכתב ל-`strips.alt` **רק כשהפ"מ כבר שלי**. כשהוא עדיין בדרך אליי
    // (נקודת הצטרפות שהיא גם נקודת העברה) הגובה נשמר כ**תוכנית** בלבד: כתיבה
    // ל-`strips.alt` הייתה משנה לעמדה המוסרת את המידע מתחת לידיים. בקבלה
    // התוכנית היא שנכתבת - "הגובה שתוכנן הוא הקובע".
    let owned = b.apply === true;
    if (alt && !owned) {
      const cur = await pool.query('SELECT workstation_preset_id FROM strips WHERE id = $1', [sid]);
      const holder = cur.rows[0]?.workstation_preset_id;
      owned = holder != null && int(b.preset_id) != null && Number(holder) === int(b.preset_id);
    }
    if (alt && owned) {
      await pool.query('UPDATE strips SET alt = $1 WHERE id = $2', [alt, sid]);
    }

    // שיבוץ לנקודה אחרת מסיר מהקודמת: פ"מ מצטרף דרך נקודה אחת בלבד.
    await pool.query(
      'DELETE FROM joining_point_strips WHERE strip_id = $1 AND joining_point_id <> $2',
      [sid, pointId],
    );
    const { rows } = await pool.query(
      `INSERT INTO joining_point_strips (joining_point_id, strip_id, planned_alt)
       VALUES ($1,$2,$3)
       ON CONFLICT (joining_point_id, strip_id) DO UPDATE
         SET planned_alt = COALESCE(EXCLUDED.planned_alt, joining_point_strips.planned_alt),
             updated_at = NOW()
       RETURNING *, (xmax = 0) AS arrived`,
      [pointId, sid, alt],
    );
    const { arrived, ...row } = rows[0];
    await logActivity(req, {
      event_type: 'joining_point_assign', preset_id: int(b.preset_id), preset_name: b.preset_name,
      strip_id: sid, strip_callsign: b.callsign || '',
      details: { joiningPointId: pointId, joiningPointName: b.point_name || '', altitude: b.alt ?? null },
    });
    // המבנה **הגיע** לנקודה (שורה חדשה, לא שינוי גובה) - חלוקה למסלולים לפי הדת"ק
    if (arrived) await logAutoRunways(req, b, pointId, sid, await safeAutoAssign(pool, pointId, sid));
    res.json(row);
  } catch (err) {
    console.error('POST /api/joining-point-strips:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/joining-point-strips/:pointId/:stripId/split — פיצול מבנה בין בלוקים.
// המבנה **אינו** מפוצל לשתי רשומות: המטוסים שנבחרו מקבלים גובה חריג משלהם,
// והפ"מ מופיע בשני הבלוקים - בדיוק כמו "בננה 1,2" בגובה אחד ו"בננה 3,4" באחר
// על הסדק. `indices` ריק (או שווה לכל המבנה) = ביטול הפיצול והחזרה לגובה אחד.
router.put('/api/joining-point-strips/:pointId/:stripId/split', async (req, res) => {
  const b = req.body || {};
  const pointId = int(req.params.pointId);
  const sid = stripId(req.params.stripId);
  const alt = b.alt != null && String(b.alt) !== '' ? String(b.alt).slice(0, 10) : null;
  const indices = Array.isArray(b.indices) ? b.indices.map(int).filter(n => n != null && n > 0) : [];
  if (!sid || !alt) return res.status(400).json({ error: 'מזהה פ"מ וגובה נדרשים' });

  let all = false;
  let autoRunways = [];
  const client = await pool.connect();
  try {
    let arrived = false;
    await client.query('BEGIN');
    const cnt = await client.query('SELECT number_of_formation FROM strips WHERE id = $1', [sid]);
    const total = Math.max(0, Math.min(parseInt(cnt.rows[0]?.number_of_formation, 10) || 0, 16));
    all = indices.length === 0 || (total > 0 && indices.length >= total);

    if (all) {
      // כל המבנה עובר: הגובה חוזר להיות של הפ"מ, והחריגים מתאפסים
      await client.query('UPDATE joining_point_aircraft SET alt = NULL, updated_at = NOW() WHERE strip_id = $1', [sid]);
      const ins = await client.query(
        `INSERT INTO joining_point_strips (joining_point_id, strip_id, planned_alt) VALUES ($1,$2,$3)
         ON CONFLICT (joining_point_id, strip_id) DO UPDATE SET planned_alt = EXCLUDED.planned_alt, updated_at = NOW()
         RETURNING (xmax = 0) AS arrived`,
        [pointId, sid, alt],
      );
      arrived = ins.rows[0]?.arrived === true;
      const own = await client.query('SELECT workstation_preset_id FROM strips WHERE id = $1', [sid]);
      if (int(b.preset_id) != null && Number(own.rows[0]?.workstation_preset_id) === int(b.preset_id)) {
        await client.query('UPDATE strips SET alt = $1 WHERE id = $2', [alt, sid]);
      }
    } else {
      // גם בפיצול הפ"מ **חייב** להיות רשום בנקודה: בלעדיו רק שורות המטוסים
      // נוצרות, והמבנה לא מופיע בטבלה כלל - הפעולה נראית כאילו לא קרתה.
      const ins = await client.query(
        `INSERT INTO joining_point_strips (joining_point_id, strip_id) VALUES ($1,$2)
         ON CONFLICT (joining_point_id, strip_id) DO UPDATE SET updated_at = NOW()
         RETURNING (xmax = 0) AS arrived`,
        [pointId, sid],
      );
      arrived = ins.rows[0]?.arrived === true;
      for (const idx of indices) {
        await client.query(
          `INSERT INTO joining_point_aircraft (joining_point_id, strip_id, aircraft_idx, alt)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (strip_id, aircraft_idx) DO UPDATE SET
             alt = EXCLUDED.alt,
             joining_point_id = COALESCE(joining_point_aircraft.joining_point_id, EXCLUDED.joining_point_id),
             updated_at = NOW()`,
          [pointId, sid, idx, alt],
        );
      }
    }
    await client.query('COMMIT');
    // אחרי ה-COMMIT: הגובה נשמר גם אם החלוקה למסלולים נכשלת
    if (arrived) autoRunways = await safeAutoAssign(client, pointId, sid);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PUT split:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
  // היומן נכתב דרך `pool`, ולכן **אחרי** שחרור ה-client: מול PGlite (חיבור
  // יחיד) כתיבה בזמן שה-client מוחזק נתקעה, והפיצול לא חזר לעולם.
  await logActivity(req, {
    event_type: 'joining_point_assign', preset_id: int(b.preset_id), preset_name: b.preset_name,
    strip_id: sid, strip_callsign: b.callsign || '',
    details: { joiningPointId: pointId, altitude: alt, aircraftIndices: all ? 'all' : indices.join('+') },
  });
  await logAutoRunways(req, b, pointId, sid, autoRunways);
  res.json({ ok: true, all, indices });
});

// הסרת **מטוס בודד** מנקודת ההצטרפות. נקרא כשהמטוס נחת.
// פ"מ שנשאר בלי מטוסים בנקודה יורד ממנה כולו - וכיוון שהשורה (בלוק הגובה)
// נגזרת מהמטוסים, מטוס אחרון בשורה מוריד גם אותה.
router.delete('/api/joining-point-aircraft/:stripId/:idx', async (req, res) => {
  const client = await pool.connect();
  try {
    const sid = stripId(req.params.stripId);
    const idx = int(req.params.idx);
    await client.query('BEGIN');
    await client.query('DELETE FROM joining_point_aircraft WHERE strip_id=$1 AND aircraft_idx=$2', [sid, idx]);
    // הפ"מ יוצא מהנקודה רק כש**כל** מטוסיו הצפויים בהקפה או נחתו. קודם הוא
    // יצא כשלא נשארו לו **שורות** בנקודה, ולכן מטוס 1 שנחת העלים מהטבלה את
    // 2-4 שעדיין המתינו בה בלי שורה משלהם.
    if (await formationLeftPoint(client, sid)) {
      await client.query('DELETE FROM joining_point_strips WHERE strip_id = $1', [sid]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DELETE /api/joining-point-aircraft:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.delete('/api/joining-point-strips/:pointId/:stripId', async (req, res) => {
  const client = await pool.connect();
  try {
    const pid = int(req.params.pointId);
    const sid = stripId(req.params.stripId);
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM joining_point_strips WHERE joining_point_id=$1 AND strip_id=$2', [pid, sid]);
    // ⚠ גם המיקום על ההקפה. הפ"מ יצא מהטבלה אבל שורות `joining_point_aircraft`
    // עם `pattern_id` נשארו יתומות - והמטוסים המשיכו להיות מצוירים על ההקפה
    // מול טבלה ריקה. הטבלה היא מקור האמת: יצא ממנה = ירד מההקפה.
    await client.query(
      `DELETE FROM joining_point_aircraft
        WHERE strip_id = $1
          AND NOT EXISTS (SELECT 1 FROM joining_point_strips js WHERE js.strip_id = $1)`, [sid]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DELETE /api/joining-point-strips:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// אישור קונפליקט כ"מתואם" - מוריד את הבלוק מהאדום. פעולה בטיחותית, ולכן
// נרשמת ביומן הביקורת עם מי אישר ומה ההערה.
router.put('/api/joining-point-strips/:pointId/:stripId/coordinate', async (req, res) => {
  try {
    const b = req.body || {};
    const coordinated = b.is_coordinated !== false;
    const { rows } = await pool.query(
      `UPDATE joining_point_strips SET is_coordinated=$1, coordination_note=$2, updated_at=NOW()
        WHERE joining_point_id=$3 AND strip_id=$4 RETURNING *`,
      [coordinated, String(b.coordination_note || '').slice(0, 500),
        int(req.params.pointId), stripId(req.params.stripId)],
    );
    if (!rows.length) return res.status(404).json({ error: 'לא נמצא' });
    await logActivity(req, {
      event_type: coordinated ? 'joining_point_coordinated' : 'joining_point_conflict',
      severity: coordinated ? 'warning' : 'critical',
      preset_id: int(b.preset_id), preset_name: b.preset_name,
      strip_id: stripId(req.params.stripId), strip_callsign: b.callsign || '',
      details: { joiningPointId: int(req.params.pointId), coordinated, coordinationNote: b.coordination_note || '' },
    });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT coordinate:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/joining-point-aircraft/:stripId/:idx — מסלול נחיתה / הקפה למטוס בודד.
// המפתח הוא המטוס ולא הנקודה: מטוס בהקפה עוזב את טבלת ההצטרפות אבל נשאר על
// ההקפה, ולכן המצב חייב לשרוד את היציאה מהנקודה.
router.put('/api/joining-point-aircraft/:stripId/:idx', async (req, res) => {
  try {
    const b = req.body || {};
    const sid = stripId(req.params.stripId);
    const idx = int(req.params.idx);
    if (!sid || idx == null) return res.status(400).json({ error: 'מזהה פ"מ ומספר מטוס נדרשים' });

    // `alt` נשלח רק כשהוא באמת משתנה: `undefined` משאיר את הגובה החריג כמו
    // שהוא, ו-`null` מפורש מחזיר את המטוס לגובה הפ"מ.
    const altGiven = b.alt !== undefined;
    const { rows } = await pool.query(
      `INSERT INTO joining_point_aircraft
         (joining_point_id, strip_id, aircraft_idx, runway_ident, pattern_id, in_pattern, pattern_frac, alt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (strip_id, aircraft_idx) DO UPDATE SET
         joining_point_id = COALESCE(EXCLUDED.joining_point_id, joining_point_aircraft.joining_point_id),
         runway_ident = EXCLUDED.runway_ident,
         -- מסלול **אחר** מהקיים = הפקח בחר ידנית. עדכון שלא משנה את המסלול
         -- (גרירה על ההקפה, צלע) שולח אותו שוב - ואז הסימון האוטומטי נשמר.
         runway_auto  = CASE WHEN COALESCE(EXCLUDED.runway_ident, '') = COALESCE(joining_point_aircraft.runway_ident, '')
                             THEN joining_point_aircraft.runway_auto ELSE FALSE END,
         pattern_id   = EXCLUDED.pattern_id,
         in_pattern   = EXCLUDED.in_pattern,
         pattern_frac = EXCLUDED.pattern_frac,
         alt          = CASE WHEN $9 THEN EXCLUDED.alt ELSE joining_point_aircraft.alt END,
         updated_at   = NOW()
       RETURNING *`,
      [int(b.joining_point_id), sid, idx, String(b.runway_ident || '').slice(0, 10),
        int(b.pattern_id), b.in_pattern === true, b.pattern_frac ?? null,
        altGiven && b.alt ? String(b.alt).slice(0, 10) : null, altGiven],
    );

    // כל מטוסי הפ"מ בהקפה (או נחתו) -> הפ"מ כולו נעלם מנקודת ההצטרפות.
    if (b.in_pattern === true) {
      if (await formationLeftPoint(pool, sid)) {
        await pool.query('DELETE FROM joining_point_strips WHERE strip_id = $1', [sid]);
      }
      await logActivity(req, {
        event_type: 'joining_point_pattern', preset_id: int(b.preset_id), preset_name: b.preset_name,
        strip_id: sid, strip_callsign: b.callsign || '',
        details: { aircraftIdx: idx, runwayIdent: b.runway_ident || '', patternId: int(b.pattern_id) },
      });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/joining-point-aircraft:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/strip-aircraft/:stripId/:idx/flight-status — ירוקים / אישור לנחות / נחיתה.
// יושב על strip_aircraft ולא על נקודת ההצטרפות, כי זה **סטטוס המטוס**: הוא
// נשאר נכון גם אחרי שהמטוס עזב את הנקודה.
router.put('/api/strip-aircraft/:stripId/:idx/flight-status', async (req, res) => {
  try {
    const b = req.body || {};
    const sid = stripId(req.params.stripId);
    const idx = int(req.params.idx);

    // שני שדות **נפרדים**, וכל אחד נשלח לבדו: `flight_status` הוא איפה המטוס
    // (עה"ר/בסיס/פיינל/נחת), ו-`greens` הוא האם דיווח. `undefined` = לא נגעו בו,
    // כדי שסימון ירוקים לא ימחק את הצלע ולהפך - זה בדיוק מה שקרה כשחלקו עמודה.
    const statusGiven = b.flight_status !== undefined;
    const greensGiven = b.greens !== undefined;
    if (!statusGiven && !greensGiven) return res.status(400).json({ error: 'לא נשלח שדה לעדכון' });

    const status = statusGiven ? String(b.flight_status || 'none') : null;
    if (statusGiven && !FLIGHT_STATUSES.has(status)) return res.status(400).json({ error: 'סטטוס לא מוכר' });
    const greens = greensGiven ? b.greens === true : null;

    // הסטטוס הקודם - "נחת" נרשם ב-FLOW רק במעבר אליו, לא בכל שליחה חוזרת
    const prevStatus = statusGiven
      ? (await pool.query('SELECT flight_status FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [sid, idx])).rows[0]?.flight_status ?? 'none'
      : null;

    const { rows } = await pool.query(
      `INSERT INTO strip_aircraft (strip_id, idx, flight_status, greens)
       VALUES ($1, $2, COALESCE($3, 'none'), COALESCE($4, FALSE))
       ON CONFLICT (strip_id, idx) DO UPDATE SET
         flight_status = COALESCE($3, strip_aircraft.flight_status),
         greens        = COALESCE($4, strip_aircraft.greens)
       RETURNING *`,
      [sid, idx, status, greens],
    );
    // ── "נחת" יוצא ל-GAPI ────────────────────────────────────────────────
    // הסטטוס בעמדה הוא של ה**מטוס**, ואילו `strips.landed` - השדה ש-GAPI
    // משדר (ENTITIES.sortie) - הוא של ה**פ"מ**. לכן הוא נדלק רק כש**כל**
    // מטוסי המבנה נחתו, ונכבה מיד כשאחד מהם חוזר: "נחיתה = כן" על מבנה
    // שחלקו עדיין באוויר הוא מידע שגוי שיוצא החוצה למערכת אחרת.
    const land = await pool.query(
      `SELECT (SELECT COUNT(*) FROM strip_aircraft WHERE strip_id=$1) AS total,
              (SELECT COUNT(*) FROM strip_aircraft WHERE strip_id=$1 AND flight_status='landed') AS landed,
              (SELECT number_of_formation FROM strips WHERE id=$1) AS formation`,
      [sid],
    );
    const { total, landed, formation } = land.rows[0] || {};
    const expected = Math.max(Number(total) || 0, parseInt(formation, 10) || 0);
    const allLanded = expected > 0 && Number(landed) >= expected;
    const flip = await pool.query('UPDATE strips SET landed = $1 WHERE id = $2 AND landed IS DISTINCT FROM $1', [allLanded, sid]);
    // ⚠ בלי זה "נחת" נכתב ל-DB ו**לא יוצא** ל-GAPI: אין טריגר, והיציאה נשענת
    // על captureChange מה-route. no-op כש-GAPI כבוי.
    if (flip.rowCount) captureChange('sortie', 'upsert', sid);

    if (statusGiven && status === 'landed' && prevStatus !== 'landed') {
      await recordFlowEvent(pool, {
        strip_id: sid, kind: 'landed', callsign: b.callsign || null, preset_id: int(b.preset_id), preset_name: b.preset_name || null,
        details: { aircraft: [idx], formationLanded: allLanded },
      }, { user: req.user });
    }

    await logActivity(req, {
      event_type: 'aircraft_flight_status', preset_id: int(b.preset_id), preset_name: b.preset_name,
      strip_id: sid, strip_callsign: b.callsign || '',
      details: { aircraftIdx: idx, ...(statusGiven ? { flightStatus: status } : {}), ...(greensGiven ? { greens } : {}), formationLanded: allLanded },
    });
    res.json({ ...rows[0], formation_landed: allLanded });
  } catch (err) {
    console.error('PUT flight-status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
