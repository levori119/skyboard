// ─── נקודות העברה זמניות (Provisional Transfer Points) ─────────────────────────
// נקודת העברה ad-hoc בין 2 עמדות, נוצרת בזמן אמת (תפריט "יצירה"), לא במסך ניהול.
// preset_a יוצר → status 'pending'. preset_b מאשר → 'active'. דו-כיוונית.
// גרירת פ"מ אליה = העברה station-to-station לעמדה השנייה (מנגנון קיים) + touch של last_used_at.
// ניקוי אוטומטי (cleanupProvisionalTransferPoints): >12ש' ללא שימוש וגם אחרי חצות.
import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// GET — כל הנקודות שרלוונטיות לעמדה (יוצרת או שנייה), עם השם של העמדה השנייה.
router.get('/api/provisional-transfer-points', async (req, res) => {
  try {
    const presetId = num(req.query.preset_id);
    if (presetId == null) return res.status(400).json({ error: 'preset_id required' });
    const r = await pool.query(
      `SELECT p.*, pa.name AS preset_a_name, pb.name AS preset_b_name
       FROM provisional_transfer_points p
       LEFT JOIN workstation_presets pa ON p.preset_a = pa.id
       LEFT JOIN workstation_presets pb ON p.preset_b = pb.id
       WHERE p.preset_a = $1 OR p.preset_b = $1
       ORDER BY p.created_at DESC`,
      [presetId]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('GET /api/provisional-transfer-points', e);
    res.status(500).json({ error: 'Failed to fetch provisional transfer points' });
  }
});

// POST — יצירה (pending). body: name, preset_a, preset_b, notes, created_by
router.post('/api/provisional-transfer-points', async (req, res) => {
  try {
    const name = (req.body?.name || '').trim();
    const presetA = num(req.body?.preset_a);
    const presetB = num(req.body?.preset_b);
    const notes = req.body?.notes ?? null;
    const createdBy = req.body?.created_by ?? null;
    if (!name) return res.status(400).json({ error: 'name required' });
    if (presetA == null || presetB == null) return res.status(400).json({ error: 'preset_a/preset_b required' });
    if (presetA === presetB) return res.status(400).json({ error: 'עמדה אינה יכולה ליצור נקודה מול עצמה' });
    const ins = await pool.query(
      `INSERT INTO provisional_transfer_points (name, preset_a, preset_b, notes, created_by, status)
       VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *`,
      [name, presetA, presetB, notes, createdBy]
    );
    res.json(ins.rows[0]);
  } catch (e) {
    console.error('POST /api/provisional-transfer-points', e);
    res.status(500).json({ error: 'Failed to create provisional transfer point' });
  }
});

// POST /:id/approve — העמדה השנייה מאשרת → active
router.post('/api/provisional-transfer-points/:id/approve', async (req, res) => {
  try {
    const id = num(req.params.id);
    const r = await pool.query(
      `UPDATE provisional_transfer_points
       SET status='active', approved_at=NOW(), last_used_at=NOW()
       WHERE id=$1 AND status='pending' RETURNING *`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'not found or already approved' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('approve provisional', e);
    res.status(500).json({ error: 'Failed to approve' });
  }
});

// POST /:id/touch — עדכון last_used_at (נקרא כשמעבירים פ"מ דרך הנקודה)
router.post('/api/provisional-transfer-points/:id/touch', async (req, res) => {
  try {
    const id = num(req.params.id);
    await pool.query('UPDATE provisional_transfer_points SET last_used_at=NOW() WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error('touch provisional', e);
    res.status(500).json({ error: 'Failed to touch' });
  }
});

// PATCH /:id/pos — מיקום על המפה פר-עמדה (גרירה). body: which('a'|'b'), x, y (או null לניתוק)
router.patch('/api/provisional-transfer-points/:id/pos', async (req, res) => {
  try {
    const id = num(req.params.id);
    const which = req.body?.which === 'b' ? 'b' : 'a';
    const x = req.body?.x == null ? null : Number(req.body.x);
    const y = req.body?.y == null ? null : Number(req.body.y);
    const r = await pool.query(
      `UPDATE provisional_transfer_points SET pos_${which}_x=$1, pos_${which}_y=$2 WHERE id=$3 RETURNING *`,
      [x, y, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('pos provisional', e);
    res.status(500).json({ error: 'Failed to set position' });
  }
});

// DELETE /:id — ביטול ידני (כל אחת מהעמדות)
router.delete('/api/provisional-transfer-points/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM provisional_transfer_points WHERE id=$1', [num(req.params.id)]);
    res.json({ success: true });
  } catch (e) {
    console.error('delete provisional', e);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ניקוי אוטומטי: >12ש' ללא שימוש **וגם** עבר חצות מאז (date_trunc יום < עכשיו).
// שני התנאים מבוססי NOW() → עקבי-tz. נקרא תקופתית מ-server.js.
export async function cleanupProvisionalTransferPoints() {
  try {
    const r = await pool.query(
      `DELETE FROM provisional_transfer_points
       WHERE last_used_at < NOW() - INTERVAL '12 hours'
         AND last_used_at < date_trunc('day', NOW())`
    );
    if (r.rowCount) console.log(`[cleanup] provisional transfer points removed: ${r.rowCount}`);
  } catch (e) {
    console.error('cleanupProvisionalTransferPoints', e);
  }
}

export default router;
