import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

// --- Serials API ---
router.get('/api/serials', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM serials ORDER BY control_station, serial_number DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch serials' }); }
});

router.post('/api/serials/import', async (req, res) => {
  try {
    const { rows } = req.body;
    let inserted = 0, updated = 0, skipped = 0;
    for (const row of rows) {
      const { control_station, serial_number, essence, relevant_to, created_at } = row;
      if (!control_station || serial_number == null || serial_number === '') continue;
      const existing = await pool.query(
        'SELECT id, essence FROM serials WHERE control_station = $1 AND serial_number = $2',
        [control_station, serial_number]
      );
      if (existing.rows.length > 0) {
        const existingEssence = existing.rows[0].essence || '';
        const newEssence = essence || '';
        if (existingEssence === newEssence) {
          skipped++;
        } else {
          await pool.query(
            'UPDATE serials SET essence = $1, relevant_to = $2, created_at = $3 WHERE id = $4',
            [essence || null, relevant_to || null, created_at ? new Date(created_at) : new Date(), existing.rows[0].id]
          );
          updated++;
        }
      } else {
        await pool.query(
          'INSERT INTO serials (control_station, serial_number, essence, relevant_to, created_at) VALUES ($1,$2,$3,$4,$5)',
          [control_station, serial_number, essence || null, relevant_to || null, created_at ? new Date(created_at) : new Date()]
        );
        inserted++;
      }
    }
    res.json({ imported: inserted + updated, inserted, updated, skipped });
  } catch (err) { res.status(500).json({ error: 'Failed to import serials' }); }
});

router.delete('/api/serials/all', async (req, res) => {
  try {
    await pool.query('DELETE FROM serials');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete serials' }); }
});

// --- Strip Serial Selections API ---
router.get('/api/strip-serial-selections', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sss.*, s.serial_number, s.essence, s.control_station as serial_control_station
      FROM strip_serial_selections sss
      LEFT JOIN serials s ON sss.serial_id = s.id
      ORDER BY sss.strip_id, sss.control_station
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch strip serial selections' }); }
});

