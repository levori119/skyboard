import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

router.get('/api/strips', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM strips ORDER BY id');
    res.json(result.rows.map(r => ({
      id: 's' + r.id,
      callSign: r.callsign,
      numberOfFormation: r.number_of_formation || null,
      sq: r.sq,
      alt: r.alt,
      task: r.task,
      squadron: r.squadron,
      x: r.x,
      y: r.y,
      onMap: r.on_map,
      airborne: r.airborne,
      notes: r.notes,
      erka: r.erka || '',
      koteret: r.koteret || '',
      mivtza: r.mivtza || '',
      tzevet_shilta: r.tzevet_shilta || '',
      ta_shilta: r.ta_shilta || ''
    })));
  } catch (err) {
    console.error('Error fetching strips:', err);
    res.status(500).json({ error: 'Failed to fetch strips' });
  }
});

router.get('/api/strips/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM strips ORDER BY id');
    res.json(result.rows.map(r => ({
      id: 's' + r.id,
      call_sign: r.callsign,
      number_of_formation: r.number_of_formation || null,
      sq: r.sq,
      alt: r.alt,
      task: r.task,
      squadron: r.squadron,
      sector_id: r.sector_id,
      workstation_preset_id: r.workstation_preset_id,
      x: r.x,
      y: r.y,
      on_map: r.on_map,
      airborne: r.airborne,
      weapons: r.weapons || [],
      targets: r.targets || [],
      systems: r.systems || [],
      shkadia: r.shkadia || '',
      takeoff_time: r.takeoff_time || null,
      erka: r.erka || '',
      koteret: r.koteret || '',
      mivtza: r.mivtza || '',
      tzevet_shilta: r.tzevet_shilta || '',
      ta_shilta: r.ta_shilta || '',
      block_space_id: r.block_space_id || null,
      block_deviation: r.block_deviation || false,
      takeoff_airfield_id: r.takeoff_airfield_id || null,
      landing_airfield_id: r.landing_airfield_id || null
    })));
  } catch (err) {
    console.error('Error fetching all strips:', err);
    res.status(500).json({ error: 'Failed to fetch strips' });
  }
});

