import { Router } from 'express';
import pool from '../db/pool.js';
const router = new Router();

// ─── ניהול תרגומים (i18n) ─────────────────────────────────────────────────────
// ברירות המחדל חיות בקבצים (src/i18n/registry/*.json, ב-git). הטבלה מחזיקה **רק
// דריסות** שנערכו ממסך הניהול — ולכן ניתן לשנות כל שם, בעברית או באנגלית,
// בלי לגעת בקוד ובלי build מחדש.

// כל הדריסות (נטען בעליית האפליקציה)
router.get('/api/translations', async (req, res) => {
  try {
    const r = await pool.query('SELECT key, he, en FROM translations');
    res.json(r.rows);
  } catch (err) {
    console.error('Error fetching translations:', err);
    res.status(500).json({ error: 'Failed to fetch translations' });
  }
});

// שמירה (bulk upsert) — רק מפתחות שהמשתמש באמת שינה
router.put('/api/translations', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows, updatedBy } = req.body || {};
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });

    await client.query('BEGIN');
    for (const r of rows) {
      if (!r || typeof r.key !== 'string' || !r.key.includes('.')) continue;
      await client.query(
        `INSERT INTO translations (key, he, en, updated_at, updated_by)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
         ON CONFLICT (key) DO UPDATE
           SET he = EXCLUDED.he, en = EXCLUDED.en,
               updated_at = CURRENT_TIMESTAMP, updated_by = EXCLUDED.updated_by`,
        [r.key, r.he ?? null, r.en ?? null, updatedBy ?? null]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, saved: rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error saving translations:', err);
    res.status(500).json({ error: 'Failed to save translations' });
  } finally {
    client.release();
  }
});

// איפוס מפתח לברירת המחדל שבקובץ (מחיקת הדריסה בלבד — הקובץ לא נוגע)
router.delete('/api/translations/:key', async (req, res) => {
  try {
    await pool.query('DELETE FROM translations WHERE key = $1', [req.params.key]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error resetting translation:', err);
    res.status(500).json({ error: 'Failed to reset translation' });
  }
});

export default router;
