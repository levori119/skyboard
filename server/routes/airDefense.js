/**
 * **הגנ"ש** (הגנת שמי המדינה) - ה-API של הקטלוג הטכני (שלב א).
 *
 * שלוש ישויות: סוגי איום, מערכות אש, מערכות גילוי - ולכל מערכת **טבלת יעילות**
 * מול סוגי האיום. אפיון מלא: AIR_DEFENSE_SPEC.md.
 *
 * ── מה השרת לא עושה כאן, בכוונה ───────────────────────────────────────────
 * **גיאומטריה וחישוב כיסוי.** אלה נשענים על המפה, העוגנים והאזורים של העמדה
 * ולכן יושבים בליבה הטהורה `src/utils/airDefense.ts` - מימוש אחד, בדוק
 * ב-vitest, שמשרת את הטופס, את התצוגה ואת חישוב הפערים. מימוש שני בשרת היה
 * נשבר בשקט ברגע שאחד מהם משתנה (אותו כלל של הלאמת אזור זמני).
 *
 * השרת כן אוכף את חוקי ה**נתונים** - טווח האחוזים, זהות המערכת, ומחיקה שיש
 * לה תלויות - כי אלה נכונים בלי קשר למי שולח את הבקשה.
 */

import { Router } from 'express';
import pool from '../db/pool.js';

const router = new Router();

/** שתי משפחות הקטלוג. המפתח בנתיב → הטבלאות והעמודות שלו. */
const FAMILIES = {
  weapon: {
    table: 'ad_weapon_systems',
    eff: 'ad_weapon_effectiveness',
    columns: ['name', 'kind', 'range_nm', 'missile_type', 'guidance',
      'sector_from_deg', 'sector_to_deg', 'alt_min', 'alt_max', 'color', 'enabled'],
  },
  sensor: {
    table: 'ad_sensor_systems',
    eff: 'ad_sensor_effectiveness',
    columns: ['name', 'kind', 'range_nm', 'detect_from_deg', 'detect_to_deg',
      'track_from_deg', 'track_to_deg', 'alt_min', 'alt_max', 'color', 'enabled'],
  },
};

const KINDS = new Set(['ground', 'air']);

const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const intOrNull = (v) => { const n = numOrNull(v); return n === null ? null : Math.round(n); };
const str = (v, max) => String(v ?? '').trim().slice(0, max);

/**
 * אחוז יעילות: שלם 0-100, או `null` על קלט פסול.
 *
 * **דוחה ולא מהדק.** 150 שהופך ל-100 בשקט הוא נתון שגוי שנראה תקין, וכאן
 * חישוב הכיסוי המבצעי נשען עליו. אותה הכרעה בדיוק ב-`clampQualityPct` בלקוח.
 */
function qualityPct(v) {
  const n = numOrNull(v);
  if (n === null) return null;
  const r = Math.round(n);
  return r < 0 || r > 100 ? null : r;
}

/** גוף לשמירת מערכת - רק העמודות של המשפחה, מנוקות לפי סוגן. */
function systemBody(family, body) {
  const out = {};
  for (const col of FAMILIES[family].columns) {
    if (col === 'name' || col === 'missile_type') out[col] = str(body[col], 120) || null;
    else if (col === 'kind') out[col] = KINDS.has(body[col]) ? body[col] : 'ground';
    else if (col === 'guidance') out[col] = body[col] === 'radar' || body[col] === 'ir' ? body[col] : null;
    else if (col === 'color') out[col] = str(body[col], 20) || null;
    else if (col === 'enabled') out[col] = body[col] === undefined ? true : !!body[col];
    else if (col === 'alt_min' || col === 'alt_max') out[col] = intOrNull(body[col]);
    else out[col] = numOrNull(body[col]);
  }
  // הגובה מנורמל כאן ולא רק בטופס: אותה שורה יכולה להגיע מ-API, ותקרה מתחת
  // לרצפה הופכת כל חישוב חפיפה ל"אין כיסוי" בלי שאיש יראה למה.
  if (out.alt_min !== null && out.alt_max !== null && out.alt_min > out.alt_max) {
    [out.alt_min, out.alt_max] = [out.alt_max, out.alt_min];
  }
  return out;
}

const familyOf = (req, res) => {
  const f = FAMILIES[req.params.family];
  if (!f) { res.status(404).json({ error: 'משפחת קטלוג לא מוכרת' }); return null; }
  return f;
};

// ── סוגי איום ───────────────────────────────────────────────────────────────