router.get('/api/strips/global', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*,
        (SELECT name FROM workstation_presets WHERE id = s.workstation_preset_id) AS workstation_preset_name,
        COALESCE(
          array_agg(sta.preset_id ORDER BY sta.preset_id) FILTER (WHERE sta.preset_id IS NOT NULL),
          '{}'::integer[]
        ) AS table_preset_ids
      FROM strips s
      LEFT JOIN strip_table_assignments sta ON sta.strip_id = s.id
      GROUP BY s.id
      ORDER BY s.id
    `);
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
      takeoff_airfield_id: r.takeoff_airfield_id || null,
      landing_airfield_id: r.landing_airfield_id || null,
      map_lat: r.map_lat ?? null,
      map_lon: r.map_lon ?? null,
      table_preset_ids: Array.isArray(r.table_preset_ids) ? r.table_preset_ids.map(Number) : [],
      creator_preset_id: r.creator_preset_id ?? null,
      creator_preset_name: r.creator_preset_name ?? null,
      workstation_preset_name: r.workstation_preset_name ?? null,
    })));
  } catch (err) {
    console.error('Error fetching global strips:', err);
    res.status(500).json({ error: 'Failed to fetch strips' });
  }
});

router.post('/api/strips/:id/assign', async (req, res) => {
  try {
    const id = parseInt(req.params.id.replace('s', ''));
    const { sectorId } = req.body;
    await pool.query('UPDATE strips SET sector_id = $1 WHERE id = $2', [sectorId, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error assigning strip:', err);
    res.status(500).json({ error: 'Failed to assign strip' });
  }
});

// Accept a queued (distributed) strip — moves it from receive panel to mine panel
router.post('/api/strips/:id/accept-queued', async (req, res) => {
  try {
    const id = parseInt(req.params.id.replace('s', ''));
    await pool.query("UPDATE strips SET status = NULL, in_table = true WHERE id = $1 AND status = 'queued'", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error accepting queued strip:', err);
    res.status(500).json({ error: 'Failed to accept strip' });
  }
});

// Per-strip override of the map pin display style ('icon' | 'strip' | null = default)
router.patch('/api/strips/:id/pin-display', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id).replace('s', ''));
    let { pin_display } = req.body;
    if (pin_display !== 'icon' && pin_display !== 'strip') pin_display = null;
    const r = await pool.query('UPDATE strips SET pin_display = $1 WHERE id = $2 RETURNING id, pin_display', [pin_display, id]);
    res.json(r.rows[0] || { id, pin_display });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/strips/:id/assign-workstation', async (req, res) => {
  try {
    const id = parseInt(req.params.id.replace('s', ''));
    const { workstationPresetId } = req.body;
    if (workstationPresetId !== null) {
      await pool.query(
        'UPDATE strips SET workstation_preset_id = $1, status = $2, on_map = $3, held_by_workstation = $4, in_table = false WHERE id = $5',
        [workstationPresetId, 'queued', false, null, id]
      );
    } else {
      await pool.query('UPDATE strips SET workstation_preset_id = NULL WHERE id = $1', [id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error assigning strip to workstation:', err);
    res.status(500).json({ error: 'Failed to assign strip to workstation' });
  }
});

router.post('/api/strips', async (req, res) => {
  try {
    const {
      callSign, sq, alt, task, squadron, sectorId, takeoff_time, numberOfFormation,
      erka, koteret, mivtza, tzevet_shilta, ta_shilta, block_space_id, workstation_preset_id,
      manual_entry, creator_crew_id, creator_crew_name, creator_preset_name, force_duplicate
    } = req.body;

    const isManual = manual_entry === true || manual_entry === 'true';

    // Duplicate check for manual entries (same callsign today, unless forced)
    if (isManual && callSign && !force_duplicate) {
      const dup = await pool.query(
        `SELECT id FROM strips WHERE LOWER(callsign) = LOWER($1) AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE AND manual_entry = TRUE LIMIT 1`,
        [callSign.trim()]
      );
      if (dup.rowCount > 0) {
        return res.json({ duplicate: true, message: `פ"מ עם או"ק "${callSign.trim()}" כבר קיים היום` });
      }
    }

    const expiresAt = isManual ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
    const presetId = workstation_preset_id ? parseInt(workstation_preset_id) : null;

    // Manual entries with a preset go straight into that workstation's table
    const inTable = isManual && presetId ? true : false;

    const result = await pool.query(
      `INSERT INTO strips
        (callsign, sq, alt, task, squadron, sector_id, takeoff_time, number_of_formation,
         erka, koteret, mivtza, tzevet_shilta, ta_shilta, block_space_id, workstation_preset_id, creator_preset_id,
         in_table, manual_entry, creator_crew_id, creator_crew_name, creator_preset_name, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id`,
      [
        callSign, sq, alt, task, squadron, sectorId || null,
        takeoff_time || null, numberOfFormation || null,
        erka || null, koteret || null, mivtza || null,
        tzevet_shilta || null, ta_shilta || null,
        block_space_id ? parseInt(block_space_id) : null,
        presetId,
        inTable,
        isManual,
        creator_crew_id ? parseInt(creator_crew_id) : null,
        creator_crew_name || null,
        creator_preset_name || null,
        expiresAt
      ]
    );
    res.json({ success: true, id: 's' + result.rows[0].id });
  } catch (err) {
    console.error('Error creating strip:', err);
    res.status(500).json({ error: 'Failed to create strip' });
  }
});

// PUT /api/strips/update-takeoff-to-today — keep HH:MM but set date to today
router.put('/api/strips/update-takeoff-to-today', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE strips
       SET takeoff_time = (CURRENT_DATE::timestamp + (takeoff_time AT TIME ZONE 'UTC')::time) AT TIME ZONE 'UTC'
       WHERE takeoff_time IS NOT NULL
       RETURNING id`
    );
    res.json({ updated: result.rowCount });
  } catch (err) {
    console.error('[update-takeoff-to-today]', err);
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/strips/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id.replace('s', ''));
    const { x, y, onMap, alt, notes, weapons, targets, systems, shkadia } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (x !== undefined) { updates.push(`x = $${paramIndex++}`); values.push(x); }
    if (y !== undefined) { updates.push(`y = $${paramIndex++}`); values.push(y); }
    if (onMap !== undefined) { updates.push(`on_map = $${paramIndex++}`); values.push(onMap); }
    if (alt !== undefined) { updates.push(`alt = $${paramIndex++}`); values.push(alt); }
    if (req.body.airborne !== undefined) { updates.push(`airborne = $${paramIndex++}`); values.push(req.body.airborne); }
    if (notes !== undefined) { updates.push(`notes = $${paramIndex++}`); values.push(notes); }
    if (weapons !== undefined) { updates.push(`weapons = $${paramIndex++}`); values.push(JSON.stringify(weapons)); }
    if (targets !== undefined) { updates.push(`targets = $${paramIndex++}`); values.push(JSON.stringify(targets)); }
    if (systems !== undefined) { updates.push(`systems = $${paramIndex++}`); values.push(JSON.stringify(systems)); }
    if (shkadia !== undefined) { updates.push(`shkadia = $${paramIndex++}`); values.push(shkadia); }
    if (req.body.custom_fields !== undefined) { updates.push(`custom_fields = $${paramIndex++}`); values.push(JSON.stringify(req.body.custom_fields)); }
    if (req.body.takeoff_time !== undefined) { updates.push(`takeoff_time = $${paramIndex++}`); values.push(req.body.takeoff_time || null); }
    if (req.body.sq !== undefined) { updates.push(`sq = $${paramIndex++}`); values.push(req.body.sq); }
    if (req.body.numberOfFormation !== undefined) { updates.push(`number_of_formation = $${paramIndex++}`); values.push(req.body.numberOfFormation || null); }
    if (req.body.number_of_formation !== undefined) { updates.push(`number_of_formation = $${paramIndex++}`); values.push(req.body.number_of_formation || null); }
    if (req.body.erka !== undefined) { updates.push(`erka = $${paramIndex++}`); values.push(req.body.erka || null); }
    if (req.body.koteret !== undefined) { updates.push(`koteret = $${paramIndex++}`); values.push(req.body.koteret || null); }
    if (req.body.mivtza !== undefined) { updates.push(`mivtza = $${paramIndex++}`); values.push(req.body.mivtza || null); }
    if (req.body.tzevet_shilta !== undefined) { updates.push(`tzevet_shilta = $${paramIndex++}`); values.push(req.body.tzevet_shilta || null); }
    if (req.body.ta_shilta !== undefined) { updates.push(`ta_shilta = $${paramIndex++}`); values.push(req.body.ta_shilta || null); }
    if (req.body.block_space_id !== undefined) { updates.push(`block_space_id = $${paramIndex++}`); values.push(req.body.block_space_id ? parseInt(req.body.block_space_id) : null); }
    if (req.body.block_deviation !== undefined) { updates.push(`block_deviation = $${paramIndex++}`); values.push(!!req.body.block_deviation); }
    if (req.body.callSign !== undefined) { updates.push(`callsign = $${paramIndex++}`); values.push(req.body.callSign); }
    if (req.body.callsign !== undefined && req.body.callSign === undefined) { updates.push(`callsign = $${paramIndex++}`); values.push(req.body.callsign); }
    if (req.body.task !== undefined) { updates.push(`task = $${paramIndex++}`); values.push(req.body.task); }
    if (req.body.workstation_preset_id !== undefined) { updates.push(`workstation_preset_id = $${paramIndex++}`); values.push(req.body.workstation_preset_id ? parseInt(req.body.workstation_preset_id) : null); }
    if (req.body.sid !== undefined) { updates.push(`sid = $${paramIndex++}`); values.push(req.body.sid || null); }
    if (req.body.star !== undefined) { updates.push(`star = $${paramIndex++}`); values.push(req.body.star || null); }
    if (req.body.departure_base_id !== undefined) { updates.push(`departure_base_id = $${paramIndex++}`); values.push(req.body.departure_base_id ? parseInt(req.body.departure_base_id) : null); }
    if (req.body.landing_base_id !== undefined) { updates.push(`landing_base_id = $${paramIndex++}`); values.push(req.body.landing_base_id ? parseInt(req.body.landing_base_id) : null); }
    if (req.body.takeoff_airfield_id !== undefined) { updates.push(`takeoff_airfield_id = $${paramIndex++}`); values.push(req.body.takeoff_airfield_id ? parseInt(req.body.takeoff_airfield_id) : null); }
    if (req.body.landing_airfield_id !== undefined) { updates.push(`landing_airfield_id = $${paramIndex++}`); values.push(req.body.landing_airfield_id ? parseInt(req.body.landing_airfield_id) : null); }
    if (req.body.civ_status !== undefined) { updates.push(`civ_status = $${paramIndex++}`); values.push(req.body.civ_status); }
    if (req.body.civ_stand !== undefined) { updates.push(`civ_stand = $${paramIndex++}`); values.push(req.body.civ_stand); }
    if (req.body.civ_dest !== undefined) { updates.push(`civ_dest = $${paramIndex++}`); values.push(req.body.civ_dest); }
    if (req.body.civ_ssr !== undefined) { updates.push(`civ_ssr = $${paramIndex++}`); values.push(req.body.civ_ssr); }
    if (req.body.civ_fl !== undefined) { updates.push(`civ_fl = $${paramIndex++}`); values.push(req.body.civ_fl); }
    if (req.body.civ_route !== undefined) { updates.push(`civ_route = $${paramIndex++}`); values.push(req.body.civ_route); }
    if (req.body.civ_time !== undefined) { updates.push(`civ_time = $${paramIndex++}`); values.push(req.body.civ_time); }
    if (req.body.civ_runway !== undefined) { updates.push(`civ_runway = $${paramIndex++}`); values.push(req.body.civ_runway); }
    if (req.body.unit !== undefined) { updates.push(`unit = $${paramIndex++}`); values.push(req.body.unit); }
    if (req.body.map_zone_name !== undefined) { updates.push(`map_zone_name = $${paramIndex++}`); values.push(req.body.map_zone_name); }
    if (req.body.map_zone_alts !== undefined) { updates.push(`map_zone_alts = $${paramIndex++}`); values.push(req.body.map_zone_alts); }
    if (req.body.map_pin_x !== undefined) { updates.push(`map_pin_x = $${paramIndex++}`); values.push(req.body.map_pin_x !== null ? Number(req.body.map_pin_x) : null); }
    if (req.body.map_pin_y !== undefined) { updates.push(`map_pin_y = $${paramIndex++}`); values.push(req.body.map_pin_y !== null ? Number(req.body.map_pin_y) : null); }
    if (req.body.map_lat !== undefined) { updates.push(`map_lat = $${paramIndex++}`); values.push(req.body.map_lat !== null ? Number(req.body.map_lat) : null); }
    if (req.body.map_lon !== undefined) { updates.push(`map_lon = $${paramIndex++}`); values.push(req.body.map_lon !== null ? Number(req.body.map_lon) : null); }

    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE strips SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating strip:', err);
    res.status(500).json({ error: 'Failed to update strip' });
  }
});

