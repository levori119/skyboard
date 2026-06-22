import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

// --- Airfields API ---
router.get('/api/airfields', async (req, res) => {
  try {
    const afs = await pool.query('SELECT af.*, ab.name as base_name, ab.code as base_code FROM airfields af LEFT JOIN aviation_bases ab ON ab.id = af.base_id ORDER BY af.name');
    const pts = await pool.query('SELECT * FROM airfield_points ORDER BY airfield_id, display_order, id');
    const fields = afs.rows.map(af => ({
      ...af,
      points: pts.rows.filter(p => p.airfield_id === af.id)
    }));
    res.json(fields);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch airfields' });
  }
});

router.post('/api/airfields', async (req, res) => {
  try {
    const { name, notes, map_id, sids, stars, base_id, custom_name } = req.body;
    let fullName = name || '';
    if (base_id && custom_name?.trim()) {
      const baseRes = await pool.query('SELECT name FROM aviation_bases WHERE id=$1', [base_id]);
      if (baseRes.rows.length) fullName = `${baseRes.rows[0].name} - ${custom_name.trim()}`;
    }
    const dup = await pool.query('SELECT id FROM airfields WHERE LOWER(name) = LOWER($1)', [fullName]);
    if (dup.rows.length) return res.status(409).json({ error: 'שם שדה תעופה כבר קיים' });
    const newSids = Array.isArray(sids) ? sids : [];
    const newStars = Array.isArray(stars) ? stars : [];
    const result = await pool.query(
      'INSERT INTO airfields (name, notes, map_id, sids, stars, base_id, custom_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [fullName, notes || null, map_id || null, JSON.stringify(newSids), JSON.stringify(newStars), base_id || null, custom_name?.trim() || null]
    );
    const airfieldId = result.rows[0].id;
    for (const sid of newSids) {
      await pool.query('INSERT INTO airfield_points (airfield_id, name, x_pct, y_pct, display_order, color, marker, density_warn, point_type) VALUES ($1,$2,50,50,0,$3,$4,3,$5)',
        [airfieldId, sid, '#3b82f6', 'circle', 'sid']);
    }
    for (const star of newStars) {
      await pool.query('INSERT INTO airfield_points (airfield_id, name, x_pct, y_pct, display_order, color, marker, density_warn, point_type) VALUES ($1,$2,50,50,0,$3,$4,3,$5)',
        [airfieldId, star, '#f59e0b', 'circle', 'star']);
    }
    const pts = await pool.query('SELECT * FROM airfield_points WHERE airfield_id=$1 ORDER BY display_order, id', [airfieldId]);
    res.json({ ...result.rows[0], points: pts.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create airfield' });
  }
});

router.put('/api/airfields/:id', async (req, res) => {
  try {
    const { name, notes, map_id, sids, stars, base_id, custom_name } = req.body;
    let resolvedName = name || '';
    if (base_id && custom_name?.trim()) {
      const baseRes = await pool.query('SELECT name FROM aviation_bases WHERE id=$1', [base_id]);
      if (baseRes.rows.length) resolvedName = `${baseRes.rows[0].name} - ${custom_name.trim()}`;
    }
    const newSids = Array.isArray(sids) ? sids : [];
    const newStars = Array.isArray(stars) ? stars : [];

    const existingSidPts = await pool.query("SELECT * FROM airfield_points WHERE airfield_id=$1 AND point_type='sid'", [req.params.id]);
    for (const pt of existingSidPts.rows) {
      if (!newSids.includes(pt.name)) await pool.query('DELETE FROM airfield_points WHERE id=$1', [pt.id]);
    }
    const existingSidNames = existingSidPts.rows.map(p => p.name);
    for (const sid of newSids) {
      if (!existingSidNames.includes(sid)) {
        await pool.query('INSERT INTO airfield_points (airfield_id, name, x_pct, y_pct, display_order, color, marker, density_warn, point_type) VALUES ($1,$2,50,50,0,$3,$4,3,$5)',
          [req.params.id, sid, '#3b82f6', 'circle', 'sid']);
      }
    }

    const existingStarPts = await pool.query("SELECT * FROM airfield_points WHERE airfield_id=$1 AND point_type='star'", [req.params.id]);
    for (const pt of existingStarPts.rows) {
      if (!newStars.includes(pt.name)) await pool.query('DELETE FROM airfield_points WHERE id=$1', [pt.id]);
    }
    const existingStarNames = existingStarPts.rows.map(p => p.name);
    for (const star of newStars) {
      if (!existingStarNames.includes(star)) {
        await pool.query('INSERT INTO airfield_points (airfield_id, name, x_pct, y_pct, display_order, color, marker, density_warn, point_type) VALUES ($1,$2,50,50,0,$3,$4,3,$5)',
          [req.params.id, star, '#f59e0b', 'circle', 'star']);
      }
    }

    const result = await pool.query(
      'UPDATE airfields SET name=$1, notes=$2, map_id=$3, sids=$4, stars=$5, base_id=$6, custom_name=$7 WHERE id=$8 RETURNING *',
      [resolvedName, notes || null, map_id || null, JSON.stringify(newSids), JSON.stringify(newStars), base_id || null, custom_name?.trim() || null, req.params.id]
    );
    const pts = await pool.query('SELECT * FROM airfield_points WHERE airfield_id=$1 ORDER BY display_order, id', [req.params.id]);
    res.json({ ...result.rows[0], points: pts.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update airfield' });
  }
});

router.delete('/api/airfields/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfields WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete airfield' });
  }
});

router.get('/api/airfields/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM airfields WHERE id=$1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch airfield' });
  }
});

router.get('/api/airfields/:id/points', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM airfield_points WHERE airfield_id=$1 ORDER BY display_order, id', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch airfield points' });
  }
});

