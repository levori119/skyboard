// ─── איחוד / פיצול עמדה (Position Combine / Decombine) ─────────────────────────
// עמדה A מכסה עמדה B בזמן ריצה. הבעלות על פריטים אינה משתנה באיחוד (עמדת מקור
// נשמרת); רק handover בפיצול מעביר בעלות נבחרת ל-B. אין WebSocket — לקוחות סוקרים
// (poll) את /api/position-merges בדיוק כמו strips.
import { Router } from 'express';
import pool from '../db/pool.js';

const router = new Router();

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const intList = (v) => (Array.isArray(v) ? v.map(num).filter((n) => n != null) : []);

// GET — איחודים פעילים (?active=1) או הכל
router.get('/api/position-merges', async (req, res) => {
  try {
    const activeOnly = req.query.active === '1' || req.query.active === 'true';
    const sql = activeOnly
      ? 'SELECT * FROM position_merges WHERE ended_at IS NULL ORDER BY started_at DESC'
      : 'SELECT * FROM position_merges ORDER BY started_at DESC';
    const r = await pool.query(sql);
    res.json(r.rows);
  } catch (e) {
    console.error('GET /api/position-merges', e);
    res.status(500).json({ error: 'Failed to fetch position merges' });
  }
});

// POST — איחוד עמדה (A מכסה את B)
router.post('/api/position-merges', async (req, res) => {
  const covering = num(req.body.covering_preset_id ?? req.body.covering);
  const covered = num(req.body.covered_preset_id ?? req.body.covered);
  const startedBy = num(req.body.started_by);
  if (covering == null || covered == null) return res.status(400).json({ error: 'covering/covered required' });
  if (covering === covered) return res.status(400).json({ error: 'עמדה אינה יכולה לאחד את עצמה' });
  try {
    // §4.2 — B כבר מכוסה ע"י מישהו?
    const dup = await pool.query('SELECT id FROM position_merges WHERE covered_preset_id=$1 AND ended_at IS NULL', [covered]);
    if (dup.rows.length) return res.status(409).json({ error: 'העמדה כבר מכוסה ע"י עמדה אחרת' });
    // §4.1 — מעגל: B כבר מכסה את A?
    const cyc = await pool.query('SELECT id FROM position_merges WHERE covering_preset_id=$1 AND covered_preset_id=$2 AND ended_at IS NULL', [covered, covering]);
    if (cyc.rows.length) return res.status(409).json({ error: 'איחוד מעגלי אסור' });
    const ins = await pool.query(
      'INSERT INTO position_merges (covering_preset_id, covered_preset_id, started_by) VALUES ($1,$2,$3) RETURNING *',
      [covering, covered, startedBy]
    );
    res.json(ins.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'העמדה כבר מכוסה' }); // unique partial index
    console.error('POST /api/position-merges', e);
    res.status(500).json({ error: 'Failed to create position merge' });
  }
});

// PATCH — פיצול ללא handover (בעלות נשמרת). אידמפוטנטי.
router.patch('/api/position-merges/:id/end', async (req, res) => {
  const id = num(req.params.id);
  if (id == null) return res.status(400).json({ error: 'bad id' });
  try {
    const r = await pool.query('UPDATE position_merges SET ended_at=NOW() WHERE id=$1 AND ended_at IS NULL RETURNING *', [id]);
    res.json(r.rows[0] || { id, already_ended: true });
  } catch (e) {
    console.error('PATCH /api/position-merges/:id/end', e);
    res.status(500).json({ error: 'Failed to end position merge' });
  }
});

// POST — פיצול עם handover: העברת בעלות נבחרת ל-B (העמדה המתפצלת) + סגירה. אטומי.
router.post('/api/position-merges/:id/handover', async (req, res) => {
  const id = num(req.params.id);
  const stripIds = intList(req.body.strip_ids);
  const signalIds = intList(req.body.signal_ids);
  if (id == null) return res.status(400).json({ error: 'bad id' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const mR = await client.query('SELECT * FROM position_merges WHERE id=$1', [id]);
    if (!mR.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'merge not found' }); }
    const covered = mR.rows[0].covered_preset_id; // B — מקבל בעלות
    if (stripIds.length) {
      await client.query('UPDATE strips SET workstation_preset_id=$1 WHERE id = ANY($2::int[])', [covered, stripIds]);
    }
    if (signalIds.length) {
      await client.query('UPDATE workstation_signals SET preset_id=$1 WHERE id = ANY($2::int[])', [covered, signalIds]);
    }
    await client.query('UPDATE position_merges SET ended_at=NOW() WHERE id=$1 AND ended_at IS NULL', [id]);
    await client.query('COMMIT');
    res.json({ id, covered_preset_id: covered, strips: stripIds.length, signals: signalIds.length });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /api/position-merges/:id/handover', e);
    res.status(500).json({ error: 'Handover failed' });
  } finally {
    client.release();
  }
});

export default router;
