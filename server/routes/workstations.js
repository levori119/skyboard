import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

// Helper: mirror directional partner relationships across other classic presets.
async function mirrorClassicPartnerLinks(savedPresetId, incomingIds, outgoingIds) {
  try {
    const meId = Number(savedPresetId);
    const inSet = new Set((Array.isArray(incomingIds) ? incomingIds : []).map(Number).filter(Number.isFinite));
    const outSet = new Set((Array.isArray(outgoingIds) ? outgoingIds : []).map(Number).filter(Number.isFinite));
    const others = await pool.query(
      `SELECT id, classic_incoming_partner_preset_ids, classic_outgoing_partner_preset_ids
       FROM workstation_presets
       WHERE preset_type = 'classic' AND id <> $1`,
      [meId]
    );
    for (const row of others.rows) {
      const oid = Number(row.id);
      const otherIn = new Set((Array.isArray(row.classic_incoming_partner_preset_ids) ? row.classic_incoming_partner_preset_ids : []).map(Number).filter(Number.isFinite));
      const otherOut = new Set((Array.isArray(row.classic_outgoing_partner_preset_ids) ? row.classic_outgoing_partner_preset_ids : []).map(Number).filter(Number.isFinite));
      const beforeIn = JSON.stringify([...otherIn].sort());
      const beforeOut = JSON.stringify([...otherOut].sort());
      if (outSet.has(oid)) otherIn.add(meId); else otherIn.delete(meId);
      if (inSet.has(oid)) otherOut.add(meId); else otherOut.delete(meId);
      const afterIn = JSON.stringify([...otherIn].sort());
      const afterOut = JSON.stringify([...otherOut].sort());
      if (afterIn !== beforeIn || afterOut !== beforeOut) {
        const otherLegacyUnion = Array.from(new Set([...otherIn, ...otherOut]));
        await pool.query(
          `UPDATE workstation_presets
           SET classic_incoming_partner_preset_ids = $1,
               classic_outgoing_partner_preset_ids = $2,
               classic_partner_preset_ids = $3
           WHERE id = $4`,
          [JSON.stringify([...otherIn]), JSON.stringify([...otherOut]), JSON.stringify(otherLegacyUnion), oid]
        );
      }
    }
  } catch (err) {
    console.error('Error mirroring classic partner links:', err);
  }
}

// Workstation Presets API
router.get('/api/workstation-presets', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM workstation_presets ORDER BY name');
    const presets = result.rows.map(row => ({
      ...row,
      relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors :
        (typeof row.relevant_sectors === 'string' ? JSON.parse(row.relevant_sectors) : [])
    }));
    res.json(presets);
  } catch (err) {
    console.error('Error fetching workstation presets:', err);
    res.status(500).json({ error: 'Failed to fetch workstation presets' });
  }
});

router.get('/api/workstation-presets/:id/config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM workstation_presets WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const row = result.rows[0];
    res.json({ ...row, relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : (typeof row.relevant_sectors === 'string' ? JSON.parse(row.relevant_sectors) : []) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch preset config' });
  }
});

