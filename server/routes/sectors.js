import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

router.get('/api/sectors', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sectors ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sectors:', err);
    res.status(500).json({ error: 'Failed to fetch sectors' });
  }
});

router.get('/api/sectors/:id/neighbors', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const result = await pool.query(`
      SELECT s.* FROM sectors s
      JOIN sector_neighbors sn ON s.id = sn.neighbor_id
      WHERE sn.sector_id = $1
    `, [sectorId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching neighbors:', err);
    res.status(500).json({ error: 'Failed to fetch neighbors' });
  }
});

router.post('/api/sectors/:id/neighbors', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const { neighborId, neighbor_id } = req.body;
    const nid = neighborId || neighbor_id;
    await pool.query(
      'INSERT INTO sector_neighbors (sector_id, neighbor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [sectorId, nid]
    );
    await pool.query(
      'INSERT INTO sector_neighbors (sector_id, neighbor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [nid, sectorId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error adding neighbor:', err);
    res.status(500).json({ error: 'Failed to add neighbor' });
  }
});

router.delete('/api/sectors/:id/neighbors/:neighborId', async (req, res) => {
  try {
    await pool.query('DELETE FROM sector_neighbors WHERE sector_id = $1 AND neighbor_id = $2', [req.params.id, req.params.neighborId]);
    await pool.query('DELETE FROM sector_neighbors WHERE sector_id = $1 AND neighbor_id = $2', [req.params.neighborId, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing sector neighbor:', err);
    res.status(500).json({ error: 'Failed to remove sector neighbor' });
  }
});

router.get('/api/sectors/:id/strips', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const result = await pool.query(
      'SELECT * FROM strips WHERE sector_id = $1 ORDER BY id',
      [sectorId]
    );
    res.json(result.rows.map(r => ({
      id: 's' + r.id,
      callSign: r.callsign,
      numberOfFormation: r.number_of_formation || null,
      sq: r.sq,
      alt: r.alt,
      task: r.task,
      squadron: r.squadron,
      sectorId: r.sector_id,
      status: r.status,
      x: r.x,
      y: r.y,
      onMap: r.on_map,
      airborne: r.airborne,
      notes: r.notes,
      weapons: r.weapons || [],
      targets: r.targets || [],
      systems: r.systems || [],
      shkadia: r.shkadia,
      erka: r.erka || '',
      koteret: r.koteret || '',
      mivtza: r.mivtza || '',
      tzevet_shilta: r.tzevet_shilta || '',
      ta_shilta: r.ta_shilta || '',
      block_space_id: r.block_space_id || null,
      block_deviation: r.block_deviation || false
    })));
  } catch (err) {
    console.error('Error fetching sector strips:', err);
    res.status(500).json({ error: 'Failed to fetch sector strips' });
  }
});

// --- Sub-sectors API ---
router.get('/api/sectors/:id/sub-sectors', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const result = await pool.query(`
      SELECT ss.*, s.name as neighbor_name, s.label_he as neighbor_label
      FROM sub_sectors ss
      JOIN sectors s ON ss.neighbor_id = s.id
      WHERE ss.sector_id = $1
      ORDER BY ss.id
    `, [sectorId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sub-sectors:', err);
    res.status(500).json({ error: 'Failed to fetch sub-sectors' });
  }
});

