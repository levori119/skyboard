import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

// --- Block Spaces API ---
router.get('/api/block-spaces', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM block_spaces ORDER BY name');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch block spaces' }); }
});

router.post('/api/block-spaces', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query('INSERT INTO block_spaces (name) VALUES ($1) RETURNING *', [name]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create block space' }); }
});

router.put('/api/block-spaces/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query('UPDATE block_spaces SET name=$1 WHERE id=$2 RETURNING *', [name, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update block space' }); }
});

router.delete('/api/block-spaces/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM block_spaces WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete block space' }); }
});

// --- Block Tables API ---
router.get('/api/block-tables', async (req, res) => {
  try {
    const tables = await pool.query('SELECT bt.*, bs.name as space_name FROM block_tables bt LEFT JOIN block_spaces bs ON bt.block_space_id = bs.id ORDER BY bt.name');
    const blocks = await pool.query('SELECT * FROM blocks ORDER BY alt_from DESC');
    const rows = tables.rows.map(t => ({ ...t, blocks: blocks.rows.filter(b => b.block_table_id === t.id) }));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch block tables' }); }
});

router.post('/api/block-tables', async (req, res) => {
  try {
    const { name, block_space_id, note, category } = req.body;
    const result = await pool.query(
      'INSERT INTO block_tables (name, block_space_id, note, category, updated_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING *',
      [name, block_space_id || null, note || null, category || null]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create block table' }); }
});

router.put('/api/block-tables/:id', async (req, res) => {
  try {
    const { name, block_space_id, note, category } = req.body;
    const result = await pool.query(
      'UPDATE block_tables SET name=$1, block_space_id=$2, note=$3, category=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [name, block_space_id || null, note || null, category || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update block table' }); }
});

router.delete('/api/block-tables/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM block_tables WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete block table' }); }
});

router.post('/api/block-tables/:id/duplicate', async (req, res) => {
  try {
    const srcId = req.params.id;
    const src = await pool.query('SELECT * FROM block_tables WHERE id=$1', [srcId]);
    if (src.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const orig = src.rows[0];
    const newTable = await pool.query(
      'INSERT INTO block_tables (name, block_space_id, note, category, updated_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [orig.name + ' (עותק)', orig.block_space_id, orig.note, orig.category]
    );
    const newId = newTable.rows[0].id;
    const blocks = await pool.query('SELECT * FROM blocks WHERE block_table_id=$1 ORDER BY sort_order', [srcId]);
    for (const blk of blocks.rows) {
      await pool.query(
        'INSERT INTO blocks (block_table_id, alt_from, alt_to, mission, color, workstations, platforms, sort_order, note, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())',
        [newId, blk.alt_from, blk.alt_to, blk.mission, blk.color, JSON.stringify(blk.workstations || []), JSON.stringify(blk.platforms || []), blk.sort_order, blk.note]
      );
    }
    res.json(newTable.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to duplicate block table' }); }
});

// --- Blocks API ---
router.get('/api/blocks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM blocks ORDER BY block_table_id, sort_order, alt_from');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching blocks:', err);
    res.status(500).json({ error: 'Failed to fetch blocks' });
  }
});

router.post('/api/blocks', async (req, res) => {
  try {
    const { block_table_id, alt_from, alt_to, mission, color, workstations, platforms, sort_order, note } = req.body;
    const result = await pool.query(
      'INSERT INTO blocks (block_table_id, alt_from, alt_to, mission, color, workstations, platforms, sort_order, note, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *',
      [block_table_id, alt_from, alt_to, mission || null, color || '#3b82f6', JSON.stringify(workstations || []), JSON.stringify(platforms || []), sort_order || 0, note || null]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create block' }); }
});

router.put('/api/blocks/:id', async (req, res) => {
  try {
    const { alt_from, alt_to, mission, color, workstations, platforms, sort_order, note } = req.body;
    const result = await pool.query(
      'UPDATE blocks SET alt_from=$1, alt_to=$2, mission=$3, color=$4, workstations=$5, platforms=$6, sort_order=$7, note=$8, updated_at=NOW() WHERE id=$9 RETURNING *',
      [alt_from, alt_to, mission || null, color || '#3b82f6', JSON.stringify(workstations || []), JSON.stringify(platforms || []), sort_order || 0, note || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update block' }); }
});

router.delete('/api/blocks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM blocks WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete block' }); }
});

// --- Strip block_space / block_deviation ---
router.patch('/api/strips/:id/block-space', async (req, res) => {
  try {
    const { block_space_id } = req.body;
    const result = await pool.query('UPDATE strips SET block_space_id=$1 WHERE id=$2 RETURNING *', [block_space_id || null, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update strip block space' }); }
});

router.patch('/api/strips/:id/block-deviation', async (req, res) => {
  try {
    const { block_deviation } = req.body;
    const result = await pool.query('UPDATE strips SET block_deviation=$1 WHERE id=$2 RETURNING *', [!!block_deviation, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update block deviation' }); }
});

export default router;
