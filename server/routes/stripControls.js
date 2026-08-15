// ─── ערכי פקדים על הפ"מ ──────────────────────────────────────────────────────
// שני מחסנים, לפי ההיקף שהוגדר לפקד (CIV_STRIP_CONTROLS.md §4):
//   window - `strip_control_values`, מפתח (פ"מ, עמדה, מפתח פקד)
//   global - `strips.custom_fields`, מפתח (פ"מ, מפתח פקד)
//
// שתי הכתיבות הן **נקודתיות למפתח**: שתי עמדות שמשנות שני פקדים שונים על אותו
// פ"מ באותו רגע לא דורסות זו את זו (מטריצת המקרים §8.4, מקרה 20). לכן הגלובלי
// עובר ב-`jsonb_set` על המפתח ולא בכתיבה מחדש של כל `custom_fields`.
import { Router } from 'express';
import pool from '../db/pool.js';

const router = new Router();

/** מפתח פקד: אותיות, ספרות וקו תחתון בלבד - כדי שיהיה בטוח כמפתח JSONB וכשם שדה בשאילתא */
const VALID_KEY = /^[A-Za-z0-9_]{1,64}$/;

// כל ערכי הפקדים הפנימיים של לוח, לפי פ"מ: { [strip_id]: { [key]: value } }
router.get('/api/strip-control-values', async (req, res) => {
  const { preset_id } = req.query;
  if (!preset_id) return res.status(400).json({ error: 'preset_id required' });
  try {
    const r = await pool.query(
      'SELECT strip_id, control_key, value FROM strip_control_values WHERE preset_id = $1',
      [preset_id]
    );
    const byStrip = {};
    for (const row of r.rows) {
      if (!byStrip[row.strip_id]) byStrip[row.strip_id] = {};
      byStrip[row.strip_id][row.control_key] = row.value;
    }
    res.json(byStrip);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ערך פקד **פנימי ללוח**
router.put('/api/strip-control-values', async (req, res) => {
  const { strip_id, preset_id, control_key, value } = req.body;
  if (!strip_id || !preset_id || !control_key) return res.status(400).json({ error: 'strip_id, preset_id, control_key required' });
  if (!VALID_KEY.test(String(control_key))) return res.status(400).json({ error: 'invalid control_key' });
  try {
    const r = await pool.query(
      `INSERT INTO strip_control_values (strip_id, preset_id, control_key, value, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (strip_id, preset_id, control_key)
       DO UPDATE SET value = $4::jsonb, updated_at = NOW()
       RETURNING strip_id, preset_id, control_key, value`,
      [strip_id, preset_id, control_key, JSON.stringify(value ?? null)]
    );
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ערך פקד **גלובלי לפ"מ**. `jsonb_set` על המפתח בלבד; `COALESCE` כי `custom_fields`
// של פ"מ ותיק יכול להיות NULL, ואז `jsonb_set` היה מחזיר NULL ומוחק את כל השדות.
router.put('/api/strips/:id/control-field', async (req, res) => {
  const { control_key, value } = req.body;
  if (!control_key) return res.status(400).json({ error: 'control_key required' });
  if (!VALID_KEY.test(String(control_key))) return res.status(400).json({ error: 'invalid control_key' });
  try {
    const r = await pool.query(
      `UPDATE strips
          SET custom_fields = jsonb_set(COALESCE(custom_fields, '{}'::jsonb), ARRAY[$2::text], $3::jsonb, true)
        WHERE id = $1
        RETURNING id, custom_fields`,
      [req.params.id, control_key, JSON.stringify(value ?? null)]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Strip not found' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

export default router;
