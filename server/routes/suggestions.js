// הערות והצעות — משוב מהמפעיל בשטח למנהל המערכת הטכני.
// המפעיל שולח מחלון "אודות" בכל עמדה (SectorDashboard), מנהל המערכת רואה את
// הרשימה בטאב "הערות והצעות" במסך הניהול.
//
// הטבלה היא **קונפיג** (server/db/env-tables.js): הצעה שנשלחה מתוך סביבת תרגול
// צריכה להגיע לאותה רשימה של המנהל, ולא להיעלם עם שחרור הסביבה.
import { Router } from 'express';
import pool from '../db/pool.js';

const router = new Router();

export const SUGGESTION_STATUSES = ['new', 'in_review', 'done', 'rejected'];

const clip = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

// רשימה — החדשה ביותר ראשונה. ?status=new לסינון.
router.get('/api/suggestions', async (req, res) => {
  try {
    const status = SUGGESTION_STATUSES.includes(req.query.status) ? req.query.status : null;
    const result = await pool.query(
      `SELECT * FROM suggestions ${status ? 'WHERE status = $1' : ''} ORDER BY created_at DESC`,
      status ? [status] : [],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching suggestions:', err);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// הגשת הצעה. תאריך ושעה נקבעים בשרת (created_at DEFAULT NOW()) ולא ע"י הלקוח.
router.post('/api/suggestions', async (req, res) => {
  try {
    const full_name = clip(req.body?.full_name, 100);
    const subject = clip(req.body?.subject, 200);
    const details = String(req.body?.details ?? '').trim();
    if (!full_name || !subject || !details) return res.status(400).json({ error: 'missing_fields' });
    const presetId = Number(req.body?.preset_id);
    const result = await pool.query(
      `INSERT INTO suggestions (full_name, phone, unit, subject, details, preset_id, preset_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        full_name,
        clip(req.body?.phone, 40),
        clip(req.body?.unit, 100),
        subject,
        details.slice(0, 5000),
        Number.isFinite(presetId) && presetId > 0 ? presetId : null,
        clip(req.body?.preset_name, 100),
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating suggestion:', err);
    res.status(500).json({ error: 'Failed to create suggestion' });
  }
});

// טיפול של מנהל המערכת — סטטוס והערת מנהל בלבד; תוכן ההצעה עצמה לא נערך.
router.patch('/api/suggestions/:id', async (req, res) => {
  try {
    const status = SUGGESTION_STATUSES.includes(req.body?.status) ? req.body.status : null;
    const hasNote = Object.prototype.hasOwnProperty.call(req.body || {}, 'admin_note');
    if (!status && !hasNote) return res.status(400).json({ error: 'nothing_to_update' });
    const result = await pool.query(
      `UPDATE suggestions
         SET status = COALESCE($1, status),
             admin_note = CASE WHEN $2::boolean THEN $3 ELSE admin_note END,
             updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, hasNote, hasNote ? clip(req.body.admin_note, 2000) : null, req.params.id],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'suggestion_not_found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating suggestion:', err);
    res.status(500).json({ error: 'Failed to update suggestion' });
  }
});

router.delete('/api/suggestions/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM suggestions WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'suggestion_not_found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting suggestion:', err);
    res.status(500).json({ error: 'Failed to delete suggestion' });
  }
});

export default router;
