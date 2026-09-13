import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';
import { DRIVER_CSP } from '../middleware/securityHeaders.js';
import { driverScopeOf, driverMayUseBase } from '../auth/driverIdentity.js';
import { metersToPolyline } from '../../shared/tripTracking.js';
const router = new Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Expose Google Maps key to frontend
router.get('/api/google-maps-key', (req, res) => {
  res.json({ key: process.env.GOOGLE_MAPS_API_KEY || '' });
});

// Serve driver mobile app
router.get('/driver', (req, res) => {
  // הדף מוגש עם CSP מקל משלו - הסקריפט שלו מוטבע ב-HTML. ראה DRIVER_CSP.
  res.setHeader('Content-Security-Policy', DRIVER_CSP);
  res.sendFile(path.join(__dirname, '../../public', 'driver.html'));
});

// הלוגיקה הטהורה של אפליקציית הנהג (ברכה, בסיס קרוב, טאבים, בניית בקשה) -
// מודול ES אחד שנבדק ב-vitest ונטען בדף. תחת /driver/ כי הנתיב הזה כבר מנותב
// לשרת גם ב-vite dev וגם בשרת העמדה.
router.get('/driver/logic.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, '../../shared', 'driverLogic.js'));
});
// מעקב נסיעה חי - אותה גאומטריה, ספים וכלל חסימה שהשרת והמגדל מריצים
router.get('/driver/tracking.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, '../../shared', 'tripTracking.js'));
});

