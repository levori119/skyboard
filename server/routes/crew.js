import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

router.get('/api/crew-members', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cm.*,
        COALESCE(
          (SELECT json_agg(cmw.workstation_preset_id)
           FROM crew_member_workstations cmw
           WHERE cmw.crew_member_id = cm.id), '[]'
        ) as approved_workstations
      FROM crew_members cm
      ORDER BY cm.last_name, cm.first_name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching crew members:', err);
    res.status(500).json({ error: 'Failed to fetch crew members' });
  }
});

router.post('/api/crew-members', async (req, res) => {
  try {
    const { first_name, last_name, personal_id, is_admin, is_team_lead, approved_workstations } = req.body;
    const name = `${first_name} ${last_name}`.trim();
    const result = await pool.query(
      'INSERT INTO crew_members (name, first_name, last_name, personal_id, is_admin, is_team_lead) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, first_name, last_name, personal_id, is_admin || false, is_team_lead || false]
    );
    const crewMemberId = result.rows[0].id;

    // Add approved workstations
    if (approved_workstations && approved_workstations.length > 0) {
      for (const wsId of approved_workstations) {
        await pool.query(
          'INSERT INTO crew_member_workstations (crew_member_id, workstation_preset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [crewMemberId, wsId]
        );
      }
    }

    res.json({ ...result.rows[0], approved_workstations: approved_workstations || [] });
  } catch (err) {
    console.error('Error creating crew member:', err);
    res.status(500).json({ error: 'Failed to create crew member' });
  }
});