router.post('/api/workstation-presets', async (req, res) => {
  try {
    const { name, map_id, relevant_sectors, table_mode_id, partial_load, full_load, filter_query, conflict_alt_delta, conflict_alt_rules, relevant_control_stations, vertical_time_based, display_mode, classic_strip_table_id, classic_strip_table_id_night, classic_receive_points, classic_transfer_points, preset_type, airfield_id, classic_partner_preset_ids, classic_incoming_partner_preset_ids, classic_outgoing_partner_preset_ids, show_serials, allow_view_switching, show_base_statuses, base_status_ids, preset_role, parent_base_id, can_update_pressure, datk_show_minutes, show_dashboard, can_update_mazaa, civilian_columns, use_map_zones, civilian_board_bg, dual_map_mode, map2_id, dual_map_layout, dual_map_split, suggest_alt_range, show_full_picture, blind_map_default, can_update_atis, can_update_notam, mazaa_update_base_id, fz_pin_display } = req.body;
    const dup = await pool.query('SELECT id FROM workstation_presets WHERE LOWER(name) = LOWER($1)', [name]);
    if (dup.rows.length) return res.status(409).json({ error: 'שם עמדה כבר קיים' });
    const incomingIds = Array.isArray(classic_incoming_partner_preset_ids) ? classic_incoming_partner_preset_ids : (Array.isArray(classic_partner_preset_ids) ? classic_partner_preset_ids : []);
    const outgoingIds = Array.isArray(classic_outgoing_partner_preset_ids) ? classic_outgoing_partner_preset_ids : (Array.isArray(classic_partner_preset_ids) ? classic_partner_preset_ids : []);
    const legacyUnion = Array.from(new Set([...(incomingIds || []), ...(outgoingIds || [])].map(Number).filter(Number.isFinite)));
    const result = await pool.query(
      `INSERT INTO workstation_presets (name, map_id, relevant_sectors, table_mode_id, partial_load, full_load, filter_query, conflict_alt_delta, conflict_alt_rules, relevant_control_stations, vertical_time_based, display_mode, classic_strip_table_id, classic_strip_table_id_night, classic_receive_points, classic_transfer_points, preset_type, airfield_id, classic_partner_preset_ids, classic_incoming_partner_preset_ids, classic_outgoing_partner_preset_ids, show_serials, allow_view_switching, show_base_statuses, base_status_ids, preset_role, parent_base_id, can_update_pressure, datk_show_minutes, show_dashboard, can_update_mazaa, civilian_columns, use_map_zones, civilian_board_bg, dual_map_mode, map2_id, dual_map_layout, dual_map_split, suggest_alt_range, show_full_picture, blind_map_default, can_update_atis, can_update_notam, mazaa_update_base_id, fz_pin_display)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45) RETURNING *`,
      [name, map_id, JSON.stringify(relevant_sectors || []), table_mode_id || null, partial_load ?? 3, full_load ?? 5, filter_query ? JSON.stringify(filter_query) : null, conflict_alt_delta ?? 500, JSON.stringify(conflict_alt_rules || []), relevant_control_stations ? JSON.stringify(relevant_control_stations) : null, vertical_time_based !== false, display_mode || 'complex', classic_strip_table_id || null, classic_strip_table_id_night || null, JSON.stringify(classic_receive_points || []), JSON.stringify(classic_transfer_points || []), preset_type || 'standard', airfield_id || null, JSON.stringify(legacyUnion), JSON.stringify(incomingIds || []), JSON.stringify(outgoingIds || []), show_serials !== false, allow_view_switching !== false, show_base_statuses === true, JSON.stringify(base_status_ids || []), preset_role || null, parent_base_id || null, can_update_pressure === true, datk_show_minutes != null ? parseInt(datk_show_minutes) : null, show_dashboard === true, can_update_mazaa === true, JSON.stringify(civilian_columns || []), use_map_zones === true, civilian_board_bg || '', dual_map_mode === true, map2_id || null, dual_map_layout || 'side-by-side', dual_map_split ?? 50, suggest_alt_range === true, show_full_picture === true, blind_map_default === true, can_update_atis === true, can_update_notam === true, mazaa_update_base_id || null, fz_pin_display || 'strip']
    );
    const row = result.rows[0];
    await mirrorClassicPartnerLinks(row.id, incomingIds, outgoingIds);
    res.json({ ...row, relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : JSON.parse(row.relevant_sectors || '[]') });
  } catch (err) {
    console.error('Error creating workstation preset:', err);
    res.status(500).json({ error: 'Failed to create workstation preset' });
  }
});

