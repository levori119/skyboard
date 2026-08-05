import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

// Maps API
router.get('/api/maps', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, created_at, anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon, anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon, parent_map_id, parent_rect, parent_base_id FROM maps ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching maps:', err);
    res.status(500).json({ error: 'Failed to fetch maps' });
  }
});

router.get('/api/maps/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM maps WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Map not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching map:', err);
    res.status(500).json({ error: 'Failed to fetch map' });
  }
});

router.post('/api/maps', async (req, res) => {
  try {
    const { name, image_data, parent_map_id, parent_rect, parent_base_id } = req.body;
    const dup = await pool.query('SELECT id FROM maps WHERE LOWER(name) = LOWER($1)', [name]);
    if (dup.rows.length) return res.status(409).json({ error: 'שם מפה כבר קיים' });
    const result = await pool.query(
      'INSERT INTO maps (name, image_data, parent_map_id, parent_rect, parent_base_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, created_at, parent_map_id, parent_rect, parent_base_id',
      [name, image_data, parent_map_id || null, parent_rect ? JSON.stringify(parent_rect) : null, parent_base_id || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating map:', err);
    res.status(500).json({ error: 'Failed to create map' });
  }
});

router.delete('/api/maps/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM maps WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting map:', err);
    res.status(500).json({ error: 'Failed to delete map' });
  }
});

