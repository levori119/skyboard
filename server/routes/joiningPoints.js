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

const router = new Router();

const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
/** מזהה פ"מ מגיע מהלקוח גם כ-`s123` (ראה routes/strips.js). */
const stripId = (v) => int(String(v ?? '').replace(/^s/, ''));

/** סטטוסי הנחיתה של המטוס. "זה עובר לסטטוס מטוס" - ולכן נשמר על strip_aircraft. */
const FLIGHT_STATUSES = new Set(['none', 'greens', 'cleared_to_land', 'landed']);

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
      return {
        ...r,
        steps: steps.get(r.id) || [],
        x_pct: o && o.x_pct != null ? o.x_pct : r.x_pct,
        y_pct: o && o.y_pct != null ? o.y_pct : r.y_pct,
        display_mode: o?.display_mode || 'pin',
        is_override: !!o,
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
         (airfield_id, name, alt_min_ft, alt_max_ft, default_step_ft, sector_id, sub_label, x_pct, y_pct, color, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [int(b.airfield_id), String(b.name || '').slice(0, 100), int(b.alt_min_ft) ?? 0, int(b.alt_max_ft) ?? 0,
        int(b.default_step_ft) ?? 1000, int(b.sector_id), b.sub_label || null,
        b.x_pct ?? null, b.y_pct ?? null, String(b.color || '#38bdf8').slice(0, 20), int(b.sort_order) ?? 0],
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
         sub_label=$6, x_pct=$7, y_pct=$8, color=$9, sort_order=$10
       WHERE id=$11 RETURNING *`,
      [String(b.name || '').slice(0, 100), int(b.alt_min_ft) ?? 0, int(b.alt_max_ft) ?? 0,
        int(b.default_step_ft) ?? 1000, int(b.sector_id), b.sub_label || null,
        b.x_pct ?? null, b.y_pct ?? null, String(b.color || '#38bdf8').slice(0, 20),
        int(b.sort_order) ?? 0, int(req.params.id)],
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
              s.callsign, s.sq, s.alt, s.squadron, s.number_of_formation, s.notes, s.task,
              s.aircraft_indices
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
    const ac = await pool.query(
      `SELECT jpa.* FROM joining_point_aircraft jpa
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

    if (b.alt !== undefined && b.alt !== null && String(b.alt) !== '') {
      await pool.query('UPDATE strips SET alt = $1 WHERE id = $2', [String(b.alt).slice(0, 10), sid]);
    }
    // שיבוץ לנקודה אחרת מסיר מהקודמת: פ"מ מצטרף דרך נקודה אחת בלבד.
    await pool.query(
      'DELETE FROM joining_point_strips WHERE strip_id = $1 AND joining_point_id <> $2',
      [sid, pointId],
    );
    const { rows } = await pool.query(
      `INSERT INTO joining_point_strips (joining_point_id, strip_id)
       VALUES ($1,$2)
       ON CONFLICT (joining_point_id, strip_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [pointId, sid],
    );
    await logActivity(req, {
      event_type: 'joining_point_assign', preset_id: int(b.preset_id), preset_name: b.preset_name,
      strip_id: sid, strip_callsign: b.callsign || '',
      details: { joiningPointId: pointId, joiningPointName: b.point_name || '', altitude: b.alt ?? null },
    });
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /api/joining-point-strips:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/joining-point-strips/:pointId/:stripId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM joining_point_strips WHERE joining_point_id=$1 AND strip_id=$2',
      [int(req.params.pointId), stripId(req.params.stripId)],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/joining-point-strips:', err.message);
    res.status(500).json({ error: err.message });
  }
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

    const { rows } = await pool.query(
      `INSERT INTO joining_point_aircraft
         (joining_point_id, strip_id, aircraft_idx, runway_ident, pattern_id, in_pattern, pattern_frac)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (strip_id, aircraft_idx) DO UPDATE SET
         joining_point_id = COALESCE(EXCLUDED.joining_point_id, joining_point_aircraft.joining_point_id),
         runway_ident = EXCLUDED.runway_ident,
         pattern_id   = EXCLUDED.pattern_id,
         in_pattern   = EXCLUDED.in_pattern,
         pattern_frac = EXCLUDED.pattern_frac,
         updated_at   = NOW()
       RETURNING *`,
      [int(b.joining_point_id), sid, idx, String(b.runway_ident || '').slice(0, 10),
        int(b.pattern_id), b.in_pattern === true, b.pattern_frac ?? null],
    );

    // כל מטוסי הפ"מ בהקפה -> הפ"מ כולו נעלם מנקודת ההצטרפות.
    if (b.in_pattern === true) {
      const cnt = await pool.query(
        `SELECT (SELECT COUNT(*) FROM strip_aircraft WHERE strip_id=$1) AS total,
                (SELECT COUNT(*) FROM joining_point_aircraft
                  WHERE strip_id=$1 AND in_pattern=TRUE) AS in_pattern`,
        [sid],
      );
      const { total, in_pattern } = cnt.rows[0];
      if (Number(total) > 0 && Number(in_pattern) >= Number(total)) {
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
    const status = String(b.flight_status || 'none');
    if (!FLIGHT_STATUSES.has(status)) return res.status(400).json({ error: 'סטטוס לא מוכר' });
    const sid = stripId(req.params.stripId);
    const idx = int(req.params.idx);
    const { rows } = await pool.query(
      `INSERT INTO strip_aircraft (strip_id, idx, flight_status) VALUES ($1,$2,$3)
       ON CONFLICT (strip_id, idx) DO UPDATE SET flight_status = EXCLUDED.flight_status
       RETURNING *`,
      [sid, idx, status],
    );
    await logActivity(req, {
      event_type: 'aircraft_flight_status', preset_id: int(b.preset_id), preset_name: b.preset_name,
      strip_id: sid, strip_callsign: b.callsign || '',
      details: { aircraftIdx: idx, flightStatus: status },
    });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT flight-status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
