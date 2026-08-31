/**
 * **הלאמת אזור זמני** - ה-API.
 *
 * מרחב שעמדה תופסת לזמן קצוב, מציירת ביד על המפה ומפיצה לשאר העמדות.
 * אפיון מלא: TEMP_ZONE_SEIZURE_SPEC.md.
 *
 * ── מה השרת לא עושה כאן, בכוונה ───────────────────────────────────────────
 * **גיאומטריה.** לכל עמדה מפה משלה, עוגנים משלה ואזורים משלה, וההכרעה "האם
 * המרחב חותך את האזור שלך" תלויה בשלושתם. השרת מגיש את החומר הגולמי
 * (`/candidates`) והלקוח מכריע ב-`src/utils/tempZoneSeizure.ts` - מימוש אחד,
 * בדוק ב-vitest, שמשרת גם את הרשימה החכמה, גם את הצביעה וגם את ההבהוב.
 * מימוש שני בשרת היה נשבר בשקט ברגע שאחד מהם משתנה.
 */

import { Router } from 'express';
import pool from '../db/pool.js';

const router = new Router();

/** רישום ליומן הביקורת. הזהות מהאסימון החתום (SK-18), לא מגוף הבקשה. */
async function logActivity(req, fields) {
  try {
    await pool.query(
      `INSERT INTO activity_log (event_type, severity, workstation_preset_id, workstation_name,
         crew_member_id, crew_member_name, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [fields.event_type, fields.severity || 'normal', fields.preset_id || null, fields.preset_name || '',
        req.user?.crewMemberId ?? null, req.user?.name ?? null, JSON.stringify(fields.details || {})],
    );
  } catch (err) {
    // יומן הביקורת לא מפיל פעולה תפעולית
    console.error('[temp-zone-seizures] activity_log נכשל:', err.message);
  }
}

const intOrNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));

/** מנרמל טווח גבהים: min<=max, וגבול חסר **נשאר חסר** ("מ-200" = 200 ומעלה). */
function normalizeRange(min, max) {
  const lo = intOrNull(min), hi = intOrNull(max);
  if (lo != null && hi != null) return [Math.min(lo, hi), Math.max(lo, hi)];
  return [lo, hi];
}

/** פוליגון נ"צ תקין: מערך של לפחות 3 נקודות עם lat/lon מספריים. */
function cleanGeoPolygon(raw) {
  if (!Array.isArray(raw)) return [];
  const pts = raw
    .map(p => ({ lat: Number(p?.lat), lon: Number(p?.lon) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  return pts.length >= 3 ? pts : [];
}

/** פוליגון באחוזי תמונה (0..100) - לתצוגה בחלון "פתח מפה" של העמדה היוצרת. */
function cleanPctPolygon(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(p => ({ x: Number(p?.x), y: Number(p?.y) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
}

// ── קריאה ────────────────────────────────────────────────────────────────────

/**
 * ההלאמות שנוגעות לעמדה הזו:
 *   • פעילות שהיא יצרה                      → כדי לצייר, לנהל ולראות אישורים
 *   • פעילות שהופצו אליה                    → התראה, ציור, צביעה, הבהוב
 *   • **שהסתיימו** שהופצו אליה ולא ראתה     → הודעת "יצאה מתוקף" (§9, מקרה 26)
 *
 * הודעת הסיום נמסרת מה-DB ולא מאירוע רגעי, ולכן עמדה שהייתה מנותקת ברגע
 * הסיום מקבלת אותה בכניסה הבאה - במקום לגלות מרחב שנעלם בלי הסבר.
 */
router.get('/api/temp-zone-seizures', async (req, res) => {
  try {
    const presetId = intOrNull(req.query.preset_id);
    if (presetId == null) return res.json([]);
    const { rows } = await pool.query(
      `SELECT s.*,
              t.id            AS my_target_id,
              t.acked         AS my_acked,
              t.ack_note      AS my_ack_note,
              t.acked_at      AS my_acked_at,
              t.seen_end      AS my_seen_end,
              (t.id IS NOT NULL) AS is_target,
              (s.creator_preset_id = $1) AS is_creator
         FROM temp_zone_seizures s
         LEFT JOIN temp_zone_seizure_targets t
                ON t.seizure_id = s.id AND t.preset_id = $1
        WHERE (s.status = 'active' AND (s.creator_preset_id = $1 OR t.id IS NOT NULL))
           OR (s.status = 'ended'  AND t.id IS NOT NULL AND t.seen_end = false)
        ORDER BY s.created_at DESC`,
      [presetId],
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching temp zone seizures:', err);
    res.status(500).json({ error: 'Failed to fetch temp zone seizures' });
  }
});

/** שורות היעד של הלאמה - טופס אישורי העמדות אצל היוצר (§8). */
router.get('/api/temp-zone-seizures/:id/targets', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, p.name AS preset_name
         FROM temp_zone_seizure_targets t
         JOIN workstation_presets p ON p.id = t.preset_id
        WHERE t.seizure_id = $1
        ORDER BY t.acked ASC, p.name ASC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching seizure targets:', err);
    res.status(500).json({ error: 'Failed to fetch seizure targets' });
  }
});

/**
 * החומר הגולמי לרשימת העמדות החכמה (§3.10): כל העמדות, המפות המעוגנות שלהן,
 * והאזורים שעליהן. הלקוח מצליב מול הפוליגון שצויר.
 *
 * **אף עמדה אינה מסוננת החוצה** מלבד היוצרת: הסתרה הייתה מונעת מהיוצר להפיץ
 * למי שהוא יודע שצריך לדעת. עמדה בלי מפה מעוגנת מסומנת ככזו (§7).
 */
router.get('/api/temp-zone-seizures/candidates', async (req, res) => {
  try {
    const creatorId = intOrNull(req.query.preset_id);
    const presets = await pool.query(
      `SELECT p.id, p.name, p.map_id,
              (m.anchor1_lat IS NOT NULL AND m.anchor2_lat IS NOT NULL
               AND m.anchor1_x_img IS NOT NULL AND m.anchor2_x_img IS NOT NULL) AS map_anchored
         FROM workstation_presets p
         LEFT JOIN maps m ON m.id = p.map_id
        WHERE ($1::int IS NULL OR p.id <> $1)
        ORDER BY p.name`,
      [creatorId],
    );
    const mapIds = [...new Set(presets.rows.map(r => r.map_id).filter(Boolean))];
    let maps = { rows: [] }, zones = { rows: [] }, ranges = { rows: [] };
    if (mapIds.length) {
      maps = await pool.query(
        `SELECT id, anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon,
                anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon
           FROM maps WHERE id = ANY($1)`, [mapIds]);
      zones = await pool.query(
        `SELECT id, map_id, name, polygon, polygon_geo FROM map_zones WHERE map_id = ANY($1)`, [mapIds]);
      const zoneIds = zones.rows.map(z => z.id);
      if (zoneIds.length) {
        ranges = await pool.query(
          `SELECT zone_id, alt_min, alt_max FROM zone_altitude_ranges WHERE zone_id = ANY($1) ORDER BY sort_order`,
          [zoneIds]);
      }
    }
    const bandsByZone = {};
    for (const r of ranges.rows) (bandsByZone[r.zone_id] ||= []).push({ lo: r.alt_min, hi: r.alt_max });
    const zonesByMap = {};
    for (const z of zones.rows) {
      (zonesByMap[z.map_id] ||= []).push({
        id: z.id, name: z.name, polygon: z.polygon, polygon_geo: z.polygon_geo,
        bands: bandsByZone[z.id] || [],
      });
    }
    const mapsById = {};
    for (const m of maps.rows) mapsById[m.id] = m;
    res.json({ presets: presets.rows, maps: mapsById, zones: zonesByMap });
  } catch (err) {
    console.error('Error fetching seizure candidates:', err);
    res.status(500).json({ error: 'Failed to fetch seizure candidates' });
  }
});

// ── יצירה ────────────────────────────────────────────────────────────────────

router.post('/api/temp-zone-seizures', async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'שם ההלאמה חובה' });
    const geo = cleanGeoPolygon(b.polygon_geo);
    // בלי נ"צ אין הלאמה: פוליגון באחוזי תמונה בלבד אינו ניתן להקרנה על מפה
    // אחרת, ועמדה מקבלת הייתה מציירת אותו במקום הלא נכון - כשל שקט.
    if (!geo.length) return res.status(400).json({ error: 'הפוליגון חייב 3 קודקודים בנ"צ (מפה מעוגנת)' });
    const creatorId = intOrNull(b.creator_preset_id);
    if (creatorId == null) return res.status(400).json({ error: 'עמדה יוצרת חסרה' });
    const [altMin, altMax] = normalizeRange(b.alt_min, b.alt_max);
    const toAll = b.to_all === true;
    const requested = Array.isArray(b.target_preset_ids) ? b.target_preset_ids.map(intOrNull).filter(v => v != null) : [];
    if (!toAll && requested.length === 0) {
      return res.status(400).json({ error: 'בחר לפחות עמדה אחת או הפצה כללית' });
    }

    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO temp_zone_seizures
         (name, purpose, color, alt_min, alt_max, polygon_geo, polygon,
          creator_preset_id, creator_preset_name, creator_map_id, phone, radio, note, eta_end, to_all)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [name, String(b.purpose || ''), String(b.color || '#f97316'), altMin, altMax,
        JSON.stringify(geo), JSON.stringify(cleanPctPolygon(b.polygon)),
        creatorId, String(b.creator_preset_name || ''), intOrNull(b.creator_map_id),
        String(b.phone || ''), String(b.radio || ''), String(b.note || ''),
        b.eta_end ? new Date(b.eta_end) : null, toAll],
    );
    const seizure = ins.rows[0];

    // העמדה היוצרת לעולם אינה יעד של עצמה - מסונן כאן ולא רק בלקוח (מקרה 11).
    const targetIds = toAll
      ? (await client.query('SELECT id FROM workstation_presets WHERE id <> $1', [creatorId])).rows.map(r => r.id)
      : [...new Set(requested)].filter(id => id !== creatorId);
    if (targetIds.length) {
      await client.query(
        `INSERT INTO temp_zone_seizure_targets (seizure_id, preset_id)
         SELECT $1, UNNEST($2::int[]) ON CONFLICT (seizure_id, preset_id) DO NOTHING`,
        [seizure.id, targetIds],
      );
    }
    await client.query('COMMIT');

    logActivity(req, {
      event_type: 'temp_zone_seizure_created', severity: 'warning',
      preset_id: creatorId, preset_name: b.creator_preset_name || '',
      details: { seizure_id: seizure.id, name, alt_min: altMin, alt_max: altMax, to_all: toAll, targets: targetIds.length },
    });
    res.json({ ...seizure, target_count: targetIds.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating temp zone seizure:', err);
    res.status(500).json({ error: 'Failed to create temp zone seizure' });
  } finally {
    client.release();
  }
});

// ── אישור עמדה ───────────────────────────────────────────────────────────────

router.patch('/api/temp-zone-seizures/:id/ack', async (req, res) => {
  try {
    const presetId = intOrNull(req.body?.preset_id);
    if (presetId == null) return res.status(400).json({ error: 'preset_id חסר' });
    const { rows } = await pool.query(
      `UPDATE temp_zone_seizure_targets
          SET acked = true, ack_note = $3, acked_at = NOW()
        WHERE seizure_id = $1 AND preset_id = $2 RETURNING *`,
      [req.params.id, presetId, String(req.body?.note || '')],
    );
    if (!rows.length) return res.status(404).json({ error: 'העמדה אינה יעד של ההלאמה' });
    logActivity(req, {
      event_type: 'temp_zone_seizure_acked', preset_id: presetId, preset_name: req.body?.preset_name || '',
      details: { seizure_id: Number(req.params.id), note: req.body?.note || '' },
    });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error acking seizure:', err);
    res.status(500).json({ error: 'Failed to ack seizure' });
  }
});

/**
 * דיווח העמדה על עצמה: כמה פ"מים אצלה עדיין באזורים המוגבלים ואילו אזורים.
 * זה מה שמאפשר ליוצר לראות תמונה אמיתית בלי שהשרת ינחש גיאומטריה של מפה זרה.
 */
router.patch('/api/temp-zone-seizures/:id/report', async (req, res) => {
  try {
    const presetId = intOrNull(req.body?.preset_id);
    if (presetId == null) return res.status(400).json({ error: 'preset_id חסר' });
    const names = Array.isArray(req.body?.affected_zone_names)
      ? req.body.affected_zone_names.map(String).slice(0, 50) : [];
    const { rows } = await pool.query(
      `UPDATE temp_zone_seizure_targets
          SET pins_in_zone = $3, affected_zone_names = $4
        WHERE seizure_id = $1 AND preset_id = $2 RETURNING id`,
      [req.params.id, presetId, Math.max(0, intOrNull(req.body?.pins_in_zone) ?? 0), JSON.stringify(names)],
    );
    res.json({ ok: rows.length > 0 });
  } catch (err) {
    console.error('Error reporting seizure state:', err);
    res.status(500).json({ error: 'Failed to report seizure state' });
  }
});

/** העמדה ראתה את הודעת "יצאה מתוקף" - כדי שלא תוצג לה שוב (מקרה 26). */
router.patch('/api/temp-zone-seizures/:id/seen-end', async (req, res) => {
  try {
    const presetId = intOrNull(req.body?.preset_id);
    if (presetId == null) return res.status(400).json({ error: 'preset_id חסר' });
    await pool.query(
      `UPDATE temp_zone_seizure_targets SET seen_end = true WHERE seizure_id = $1 AND preset_id = $2`,
      [req.params.id, presetId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Error marking seizure end seen:', err);
    res.status(500).json({ error: 'Failed to mark seizure end seen' });
  }
});

// ── הארכה וסיום ──────────────────────────────────────────────────────────────

/**
 * הארכת זמן הסיום המשוער. זו התשובה של היוצר להתראת "חלף הזמן" (§9): ההלאמה
 * **אינה פוקעת מעצמה** - מרחב שנעלם בזמן שהאירוע נמשך הוא כשל בטיחותי.
 */
router.patch('/api/temp-zone-seizures/:id/extend', async (req, res) => {
  try {
    const eta = req.body?.eta_end ? new Date(req.body.eta_end) : null;
    if (!eta || Number.isNaN(eta.getTime())) return res.status(400).json({ error: 'זמן סיום לא תקין' });
    const { rows } = await pool.query(
      `UPDATE temp_zone_seizures SET eta_end = $2 WHERE id = $1 AND status = 'active' RETURNING *`,
      [req.params.id, eta],
    );
    if (!rows.length) return res.status(404).json({ error: 'הלאמה לא נמצאה או אינה פעילה' });
    logActivity(req, {
      event_type: 'temp_zone_seizure_extended', preset_id: rows[0].creator_preset_id,
      preset_name: rows[0].creator_preset_name, details: { seizure_id: rows[0].id, eta_end: eta.toISOString() },
    });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error extending seizure:', err);
    res.status(500).json({ error: 'Failed to extend seizure' });
  }
});

/**
 * סיום ההלאמה. השורה **אינה נמחקת**: היא נשארת כדי שהודעת "יצאה מתוקף" תגיע
 * גם לעמדה שהייתה מנותקת ברגע הסיום, ולטובת יומן הביקורת. הניקוי בפועל הוא
 * `cleanupEndedSeizures` - אחרי 24 שעות, כשכבר אין למי למסור.
 */
router.patch('/api/temp-zone-seizures/:id/end', async (req, res) => {
  try {
    const presetId = intOrNull(req.body?.preset_id);
    const { rows } = await pool.query(
      `UPDATE temp_zone_seizures
          SET status = 'ended', ended_at = NOW(), ended_by_preset_id = $2
        WHERE id = $1 AND status = 'active' RETURNING *`,
      [req.params.id, presetId],
    );
    if (!rows.length) return res.status(404).json({ error: 'הלאמה לא נמצאה או כבר הסתיימה' });
    await pool.query(`UPDATE temp_zone_seizure_targets SET seen_end = false WHERE seizure_id = $1`, [req.params.id]);
    logActivity(req, {
      event_type: 'temp_zone_seizure_ended', severity: 'warning',
      preset_id: rows[0].creator_preset_id, preset_name: rows[0].creator_preset_name,
      details: { seizure_id: rows[0].id, name: rows[0].name },
    });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error ending seizure:', err);
    res.status(500).json({ error: 'Failed to end seizure' });
  }
});

/** DELETE = סיום. אותה סמנטיקה, כי "מחיקה" היא מה שהמפעיל מבקש בעמדה. */
router.delete('/api/temp-zone-seizures/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE temp_zone_seizures SET status = 'ended', ended_at = NOW() WHERE id = $1 AND status = 'active' RETURNING *`,
      [req.params.id],
    );
    if (rows.length) {
      await pool.query(`UPDATE temp_zone_seizure_targets SET seen_end = false WHERE seizure_id = $1`, [req.params.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting seizure:', err);
    res.status(500).json({ error: 'Failed to delete seizure' });
  }
});

/**
 * ניקוי מחזורי: הלאמות שהסתיימו לפני יותר מ-24 שעות. עד אז הן נשארות כדי
 * למסור את הודעת הסיום לעמדה שלא הייתה מחוברת.
 */
export async function cleanupEndedSeizures() {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM temp_zone_seizures WHERE status = 'ended' AND ended_at < NOW() - INTERVAL '24 hours'`);
    if (rowCount) console.log(`[temp-zone-seizures] נוקו ${rowCount} הלאמות שהסתיימו`);
  } catch (err) {
    console.error('[temp-zone-seizures] ניקוי נכשל:', err.message);
  }
}

export default router;