// עדכון מפה קיימת — שינוי שם, ו/או תיחום מחדש של מפת סקטור (parent_rect + תמונה חתוכה).
// עדכון **חלקי**: רק שדות שנשלחו נכתבים, כדי ששינוי שם לא יאבד את התמונה.
router.patch('/api/maps/:id', async (req, res) => {
  try {
    const { name, image_data, parent_rect, parent_base_id } = req.body;
    const sets = [];
    const params = [];
    let i = 1;
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ error: 'שם מפה ריק' });
      const dup = await pool.query('SELECT id FROM maps WHERE LOWER(name) = LOWER($1) AND id <> $2', [trimmed, req.params.id]);
      if (dup.rows.length) return res.status(409).json({ error: 'שם מפה כבר קיים' });
      sets.push(`name = $${i++}`); params.push(trimmed);
    }
    if (image_data !== undefined) { sets.push(`image_data = $${i++}`); params.push(image_data); }
    if (parent_rect !== undefined) { sets.push(`parent_rect = $${i++}`); params.push(parent_rect ? JSON.stringify(parent_rect) : null); }
    // בסיס אב: '' / null מנקים את השיוך, והמפה חוזרת לקבוצת "ללא בסיס אב"
    if (parent_base_id !== undefined) { sets.push(`parent_base_id = $${i++}`); params.push(parent_base_id ? Number(parent_base_id) : null); }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE maps SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, name, created_at, parent_map_id, parent_rect, parent_base_id`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Map not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating map:', err);
    res.status(500).json({ error: 'Failed to update map' });
  }
});

router.patch('/api/maps/:id/anchors', async (req, res) => {
  try {
    const { anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon, anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon } = req.body;
    const result = await pool.query(
      `UPDATE maps SET anchor1_x_img=$1, anchor1_y_img=$2, anchor1_lat=$3, anchor1_lon=$4, anchor2_x_img=$5, anchor2_y_img=$6, anchor2_lat=$7, anchor2_lon=$8 WHERE id=$9
       RETURNING id, name, anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon, anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon`,
      [anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon, anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Map not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating map anchors:', err);
    res.status(500).json({ error: 'Failed to update map anchors' });
  }
});

router.post('/api/maps/:id/sync-zones-from-parent', async (req, res) => {
  try {
    const childMapRes = await pool.query('SELECT parent_map_id, parent_rect FROM maps WHERE id = $1', [req.params.id]);
    if (childMapRes.rows.length === 0) return res.status(404).json({ error: 'Map not found' });
    const { parent_map_id, parent_rect } = childMapRes.rows[0];
    if (!parent_map_id) return res.status(400).json({ error: 'No parent map' });
    const rect = typeof parent_rect === 'string' ? JSON.parse(parent_rect) : (parent_rect || {});
    const { x1: rx1, y1: ry1, x2: rx2, y2: ry2 } = rect;
    if (rx1 == null) return res.status(400).json({ error: 'No parent_rect stored' });
    const sw = rx2 - rx1, sh = ry2 - ry1;
    const parentZones = await pool.query('SELECT * FROM map_zones WHERE map_id = $1', [parent_map_id]);
    const childZones = await pool.query('SELECT * FROM map_zones WHERE map_id = $1', [req.params.id]);
    let synced = 0;
    for (const pz of parentZones.rows) {
      const parentPoly = typeof pz.polygon === 'string' ? JSON.parse(pz.polygon) : (pz.polygon || []);
      const cz = childZones.rows.find(c => c.parent_zone_id === pz.id);
      const newPoly = parentPoly.map(p => ({
        x: Math.min(100, Math.max(0, ((p.x - rx1) / sw) * 100)),
        y: Math.min(100, Math.max(0, ((p.y - ry1) / sh) * 100))
      }));
      const anyInside = parentPoly.some(p => p.x >= rx1 && p.x <= rx2 && p.y >= ry1 && p.y <= ry2);
      // אזור-אב שנכנס לתיחום אחרי תיחום-מחדש עדיין אין לו עותק בת — נוצר כאן.
      // בלי זה הרחבת תחום סקטור הייתה משאירה את האזורים החדשים מחוץ למפת הסקטור.
      if (!cz) {
        if (!anyInside) continue;
        await pool.query(
          'INSERT INTO map_zones (map_id, name, color, polygon, parent_zone_id) VALUES ($1, $2, $3, $4, $5)',
          [req.params.id, pz.name, pz.color, JSON.stringify(newPoly), pz.id]
        );
        synced++;
        continue;
      }
      await pool.query('UPDATE map_zones SET name = $1, color = $2, polygon = $3 WHERE id = $4',
        [pz.name, pz.color, JSON.stringify(anyInside ? newPoly : []), cz.id]);
      synced++;
    }
    res.json({ synced });
  } catch (err) {
    console.error('Error syncing zones from parent:', err);
    res.status(500).json({ error: 'Failed to sync' });
  }
});

// Map Zones API
router.get('/api/map-zones', async (req, res) => {
  try {
    const { map_id } = req.query;
    if (!map_id) return res.status(400).json({ error: 'map_id required' });
    // המצב התפעולי (בלוקי גובה פעילים + מגבלה) יושב בטבלה **תפעולית** נפרדת,
    // כדי שסביבת תרגול לא תשנה את האזור האמיתי. הוא מוחזר משורג לתוך האזור,
    // ולכן חוזה ה-API כלפי הלקוח לא השתנה.
    //
    // העמודות נמנות במפורש ולא `z.*`: ב-map_zones נשארו העמודות הישנות באותו
    // שם (deprecated), ו-`z.*` יחד עם ה-COALESCE היה מחזיר שם עמודה כפול —
    // מי מהם מנצח תלוי במימוש הדרייבר. במסלול בטיחותי לא נשענים על זה.
    const result = await pool.query(
      `SELECT z.id, z.map_id, z.name, z.color, z.polygon, z.polygon_geo,
              z.parent_zone_id, z.enabled, z.created_at,
              COALESCE(s.active_alt_range_ids, '[]'::jsonb) AS active_alt_range_ids,
              COALESCE(s.limitation_note, '')               AS limitation_note
         FROM map_zones z
         LEFT JOIN map_zone_operational_state s ON s.zone_id = z.id
        WHERE z.map_id = $1
        ORDER BY z.id`,
      [map_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching map zones:', err);
    res.status(500).json({ error: 'Failed to fetch map zones' });
  }
});

router.post('/api/map-zones', async (req, res) => {
  try {
    const { map_id, name, color, polygon, polygon_geo, parent_zone_id } = req.body;
    const result = await pool.query(
      'INSERT INTO map_zones (map_id, name, color, polygon, polygon_geo, parent_zone_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [map_id, name, color || '#3b82f6', JSON.stringify(polygon || []), JSON.stringify(polygon_geo || []), parent_zone_id || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating map zone:', err);
    res.status(500).json({ error: 'Failed to create map zone' });
  }
});

router.put('/api/map-zones/:id', async (req, res) => {
  try {
    const { name, color, polygon, polygon_geo } = req.body;
    const result = await pool.query(
      'UPDATE map_zones SET name = $1, color = $2, polygon = $3, polygon_geo = $4 WHERE id = $5 RETURNING *',
      [name, color, JSON.stringify(polygon || []), JSON.stringify(polygon_geo || []), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    // Auto-sync to child zones
    try {
      const parentZone = result.rows[0];
      const parentPoly = typeof parentZone.polygon === 'string' ? JSON.parse(parentZone.polygon) : (parentZone.polygon || []);
      const childMaps = await pool.query('SELECT id, parent_rect FROM maps WHERE parent_map_id = $1', [parentZone.map_id]);
      for (const cm of childMaps.rows) {
        const rect = typeof cm.parent_rect === 'string' ? JSON.parse(cm.parent_rect) : (cm.parent_rect || {});
        const { x1: rx1, y1: ry1, x2: rx2, y2: ry2 } = rect;
        if (rx1 == null || ry1 == null || rx2 == null || ry2 == null) continue;
        const sw = rx2 - rx1, sh = ry2 - ry1;
        if (sw <= 0 || sh <= 0) continue;
        const childZones = await pool.query('SELECT id FROM map_zones WHERE map_id = $1 AND parent_zone_id = $2', [cm.id, parentZone.id]);
        if (childZones.rows.length === 0) continue;
        const newPoly = parentPoly.map(p => ({
          x: Math.min(100, Math.max(0, ((p.x - rx1) / sw) * 100)),
          y: Math.min(100, Math.max(0, ((p.y - ry1) / sh) * 100))
        }));
        const anyInside = parentPoly.some(p => p.x >= rx1 && p.x <= rx2 && p.y >= ry1 && p.y <= ry2);
        for (const cz of childZones.rows) {
          await pool.query(
            'UPDATE map_zones SET name = $1, color = $2, polygon = $3 WHERE id = $4',
            [name, color, JSON.stringify(anyInside ? newPoly : []), cz.id]
          );
        }
      }
    } catch (syncErr) { console.error('Zone child sync error:', syncErr); }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating map zone:', err);
    res.status(500).json({ error: 'Failed to update map zone' });
  }
});

router.patch('/api/map-zones/:id/enabled', async (req, res) => {
  try {
    const { enabled } = req.body;
    const result = await pool.query('UPDATE map_zones SET enabled = $1 WHERE id = $2 RETURNING *', [enabled !== false, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error toggling zone enabled:', err);
    res.status(500).json({ error: 'Failed to update zone' });
  }
});

// Operational zone state set live in the CTRL station (active altitude blocks + limitation
// note). Kept separate from PUT /:id so it never triggers the child-zone geometry sync.
//
// ⚠️ נכתב ל-`map_zone_operational_state` (טבלה **תפעולית**) ולא ל-`map_zones`.
// עד לתיקון זה הכתיבה הייתה ל-map_zones, שהיא קונפיגורציה ויושבת ב-public בלבד:
// עמדה בסביבת תרגול שהגבילה גובה שינתה את האזור **האמיתי**.
router.patch('/api/map-zones/:id/operational', async (req, res) => {
  try {
    const { active_alt_range_ids, limitation_note } = req.body;
    if (active_alt_range_ids === undefined && limitation_note === undefined) {
      return res.status(400).json({ error: 'nothing to update' });
    }
    // UPSERT: עדכון חלקי חייב לשמר את השדה השני, ולכן COALESCE על NULL מפורש.
    const alts = active_alt_range_ids === undefined
      ? null
      : JSON.stringify(Array.isArray(active_alt_range_ids) ? active_alt_range_ids : []);
    const note = limitation_note === undefined ? null : (limitation_note || '');

    // אזור שאינו קיים ייפול על ה-FK; מתורגם ל-404 במקום 500
    const exists = await pool.query('SELECT 1 FROM map_zones WHERE id = $1', [req.params.id]);
    if (exists.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });

    const result = await pool.query(
      `INSERT INTO map_zone_operational_state (zone_id, active_alt_range_ids, limitation_note, updated_at)
       VALUES ($1, COALESCE($2::jsonb, '[]'::jsonb), COALESCE($3, ''), NOW())
       ON CONFLICT (zone_id) DO UPDATE SET
         active_alt_range_ids = COALESCE($2::jsonb, map_zone_operational_state.active_alt_range_ids),
         limitation_note      = COALESCE($3, map_zone_operational_state.limitation_note),
         updated_at           = NOW()
       RETURNING zone_id AS id, active_alt_range_ids, limitation_note, updated_at`,
      [req.params.id, alts, note]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating zone operational state:', err);
    res.status(500).json({ error: 'Failed to update zone' });
  }
});

router.delete('/api/map-zones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM map_zones WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting map zone:', err);
    res.status(500).json({ error: 'Failed to delete map zone' });
  }
});

// Zone Altitude Ranges API
router.get('/api/zone-altitude-ranges', async (req, res) => {
  try {
    const { zone_id } = req.query;
    if (!zone_id) return res.status(400).json({ error: 'zone_id required' });
    const result = await pool.query('SELECT * FROM zone_altitude_ranges WHERE zone_id = $1 ORDER BY sort_order, id', [zone_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
router.post('/api/zone-altitude-ranges', async (req, res) => {
  try {
    const { zone_id, name, alt_min, alt_max, sort_order } = req.body;
    const r = await pool.query('INSERT INTO zone_altitude_ranges (zone_id, name, alt_min, alt_max, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *', [zone_id, name || '', alt_min ?? null, alt_max ?? null, sort_order ?? 0]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
router.put('/api/zone-altitude-ranges/:id', async (req, res) => {
  try {
    const { name, alt_min, alt_max, sort_order } = req.body;
    const r = await pool.query('UPDATE zone_altitude_ranges SET name=$1, alt_min=$2, alt_max=$3, sort_order=$4 WHERE id=$5 RETURNING *', [name || '', alt_min ?? null, alt_max ?? null, sort_order ?? 0, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
router.delete('/api/zone-altitude-ranges/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM zone_altitude_ranges WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// Strip Zone Assignments API
router.get('/api/strip-zone-assignments', async (req, res) => {
  try {
    const { map_id } = req.query;
    if (!map_id) return res.status(400).json({ error: 'map_id required' });
    const r = await pool.query(`
      SELECT sza.*, mz.name AS zone_name, mz.color AS zone_color,
             zar.name AS alt_range_name, zar.alt_min, zar.alt_max,
             COALESCE(
               (SELECT json_agg(json_build_object('id', sze.id, 'zone_id', sze.zone_id, 'zone_name', emz.name, 'zone_color', emz.color))
                FROM strip_zone_extra_zones sze
                LEFT JOIN map_zones emz ON emz.id = sze.zone_id
                WHERE sze.strip_id = sza.strip_id),
               '[]'::json
             ) AS extra_zones
      FROM strip_zone_assignments sza
      LEFT JOIN map_zones mz ON mz.id = sza.zone_id
      LEFT JOIN zone_altitude_ranges zar ON zar.id = sza.altitude_range_id
      WHERE (mz.map_id = $1 OR (sza.zone_id IS NULL AND sza.map_id = $1::integer))
      ORDER BY sza.id`, [map_id]);
    r.rows = r.rows.map(row => ({ ...row, requested_zone_ids: row.requested_zone_ids || [], extra_zones: row.extra_zones || [] }));
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/api/strip-zone-assignments', async (req, res) => {
  try {
    const { strip_id, zone_id, altitude_range_id, status, note, coordination_note, is_coordinated, pos_x, pos_y, requested_zone_ids, map_id, preset_id } = req.body;
    // `preset_id` — העמדה שחיברה את הפ"מ לאזור, מרכיב של "נמצא בעמדה".
    // COALESCE ולא דריסה: עדכון שמגיע ממסלול שלא מוסר עמדה (למשל עריכת הערה)
    // לא ימחק את מי שהחזיק את הפ"מ.
    const r = await pool.query(`
      INSERT INTO strip_zone_assignments (strip_id, zone_id, altitude_range_id, status, note, coordination_note, is_coordinated, pos_x, pos_y, requested_zone_ids, map_id, preset_id, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
      ON CONFLICT (strip_id) DO UPDATE SET zone_id=$2, altitude_range_id=$3, status=$4, note=$5, coordination_note=$6, is_coordinated=$7, pos_x=$8, pos_y=$9, requested_zone_ids=$10, map_id=$11, preset_id=COALESCE($12, strip_zone_assignments.preset_id), updated_at=NOW()
      RETURNING *`, [strip_id, zone_id || null, altitude_range_id || null, status || 'planned', note || '', coordination_note || '', is_coordinated === true, pos_x ?? null, pos_y ?? null, JSON.stringify(requested_zone_ids || []), map_id || null, preset_id ? parseInt(preset_id) : null]);
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});
router.delete('/api/strip-zone-assignments/:strip_id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_zone_assignments WHERE strip_id=$1', [req.params.strip_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// פוליגון-איחוד מותאם ידנית (עריכת צורת האזורים המחוברים בגרירת נקודות). polygon=null → חזרה לאיחוד אוטומטי
router.patch('/api/strip-zone-assignments/:strip_id/group-polygon', async (req, res) => {
  try {
    const { polygon } = req.body;
    const valid = Array.isArray(polygon) && polygon.length >= 3;
    const r = await pool.query(
      'UPDATE strip_zone_assignments SET group_polygon = $1, updated_at = NOW() WHERE strip_id = $2 RETURNING strip_id, group_polygon',
      [valid ? JSON.stringify(polygon) : null, req.params.strip_id]
    );
    res.json(r.rows[0] || { strip_id: Number(req.params.strip_id), group_polygon: valid ? polygon : null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Strip Zone Extra Zones API
router.get('/api/strip-zone-extra-zones', async (req, res) => {
  try {
    const { strip_id, map_id } = req.query;
    let q = `SELECT sze.*, mz.name AS zone_name, mz.color AS zone_color FROM strip_zone_extra_zones sze LEFT JOIN map_zones mz ON mz.id = sze.zone_id WHERE 1=1`;
    const params = [];
    if (strip_id) { params.push(strip_id); q += ` AND sze.strip_id = $${params.length}`; }
    if (map_id) { params.push(map_id); q += ` AND sze.map_id = $${params.length}`; }
    q += ' ORDER BY sze.id';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/api/strip-zone-extra-zones', async (req, res) => {
  try {
    const { strip_id, zone_id, map_id } = req.body;
    if (!strip_id || !zone_id) return res.status(400).json({ error: 'strip_id and zone_id required' });
    const r = await pool.query(
      `INSERT INTO strip_zone_extra_zones (strip_id, zone_id, map_id) VALUES ($1,$2,$3)
       ON CONFLICT (strip_id, zone_id) DO UPDATE SET map_id=$3 RETURNING *`,
      [strip_id, zone_id, map_id || null]
    );
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

router.delete('/api/strip-zone-extra-zones/by-strip/:strip_id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_zone_extra_zones WHERE strip_id=$1', [req.params.strip_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.delete('/api/strip-zone-extra-zones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_zone_extra_zones WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// Closures API
router.get('/api/closures', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM closures ORDER BY id');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch closures' }); }
});

router.post('/api/closures', async (req, res) => {
  try {
    const { name, category, color, alt_min, alt_max, dates, time_start, time_end, closure_status, active, polygon_geo } = req.body;
    const result = await pool.query(
      `INSERT INTO closures (name, category, color, alt_min, alt_max, dates, time_start, time_end, closure_status, active, polygon_geo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name || '', category || '', color || '#ef4444', alt_min ?? null, alt_max ?? null,
       JSON.stringify(dates || []), time_start || '', time_end || '',
       closure_status || 'coordinated', active !== false, JSON.stringify(polygon_geo || [])]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create closure' }); }
});