router.put('/api/crew-members/:id', async (req, res) => {
  try {
    const { first_name, last_name, personal_id, is_admin, is_team_lead, approved_workstations } = req.body;
    const name = `${first_name} ${last_name}`.trim();
    await pool.query(
      'UPDATE crew_members SET name = $1, first_name = $2, last_name = $3, personal_id = $4, is_admin = $5, is_team_lead = $6 WHERE id = $7',
      [name, first_name, last_name, personal_id, is_admin, is_team_lead || false, req.params.id]
    );

    // Update approved workstations
    await pool.query('DELETE FROM crew_member_workstations WHERE crew_member_id = $1', [req.params.id]);
    if (approved_workstations && approved_workstations.length > 0) {
      for (const wsId of approved_workstations) {
        await pool.query(
          'INSERT INTO crew_member_workstations (crew_member_id, workstation_preset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [req.params.id, wsId]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating crew member:', err);
    res.status(500).json({ error: 'Failed to update crew member' });
  }
});

router.patch('/api/crew-members/:id/preferences', async (req, res) => {
  try {
    const { undo_duration_ms, ground_datk_filter, ground_status_filter, ground_filter_mode, classic_panel_orders } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;
    if ('undo_duration_ms' in req.body) { fields.push(`undo_duration_ms = $${idx++}`); values.push(undo_duration_ms ?? null); }
    if ('ground_datk_filter' in req.body) { fields.push(`ground_datk_filter = $${idx++}`); values.push(ground_datk_filter ?? null); }
    if ('ground_status_filter' in req.body) { fields.push(`ground_status_filter = $${idx++}`); values.push(ground_status_filter !== undefined ? JSON.stringify(ground_status_filter) : null); }
    if ('ground_filter_mode' in req.body) { fields.push(`ground_filter_mode = $${idx++}`); values.push(ground_filter_mode ?? null); }
    if ('classic_panel_orders' in req.body) { fields.push(`classic_panel_orders = COALESCE(classic_panel_orders, '{}'::jsonb) || $${idx++}::jsonb`); values.push(classic_panel_orders !== undefined ? JSON.stringify(classic_panel_orders) : '{}'); }
    if (fields.length > 0) {
      values.push(req.params.id);
      await pool.query(`UPDATE crew_members SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating crew member preferences:', err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

router.delete('/api/crew-members/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM crew_members WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting crew member:', err);
    res.status(500).json({ error: 'Failed to delete crew member' });
  }
});

// --- Digits API (per crew member) ---
router.get('/api/digits', async (req, res) => {
  try {
    const crewMemberId = req.query.crew_member_id;
    let query = 'SELECT digit, image_data FROM learned_digits';
    let params = [];
    if (crewMemberId) {
      query += ' WHERE crew_member_id = $1';
      params.push(crewMemberId);
    }
    query += ' ORDER BY id DESC LIMIT 200';
    const result = await pool.query(query, params);
    res.json(result.rows.map(r => ({ digit: r.digit, imageData: r.image_data })));
  } catch (err) {
    console.error('Error fetching digits:', err);
    res.status(500).json({ error: 'Failed to fetch digits' });
  }
});

router.post('/api/digits', async (req, res) => {
  try {
    const { digit, imageData, crew_member_id } = req.body;
    if (!digit || !imageData) {
      return res.status(400).json({ error: 'Missing digit or imageData' });
    }
    await pool.query(
      'INSERT INTO learned_digits (digit, image_data, crew_member_id) VALUES ($1, $2, $3)',
      [digit, imageData, crew_member_id || null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving digit:', err);
    res.status(500).json({ error: 'Failed to save digit' });
  }
});

router.delete('/api/digits', async (req, res) => {
  try {
    const crewMemberId = req.query.crew_member_id;
    if (crewMemberId) {
      await pool.query('DELETE FROM learned_digits WHERE crew_member_id = $1', [crewMemberId]);
    } else {
      await pool.query('DELETE FROM learned_digits');
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing digits:', err);
    res.status(500).json({ error: 'Failed to clear digits' });
  }
});

router.get('/api/digits/count', async (req, res) => {
  try {
    const crewMemberId = req.query.crew_member_id;
    let query = 'SELECT COUNT(*) as count FROM learned_digits';
    let params = [];
    if (crewMemberId) {
      query += ' WHERE crew_member_id = $1';
      params.push(crewMemberId);
    }
    const result = await pool.query(query, params);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Error counting digits:', err);
    res.status(500).json({ error: 'Failed to count digits' });
  }
});

// --- Handwriting stroke templates (per crew member) — offline $P recognizer ---
router.get('/api/strokes', async (req, res) => {
  try {
    const crewMemberId = req.query.crew_member_id;
    // base (seed) templates + this user's personal templates
    let query = "SELECT label, strokes, source FROM learned_strokes WHERE source = 'seed'";
    const params = [];
    if (crewMemberId) { query += ' OR crew_member_id = $1'; params.push(crewMemberId); }
    query += ' ORDER BY id';
    const result = await pool.query(query, params);
    res.json(result.rows.map(r => ({ label: r.label, strokes: r.strokes, source: r.source })));
  } catch (err) {
    console.error('Error fetching strokes:', err);
    res.status(500).json({ error: 'Failed to fetch strokes' });
  }
});

router.post('/api/strokes', async (req, res) => {
  try {
    const { label, strokes, source, crew_member_id } = req.body;
    if (!label || !Array.isArray(strokes) || strokes.length === 0) {
      return res.status(400).json({ error: 'Missing label or strokes' });
    }
    await pool.query(
      'INSERT INTO learned_strokes (label, strokes, source, crew_member_id) VALUES ($1, $2, $3, $4)',
      [String(label).slice(0, 16), JSON.stringify(strokes), source === 'seed' ? 'seed' : 'user', crew_member_id || null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving strokes:', err);
    res.status(500).json({ error: 'Failed to save strokes' });
  }
});

router.delete('/api/strokes', async (req, res) => {
  try {
    const crewMemberId = req.query.crew_member_id;
    if (crewMemberId) {
      await pool.query("DELETE FROM learned_strokes WHERE crew_member_id = $1 AND source = 'user'", [crewMemberId]);
    } else {
      await pool.query("DELETE FROM learned_strokes WHERE source = 'user'");
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing strokes:', err);
    res.status(500).json({ error: 'Failed to clear strokes' });
  }
});

// --- Workstations login ---
router.post('/api/workstations/login', async (req, res) => {
  try {
    const { name } = req.body;
    const authToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

    const result = await pool.query(
      `INSERT INTO workstations (name, auth_token, is_active, last_seen)
       VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP) RETURNING *`,
      [name, authToken]
    );

    res.json({
      workstation: result.rows[0],
      authToken
    });
  } catch (err) {
    console.error('Error logging in workstation:', err);
    res.status(500).json({ error: 'Failed to login workstation' });
  }
});

router.get('/api/workstations/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.*, s.name as sector_name, s.label_he, s.map_asset
       FROM workstations w
       LEFT JOIN sectors s ON w.sector_id = s.id
       WHERE w.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workstation not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching workstation:', err);
    res.status(500).json({ error: 'Failed to fetch workstation' });
  }
});

router.patch('/api/workstations/:id/heartbeat', async (req, res) => {
  try {
    await pool.query(
      'UPDATE workstations SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating heartbeat:', err);
    res.status(500).json({ error: 'Failed to update heartbeat' });
  }
});

// --- Workstation Session Roles ---
router.get('/api/workstation-session-roles', async (req, res) => {
  try {
    const { preset_id } = req.query;
    if (preset_id) {
      const result = await pool.query(
        `SELECT * FROM workstation_session_roles WHERE preset_id = $1`, [preset_id]
      );
      res.json(result.rows[0] || { preset_id: Number(preset_id), kshp: '', mefale: '', achori: '' });
    } else {
      const result = await pool.query(
        `SELECT wsr.*, wp.name AS preset_name FROM workstation_session_roles wsr
         JOIN workstation_presets wp ON wp.id = wsr.preset_id
         ORDER BY wp.name`
      );
      res.json(result.rows);
    }
  } catch (err) { res.status(500).json({ error: 'Failed to fetch session roles' }); }
});

router.put('/api/workstation-session-roles/:preset_id', async (req, res) => {
  try {
    const { preset_id } = req.params;
    const { kshp, mefale, achori } = req.body;
    const result = await pool.query(
      `INSERT INTO workstation_session_roles (preset_id, kshp, mefale, achori, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (preset_id) DO UPDATE SET kshp=$2, mefale=$3, achori=$4, updated_at=NOW()
       RETURNING *`,
      [preset_id, kshp || '', mefale || '', achori || '']
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to save session roles' }); }
});

// --- Preset Active Crew ---
router.get('/api/preset-active-crew', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM preset_active_crew ORDER BY preset_id');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch active crew' }); }
});

router.put('/api/preset-active-crew/:presetId', async (req, res) => {
  try {
    const { presetId } = req.params;
    const { crew_name, crew_id } = req.body;
    await pool.query(
      `INSERT INTO preset_active_crew (preset_id, crew_name, crew_id, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (preset_id) DO UPDATE SET crew_name=$2, crew_id=$3, updated_at=NOW()`,
      [presetId, crew_name || '', crew_id || null]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update active crew' }); }
});

export default router;