router.delete('/api/strips/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id.replace('s', ''));
    await pool.query('DELETE FROM strips WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting strip:', err);
    res.status(500).json({ error: 'Failed to delete strip' });
  }
});

router.post('/api/strips/import', async (req, res) => {
  try {
    const { strips, creator_preset_id } = req.body;
    if (!Array.isArray(strips)) {
      return res.status(400).json({ error: 'Invalid strips data' });
    }

    const existingResult = await pool.query('SELECT id, callsign FROM strips');
    const existingMap = new Map(existingResult.rows.map(r => [r.callsign?.toLowerCase(), r.id]));

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    const unresolvedAirfields = new Set();

    for (const strip of strips) {
      if (!strip.callSign) {
        errors.push('Missing callSign');
        continue;
      }

      const existingId = existingMap.get(strip.callSign.toLowerCase());

      if (existingId) {
        // Build UPDATE for non-empty fields only
        const updateParts = [];
        const updateVals = [];
        let pi = 1;
        const addField = (col, val) => {
          if (val !== undefined && val !== null && val !== '') {
            updateParts.push(`${col} = $${pi++}`);
            updateVals.push(val);
          }
        };
        addField('sq', strip.sq);
        addField('squadron', strip.squadron);
        addField('alt', strip.alt);
        addField('task', strip.task);
        addField('number_of_formation', strip.numberOfFormation);
        addField('takeoff_time', strip.takeoff_time);
        addField('shkadia', strip.shkadia);
        addField('erka', strip.erka);
        addField('koteret', strip.koteret);
        addField('mivtza', strip.mivtza);
        addField('parent_callsign', strip.parent_callsign);
        if (strip.takeoff_airfield_id != null) { updateParts.push(`takeoff_airfield_id = $${pi++}`); updateVals.push(strip.takeoff_airfield_id || null); }
        if (strip.landing_airfield_id != null) { updateParts.push(`landing_airfield_id = $${pi++}`); updateVals.push(strip.landing_airfield_id || null); }
        if (strip.takeoff_airfield_name) {
          const tbRes = await pool.query('SELECT id FROM aviation_bases WHERE LOWER(name)=LOWER($1) OR LOWER(code)=LOWER($1) LIMIT 1', [strip.takeoff_airfield_name]);
          if (tbRes.rows.length > 0) { updateParts.push(`takeoff_airfield_id = $${pi++}`); updateVals.push(tbRes.rows[0].id); }
          else { unresolvedAirfields.add(strip.takeoff_airfield_name); }
        }
        if (strip.landing_airfield_name) {
          const lbRes = await pool.query('SELECT id FROM aviation_bases WHERE LOWER(name)=LOWER($1) OR LOWER(code)=LOWER($1) LIMIT 1', [strip.landing_airfield_name]);
          if (lbRes.rows.length > 0) { updateParts.push(`landing_airfield_id = $${pi++}`); updateVals.push(lbRes.rows[0].id); }
          else { unresolvedAirfields.add(strip.landing_airfield_name); }
        }
        if (strip.weapons && strip.weapons.length > 0) { updateParts.push(`weapons = $${pi++}`); updateVals.push(JSON.stringify(strip.weapons)); }
        if (strip.targets && strip.targets.length > 0) { updateParts.push(`targets = $${pi++}`); updateVals.push(JSON.stringify(strip.targets)); }
        if (strip.systems && strip.systems.length > 0) { updateParts.push(`systems = $${pi++}`); updateVals.push(JSON.stringify(strip.systems)); }

        if (updateParts.length === 0) {
          skipped++;
          continue;
        }
        try {
          updateVals.push(existingId);
          await pool.query(`UPDATE strips SET ${updateParts.join(', ')} WHERE id = $${pi}`, updateVals);
          updated++;
        } catch (err) {
          errors.push(`Failed to update ${strip.callSign}: ${err.message}`);
        }
      } else {
        try {
          await pool.query(
            'INSERT INTO strips (callsign, sq, squadron, alt, task, weapons, targets, systems, shkadia, takeoff_time, number_of_formation, erka, koteret, mivtza, tzevet_shilta, ta_shilta, parent_callsign, takeoff_airfield_id, landing_airfield_id, creator_preset_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)',
            [
              strip.callSign,
              strip.sq || '',
              strip.squadron || '',
              strip.alt || '',
              strip.task || '',
              JSON.stringify(strip.weapons || []),
              JSON.stringify(strip.targets || []),
              JSON.stringify(strip.systems || []),
              strip.shkadia || null,
              strip.takeoff_time || null,
              strip.numberOfFormation || null,
              strip.erka || null,
              strip.koteret || null,
              strip.mivtza || null,
              strip.tzevet_shilta || null,
              strip.ta_shilta || null,
              strip.parent_callsign || null,
              (() => { if (strip.takeoff_airfield_id) return strip.takeoff_airfield_id; return null; })(),
              (() => { if (strip.landing_airfield_id) return strip.landing_airfield_id; return null; })(),
              creator_preset_id || null
            ]
          );
          // Resolve airfield names for newly inserted strips
          if (strip.takeoff_airfield_name || strip.landing_airfield_name) {
            const updateAirfieldParts = [], updateAirfieldVals = [];
            let api = 1;
            if (strip.takeoff_airfield_name) {
              const tbRes = await pool.query('SELECT id FROM aviation_bases WHERE LOWER(name)=LOWER($1) OR LOWER(code)=LOWER($1) LIMIT 1', [strip.takeoff_airfield_name]);
              if (tbRes.rows.length > 0) { updateAirfieldParts.push(`takeoff_airfield_id = $${api++}`); updateAirfieldVals.push(tbRes.rows[0].id); }
              else { unresolvedAirfields.add(strip.takeoff_airfield_name); }
            }
            if (strip.landing_airfield_name) {
              const lbRes = await pool.query('SELECT id FROM aviation_bases WHERE LOWER(name)=LOWER($1) OR LOWER(code)=LOWER($1) LIMIT 1', [strip.landing_airfield_name]);
              if (lbRes.rows.length > 0) { updateAirfieldParts.push(`landing_airfield_id = $${api++}`); updateAirfieldVals.push(lbRes.rows[0].id); }
              else { unresolvedAirfields.add(strip.landing_airfield_name); }
            }
            if (updateAirfieldParts.length > 0) {
              updateAirfieldVals.push(strip.callSign.toLowerCase());
              await pool.query(`UPDATE strips SET ${updateAirfieldParts.join(', ')} WHERE LOWER(callsign) = $${api}`, updateAirfieldVals);
            }
          }
          existingMap.set(strip.callSign.toLowerCase(), true);
          imported++;
        } catch (err) {
          errors.push(`Failed to import ${strip.callSign}: ${err.message}`);
        }
      }
    }

    res.json({ imported, updated, skipped, errors, unresolvedAirfields: [...unresolvedAirfields] });
  } catch (err) {
    console.error('Error importing strips:', err);
    res.status(500).json({ error: 'Failed to import strips' });
  }
});

