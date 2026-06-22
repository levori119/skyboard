import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

router.post('/api/strips/:id/transfer', async (req, res) => {
  try {
    const stripId = parseInt(String(req.params.id).replace(/^s/, ''));
    if (isNaN(stripId)) return res.status(400).json({ error: 'Invalid strip id' });
    const { toSectorId, workstationId, targetX, targetY, subSectorLabel, fromWorkstationId, toWorkstationId, etaMinutes } = req.body;

    const strip = await pool.query('SELECT * FROM strips WHERE id = $1', [stripId]);
    if (strip.rows.length === 0) {
      return res.status(404).json({ error: 'Strip not found' });
    }

    let fromSectorId = strip.rows[0].sector_id;

    if (!fromSectorId && fromWorkstationId) {
      const senderPreset = await pool.query('SELECT relevant_sectors FROM workstation_presets WHERE id = $1', [fromWorkstationId]);
      if (senderPreset.rows.length > 0) {
        let senderSectors = senderPreset.rows[0].relevant_sectors;
        if (typeof senderSectors === 'string') senderSectors = JSON.parse(senderSectors);
        if (Array.isArray(senderSectors) && senderSectors.length > 0) {
          fromSectorId = senderSectors[0];
        }
      }
    }

    let resolvedToWorkstationId = toWorkstationId;
    if (!resolvedToWorkstationId && fromWorkstationId) {
      const presetsResult = await pool.query('SELECT * FROM workstation_presets ORDER BY name');
      const presetsWithSector = presetsResult.rows
        .map(row => {
          const relevant = Array.isArray(row.relevant_sectors) ? row.relevant_sectors :
            (typeof row.relevant_sectors === 'string' ? JSON.parse(row.relevant_sectors) : []);
          const recvPts = Array.isArray(row.classic_receive_points) ? row.classic_receive_points :
            (typeof row.classic_receive_points === 'string' ? JSON.parse(row.classic_receive_points) : []);
          const recvSectorIds = recvPts.map(p => Number(p.sector_id)).filter(Number.isFinite);
          return { ...row, relevant_sectors: relevant, recv_sector_ids: recvSectorIds };
        })
        .filter(preset =>
          (preset.relevant_sectors.includes(toSectorId) || preset.recv_sector_ids.includes(Number(toSectorId))) &&
          preset.id !== fromWorkstationId
        );

      if (presetsWithSector.length > 0) {
        resolvedToWorkstationId = presetsWithSector[0].id;
      }
    }

    await pool.query(
      'UPDATE strips SET status = $1, workstation_preset_id = $2 WHERE id = $3',
      ['pending_transfer', resolvedToWorkstationId || null, stripId]
    );

    const etaSetAt = (etaMinutes != null && etaMinutes > 0) ? new Date() : null;
    const result = await pool.query(
      `INSERT INTO strip_transfers (strip_id, from_sector_id, to_sector_id, initiated_by, status, target_x, target_y, sub_sector_label, from_workstation_id, to_workstation_id, eta_minutes, eta_set_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [stripId, fromSectorId, toSectorId, workstationId, targetX || 0, targetY || 0, subSectorLabel || null, fromWorkstationId || null, resolvedToWorkstationId || null, etaMinutes || null, etaSetAt]
    );

    res.json({ transfer: result.rows[0] });
  } catch (err) {
    console.error('Error initiating transfer:', err);
    res.status(500).json({ error: 'Failed to initiate transfer' });
  }
});

router.get('/api/sectors/:id/incoming-transfers', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, s.aircraft_indices, s.number_of_formation,
             sec.name as from_sector_name, sec.label_he as from_sector_label,
             t.target_x, t.target_y, t.sub_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      LEFT JOIN sectors sec ON t.from_sector_id = sec.id
      WHERE t.to_sector_id = $1 AND t.status = 'pending'
      ORDER BY t.created_at
    `, [sectorId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching incoming transfers:', err);
    res.status(500).json({ error: 'Failed to fetch incoming transfers' });
  }
});

router.get('/api/sectors/:id/outgoing-transfers', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, s.aircraft_indices, s.number_of_formation,
             sec.name as to_sector_name, sec.label_he as to_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      LEFT JOIN sectors sec ON t.to_sector_id = sec.id
      WHERE t.from_sector_id = $1 AND t.status = 'pending'
      ORDER BY t.created_at
    `, [sectorId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching outgoing transfers:', err);
    res.status(500).json({ error: 'Failed to fetch outgoing transfers' });
  }
});

router.get('/api/workstations/:presetId/incoming-transfers', async (req, res) => {
  try {
    const presetId = parseInt(req.params.presetId);

    const presetRes = await pool.query('SELECT relevant_sectors FROM workstation_presets WHERE id = $1', [presetId]);
    let relevantSectors = [];
    if (presetRes.rows.length > 0) {
      const rs = presetRes.rows[0].relevant_sectors;
      relevantSectors = Array.isArray(rs) ? rs : (typeof rs === 'string' ? JSON.parse(rs || '[]') : []);
    }

    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, s.airborne, s.takeoff_time, s.aircraft_indices, s.number_of_formation,
             sec_from.name as from_sector_name, sec_from.label_he as from_sector_label,
             sec_to.name as to_sector_name, sec_to.label_he as to_sector_label,
             t.target_x, t.target_y, t.sub_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      LEFT JOIN sectors sec_from ON t.from_sector_id = sec_from.id
      LEFT JOIN sectors sec_to ON t.to_sector_id = sec_to.id
      WHERE t.status = 'pending'
        AND (
          t.to_workstation_id = $1
          OR (t.to_sector_id = ANY($2::int[]) AND t.from_workstation_id != $1)
        )
      ORDER BY t.created_at
    `, [presetId, relevantSectors]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching workstation incoming transfers:', err);
    res.status(500).json({ error: 'Failed to fetch incoming transfers' });
  }
});