router.put('/api/workstation-presets/:id', async (req, res) => {
  try {
    const { name, map_id, relevant_sectors, table_mode_id, partial_load, full_load, filter_query, conflict_alt_delta, conflict_alt_rules, relevant_control_stations, block_table_ids, vertical_time_based, view_alt_min, view_alt_max, display_mode, classic_strip_table_id, classic_strip_table_id_night, classic_receive_points, classic_transfer_points, preset_type, airfield_id, classic_partner_preset_ids, classic_incoming_partner_preset_ids, classic_outgoing_partner_preset_ids, show_serials, allow_view_switching, show_base_statuses, base_status_ids, preset_role, parent_base_id, can_update_pressure, datk_show_minutes, show_dashboard, flight_zones_mode, can_update_mazaa, civilian_columns, use_map_zones, civilian_board_bg, dual_map_mode, map2_id, dual_map_layout, dual_map_split, suggest_alt_range, show_full_picture, blind_map_default, strip_window_id, can_update_atis, can_update_notam, mazaa_update_base_id, fz_pin_display, signal_catalog, map2_transfer_points } = req.body;
    const incomingIds = Array.isArray(classic_incoming_partner_preset_ids) ? classic_incoming_partner_preset_ids : (Array.isArray(classic_partner_preset_ids) ? classic_partner_preset_ids : []);
    const outgoingIds = Array.isArray(classic_outgoing_partner_preset_ids) ? classic_outgoing_partner_preset_ids : (Array.isArray(classic_partner_preset_ids) ? classic_partner_preset_ids : []);
    const legacyUnion = Array.from(new Set([...(incomingIds || []), ...(outgoingIds || [])].map(Number).filter(Number.isFinite)));
    const result = await pool.query(
      `UPDATE workstation_presets SET name = $1, map_id = $2, relevant_sectors = $3, table_mode_id = $4, partial_load = $5, full_load = $6, filter_query = $7, conflict_alt_delta = $8, relevant_control_stations = $9, block_table_ids = $10, vertical_time_based = $11, view_alt_min = $12, view_alt_max = $13, display_mode = $14, classic_strip_table_id = $15, classic_strip_table_id_night = $16, classic_receive_points = $17, classic_transfer_points = $18, preset_type = $19, airfield_id = $20, classic_partner_preset_ids = $21, classic_incoming_partner_preset_ids = $23, classic_outgoing_partner_preset_ids = $24, show_serials = $25, allow_view_switching = $26, show_base_statuses = $27, base_status_ids = $28, preset_role = $29, parent_base_id = $30, can_update_pressure = $31, datk_show_minutes = $32, show_dashboard = $33, flight_zones_mode = $34, can_update_mazaa = $35, civilian_columns = $36, use_map_zones = $37, civilian_board_bg = $38, dual_map_mode = $39, map2_id = $40, dual_map_layout = $41, dual_map_split = $42, suggest_alt_range = $43, show_full_picture = $44, blind_map_default = $46, strip_window_id = $45, conflict_alt_rules = $47, can_update_atis = $48, can_update_notam = $49, mazaa_update_base_id = $50, fz_pin_display = $51, signal_catalog = $52, map2_transfer_points = $53 WHERE id = $22 RETURNING *`,
      [name, map_id, JSON.stringify(relevant_sectors || []), table_mode_id || null, partial_load ?? 3, full_load ?? 5, filter_query ? JSON.stringify(filter_query) : null, conflict_alt_delta ?? 500, relevant_control_stations ? JSON.stringify(relevant_control_stations) : null, JSON.stringify(block_table_ids || []), vertical_time_based !== false, view_alt_min ?? null, view_alt_max ?? null, display_mode || 'complex', classic_strip_table_id || null, classic_strip_table_id_night || null, JSON.stringify(classic_receive_points || []), JSON.stringify(classic_transfer_points || []), preset_type || 'standard', airfield_id || null, JSON.stringify(legacyUnion), req.params.id, JSON.stringify(incomingIds || []), JSON.stringify(outgoingIds || []), show_serials !== false, allow_view_switching !== false, show_base_statuses === true, JSON.stringify(base_status_ids || []), preset_role || null, parent_base_id || null, can_update_pressure === true, datk_show_minutes != null ? parseInt(datk_show_minutes) : null, show_dashboard === true, flight_zones_mode === true, can_update_mazaa === true, JSON.stringify(civilian_columns || []), use_map_zones === true, civilian_board_bg || '', dual_map_mode === true, map2_id || null, dual_map_layout || 'side-by-side', dual_map_split ?? 50, suggest_alt_range === true, show_full_picture === true, strip_window_id ? Number(strip_window_id) : null, blind_map_default === true, JSON.stringify(conflict_alt_rules || []), can_update_atis === true, can_update_notam === true, mazaa_update_base_id || null, fz_pin_display || 'strip', JSON.stringify(signal_catalog || []), JSON.stringify(map2_transfer_points || [])]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    const row = result.rows[0];
    await mirrorClassicPartnerLinks(row.id, incomingIds, outgoingIds);
    res.json({ ...row, relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : JSON.parse(row.relevant_sectors || '[]') });
  } catch (err) {
    console.error('Error updating workstation preset:', err);
    res.status(500).json({ error: 'Failed to update workstation preset' });
  }
});

router.post('/api/workstation-presets/:id/duplicate', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM workstation_presets WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Preset not found' });
    const src = rows[0];
    const newName = `${src.name} העתק`;
    const result = await pool.query(
      `INSERT INTO workstation_presets (name, map_id, relevant_sectors, table_mode_id, partial_load, full_load, filter_query, conflict_alt_delta, relevant_control_stations, block_table_ids, vertical_time_based, view_alt_min, view_alt_max, display_mode, classic_strip_table_id, classic_strip_table_id_night, classic_receive_points, classic_transfer_points, preset_type, airfield_id, classic_partner_preset_ids, classic_incoming_partner_preset_ids, classic_outgoing_partner_preset_ids, show_serials, allow_view_switching, show_base_statuses, base_status_ids, preset_role, parent_base_id, can_update_pressure, datk_show_minutes, show_dashboard, can_update_atis, can_update_notam)
       SELECT $1, map_id, relevant_sectors, table_mode_id, partial_load, full_load, filter_query, conflict_alt_delta, relevant_control_stations, block_table_ids, vertical_time_based, view_alt_min, view_alt_max, display_mode, classic_strip_table_id, classic_strip_table_id_night, classic_receive_points, classic_transfer_points, preset_type, airfield_id, classic_partner_preset_ids, classic_incoming_partner_preset_ids, classic_outgoing_partner_preset_ids, show_serials, allow_view_switching, show_base_statuses, base_status_ids, preset_role, parent_base_id, can_update_pressure, datk_show_minutes, show_dashboard, can_update_atis, can_update_notam
       FROM workstation_presets WHERE id = $2 RETURNING *`,
      [newName, req.params.id]
    );
    const row = result.rows[0];
    res.json({ ...row, relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : JSON.parse(row.relevant_sectors || '[]') });
  } catch (err) {
    console.error('Error duplicating workstation preset:', err);
    res.status(500).json({ error: 'Failed to duplicate workstation preset' });
  }
});