router.post('/api/strip-serial-selections', async (req, res) => {
  try {
    const { strip_id: rawStripId, control_station, serial_id, dismissed, acted_by, acted_by_workstation } = req.body;
    const strip_id = parseInt(String(rawStripId).replace(/^s/, ''), 10);
    if (isNaN(strip_id)) return res.status(400).json({ error: 'Invalid strip_id' });
    await pool.query(
      `INSERT INTO strip_serial_selections (strip_id, control_station, serial_id, dismissed, assigned_at, acted_at, acted_by, acted_by_workstation)
       VALUES ($1,$2,$3,$4,NOW(),NOW(),$5,$6)
       ON CONFLICT (strip_id, control_station) DO UPDATE SET serial_id=$3, dismissed=$4, assigned_at=NOW(), acted_at=NOW(), acted_by=$5, acted_by_workstation=$6`,
      [strip_id, control_station, serial_id || null, dismissed || false, acted_by || null, acted_by_workstation || null]
    );
    const result = await pool.query('SELECT * FROM strip_serial_selections WHERE strip_id=$1 AND control_station=$2', [strip_id, control_station]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to save strip serial selection' }); }
});

router.delete('/api/strip-serial-selections', async (req, res) => {
  try {
    const { strip_id: rawStripId, control_station } = req.body;
    const strip_id = parseInt(String(rawStripId).replace(/^s/, ''), 10);
    if (isNaN(strip_id)) return res.status(400).json({ error: 'Invalid strip_id' });
    await pool.query('DELETE FROM strip_serial_selections WHERE strip_id=$1 AND control_station=$2', [strip_id, control_station]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete strip serial selection' }); }
});

// --- Strip Serial Dismissals API ---
router.get('/api/strip-serial-dismissals', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ssd.strip_id, ssd.serial_id, ssd.dismissed_at, s.serial_number, s.control_station
      FROM strip_serial_dismissals ssd
      LEFT JOIN serials s ON ssd.serial_id = s.id
      ORDER BY ssd.dismissed_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch strip serial dismissals' }); }
});

router.post('/api/strip-serial-dismissals', async (req, res) => {
  try {
    const { strip_id: rawStripId, serial_id } = req.body;
    const strip_id = parseInt(String(rawStripId).replace(/^s/, ''), 10);
    if (isNaN(strip_id) || !serial_id) return res.status(400).json({ error: 'Invalid params' });
    await pool.query(
      'INSERT INTO strip_serial_dismissals (strip_id, serial_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [strip_id, serial_id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to save dismissal' }); }
});

router.delete('/api/strip-serial-dismissals', async (req, res) => {
  try {
    const { strip_id: rawStripId, serial_id } = req.body;
    const strip_id = parseInt(String(rawStripId).replace(/^s/, ''), 10);
    if (isNaN(strip_id) || !serial_id) return res.status(400).json({ error: 'Invalid params' });
    await pool.query('DELETE FROM strip_serial_dismissals WHERE strip_id=$1 AND serial_id=$2', [strip_id, serial_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to remove dismissal' }); }
});

// --- BDH API ---
router.get('/api/bdh', async (req, res) => {
  try {
    const docs = await pool.query(`
      SELECT bd.*,
        cc.name as creator_name, cu.name as updater_name
      FROM bdh_documents bd
      LEFT JOIN crew_members cc ON bd.created_by = cc.id
      LEFT JOIN crew_members cu ON bd.updated_by = cu.id
      ORDER BY bd.category, bd.name
    `);
    const items = await pool.query('SELECT * FROM bdh_items ORDER BY bdh_id, order_index, id');
    const result = docs.rows.map(doc => ({
      ...doc,
      items: items.rows.filter(i => i.bdh_id === doc.id)
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch BDH' }); }
});

router.post('/api/bdh', async (req, res) => {
  try {
    const { name, category, title, created_by, items } = req.body;
    const doc = await pool.query(
      'INSERT INTO bdh_documents (name, category, title, created_by, updated_by, updated_at) VALUES ($1,$2,$3,$4,$4,NOW()) RETURNING *',
      [name, category || '', title || '', created_by || null]
    );
    const docId = doc.rows[0].id;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        await pool.query('INSERT INTO bdh_items (bdh_id, order_index, content, is_header) VALUES ($1,$2,$3,$4)', [docId, i, items[i].content || '', !!items[i].is_header]);
      }
    }
    const fullItems = await pool.query('SELECT * FROM bdh_items WHERE bdh_id=$1 ORDER BY order_index, id', [docId]);
    res.json({ ...doc.rows[0], items: fullItems.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to create BDH' }); }
});

router.put('/api/bdh/:id', async (req, res) => {
  try {
    const { name, category, title, updated_by } = req.body;
    const doc = await pool.query(
      'UPDATE bdh_documents SET name=$1, category=$2, title=$3, updated_by=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [name, category || '', title || '', updated_by || null, req.params.id]
    );
    res.json(doc.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update BDH' }); }
});

router.delete('/api/bdh/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bdh_documents WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete BDH' }); }
});

router.post('/api/bdh/:id/items', async (req, res) => {
  try {
    const { content, order_index, is_header } = req.body;
    const maxOrder = await pool.query('SELECT COALESCE(MAX(order_index),0) as m FROM bdh_items WHERE bdh_id=$1', [req.params.id]);
    const idx = order_index ?? (maxOrder.rows[0].m + 1);
    const item = await pool.query('INSERT INTO bdh_items (bdh_id, order_index, content, is_header) VALUES ($1,$2,$3,$4) RETURNING *', [req.params.id, idx, content || '', !!is_header]);
    res.json(item.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to add BDH item' }); }
});

// --- BDH Items ---
router.put('/api/bdh-items/:id', async (req, res) => {
  try {
    const { content, order_index, is_header } = req.body;
    const fields = [], vals = [];
    let i = 1;
    if (content !== undefined) { fields.push(`content=$${i++}`); vals.push(content); }
    if (order_index !== undefined) { fields.push(`order_index=$${i++}`); vals.push(order_index); }
    if (is_header !== undefined) { fields.push(`is_header=$${i++}`); vals.push(!!is_header); }
    if (!fields.length) return res.json({});
    vals.push(req.params.id);
    const result = await pool.query(`UPDATE bdh_items SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, vals);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update BDH item' }); }
});

router.delete('/api/bdh-items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bdh_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete BDH item' }); }
});

router.put('/api/bdh/:id/items/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body;
    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query('UPDATE bdh_items SET order_index=$1 WHERE id=$2 AND bdh_id=$3', [i, orderedIds[i], req.params.id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to reorder BDH items' }); }
});

router.get('/api/presets/:id/bdh', async (req, res) => {
  try {
    const links = await pool.query('SELECT bdh_id FROM workstation_bdh WHERE preset_id=$1', [req.params.id]);
    const bdhIds = links.rows.map(r => r.bdh_id);
    res.json(bdhIds);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch preset BDH' }); }
});

router.put('/api/presets/:id/bdh', async (req, res) => {
  try {
    const { bdh_ids } = req.body;
    await pool.query('DELETE FROM workstation_bdh WHERE preset_id=$1', [req.params.id]);
    for (const bdhId of (bdh_ids || [])) {
      await pool.query('INSERT INTO workstation_bdh (preset_id, bdh_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, bdhId]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update preset BDH' }); }
});

// --- BDH Preset Assignments ---
router.get('/api/bdh-preset-assignments', async (req, res) => {
  try {
    const result = await pool.query('SELECT preset_id, bdh_id FROM workstation_bdh');
    const map = {};
    for (const row of result.rows) {
      if (!map[row.preset_id]) map[row.preset_id] = [];
      map[row.preset_id].push(row.bdh_id);
    }
    res.json(map);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch BDH assignments' }); }
});

// --- BDH Alerts ---
router.get('/api/bdh-alerts', async (req, res) => {
  try {
    const { preset_id } = req.query;
    if (!preset_id) return res.json([]);
    const result = await pool.query(
      'SELECT * FROM bdh_alerts WHERE target_preset_id=$1 AND dismissed=false ORDER BY created_at DESC',
      [preset_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch BDH alerts' }); }
});

router.post('/api/bdh-alerts', async (req, res) => {
  try {
    const { target_preset_ids, message, bdh_name, sender_preset_name, strip_ref } = req.body;
    const ids = [];
    for (const pid of (target_preset_ids || [])) {
      const r = await pool.query(
        'INSERT INTO bdh_alerts (target_preset_id, message, bdh_name, sender_preset_name, strip_ref) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [pid, message, bdh_name || '', sender_preset_name || '', strip_ref || null]
      );
      ids.push(r.rows[0].id);
    }
    res.json({ success: true, ids });
  } catch (err) { res.status(500).json({ error: 'Failed to create BDH alerts' }); }
});

router.patch('/api/bdh-alerts/:id/dismiss', async (req, res) => {
  try {
    await pool.query('UPDATE bdh_alerts SET dismissed=true WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to dismiss BDH alert' }); }
});

// --- Aid Groups API ---
router.get('/api/aid-groups', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ag.*, COUNT(ai.id)::int as item_count
      FROM aid_groups ag
      LEFT JOIN aid_items ai ON ai.group_id = ag.id
      GROUP BY ag.id ORDER BY ag.name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to get aid groups' }); }
});

router.get('/api/aid-groups/:id', async (req, res) => {
  try {
    const grp = await pool.query('SELECT * FROM aid_groups WHERE id=$1', [req.params.id]);
    if (!grp.rows.length) return res.status(404).json({ error: 'Not found' });
    const items = await pool.query('SELECT * FROM aid_items WHERE group_id=$1 ORDER BY sort_order, id', [req.params.id]);
    res.json({ ...grp.rows[0], items: items.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to get aid group' }); }
});

router.post('/api/aid-groups', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query('INSERT INTO aid_groups (name) VALUES ($1) RETURNING *', [name]);
    res.json({ ...result.rows[0], items: [] });
  } catch (err) { res.status(500).json({ error: 'Failed to create aid group' }); }
});

router.put('/api/aid-groups/:id', async (req, res) => {
  try {
    const { name } = req.body;
    await pool.query('UPDATE aid_groups SET name=$1 WHERE id=$2', [name, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update aid group' }); }
});

router.delete('/api/aid-groups/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM aid_groups WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete aid group' }); }
});

router.post('/api/aid-groups/:id/items', async (req, res) => {
  try {
    const { name, type, content, sort_order } = req.body;
    const result = await pool.query(
      'INSERT INTO aid_items (group_id, name, type, content, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, name, type, content || '', sort_order || 0]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to add aid item' }); }
});

router.post('/api/aid-groups/:id/duplicate', async (req, res) => {
  try {
    const { preset_ids } = req.body;
    const src = await pool.query('SELECT * FROM aid_groups WHERE id=$1', [req.params.id]);
    if (!src.rows.length) return res.status(404).json({ error: 'Source group not found' });
    const srcItems = await pool.query('SELECT * FROM aid_items WHERE group_id=$1 ORDER BY sort_order, id', [req.params.id]);
    for (const pid of preset_ids) {
      const newGrp = await pool.query('INSERT INTO aid_groups (name) VALUES ($1) RETURNING id', [src.rows[0].name]);
      const newId = newGrp.rows[0].id;
      for (const item of srcItems.rows) {
        await pool.query('INSERT INTO aid_items (group_id, name, type, content, sort_order) VALUES ($1,$2,$3,$4,$5)',
          [newId, item.name, item.type, item.content, item.sort_order]);
      }
      await pool.query('INSERT INTO preset_aid_groups (preset_id, group_id) VALUES ($1,$2) ON CONFLICT (preset_id) DO UPDATE SET group_id=$2', [pid, newId]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to duplicate aid group' }); }
});

router.post('/api/aid-groups/:id/link', async (req, res) => {
  try {
    const { preset_ids } = req.body;
    for (const pid of preset_ids) {
      await pool.query('INSERT INTO preset_aid_groups (preset_id, group_id) VALUES ($1,$2) ON CONFLICT (preset_id) DO UPDATE SET group_id=$2', [pid, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to link aid group' }); }
});

// --- Aid Items ---
router.put('/api/aid-items/:id', async (req, res) => {
  try {
    const { name, type, content, sort_order } = req.body;
    const fields = []; const vals = []; let i = 1;
    if (name !== undefined) { fields.push(`name=$${i++}`); vals.push(name); }
    if (type !== undefined) { fields.push(`type=$${i++}`); vals.push(type); }
    if (content !== undefined) { fields.push(`content=$${i++}`); vals.push(content); }
    if (sort_order !== undefined) { fields.push(`sort_order=$${i++}`); vals.push(sort_order); }
    if (!fields.length) return res.json({ success: true });
    vals.push(req.params.id);
    await pool.query(`UPDATE aid_items SET ${fields.join(', ')} WHERE id=$${i}`, vals);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update aid item' }); }
});

router.delete('/api/aid-items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM aid_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete aid item' }); }
});

// --- Preset Aid Group ---
router.get('/api/presets/:id/aid-group', async (req, res) => {
  try {
    const link = await pool.query('SELECT group_id FROM preset_aid_groups WHERE preset_id=$1', [req.params.id]);
    if (!link.rows.length) return res.json(null);
    const grpId = link.rows[0].group_id;
    const grp = await pool.query('SELECT * FROM aid_groups WHERE id=$1', [grpId]);
    const items = await pool.query('SELECT id,name,type,content,sort_order FROM aid_items WHERE group_id=$1 ORDER BY sort_order, id', [grpId]);
    const shared = await pool.query(
      `SELECT pag.preset_id, wp.name
       FROM preset_aid_groups pag
       JOIN workstation_presets wp ON wp.id = pag.preset_id
       WHERE pag.group_id=$1`,
      [grpId]
    );
    const linked_presets = shared.rows.filter(r => String(r.preset_id) !== String(req.params.id)).map(r => r.name);
    res.json({ ...grp.rows[0], items: items.rows, shared_count: shared.rows.length, linked_presets });
  } catch (err) { res.status(500).json({ error: 'Failed to get preset aid group' }); }
});

router.put('/api/presets/:id/aid-group', async (req, res) => {
  try {
    const { group_id } = req.body;
    if (group_id === null || group_id === undefined) {
      await pool.query('DELETE FROM preset_aid_groups WHERE preset_id=$1', [req.params.id]);
    } else {
      await pool.query(
        'INSERT INTO preset_aid_groups (preset_id, group_id) VALUES ($1,$2) ON CONFLICT (preset_id) DO UPDATE SET group_id=$2',
        [req.params.id, group_id]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to set preset aid group' }); }
});

// --- Table Modes API ---
router.get('/api/table-modes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM table_modes ORDER BY name');
    res.json(result.rows.map(r => ({
      ...r,
      columns: Array.isArray(r.columns) ? r.columns : (typeof r.columns === 'string' ? JSON.parse(r.columns) : []),
      frozenColumns: r.frozen_columns || 0
    })));
  } catch (err) {
    console.error('Error fetching table modes:', err);
    res.status(500).json({ error: 'Failed to fetch table modes' });
  }
});

router.post('/api/table-modes', async (req, res) => {
  try {
    const { name, columns, frozenColumns } = req.body;
    const result = await pool.query(
      'INSERT INTO table_modes (name, columns, frozen_columns) VALUES ($1, $2, $3) RETURNING *',
      [name, JSON.stringify(columns || []), frozenColumns || 0]
    );
    const row = result.rows[0];
    res.json({ ...row, columns: Array.isArray(row.columns) ? row.columns : JSON.parse(row.columns || '[]'), frozenColumns: row.frozen_columns || 0 });
  } catch (err) {
    console.error('Error creating table mode:', err);
    res.status(500).json({ error: 'Failed to create table mode' });
  }
});

router.put('/api/table-modes/:id', async (req, res) => {
  try {
    const { name, columns, frozenColumns } = req.body;
    const result = await pool.query(
      'UPDATE table_modes SET name = $1, columns = $2, frozen_columns = $3 WHERE id = $4 RETURNING *',
      [name, JSON.stringify(columns || []), frozenColumns || 0, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Table mode not found' });
    const row = result.rows[0];
    res.json({ ...row, columns: Array.isArray(row.columns) ? row.columns : JSON.parse(row.columns || '[]'), frozenColumns: row.frozen_columns || 0 });
  } catch (err) {
    console.error('Error updating table mode:', err);
    res.status(500).json({ error: 'Failed to update table mode' });
  }
});

router.delete('/api/table-modes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM table_modes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting table mode:', err);
    res.status(500).json({ error: 'Failed to delete table mode' });
  }
});

// --- Activity Log API ---
router.post('/api/activity-log', async (req, res) => {
  try {
    const { event_type, severity, workstation_preset_id, workstation_name, crew_member_id, crew_member_name, strip_id, strip_callsign, details, related_preset_id, related_preset_name } = req.body;
    const result = await pool.query(`
      INSERT INTO activity_log (event_type, severity, workstation_preset_id, workstation_name, crew_member_id, crew_member_name, strip_id, strip_callsign, details, related_preset_id, related_preset_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
    `, [
      event_type,
      severity || 'normal',
      workstation_preset_id || null,
      workstation_name || null,
      crew_member_id || null,
      crew_member_name || null,
      strip_id || null,
      strip_callsign || null,
      JSON.stringify(details || {}),
      related_preset_id || null,
      related_preset_name || null
    ]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating activity log entry:', err);
    res.status(500).json({ error: 'Failed to create activity log entry' });
  }
});

router.get('/api/activity-log', async (req, res) => {
  try {
    const { event_type, date_from, date_to, workstation_preset_id, crew_member_id, severity } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 500, 1000);
    const offset = parseInt(req.query.offset) || 0;
    const conditions = [];
    const params = [];
    let idx = 1;
    if (event_type) { conditions.push(`event_type = $${idx++}`); params.push(event_type); }
    if (severity) { conditions.push(`severity = $${idx++}`); params.push(severity); }
    if (date_from) { conditions.push(`timestamp >= $${idx++}`); params.push(date_from); }
    if (date_to) { conditions.push(`timestamp <= $${idx++}`); params.push(new Date(date_to + 'T23:59:59')); }
    if (workstation_preset_id) { conditions.push(`workstation_preset_id = $${idx++}`); params.push(parseInt(workstation_preset_id)); }
    if (crew_member_id) { conditions.push(`crew_member_id = $${idx++}`); params.push(parseInt(crew_member_id)); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM activity_log ${where} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx++}`, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM activity_log ${where}`, params)
    ]);
    res.json({ rows: rows.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error('Error fetching activity log:', err);
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
});

router.delete('/api/activity-log', async (req, res) => {
  try {
    await pool.query('DELETE FROM activity_log');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear activity log' });
  }
});

router.get('/api/defaults', async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM system_defaults');
    const defaults = {};
    result.rows.forEach((r) => { defaults[r.key] = r.value; });
    res.json(defaults);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch defaults' }); }
});

router.post('/api/defaults', async (req, res) => {
  try {
    const { workstationName, defaultSector, defaultMap } = req.body;
    const updates = [
      ['workstationName', workstationName || ''],
      ['defaultSector', defaultSector || ''],
      ['defaultMap', defaultMap || '']
    ];
    for (const [key, value] of updates) {
      await pool.query(
        `INSERT INTO system_defaults (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to save default' }); }
});

export default router;