router.get('/api/workstations/:presetId/outgoing-transfers', async (req, res) => {
  try {
    const presetId = parseInt(req.params.presetId);
    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, s.aircraft_indices, s.number_of_formation,
             sec_from.name as from_sector_name, sec_from.label_he as from_sector_label,
             sec_to.name as to_sector_name, sec_to.label_he as to_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      LEFT JOIN sectors sec_from ON t.from_sector_id = sec_from.id
      LEFT JOIN sectors sec_to ON t.to_sector_id = sec_to.id
      WHERE t.from_workstation_id = $1 AND t.status = 'pending'
      ORDER BY t.created_at
    `, [presetId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching workstation outgoing transfers:', err);
    res.status(500).json({ error: 'Failed to fetch outgoing transfers' });
  }
});

router.get('/api/transfers/pending-all', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.id, t.strip_id, t.from_sector_id, t.to_sector_id,
             t.from_workstation_id, t.to_workstation_id, t.sub_sector_label,
             s.alt, s.callsign
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      WHERE t.status = 'pending'
      ORDER BY t.created_at
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching all pending transfers:', err);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

router.post('/api/strips/:id/transfer-to-preset', async (req, res) => {
  try {
    const stripId = parseInt(req.params.id.replace('s', ''));
    const { fromPresetId, toPresetId } = req.body;
    await pool.query('UPDATE strips SET status = $1 WHERE id = $2', ['pending_transfer', stripId]);
    const result = await pool.query(
      `INSERT INTO strip_transfers (strip_id, from_preset_id, to_preset_id, status)
       VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [stripId, fromPresetId, toPresetId]
    );
    res.json({ transfer: result.rows[0] });
  } catch (err) {
    console.error('Error initiating classic transfer:', err);
    res.status(500).json({ error: 'Failed to initiate transfer' });
  }
});