router.delete('/api/workstation-presets/:id', async (req, res) => {
  try {
    await pool.query('UPDATE strips SET workstation_preset_id = NULL WHERE workstation_preset_id = $1', [req.params.id]);
    await pool.query('DELETE FROM workstation_presets WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting workstation preset:', err);
    res.status(500).json({ error: 'Failed to delete workstation preset' });
  }
});

router.patch('/api/workstation-presets/:id/thresholds', async (req, res) => {
  try {
    const { partial_load, full_load } = req.body;
    const { rows } = await pool.query(
      'UPDATE workstation_presets SET partial_load = $1, full_load = $2 WHERE id = $3 RETURNING id, partial_load, full_load',
      [partial_load ?? 3, full_load ?? 5, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating thresholds:', err);
    res.status(500).json({ error: 'Failed to update thresholds' });
  }
});

// GET — dashboard load counts per workstation preset
router.get('/api/dashboard/load', async (req, res) => {
  try {
    const ids = (req.query.preset_ids || '').toString().split(',').map(Number).filter(Boolean);
    if (!ids.length) return res.json({});
    const { rows } = await pool.query(`
      SELECT
        workstation_preset_id AS preset_id,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'active' AND on_map = true) AS on_map,
        COUNT(*) FILTER (WHERE status = 'active' AND in_table = true AND airborne = true) AS in_table_airborne,
        COUNT(*) FILTER (WHERE status = 'active' AND (ground_status IS NULL OR ground_status NOT IN ('takeoff'))) AS ground_active
      FROM strips WHERE workstation_preset_id = ANY($1)
      GROUP BY workstation_preset_id
    `, [ids]);
    const result = {};
    for (const r of rows) result[r.preset_id] = r;
    res.json(result);
  } catch (err) {
    console.error('Error fetching dashboard load:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard load' });
  }
});

// Get workstation preset waiting strips
router.get('/api/workstation-presets/:id/waiting-strips', async (req, res) => {
  try {
    const presetId = parseInt(req.params.id);
    const result = await pool.query(
      'SELECT * FROM strips WHERE workstation_preset_id = $1 AND (sector_id IS NULL OR on_map = false) ORDER BY id',
      [presetId]
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
      workstationPresetId: r.workstation_preset_id,
      x: r.x,
      y: r.y,
      onMap: r.on_map,
      airborne: r.airborne,
      notes: r.notes,
      erka: r.erka || '',
      koteret: r.koteret || '',
      mivtza: r.mivtza || '',
      tzevet_shilta: r.tzevet_shilta || '',
      ta_shilta: r.ta_shilta || '',
      block_space_id: r.block_space_id || null,
      block_deviation: r.block_deviation || false
    })));
  } catch (err) {
    console.error('Error fetching waiting strips:', err);
    res.status(500).json({ error: 'Failed to fetch waiting strips' });
  }
});

// Personal filters CRUD API
router.get('/api/workstation-personal-filters', async (req, res) => {
  try {
    const { preset_id, crew_member_id } = req.query;
    if (!preset_id || !crew_member_id) return res.json(null);
    const result = await pool.query(
      'SELECT filter_query FROM workstation_personal_filters WHERE preset_id = $1 AND crew_member_id = $2',
      [preset_id, crew_member_id]
    );
    res.json(result.rows[0] ? result.rows[0].filter_query : null);
  } catch (err) {
    console.error('Error fetching personal filter:', err);
    res.status(500).json({ error: 'Failed to fetch personal filter' });
  }
});

