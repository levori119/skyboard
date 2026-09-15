// ─── FLOW של פ"מ - קריאה ──────────────────────────────────────────────────────
// הרישום עצמו יושב בנתיבים התפעוליים (העברות, קרקע, נחיתה) דרך
// server/db/stripFlowEvents.js. כאן רק מגישים. ראה STRIP_FLOW_SPEC.md.
import { Router } from 'express';
import pool from '../db/pool.js';
import { loadFlows, MAX_FLOW_STRIPS } from '../db/stripFlowEvents.js';

const router = new Router();

router.get('/api/strips/:id/flow', async (req, res) => {
  try {
    const [flow] = await loadFlows(pool, [req.params.id]);
    if (!flow) return res.status(404).json({ error: 'Strip not found' });
    res.json(flow);
  } catch (err) {
    console.error('GET strip flow:', err.message);
    res.status(500).json({ error: 'Failed to load strip flow' });
  }
});

// FLOW מרוכז - הלקוח שולח את הפ"מים שנשארו אחרי השאילתא שלו
router.get('/api/strip-flows', async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_FLOW_STRIPS);
    res.json({ flows: await loadFlows(pool, ids) });
  } catch (err) {
    console.error('GET strip flows:', err.message);
    res.status(500).json({ error: 'Failed to load strip flows' });
  }
});

export default router;