router.post('/api/sectors/:id/sub-sectors', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const { neighborId, label, defaultX, defaultY } = req.body;
    const result = await pool.query(
      `INSERT INTO sub_sectors (sector_id, neighbor_id, label, default_x, default_y)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [sectorId, neighborId, label, defaultX || 0.2, defaultY || 0.2]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating sub-sector:', err);
    res.status(500).json({ error: 'Failed to create sub-sector' });
  }
});

router.put('/api/sub-sectors/:id', async (req, res) => {
  try {
    const subSectorId = parseInt(req.params.id);
    const { label, defaultX, defaultY } = req.body;

    let query, params;
    if (defaultX !== undefined && defaultY !== undefined) {
      query = `UPDATE sub_sectors SET label = $1, default_x = $2, default_y = $3 WHERE id = $4 RETURNING *`;
      params = [label, defaultX, defaultY, subSectorId];
    } else {
      query = `UPDATE sub_sectors SET label = $1 WHERE id = $2 RETURNING *`;
      params = [label, subSectorId];
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sub-sector not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating sub-sector:', err);
    res.status(500).json({ error: 'Failed to update sub-sector' });
  }
});

router.delete('/api/sub-sectors/:id', async (req, res) => {
  try {
    const subSectorId = parseInt(req.params.id);
    const result = await pool.query('DELETE FROM sub_sectors WHERE id = $1 RETURNING *', [subSectorId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sub-sector not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting sub-sector:', err);
    res.status(500).json({ error: 'Failed to delete sub-sector' });
  }
});

// Sectors CRUD
router.post('/api/sectors', async (req, res) => {
  try {
    const { name, label_he, category, notes, conflict_alt_delta } = req.body;
    const result = await pool.query(
      'INSERT INTO sectors (name, label_he, category, notes, conflict_alt_delta) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, label_he, category || null, notes || null, conflict_alt_delta ?? 500]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating sector:', err);
    res.status(500).json({ error: 'Failed to create sector' });
  }
});

router.put('/api/sectors/:id', async (req, res) => {
  try {
    const { name, label_he, category, notes, conflict_alt_delta } = req.body;
    const result = await pool.query(
      'UPDATE sectors SET name = $1, label_he = $2, category = $3, notes = $4, conflict_alt_delta = $5 WHERE id = $6 RETURNING *',
      [name, label_he, category || null, notes || null, conflict_alt_delta ?? 500, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sector not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating sector:', err);
    res.status(500).json({ error: 'Failed to update sector' });
  }
});

router.delete('/api/sectors/:id', async (req, res) => {
  try {
    const sectorId = req.params.id;
    await pool.query('UPDATE workstations SET sector_id = NULL WHERE sector_id = $1', [sectorId]);
    await pool.query('UPDATE strips SET sector_id = NULL WHERE sector_id = $1', [sectorId]);
    await pool.query('DELETE FROM strip_transfers WHERE from_sector_id = $1 OR to_sector_id = $1', [sectorId]);
    await pool.query('DELETE FROM sectors WHERE id = $1', [sectorId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting sector:', err);
    res.status(500).json({ error: 'Failed to delete sector' });
  }
});

// Update sector notes only
router.put('/api/sectors/:id/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await pool.query(
      'UPDATE sectors SET notes = $1 WHERE id = $2 RETURNING *',
      [notes || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sector not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating sector notes:', err);
    res.status(500).json({ error: 'Failed to update sector notes' });
  }
});

// Get workstations by sector
router.get('/api/sectors/:sectorId/workstations', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.sectorId);
    const result = await pool.query('SELECT * FROM workstation_presets ORDER BY name');
    const presets = result.rows
      .map(row => ({
        ...row,
        relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors :
          (typeof row.relevant_sectors === 'string' ? JSON.parse(row.relevant_sectors) : [])
      }))
      .filter(preset => preset.relevant_sectors.includes(sectorId));
    res.json(presets);
  } catch (err) {
    console.error('Error fetching workstations by sector:', err);
    res.status(500).json({ error: 'Failed to fetch workstations' });
  }
});

// PATCH — update only transfer-point alt ranges for a preset
router.patch('/api/workstation-presets/:id/transfer-point', async (req, res) => {
  try {
    const { sector_id, ranges, alt_min, alt_max, parity } = req.body;
    if (sector_id == null) return res.status(400).json({ error: 'sector_id required' });
    const { rows } = await pool.query('SELECT classic_transfer_points FROM workstation_presets WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    let pts = rows[0].classic_transfer_points || [];
    if (!Array.isArray(pts)) { try { pts = JSON.parse(pts); } catch { pts = []; } }
    const others = pts.filter((p) => Number(p.sector_id) !== Number(sector_id));
    const useRanges = ranges !== undefined;
    const isEmpty = useRanges ? !Array.isArray(ranges) || !ranges.length : (alt_min == null && alt_max == null && (!parity || parity === 'any'));
    const entryData = useRanges ? { sector_id: Number(sector_id), ranges } : { sector_id: Number(sector_id), alt_min: alt_min ?? null, alt_max: alt_max ?? null, parity: parity || 'any' };
    const next = isEmpty ? others : [...others, { ...pts.find(p => Number(p.sector_id) === Number(sector_id)) || {}, ...entryData }];
    await pool.query('UPDATE workstation_presets SET classic_transfer_points=$1 WHERE id=$2', [JSON.stringify(next), req.params.id]);
    res.json({ ok: true, classic_transfer_points: next });
  } catch (err) {
    console.error('Error updating transfer point config:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// GET — fetch alt ranges configured by partner presets for a given sector
router.get('/api/workstation-presets/partner-alt-ranges', async (req, res) => {
  try {
    const { sector_id, preset_ids } = req.query;
    if (!sector_id || !preset_ids) return res.json([]);
    const ids = String(preset_ids).split(',').map(Number).filter(Boolean);
    if (!ids.length) return res.json([]);
    const { rows } = await pool.query('SELECT id, name, classic_transfer_points FROM workstation_presets WHERE id = ANY($1)', [ids]);
    const result = rows.map(row => {
      let pts = row.classic_transfer_points || [];
      if (!Array.isArray(pts)) { try { pts = JSON.parse(pts); } catch { pts = []; } }
      const entry = pts.find(p => Number(p.sector_id) === Number(sector_id));
      const ranges = entry?.ranges?.length ? entry.ranges : (entry?.alt_min != null || entry?.alt_max != null ? [{ alt_min: entry.alt_min, alt_max: entry.alt_max, parity: entry.parity || 'any' }] : []);
      return { preset_id: row.id, preset_name: row.name, ranges };
    }).filter(r => r.ranges.length > 0);
    res.json(result);
  } catch (err) {
    console.error('Error fetching partner alt ranges:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/sectors/:id/neighbors', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const { neighborId } = req.body;
    await pool.query(
      'INSERT INTO sector_neighbors (sector_id, neighbor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [sectorId, neighborId]
    );
    await pool.query(
      'INSERT INTO sector_neighbors (sector_id, neighbor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [neighborId, sectorId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add neighbor' });
  }
});

export default router;