// --- Preset Links API ---
router.get('/api/preset-links/:presetId', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM preset_links WHERE preset_id=$1 ORDER BY sort_order, id`, [req.params.presetId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

router.post('/api/preset-links/:presetId', async (req, res) => {
  try {
    const { url, name, category, note, sort_order } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO preset_links (preset_id, url, name, category, note, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.presetId, url || '', name || '', category || '', note || '', sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create link' });
  }
});

router.put('/api/preset-links/:id', async (req, res) => {
  try {
    const { url, name, category, note, sort_order } = req.body;
    await pool.query(
      `UPDATE preset_links SET url=$1, name=$2, category=$3, note=$4, sort_order=$5 WHERE id=$6`,
      [url || '', name || '', category || '', note || '', sort_order || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update link' });
  }
});

router.delete('/api/preset-links/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM preset_links WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// Base routes (מסלולים)
router.get('/api/base-routes', async (req, res) => {
  try {
    const { airfield_id, base_id } = req.query;
    let q = 'SELECT br.* FROM base_routes br';
    const vals = [];
    if (base_id) {
      q += ' JOIN airfields af ON af.id = br.airfield_id WHERE af.base_id=$1';
      vals.push(base_id);
    } else if (airfield_id) {
      q += ' WHERE br.airfield_id=$1';
      vals.push(airfield_id);
    }
    q += ' ORDER BY br.name';
    const r = await pool.query(q, vals);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/api/base-routes', async (req, res) => {
  try {
    const { name, waypoints = [], notes = '', airfield_id, route_type = 'vehicle' } = req.body;
    const r = await pool.query(
      'INSERT INTO base_routes(name, waypoints, notes, airfield_id, route_type) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [name, JSON.stringify(waypoints), notes, airfield_id || null, route_type]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/api/base-routes/:id', async (req, res) => {
  try {
    const { name, waypoints, notes, color, route_type } = req.body;
    const fields = [], vals = [];
    let idx = 1;
    if (name !== undefined)       { fields.push(`name=$${idx++}`);       vals.push(name); }
    if (waypoints !== undefined)  { fields.push(`waypoints=$${idx++}`);  vals.push(JSON.stringify(waypoints)); }
    if (notes !== undefined)      { fields.push(`notes=$${idx++}`);      vals.push(notes); }
    if (color !== undefined)      { fields.push(`color=$${idx++}`);      vals.push(color); }
    if (route_type !== undefined) { fields.push(`route_type=$${idx++}`); vals.push(route_type); }
    if (!fields.length) return res.json({ ok: true });
    vals.push(req.params.id);
    const r = await pool.query(`UPDATE base_routes SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`, vals);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/api/base-routes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM base_routes WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helper: compute GPS coords for waypoints that lack lat/lon using map anchor
function enrichWaypointsWithGeo(waypoints, row) {
  if (!Array.isArray(waypoints) || !waypoints.length) return waypoints;
  const { anchor1_x_img: x1, anchor1_y_img: y1, anchor1_lat: lat1, anchor1_lon: lon1,
          anchor2_x_img: x2, anchor2_y_img: y2, anchor2_lat: lat2, anchor2_lon: lon2 } = row;
  if (x1 == null || y1 == null || lat1 == null || lon1 == null ||
      x2 == null || y2 == null || lat2 == null || lon2 == null) return waypoints;
  return waypoints.map(wp => {
    if ((wp.lat != null) && (wp.lon != null || wp.lng != null)) return wp;
    const tx = (wp.x - x1) / (x2 - x1);
    const ty = (wp.y - y1) / (y2 - y1);
    return { ...wp, lat: Number(lat1) + ty * (Number(lat2) - Number(lat1)), lon: Number(lon1) + tx * (Number(lon2) - Number(lon1)) };
  });
}

// ── בקשות כניסת רכב ──────────────────────────────────────────────────────────
//
// אותם נתיבים משרתים שני צרכנים: **העמדה** (הפקח רואה ומכריע בכל התור) ו**אפליקציית
// DRIVER** (הנהג רואה ונוגע רק בבקשות שהוא שלח). הבקשה נחתמת בת"ז שבאסימון
// הנהג (requester_national_id) - לא בערך שהלקוח שולח - ולפיה הנהג מסונן.
// אסימון נהג בלי ת"ז (אסימון ישן מקוד הגישה המשותף שבוטל) מקבל 403.

/** מה הנהג רשאי לשנות בבקשה שלו. אישור, מסלול וקישור למרשם הם הכרעת המגדל. */
const DRIVER_REQUEST_FIELDS = ['destination', 'supply_type', 'notes', 'status'];
const DRIVER_REQUEST_STATUSES = ['cancelled', 'arrived'];

/** זהות הנהג לבקשה, או 403. `null` = התשובה כבר נשלחה. עמדה: `{ isDriver:false }`. */
function requestScope(req, res) {
  const scope = driverScopeOf(req.user);
  if (scope.isDriver && !scope.nationalId) {
    res.status(403).json({ error: 'driver_identity_required', message: 'נדרשת כניסת נהג מזוהה' });
    return null;
  }
  return scope;
}

router.get('/api/vehicle-requests', async (req, res) => {
  try {
    const scope = requestScope(req, res);
    if (!scope) return;
    const { status } = req.query;
    let q = `SELECT vr.*,
             br.name AS route_name, br.waypoints AS route_waypoints,
             af.id AS route_airfield_id, af.map_id AS route_map_id,
             m.anchor1_x_img, m.anchor1_y_img, m.anchor1_lat, m.anchor1_lon,
             m.anchor2_x_img, m.anchor2_y_img, m.anchor2_lat, m.anchor2_lon,
             fp.airfield_id AS from_point_airfield_id,
             tp.airfield_id AS to_point_airfield_id,
             fp.name AS from_point_name,
             tp.name AS to_point_name,
             pd.id AS permit_driver_match_id,
             BTRIM(pd.first_name || ' ' || pd.last_name) AS permit_driver_name,
             pd.national_id AS permit_national_id,
             pd.permit_from, pd.permit_until,
             pd.status_override AS permit_status_override,
             pd.notes AS permit_notes,
             prole.name AS permit_role_name,
             COALESCE(pz.zone_names, '[]') AS permit_zone_names
             FROM vehicle_requests vr
             LEFT JOIN base_routes br ON br.id = vr.assigned_route_id
             LEFT JOIN airfields af ON af.id = br.airfield_id
             LEFT JOIN maps m ON m.id = af.map_id
             LEFT JOIN airfield_points fp ON fp.id = vr.from_point_id
             LEFT JOIN airfield_points tp ON tp.id = vr.to_point_id
             -- אישור הכניסה של מבקש הכניסה. קישור מפורש (permit_driver_id) גובר;
             -- בהיעדרו מנסים להתאים לפי מספר רישוי קבוע, ורק אז לפי שם מלא - כדי
             -- שהפקח יראה את מצב האישור גם בבקשה שהגיעה מהאפליקציה בלי קישור.
             LEFT JOIN LATERAL (
               SELECT d.* FROM entry_permit_drivers d
                WHERE (vr.permit_driver_id IS NOT NULL AND d.id = vr.permit_driver_id)
                   OR (vr.permit_driver_id IS NULL AND COALESCE(vr.plate_number,'') <> '' AND EXISTS (
                         SELECT 1 FROM entry_permit_vehicles v
                          WHERE v.driver_id = d.id AND v.plate_fixed
                            AND BTRIM(v.plate_number) = BTRIM(vr.plate_number)))
                   OR (vr.permit_driver_id IS NULL AND COALESCE(vr.driver_name,'') <> '' AND
                       BTRIM(d.first_name || ' ' || d.last_name) = BTRIM(vr.driver_name))
                ORDER BY (d.id = vr.permit_driver_id) DESC NULLS LAST, d.id
                LIMIT 1
             ) pd ON TRUE
             LEFT JOIN airfield_permit_params prole ON prole.id = pd.transport_role_id
             LEFT JOIN LATERAL (
               SELECT json_agg(z.name ORDER BY z.sort_order, z.name) AS zone_names
                 FROM entry_permit_driver_zones dz
                 JOIN airfield_permit_params z ON z.id = dz.zone_id
                WHERE dz.driver_id = pd.id
             ) pz ON TRUE`;
    const vals = [], where = [];
    if (status) { vals.push(status); where.push(`vr.status = $${vals.length}`); }
    if (scope.isDriver) {
      vals.push(scope.nationalId); where.push(`vr.requester_national_id = $${vals.length}`);
      // בקשה בבסיס שההרשאה אליו הוסרה אינה מוצגת עוד
      vals.push(scope.baseIds); where.push(`vr.base_id = ANY($${vals.length}::int[])`);
    }
    if (where.length) q += ` WHERE ${where.join(' AND ')}`;
    q += ` ORDER BY vr.created_at DESC LIMIT 100`;
    const r = await pool.query(q, vals);
    const rows = r.rows.map(row => ({
      ...row,
      route_waypoints: enrichWaypointsWithGeo(row.route_waypoints, row),
      anchor1_x_img: undefined, anchor1_y_img: undefined,
      anchor1_lat: undefined, anchor1_lon: undefined,
      anchor2_x_img: undefined, anchor2_y_img: undefined,
      anchor2_lat: undefined, anchor2_lon: undefined,
    }));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/api/vehicle-requests', async (req, res) => {
  try {
    const scope = requestScope(req, res);
    if (!scope) return;
    const { driver_name, base_name, supply_type, destination, origin = '', vehicle_type = '', plate_number = '', from_point_id, to_point_id, base_id } = req.body;
    if (!driverMayUseBase(scope, base_id)) {
      return res.status(403).json({ error: 'base_not_permitted', message: 'אינך מורשה לבסיס זה' });
    }
    const r = await pool.query(
      `INSERT INTO vehicle_requests(driver_name, base_name, supply_type, destination, origin, vehicle_type, plate_number, from_point_id, to_point_id, base_id, requester_national_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [driver_name, base_name, supply_type, destination, origin, vehicle_type, plate_number, from_point_id || null, to_point_id || null, base_id || null, scope.nationalId]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/api/vehicle-requests/:id', async (req, res) => {
  try {
    const scope = requestScope(req, res);
    if (!scope) return;
    let body = req.body || {};
    if (scope.isDriver) {
      body = Object.fromEntries(DRIVER_REQUEST_FIELDS.filter(f => body[f] !== undefined).map(f => [f, body[f]]));
      if (body.status !== undefined && !DRIVER_REQUEST_STATUSES.includes(body.status)) delete body.status;
    }
    const { status, assigned_route_id, notes, destination, supply_type, origin, driver_name, vehicle_type, plate_number, via_route_ids, show_on_map, permit_driver_id } = body;
    const fields = ['updated_at=NOW()'], vals = [];
    let idx = 1;
    if (status !== undefined)            { fields.push(`status=$${idx++}`);            vals.push(status); }
    if (assigned_route_id !== undefined) { fields.push(`assigned_route_id=$${idx++}`); vals.push(assigned_route_id || null); }
    if (notes !== undefined)             { fields.push(`notes=$${idx++}`);             vals.push(notes); }
    if (destination !== undefined)       { fields.push(`destination=$${idx++}`);       vals.push(destination); }
    if (supply_type !== undefined)       { fields.push(`supply_type=$${idx++}`);       vals.push(supply_type); }
    if (origin !== undefined)            { fields.push(`origin=$${idx++}`);            vals.push(origin); }
    if (driver_name !== undefined)       { fields.push(`driver_name=$${idx++}`);       vals.push(driver_name); }
    if (vehicle_type !== undefined)      { fields.push(`vehicle_type=$${idx++}`);      vals.push(vehicle_type); }
    if (plate_number !== undefined)      { fields.push(`plate_number=$${idx++}`);      vals.push(plate_number); }
    if (via_route_ids !== undefined)     { fields.push(`via_route_ids=$${idx++}`);     vals.push(JSON.stringify(via_route_ids || [])); }
    // ⚠️ `$` שחסר כאן שבר את **אישור בקשת הכניסה** כולה: `show_on_map=11` הגיע
    // ל-Postgres כמספר מול עמודה בוליאנית (500), ו-`permit_driver_id=12` היה
    // כותב את מספר הפרמטר כמזהה נהג. הפאנל שולח את שניהם בכל אישור.
    if (show_on_map !== undefined)       { fields.push(`show_on_map=$${idx++}`);      vals.push(!!show_on_map); }
    if (permit_driver_id !== undefined)  { fields.push(`permit_driver_id=$${idx++}`); vals.push(permit_driver_id || null); }
    vals.push(req.params.id);
    let owner = '';
    // בקשה של נהג אחר = 404 ולא 403: הנהג אינו לומד שקיימת בקשה במזהה הזה
    if (scope.isDriver) { vals.push(scope.nationalId); owner = ` AND requester_national_id=$${idx + 1}`; }
    const r = await pool.query(
      `UPDATE vehicle_requests SET ${fields.join(',')} WHERE id=$${idx}${owner} RETURNING *`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: 'request_not_found' });
    if (r.rows[0]?.assigned_route_id) {
      const ro = await pool.query('SELECT * FROM base_routes WHERE id=$1', [r.rows[0].assigned_route_id]);
      res.json({ ...r.rows[0], route_waypoints: ro.rows[0]?.waypoints, route_name: ro.rows[0]?.name });
    } else {
      res.json(r.rows[0]);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/api/vehicle-requests/:id', async (req, res) => {
  try {
    const scope = requestScope(req, res);
    if (!scope) return;
    if (scope.isDriver) {
      const r = await pool.query('DELETE FROM vehicle_requests WHERE id=$1 AND requester_national_id=$2', [req.params.id, scope.nationalId]);
      if (!r.rowCount) return res.status(404).json({ error: 'request_not_found' });
    } else {
      await pool.query('DELETE FROM vehicle_requests WHERE id=$1', [req.params.id]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Vehicle messages
router.post('/api/vehicle-messages', async (req, res) => {
  try {
    const { request_id, message } = req.body;
    const r = await pool.query(
      'INSERT INTO vehicle_messages(request_id, message) VALUES($1,$2) RETURNING *',
      [request_id, message]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/vehicle-messages', async (req, res) => {
  try {
    const { request_id } = req.query;
    if (!request_id) return res.status(400).json({ error: 'request_id required' });
    const r = await pool.query(
      'SELECT * FROM vehicle_messages WHERE request_id=$1 AND seen=false ORDER BY sent_at',
      [request_id]
    );
    if (r.rows.length > 0) {
      await pool.query('UPDATE vehicle_messages SET seen=true WHERE request_id=$1 AND seen=false', [request_id]);
    }
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GPS tracking
router.post('/api/vehicle-gps', async (req, res) => {
  try {
    const { request_id, lat, lng, heading = 0, speed = 0 } = req.body;
    await pool.query(
      'INSERT INTO vehicle_gps(request_id, lat, lng, heading, speed) VALUES($1,$2,$3,$4,$5)',
      [request_id, lat, lng, heading, speed]
    );
    await pool.query(
      `DELETE FROM vehicle_gps WHERE request_id=$1 AND id NOT IN (
         SELECT id FROM vehicle_gps WHERE request_id=$1 ORDER BY timestamp DESC LIMIT 200
       )`, [request_id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/api/vehicle-gps/latest/:requestId', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM vehicle_gps WHERE request_id=$1 ORDER BY timestamp DESC LIMIT 1',
      [req.params.requestId]
    );
    res.json(r.rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/api/vehicle-gps/all-latest', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT DISTINCT ON (request_id) *
      FROM vehicle_gps
      ORDER BY request_id, timestamp DESC
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Route plan helper functions
function bearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function turnLabel(b1, b2) {
  const delta = ((b2 - b1) + 540) % 360 - 180;
  if (delta > 25) return 'ימינה';
  if (delta < -25) return 'שמאלה';
  return 'ישר';
}
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pctToGeo(xPct, yPct, mapRow) {
  const { anchor1_x_img: x1, anchor1_y_img: y1, anchor1_lat: lat1, anchor1_lon: lon1,
          anchor2_x_img: x2, anchor2_y_img: y2, anchor2_lat: lat2, anchor2_lon: lon2 } = mapRow;
  if (x1 == null || y1 == null || lat1 == null || lon1 == null ||
      x2 == null || y2 == null || lat2 == null || lon2 == null) return null;
  const tx = (xPct - x1) / (x2 - x1);
  const ty = (yPct - y1) / (y2 - y1);
  return { lat: Number(lat1) + ty * (Number(lat2) - Number(lat1)), lon: Number(lon1) + tx * (Number(lon2) - Number(lon1)) };
}

/** `edgeCost(from, to, cost)` - עלות מותאמת לקשת (חלופות נתיב: קנס על מקטע). בלעדיו - המרחק. */
function astarPath(graph, nodes, startId, endId, edgeCost = null) {
  const open = new Map([[startId, haversineM(nodes[startId].lat, nodes[startId].lon, nodes[endId].lat, nodes[endId].lon)]]);
  const cameFrom = {};
  const gScore = { [startId]: 0 };
  while (open.size > 0) {
    let current = null, lowestF = Infinity;
    for (const [id, f] of open) { if (f < lowestF) { lowestF = f; current = id; } }
    if (current === endId) {
      const path = [];
      let c = current;
      while (c !== undefined) { path.unshift(c); c = cameFrom[c]; }
      return path;
    }
    open.delete(current);
    for (const { to, cost } of (graph[current] || [])) {
      if (!nodes[to]) continue;
      const tg = (gScore[current] || 0) + (edgeCost ? edgeCost(current, to, cost) : cost);
      if (tg < (gScore[to] != null ? gScore[to] : Infinity)) {
        cameFrom[to] = current;
        gScore[to] = tg;
        open.set(to, tg + haversineM(nodes[to].lat, nodes[to].lon, nodes[endId].lat, nodes[endId].lon));
      }
    }
  }
  return null;
}

/** קנס על קשת במקטע שנחסם בחיפוש חלופה - גבוה מספיק כדי שכל עקיפה סבירה תעדיף דרך אחרת */
const ALT_PENALTY = 25;
/** צומת של המקטע שנחסם מותר בחלופה רק במרחק הזה ממוצא, תחנה או יעד */
const ALT_ENDPOINT_M = 100;
/** שני נתיבים שכל נקודה של כל אחד מהם במרחק הזה מהשני - אותה דרך פיזית */
const ALT_SAME_PATH_M = 50;
/** כמה חלופות לכל היותר לבקשה - מעבר לזה הפקח מקבל רשימה ולא בחירה */
const MAX_ALTERNATIVES = 3;

/**
 * תכנון נתיב בגרף הכבישים/מסלולי ההסעה של השדה: מוצא -> תחנות -> יעד.
 *
 * פונקציה ולא רק נתיב HTTP: מעקב הנסיעה החי (routes/permits.js) מחשב בה מחדש את
 * הנתיב לנסיעה שאושרה **לפני** שהנתיב נשמר עליה - אותו חישוב שהפקח ראה, ולא
 * קירוב שני. מחזיר את גוף התשובה; `{ error, status: 400 }` כשחסר שדה.
 */
export async function planRoute(body) {
  const { airfield_id, from_point_id, to_point_id, permission = 'vehicle', permissions, via_point_ids } = body || {};
  if (!airfield_id) return { status: 400, error: 'airfield_id required' };

  const mapRow = (await pool.query(
    `SELECT m.anchor1_x_img, m.anchor1_y_img, m.anchor1_lat, m.anchor1_lon,
            m.anchor2_x_img, m.anchor2_y_img, m.anchor2_lat, m.anchor2_lon
     FROM maps m
     JOIN airfields a ON a.map_id = m.id
     WHERE a.id = $1 LIMIT 1`, [airfield_id])).rows[0];

  const [fromPt, toPt] = await Promise.all([
    from_point_id ? pool.query('SELECT * FROM airfield_points WHERE id=$1', [from_point_id]).then(r => r.rows[0]) : null,
    to_point_id   ? pool.query('SELECT * FROM airfield_points WHERE id=$1', [to_point_id]).then(r => r.rows[0])   : null,
  ]);

  const typeMap = { vehicle: 'vehicle', taxiways: 'taxiway', runways: 'runway', taxiway: 'taxiway', runway: 'runway' };
  let allowedTypes;
  if (Array.isArray(permissions) && permissions.length > 0) {
    allowedTypes = [...new Set(permissions.map(p => typeMap[p] || p).filter(Boolean))];
  } else {
    allowedTypes = permission === 'runways'  ? ['vehicle', 'taxiway', 'runway']
                 : permission === 'taxiways' ? ['vehicle', 'taxiway']
                 :                             ['vehicle'];
  }

  const routesRes = await pool.query('SELECT * FROM base_routes WHERE airfield_id=$1', [airfield_id]);
  const allRoutes = routesRes.rows.map(r => ({
    ...r,
    waypoints: Array.isArray(r.waypoints) ? r.waypoints : (JSON.parse(r.waypoints || '[]')),
    route_type: r.route_type || 'vehicle'
  }));
  const usableRoutes = allRoutes.filter(r => allowedTypes.includes(r.route_type));

  if (mapRow) {
    for (const route of usableRoutes) {
      route.waypoints = enrichWaypointsWithGeo(route.waypoints, mapRow);
    }
  }

  const CONNECTION_RADIUS = 80;
  const START_RADIUS = 300;
  const TOP_K_CONNECT = 8;
  const nodes = {};
  const graph = {};

  for (const route of usableRoutes) {
    for (let i = 0; i < route.waypoints.length; i++) {
      const wp = route.waypoints[i];
      const lat = wp.lat; const lon = wp.lon ?? wp.lng;
      if (lat == null || lon == null) continue;
      const id = `r${route.id}_${i}`;
      nodes[id] = { lat, lon, xPct: wp.x ?? wp.x_pct ?? null, yPct: wp.y ?? wp.y_pct ?? null, routeId: route.id, routeType: route.route_type, routeName: route.name, wpIndex: i };
      graph[id] = graph[id] || [];
      if (i > 0) {
        const prevId = `r${route.id}_${i - 1}`;
        if (nodes[prevId]) {
          const cost = haversineM(nodes[prevId].lat, nodes[prevId].lon, lat, lon);
          graph[prevId].push({ to: id, cost });
          graph[id].push({ to: prevId, cost });
        }
      }
    }
  }

  const nodeIds = Object.keys(nodes);
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const a = nodes[nodeIds[i]], b = nodes[nodeIds[j]];
      if (a.routeId === b.routeId) continue;
      const d = haversineM(a.lat, a.lon, b.lat, b.lon);
      if (d <= CONNECTION_RADIUS) {
        graph[nodeIds[i]].push({ to: nodeIds[j], cost: d });
        graph[nodeIds[j]].push({ to: nodeIds[i], cost: d });
      }
    }
  }

  // ── רגלי הנסיעה: מוצא -> תחנות ביניים -> יעד ─────────────────────────────
  //
  // הנתיב חייב לעבור **בתחנות**, ולא רק לחבר מוצא ליעד: תחנה שאינה על הנתיב
  // שחושב היא תחנה שהנהג לא יעצור בה, והפקח מאשר נתיב שאינו הנסיעה.
  //
  // A* פותר זוג נקודות אחד, ולכן כל רגל נפתרת בנפרד ושרשראות הצמתים
  // **משורשרות לנתיב אחד** - וכל העיבוד שאחריו (הוראות, חציות, אלמנטים
  // לתפעול, אורך כולל) עובד עליו בלי שינוי. הגרף נבנה פעם אחת לכל הרגליים.
  const viaIds = Array.isArray(via_point_ids)
    ? via_point_ids.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
  const viaRows = viaIds.length
    ? (await pool.query('SELECT * FROM airfield_points WHERE id = ANY($1::int[])', [viaIds])).rows
    : [];
  // סדר התחנות הוא **סדר הנסיעה** שהפקח קבע, ולא הסדר שה-DB החזיר
  const orderedVia = viaIds.map(id => viaRows.find(p => p.id === id)).filter(Boolean);

  const geoOf = pt => (pt && mapRow ? pctToGeo(pt.x_pct, pt.y_pct, mapRow) : null);
  const fromGeo = geoOf(fromPt);
  const toGeo   = geoOf(toPt);

  if (!fromGeo || !toGeo || !nodeIds.length) {
    return { waypoints: [], crossings: [], elements: [], error: 'לא נמצאו נקודות GPS לתכנון מסלול' };
  }

  // תחנה בלי נ"צ אינה מוסיפה רגל: עדיף נתיב שמדלג עליה על נתיב שלא חושב כלל
  const stopLegs = orderedVia
    .map(p => ({ name: p.name, geo: geoOf(p) }))
    .filter(x => x.geo);

  const chain = [
    { key: '_p0', geo: fromGeo, name: fromPt?.name || 'מוצא' },
    ...stopLegs.map((s, i) => ({ key: `_p${i + 1}`, geo: s.geo, name: s.name, isStop: true })),
    { key: `_p${stopLegs.length + 1}`, geo: toGeo, name: toPt?.name || 'יעד' },
  ];

  // צומת וירטואלי לכל נקודה בשרשרת. **דו-כיווני**, בשונה מהמודל הקודם שבו
  // למוצא היו רק קשתות יוצאות וליעד רק נכנסות: לתחנת ביניים צריך גם להיכנס
  // וגם לצאת, אחרת הרגל שאחריה לא מתחילה בכלל.
  for (const wp of chain) {
    nodes[wp.key] = {
      lat: wp.geo.lat, lon: wp.geo.lon, routeType: 'virtual',
      isStop: !!wp.isStop, stopName: wp.name,
    };
    graph[wp.key] = graph[wp.key] || [];
    const dists = nodeIds
      .map(id => ({ id, d: haversineM(wp.geo.lat, wp.geo.lon, nodes[id].lat, nodes[id].lon) }))
      .sort((a, b) => a.d - b.d);
    const connect = new Set(dists.filter(e => e.d <= START_RADIUS).map(e => e.id));
    dists.slice(0, TOP_K_CONNECT).forEach(e => connect.add(e.id));
    for (const e of dists) {
      if (!connect.has(e.id)) continue;
      graph[wp.key].push({ to: e.id, cost: e.d });
      graph[e.id] = graph[e.id] || [];
      graph[e.id].push({ to: wp.key, cost: e.d });
    }
  }

  /**
   * פותר את כל רגלי השרשרת (מוצא -> תחנות -> יעד). `blocked` - צמתים שכל קשת
   * שנוגעת בהם מקבלת קנס כבד, כדי למצוא נתיב **שעוקף** אותם (חלופה). קנס ולא
   * מחיקה: קטע שאין דרך בלעדיו עדיין נבחר, והחלופה נפסלת (ראה avoids).
   */
  const solveLegs = (blocked = null) => {
    const edgeCost = !blocked ? null
      : (a, b, cost) => (blocked.has(a) || blocked.has(b) ? cost * ALT_PENALTY : cost);
    const ids = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const leg = astarPath(graph, nodes, chain[i].key, chain[i + 1].key, edgeCost);
      if (!leg) return { error: `לא נמצא מסלול - אין חיבור בין ${chain[i].name} ל${chain[i + 1].name}` };
      // הצומת המשותף לשתי רגליים נרשם פעם אחת
      ids.push(...(i === 0 ? leg : leg.slice(1)));
    }
    return { pathIds: ids };
  };

  const best = solveLegs();
  if (best.error) return { waypoints: [], crossings: [], elements: [], error: best.error };

  const afRoutes = (await pool.query('SELECT *, is_runway FROM airfield_routes WHERE airfield_id=$1', [airfield_id])).rows;
  let controlElementsRes = null;
  const controlElements = async () => controlElementsRes || (controlElementsRes = await pool.query(
    `SELECT ae.id, ae.name, ae.x_pct, ae.y_pct, ae.status,
            aet.name as type_name, aet.icon, aet.can_change_status, aet.open_icon, aet.close_icon
     FROM airfield_elements ae
     JOIN airfield_element_types aet ON aet.id = ae.element_type_id
     WHERE ae.airfield_id = $1 AND aet.can_change_status = true`, [airfield_id]));

  /** נתיב (שרשרת צמתים) -> הוראות, חציות, אלמנטים לתפעול, אורך ותיאור המקטעים */
  const describePath = async (pathIds) => {
    const waypoints = pathIds.map(id => {
      const n = nodes[id];
      return {
        lat: n.lat, lon: n.lon, routeType: n.routeType || 'virtual',
        routeName: n.routeName || '', nodeId: id,
        // סימון התחנה עובר הלאה, כדי שההוראה תאמר לנהג לעצור בה
        isStop: !!n.isStop, stopName: n.stopName || '',
      };
    });

    const crossingNodeIds = new Set();
    for (const id of pathIds) {
      const n = nodes[id];
      if (n.routeType === 'taxiway' || n.routeType === 'runway') crossingNodeIds.add(id);
    }
    const crossings = pathIds.filter(id => crossingNodeIds.has(id)).map(id => ({
      nodeId: id, lat: nodes[id].lat, lon: nodes[id].lon,
      routeType: nodes[id].routeType, routeName: nodes[id].routeName || ''
    }));

    const CROSSING_DETECT_RADIUS = 60;
    const detectedAFCrossings = [];
    for (const afRoute of afRoutes) {
      const routePath = Array.isArray(afRoute.route_path) ? afRoute.route_path : (JSON.parse(afRoute.route_path || '[]'));
      for (const pt of routePath) {
        const ptGeo = mapRow ? pctToGeo(pt.x, pt.y, mapRow) : null;
        if (!ptGeo) continue;
        for (const id of pathIds) {
          const n = nodes[id];
          if (!n || n.routeType === 'virtual') continue;
          const d = haversineM(n.lat, n.lon, ptGeo.lat, ptGeo.lon);
          if (d <= CROSSING_DETECT_RADIUS) {
            detectedAFCrossings.push({
              lat: n.lat, lon: n.lon,
              crossingType: afRoute.is_runway ? 'runway' : 'taxiway',
              crossingName: afRoute.name,
              nodeId: id
            });
            break;
          }
        }
      }
    }

    const allCrossingPoints = [
      ...crossings.map(c => ({ lat: c.lat, lon: c.lon, type: c.routeType })),
      ...detectedAFCrossings.map(c => ({ lat: c.lat, lon: c.lon, type: c.crossingType }))
    ];
    const ELEMENT_RADIUS = 150;
    const elementsToOperate = [];
    const seenElements = new Set();
    if (allCrossingPoints.length > 0) {
      const elsRes = await controlElements();
      for (const el of elsRes.rows) {
        const elGeo = mapRow ? pctToGeo(el.x_pct, el.y_pct, mapRow) : null;
        if (!elGeo) continue;
        for (const cp of allCrossingPoints) {
          const d = haversineM(cp.lat, cp.lon, elGeo.lat, elGeo.lon);
          if (d <= ELEMENT_RADIUS && !seenElements.has(el.id)) {
            seenElements.add(el.id);
            elementsToOperate.push({ ...el, lat: elGeo.lat, lon: elGeo.lon, distance: Math.round(d), crossingType: cp.type });
          }
        }
      }
    }

    const crossingNodeSet = new Set([...crossings.map(c => c.nodeId), ...detectedAFCrossings.map(c => c.nodeId)]);
    const baseWaypoints = waypoints.map(wp => ({
      ...wp,
      xPct: nodes[wp.nodeId]?.xPct ?? null,
      yPct: nodes[wp.nodeId]?.yPct ?? null,
      isCrossing: crossingNodeSet.has(wp.nodeId),
      crossingDetails: detectedAFCrossings.find(c => c.nodeId === wp.nodeId) || null
    }));

    const fromName = fromPt?.name || 'מוצא';
    const toName   = toPt?.name   || 'יעד';
    const finalWaypoints = baseWaypoints.map((wp, i, arr) => {
      let instruction = '';
      let turn = '';
      if (i === 0) {
        instruction = `🚦 צא מ${fromName}`;
      } else if (i === arr.length - 1) {
        instruction = `🏁 הגעת ל${toName}`;
      } else {
        const prev = arr[i - 1], next = arr[i + 1];
        if (prev.lat && prev.lon && wp.lat && wp.lon && next.lat && next.lon) {
          const b1 = bearingDeg(prev.lat, prev.lon, wp.lat, wp.lon);
          const b2 = bearingDeg(wp.lat, wp.lon, next.lat, next.lon);
          turn = turnLabel(b1, b2);
          const rn = next.routeName || wp.routeName || '';
          instruction = turn === 'ישר' ? `➡️ סע ישר${rn ? ` על ${rn}` : ''}` :
                        turn === 'ימינה' ? `↪️ פנה ימינה${rn ? ` על ${rn}` : ''}` :
                                           `↩️ פנה שמאלה${rn ? ` על ${rn}` : ''}`;
        }
      }
      // תחנת ביניים גוברת על הוראת הפנייה: מה שהנהג צריך לדעת בנקודה הזו
      // הוא שהוא עוצר, ולא לאן הכביש ממשיך
      if (wp.isStop) instruction = `🛑 עצור בתחנה ${wp.stopName}`;
      if (wp.isCrossing) {
        const cType = wp.crossingDetails?.crossingType || wp.routeType;
        const cName = wp.crossingDetails?.crossingName || wp.routeName || '';
        instruction += ` ⚠️ (שים לב! ${cType === 'runway' ? 'מסלול טיסה' : 'מסלול הסעה'}${cName ? ` — ${cName}` : ''})`;
      }
      return { ...wp, instruction, turn };
    });

    const totalDistM = Math.round(pathIds.slice(1).reduce((sum, id, i) => {
      const prev = nodes[pathIds[i]], cur = nodes[id];
      return prev && cur ? sum + haversineM(prev.lat, prev.lon, cur.lat, cur.lon) : sum;
    }, 0));

    const segmentPath = (() => {
      const parts = [fromName];
      let lastSeg = null;
      for (let i = 0; i < finalWaypoints.length; i++) {
        const wp = finalWaypoints[i];
        if (i === finalWaypoints.length - 1) {
          const dir = wp.turn === 'ימינה' ? 'R' : wp.turn === 'שמאלה' ? 'L' : '→';
          parts.push(`->(${dir})->${toName}`);
          break;
        }
        const seg = wp.routeName || null;
        if (seg && seg !== lastSeg) {
          if (lastSeg !== null) {
            const dir = wp.turn === 'ימינה' ? 'R' : wp.turn === 'שמאלה' ? 'L' : '→';
            parts.push(`->(${dir})->${seg}`);
          } else {
            parts.push(`->${seg}`);
          }
          lastSeg = seg;
        }
      }
      return parts.join(' ');
    })();

    return {
      waypoints: finalWaypoints,
      crossings: [...crossings, ...detectedAFCrossings],
      elementsToOperate,
      totalDistM,
      segmentPath,
      routeSegments: usableRoutes.filter(r => pathIds.some(id => id.startsWith(`r${r.id}_`))).map(r => ({ id: r.id, name: r.name, type: r.route_type })),
    };
  };

  const main = await describePath(best.pathIds);

  // ── חלופות ───────────────────────────────────────────────────────────────
  // כל מקטע בנתיב הקצר נחסם בתורו, והנתיב שעוקף אותו הוא חלופה. חלופה שעוברת
  // באותם מקטעים (דרך אחרת אין) מסוננת. הקצרות ראשונות.
  const alternatives = [];
  const wanted = Math.max(0, Math.min(MAX_ALTERNATIVES, Number(body?.alternatives) || 0));
  if (wanted > 0) {
    const segSig = ids => [...new Set(ids.map(id => nodes[id]?.routeId).filter(v => v != null))].sort((a, b) => a - b).join(',');
    const pathLen = ids => ids.slice(1).reduce((sum, id, i) => sum + haversineM(nodes[ids[i]].lat, nodes[ids[i]].lon, nodes[id].lat, nodes[id].lon), 0);
    const seen = new Set([segSig(best.pathIds)]);
    const geo = ids => ids.map(id => ({ lat: nodes[id].lat, lon: nodes[id].lon }));
    // החסימה **גאומטרית** ולא לפי מזהה המקטע: בשדה אמיתי "מסלולים מחושבים" שמורים
    // מונחים על אותם כבישים, וחסימת מקטע לפי מזהה שלחה את החיפוש לכפיל שלו -
    // אותה דרך בשם אחר - בלי לנסות דרך אחרת באמת. נחסם כל צומת בגרף שנמצא ליד
    // הקטע הזה של הנתיב, חוץ מסביבת המוצא, התחנות והיעד (שם הכבישים נפגשים ואין
    // דרך אחרת לצאת או להגיע). צמתים סמוכים מחוברים עד 80 מ', ולכן הקנס על כל
    // קשת שנוגעת בצומת חסום - אחרת החיפוש "מדלג" לצומת סמוך וחוזר.
    const nearChain = id => chain.some(p => haversineM(p.geo.lat, p.geo.lon, nodes[id].lat, nodes[id].lon) <= ALT_ENDPOINT_M);
    const blockedNear = part => new Set(nodeIds.filter(id =>
      !nearChain(id) && (metersToPolyline(nodes[id], part)?.meters ?? Infinity) <= ALT_SAME_PATH_M));
    const avoids = (ids, blocked) => ids.every(id => !blocked.has(id));
    const candidates = [];
    for (const seg of main.routeSegments) {
      const part = geo(best.pathIds.filter(id => nodes[id]?.routeId === seg.id));
      const blocked = blockedNear(part);
      if (!blocked.size) continue;
      const alt = solveLegs(blocked);
      if (alt.error || !avoids(alt.pathIds, blocked)) continue;
      const sig = segSig(alt.pathIds);
      if (seen.has(sig)) continue;
      seen.add(sig);
      candidates.push({ ids: alt.pathIds, len: pathLen(alt.pathIds) });
    }
    candidates.sort((a, b) => a.len - b.len);
    // **אותה דרך פיזית בשם אחר אינה חלופה.** בשדה אמיתי נשמרו "מסלולים מחושבים"
    // שעוברים בדיוק על הכבישים, והחיפוש החזיר אותם כחלופות באורך זהה לנתיב הקצר.
    // נתיב שכל נקודותיו בתוך ALT_SAME_PATH_M מנתיב שכבר נבחר (ולהפך) - זהה.
    const within = (a, b) => a.every(p => (metersToPolyline(p, b)?.meters ?? Infinity) <= ALT_SAME_PATH_M);
    const samePhysical = (a, b) => within(a, b) && within(b, a);
    const accepted = [geo(best.pathIds)];
    for (const c of candidates) {
      if (alternatives.length >= wanted) break;
      const g = geo(c.ids);
      if (accepted.some(a => samePhysical(g, a))) continue;
      accepted.push(g);
      alternatives.push(await describePath(c.ids));
    }
  }

  const excludedRouteTypes = allRoutes
    .filter(r => !allowedTypes.includes(r.route_type))
    .reduce((acc, r) => {
      if (!acc.some(x => x.type === r.route_type)) {
        acc.push({ type: r.route_type, label: r.route_type === 'runway' ? '🛬 מסלולי טיסה' : r.route_type === 'taxiway' ? '✈️ מסלולי הסעה' : '🚗 כבישים' });
      }
      return acc;
    }, []);

  return {
    ...main,
    permissionLevel: permission,
    permissionsUsed: allowedTypes,
    excludedRouteTypes,
    alternatives,
  };
}

// POST /api/route-plan
router.post('/api/route-plan', async (req, res) => {
  try {
    const out = await planRoute(req.body);
    if (out.status === 400) return res.status(400).json({ error: out.error });
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
