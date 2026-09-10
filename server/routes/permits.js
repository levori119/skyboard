// ─── ניהול רכבים ואישורי כניסה ────────────────────────────────────────────────
//
// הפקח בעמדת ניהול שדה מנהל כאן **מי מורשה להיכנס לשדה ובאיזה רכב** - מרשם
// קבוע, להבדיל מ"כניסת רכבים" (routes/driver.js) שהוא התור החי של מי שדופק
// בשער עכשיו. השניים מחוברים: בקשת כניסה מקושרת לאישור, והפקח רואה לפני
// שהוא מאשר מסלול אם למי שמולו בכלל יש אישור בתוקף.
//
// **הישות היא הנהג** (מזוהה בת"ז), והרכבים תלויים בו: נהג מגיע פעם ברכב קבוע
// ופעם ברכב מזדמן, וההרשאה היא של האדם.
//
// השרת **אינו מחשב סטטוס אישור**. הוא שומר תאריכים + דריסה ידנית, והנגזרת
// חיה במקום אחד בלבד - src/utils/permitStatus.ts - כדי שהפקח יראה את הסטטוס
// משתנה בטופס לפני השמירה, בלי מימוש שני שיתפצל בשקט.
//
// חלוקת הנתיבים מקבילה לחלוקת ההרשאות במערכת:
//   /api/permit-params*   = הגדרה (פרמטרים של השדה)
//   /api/entry-permits*   = מרשם האישורים והנסיעות
import { Router } from 'express';
import pool from '../db/pool.js';

const router = new Router();

/** שלוש רשימות הפרמטרים שמנוהלות בניהול שדה תעופה. */
export const PERMIT_PARAM_KINDS = ['zone', 'transport_role', 'vehicle_type'];

const num = v => (v === undefined || v === null || v === '' ? null : Number(v));
const str = v => String(v ?? '').trim();

// ── פרמטרים: אזורי אישור, תפקידי הסעה, סוגי רכב ─────────────────────────────

