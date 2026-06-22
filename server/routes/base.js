import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

// --- Aviation Bases API ---
router.get('/api/aviation-bases', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM aviation_bases ORDER BY name');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch aviation bases' }); }
});

router.post('/api/aviation-bases', async (req, res) => {
  try {
    const { name, code, coord_n, coord_e, sids, stars } = req.body;
    const result = await pool.query(
      `INSERT INTO aviation_bases (name, code, coord_n, coord_e, sids, stars) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, code || null, coord_n || null, coord_e || null, JSON.stringify(sids || []), JSON.stringify(stars || [])]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create aviation base' }); }
});

router.put('/api/aviation-bases/:id', async (req, res) => {
  try {
    const { name, code, coord_n, coord_e, sids, stars } = req.body;
    const result = await pool.query(
      `UPDATE aviation_bases SET name=$1, code=$2, coord_n=$3, coord_e=$4, sids=$5, stars=$6 WHERE id=$7 RETURNING *`,
      [name, code || null, coord_n || null, coord_e || null, JSON.stringify(sids || []), JSON.stringify(stars || []), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update aviation base' }); }
});

router.delete('/api/aviation-bases/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM aviation_bases WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete aviation base' }); }
});

// --- Base Statuses API ---
router.get('/api/base-statuses', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT bs.*,
        (SELECT json_agg(json_build_object(
            'id', rn.id,
            'runway_name', ar.name,
            'notam_type', rn.notam_type,
            'text_content', rn.text_content,
            'shorten_amount_ft', rn.shorten_amount_ft,
            'shorten_amount_m', rn.shorten_amount_m,
            'shorten_end', rn.shorten_end
          ))
          FROM runway_notams rn
          JOIN airfield_runways ar ON rn.runway_id = ar.id
          WHERE ar.airfield_id = bs.airfield_id
        ) AS airfield_notams,
        (SELECT row_to_json(aa)
          FROM airfield_atis aa
          WHERE aa.airfield_id = bs.airfield_id
          ORDER BY aa.updated_at DESC LIMIT 1
        ) AS airfield_atis_data
      FROM base_statuses bs
      ORDER BY bs.name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch base statuses' }); }
});

router.post('/api/base-statuses', async (req, res) => {
  try {
    const { name, code, relevant_to, air_defense_status, absorption_status, bird_status, airfield_id } = req.body;
    const result = await pool.query(
      `INSERT INTO base_statuses (name, code, relevant_to, air_defense_status, absorption_status, bird_status, airfield_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
      [name, code || null, relevant_to || 'כולם', air_defense_status || null, absorption_status || null, bird_status || null, airfield_id || null]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create base status' }); }
});

router.put('/api/base-statuses/:id', async (req, res) => {
  try {
    const { name, code, relevant_to, air_defense_status, absorption_status, bird_status, airfield_id } = req.body;
    const result = await pool.query(
      `UPDATE base_statuses SET name=$1, code=$2, relevant_to=$3, air_defense_status=$4, absorption_status=$5, bird_status=$6, airfield_id=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, code || null, relevant_to || 'כולם', air_defense_status || null, absorption_status || null, bird_status || null, airfield_id || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update base status' }); }
});

router.patch('/api/base-statuses/:id/air-defense', async (req, res) => {
  try {
    const { air_defense_status } = req.body;
    const result = await pool.query(
      `UPDATE base_statuses SET air_defense_status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [air_defense_status || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update air defense status' }); }
});

router.patch('/api/base-statuses/:id/notam', async (req, res) => {
  try {
    const { notam_text } = req.body;
    const result = await pool.query(
      `UPDATE base_statuses SET notam_text=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [notam_text || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update notam text' }); }
});

router.patch('/api/base-statuses/:id/atis', async (req, res) => {
  try {
    const { atis_text } = req.body;
    const result = await pool.query(
      `UPDATE base_statuses SET atis_text=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [atis_text || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update atis text' }); }
});

router.delete('/api/base-statuses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM base_statuses WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete base status' }); }
});

// --- Base Pressure API ---
router.get('/api/base-pressure/:baseId', async (req, res) => {
  try {
    const id = parseInt(req.params.baseId);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid baseId' });
    const r = await pool.query('SELECT pressure_inhg FROM aviation_bases WHERE id=$1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Base not found' });
    res.json({ pressure_inhg: r.rows[0].pressure_inhg ?? null });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch base pressure' }); }
});

router.put('/api/base-pressure/:baseId', async (req, res) => {
  try {
    const id = parseInt(req.params.baseId);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid baseId' });
    const raw = req.body.pressure_inhg;
    const val = (raw !== null && raw !== '' && !isNaN(parseFloat(raw))) ? parseFloat(raw) : null;
    await pool.query('UPDATE aviation_bases SET pressure_inhg=$1 WHERE id=$2', [val, id]);
    res.json({ pressure_inhg: val });
  } catch (err) { res.status(500).json({ error: 'Failed to update base pressure' }); }
});

// --- Workstation Contacts ---
router.get('/api/workstation-contacts', async (req, res) => {
  try {
    const { preset_id } = req.query;
    if (!preset_id) return res.json([]);
    const result = await pool.query(
      'SELECT * FROM workstation_contacts WHERE preset_id=$1 ORDER BY sort_order, id',
      [preset_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch contacts' }); }
});

router.get('/api/workstation-contacts/all', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT wc.*, wp.name AS preset_name, wp.relevant_sectors, wp.classic_transfer_points
       FROM workstation_contacts wc
       JOIN workstation_presets wp ON wp.id = wc.preset_id
       ORDER BY wp.name, wc.sort_order, wc.id`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch all contacts' }); }
});

router.post('/api/workstation-contacts', async (req, res) => {
  try {
    const { preset_id, mahut, oketz, frequency, note, sort_order, device_type, priority } = req.body;
    const result = await pool.query(
      `INSERT INTO workstation_contacts (preset_id, mahut, oketz, frequency, note, sort_order, device_type, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [preset_id, mahut || '', oketz || '', frequency || '', note || '', sort_order || 0, device_type || '', priority || 'ראשי']
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create contact' }); }
});

router.put('/api/workstation-contacts/:id', async (req, res) => {
  try {
    const { mahut, oketz, frequency, note, sort_order, device_type, priority } = req.body;
    const result = await pool.query(
      `UPDATE workstation_contacts SET mahut=$1, oketz=$2, frequency=$3, note=$4, sort_order=$5, device_type=$6, priority=$7
       WHERE id=$8 RETURNING *`,
      [mahut || '', oketz || '', frequency || '', note || '', sort_order || 0, device_type || '', priority || 'ראשי', req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update contact' }); }
});

router.delete('/api/workstation-contacts/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM workstation_contacts WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete contact' }); }
});

export default router;