router.put('/api/workstation-personal-filters', async (req, res) => {
  try {
    const { preset_id, crew_member_id, filter_query } = req.body;
    if (!preset_id || !crew_member_id) return res.status(400).json({ error: 'preset_id and crew_member_id required' });
    if (filter_query === null || filter_query === undefined) {
      await pool.query(
        'DELETE FROM workstation_personal_filters WHERE preset_id = $1 AND crew_member_id = $2',
        [preset_id, crew_member_id]
      );
    } else {
      await pool.query(
        `INSERT INTO workstation_personal_filters (preset_id, crew_member_id, filter_query)
         VALUES ($1, $2, $3)
         ON CONFLICT (preset_id, crew_member_id) DO UPDATE SET filter_query = $3, updated_at = CURRENT_TIMESTAMP`,
        [preset_id, crew_member_id, JSON.stringify(filter_query)]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving personal filter:', err);
    res.status(500).json({ error: 'Failed to save personal filter' });
  }
});

// Get strips for a workstation
router.get('/api/workstations/:presetId/strips', async (req, res) => {
  try {
    const presetId = parseInt(req.params.presetId);

    const presetResult = await pool.query('SELECT relevant_sectors FROM workstation_presets WHERE id = $1', [presetId]);
    if (presetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workstation preset not found' });
    }

    let relevantSectors = presetResult.rows[0].relevant_sectors;
    if (typeof relevantSectors === 'string') {
      relevantSectors = JSON.parse(relevantSectors);
    }
    if (!Array.isArray(relevantSectors)) {
      relevantSectors = [];
    }

    const wsResult = await pool.query(
      'SELECT id FROM workstations WHERE name = (SELECT name FROM workstation_presets WHERE id = $1)',
      [presetId]
    );
    const workstationUuid = wsResult.rows.length > 0 ? wsResult.rows[0].id : null;

    let result;
    if (relevantSectors.length > 0) {
      result = await pool.query(`
        SELECT * FROM strips
        WHERE
          workstation_preset_id = $4
          OR (
            sector_id = ANY($1::int[])
            AND (held_by_workstation IS NULL
                 OR held_by_workstation = $2
                 OR held_by_workstation = $3)
          )
        ORDER BY id
      `, [relevantSectors, workstationUuid, String(presetId), presetId]);
    } else {
      result = await pool.query(
        'SELECT * FROM strips WHERE workstation_preset_id = $1 ORDER BY id',
        [presetId]
      );
    }

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
      workstation_preset_id: r.workstation_preset_id,
      custom_fields: r.custom_fields || {},
      takeoff_time: r.takeoff_time || null,
      inTable: r.in_table || false,
      erka: r.erka || '',
      koteret: r.koteret || '',
      mivtza: r.mivtza || '',
      tzevet_shilta: r.tzevet_shilta || '',
      ta_shilta: r.ta_shilta || '',
      block_space_id: r.block_space_id || null,
      block_deviation: r.block_deviation || false,
      aircraft_positions: Array.isArray(r.aircraft_positions) ? r.aircraft_positions : (r.aircraft_positions ? (() => { try { return JSON.parse(r.aircraft_positions); } catch { return []; } })() : []),
      ground_status: r.ground_status || 'none',
      parent_strip_id: r.parent_strip_id || null,
      aircraft_indices: Array.isArray(r.aircraft_indices) ? r.aircraft_indices : (r.aircraft_indices ? (() => { try { return JSON.parse(r.aircraft_indices); } catch { return null; } })() : null),
      original_formation_count: r.original_formation_count || null,
      map_lat: r.map_lat ?? null,
      map_lon: r.map_lon ?? null
    })));
  } catch (err) {
    console.error('Error fetching workstation strips:', err);
    res.status(500).json({ error: 'Failed to fetch workstation strips' });
  }
});

// Get all workstation peers (other workstations in same work groups) for a preset
router.get('/api/workstations/:presetId/work-group-peers', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT wp.id, wp.name,
        ARRAY_AGG(DISTINCT wg.name ORDER BY wg.name) as groups
      FROM work_group_members wgm1
      JOIN work_group_members wgm2 ON wgm1.work_group_id = wgm2.work_group_id
      JOIN workstation_presets wp ON wp.id = wgm2.preset_id
      JOIN work_groups wg ON wg.id = wgm1.work_group_id
      WHERE wgm1.preset_id = $1
      GROUP BY wp.id, wp.name
      ORDER BY wp.name
    `, [req.params.presetId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch peers' });
  }
});

export default router;
