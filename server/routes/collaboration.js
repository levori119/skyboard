import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

// --- Work Groups API ---
router.get('/api/work-groups', async (req, res) => {
  try {
    const { rows: groups } = await pool.query(`SELECT * FROM work_groups ORDER BY name`);
    const { rows: members } = await pool.query(`
      SELECT wgm.work_group_id, wgm.preset_id, wp.name as preset_name
      FROM work_group_members wgm
      JOIN workstation_presets wp ON wp.id = wgm.preset_id
      ORDER BY wp.name
    `);
    const result = groups.map(g => ({
      ...g,
      members: members.filter(m => m.work_group_id === g.id).map(m => ({ preset_id: m.preset_id, preset_name: m.preset_name }))
    }));
    res.json(result);
  } catch (err) {
    console.error('Error fetching work groups:', err);
    res.status(500).json({ error: 'Failed to fetch work groups' });
  }
});

router.post('/api/work-groups', async (req, res) => {
  try {
    const { name } = req.body;
    const { rows } = await pool.query(`INSERT INTO work_groups (name) VALUES ($1) RETURNING *`, [name]);
    res.json({ ...rows[0], members: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create work group' });
  }
});

router.put('/api/work-groups/:id', async (req, res) => {
  try {
    const { name, admin_preset_id } = req.body;
    if (name !== undefined && admin_preset_id !== undefined) {
      await pool.query(`UPDATE work_groups SET name=$1, admin_preset_id=$2 WHERE id=$3`, [name, admin_preset_id || null, req.params.id]);
    } else if (name !== undefined) {
      await pool.query(`UPDATE work_groups SET name=$1 WHERE id=$2`, [name, req.params.id]);
    } else if (admin_preset_id !== undefined) {
      await pool.query(`UPDATE work_groups SET admin_preset_id=$1 WHERE id=$2`, [admin_preset_id || null, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update work group' });
  }
});

router.delete('/api/work-groups/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM work_groups WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete work group' });
  }
});

router.post('/api/work-groups/:id/members', async (req, res) => {
  try {
    const { preset_id } = req.body;
    await pool.query(`INSERT INTO work_group_members (work_group_id, preset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.params.id, preset_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

router.delete('/api/work-groups/:id/members/:presetId', async (req, res) => {
  try {
    await pool.query(`DELETE FROM work_group_members WHERE work_group_id=$1 AND preset_id=$2`, [req.params.id, req.params.presetId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// --- Work Group Notes ---
router.get('/api/work-group-notes/for-preset/:presetId', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT wgn.*, wg.name as group_name, wg.admin_preset_id
      FROM work_group_notes wgn
      JOIN work_groups wg ON wg.id = wgn.work_group_id
      JOIN work_group_members wgm ON wgm.work_group_id = wg.id
      WHERE wgm.preset_id = $1
      ORDER BY wg.name, wgn.id
    `, [req.params.presetId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

router.get('/api/work-groups/:id/notes', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM work_group_notes WHERE work_group_id=$1 ORDER BY id`, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

router.post('/api/work-groups/:id/notes', async (req, res) => {
  try {
    const { title, content, updated_by_name } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO work_group_notes (work_group_id, title, content, updated_by_name, updated_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING *`,
      [req.params.id, title || '', content || '', updated_by_name || '']
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create note' });
  }
});

router.put('/api/work-group-notes/:id', async (req, res) => {
  try {
    const { title, content, updated_by_name } = req.body;
    await pool.query(
      `UPDATE work_group_notes SET title=$1, content=$2, updated_by_name=$3, updated_at=NOW() WHERE id=$4`,
      [title || '', content || '', updated_by_name || '', req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update note' });
  }
});

router.delete('/api/work-group-notes/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM work_group_notes WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// --- Sticky Notes API ---
router.get('/api/sticky-notes', async (req, res) => {
  try {
    const { presetId } = req.query;
    if (!presetId) return res.status(400).json({ error: 'presetId required' });
    const { rows } = await pool.query(`
      SELECT sn.*,
        snr.x, snr.y, snr.minimized,
        TRUE as is_recipient
      FROM sticky_notes sn
      JOIN sticky_note_recipients snr ON snr.sticky_note_id = sn.id
      WHERE snr.preset_id = $1
      UNION ALL
      SELECT sn.*,
        COALESCE((SELECT x FROM sticky_note_recipients WHERE sticky_note_id=sn.id AND preset_id=$1), 100) as x,
        COALESCE((SELECT y FROM sticky_note_recipients WHERE sticky_note_id=sn.id AND preset_id=$1), 100) as y,
        COALESCE((SELECT minimized FROM sticky_note_recipients WHERE sticky_note_id=sn.id AND preset_id=$1), FALSE) as minimized,
        FALSE as is_recipient
      FROM sticky_notes sn
      WHERE sn.creator_preset_id = $1
        AND NOT EXISTS (SELECT 1 FROM sticky_note_recipients WHERE sticky_note_id=sn.id AND preset_id=$1)
    `, [presetId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching sticky notes:', err);
    res.status(500).json({ error: 'Failed to fetch sticky notes' });
  }
});

router.post('/api/sticky-notes', async (req, res) => {
  try {
    const { title, content, background_color, creator_preset_id, creator_preset_name, creator_crew_name, allow_all_edit, x, y } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO sticky_notes (title, content, background_color, creator_preset_id, creator_preset_name, creator_crew_name, allow_all_edit)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [title || '', content || '', background_color || '#fef08a', creator_preset_id, creator_preset_name, creator_crew_name, allow_all_edit || false]);
    const note = rows[0];
    await pool.query(`
      INSERT INTO sticky_note_recipients (sticky_note_id, preset_id, x, y, minimized)
      VALUES ($1, $2, $3, $4, FALSE) ON CONFLICT DO NOTHING
    `, [note.id, creator_preset_id, x || 100, y || 100]);
    res.json({ ...note, x: x || 100, y: y || 100, minimized: false });
  } catch (err) {
    console.error('Error creating sticky note:', err);
    res.status(500).json({ error: 'Failed to create sticky note' });
  }
});

router.put('/api/sticky-notes/:id', async (req, res) => {
  try {
    const { title, content, background_color, allow_all_edit, x, y, minimized, preset_id, crew_name } = req.body;
    const fields = [];
    const vals = [];
    let idx = 1;
    if (title !== undefined) { fields.push(`title=$${idx++}`); vals.push(title); }
    if (content !== undefined) { fields.push(`content=$${idx++}`); vals.push(content); }
    if (background_color !== undefined) { fields.push(`background_color=$${idx++}`); vals.push(background_color); }
    if (allow_all_edit !== undefined) { fields.push(`allow_all_edit=$${idx++}`); vals.push(allow_all_edit); }
    if (fields.length > 0) {
      if (preset_id) {
        fields.push(`last_edited_by_preset_name=$${idx++}`); vals.push(req.body.preset_name || '');
        fields.push(`last_edited_by_crew_name=$${idx++}`); vals.push(crew_name || '');
        fields.push(`last_edited_at=NOW()`);
      }
      vals.push(req.params.id);
      await pool.query(`UPDATE sticky_notes SET ${fields.join(', ')} WHERE id=$${idx}`, vals);
    }
    if (preset_id && (x !== undefined || y !== undefined || minimized !== undefined)) {
      const posFields = [];
      const posVals = [];
      let pi = 1;
      if (x !== undefined) { posFields.push(`x=$${pi++}`); posVals.push(x); }
      if (y !== undefined) { posFields.push(`y=$${pi++}`); posVals.push(y); }
      if (minimized !== undefined) { posFields.push(`minimized=$${pi++}`); posVals.push(minimized); }
      posVals.push(req.params.id, preset_id);
      await pool.query(`UPDATE sticky_note_recipients SET ${posFields.join(', ')} WHERE sticky_note_id=$${pi} AND preset_id=$${pi+1}`, posVals);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating sticky note:', err);
    res.status(500).json({ error: 'Failed to update sticky note' });
  }
});

router.delete('/api/sticky-notes/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM sticky_notes WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete sticky note' });
  }
});

router.post('/api/sticky-notes/:id/distribute', async (req, res) => {
  try {
    const { preset_ids } = req.body;
    for (const pid of preset_ids) {
      await pool.query(`
        INSERT INTO sticky_note_recipients (sticky_note_id, preset_id, x, y, minimized)
        VALUES ($1, $2, 120, 120, FALSE) ON CONFLICT DO NOTHING
      `, [req.params.id, pid]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to distribute sticky note' });
  }
});

// ── Workstation Collab State ──────────────────────────────────────────────────
router.get('/api/collab-state/:presetId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM workstation_collab_state WHERE preset_id = $1',
      [req.params.presetId]
    );
    if (rows.length === 0) return res.json({ pen_strokes: [], map_shapes: [], conflict_resolutions: {}, clear_at: '' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/collab-state/:presetId', async (req, res) => {
  try {
    const { new_strokes = [], new_shapes = [], removed_shape_ids = [], conflict_resolutions = {}, clear_at } = req.body;
    const presetId = req.params.presetId;
    const { rows } = await pool.query('SELECT * FROM workstation_collab_state WHERE preset_id = $1', [presetId]);
    let existing = rows[0] || { pen_strokes: [], map_shapes: [], conflict_resolutions: {}, clear_at: '' };
    if (clear_at) {
      existing = { pen_strokes: [], map_shapes: new_shapes, conflict_resolutions, clear_at };
    } else {
      const strokeMap = new Map();
      (existing.pen_strokes || []).forEach(s => strokeMap.set(s.id, s));
      (new_strokes || []).forEach(s => strokeMap.set(s.id, s));
      existing.pen_strokes = Array.from(strokeMap.values());
      const shapeMap = new Map();
      (existing.map_shapes || []).forEach(s => shapeMap.set(s.id, s));
      (new_shapes || []).forEach(s => shapeMap.set(s.id, s));
      (removed_shape_ids || []).forEach(id => shapeMap.delete(id));
      existing.map_shapes = Array.from(shapeMap.values());
      existing.conflict_resolutions = { ...(existing.conflict_resolutions || {}), ...conflict_resolutions };
    }
    await pool.query(
      `INSERT INTO workstation_collab_state (preset_id, pen_strokes, map_shapes, conflict_resolutions, clear_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (preset_id) DO UPDATE SET pen_strokes=$2, map_shapes=$3, conflict_resolutions=$4, clear_at=$5, updated_at=NOW()`,
      [presetId, JSON.stringify(existing.pen_strokes), JSON.stringify(existing.map_shapes), JSON.stringify(existing.conflict_resolutions), existing.clear_at || '']
    );
    res.json(existing);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Workstation Messages (peer notifications) ──
router.post('/api/workstation-messages', async (req, res) => {
  const { from_preset_id, from_preset_name, to_preset_ids, message } = req.body;
  if (!message || !Array.isArray(to_preset_ids) || to_preset_ids.length === 0)
    return res.status(400).json({ error: 'Missing fields' });
  try {
    for (const to_id of to_preset_ids) {
      await pool.query(
        'INSERT INTO workstation_messages (from_preset_id, from_preset_name, to_preset_id, message) VALUES ($1, $2, $3, $4)',
        [from_preset_id || null, from_preset_name || null, to_id, message]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/workstation-messages', async (req, res) => {
  const { preset_id } = req.query;
  if (!preset_id) return res.status(400).json({ error: 'preset_id required' });
  try {
    const { rows } = await pool.query(
      'SELECT * FROM workstation_messages WHERE to_preset_id = $1 AND seen = false ORDER BY created_at',
      [preset_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/workstation-messages/seen', async (req, res) => {
  const { preset_id, ids } = req.body;
  try {
    if (Array.isArray(ids) && ids.length > 0) {
      await pool.query('UPDATE workstation_messages SET seen = true WHERE id = ANY($1::int[])', [ids]);
    } else if (preset_id) {
      await pool.query('UPDATE workstation_messages SET seen = true WHERE to_preset_id = $1', [preset_id]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// מז"א מרחבי per work group
router.get('/api/work-group-mazaa/:groupId', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT mazaa_regional FROM work_groups WHERE id=$1`, [req.params.groupId]);
    if (!rows.length) return res.status(404).json({ error: 'Group not found' });
    res.json({ mazaa_regional: rows[0].mazaa_regional || '' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get mazaa regional' });
  }
});

router.patch('/api/work-group-mazaa/:groupId', async (req, res) => {
  try {
    const { mazaa_regional } = req.body;
    await pool.query(`UPDATE work_groups SET mazaa_regional=$1 WHERE id=$2`, [mazaa_regional || null, req.params.groupId]);
    res.json({ success: true, mazaa_regional: mazaa_regional || '' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update mazaa regional' });
  }
});

// מד עומס לפי מצב מז"א — per-preset thresholds
router.get('/api/preset-mazaa-thresholds', async (req, res) => {
  try {
    const { preset_id } = req.query;
    if (!preset_id) return res.status(400).json({ error: 'preset_id required' });
    const { rows } = await pool.query(`SELECT * FROM preset_mazaa_thresholds WHERE preset_id=$1 ORDER BY id`, [preset_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mazaa thresholds' });
  }
});

router.post('/api/preset-mazaa-thresholds', async (req, res) => {
  try {
    const { preset_id, mazaa_status, partial_load, full_load } = req.body;
    if (!preset_id || !mazaa_status) return res.status(400).json({ error: 'preset_id and mazaa_status required' });
    const { rows } = await pool.query(
      `INSERT INTO preset_mazaa_thresholds (preset_id, mazaa_status, partial_load, full_load)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (preset_id, mazaa_status)
       DO UPDATE SET partial_load=EXCLUDED.partial_load, full_load=EXCLUDED.full_load
       RETURNING *`,
      [preset_id, mazaa_status, partial_load ?? 3, full_load ?? 5]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save mazaa threshold' });
  }
});

router.put('/api/preset-mazaa-thresholds/:id', async (req, res) => {
  try {
    const { partial_load, full_load } = req.body;
    const { rows } = await pool.query(
      `UPDATE preset_mazaa_thresholds SET partial_load=$1, full_load=$2 WHERE id=$3 RETURNING *`,
      [partial_load ?? 3, full_load ?? 5, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update mazaa threshold' });
  }
});

router.delete('/api/preset-mazaa-thresholds/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM preset_mazaa_thresholds WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete mazaa threshold' });
  }
});

// ── Signal board — toggle-able status messages between workstations ──────────
// My buttons (the board I own)
router.get('/api/signals', async (req, res) => {
  try {
    const { preset_id } = req.query;
    if (!preset_id) return res.status(400).json({ error: 'preset_id required' });
    const r = await pool.query('SELECT * FROM workstation_signals WHERE preset_id=$1 ORDER BY sort_order, id', [preset_id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Active signals addressed to me, grouped (by source) — incoming
router.get('/api/signals/incoming', async (req, res) => {
  try {
    const { preset_id } = req.query;
    if (!preset_id) return res.status(400).json({ error: 'preset_id required' });
    const r = await pool.query(
      `SELECT s.id, s.preset_id AS from_preset_id, wp.name AS from_preset_name, s.text, s.updated_at
       FROM workstation_signals s JOIN workstation_presets wp ON wp.id = s.preset_id
       WHERE s.active = true AND s.preset_id <> $1
         AND (s.to_all = true OR s.recipient_preset_ids @> $2::jsonb)
       ORDER BY wp.name, s.sort_order, s.id`,
      [preset_id, JSON.stringify([Number(preset_id)])]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/signals', async (req, res) => {
  try {
    const { preset_id, text, to_all, recipient_preset_ids, source, sort_order } = req.body;
    if (!preset_id || !text) return res.status(400).json({ error: 'preset_id and text required' });
    const r = await pool.query(
      `INSERT INTO workstation_signals (preset_id, text, to_all, recipient_preset_ids, source, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [preset_id, String(text).slice(0, 120), !!to_all, JSON.stringify(recipient_preset_ids || []), source === 'preset' ? 'preset' : 'adhoc', sort_order ?? 0]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/signals/:id', async (req, res) => {
  try {
    const fields = [], vals = []; let i = 1;
    const { text, to_all, recipient_preset_ids, active, sort_order } = req.body;
    if (text !== undefined) { fields.push(`text=$${i++}`); vals.push(String(text).slice(0, 120)); }
    if (to_all !== undefined) { fields.push(`to_all=$${i++}`); vals.push(!!to_all); }
    if (recipient_preset_ids !== undefined) { fields.push(`recipient_preset_ids=$${i++}`); vals.push(JSON.stringify(recipient_preset_ids || [])); }
    if (active !== undefined) { fields.push(`active=$${i++}`); vals.push(!!active); }
    if (sort_order !== undefined) { fields.push(`sort_order=$${i++}`); vals.push(sort_order); }
    if (!fields.length) return res.json({});
    fields.push('updated_at=NOW()');
    vals.push(req.params.id);
    const r = await pool.query(`UPDATE workstation_signals SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`, vals);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/signals/:id', async (req, res) => {
  try { await pool.query('DELETE FROM workstation_signals WHERE id=$1', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Clear this preset's session (adhoc) buttons — called on logout
router.delete('/api/signals/adhoc/:presetId', async (req, res) => {
  try { await pool.query("DELETE FROM workstation_signals WHERE preset_id=$1 AND source='adhoc'", [req.params.presetId]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