router.put('/api/closures/:id', async (req, res) => {
  try {
    const { name, category, color, alt_min, alt_max, dates, time_start, time_end, closure_status, active, polygon_geo } = req.body;
    const result = await pool.query(
      `UPDATE closures SET name=$1, category=$2, color=$3, alt_min=$4, alt_max=$5, dates=$6, time_start=$7, time_end=$8, closure_status=$9, active=$10, polygon_geo=$11 WHERE id=$12 RETURNING *`,
      [name || '', category || '', color || '#ef4444', alt_min ?? null, alt_max ?? null,
       JSON.stringify(dates || []), time_start || '', time_end || '',
       closure_status || 'coordinated', active !== false, JSON.stringify(polygon_geo || []), req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update closure' }); }
});

router.delete('/api/closures/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM closures WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete closure' }); }
});

// ─── נקודות העברה קבועות על המפה ───────────────────────────────────────────
// ברירת מחדל נשמרת על המפה (preset_id = NULL) ועמדה יכולה לדרוס נקודה בודדת
// (preset_id = מזהה העמדה). GET מחזיר את התמונה **האפקטיבית**: ברירת המחדל של
// המפה, כשכל דריסה של העמדה המבוקשת מחליפה את הנקודה המקבילה.
const numOrNull = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