router.get('/api/presets/:presetId/classic-incoming', async (req, res) => {
  try {
    const presetId = parseInt(req.params.presetId);
    const presetRow = await pool.query('SELECT classic_receive_points, classic_incoming_partner_preset_ids, relevant_sectors FROM workstation_presets WHERE id = $1', [presetId]);
    let recvPoints = [];
    let incomingPartnerIds = [];
    if (presetRow.rows.length > 0) {
      const raw = presetRow.rows[0].classic_receive_points;
      recvPoints = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
      const rawIn = presetRow.rows[0].classic_incoming_partner_preset_ids;
      incomingPartnerIds = (Array.isArray(rawIn) ? rawIn : (typeof rawIn === 'string' ? JSON.parse(rawIn) : []))
        .map(Number).filter(Number.isFinite);
    }
    let recvSectorIds = recvPoints
      .map(p => Number(p.sector_id))
      .filter(n => Number.isFinite(n));
    if (recvSectorIds.length === 0 && presetRow.rows.length > 0) {
      const rawRel = presetRow.rows[0].relevant_sectors;
      const relSectors = Array.isArray(rawRel) ? rawRel : (typeof rawRel === 'string' ? JSON.parse(rawRel) : []);
      recvSectorIds = relSectors.map(Number).filter(Number.isFinite);
    }
    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, s.takeoff_time, s.notes, s.erka, s.mivtza, s.koteret, s.number_of_formation, s.aircraft_indices,
             p.name as from_preset_name,
             sec_from.name as from_sector_name, sec_from.label_he as from_sector_label,
             sec_to.name as to_sector_name, sec_to.label_he as to_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      LEFT JOIN workstation_presets p ON t.from_preset_id = p.id
      LEFT JOIN sectors sec_from ON t.from_sector_id = sec_from.id
      LEFT JOIN sectors sec_to ON t.to_sector_id = sec_to.id
      WHERE t.status = 'pending'
        AND (
          (t.to_preset_id = $1 AND (cardinality($3::int[]) = 0 OR t.from_preset_id = ANY($3::int[])))
          OR (
            t.to_preset_id IS NULL
            AND t.to_sector_id = ANY($2::int[])
            AND (t.from_workstation_id IS NULL OR t.from_workstation_id <> $1)
          )
        )
      ORDER BY t.created_at
    `, [presetId, recvSectorIds, incomingPartnerIds]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching classic incoming transfers:', err);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

router.get('/api/presets/:presetId/classic-outgoing', async (req, res) => {
  try {
    const presetId = parseInt(req.params.presetId);
    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, s.takeoff_time, s.notes, s.erka, s.mivtza, s.koteret, s.number_of_formation, s.aircraft_indices,
             p.name as to_preset_name,
             sec_from.name as from_sector_name, sec_from.label_he as from_sector_label,
             sec_to.name as to_sector_name, sec_to.label_he as to_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      LEFT JOIN workstation_presets p ON t.to_preset_id = p.id
      LEFT JOIN sectors sec_from ON t.from_sector_id = sec_from.id
      LEFT JOIN sectors sec_to ON t.to_sector_id = sec_to.id
      WHERE t.status = 'pending'
        AND (
          t.from_preset_id = $1
          OR (t.from_preset_id IS NULL AND t.to_preset_id IS NULL AND t.from_workstation_id = $1)
        )
      ORDER BY t.created_at
    `, [presetId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching classic outgoing transfers:', err);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

router.post('/api/transfers/:id/accept', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const transferId = req.params.id;

    const transfer = await client.query('SELECT * FROM strip_transfers WHERE id = $1', [transferId]);
    if (transfer.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const { strip_id, to_sector_id, to_workstation_id, target_x, target_y, to_preset_id } = transfer.rows[0];
    const { receivingPresetId } = req.body || {};
    const assignedPresetId = receivingPresetId || to_preset_id || to_workstation_id || null;

    const incomingStrip = (await client.query('SELECT * FROM strips WHERE id=$1', [strip_id])).rows[0];
    let mergedIntoId = null;
    if (incomingStrip && incomingStrip.parent_strip_id) {
      const sibling = await client.query(
        `SELECT * FROM strips WHERE parent_strip_id=$1 AND id!=$2 AND workstation_preset_id=$3 AND status NOT IN ('pending_transfer','deleted')`,
        [incomingStrip.parent_strip_id, strip_id, assignedPresetId]
      );
      if (sibling.rows.length > 0) {
        const sibId = sibling.rows[0].id;
        const parseIdx = (r) => {
          if (Array.isArray(r.aircraft_indices)) return r.aircraft_indices;
          if (r.aircraft_indices) { try { return JSON.parse(r.aircraft_indices); } catch { return null; } }
          return null;
        };
        const sibIdx = parseIdx(sibling.rows[0]) || Array.from({ length: parseInt(sibling.rows[0].number_of_formation||'1')||1 }, (_,i)=>i+1);
        const incIdx = parseIdx(incomingStrip) || Array.from({ length: parseInt(incomingStrip.number_of_formation||'1')||1 }, (_,i)=>i+1);
        const combinedIdx = [...new Set([...sibIdx, ...incIdx])].sort((a,b)=>a-b);
        const origCount = sibling.rows[0].original_formation_count || incomingStrip.original_formation_count;
        const isFull = origCount !== null && combinedIdx.length >= origCount;
        const mergedNotes = [sibling.rows[0].notes, incomingStrip.notes].filter(Boolean).join('\n---\n');
        await client.query(
          `UPDATE strips SET number_of_formation=$1, aircraft_indices=$2, original_formation_count=$3, parent_strip_id=$4, notes=$5 WHERE id=$6`,
          [String(combinedIdx.length), isFull ? null : JSON.stringify(combinedIdx), isFull ? null : origCount, isFull ? null : incomingStrip.parent_strip_id, mergedNotes || null, sibId]
        );
        await client.query('DELETE FROM strips WHERE id=$1', [strip_id]);
        mergedIntoId = 's' + sibId;
      }
    }

    if (!mergedIntoId) {
      if (to_preset_id) {
        await client.query('UPDATE strips SET status=$1, workstation_preset_id=$2, in_table=true WHERE id=$3', ['active', assignedPresetId, strip_id]);
      } else {
        await client.query(
          'UPDATE strips SET sector_id=$1, status=$2, on_map=$3, x=$4, y=$5, held_by_workstation=$6, workstation_preset_id=$7, in_table=true WHERE id=$8',
          [to_sector_id, 'queued', false, target_x||0, target_y||0, assignedPresetId, assignedPresetId, strip_id]
        );
      }
    }

    await client.query('UPDATE strip_transfers SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', ['accepted', transferId]);
    if (assignedPresetId && !mergedIntoId) {
      await client.query(
        'INSERT INTO strip_table_assignments (strip_id, preset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [strip_id, assignedPresetId]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, mergedIntoId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error accepting transfer:', err);
    res.status(500).json({ error: 'Failed to accept transfer' });
  } finally {
    client.release();
  }
});

router.post('/api/transfers/:id/accept-to-map', async (req, res) => {
  try {
    const transferId = req.params.id;
    const { x, y, receivingPresetId } = req.body;

    const transfer = await pool.query('SELECT * FROM strip_transfers WHERE id = $1', [transferId]);
    if (transfer.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const { strip_id, to_sector_id, to_workstation_id } = transfer.rows[0];
    const assignedPresetId = receivingPresetId || to_workstation_id || null;
    const mapLat = req.body.map_lat ?? null;
    const mapLon = req.body.map_lon ?? null;

    await pool.query(
      'UPDATE strips SET sector_id = $1, status = $2, on_map = $3, x = $4, y = $5, held_by_workstation = $6, workstation_preset_id = $7, in_table = true, map_lat = $9, map_lon = $10 WHERE id = $8',
      [to_sector_id, 'queued', true, x, y, assignedPresetId, assignedPresetId, strip_id, mapLat, mapLon]
    );

    await pool.query(
      'UPDATE strip_transfers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['accepted', transferId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error accepting transfer to map:', err);
    res.status(500).json({ error: 'Failed to accept transfer to map' });
  }
});

router.post('/api/transfers/:id/reject', async (req, res) => {
  try {
    const transferId = req.params.id;

    const transfer = await pool.query('SELECT * FROM strip_transfers WHERE id = $1', [transferId]);
    if (transfer.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const stripId = transfer.rows[0].strip_id;
    const fromWorkstationId = transfer.rows[0].from_workstation_id ?? null;
    const stripRow = await pool.query('SELECT on_map, in_table FROM strips WHERE id = $1', [stripId]);
    const sr = stripRow.rows[0];
    const wasOnMap = sr && sr.on_map && !sr.in_table;

    await pool.query(
      'UPDATE strips SET status = $1, workstation_preset_id = $2 WHERE id = $3',
      [wasOnMap ? 'active' : 'queued', fromWorkstationId, stripId]
    );

    await pool.query(
      'UPDATE strip_transfers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['rejected', transferId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error rejecting transfer:', err);
    res.status(500).json({ error: 'Failed to reject transfer' });
  }
});

router.post('/api/transfers/:id/move', async (req, res) => {
  try {
    const transferId = req.params.id;
    const { to_sector_id, to_preset_id, etaMinutes } = req.body || {};
    if (!to_sector_id && !to_preset_id) {
      return res.status(400).json({ error: 'Must specify to_sector_id or to_preset_id' });
    }
    const existing = await pool.query("SELECT * FROM strip_transfers WHERE id = $1 AND status = 'pending'", [transferId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found or not pending' });
    }
    const t = existing.rows[0];
    const etaSetAt = (etaMinutes != null && etaMinutes > 0) ? new Date() : null;
    if (to_preset_id) {
      if (Number(t.to_preset_id) === Number(to_preset_id)) {
        if (etaMinutes != null) {
          await pool.query(
            "UPDATE strip_transfers SET eta_minutes=$1, eta_set_at=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3",
            [etaMinutes || null, etaSetAt, transferId]
          );
        }
        return res.json({ success: true, noop: true });
      }
      await pool.query(
        "UPDATE strip_transfers SET to_preset_id=$1, to_sector_id=NULL, to_workstation_id=$1, eta_minutes=$2, eta_set_at=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4",
        [Number(to_preset_id), etaMinutes || null, etaSetAt, transferId]
      );
    } else {
      if (!t.to_preset_id && Number(t.to_sector_id) === Number(to_sector_id)) {
        if (etaMinutes != null) {
          await pool.query(
            "UPDATE strip_transfers SET eta_minutes=$1, eta_set_at=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3",
            [etaMinutes || null, etaSetAt, transferId]
          );
        }
        return res.json({ success: true, noop: true });
      }
      let resolvedToWorkstationId = null;
      const presetsResult = await pool.query('SELECT * FROM workstation_presets ORDER BY name');
      const presetsWithSector = presetsResult.rows
        .map(row => ({
          ...row,
          relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors :
            (typeof row.relevant_sectors === 'string' ? JSON.parse(row.relevant_sectors) : [])
        }))
        .filter(preset => preset.relevant_sectors.includes(Number(to_sector_id)) && preset.id !== t.from_workstation_id);
      if (presetsWithSector.length > 0) {
        resolvedToWorkstationId = presetsWithSector[0].id;
      }
      await pool.query(
        "UPDATE strip_transfers SET to_sector_id=$1, to_preset_id=NULL, to_workstation_id=$2, eta_minutes=$3, eta_set_at=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5",
        [Number(to_sector_id), resolvedToWorkstationId, etaMinutes || null, etaSetAt, transferId]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error moving transfer:', err);
    res.status(500).json({ error: 'Failed to move transfer' });
  }
});

router.post('/api/transfers/:id/set-eta', async (req, res) => {
  try {
    const { etaMinutes } = req.body || {};
    const etaSetAt = (etaMinutes != null && etaMinutes > 0) ? new Date() : null;
    await pool.query(
      "UPDATE strip_transfers SET eta_minutes=$1, eta_set_at=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND status='pending'",
      [etaMinutes || null, etaSetAt, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error setting ETA:', err);
    res.status(500).json({ error: 'Failed to set ETA' });
  }
});

router.patch('/api/transfers/:id/note', async (req, res) => {
  try {
    const { note, preset_id } = req.body;
    const result = await pool.query(
      'UPDATE strip_transfers SET note=$1, note_by_preset_id=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING id',
      [note || null, preset_id || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transfer not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating transfer note:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

router.post('/api/transfers/:id/cancel', async (req, res) => {
  try {
    const transferId = req.params.id;

    const transfer = await pool.query('SELECT * FROM strip_transfers WHERE id = $1', [transferId]);
    if (transfer.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const stripId = transfer.rows[0].strip_id;
    const fromWorkstationId = transfer.rows[0].from_workstation_id ?? null;
    const stripRow = await pool.query('SELECT on_map, in_table FROM strips WHERE id = $1', [stripId]);
    const sr = stripRow.rows[0];
    const wasOnMap = sr && sr.on_map && !sr.in_table;

    await pool.query(
      'UPDATE strips SET status = $1, workstation_preset_id = $2 WHERE id = $3',
      [wasOnMap ? 'active' : 'queued', fromWorkstationId, stripId]
    );

    await pool.query(
      'UPDATE strip_transfers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['cancelled', transferId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling transfer:', err);
    res.status(500).json({ error: 'Failed to cancel transfer' });
  }
});

export default router;
