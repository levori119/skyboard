import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

// ─── Civilian Strips API ─────────────────────────────────────────────────────
router.get('/api/civ-strips', async (req, res) => {
  const { preset_id } = req.query;
  if (!preset_id) return res.status(400).json({ error: 'preset_id required' });
  try {
    const result = await pool.query(`
      SELECT s.*, csa.col_key, csa.sub_col, csa.sort_order, csa.id as assignment_id
      FROM strips s
      JOIN civilian_strip_assignments csa ON s.id = csa.strip_id AND csa.preset_id = $1
      ORDER BY csa.col_key, csa.sort_order, s.id
    `, [preset_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/civ-strips', async (req, res) => {
  const { preset_id, col_key = '', sub_col = '', callSign, unit, civ_fl, civ_stand, civ_dest, civ_time, civ_route, civ_ssr, civ_runway, civ_status } = req.body;
  if (!preset_id) return res.status(400).json({ error: 'preset_id required' });
  try {
    const stripRes = await pool.query(
      `INSERT INTO strips (callsign, unit, status, in_table, civ_status, civ_stand, civ_dest, civ_ssr, civ_fl, civ_route, civ_time, civ_runway)
       VALUES ($1,$2,'active',true,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [callSign||'', unit||'', civ_status||'', civ_stand||'', civ_dest||'', civ_ssr||'', civ_fl||'', civ_route||'', civ_time||'', civ_runway||'']
    );
    const strip = stripRes.rows[0];
    await pool.query(
      `INSERT INTO civilian_strip_assignments (strip_id, preset_id, col_key, sub_col, sort_order) VALUES ($1,$2,$3,$4,0)`,
      [strip.id, preset_id, col_key, sub_col]
    );
    res.json({ ...strip, col_key, sub_col, sort_order: 0, assignment_id: null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/civ-strips/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strips WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Civilian strip assignments
router.get('/api/civilian-assignments', async (req, res) => {
  try {
    const { preset_id } = req.query;
    if (!preset_id) return res.json([]);
    const result = await pool.query('SELECT * FROM civilian_strip_assignments WHERE preset_id = $1 ORDER BY col_key, sort_order', [preset_id]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

router.post('/api/civilian-assignments', async (req, res) => {
  try {
    const { strip_id, preset_id, col_key, sub_col, sort_order } = req.body;
    if (!strip_id || !preset_id) return res.status(400).json({ error: 'strip_id and preset_id required' });
    const result = await pool.query(
      `INSERT INTO civilian_strip_assignments (strip_id, preset_id, col_key, sub_col, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (strip_id, preset_id) DO UPDATE SET col_key = $3, sub_col = $4, sort_order = $5
       RETURNING *`,
      [strip_id, preset_id, col_key || '', sub_col || '', sort_order ?? 0]
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

router.delete('/api/civilian-assignments/:stripId/:presetId', async (req, res) => {
  try {
    await pool.query('DELETE FROM civilian_strip_assignments WHERE strip_id = $1 AND preset_id = $2', [req.params.stripId, req.params.presetId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

export default router;
