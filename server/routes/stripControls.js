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

const FIELD_TYPES = new Set(['button', 'field', 'flag', 'select', 'multiselect']);
const INPUT_MODES = new Set(['keyboard', 'handwriting', 'both']);
const SCOPES = new Set(['window', 'global']);

/** שורת DB → הצורה שהלקוח עובד בה (`StripControl`) */
const toFieldDef = (r) => ({
  id: r.id,
  key: r.key,
  label: r.label || '',
  type: r.type,
  input: r.input_mode || 'keyboard',
  scope: r.scope,
  values: Array.isArray(r.values_json) ? r.values_json : [],
  defaultValue: r.default_value,
  styles: Array.isArray(r.styles_json) ? r.styles_json : [],
});

/** נרמול קלט. מה שאינו מוכר נופל לברירת מחדל במקום להישמר שבור */
const readFieldBody = (b = {}) => ({
  label: String(b.label ?? '').slice(0, 120),
  type: FIELD_TYPES.has(b.type) ? b.type : 'field',
  input: INPUT_MODES.has(b.input) ? b.input : 'keyboard',
  scope: SCOPES.has(b.scope) ? b.scope : 'global',
  values: Array.isArray(b.values) ? b.values.map(v => String(v)).filter(v => v.trim() !== '') : [],
  defaultValue: b.defaultValue ?? null,
  styles: Array.isArray(b.styles) ? b.styles : [],
});

// ─── קטלוג השדות המותאמים ────────────────────────────────────────────────────
// מקור אמת יחיד להגדרת שדה/פקד. נערך מעורך הסטריפ **ומ**מוד הטבלה, ונבחר
// בשניהם - ולכן הוא טבלה ולא הגדרה מוטבעת בתבנית.

router.get('/api/strip-field-defs', async (_req, res) => {
  try {
    const r = await pool.query('SELECT * FROM strip_field_defs ORDER BY label, id');
    res.json(r.rows.map(toFieldDef));
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.post('/api/strip-field-defs', async (req, res) => {
  const f = readFieldBody(req.body);
  try {
    // המפתח נוצר בשרת מרצף ייעודי ואינו נחשף למנהל: הוא מזהה טכני, ושתי
    // עמדות שמוסיפות שדה באותו רגע לא יכולות לקבל את אותו מפתח
    const r = await pool.query(
      `INSERT INTO strip_field_defs (key, label, type, input_mode, scope, values_json, default_value, styles_json)
       VALUES ('fld_' || nextval('strip_field_key_seq'), $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
       RETURNING *`,
      [f.label, f.type, f.input, f.scope, JSON.stringify(f.values), JSON.stringify(f.defaultValue), JSON.stringify(f.styles)]
    );
    res.json(toFieldDef(r.rows[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.put('/api/strip-field-defs/:id', async (req, res) => {
  const f = readFieldBody(req.body);
  try {
    const r = await pool.query(
      `UPDATE strip_field_defs
          SET label=$1, type=$2, input_mode=$3, scope=$4, values_json=$5::jsonb,
              default_value=$6::jsonb, styles_json=$7::jsonb, updated_at=NOW()
        WHERE id=$8 RETURNING *`,
      [f.label, f.type, f.input, f.scope, JSON.stringify(f.values), JSON.stringify(f.defaultValue), JSON.stringify(f.styles), req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(toFieldDef(r.rows[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// מחיקת ההגדרה **אינה** מוחקת ערכים שנשמרו: שדה שהוחזר בטעות מחזיר איתו את
// התוכן. ניקוי ערכים הוא פעולה מפורשת ונפרדת (CIV_STRIP_CONTROLS.md §8.2)
router.delete('/api/strip-field-defs/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_field_defs WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

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
