// דסק משימה כללי (General Mission Desk) — CRUD דסקים/שירותים + state עם fan-out שיתוף.
// layout_json = עץ BSP שכל leaf מפנה ל-service_id (ראה data-model.md).
// שיתוף: בכתיבת state, השרת מעתיק את ה-state לעמדות שב-mission_desk_sharing[serviceId]
// של העמדה הכותבת (סנכרון "אם אני משנה — מתעדכן גם אצל השני"; polling בצד הלקוח).
import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

const SERVICE_TYPES = ['buttons', 'freetext', 'table'];

// ── דסקים ───────────────────────────────────────────────────────────────────

router.get('/api/mission-desks', async (_req, res) => {
  try {
    const { rows: desks } = await pool.query(`SELECT * FROM mission_desks ORDER BY name`);
    const { rows: services } = await pool.query(
      `SELECT * FROM mission_desk_services ORDER BY desk_id, sort_order, id`
    );
    res.json(desks.map(d => ({ ...d, services: services.filter(s => s.desk_id === d.id) })));
  } catch (err) {
    console.error('Error fetching mission desks:', err);
    res.status(500).json({ error: 'Failed to fetch mission desks' });
  }
});

router.post('/api/mission-desks', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    const { rows } = await pool.query(
      `INSERT INTO mission_desks (name) VALUES ($1) RETURNING *`, [String(name).trim()]
    );
    res.json({ ...rows[0], services: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create mission desk' });
  }
});

router.put('/api/mission-desks/:id', async (req, res) => {
  try {
    const { name, layout_json } = req.body;
    const { rows } = await pool.query(
      `UPDATE mission_desks SET
         name = COALESCE($1, name),
         layout_json = COALESCE($2, layout_json),
         updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [name ?? null, layout_json !== undefined ? JSON.stringify(layout_json) : null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update mission desk' });
  }
});

router.delete('/api/mission-desks/:id', async (req, res) => {
  try {
    // ניתוק עמדות שמפנות לדסק (שדה יישאר NULL — העמדה תוצג ללא דסק עד בחירה חדשה)
    await pool.query(`UPDATE workstation_presets SET mission_desk_id = NULL WHERE mission_desk_id = $1`, [req.params.id]);
    await pool.query(`DELETE FROM mission_desks WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete mission desk' });
  }
});

// ── שירותים בתוך דסק ────────────────────────────────────────────────────────

router.post('/api/mission-desks/:id/services', async (req, res) => {
  try {
    const { service_type, name, config, sort_order } = req.body;
    if (!SERVICE_TYPES.includes(service_type)) return res.status(400).json({ error: 'invalid service_type' });
    const { rows } = await pool.query(
      `INSERT INTO mission_desk_services (desk_id, service_type, name, config, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, service_type, name || '', JSON.stringify(config || {}), sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create service' });
  }
});

router.put('/api/mission-desk-services/:sid', async (req, res) => {
  try {
    const { name, config, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE mission_desk_services SET
         name = COALESCE($1, name),
         config = COALESCE($2, config),
         sort_order = COALESCE($3, sort_order)
       WHERE id = $4 RETURNING *`,
      [name ?? null, config !== undefined ? JSON.stringify(config) : null, sort_order ?? null, req.params.sid]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update service' });
  }
});

router.delete('/api/mission-desk-services/:sid', async (req, res) => {
  try {
    await pool.query(`DELETE FROM mission_desk_services WHERE id = $1`, [req.params.sid]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// ── State — קריאה מרוכזת לעמדה (polling אחד) ────────────────────────────────

router.get('/api/mission-desk-state', async (req, res) => {
  try {
    const presetId = parseInt(req.query.preset_id, 10);
    if (!presetId) return res.status(400).json({ error: 'preset_id required' });
    const { rows } = await pool.query(
      `SELECT s.service_id, s.state, s.updated_at
       FROM mission_desk_service_state s
       WHERE s.preset_id = $1`, [presetId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch state' });
  }
});

// כתיבת state של שירות אחד + fan-out לעמדות המשותפות של הכותב.
// last-write-wins ברמת שירות שלם (כמו collab-state).
router.put('/api/mission-desk-state/:serviceId', async (req, res) => {
  try {
    const serviceId = parseInt(req.params.serviceId, 10);
    const { preset_id, state } = req.body;
    if (!preset_id || state === undefined) return res.status(400).json({ error: 'preset_id and state required' });

    const stateJson = JSON.stringify(state);
    const upsert = (pid) => pool.query(
      `INSERT INTO mission_desk_service_state (service_id, preset_id, state, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (service_id, preset_id) DO UPDATE SET state = $3, updated_at = NOW()`,
      [serviceId, pid, stateJson]
    );
    await upsert(preset_id);

    // fan-out: לפי הגדרת השיתוף של העמדה הכותבת (זהה ל-resolveFanout בצד הלקוח)
    const { rows: presetRows } = await pool.query(
      `SELECT mission_desk_sharing FROM workstation_presets WHERE id = $1`, [preset_id]
    );
    const sharing = presetRows[0]?.mission_desk_sharing || {};
    const raw = sharing[String(serviceId)];
    const targets = [];
    if (Array.isArray(raw)) {
      for (const v of raw) {
        const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
        if (Number.isInteger(n) && n !== preset_id && !targets.includes(n)) targets.push(n);
      }
    }
    await Promise.all(targets.map(upsert));

    res.json({ ok: true, fanout: targets });
  } catch (err) {
    console.error('Error saving mission desk state:', err);
    res.status(500).json({ error: 'Failed to save state' });
  }
});

export default router;