router.get('/api/air-defense/threat-types', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ad_threat_types ORDER BY sort_order, name');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/air-defense/threat-types', async (req, res) => {
  try {
    const name = str(req.body?.name, 100);
    if (!name) return res.status(400).json({ error: 'שם סוג האיום חסר' });
    const { rows } = await pool.query(
      `INSERT INTO ad_threat_types (name, sort_order)
       VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING *`,
      [name, intOrNull(req.body?.sort_order) ?? 0],
    );
    if (!rows[0]) return res.status(409).json({ error: 'סוג איום בשם הזה כבר קיים' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/air-defense/threat-types/:id', async (req, res) => {
  try {
    const name = str(req.body?.name, 100);
    if (!name) return res.status(400).json({ error: 'שם סוג האיום חסר' });
    const { rows } = await pool.query(
      `UPDATE ad_threat_types SET name=$1, sort_order=$2, enabled=$3 WHERE id=$4 RETURNING *`,
      [name, intOrNull(req.body?.sort_order) ?? 0, req.body?.enabled === undefined ? true : !!req.body.enabled, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'סוג האיום לא נמצא' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'סוג איום בשם הזה כבר קיים' });
    res.status(500).json({ error: err.message });
  }
});

/**
 * מחיקת סוג איום. **נחסמת** כשיש לו שורות יעילות - מחיקה כזו הייתה מוחקת
 * בשקט (CASCADE) את כל ההערכות שהוזנו מולו, ואיש לא היה יודע שהכיסוי ירד.
 * ההודעה אומרת **כמה** תלויות יש, כדי שההחלטה תהיה מושכלת.
 */
router.delete('/api/air-defense/threat-types/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT (SELECT COUNT(*) FROM ad_weapon_effectiveness WHERE threat_type_id=$1)
            + (SELECT COUNT(*) FROM ad_sensor_effectiveness WHERE threat_type_id=$1) AS used`,
      [req.params.id],
    );
    const used = Number(rows[0]?.used || 0);
    if (used > 0) return res.status(409).json({ error: `לסוג האיום יש ${used} הערכות יעילות`, used });
    await pool.query('DELETE FROM ad_threat_types WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── מערכות (אש / גילוי) ─────────────────────────────────────────────────────

/** רשימת המערכות של המשפחה, **כולל** טבלת היעילות של כל אחת (קריאה אחת). */
router.get('/api/air-defense/:family/systems', async (req, res) => {
  const fam = familyOf(req, res);
  if (!fam) return;
  try {
    const { rows } = await pool.query(`SELECT * FROM ${fam.table} ORDER BY name`);
    const { rows: eff } = await pool.query(
      `SELECT e.*, t.name AS threat_name FROM ${fam.eff} e
         JOIN ad_threat_types t ON t.id = e.threat_type_id
        ORDER BY t.sort_order, t.name`,
    );
    const bySystem = new Map();
    for (const row of eff) {
      if (!bySystem.has(row.system_id)) bySystem.set(row.system_id, []);
      bySystem.get(row.system_id).push(row);
    }
    res.json(rows.map(r => ({ ...r, effectiveness: bySystem.get(r.id) || [] })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/air-defense/:family/systems', async (req, res) => {
  const fam = familyOf(req, res);
  if (!fam) return;
  try {
    const body = systemBody(req.params.family, req.body || {});
    if (!body.name) return res.status(400).json({ error: 'שם המערכת חסר' });
    const cols = fam.columns;
    const { rows } = await pool.query(
      `INSERT INTO ${fam.table} (${cols.join(',')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      cols.map(c => body[c]),
    );
    res.json({ ...rows[0], effectiveness: [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/air-defense/:family/systems/:id', async (req, res) => {
  const fam = familyOf(req, res);
  if (!fam) return;
  try {
    const body = systemBody(req.params.family, req.body || {});
    if (!body.name) return res.status(400).json({ error: 'שם המערכת חסר' });
    const cols = fam.columns;
    const { rows } = await pool.query(
      `UPDATE ${fam.table} SET ${cols.map((c, i) => `${c}=$${i + 1}`).join(', ')},
              updated_at=NOW()
        WHERE id=$${cols.length + 1} RETURNING *`,
      [...cols.map(c => body[c]), req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'המערכת לא נמצאה' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * מחיקת מערכת. בשלב א אין עדיין טבלאות פריסה, ולכן המחיקה מוחקת גם את שורות
 * היעילות שלה (CASCADE) - הן חסרות משמעות בלעדיה.
 *
 * ⚠️ בשלב ב, כשייכנסו `ad_*_assets`, המחיקה חייבת להיחסם כשיש אמצעים פרוסים
 * (RESTRICT) - מקרה 5 במטריצת המקרים.
 */
router.delete('/api/air-defense/:family/systems/:id', async (req, res) => {
  const fam = familyOf(req, res);
  if (!fam) return;
  try {
    await pool.query(`DELETE FROM ${fam.table} WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── טבלת היעילות ────────────────────────────────────────────────────────────

/**
 * שמירת אחוז יעילות לצמד (מערכת, איום). UPSERT על ה-UNIQUE - הטופס שולח את
 * אותו צמד שוב ושוב, וכפילות כאן הייתה מייצרת שתי הערכות סותרות לאותו איום.
 *
 * **אפס נשמר כשורה** ולא נמחק: "בדקנו והמערכת אינה מתמודדת" ו"לא הוזן" מגיעים
 * שניהם ל-`none` בחישוב, אבל רק הראשון הוא ידיעה - והמסך מראה את ההבדל.
 */
router.put('/api/air-defense/:family/systems/:id/effectiveness', async (req, res) => {
  const fam = familyOf(req, res);
  if (!fam) return;
  try {
    const threatId = intOrNull(req.body?.threat_type_id);
    const pct = qualityPct(req.body?.quality_pct);
    if (!threatId) return res.status(400).json({ error: 'סוג האיום חסר' });
    if (pct === null) return res.status(400).json({ error: 'אחוז היעילות חייב להיות מספר שלם בין 0 ל-100' });
    const { rows } = await pool.query(
      `INSERT INTO ${fam.eff} (system_id, threat_type_id, quality_pct, note)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (system_id, threat_type_id)
       DO UPDATE SET quality_pct = EXCLUDED.quality_pct, note = EXCLUDED.note, updated_at = NOW()
       RETURNING *`,
      [req.params.id, threatId, pct, str(req.body?.note, 500) || null],
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'המערכת או סוג האיום לא נמצאו' });
    res.status(500).json({ error: err.message });
  }
});

/** ניקוי הערכה לצמד - חזרה ל"לא הוזן" (שאינו כיסוי, ראה §2.4). */
router.delete('/api/air-defense/:family/systems/:id/effectiveness/:threatId', async (req, res) => {
  const fam = familyOf(req, res);
  if (!fam) return;
  try {
    await pool.query(`DELETE FROM ${fam.eff} WHERE system_id=$1 AND threat_type_id=$2`,
      [req.params.id, req.params.threatId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
