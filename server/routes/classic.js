import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

// --- Classic Strip Tables API ---
router.get('/api/classic-strip-tables', async (req, res) => {
  try {
    const tables = await pool.query('SELECT * FROM classic_strip_tables ORDER BY name');
    const rows = await pool.query('SELECT * FROM classic_strip_rows ORDER BY table_id, row_number');
    const result = tables.rows.map(t => ({
      ...t,
      rows: rows.rows.filter(r => r.table_id === t.id)
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch classic strip tables' });
  }
});

router.post('/api/classic-strip-tables', async (req, res) => {
  try {
    const { name, mode } = req.body;
    const dup = await pool.query('SELECT id FROM classic_strip_tables WHERE LOWER(name) = LOWER($1)', [name]);
    if (dup.rows.length) return res.status(409).json({ error: 'שם תבנית כבר קיים' });
    const tableMode = mode || '3rows';
    const result = await pool.query('INSERT INTO classic_strip_tables (name, mode) VALUES ($1, $2) RETURNING *', [name, tableMode]);
    const t = result.rows[0];
    if (tableMode === '3rows') {
      const defaultFields = ['callSign', 'alt', 'task'];
      for (let i = 1; i <= 3; i++) {
        await pool.query(
          `INSERT INTO classic_strip_rows (table_id, row_number, field_name, font_size, bold, text_align)
           VALUES ($1, $2, $3, 14, $4, 'center') ON CONFLICT DO NOTHING`,
          [t.id, i, defaultFields[i - 1], i === 1]
        );
      }
    }
    const rows = await pool.query('SELECT * FROM classic_strip_rows WHERE table_id = $1 ORDER BY row_number', [t.id]);
    res.json({ ...t, rows: rows.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create classic strip table' });
  }
});

router.put('/api/classic-strip-tables/:id', async (req, res) => {
  try {
    const { name } = req.body;
    await pool.query('UPDATE classic_strip_tables SET name = $1 WHERE id = $2', [name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update classic strip table' });
  }
});

router.delete('/api/classic-strip-tables/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM classic_strip_tables WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete classic strip table' });
  }
});

router.put('/api/classic-strip-tables/:id/layout', async (req, res) => {
  try {
    const { layout_json, conditions_json, strip_height } = req.body;
    const result = await pool.query(
      'UPDATE classic_strip_tables SET layout_json=$1, conditions_json=$2, strip_height=COALESCE($4, strip_height) WHERE id=$3 RETURNING *',
      [
        layout_json != null ? JSON.stringify(layout_json) : null,
        conditions_json != null ? JSON.stringify(conditions_json) : null,
        req.params.id,
        strip_height != null ? Number(strip_height) : null,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: String(err) }); }
});

// Update all 3 rows for a table at once
router.put('/api/classic-strip-tables/:id/rows', async (req, res) => {
  try {
    const { rows } = req.body;
    for (const row of rows) {
      await pool.query(
        `INSERT INTO classic_strip_rows (table_id, row_number, field_name, editable, text_color, bg_color, font_size, bold, italic, underline, border_color, border_width, text_align, row_label, fields, separator)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (table_id, row_number) DO UPDATE SET
           field_name = $3, editable = $4, text_color = $5, bg_color = $6, font_size = $7, bold = $8, italic = $9, underline = $10, border_color = $11, border_width = $12, text_align = $13, row_label = $14, fields = $15, separator = $16`,
        [req.params.id, row.row_number, row.field_name || null, row.editable || false, row.text_color || '', row.bg_color || '', row.font_size || 14, row.bold || false, row.italic || false, row.underline || false, row.border_color || '', row.border_width || 0, row.text_align || 'center', row.row_label || '', row.fields ? JSON.stringify(row.fields) : null, row.separator || ' / ']
      );
    }
    const result = await pool.query('SELECT * FROM classic_strip_rows WHERE table_id = $1 ORDER BY row_number', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update classic strip rows' });
  }
});

// --- Strip Window Layouts API ---
router.get('/api/strip-window-layouts', async (req, res) => {
  try {
    const layouts = await pool.query('SELECT * FROM strip_window_layouts ORDER BY name');
    const result = [];
    for (const lay of layouts.rows) {
      const cols = await pool.query('SELECT * FROM strip_window_columns WHERE layout_id=$1 ORDER BY col_index', [lay.id]);
      const columns = [];
      for (const col of cols.rows) {
        const cells = await pool.query('SELECT * FROM strip_window_cells WHERE column_id=$1 ORDER BY row_index', [col.id]);
        columns.push({ ...col, cells: cells.rows });
      }
      result.push({ ...lay, columns });
    }
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

router.post('/api/strip-window-layouts', async (req, res) => {
  try {
    const { name, layout_json } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const dup = await pool.query('SELECT id FROM strip_window_layouts WHERE LOWER(name) = LOWER($1)', [name]);
    if (dup.rows.length) return res.status(409).json({ error: 'שם חלון סטריפים כבר קיים' });
    const r = await pool.query(
      'INSERT INTO strip_window_layouts (name, layout_json) VALUES ($1, $2) RETURNING *',
      [name, layout_json != null ? JSON.stringify(layout_json) : null]
    );
    res.json({ ...r.rows[0], columns: [] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

router.put('/api/strip-window-layouts/:id', async (req, res) => {
  try {
    const { name, layout_json } = req.body;
    const r = await pool.query(
      'UPDATE strip_window_layouts SET name=$1, layout_json=$2 WHERE id=$3 RETURNING *',
      [name, layout_json != null ? JSON.stringify(layout_json) : null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

router.delete('/api/strip-window-layouts/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_window_layouts WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

// --- Strip Window Columns ---
router.post('/api/strip-window-layouts/:id/columns', async (req, res) => {
  try {
    const layoutId = req.params.id;
    const maxIdx = await pool.query('SELECT COALESCE(MAX(col_index),0) AS m FROM strip_window_columns WHERE layout_id=$1', [layoutId]);
    const nextIdx = (maxIdx.rows[0].m || 0) + 1;
    const r = await pool.query('INSERT INTO strip_window_columns (layout_id, col_index, width) VALUES ($1,$2,120) RETURNING *', [layoutId, nextIdx]);
    res.json({ ...r.rows[0], cells: [] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

router.delete('/api/strip-window-columns/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_window_columns WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

// --- Strip Window Cells ---
router.post('/api/strip-window-columns/:id/cells', async (req, res) => {
  try {
    const colId = req.params.id;
    const maxIdx = await pool.query('SELECT COALESCE(MAX(row_index),0) AS m FROM strip_window_cells WHERE column_id=$1', [colId]);
    const nextIdx = (maxIdx.rows[0].m || 0) + 1;
    const r = await pool.query("INSERT INTO strip_window_cells (column_id, row_index, waypoint, bg_color, header_color) VALUES ($1,$2,'','#1e293b','#f1f5f9') RETURNING *", [colId, nextIdx]);
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

router.put('/api/strip-window-cells/:id', async (req, res) => {
  try {
    const { waypoint, bg_color, header_color } = req.body;
    const r = await pool.query('UPDATE strip_window_cells SET waypoint=$1, bg_color=$2, header_color=$3 WHERE id=$4 RETURNING *',
      [waypoint ?? '', bg_color ?? '#1e293b', header_color ?? '#f1f5f9', req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

router.delete('/api/strip-window-cells/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_window_cells WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

export default router;