// POST /api/strip-aircraft/ensure-all — create randomized aircraft for every strip that has number_of_formation
router.post('/api/strip-aircraft/ensure-all', async (req, res) => {
  try {
    const { randomize } = req.body;
    const strips = await pool.query(
      `SELECT id, number_of_formation FROM strips WHERE number_of_formation IS NOT NULL AND number_of_formation != ''`
    );
    let totalAircraft = 0;
    for (const strip of strips.rows) {
      const n = Math.max(1, Math.min(parseInt(strip.number_of_formation) || 0, 16));
      if (!n) continue;
      for (let i = 1; i <= n; i++) {
        if (randomize) {
          const datk = Math.floor(Math.random() * 4) + 1;
          const kipa = String(Math.floor(Math.random() * 8) + 1);
          await pool.query(
            `INSERT INTO strip_aircraft (strip_id, idx, datk, kipa) VALUES ($1, $2, $3, $4)
             ON CONFLICT (strip_id, idx) DO UPDATE SET datk=EXCLUDED.datk, kipa=EXCLUDED.kipa`,
            [strip.id, i, datk, kipa]
          );
        } else {
          await pool.query(
            `INSERT INTO strip_aircraft (strip_id, idx) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [strip.id, i]
          );
        }
        totalAircraft++;
      }
    }
    res.json({ strips: strips.rowCount, aircraft: totalAircraft });
  } catch (err) {
    console.error('[ensure-all]', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET strip_aircraft for multiple strips
router.get('/api/strip-aircraft', async (req, res) => {
  try {
    const ids = String(req.query.strip_ids || '').split(',').map(s => parseInt(s.replace(/^s/, ''))).filter(n => !isNaN(n) && n > 0);
    if (ids.length === 0) return res.json([]);
    const result = await pool.query(
      `SELECT * FROM strip_aircraft WHERE strip_id = ANY($1) ORDER BY strip_id, idx`,
      [ids]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get strip aircraft' });
  }
});

// PUT single aircraft row datk/kipa
router.put('/api/strip-aircraft/:stripId/:idx', async (req, res) => {
  try {
    const stripId = parseInt(req.params.stripId.replace(/^s/, ''));
    const idx = parseInt(req.params.idx);
    if (isNaN(stripId) || isNaN(idx) || idx < 1) {
      return res.status(400).json({ error: 'Invalid stripId or idx' });
    }
    const { datk, kipa } = req.body;
    await pool.query(
      `INSERT INTO strip_aircraft (strip_id, idx, datk, kipa)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (strip_id, idx) DO UPDATE SET datk = EXCLUDED.datk, kipa = EXCLUDED.kipa`,
      [stripId, idx, datk ?? null, kipa ?? null]
    );
    const result = await pool.query('SELECT * FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [stripId, idx]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update strip aircraft' });
  }
});

// POST ensure strip_aircraft rows exist for a strip (idempotent)
router.post('/api/strip-aircraft/ensure/:stripId', async (req, res) => {
  try {
    const stripId = parseInt(req.params.stripId.replace(/^s/, ''));
    const { count, randomize } = req.body;
    const n = Math.max(1, Math.min(parseInt(count) || 1, 16));
    for (let i = 1; i <= n; i++) {
      if (randomize) {
        const datk = Math.floor(Math.random() * 4) + 1;
        const kipa = String(Math.floor(Math.random() * 8) + 1);
        await pool.query(
          `INSERT INTO strip_aircraft (strip_id, idx, datk, kipa) VALUES ($1, $2, $3, $4)
           ON CONFLICT (strip_id, idx) DO UPDATE SET datk=EXCLUDED.datk, kipa=EXCLUDED.kipa`,
          [stripId, i, datk, kipa]
        );
      } else {
        await pool.query(
          `INSERT INTO strip_aircraft (strip_id, idx) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [stripId, i]
        );
      }
    }
    const result = await pool.query('SELECT * FROM strip_aircraft WHERE strip_id=$1 ORDER BY idx', [stripId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to ensure strip aircraft' });
  }
});

// POST /api/strip-aircraft/bulk-import
router.post('/api/strip-aircraft/bulk-import', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows provided' });
    let imported = 0, skipped = 0;
    const errors = [];
    for (const row of rows) {
      const callsign = String(row.formation_callsign || row.callsign || '').trim();
      const idx = parseInt(row.idx);
      const datk = (row.datk !== undefined && row.datk !== '') ? parseInt(row.datk) : null;
      const kipa = (row.kipa !== undefined && String(row.kipa).trim() !== '') ? String(row.kipa).trim() : null;
      if (!callsign || isNaN(idx) || idx < 1) { skipped++; continue; }
      const stripResult = await pool.query('SELECT id FROM strips WHERE LOWER(callsign) = LOWER($1) LIMIT 1', [callsign]);
      if (stripResult.rows.length === 0) { errors.push(`פ"מ "${callsign}" לא נמצא`); skipped++; continue; }
      const strip_id = stripResult.rows[0].id;
      await pool.query(
        `INSERT INTO strip_aircraft (strip_id, idx, datk, kipa) VALUES ($1, $2, $3, $4)
         ON CONFLICT (strip_id, idx) DO UPDATE SET datk=EXCLUDED.datk, kipa=EXCLUDED.kipa`,
        [strip_id, idx, isNaN(datk) ? null : datk, kipa]
      );
      const saRes = await pool.query('SELECT id FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [strip_id, idx]);
      const sa_id = saRes.rows[0]?.id;
      if (sa_id) {
        if (Array.isArray(row.armaments) && row.armaments.length > 0) {
          await pool.query('DELETE FROM strip_aircraft_armaments WHERE strip_aircraft_id=$1', [sa_id]);
          for (const arm of row.armaments) {
            if (arm.name) await pool.query(
              'INSERT INTO strip_aircraft_armaments (strip_aircraft_id, armament_name, quantity) VALUES ($1,$2,$3)',
              [sa_id, String(arm.name).trim(), parseInt(arm.quantity) || 1]
            );
          }
        }
        if (Array.isArray(row.systems) && row.systems.length > 0) {
          await pool.query('DELETE FROM strip_aircraft_systems WHERE strip_aircraft_id=$1', [sa_id]);
          for (const sys of row.systems) {
            if (sys.name) await pool.query(
              'INSERT INTO strip_aircraft_systems (strip_aircraft_id, system_name, status) VALUES ($1,$2,$3)',
              [sa_id, String(sys.name).trim(), String(sys.status || 'שמיש').trim()]
            );
          }
        }
      }
      imported++;
    }
    res.json({ imported, skipped, errors });
  } catch (err) {
    console.error('[bulk-import aircraft]', err);
    res.status(500).json({ error: String(err) });
  }
});

// DELETE single aircraft from a strip
router.delete('/api/strip-aircraft/:stripId/:idx', async (req, res) => {
  try {
    const stripId = parseInt(req.params.stripId.replace(/^s/, ''));
    const idx = parseInt(req.params.idx);
    if (isNaN(stripId) || isNaN(idx) || idx < 1) {
      return res.status(400).json({ error: 'Invalid stripId or idx' });
    }

    await pool.query('DELETE FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [stripId, idx]);
    await pool.query(
      'UPDATE strip_aircraft SET idx = idx - 1 WHERE strip_id=$1 AND idx > $2',
      [stripId, idx]
    );

    const updated = await pool.query(
      `UPDATE strips SET
        aircraft_positions = (
          SELECT COALESCE(
            jsonb_agg(
              CASE WHEN (elem->>'idx')::int > $2
                THEN jsonb_set(elem, '{idx}', to_jsonb((elem->>'idx')::int - 1))
                ELSE elem
              END
              ORDER BY (elem->>'idx')::int
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements(COALESCE(aircraft_positions, '[]'::jsonb)) elem
          WHERE (elem->>'idx')::int != $2
        ),
        number_of_formation = GREATEST(0, COALESCE(number_of_formation::int, 1) - 1)::text
       WHERE id=$1
       RETURNING id, number_of_formation, aircraft_positions`,
      [stripId, idx]
    );
    const row = updated.rows[0];
    res.json({
      id: row.id,
      numberOfFormation: parseInt(row.number_of_formation || '0') || 0,
      aircraftPositions: row.aircraft_positions || []
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove aircraft' });
  }
});

// ─── Strip Aircraft Armaments API ─────────────────────────────────────────
router.get('/api/strip-aircraft-armaments', async (req, res) => {
  try {
    const { aircraft_id } = req.query;
    if (!aircraft_id) return res.json([]);
    const { rows } = await pool.query(
      'SELECT * FROM strip_aircraft_armaments WHERE strip_aircraft_id=$1 ORDER BY id',
      [aircraft_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch armaments' }); }
});

router.get('/api/strip-aircraft-armaments/bulk', async (req, res) => {
  try {
    const ids = String(req.query.aircraft_ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) return res.json([]);
    const { rows } = await pool.query(
      'SELECT * FROM strip_aircraft_armaments WHERE strip_aircraft_id = ANY($1) ORDER BY strip_aircraft_id, id',
      [ids]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch armaments' }); }
});

router.post('/api/strip-aircraft-armaments', async (req, res) => {
  try {
    const { strip_aircraft_id, armament_name, quantity } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO strip_aircraft_armaments (strip_aircraft_id, armament_name, quantity) VALUES ($1,$2,$3) RETURNING *',
      [strip_aircraft_id, armament_name || '', quantity || 1]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to add armament' }); }
});

router.put('/api/strip-aircraft-armaments/:id', async (req, res) => {
  try {
    const { armament_name, quantity } = req.body;
    const { rows } = await pool.query(
      'UPDATE strip_aircraft_armaments SET armament_name=$1, quantity=$2 WHERE id=$3 RETURNING *',
      [armament_name || '', quantity || 1, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update armament' }); }
});

router.delete('/api/strip-aircraft-armaments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_aircraft_armaments WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete armament' }); }
});

// ─── Strip Aircraft Systems API ────────────────────────────────────────────
router.get('/api/strip-aircraft-systems', async (req, res) => {
  try {
    const { aircraft_id } = req.query;
    if (!aircraft_id) return res.json([]);
    const { rows } = await pool.query(
      'SELECT * FROM strip_aircraft_systems WHERE strip_aircraft_id=$1 ORDER BY id',
      [aircraft_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch systems' }); }
});

router.get('/api/strip-aircraft-systems/bulk', async (req, res) => {
  try {
    const ids = String(req.query.aircraft_ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) return res.json([]);
    const { rows } = await pool.query(
      'SELECT * FROM strip_aircraft_systems WHERE strip_aircraft_id = ANY($1) ORDER BY strip_aircraft_id, id',
      [ids]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch systems' }); }
});

router.post('/api/strip-aircraft-systems', async (req, res) => {
  try {
    const { strip_aircraft_id, system_name, status } = req.body;
    const { rows } = await pool.query(
      "INSERT INTO strip_aircraft_systems (strip_aircraft_id, system_name, status) VALUES ($1,$2,$3) RETURNING *",
      [strip_aircraft_id, system_name || '', status || 'שמיש']
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to add system' }); }
});

router.put('/api/strip-aircraft-systems/:id', async (req, res) => {
  try {
    const { system_name, status } = req.body;
    const { rows } = await pool.query(
      'UPDATE strip_aircraft_systems SET system_name=$1, status=$2 WHERE id=$3 RETURNING *',
      [system_name || '', status || 'שמיש', req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update system' }); }
});

router.delete('/api/strip-aircraft-systems/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_aircraft_systems WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete system' }); }
});

// ─── Default Armament Names ────────────────────────────────────────────────
router.get('/api/default-armament-names', async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM default_armament_names ORDER BY sort_order, name'); res.json(rows); }
  catch (err) { res.status(500).json({ error: 'Failed to fetch default armament names' }); }
});
router.post('/api/default-armament-names', async (req, res) => {
  try { const { name } = req.body; const { rows } = await pool.query('INSERT INTO default_armament_names (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *', [name || '']); res.json(rows[0] || {}); }
  catch (err) { res.status(500).json({ error: 'Failed to add armament name' }); }
});
router.put('/api/default-armament-names/:id', async (req, res) => {
  try { const { name, sort_order } = req.body; const { rows } = await pool.query('UPDATE default_armament_names SET name=$1, sort_order=$2 WHERE id=$3 RETURNING *', [name || '', sort_order ?? 0, req.params.id]); res.json(rows[0]); }
  catch (err) { res.status(500).json({ error: 'Failed to update armament name' }); }
});
router.delete('/api/default-armament-names/:id', async (req, res) => {
  try { await pool.query('DELETE FROM default_armament_names WHERE id=$1', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: 'Failed to delete armament name' }); }
});

// ─── Default System Names ─────────────────────────────────────────────────
router.get('/api/default-system-names', async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM default_system_names ORDER BY sort_order, name'); res.json(rows); }
  catch (err) { res.status(500).json({ error: 'Failed to fetch default system names' }); }
});
router.post('/api/default-system-names', async (req, res) => {
  try { const { name } = req.body; const { rows } = await pool.query('INSERT INTO default_system_names (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *', [name || '']); res.json(rows[0] || {}); }
  catch (err) { res.status(500).json({ error: 'Failed to add system name' }); }
});
router.put('/api/default-system-names/:id', async (req, res) => {
  try { const { name, sort_order } = req.body; const { rows } = await pool.query('UPDATE default_system_names SET name=$1, sort_order=$2 WHERE id=$3 RETURNING *', [name || '', sort_order ?? 0, req.params.id]); res.json(rows[0]); }
  catch (err) { res.status(500).json({ error: 'Failed to update system name' }); }
});
router.delete('/api/default-system-names/:id', async (req, res) => {
  try { await pool.query('DELETE FROM default_system_names WHERE id=$1', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: 'Failed to delete system name' }); }
});

// --- Strip Table Assignments ---
router.post('/api/strip-table-assignments', async (req, res) => {
  const { strip_id, preset_id } = req.body;
  if (!strip_id || !preset_id) return res.status(400).json({ error: 'strip_id and preset_id required' });
  try {
    await pool.query(
      'INSERT INTO strip_table_assignments (strip_id, preset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [parseInt(strip_id), parseInt(preset_id)]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

router.delete('/api/strip-table-assignments/:stripId/:presetId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM strip_table_assignments WHERE strip_id=$1 AND preset_id=$2',
      [parseInt(req.params.stripId), parseInt(req.params.presetId)]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

// Update strip aircraft positions and ground_status
router.put('/api/strips/:id/aircraft', async (req, res) => {
  try {
    const stripId = parseInt(String(req.params.id).replace('s', ''));
    const { aircraft_positions, ground_status } = req.body;
    const fields = [];
    const vals = [];
    let idx = 1;
    if (aircraft_positions !== undefined) { fields.push(`aircraft_positions=$${idx++}`); vals.push(JSON.stringify(aircraft_positions)); }
    if (ground_status !== undefined) { fields.push(`ground_status=$${idx++}`); vals.push(ground_status); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(stripId);
    const result = await pool.query(`UPDATE strips SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`, vals);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update strip aircraft data' });
  }
});

// POST /api/strips/ground-single-transfer
router.post('/api/strips/ground-single-transfer', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { sourceStripId, aircraftIdx } = req.body;
    const rawId = parseInt(String(sourceStripId).replace(/^s/, ''));
    const aidx = parseInt(String(aircraftIdx));
    if (isNaN(rawId) || isNaN(aidx) || aidx < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid sourceStripId or aircraftIdx' });
    }

    const srcRow = await client.query('SELECT * FROM strips WHERE id=$1', [rawId]);
    if (srcRow.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Source strip not found' });
    }
    const src = srcRow.rows[0];

    const rootParentId = src.parent_strip_id || src.id;
    const origCount = src.original_formation_count || parseInt(src.number_of_formation || '1') || 1;
    const srcIndices = Array.isArray(src.aircraft_indices)
      ? src.aircraft_indices
      : (src.aircraft_indices ? (() => { try { return JSON.parse(src.aircraft_indices); } catch { return null; } })() : null)
        || Array.from({ length: origCount }, (_, i) => i + 1);

    const sortedSrcIndices = [...srcIndices].sort((a, b) => a - b);
    const originalIndex = sortedSrcIndices.includes(aidx) ? aidx : (sortedSrcIndices[aidx - 1] ?? aidx);

    const saRow = await client.query('SELECT * FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [rawId, originalIndex]);
    const sa = saRow.rows[0] || null;

    const newRes = await client.query(
      `INSERT INTO strips (callsign, sq, alt, task, squadron, sector_id, takeoff_time,
         number_of_formation, erka, koteret, mivtza, tzevet_shilta, ta_shilta, notes, status, workstation_preset_id,
         in_table, parent_strip_id, aircraft_indices, original_formation_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'1',$8,$9,$10,$11,$12,$13,'active',$14,true,$15,$16,$17)
       RETURNING id`,
      [
        src.callsign, src.sq, src.alt, src.task, src.squadron,
        src.sector_id, src.takeoff_time,
        src.erka, src.koteret, src.mivtza, src.tzevet_shilta, src.ta_shilta, src.notes,
        src.workstation_preset_id,
        rootParentId, JSON.stringify([originalIndex]), origCount
      ]
    );
    const newStripId = newRes.rows[0].id;

    if (sa) {
      await client.query(
        'INSERT INTO strip_aircraft (strip_id, idx, datk, kipa) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [newStripId, originalIndex, sa.datk, sa.kipa]
      );
    }

    await client.query('DELETE FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [rawId, originalIndex]);

    const newCount = Math.max(0, (parseInt(src.number_of_formation || '1') || 1) - 1);
    let sourceDeleted = false;
    if (newCount <= 0) {
      await client.query('DELETE FROM strips WHERE id=$1', [rawId]);
      sourceDeleted = true;
    } else {
      const remainingIndices = srcIndices.filter(i => i !== originalIndex);
      const srcPositions = Array.isArray(src.aircraft_positions)
        ? src.aircraft_positions
        : (src.aircraft_positions ? (() => { try { return JSON.parse(src.aircraft_positions); } catch { return []; } })() : []);
      const remainingPositions = srcPositions.filter(p => p.idx !== originalIndex);
      await client.query(
        `UPDATE strips SET number_of_formation=$1, aircraft_indices=$2, aircraft_positions=$3,
           parent_strip_id=$4, original_formation_count=$5 WHERE id=$6`,
        [String(newCount), JSON.stringify(remainingIndices), JSON.stringify(remainingPositions), rootParentId, origCount, rawId]
      );
    }

    await client.query('COMMIT');
    res.json({ newStripId: 's' + newStripId, remaining: newCount, sourceDeleted });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error in ground-single-transfer:', err);
    res.status(500).json({ error: 'Failed to extract aircraft from ground strip' });
  } finally {
    client.release();
  }
});

// POST create a new strip directly from ground workstation
router.post('/api/strips/ground-create', async (req, res) => {
  try {
    const { callSign, sq, number_of_formation, workstation_preset_id, sector_id, strip_type, creator_preset_name } = req.body;
    const count = Math.max(1, Math.min(parseInt(number_of_formation) || 1, 16));
    const defaultPositions = Array.from({ length: count }, (_, i) => ({ idx: i + 1, point_id: null, status: 'none' }));
    const result = await pool.query(
      `INSERT INTO strips (callsign, sq, number_of_formation, aircraft_positions, workstation_preset_id, creator_preset_id, sector_id, status, in_table, strip_type, creator_preset_name)
       VALUES ($1, $2, $3, $4, $5, $5, $6, 'active', true, $7, $8) RETURNING *`,
      [callSign || '?', sq || '', count, JSON.stringify(defaultPositions), workstation_preset_id || null, sector_id || null, strip_type || '', creator_preset_name || null]
    );
    const strip = result.rows[0];
    for (let i = 1; i <= count; i++) {
      await pool.query(
        `INSERT INTO strip_aircraft (strip_id, idx) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [strip.id, i]
      );
    }
    res.json(strip);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create strip' });
  }
});

// ─── Formation Summary ─────────────────────────────────────────────────────
router.get('/api/strips/:id/formation-summary', async (req, res) => {
  try {
    const stripId = parseInt(String(req.params.id).replace(/^s/, ''));
    if (isNaN(stripId)) return res.json({ hasShakadia: false, armaments: [], systemsByAircraft: [] });
    const saRows = await pool.query('SELECT * FROM strip_aircraft WHERE strip_id=$1 ORDER BY idx', [stripId]);
    const aircraftRows = saRows.rows;
    if (aircraftRows.length === 0) return res.json({ hasShakadia: false, armaments: [], systemsByAircraft: [] });

    const acIds = aircraftRows.map(r => r.id);

    const [armRes, sysRes] = await Promise.all([
      pool.query('SELECT * FROM strip_aircraft_armaments WHERE strip_aircraft_id = ANY($1) ORDER BY strip_aircraft_id, id', [acIds]),
      pool.query('SELECT * FROM strip_aircraft_systems WHERE strip_aircraft_id = ANY($1) ORDER BY strip_aircraft_id, id', [acIds])
    ]);

    const idToIdx = {};
    aircraftRows.forEach(r => { idToIdx[r.id] = r.idx; });

    const armMap = {};
    armRes.rows.forEach(r => {
      const idx = idToIdx[r.strip_aircraft_id];
      if (!armMap[r.armament_name]) armMap[r.armament_name] = { totalQty: 0, aircraftNums: [] };
      armMap[r.armament_name].totalQty += r.quantity;
      if (!armMap[r.armament_name].aircraftNums.includes(idx)) armMap[r.armament_name].aircraftNums.push(idx);
    });
    const armaments = Object.entries(armMap).map(([name, v]) => ({ name, totalQty: v.totalQty, aircraftNums: v.aircraftNums.sort((a,b)=>a-b) }));

    const SHAKADIA_NAMES = ['שקדיה', 'שקדייה', 'שקדה', 'שקדיה '];
    const hasShakadia = sysRes.rows.some(r =>
      SHAKADIA_NAMES.some(n => r.system_name.trim().toLowerCase() === n.trim().toLowerCase()) &&
      r.status === 'שמיש'
    );

    const systemsByAircraft = aircraftRows.map(ar => ({
      idx: ar.idx,
      systems: sysRes.rows.filter(r => r.strip_aircraft_id === ar.id)
    }));

    res.json({ hasShakadia, armaments, systemsByAircraft });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to get formation summary' }); }
});

router.put('/api/strips/:id/formation-meta', async (req, res) => {
  try {
    const { formation_notes, parent_callsign } = req.body;
    const { rows } = await pool.query(
      `UPDATE strips SET
        formation_notes = COALESCE($1, formation_notes),
        parent_callsign = COALESCE($2, parent_callsign)
       WHERE id=$3 RETURNING id, formation_notes, parent_callsign`,
      [formation_notes ?? null, parent_callsign ?? null, req.params.id]
    );
    res.json(rows[0] || {});
  } catch (err) { res.status(500).json({ error: 'Failed to update formation meta' }); }
});

router.get('/api/strips/formation-summaries', async (req, res) => {
  try {
    const ids = String(req.query.strip_ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) return res.json({});
    const result = {};
    const saRows = await pool.query(
      'SELECT * FROM strip_aircraft WHERE strip_id = ANY($1) ORDER BY strip_id, idx', [ids]
    );
    const acIds = saRows.rows.map(r => r.id);
    if (acIds.length === 0) {
      ids.forEach(id => { result[id] = { hasShakadia: false, armaments: [] }; });
      return res.json(result);
    }
    const [armRes, sysRes] = await Promise.all([
      pool.query('SELECT * FROM strip_aircraft_armaments WHERE strip_aircraft_id = ANY($1)', [acIds]),
      pool.query('SELECT * FROM strip_aircraft_systems WHERE strip_aircraft_id = ANY($1)', [acIds])
    ]);
    const SHAKADIA_NAMES = ['שקדיה', 'שקדייה', 'שקדה'];
    ids.forEach(stripId => {
      const stripAc = saRows.rows.filter(r => r.strip_id === stripId);
      const stripAcIds = stripAc.map(r => r.id);
      const idToIdx = {};
      stripAc.forEach(r => { idToIdx[r.id] = r.idx; });
      const arms = armRes.rows.filter(r => stripAcIds.includes(r.strip_aircraft_id));
      const syss = sysRes.rows.filter(r => stripAcIds.includes(r.strip_aircraft_id));
      const armMap = {};
      arms.forEach(r => {
        const idx = idToIdx[r.strip_aircraft_id];
        if (!armMap[r.armament_name]) armMap[r.armament_name] = { totalQty: 0, aircraftNums: [] };
        armMap[r.armament_name].totalQty += r.quantity;
        if (!armMap[r.armament_name].aircraftNums.includes(idx)) armMap[r.armament_name].aircraftNums.push(idx);
      });
      const armaments = Object.entries(armMap).map(([name, v]) => ({ name, totalQty: v.totalQty, aircraftNums: v.aircraftNums.sort((a, b) => a - b) }));
      const hasShakadia = syss.some(r =>
        SHAKADIA_NAMES.some(n => r.system_name.trim().toLowerCase() === n.toLowerCase()) && r.status === 'שמיש'
      );
      result[stripId] = { hasShakadia, armaments };
    });
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to get bulk summaries' }); }
});

// POST /api/strips/partial-create
router.post('/api/strips/partial-create', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { sourceStripId, aircraftIndices, workstation_preset_id, sector_id } = req.body;
    if (!sourceStripId || !Array.isArray(aircraftIndices) || aircraftIndices.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'sourceStripId and aircraftIndices[] required' });
    }
    const rawId = parseInt(String(sourceStripId).replace(/^s/, ''));
    const srcRow = await client.query('SELECT * FROM strips WHERE id=$1', [rawId]);
    if (srcRow.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Source strip not found' }); }
    const src = srcRow.rows[0];

    const rootParentId = src.parent_strip_id || src.id;
    const origCount = src.original_formation_count || parseInt(src.number_of_formation || '1') || 1;
    const srcIndices = Array.isArray(src.aircraft_indices)
      ? src.aircraft_indices
      : (src.aircraft_indices ? (() => { try { return JSON.parse(src.aircraft_indices); } catch { return null; } })() : null)
      || Array.from({ length: origCount }, (_, i) => i + 1);

    const validIndices = aircraftIndices.map(Number).filter(n => srcIndices.includes(n));
    if (validIndices.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No valid aircraft indices' }); }

    const remainingIndices = srcIndices.filter(i => !validIndices.includes(i));

    const srcPositions = Array.isArray(src.aircraft_positions)
      ? src.aircraft_positions
      : (src.aircraft_positions ? (() => { try { return JSON.parse(src.aircraft_positions); } catch { return []; } })() : []);
    const partialPositions = srcPositions.filter(p => validIndices.includes(p.idx));
    const remainingPositions = srcPositions.filter(p => remainingIndices.includes(p.idx));

    const srcOnMap = !!src.on_map;
    const newX = srcOnMap ? (parseFloat(src.x || 0) + 65) : 0;
    const newY = srcOnMap ? (parseFloat(src.y || 0) + 45) : 0;
    const newMapLat = srcOnMap && src.map_lat != null ? src.map_lat : null;
    const newMapLon = srcOnMap && src.map_lon != null ? src.map_lon : null;

    const partialResult = await client.query(
      `INSERT INTO strips (callsign, sq, alt, task, squadron, sector_id, takeoff_time, number_of_formation,
        erka, koteret, mivtza, tzevet_shilta, ta_shilta, notes, status, workstation_preset_id, in_table,
        parent_strip_id, aircraft_indices, original_formation_count, aircraft_positions,
        on_map, x, y, map_lat, map_lon)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active',$15,$23,$16,$17,$18,$19,$20,$21,$22,$24,$25)
       RETURNING id`,
      [
        src.callsign, src.sq, src.alt, src.task, src.squadron,
        sector_id || src.sector_id, src.takeoff_time,
        String(validIndices.length),
        src.erka, src.koteret, src.mivtza, src.tzevet_shilta, src.ta_shilta, src.notes,
        workstation_preset_id || src.workstation_preset_id,
        rootParentId, JSON.stringify(validIndices), origCount,
        JSON.stringify(partialPositions),
        srcOnMap, newX, newY,
        req.body.in_table !== false,
        newMapLat, newMapLon
      ]
    );
    const partialStripId = partialResult.rows[0].id;

    for (const idx of validIndices) {
      const sa = await client.query('SELECT * FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [rawId, idx]);
      if (sa.rows.length > 0) {
        await client.query(
          'INSERT INTO strip_aircraft (strip_id, idx, datk, kipa) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [partialStripId, idx, sa.rows[0].datk, sa.rows[0].kipa]
        );
      }
    }

    const srcAssignments = await client.query('SELECT preset_id FROM strip_table_assignments WHERE strip_id=$1', [rawId]);
    for (const row of srcAssignments.rows) {
      await client.query(
        'INSERT INTO strip_table_assignments (strip_id, preset_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [partialStripId, row.preset_id]
      );
    }

    if (remainingIndices.length === 0) {
      await client.query('DELETE FROM strips WHERE id=$1', [rawId]);
    } else {
      await client.query(
        `UPDATE strips SET number_of_formation=$1, aircraft_indices=$2, aircraft_positions=$3,
          parent_strip_id=$4, original_formation_count=$5 WHERE id=$6`,
        [
          String(remainingIndices.length),
          JSON.stringify(remainingIndices),
          JSON.stringify(remainingPositions),
          rootParentId, origCount, rawId
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ partialStripId: 's' + partialStripId, sourceDeleted: remainingIndices.length === 0 });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating partial strip:', err);
    res.status(500).json({ error: 'Failed to create partial strip' });
  } finally {
    client.release();
  }
});

// POST /api/strips/:id/merge-partial
router.post('/api/strips/:id/merge-partial', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const targetId = parseInt(req.params.id.replace(/^s/, ''));
    const rawSourceId = parseInt(String(req.body.sourceStripId || '').replace(/^s/, ''));
    if (isNaN(targetId) || isNaN(rawSourceId)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Invalid IDs' }); }

    const [tRow, sRow] = await Promise.all([
      client.query('SELECT * FROM strips WHERE id=$1', [targetId]),
      client.query('SELECT * FROM strips WHERE id=$1', [rawSourceId])
    ]);
    if (tRow.rows.length === 0 || sRow.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Strip not found' }); }

    const target = tRow.rows[0];
    const source = sRow.rows[0];

    const parseIndices = (r) => {
      if (Array.isArray(r.aircraft_indices)) return r.aircraft_indices;
      if (r.aircraft_indices) { try { return JSON.parse(r.aircraft_indices); } catch { return null; } }
      return null;
    };
    const parsePositions = (r) => {
      if (Array.isArray(r.aircraft_positions)) return r.aircraft_positions;
      if (r.aircraft_positions) { try { return JSON.parse(r.aircraft_positions); } catch { return []; } }
      return [];
    };

    const origCount = target.original_formation_count || source.original_formation_count || null;
    const tIdx = parseIndices(target) || Array.from({ length: parseInt(target.number_of_formation || '1') || 1 }, (_, i) => i + 1);
    const sIdx = parseIndices(source) || Array.from({ length: parseInt(source.number_of_formation || '1') || 1 }, (_, i) => i + 1);
    const combinedIdx = [...new Set([...tIdx, ...sIdx])].sort((a, b) => a - b);

    const tPos = parsePositions(target);
    const sPos = parsePositions(source);
    const combinedPos = [...tPos, ...sPos.filter(sp => !tPos.find(tp => tp.idx === sp.idx))];

    const mergedNotes = [target.notes, source.notes].filter(Boolean).join('\n---\n');

    const tSa = await client.query('SELECT * FROM strip_aircraft WHERE strip_id=$1', [targetId]);
    const sSa = await client.query('SELECT * FROM strip_aircraft WHERE strip_id=$1', [rawSourceId]);
    const allDatk = [...tSa.rows, ...sSa.rows].map(r => r.datk).filter(d => d !== null && d !== undefined);
    const datkmMismatch = allDatk.length > 0 && new Set(allDatk).size > 1;
    const finalNotes = datkmMismatch ? (mergedNotes ? mergedNotes + '\nלא כל המטוסים מעודכנים' : 'לא כל המטוסים מעודכנים') : mergedNotes;

    const isFull = origCount !== null && combinedIdx.length >= origCount;

    await client.query(
      `UPDATE strips SET number_of_formation=$1, aircraft_indices=$2, original_formation_count=$3,
        parent_strip_id=$4, aircraft_positions=$5, notes=$6 WHERE id=$7`,
      [
        String(combinedIdx.length),
        isFull ? null : JSON.stringify(combinedIdx),
        isFull ? null : origCount,
        isFull ? null : (target.parent_strip_id || source.parent_strip_id),
        JSON.stringify(combinedPos),
        finalNotes || null,
        targetId
      ]
    );

    for (const sa of sSa.rows) {
      await client.query(
        'INSERT INTO strip_aircraft (strip_id, idx, datk, kipa) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [targetId, sa.idx, sa.datk, sa.kipa]
      );
    }

    await client.query('DELETE FROM strips WHERE id=$1', [rawSourceId]);

    await client.query('COMMIT');
    res.json({ success: true, isFull, combinedIndices: combinedIdx });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error merging partial strips:', err);
    res.status(500).json({ error: 'Failed to merge partial strips' });
  } finally {
    client.release();
  }
});

export default router;