router.post('/api/airfields/:id/points', async (req, res) => {
  try {
    const { name, x_pct, y_pct, display_order } = req.body;
    const lat = req.body.lat != null ? parseFloat(req.body.lat) : null;
    const lng = req.body.lng != null ? parseFloat(req.body.lng) : null;
    const result = await pool.query(
      'INSERT INTO airfield_points (airfield_id, name, x_pct, y_pct, display_order, color, marker, density_warn, point_type, lat, lng) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
      [req.params.id, name, x_pct ?? 50, y_pct ?? 50, display_order ?? 0, req.body.color || '#3b82f6', req.body.marker || 'circle', req.body.density_warn ?? 3, req.body.point_type || null, lat, lng]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create airfield point' });
  }
});

// Airfield duplicate
router.post('/api/airfields/:id/duplicate', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const srcId = parseInt(req.params.id);

    const srcR = await client.query('SELECT * FROM airfields WHERE id=$1', [srcId]);
    if (!srcR.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const src = srcR.rows[0];

    const newName = `עותק של ${src.name}`;
    const newAF = await client.query(
      'INSERT INTO airfields (name, notes, map_id, sids, stars, base_id, custom_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [newName, src.notes, src.map_id, src.sids, src.stars, src.base_id, src.custom_name]
    );
    const newId = newAF.rows[0].id;

    const pointMap = {};
    const oldPoints = (await client.query('SELECT * FROM airfield_points WHERE airfield_id=$1 ORDER BY id', [srcId])).rows;
    for (const pt of oldPoints) {
      const nr = await client.query(
        'INSERT INTO airfield_points (airfield_id,name,x_pct,y_pct,display_order,color,marker,density_warn,point_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
        [newId, pt.name, pt.x_pct, pt.y_pct, pt.display_order, pt.color || '#3b82f6', pt.marker || 'circle', pt.density_warn ?? 3, pt.point_type]
      );
      pointMap[pt.id] = nr.rows[0].id;
    }

    const routeMap = {};
    const oldRoutes = (await client.query('SELECT * FROM airfield_routes WHERE airfield_id=$1 ORDER BY id', [srcId])).rows;
    for (const r of oldRoutes) {
      const rPath = Array.isArray(r.route_path) ? r.route_path : (r.route_path ? (typeof r.route_path === 'string' ? JSON.parse(r.route_path) : r.route_path) : []);
      const nr = await client.query(
        'INSERT INTO airfield_routes (airfield_id,name,color,route_path,notes,route_category) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [newId, r.name, r.color || '#3b82f6', JSON.stringify(rPath), r.notes, r.route_category || 'general']
      );
      routeMap[r.id] = nr.rows[0].id;
    }

    const elementMap = {};
    const oldElements = (await client.query('SELECT * FROM airfield_elements WHERE airfield_id=$1 ORDER BY id', [srcId])).rows;
    for (const el of oldElements) {
      const relRoutes = Array.isArray(el.relevant_routes) ? el.relevant_routes : (el.relevant_routes ? (typeof el.relevant_routes === 'string' ? JSON.parse(el.relevant_routes) : el.relevant_routes) : []);
      const blockSt   = Array.isArray(el.blocking_statuses) ? el.blocking_statuses : (el.blocking_statuses ? (typeof el.blocking_statuses === 'string' ? JSON.parse(el.blocking_statuses) : el.blocking_statuses) : []);
      const remappedRoutes = relRoutes.map(rid => routeMap[rid] ?? rid);
      const nr = await client.query(
        `INSERT INTO airfield_elements
          (airfield_id,element_type_id,name,status,note,x_pct,y_pct,category,camera_url,
           display_state,blink_rate,blink_colors,open_icon_key,close_icon_key,rotation,relevant_routes,blocking_statuses)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [newId, el.element_type_id, el.name, el.status || 'תקין', el.note,
         el.x_pct, el.y_pct, el.category || '', el.camera_url,
         el.display_state || 'normal', el.blink_rate ?? 1.0, el.blink_colors,
         el.open_icon_key, el.close_icon_key, el.rotation ?? 0,
         JSON.stringify(remappedRoutes), JSON.stringify(blockSt)]
      );
      elementMap[el.id] = nr.rows[0].id;
    }

    const oldNavs = (await client.query(
      `SELECT enr.* FROM element_nav_routes enr
       JOIN airfield_elements ae ON ae.id=enr.element_id
       WHERE ae.airfield_id=$1`, [srcId]
    )).rows;
    for (const nav of oldNavs) {
      const newElId = elementMap[nav.element_id];
      if (!newElId) continue;
      const newFrom = nav.from_point_id ? (pointMap[nav.from_point_id] ?? null) : null;
      const newTo   = nav.to_point_id   ? (pointMap[nav.to_point_id]   ?? null) : null;
      const oldVia  = Array.isArray(nav.via_route_ids) ? nav.via_route_ids : (nav.via_route_ids ? (typeof nav.via_route_ids === 'string' ? JSON.parse(nav.via_route_ids) : nav.via_route_ids) : []);
      const newVia  = oldVia.map(rid => routeMap[rid] ?? rid);
      await client.query(
        `INSERT INTO element_nav_routes (element_id,from_point_id,to_point_id,via_route_ids,updated_at)
         VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (element_id) DO NOTHING`,
        [newElId, newFrom, newTo, JSON.stringify(newVia)]
      );
    }

    const polygonMap = {};
    const oldPolygons = (await client.query('SELECT * FROM airfield_polygons WHERE airfield_id=$1 ORDER BY id', [srcId])).rows;
    for (const pg of oldPolygons) {
      const pgPoly = Array.isArray(pg.polygon) ? pg.polygon : (pg.polygon ? (typeof pg.polygon === 'string' ? JSON.parse(pg.polygon) : pg.polygon) : []);
      const nr = await client.query(
        'INSERT INTO airfield_polygons (airfield_id,name,color,notes,polygon,sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [newId, pg.name, pg.color || '#3b82f6', pg.notes, JSON.stringify(pgPoly), pg.sort_order ?? 0]
      );
      polygonMap[pg.id] = nr.rows[0].id;
    }
    for (const pg of oldPolygons) {
      if (pg.parent_id && polygonMap[pg.parent_id]) {
        await client.query('UPDATE airfield_polygons SET parent_id=$1 WHERE id=$2', [polygonMap[pg.parent_id], polygonMap[pg.id]]);
      }
    }

    const oldSectors = (await client.query('SELECT * FROM airfield_sectors WHERE airfield_id=$1 ORDER BY id', [srcId])).rows;
    for (const sec of oldSectors) {
      await client.query(
        'INSERT INTO airfield_sectors (airfield_id,name,notes,rect,sort_order) VALUES ($1,$2,$3,$4,$5)',
        [newId, sec.name, sec.notes, sec.rect, sec.sort_order ?? 0]
      );
    }

    const oldStatuses = (await client.query('SELECT * FROM airfield_status_types WHERE airfield_id=$1 ORDER BY id', [srcId])).rows;
    for (const st of oldStatuses) {
      await client.query(
        'INSERT INTO airfield_status_types (airfield_id,name,color,sort_order) VALUES ($1,$2,$3,$4)',
        [newId, st.name, st.color || '#6b7280', st.sort_order ?? 0]
      );
    }

    await client.query('COMMIT');
    res.json(newAF.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Duplicate airfield error:', err);
    res.status(500).json({ error: 'Failed to duplicate airfield' });
  } finally {
    client.release();
  }
});

router.put('/api/airfields/:id/vector', async (req, res) => {
  try {
    const { vector_data } = req.body;
    const result = await pool.query(
      'UPDATE airfields SET vector_data=$1 WHERE id=$2 RETURNING *',
      [vector_data ? JSON.stringify(vector_data) : null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save vector data' });
  }
});

router.get('/api/airfields/by-base/:baseId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT af.id, af.name, af.map_id, m.image_data IS NOT NULL as has_map
       FROM airfields af
       LEFT JOIN maps m ON m.id = af.map_id
       WHERE af.base_id = $1
       ORDER BY af.name`, [req.params.baseId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Airfield Points ---
router.get('/api/airfield-points/by-base/:baseId', async (req, res) => {
  try {
    const driverOnly = req.query.driver_only === 'true';
    const result = await pool.query(
      `SELECT ap.id, ap.name, ap.airfield_id, ap.point_type, ap.color, ap.marker, ap.show_in_driver, af.name as airfield_name
       FROM airfield_points ap
       JOIN airfields af ON af.id = ap.airfield_id
       WHERE af.base_id = $1
         AND (ap.show_in_driver = true OR ap.point_type = 'admin_loc')
         ${driverOnly ? 'AND ap.show_in_driver = true' : ''}
       ORDER BY af.name, ap.display_order, ap.id`,
      [req.params.baseId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch admin location points' });
  }
});

router.put('/api/airfield-points/:id', async (req, res) => {
  try {
    const { name, x_pct, y_pct, display_order } = req.body;
    const lat = req.body.lat != null ? parseFloat(req.body.lat) : null;
    const lng = req.body.lng != null ? parseFloat(req.body.lng) : null;
    const show_in_driver = req.body.show_in_driver !== undefined ? req.body.show_in_driver : null;
    const result = await pool.query(
      'UPDATE airfield_points SET name=$1, x_pct=$2, y_pct=$3, display_order=$4, color=$5, marker=$6, density_warn=$7, point_type=$8, lat=$9, lng=$10, show_in_driver=COALESCE($12,show_in_driver) WHERE id=$11 RETURNING *',
      [name, x_pct ?? 50, y_pct ?? 50, display_order ?? 0, req.body.color || '#3b82f6', req.body.marker || 'circle', req.body.density_warn ?? 3, req.body.point_type || null, lat, lng, req.params.id, show_in_driver]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update airfield point' });
  }
});

router.delete('/api/airfield-points/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_points WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete airfield point' });
  }
});

// --- Airfield Element Types ---
router.get('/api/airfield-element-types', async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM airfield_element_types ORDER BY name')).rows); }
  catch (err) { res.status(500).json({ error: 'Failed' }); }
});
router.post('/api/airfield-element-types', async (req, res) => {
  try {
    const { name, color, icon, can_change_status, allowed_statuses, open_icon, close_icon, can_have_route, status_icons } = req.body;
    const r = await pool.query(
      'INSERT INTO airfield_element_types (name,color,icon,can_change_status,allowed_statuses,open_icon,close_icon,can_have_route,status_icons) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [name, color || '#f59e0b', icon || '🔧', can_change_status === true, JSON.stringify(allowed_statuses || []), open_icon || null, close_icon || null, can_have_route === true, JSON.stringify(status_icons || {})]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
router.put('/api/airfield-element-types/:id', async (req, res) => {
  try {
    const { name, color, icon, can_change_status, allowed_statuses, open_icon, close_icon, can_have_route, status_icons } = req.body;
    const r = await pool.query(
      'UPDATE airfield_element_types SET name=$1,color=$2,icon=$3,can_change_status=$4,allowed_statuses=$5,open_icon=$6,close_icon=$7,can_have_route=$8,status_icons=$9 WHERE id=$10 RETURNING *',
      [name, color || '#f59e0b', icon || '🔧', can_change_status === true, JSON.stringify(allowed_statuses || []), open_icon || null, close_icon || null, can_have_route === true, JSON.stringify(status_icons || {}), req.params.id]
    );
    res.json(r.rows[0] || {});
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
router.delete('/api/airfield-element-types/:id', async (req, res) => {
  try { await pool.query('DELETE FROM airfield_element_types WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// --- Airfield Elements ---
router.get('/api/airfield-elements', async (req, res) => {
  try {
    const q = req.query.airfield_id
      ? 'SELECT ae.*, aet.name as type_name, aet.color as type_color, aet.icon as type_icon, aet.can_change_status as type_can_change_status, aet.allowed_statuses as type_allowed_statuses, aet.open_icon as type_open_icon, aet.close_icon as type_close_icon, aet.can_have_route as type_can_have_route, aet.status_icons as type_status_icons FROM airfield_elements ae LEFT JOIN airfield_element_types aet ON ae.element_type_id=aet.id WHERE ae.airfield_id=$1 ORDER BY ae.id'
      : 'SELECT ae.*, aet.name as type_name, aet.color as type_color, aet.icon as type_icon, aet.can_change_status as type_can_change_status, aet.allowed_statuses as type_allowed_statuses, aet.open_icon as type_open_icon, aet.close_icon as type_close_icon, aet.can_have_route as type_can_have_route, aet.status_icons as type_status_icons FROM airfield_elements ae LEFT JOIN airfield_element_types aet ON ae.element_type_id=aet.id ORDER BY ae.airfield_id, ae.id';
    const params = req.query.airfield_id ? [req.query.airfield_id] : [];
    res.json((await pool.query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
router.get('/api/airfield-elements/by-base/:baseId', async (req, res) => {
  try {
    const driverOnly = req.query.driver_only === 'true';
    const result = await pool.query(
      `SELECT ae.id, ae.name, ae.status, ae.note, ae.category, ae.hidden_on_map, ae.show_in_driver,
              aet.name as type_name, aet.icon as type_icon, aet.color as type_color,
              af.name as airfield_name, af.id as airfield_id
       FROM airfield_elements ae
       JOIN airfields af ON af.id = ae.airfield_id
       LEFT JOIN airfield_element_types aet ON aet.id = ae.element_type_id
       WHERE af.base_id = $1 ${driverOnly ? 'AND ae.show_in_driver = true' : ''}
       ORDER BY af.name, ae.category, ae.name`,
      [req.params.baseId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch airfield elements' });
  }
});
router.post('/api/airfield-elements', async (req, res) => {
  try {
    const { airfield_id, element_type_id, name, status, note, x_pct, y_pct, category, camera_url } = req.body;
    const r = await pool.query(
      'INSERT INTO airfield_elements (airfield_id,element_type_id,name,status,note,x_pct,y_pct,category,camera_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [airfield_id, element_type_id || null, name, status || 'תקין', note || null, x_pct ?? null, y_pct ?? null, category || '', camera_url || null]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
router.put('/api/airfield-elements/:id', async (req, res) => {
  try {
    const { element_type_id, name, status, note, x_pct, y_pct, category, display_state, blink_rate, blink_colors, open_icon_key, close_icon_key, rotation, camera_url, relevant_routes, blocking_statuses, hidden_on_map, show_in_driver } = req.body;
    const r = await pool.query(
      `UPDATE airfield_elements SET element_type_id=$1,name=$2,status=$3,note=$4,x_pct=$5,y_pct=$6,category=COALESCE(NULLIF($7,''),category),
       display_state=COALESCE($8,display_state),blink_rate=COALESCE($9,blink_rate),blink_colors=COALESCE($10,blink_colors),
       open_icon_key=COALESCE($11,open_icon_key),close_icon_key=COALESCE($12,close_icon_key),
       rotation=COALESCE($14,rotation),camera_url=COALESCE($15,camera_url),
       relevant_routes=COALESCE($16::jsonb,relevant_routes),blocking_statuses=COALESCE($17::jsonb,blocking_statuses),
       hidden_on_map=COALESCE($18,hidden_on_map),
       show_in_driver=COALESCE($19,show_in_driver)
       WHERE id=$13 RETURNING *`,
      [element_type_id || null, name, status || 'תקין', note || null, x_pct ?? null, y_pct ?? null, category || '',
       display_state ?? null, blink_rate ?? null, blink_colors ?? null, open_icon_key ?? null, close_icon_key ?? null,
       req.params.id, rotation ?? null, camera_url !== undefined ? (camera_url || null) : null,
       relevant_routes !== undefined ? JSON.stringify(relevant_routes) : null,
       blocking_statuses !== undefined ? JSON.stringify(blocking_statuses) : null,
       hidden_on_map !== undefined ? hidden_on_map : null,
       show_in_driver !== undefined ? show_in_driver : null]
    );
    res.json(r.rows[0] || {});
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
router.delete('/api/airfield-elements/:id', async (req, res) => {
  try { await pool.query('DELETE FROM airfield_elements WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// --- Airfield Routes API ---
router.get('/api/airfield-routes', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    let query = 'SELECT * FROM airfield_routes';
    const params = [];
    if (airfield_id) { query += ' WHERE airfield_id=$1'; params.push(airfield_id); }
    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch airfield routes' }); }
});

router.post('/api/airfield-routes', async (req, res) => {
  try {
    const { airfield_id, name, color, route_path, notes, route_category, is_runway, end_a_name, end_b_name } = req.body;
    const result = await pool.query(
      `INSERT INTO airfield_routes (airfield_id, name, color, route_path, notes, route_category, is_runway, end_a_name, end_b_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [airfield_id, name, color || '#3b82f6', JSON.stringify(route_path || []), notes || null, route_category || 'general', is_runway || false, end_a_name || null, end_b_name || null]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create airfield route' }); }
});

router.put('/api/airfield-routes/:id', async (req, res) => {
  try {
    const { name, color, route_path, notes, route_category, is_runway, end_a_name, end_b_name } = req.body;
    const result = await pool.query(
      `UPDATE airfield_routes SET name=$1, color=$2, route_path=$3, notes=$4, route_category=$5, is_runway=$6, end_a_name=$7, end_b_name=$8 WHERE id=$9 RETURNING *`,
      [name, color || '#3b82f6', JSON.stringify(route_path || []), notes || null, route_category || 'general', is_runway || false, end_a_name || null, end_b_name || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update airfield route' }); }
});

router.delete('/api/airfield-routes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_routes WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete airfield route' }); }
});

// ── Airfield Runways ──
router.get('/api/airfield-runways', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    if (!airfield_id) return res.json([]);
    const { rows } = await pool.query('SELECT * FROM airfield_runways WHERE airfield_id=$1 ORDER BY sort_order, id', [airfield_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to get airfield runways' }); }
});
router.post('/api/airfield-runways', async (req, res) => {
  try {
    const { airfield_id, name, heading_a, heading_b, true_bearing, heading_a_true, heading_b_true, length_ft, length_m, sort_order, start_x_pct, start_y_pct, end_x_pct, end_y_pct, tora_m, toda_m, asda_m, lda_m, clearway_m, tora_b_m, toda_b_m, asda_b_m, lda_b_m, clearway_b_m } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO airfield_runways (airfield_id, name, heading_a, heading_b, true_bearing, heading_a_true, heading_b_true, length_ft, length_m, sort_order, start_x_pct, start_y_pct, end_x_pct, end_y_pct, tora_m, toda_m, asda_m, lda_m, clearway_m, tora_b_m, toda_b_m, asda_b_m, lda_b_m, clearway_b_m) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING *',
      [airfield_id, name || '', heading_a || '', heading_b || '', true_bearing || null, heading_a_true ?? null, heading_b_true ?? null, length_ft || null, length_m || null, sort_order || 0, start_x_pct ?? null, start_y_pct ?? null, end_x_pct ?? null, end_y_pct ?? null, tora_m ?? null, toda_m ?? null, asda_m ?? null, lda_m ?? null, clearway_m ?? null, tora_b_m ?? null, toda_b_m ?? null, asda_b_m ?? null, lda_b_m ?? null, clearway_b_m ?? null]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create airfield runway' }); }
});
router.put('/api/airfield-runways/:id', async (req, res) => {
  try {
    const { name, heading_a, heading_b, true_bearing, heading_a_true, heading_b_true, length_ft, length_m, sort_order, start_x_pct, start_y_pct, end_x_pct, end_y_pct, tora_m, toda_m, asda_m, lda_m, clearway_m, tora_b_m, toda_b_m, asda_b_m, lda_b_m, clearway_b_m } = req.body;
    const { rows } = await pool.query(
      'UPDATE airfield_runways SET name=$1, heading_a=$2, heading_b=$3, true_bearing=$4, heading_a_true=$5, heading_b_true=$6, length_ft=$7, length_m=$8, sort_order=$9, start_x_pct=$10, start_y_pct=$11, end_x_pct=$12, end_y_pct=$13, tora_m=$14, toda_m=$15, asda_m=$16, lda_m=$17, clearway_m=$18, tora_b_m=$19, toda_b_m=$20, asda_b_m=$21, lda_b_m=$22, clearway_b_m=$23 WHERE id=$24 RETURNING *',
      [name || '', heading_a || '', heading_b || '', true_bearing || null, heading_a_true ?? null, heading_b_true ?? null, length_ft || null, length_m || null, sort_order || 0, start_x_pct ?? null, start_y_pct ?? null, end_x_pct ?? null, end_y_pct ?? null, tora_m ?? null, toda_m ?? null, asda_m ?? null, lda_m ?? null, clearway_m ?? null, tora_b_m ?? null, toda_b_m ?? null, asda_b_m ?? null, lda_b_m ?? null, clearway_b_m ?? null, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update airfield runway' }); }
});
router.delete('/api/airfield-runways/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_runways WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete airfield runway' }); }
});

// ── Airfield Taxiways ──
router.get('/api/airfield-taxiways', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    if (!airfield_id) return res.json([]);
    const { rows } = await pool.query('SELECT * FROM airfield_taxiways WHERE airfield_id=$1 ORDER BY sort_order, name, id', [airfield_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to get airfield taxiways' }); }
});
router.post('/api/airfield-taxiways', async (req, res) => {
  try {
    const { airfield_id, name, notam_text, is_closed, is_closed_vehicles, sort_order } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO airfield_taxiways (airfield_id, name, notam_text, is_closed, is_closed_vehicles, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [airfield_id, name || '', notam_text || null, is_closed || false, is_closed_vehicles || false, sort_order ?? 0]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create taxiway' }); }
});
router.put('/api/airfield-taxiways/:id', async (req, res) => {
  try {
    const { name, notam_text, is_closed, is_closed_vehicles, sort_order } = req.body;
    const { rows } = await pool.query(
      'UPDATE airfield_taxiways SET name=$1, notam_text=$2, is_closed=$3, is_closed_vehicles=$4, sort_order=$5 WHERE id=$6 RETURNING *',
      [name ?? '', notam_text ?? null, is_closed ?? false, is_closed_vehicles ?? false, sort_order ?? 0, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update taxiway' }); }
});
router.delete('/api/airfield-taxiways/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_taxiways WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete taxiway' }); }
});

// ── Airfield Polygons ─────────────────────────────────────────────────────────
router.get('/api/airfield-polygons', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    if (!airfield_id) return res.json([]);
    const result = await pool.query(
      'SELECT * FROM airfield_polygons WHERE airfield_id=$1 ORDER BY sort_order, id',
      [airfield_id]
    );
    res.json(result.rows.map(r => ({
      ...r,
      polygon: Array.isArray(r.polygon) ? r.polygon : (r.polygon ? (() => { try { return JSON.parse(r.polygon); } catch { return []; } })() : [])
    })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch polygons' }); }
});

router.post('/api/airfield-polygons', async (req, res) => {
  try {
    const { airfield_id, parent_id, name, color, notes, polygon } = req.body;
    const result = await pool.query(
      'INSERT INTO airfield_polygons (airfield_id, parent_id, name, color, notes, polygon) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [airfield_id, parent_id || null, name, color || '#3b82f6', notes || null, JSON.stringify(polygon || [])]
    );
    const r = result.rows[0];
    res.json({ ...r, polygon: Array.isArray(r.polygon) ? r.polygon : (r.polygon ? JSON.parse(r.polygon) : []) });
  } catch (err) { res.status(500).json({ error: 'Failed to create polygon' }); }
});

router.put('/api/airfield-polygons/:id', async (req, res) => {
  try {
    const { name, color, notes, polygon } = req.body;
    const result = await pool.query(
      'UPDATE airfield_polygons SET name=$1, color=$2, notes=$3, polygon=$4 WHERE id=$5 RETURNING *',
      [name, color || '#3b82f6', notes || null, JSON.stringify(polygon || []), req.params.id]
    );
    const r = result.rows[0];
    res.json({ ...r, polygon: Array.isArray(r.polygon) ? r.polygon : (r.polygon ? JSON.parse(r.polygon) : []) });
  } catch (err) { res.status(500).json({ error: 'Failed to update polygon' }); }
});

router.delete('/api/airfield-polygons/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_polygons WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete polygon' }); }
});

// ── Airfield Sectors ──────────────────────────────────────────────────────────
router.get('/api/airfield-sectors', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    if (!airfield_id) return res.json([]);
    const result = await pool.query(
      'SELECT * FROM airfield_sectors WHERE airfield_id=$1 ORDER BY sort_order, id',
      [airfield_id]
    );
    res.json(result.rows.map(r => ({
      ...r,
      rect: typeof r.rect === 'object' ? r.rect : (r.rect ? JSON.parse(r.rect) : { x: 10, y: 10, w: 30, h: 20 })
    })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch sectors' }); }
});

router.post('/api/airfield-sectors', async (req, res) => {
  try {
    const { airfield_id, name, notes, rect } = req.body;
    const result = await pool.query(
      'INSERT INTO airfield_sectors (airfield_id, name, notes, rect) VALUES ($1,$2,$3,$4) RETURNING *',
      [airfield_id, name, notes || null, JSON.stringify(rect || { x: 10, y: 10, w: 30, h: 20 })]
    );
    const r = result.rows[0];
    res.json({ ...r, rect: typeof r.rect === 'object' ? r.rect : JSON.parse(r.rect) });
  } catch (err) { res.status(500).json({ error: 'Failed to create sector' }); }
});

router.put('/api/airfield-sectors/:id', async (req, res) => {
  try {
    const { name, notes, rect } = req.body;
    const result = await pool.query(
      'UPDATE airfield_sectors SET name=$1, notes=$2, rect=$3 WHERE id=$4 RETURNING *',
      [name, notes || null, JSON.stringify(rect || { x: 10, y: 10, w: 30, h: 20 }), req.params.id]
    );
    const r = result.rows[0];
    res.json({ ...r, rect: typeof r.rect === 'object' ? r.rect : JSON.parse(r.rect) });
  } catch (err) { res.status(500).json({ error: 'Failed to update sector' }); }
});

router.delete('/api/airfield-sectors/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_sectors WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete sector' }); }
});

// ── Airfield Status Types ─────────────────────────────────────────────────────
router.get('/api/airfield-status-types', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    if (!airfield_id) return res.json([]);
    const result = await pool.query(
      'SELECT * FROM airfield_status_types WHERE airfield_id=$1 ORDER BY sort_order, id',
      [airfield_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch status types' }); }
});

router.post('/api/airfield-status-types', async (req, res) => {
  try {
    const { airfield_id, name, color } = req.body;
    const result = await pool.query(
      'INSERT INTO airfield_status_types (airfield_id, name, color) VALUES ($1,$2,$3) RETURNING *',
      [airfield_id, name, color || '#6b7280']
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create status type' }); }
});

router.put('/api/airfield-status-types/:id', async (req, res) => {
  try {
    const { name, color } = req.body;
    const result = await pool.query(
      'UPDATE airfield_status_types SET name=$1, color=$2 WHERE id=$3 RETURNING *',
      [name, color || '#6b7280', req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update status type' }); }
});

router.delete('/api/airfield-status-types/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_status_types WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete status type' }); }
});

// ── Airfield Polygon Statuses ───────────────────────────────────────────────
router.get('/api/airfield-polygon-statuses', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    if (!airfield_id) return res.json([]);
    const result = await pool.query(
      `SELECT ps.*, st.name AS status_name, st.color AS status_color
       FROM airfield_polygon_statuses ps
       JOIN airfield_polygons pg ON pg.id = ps.polygon_id
       LEFT JOIN airfield_status_types st ON st.id = ps.status_type_id
       WHERE pg.airfield_id = $1`,
      [airfield_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch polygon statuses' }); }
});

router.post('/api/airfield-polygon-statuses', async (req, res) => {
  try {
    const { polygon_id, status_type_id, note, grf_status, rvr_meters } = req.body;
    const result = await pool.query(
      `INSERT INTO airfield_polygon_statuses (polygon_id, status_type_id, note, grf_status, rvr_meters, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (polygon_id) DO UPDATE SET status_type_id=$2, note=$3, grf_status=$4, rvr_meters=$5, updated_at=NOW()
       RETURNING *`,
      [polygon_id, status_type_id || null, note || null, grf_status || null, rvr_meters != null ? Number(rvr_meters) : null]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to set polygon status' }); }
});

router.delete('/api/airfield-polygon-statuses/:polygon_id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_polygon_statuses WHERE polygon_id=$1', [req.params.polygon_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to clear polygon status' }); }
});

// ── Airfield ATIS ──────────────────────────────────────────────────────────────
router.get('/api/airfield-atis', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    const { rows } = await pool.query('SELECT * FROM airfield_atis WHERE airfield_id=$1', [airfield_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch ATIS' }); }
});
router.post('/api/airfield-atis', async (req, res) => {
  try {
    const { airfield_id, letter, obs_time, approach_type, landing_runway, departure_runway,
            ceiling_value, ceiling_type, visibility, weather_phenomena,
            temperature, dewpoint, wind_direction, wind_speed, wind_gust,
            altimeter_qnh, notam_info } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO airfield_atis (airfield_id, letter, obs_time, approach_type, landing_runway, departure_runway,
        ceiling_value, ceiling_type, visibility, weather_phenomena, temperature, dewpoint,
        wind_direction, wind_speed, wind_gust, altimeter_qnh, notam_info, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
       ON CONFLICT (airfield_id) DO UPDATE SET
        letter=$2, obs_time=$3, approach_type=$4, landing_runway=$5, departure_runway=$6,
        ceiling_value=$7, ceiling_type=$8, visibility=$9, weather_phenomena=$10,
        temperature=$11, dewpoint=$12, wind_direction=$13, wind_speed=$14, wind_gust=$15,
        altimeter_qnh=$16, notam_info=$17, updated_at=NOW()
       RETURNING *`,
      [airfield_id, letter || 'A', obs_time || null, approach_type || null, landing_runway || null,
       departure_runway || null, ceiling_value ?? null, ceiling_type || null, visibility || null,
       weather_phenomena || null, temperature ?? null, dewpoint ?? null, wind_direction ?? null,
       wind_speed ?? null, wind_gust ?? null, altimeter_qnh || null, notam_info || null]
    );
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to save ATIS' }); }
});
router.delete('/api/airfield-atis/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_atis WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete ATIS' }); }
});

// ── Airfield General NOTAMs ──────────────────────────────────────────────────
router.get('/api/airfield-general-notams', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    if (!airfield_id) return res.status(400).json({ error: 'airfield_id required' });
    const { rows } = await pool.query('SELECT * FROM airfield_general_notams WHERE airfield_id=$1 ORDER BY created_at DESC', [airfield_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch general notams' }); }
});

router.post('/api/airfield-general-notams', async (req, res) => {
  try {
    const { airfield_id, text_content } = req.body;
    if (!airfield_id || !text_content?.trim()) return res.status(400).json({ error: 'airfield_id and text_content required' });
    const { rows } = await pool.query(
      'INSERT INTO airfield_general_notams (airfield_id, text_content) VALUES ($1,$2) RETURNING *',
      [airfield_id, text_content.trim()]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create general notam' }); }
});

router.put('/api/airfield-general-notams/:id', async (req, res) => {
  try {
    const { text_content } = req.body;
    if (!text_content?.trim()) return res.status(400).json({ error: 'text_content required' });
    const { rows } = await pool.query(
      'UPDATE airfield_general_notams SET text_content=$1 WHERE id=$2 RETURNING *',
      [text_content.trim(), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update general notam' }); }
});

router.delete('/api/airfield-general-notams/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_general_notams WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete general notam' }); }
});

// ── Runway NOTAMs ──────────────────────────────────────────────────────────────
router.get('/api/runway-notams', async (req, res) => {
  try {
    const { runway_id, airfield_id } = req.query;
    if (airfield_id) {
      const { rows } = await pool.query(
        'SELECT rn.* FROM runway_notams rn JOIN airfield_runways ar ON rn.runway_id = ar.id WHERE ar.airfield_id=$1 ORDER BY rn.id',
        [airfield_id]
      );
      return res.json(rows);
    }
    if (!runway_id) return res.json([]);
    const { rows } = await pool.query('SELECT * FROM runway_notams WHERE runway_id=$1 ORDER BY id', [runway_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to get runway notams' }); }
});
router.post('/api/runway-notams', async (req, res) => {
  try {
    const { runway_id, notam_type, text_content, shorten_end, shorten_amount_ft, shorten_amount_m } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO runway_notams (runway_id, notam_type, text_content, shorten_end, shorten_amount_ft, shorten_amount_m) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [runway_id, notam_type || 'text', text_content || null, shorten_end || null, shorten_amount_ft || null, shorten_amount_m || null]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create runway notam' }); }
});
router.put('/api/runway-notams/:id', async (req, res) => {
  try {
    const { notam_type, text_content, shorten_end, shorten_amount_ft, shorten_amount_m } = req.body;
    const { rows } = await pool.query(
      'UPDATE runway_notams SET notam_type=$1, text_content=$2, shorten_end=$3, shorten_amount_ft=$4, shorten_amount_m=$5 WHERE id=$6 RETURNING *',
      [notam_type, text_content || null, shorten_end || null, shorten_amount_ft || null, shorten_amount_m || null, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update runway notam' }); }
});
router.delete('/api/runway-notams/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM runway_notams WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete runway notam' }); }
});

// ── Runway GRF ────────────────────────────────────────────────────────────────
router.get('/api/runway-grf', async (req, res) => {
  try {
    const { airfield_id, runway_id } = req.query;
    let rows;
    if (airfield_id) {
      ({ rows } = await pool.query(
        'SELECT rg.* FROM runway_grf rg JOIN airfield_runways ar ON rg.runway_id = ar.id WHERE ar.airfield_id=$1 ORDER BY rg.runway_id, rg.heading',
        [airfield_id]
      ));
    } else if (runway_id) {
      ({ rows } = await pool.query('SELECT * FROM runway_grf WHERE runway_id=$1 ORDER BY heading', [runway_id]));
    } else { rows = []; }
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch GRF' }); }
});

router.post('/api/runway-grf', async (req, res) => {
  try {
    const { runway_id, heading, rwycc_t, coverage_t, depth_t, contaminant_t,
            rwycc_m, coverage_m, depth_m, contaminant_m,
            rwycc_r, coverage_r, depth_r, contaminant_r, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO runway_grf (runway_id, heading, rwycc_t, coverage_t, depth_t, contaminant_t,
        rwycc_m, coverage_m, depth_m, contaminant_m, rwycc_r, coverage_r, depth_r, contaminant_r,
        notes, reported_at, valid_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW() + INTERVAL '8 hours')
       ON CONFLICT (runway_id, heading) DO UPDATE SET
        rwycc_t=$3, coverage_t=$4, depth_t=$5, contaminant_t=$6,
        rwycc_m=$7, coverage_m=$8, depth_m=$9, contaminant_m=$10,
        rwycc_r=$11, coverage_r=$12, depth_r=$13, contaminant_r=$14,
        notes=$15, reported_at=NOW(), valid_until=NOW() + INTERVAL '8 hours'
       RETURNING *`,
      [runway_id, heading, rwycc_t ?? null, coverage_t ?? null, depth_t || null, contaminant_t || null,
       rwycc_m ?? null, coverage_m ?? null, depth_m || null, contaminant_m || null,
       rwycc_r ?? null, coverage_r ?? null, depth_r || null, contaminant_r || null, notes || null]
    );
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to save GRF' }); }
});

router.delete('/api/runway-grf/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM runway_grf WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete GRF' }); }
});

// ── Runway Lighting ──────────────────────────────────────────────────────────
router.get('/api/runway-lighting', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    const { rows } = await pool.query(
      `SELECT rl.* FROM runway_lighting rl JOIN airfield_runways ar ON rl.runway_id = ar.id WHERE ar.airfield_id = $1`,
      [airfield_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch runway lighting' }); }
});
router.put('/api/runway-lighting/:runway_id', async (req, res) => {
  try {
    const { centerline_level = 0, edge_level = 0, threshold_lights = 0, end_lights = 0 } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO runway_lighting (runway_id, centerline_level, edge_level, threshold_lights, end_lights, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (runway_id) DO UPDATE SET centerline_level=$2, edge_level=$3, threshold_lights=$4, end_lights=$5, updated_at=NOW()
       RETURNING *`,
      [req.params.runway_id, centerline_level, edge_level, threshold_lights, end_lights]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update runway lighting' }); }
});

// ── Runway Conflict ───────────────────────────────────────────────────────────
router.get('/api/runway-conflict', async (req, res) => {
  try {
    const routeId = Number(req.query.route_id);
    if (!routeId) return res.json([]);
    const { rows: links } = await pool.query(
      `SELECT route_id_a, route_id_b FROM route_links WHERE route_id_a = $1 OR route_id_b = $1`,
      [routeId]
    );
    const linkedRouteIds = links.map(l => Number(l.route_id_a) === routeId ? Number(l.route_id_b) : Number(l.route_id_a));
    const routesToCheck = [routeId, ...linkedRouteIds];
    const { rows: routeRows } = await pool.query(
      `SELECT id, name, end_a_name, end_b_name FROM airfield_routes WHERE id = ANY($1::int[]) AND is_runway = true`,
      [routesToCheck]
    );
    const runwayNames = routeRows.flatMap(r => [r.name, r.end_a_name, r.end_b_name].filter(Boolean));
    const { rows: acRows } = await pool.query(
      `SELECT DISTINCT s.id, s.callsign, s.callsign AS call_sign, 'aircraft' AS type, NULL AS name
       FROM strips s
       WHERE s.aircraft_positions IS NOT NULL
         AND jsonb_array_length(s.aircraft_positions) > 0
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(s.aircraft_positions) ac
           WHERE (ac->>'taxi_dest_route_id')::int = ANY($1::int[])
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(ac->'taxi_via_route_ids') via
                WHERE via::int = ANY($1::int[])
              )
         )`,
      [routesToCheck]
    );
    let tcRows = [];
    if (runwayNames.length > 0) {
      const { rows } = await pool.query(
        `SELECT DISTINCT s.id, s.callsign, s.callsign AS call_sign, 'takeoff_clearance' AS type, NULL AS name
         FROM strips s
         WHERE s.aircraft_positions IS NOT NULL
           AND jsonb_array_length(s.aircraft_positions) > 0
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(s.aircraft_positions) ac
             WHERE ac->>'status' = 'takeoff'
               AND ac->>'takeoff_runway' = ANY($1::text[])
           )`,
        [runwayNames]
      );
      tcRows = rows;
    }
    const { rows: vhRows } = await pool.query(
      `SELECT DISTINCT ae.id, NULL AS call_sign, NULL AS callsign, 'vehicle' AS type, ae.name
       FROM element_nav_routes enr
       JOIN airfield_elements ae ON ae.id = enr.element_id
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(enr.via_route_ids) rid
         WHERE rid::int = ANY($1::int[])
       )`,
      [routesToCheck]
    );
    res.json([...acRows, ...tcRows, ...vhRows]);
  } catch (err) {
    console.error('runway-conflict error:', err.message);
    res.status(500).json({ error: 'Failed to check runway conflict' });
  }
});

// ── Live runway conflicts ─────────────────────────────────────────────────────
router.get('/api/live-runway-conflicts', async (req, res) => {
  try {
    const airfieldId = Number(req.query.airfield_id);
    if (!airfieldId) return res.json([]);
    const { rows: directRw } = await pool.query(
      `SELECT id, name, end_a_name, end_b_name FROM airfield_routes WHERE airfield_id=$1 AND is_runway=true`,
      [airfieldId]
    );
    const { rows: myRoutes } = await pool.query(
      `SELECT id FROM airfield_routes WHERE airfield_id=$1`, [airfieldId]
    );
    const myRouteIds = myRoutes.map(r => Number(r.id));
    let linkedRw = [];
    if (myRouteIds.length > 0) {
      const { rows: links } = await pool.query(
        `SELECT rl.route_id_a, rl.route_id_b, ar.id, ar.name, ar.end_a_name, ar.end_b_name
         FROM route_links rl
         JOIN airfield_routes ar ON ar.is_runway=true AND (
           (rl.route_id_a = ANY($1::int[]) AND ar.id = rl.route_id_b) OR
           (rl.route_id_b = ANY($1::int[]) AND ar.id = rl.route_id_a)
         )`,
        [myRouteIds]
      );
      linkedRw = links.map(l => ({ id: l.id, name: l.name, end_a_name: l.end_a_name, end_b_name: l.end_b_name }));
    }
    const seen = new Set();
    const allRw = [...directRw, ...linkedRw].filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
    if (allRw.length === 0) return res.json([]);
    const results = [];
    for (const rw of allRw) {
      const { rows: linkRows } = await pool.query(
        `SELECT route_id_a, route_id_b FROM route_links WHERE route_id_a=$1 OR route_id_b=$1`, [rw.id]
      );
      const linked = linkRows.map(l => Number(l.route_id_a) === rw.id ? Number(l.route_id_b) : Number(l.route_id_a));
      const routesToCheck = [rw.id, ...linked];
      const runwayNames = [rw.name, rw.end_a_name, rw.end_b_name].filter(Boolean);
      const { rows: acRows } = await pool.query(
        `SELECT DISTINCT s.id, s.callsign, s.callsign AS call_sign, 'aircraft' AS type, NULL AS name
         FROM strips s
         WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.aircraft_positions)='array' THEN s.aircraft_positions ELSE '[]'::jsonb END) ac
           WHERE (ac->>'taxi_dest_route_id')::int = ANY($1::int[])
              OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ac->'taxi_via_route_ids')='array' THEN ac->'taxi_via_route_ids' ELSE '[]'::jsonb END) via WHERE via::int = ANY($1::int[])))`,
        [routesToCheck]
      );
      const { rows: tcRows } = await pool.query(
        `SELECT DISTINCT s.id, s.callsign, s.callsign AS call_sign, 'takeoff_clearance' AS type, NULL AS name
         FROM strips s
         WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.aircraft_positions)='array' THEN s.aircraft_positions ELSE '[]'::jsonb END) ac
           WHERE ac->>'status'='takeoff' AND ac->>'takeoff_runway'=ANY($1::text[]))`,
        [runwayNames]
      );
      const { rows: vhRows } = await pool.query(
        `SELECT DISTINCT ae.id, NULL AS call_sign, NULL AS callsign, 'vehicle' AS type, ae.name
         FROM element_nav_routes enr JOIN airfield_elements ae ON ae.id=enr.element_id
         WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(enr.via_route_ids)='array' THEN enr.via_route_ids ELSE '[]'::jsonb END) rid WHERE rid::int=ANY($1::int[]))`,
        [routesToCheck]
      );
      const conflicts = [...acRows, ...tcRows, ...vhRows];
      const hasVehicle = vhRows.length > 0;
      const hasAircraft = acRows.length > 0 || tcRows.length > 0;
      const hasTaxiAndTakeoff = acRows.length > 0 && tcRows.length > 0;
      const isRealConflict = (hasVehicle && hasAircraft) || hasTaxiAndTakeoff;
      if (isRealConflict) {
        const routeName = rw.end_a_name && rw.end_b_name ? `${rw.end_a_name}/${rw.end_b_name}` : rw.name;
        const nameTokens = [rw.name, rw.end_a_name, rw.end_b_name].filter(Boolean);
        const { rows: recRows } = await pool.query(
          `SELECT ae.id, ae.name, ae.display_state, ae.category, ae.airfield_id,
                  ae.blocking_statuses, aet.can_change_status, aet.allowed_statuses
           FROM airfield_elements ae
           JOIN airfield_element_types aet ON aet.id = ae.element_type_id
           WHERE aet.can_change_status = true
             AND (
               EXISTS (
                 SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ae.relevant_routes)='array' THEN ae.relevant_routes ELSE '[]'::jsonb END) rr
                 WHERE rr::int = ANY($1::int[])
               )
               OR (${nameTokens.map((_, i) => `ae.name ILIKE $${i + 2}`).join(' OR ')})
             )
             AND ae.category NOT IN ('camera','כלי רכב')
           ORDER BY
             CASE WHEN EXISTS (
               SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ae.relevant_routes)='array' THEN ae.relevant_routes ELSE '[]'::jsonb END) rr
               WHERE rr::int = ANY($1::int[])
             ) THEN 0 ELSE 1 END,
             ae.id`,
          [routesToCheck, ...nameTokens.map(t => `%${t}%`)]
        );
        const categoryBlockDefault = { 'STOP BAR': 'מנצנץ', 'רמזורים': 'מנצנץ', 'מחסומים': 'סגור' };
        const recommendations = recRows.map(r => {
          const bs = Array.isArray(r.blocking_statuses) ? r.blocking_statuses : (r.blocking_statuses ? JSON.parse(r.blocking_statuses) : []);
          const as_ = Array.isArray(r.allowed_statuses) ? r.allowed_statuses : (r.allowed_statuses ? JSON.parse(r.allowed_statuses) : []);
          const effectiveBlocking = bs.length > 0 ? bs
            : categoryBlockDefault[r.category] ? [categoryBlockDefault[r.category]]
            : as_.length > 0 ? [as_[0]] : [];
          return {
            id: r.id,
            name: r.name,
            category: r.category,
            display_state: r.display_state,
            airfield_id: r.airfield_id,
            blocking_statuses: effectiveBlocking,
            allowed_statuses: as_,
          };
        }).filter(r => r.blocking_statuses.length > 0);
        results.push({ routeName, conflicts, recommendations });
      }
    }
    res.json(results);
  } catch (err) {
    console.error('live-runway-conflicts error:', err.message);
    res.status(500).json([]);
  }
});

// ── Active Takeoffs ───────────────────────────────────────────────────────────
router.get('/api/active-takeoffs', async (req, res) => {
  try {
    const airfieldId = Number(req.query.airfield_id);
    if (!airfieldId) return res.json([]);
    const { rows: directRw } = await pool.query(
      `SELECT id, name, end_a_name, end_b_name FROM airfield_routes WHERE airfield_id=$1 AND is_runway=true`,
      [airfieldId]
    );
    const { rows: myRoutes } = await pool.query(`SELECT id FROM airfield_routes WHERE airfield_id=$1`, [airfieldId]);
    const myRouteIds = myRoutes.map(r => Number(r.id));
    let linkedRw = [];
    if (myRouteIds.length > 0) {
      const { rows: links } = await pool.query(
        `SELECT ar.id, ar.name, ar.end_a_name, ar.end_b_name
         FROM route_links rl
         JOIN airfield_routes ar ON ar.is_runway=true AND (
           (rl.route_id_a = ANY($1::int[]) AND ar.id = rl.route_id_b) OR
           (rl.route_id_b = ANY($1::int[]) AND ar.id = rl.route_id_a)
         )`,
        [myRouteIds]
      );
      linkedRw = links;
    }
    const seen = new Set();
    const allRw = [...directRw, ...linkedRw].filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
    if (allRw.length === 0) return res.json([]);
    const results = [];
    for (const rw of allRw) {
      const runwayNames = [rw.name, rw.end_a_name, rw.end_b_name].filter(Boolean);
      const { rows } = await pool.query(
        `SELECT DISTINCT s.id, s.callsign, ac->>'takeoff_runway' AS takeoff_runway
         FROM strips s, jsonb_array_elements(CASE WHEN jsonb_typeof(s.aircraft_positions)='array' THEN s.aircraft_positions ELSE '[]'::jsonb END) ac
         WHERE ac->>'status' IN ('takeoff', 'takeoff_clearance')
           AND ac->>'takeoff_runway' = ANY($1::text[])`,
        [runwayNames]
      );
      for (const row of rows) {
        const routeName = rw.end_a_name && rw.end_b_name ? `${rw.end_a_name}/${rw.end_b_name}` : rw.name;
        results.push({ stripId: row.id, callsign: row.callsign, runway: row.takeoff_runway, routeName });
      }
    }
    res.json(results);
  } catch (err) {
    console.error('active-takeoffs error:', err.message);
    res.status(500).json([]);
  }
});

// ── Element Nav Routes ────────────────────────────────────────────────────────
router.get('/api/element-nav', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    if (!airfield_id) return res.json([]);
    const result = await pool.query(
      `SELECT enr.* FROM element_nav_routes enr
       JOIN airfield_elements ae ON ae.id = enr.element_id
       WHERE ae.airfield_id = $1`,
      [airfield_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch element nav routes' }); }
});

router.put('/api/element-nav/:element_id', async (req, res) => {
  try {
    const { from_point_id, to_point_id, via_route_ids } = req.body;
    const result = await pool.query(
      `INSERT INTO element_nav_routes (element_id, from_point_id, to_point_id, via_route_ids, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (element_id) DO UPDATE SET from_point_id=$2, to_point_id=$3, via_route_ids=$4, updated_at=NOW()
       RETURNING *`,
      [req.params.element_id, from_point_id || null, to_point_id || null, JSON.stringify(via_route_ids || [])]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to save element nav route' }); }
});

router.delete('/api/element-nav/:element_id', async (req, res) => {
  try {
    await pool.query('DELETE FROM element_nav_routes WHERE element_id=$1', [req.params.element_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete element nav route' }); }
});

// ── Route Links ───────────────────────────────────────────────────────────────
router.get('/api/route-links', async (req, res) => {
  try {
    const { preset_id, airfield_id } = req.query;
    if (airfield_id) {
      const aid = Number(airfield_id);
      const { rows } = await pool.query(
        `SELECT rl.id,
                rl.preset_id_a, pa.name AS preset_name_a,
                rl.route_id_a,  ra.name AS route_name_a, ra.airfield_id AS airfield_id_a,
                rl.preset_id_b, pb.name AS preset_name_b,
                rl.route_id_b,  rb.name AS route_name_b, rb.airfield_id AS airfield_id_b
         FROM route_links rl
         JOIN workstation_presets pa ON pa.id = rl.preset_id_a
         JOIN workstation_presets pb ON pb.id = rl.preset_id_b
         JOIN airfield_routes ra ON ra.id = rl.route_id_a
         JOIN airfield_routes rb ON rb.id = rl.route_id_b
         WHERE ra.airfield_id = $1 OR rb.airfield_id = $1`,
        [aid]
      );
      const normalized = rows.map(r => {
        if (Number(r.airfield_id_a) === aid) return r;
        return {
          id: r.id,
          preset_id_a: r.preset_id_b, preset_name_a: r.preset_name_b,
          route_id_a:  r.route_id_b,  route_name_a:  r.route_name_b, airfield_id_a: r.airfield_id_b,
          preset_id_b: r.preset_id_a, preset_name_b: r.preset_name_a,
          route_id_b:  r.route_id_a,  route_name_b:  r.route_name_a, airfield_id_b: r.airfield_id_a,
        };
      });
      return res.json(normalized);
    }
    if (!preset_id) return res.status(400).json({ error: 'preset_id or airfield_id required' });
    const pid = Number(preset_id);
    const { rows } = await pool.query(
      `SELECT rl.id,
              rl.preset_id_a, pa.name AS preset_name_a,
              rl.route_id_a,  ra.name AS route_name_a,
              rl.preset_id_b, pb.name AS preset_name_b,
              rl.route_id_b,  rb.name AS route_name_b
       FROM route_links rl
       JOIN workstation_presets pa ON pa.id = rl.preset_id_a
       JOIN workstation_presets pb ON pb.id = rl.preset_id_b
       JOIN airfield_routes ra ON ra.id = rl.route_id_a
       JOIN airfield_routes rb ON rb.id = rl.route_id_b
       WHERE rl.preset_id_a = $1 OR rl.preset_id_b = $1`,
      [pid]
    );
    const normalized = rows.map(r => {
      if (Number(r.preset_id_a) === pid) return r;
      return {
        id: r.id,
        preset_id_a: r.preset_id_b, preset_name_a: r.preset_name_b,
        route_id_a:  r.route_id_b,  route_name_a:  r.route_name_b,
        preset_id_b: r.preset_id_a, preset_name_b: r.preset_name_a,
        route_id_b:  r.route_id_a,  route_name_b:  r.route_name_a,
      };
    });
    res.json(normalized);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch route links' }); }
});

router.post('/api/route-links', async (req, res) => {
  try {
    const { preset_id_a, route_id_a, preset_id_b, route_id_b } = req.body;
    if (!preset_id_a || !route_id_a || !preset_id_b || !route_id_b)
      return res.status(400).json({ error: 'Missing fields' });
    const { rows } = await pool.query(
      `INSERT INTO route_links (preset_id_a, route_id_a, preset_id_b, route_id_b)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (preset_id_a, route_id_a, preset_id_b) DO UPDATE SET route_id_b=$4
       RETURNING *`,
      [preset_id_a, route_id_a, preset_id_b, route_id_b]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create route link' }); }
});

router.delete('/api/route-links/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM route_links WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete route link' }); }
});

export default router;
