import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';
const router = new Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Expose Google Maps key to frontend
router.get('/api/google-maps-key', (req, res) => {
  res.json({ key: process.env.GOOGLE_MAPS_API_KEY || '' });
});

// Serve driver mobile app
router.get('/driver', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'driver.html'));
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

// Vehicle requests
router.get('/api/vehicle-requests', async (req, res) => {
  try {
    const { status } = req.query;
    let q = `SELECT vr.*,
             br.name AS route_name, br.waypoints AS route_waypoints,
             af.id AS route_airfield_id, af.map_id AS route_map_id,
             m.anchor1_x_img, m.anchor1_y_img, m.anchor1_lat, m.anchor1_lon,
             m.anchor2_x_img, m.anchor2_y_img, m.anchor2_lat, m.anchor2_lon,
             fp.airfield_id AS from_point_airfield_id,
             tp.airfield_id AS to_point_airfield_id,
             fp.name AS from_point_name,
             tp.name AS to_point_name
             FROM vehicle_requests vr
             LEFT JOIN base_routes br ON br.id = vr.assigned_route_id
             LEFT JOIN airfields af ON af.id = br.airfield_id
             LEFT JOIN maps m ON m.id = af.map_id
             LEFT JOIN airfield_points fp ON fp.id = vr.from_point_id
             LEFT JOIN airfield_points tp ON tp.id = vr.to_point_id`;
    const vals = [];
    if (status) { q += ` WHERE vr.status = $1`; vals.push(status); }
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
    const { driver_name, base_name, supply_type, destination, origin = '', vehicle_type = '', plate_number = '', from_point_id, to_point_id, base_id } = req.body;
    const r = await pool.query(
      `INSERT INTO vehicle_requests(driver_name, base_name, supply_type, destination, origin, vehicle_type, plate_number, from_point_id, to_point_id, base_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [driver_name, base_name, supply_type, destination, origin, vehicle_type, plate_number, from_point_id || null, to_point_id || null, base_id || null]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/api/vehicle-requests/:id', async (req, res) => {
  try {
    const { status, assigned_route_id, notes, destination, supply_type, origin, driver_name, vehicle_type, plate_number, via_route_ids, show_on_map } = req.body;
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
    if (show_on_map !== undefined)       { fields.push(`show_on_map=$${idx++}`);       vals.push(!!show_on_map); }
    vals.push(req.params.id);
    const r = await pool.query(
      `UPDATE vehicle_requests SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`,
      vals
    );
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
    await pool.query('DELETE FROM vehicle_requests WHERE id=$1', [req.params.id]);
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

function astarPath(graph, nodes, startId, endId) {
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
      const tg = (gScore[current] || 0) + cost;
      if (tg < (gScore[to] != null ? gScore[to] : Infinity)) {
        cameFrom[to] = current;
        gScore[to] = tg;
        open.set(to, tg + haversineM(nodes[to].lat, nodes[to].lon, nodes[endId].lat, nodes[endId].lon));
      }
    }
  }
  return null;
}

// POST /api/route-plan
router.post('/api/route-plan', async (req, res) => {
  try {
    const { airfield_id, from_point_id, to_point_id, permission = 'vehicle', permissions } = req.body;
    if (!airfield_id) return res.status(400).json({ error: 'airfield_id required' });

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

    const fromGeo = fromPt && mapRow ? pctToGeo(fromPt.x_pct, fromPt.y_pct, mapRow) : null;
    const toGeo   = toPt   && mapRow ? pctToGeo(toPt.x_pct,   toPt.y_pct,   mapRow) : null;

    if (!fromGeo || !toGeo || !nodeIds.length) {
      return res.json({ waypoints: [], crossings: [], elements: [], error: 'לא נמצאו נקודות GPS לתכנון מסלול' });
    }

    nodes['_start'] = { lat: fromGeo.lat, lon: fromGeo.lon, routeType: 'virtual' };
    nodes['_end']   = { lat: toGeo.lat,   lon: toGeo.lon,   routeType: 'virtual' };
    graph['_start'] = [];

    const distFromStart = nodeIds.map(id => ({ id, d: haversineM(fromGeo.lat, fromGeo.lon, nodes[id].lat, nodes[id].lon) }));
    const distFromEnd   = nodeIds.map(id => ({ id, d: haversineM(toGeo.lat,   toGeo.lon,   nodes[id].lat, nodes[id].lon) }));
    distFromStart.sort((a, b) => a.d - b.d);
    distFromEnd.sort((a, b) => a.d - b.d);

    const startConnect = new Set(distFromStart.filter(e => e.d <= START_RADIUS).map(e => e.id));
    distFromStart.slice(0, TOP_K_CONNECT).forEach(e => startConnect.add(e.id));
    const endConnect   = new Set(distFromEnd.filter(e => e.d <= START_RADIUS).map(e => e.id));
    distFromEnd.slice(0, TOP_K_CONNECT).forEach(e => endConnect.add(e.id));

    for (const id of nodeIds) {
      graph[id] = graph[id] || [];
      if (startConnect.has(id)) graph['_start'].push({ to: id, cost: distFromStart.find(e => e.id === id)?.d ?? 0 });
      if (endConnect.has(id))   graph[id].push({ to: '_end', cost: distFromEnd.find(e => e.id === id)?.d ?? 0 });
    }

    const pathIds = astarPath(graph, nodes, '_start', '_end');
    if (!pathIds) {
      return res.json({ waypoints: [], crossings: [], elements: [], error: 'לא נמצא מסלול — אין חיבור בין הנקודות' });
    }

    const waypoints = pathIds.map(id => {
      const n = nodes[id];
      return { lat: n.lat, lon: n.lon, routeType: n.routeType || 'virtual', routeName: n.routeName || '', nodeId: id };
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

    const afRoutes = (await pool.query('SELECT *, is_runway FROM airfield_routes WHERE airfield_id=$1', [airfield_id])).rows;
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
      const elsRes = await pool.query(
        `SELECT ae.id, ae.name, ae.x_pct, ae.y_pct, ae.status,
                aet.name as type_name, aet.icon, aet.can_change_status, aet.open_icon, aet.close_icon
         FROM airfield_elements ae
         JOIN airfield_element_types aet ON aet.id = ae.element_type_id
         WHERE ae.airfield_id = $1 AND aet.can_change_status = true`, [airfield_id]);
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

    const excludedRouteTypes = allRoutes
      .filter(r => !allowedTypes.includes(r.route_type))
      .reduce((acc, r) => {
        if (!acc.some(x => x.type === r.route_type)) {
          acc.push({ type: r.route_type, label: r.route_type === 'runway' ? '🛬 מסלולי טיסה' : r.route_type === 'taxiway' ? '✈️ מסלולי הסעה' : '🚗 כבישים' });
        }
        return acc;
      }, []);

    res.json({
      waypoints: finalWaypoints,
      crossings: [...crossings, ...detectedAFCrossings],
      elementsToOperate,
      totalDistM,
      permissionLevel: permission,
      permissionsUsed: allowedTypes,
      segmentPath,
      excludedRouteTypes,
      routeSegments: usableRoutes.filter(r => pathIds.some(id => id.startsWith(`r${r.id}_`))).map(r => ({ id: r.id, name: r.name, type: r.route_type }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