router.get('/api/permit-params', async (req, res) => {
  try {
    const { airfield_id, kind, active } = req.query;
    if (!airfield_id) return res.json([]);
    const vals = [airfield_id];
    let where = 'p.airfield_id = $1';
    if (kind && PERMIT_PARAM_KINDS.includes(kind)) { vals.push(kind); where += ` AND p.kind = $${vals.length}`; }
    if (active === '1') where += ' AND p.active';
    const r = await pool.query(
      `SELECT p.*, poly.name AS polygon_name
         FROM airfield_permit_params p
         LEFT JOIN airfield_polygons poly ON poly.id = p.polygon_id
        WHERE ${where}
        ORDER BY p.kind, p.sort_order, p.name`,
      vals
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/permit-params', async (req, res) => {
  try {
    const name = str(req.body?.name);
    const kind = PERMIT_PARAM_KINDS.includes(req.body?.kind) ? req.body.kind : 'zone';
    if (!name) return res.status(400).json({ error: 'missing_name' });
    if (!req.body?.airfield_id) return res.status(400).json({ error: 'missing_airfield' });
    const r = await pool.query(
      `INSERT INTO airfield_permit_params (airfield_id, kind, name, polygon_id, color, active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (airfield_id, kind, name) DO NOTHING RETURNING *`,
      [req.body.airfield_id, kind, name, kind === 'zone' ? num(req.body?.polygon_id) : null,
       str(req.body?.color) || '#3b82f6', req.body?.active !== false, Number(req.body?.sort_order) || 0]
    );
    if (!r.rows.length) return res.status(409).json({ error: 'param_exists' });
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/permit-params/:id', async (req, res) => {
  try {
    const name = str(req.body?.name);
    if (!name) return res.status(400).json({ error: 'missing_name' });
    const r = await pool.query(
      `UPDATE airfield_permit_params
          SET name=$1, polygon_id=$2, color=$3, active=$4, sort_order=$5
        WHERE id=$6 RETURNING *`,
      [name, num(req.body?.polygon_id), str(req.body?.color) || '#3b82f6',
       req.body?.active !== false, Number(req.body?.sort_order) || 0, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'param_not_found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/permit-params/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_permit_params WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── מרשם האישורים ────────────────────────────────────────────────────────────

// שאילתת הנהג המלאה. הרכבים והאזורים מגיעים כמערכים מקוננים בקריאה אחת:
// הרשימה מוצגת עם הרכבים בשורה, ובקשה לכל נהג הייתה N+1 על כל ריענון.
const DRIVER_SELECT = `
  SELECT d.*,
         role.name AS transport_role_name,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id', v.id, 'vehicle_type_id', v.vehicle_type_id, 'vehicle_type_name', vt.name,
                    'plate_fixed', v.plate_fixed, 'plate_number', v.plate_number,
                    'notes', v.notes, 'sort_order', v.sort_order) ORDER BY v.sort_order, v.id)
             FROM entry_permit_vehicles v
             LEFT JOIN airfield_permit_params vt ON vt.id = v.vehicle_type_id
            WHERE v.driver_id = d.id), '[]') AS vehicles,
         COALESCE((
           SELECT json_agg(json_build_object('id', z.id, 'name', z.name, 'color', z.color,
                                             'polygon_id', z.polygon_id) ORDER BY z.sort_order, z.name)
             FROM entry_permit_driver_zones dz
             JOIN airfield_permit_params z ON z.id = dz.zone_id
            WHERE dz.driver_id = d.id), '[]') AS zones
    FROM entry_permit_drivers d
    LEFT JOIN airfield_permit_params role ON role.id = d.transport_role_id`;

router.get('/api/entry-permits', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    if (!airfield_id) return res.json([]);
    const r = await pool.query(
      `${DRIVER_SELECT} WHERE d.airfield_id = $1 ORDER BY d.last_name, d.first_name, d.id`,
      [airfield_id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/entry-permits/:id', async (req, res) => {
  try {
    const r = await pool.query(`${DRIVER_SELECT} WHERE d.id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'driver_not_found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** כותב מחדש את אזורי הנהג. מחיקה+הכנסה ולא diff: הרשימה קצרה, וה-diff הוא
 *  מקום קלאסי שבו הסרת הרשאה נופלת בשקט. */
async function writeZones(client, driverId, zoneIds) {
  await client.query('DELETE FROM entry_permit_driver_zones WHERE driver_id=$1', [driverId]);
  const ids = (Array.isArray(zoneIds) ? zoneIds : []).map(Number).filter(Boolean);
  if (!ids.length) return;
  await client.query(
    `INSERT INTO entry_permit_driver_zones (driver_id, zone_id)
     SELECT $1, UNNEST($2::int[]) ON CONFLICT DO NOTHING`,
    [driverId, ids]
  );
}

router.post('/api/entry-permits', async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    if (!b.airfield_id) return res.status(400).json({ error: 'missing_airfield' });
    if (!str(b.first_name) && !str(b.last_name)) return res.status(400).json({ error: 'missing_name' });
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO entry_permit_drivers
         (airfield_id, first_name, last_name, national_id, transport_role_id,
          permit_from, permit_until, status_override, notes, approved_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.airfield_id, str(b.first_name), str(b.last_name), str(b.national_id), num(b.transport_role_id),
       b.permit_from || null, b.permit_until || null, str(b.status_override) || null,
       b.notes ?? '', str(b.approved_by)]
    );
    await writeZones(client, r.rows[0].id, b.zone_ids);
    await client.query('COMMIT');
    const full = await client.query(`${DRIVER_SELECT} WHERE d.id = $1`, [r.rows[0].id]);
    res.status(201).json(full.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'national_id_exists' });
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.put('/api/entry-permits/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const fields = ['updated_at=NOW()'], vals = [];
    let i = 1;
    const set = (col, v) => { fields.push(`${col}=$${i++}`); vals.push(v); };
    if (b.first_name !== undefined)        set('first_name', str(b.first_name));
    if (b.last_name !== undefined)         set('last_name', str(b.last_name));
    if (b.national_id !== undefined)       set('national_id', str(b.national_id));
    if (b.transport_role_id !== undefined) set('transport_role_id', num(b.transport_role_id));
    if (b.permit_from !== undefined)       set('permit_from', b.permit_from || null);
    if (b.permit_until !== undefined)      set('permit_until', b.permit_until || null);
    // '' מנקה את הדריסה הידנית ומחזיר את הסטטוס להיגזר מהתאריכים
    if (b.status_override !== undefined)   set('status_override', str(b.status_override) || null);
    if (b.notes !== undefined)             set('notes', b.notes ?? '');
    if (b.approved_by !== undefined)       set('approved_by', str(b.approved_by));
    await client.query('BEGIN');
    vals.push(req.params.id);
    const r = await client.query(
      `UPDATE entry_permit_drivers SET ${fields.join(',')} WHERE id=$${i} RETURNING id`, vals
    );
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'driver_not_found' }); }
    if (b.zone_ids !== undefined) await writeZones(client, req.params.id, b.zone_ids);
    await client.query('COMMIT');
    const full = await client.query(`${DRIVER_SELECT} WHERE d.id = $1`, [req.params.id]);
    res.json(full.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'national_id_exists' });
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.delete('/api/entry-permits/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM entry_permit_drivers WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── רכבים תחת הנהג ───────────────────────────────────────────────────────────

router.post('/api/entry-permits/:id/vehicles', async (req, res) => {
  try {
    const b = req.body || {};
    const fixed = b.plate_fixed !== false;
    const r = await pool.query(
      `INSERT INTO entry_permit_vehicles (driver_id, vehicle_type_id, plate_fixed, plate_number, notes, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      // רכב לא קבוע אינו נושא מספר רישוי - שמירתו הייתה יוצרת "קבוע למחצה"
      [req.params.id, num(b.vehicle_type_id), fixed, fixed ? str(b.plate_number) : '',
       b.notes ?? '', Number(b.sort_order) || 0]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/entry-permit-vehicles/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const fixed = b.plate_fixed !== false;
    const r = await pool.query(
      `UPDATE entry_permit_vehicles
          SET vehicle_type_id=$1, plate_fixed=$2, plate_number=$3, notes=$4, sort_order=$5
        WHERE id=$6 RETURNING *`,
      [num(b.vehicle_type_id), fixed, fixed ? str(b.plate_number) : '',
       b.notes ?? '', Number(b.sort_order) || 0, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'vehicle_not_found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/entry-permit-vehicles/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM entry_permit_vehicles WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── נסיעות ───────────────────────────────────────────────────────────────────
//
// היסטוריה מול עתידי נגזר מ-scheduled_at מול השעון ולא משדה שצריך לזכור לעדכן.

const TRIP_SELECT = `
  SELECT t.*, fp.name AS from_point_name, tp.name AS to_point_name,
         v.plate_number, v.plate_fixed, vt.name AS vehicle_type_name,
         vr.status AS request_status
    FROM entry_permit_trips t
    LEFT JOIN airfield_points fp ON fp.id = t.from_point_id
    LEFT JOIN airfield_points tp ON tp.id = t.to_point_id
    LEFT JOIN entry_permit_vehicles v ON v.id = t.vehicle_id
    LEFT JOIN airfield_permit_params vt ON vt.id = v.vehicle_type_id
    LEFT JOIN vehicle_requests vr ON vr.id = t.vehicle_request_id`;

router.get('/api/entry-permits/:id/trips', async (req, res) => {
  try {
    const r = await pool.query(
      `${TRIP_SELECT} WHERE t.driver_id = $1 ORDER BY t.scheduled_at DESC NULLS LAST, t.id DESC LIMIT 200`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/entry-permits/:id/trips', async (req, res) => {
  try {
    const b = req.body || {};
    const r = await pool.query(
      `INSERT INTO entry_permit_trips
         (driver_id, vehicle_id, from_point_id, to_point_id, from_text, to_text,
          scheduled_at, ended_at, purpose, vehicle_request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, num(b.vehicle_id), num(b.from_point_id), num(b.to_point_id),
       str(b.from_text), str(b.to_text), b.scheduled_at || null, b.ended_at || null,
       b.purpose ?? '', num(b.vehicle_request_id)]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/entry-permit-trips/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const fields = [], vals = [];
    let i = 1;
    const set = (col, v) => { fields.push(`${col}=$${i++}`); vals.push(v); };
    if (b.vehicle_id !== undefined)     set('vehicle_id', num(b.vehicle_id));
    if (b.from_point_id !== undefined)  set('from_point_id', num(b.from_point_id));
    if (b.to_point_id !== undefined)    set('to_point_id', num(b.to_point_id));
    if (b.from_text !== undefined)      set('from_text', str(b.from_text));
    if (b.to_text !== undefined)        set('to_text', str(b.to_text));
    if (b.scheduled_at !== undefined)   set('scheduled_at', b.scheduled_at || null);
    if (b.ended_at !== undefined)       set('ended_at', b.ended_at || null);
    if (b.purpose !== undefined)        set('purpose', b.purpose ?? '');
    if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });
    vals.push(req.params.id);
    const r = await pool.query(
      `UPDATE entry_permit_trips SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, vals
    );
    if (!r.rows.length) return res.status(404).json({ error: 'trip_not_found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/entry-permit-trips/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM entry_permit_trips WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