router.get('/api/map-transfer-points', async (req, res) => {
  try {
    const mapId = numOrNull(req.query.map_id);
    if (!mapId) return res.status(400).json({ error: 'map_id required' });
    const presetId = numOrNull(req.query.preset_id);
    const { rows } = await pool.query(
      `SELECT p.*, s.name AS sector_name, s.label_he AS sector_label
         FROM map_transfer_points p
         JOIN sectors s ON s.id = p.sector_id
        WHERE p.map_id = $1 AND (p.preset_id IS NULL OR p.preset_id = $2)
        ORDER BY p.sector_id, p.sub_label NULLS FIRST`,
      [mapId, presetId]
    );
    // מיזוג: דריסת עמדה גוברת על ברירת המחדל של המפה לאותה נקודה
    const byKey = new Map();
    for (const r of rows) {
      const key = `${r.sector_id}|${r.sub_label || ''}`;
      const prev = byKey.get(key);
      if (!prev || (r.preset_id != null && prev.preset_id == null)) byKey.set(key, r);
    }
    res.json([...byKey.values()].map(r => ({ ...r, is_override: r.preset_id != null })));
  } catch (err) {
    console.error('Error fetching map transfer points:', err);
    res.status(500).json({ error: 'Failed to fetch map transfer points' });
  }
});

// UPSERT לפי (מפה, עמדה/ברירת-מחדל, סקטור, תת-נקודה)
router.post('/api/map-transfer-points', async (req, res) => {
  try {
    const { map_id, preset_id, sector_id, sub_label, x_pct, y_pct, lat, lon, display_mode } = req.body;
    if (!map_id || !sector_id) return res.status(400).json({ error: 'map_id and sector_id required' });
    const { rows } = await pool.query(
      `INSERT INTO map_transfer_points (map_id, preset_id, sector_id, sub_label, x_pct, y_pct, lat, lon, display_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (map_id, COALESCE(preset_id, 0), sector_id, COALESCE(sub_label, ''))
       DO UPDATE SET x_pct = EXCLUDED.x_pct, y_pct = EXCLUDED.y_pct, lat = EXCLUDED.lat,
                     lon = EXCLUDED.lon, display_mode = EXCLUDED.display_mode
       RETURNING *`,
      [Number(map_id), numOrNull(preset_id), Number(sector_id), sub_label || null,
       Number(x_pct) || 0, Number(y_pct) || 0, numOrNull(lat), numOrNull(lon),
       display_mode === 'full' ? 'full' : 'arrow']
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Error saving map transfer point:', err);
    res.status(500).json({ error: 'Failed to save map transfer point' });
  }
});

router.delete('/api/map-transfer-points/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM map_transfer_points WHERE id = $1', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting map transfer point:', err);
    res.status(500).json({ error: 'Failed to delete map transfer point' });
  }
});

router.get('/api/maps/:id/imagedata', async (req, res) => {
  try {
    const row = (await pool.query('SELECT image_data FROM maps WHERE id=$1', [req.params.id])).rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ image_data: row.image_data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
