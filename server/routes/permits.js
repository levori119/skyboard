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

/**
 * רשימות הפרמטרים שמנוהלות בניהול שדה תעופה.
 * `trip_type` ו-`roam_permit` הצטרפו עם "ניהול נסיעות" - סוג הנסיעה, וסוג
 * האישור של הנהג והנלווים להסתובב בבסיס.
 */
export const PERMIT_PARAM_KINDS = ['zone', 'transport_role', 'vehicle_type', 'trip_type', 'roam_permit'];

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

// ── נסיעות · ניהול נסיעות ────────────────────────────────────────────────────
//
// "ניהול נסיעות" הוא אותה ישות נסיעה, **מורחבת** - ולא טבלה שנייה. שתי רשימות
// "נסיעות" (אחת פר-נהג בחלון הנהג, אחת פר-שדה בחלון הנסיעות) היו מתפצלות
// בשקט: נסיעה שנרשמה מאישור בקשת כניסה הייתה מופיעה באחת ולא בשנייה.
//
// היסטוריה מול עתידי נגזר מ-scheduled_at מול השעון ולא משדה שצריך לזכור לעדכן.
// **הסטטוס** לעומת זאת אינו נגזרת אלא הכרעה של המגדל - "יש אישור" נאמר בידי אדם.
//
// השרת אינו מחשב אייקון מוצע, חלון התראה או "מה הנהג שינה" - הנגזרות האלה חיות
// במקום אחד בלבד, src/utils/trips.ts, בדיוק כמו permitStatus.ts לאישור הכניסה.

/** ארבעת סטטוסי הנסיעה. חייב להתאים ל-TRIP_STATUSES ב-src/utils/trips.ts. */
export const TRIP_STATUSES = ['approved', 'not_approved', 'pending', 'ended'];

/** סטטוס לא מוכר נשמר כ"ממתין" - לא נכתב זבל לעמודה תפעולית. */
const tripStatus = v => (TRIP_STATUSES.includes(String(v)) ? String(v) : 'pending');

/** מערך -> JSONB. לא-מערך נשמר כמערך ריק ולא מפיל את הכתיבה. */
const jsonArr = v => JSON.stringify(Array.isArray(v) ? v : []);

/** מה שהנהג רשאי להציע לשנות מהאפליקציה. חייב להתאים ל-DRIVER_EDITABLE_FIELDS. */
const DRIVER_EDITABLE_FIELDS = ['scheduled_at', 'stops', 'note'];

const TRIP_SELECT = `
  SELECT t.*, fp.name AS from_point_name, tp.name AS to_point_name,
         v.plate_number, v.plate_fixed,
         COALESCE(tvt.name, vvt.name) AS vehicle_type_name,
         tt.name AS trip_type_name,
         rp.name AS roam_permit_name,
         BTRIM(COALESCE(d.first_name,'') || ' ' || COALESCE(d.last_name,'')) AS permit_driver_name,
         d.national_id AS permit_national_id,
         d.permit_from, d.permit_until, d.status_override AS permit_status_override,
         vr.status AS request_status,
         COALESCE(st.stop_names, '[]') AS stop_names
    FROM entry_permit_trips t
    LEFT JOIN entry_permit_drivers d ON d.id = t.driver_id
    LEFT JOIN airfield_points fp ON fp.id = t.from_point_id
    LEFT JOIN airfield_points tp ON tp.id = t.to_point_id
    LEFT JOIN entry_permit_vehicles v ON v.id = t.vehicle_id
    LEFT JOIN airfield_permit_params vvt ON vvt.id = v.vehicle_type_id
    LEFT JOIN airfield_permit_params tvt ON tvt.id = t.vehicle_type_id
    LEFT JOIN airfield_permit_params tt ON tt.id = t.trip_type_id
    LEFT JOIN airfield_permit_params rp ON rp.id = t.roam_permit_id
    LEFT JOIN vehicle_requests vr ON vr.id = t.vehicle_request_id
    -- שמות תחנות הביניים לפי סדרן. בלעדיהם כל צרכן (החלון, המפה, אפליקציית
    -- הנהג) היה מתרגם מזהה לשם בעצמו - ואפליקציית הנהג כלל אינה מורשית לקרוא
    -- את נקודות השדה.
    LEFT JOIN LATERAL (
      SELECT json_agg(COALESCE(p.name, s.elem->>'text', '') ORDER BY s.ord) AS stop_names
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(t.stops) = 'array' THEN t.stops ELSE '[]'::jsonb END
             ) WITH ORDINALITY AS s(elem, ord)
        LEFT JOIN airfield_points p ON p.id = NULLIF(s.elem->>'point_id', '')::int
    ) st ON TRUE`;

/**
 * מוסיף ל-SET/INSERT רק את השדות שנשלחו בפועל (`undefined` = לא נגעו).
 * משותף ליצירה ולעדכון, כדי ששני המסלולים לא יתפצלו בשדה שנוסף רק לאחד מהם.
 */
function tripSetters(b, set) {
  if (b.driver_id !== undefined)            set('driver_id', num(b.driver_id));
  if (b.vehicle_id !== undefined)           set('vehicle_id', num(b.vehicle_id));
  if (b.vehicle_name !== undefined)         set('vehicle_name', str(b.vehicle_name));
  if (b.vehicle_type_id !== undefined)      set('vehicle_type_id', num(b.vehicle_type_id));
  if (b.trip_type_id !== undefined)         set('trip_type_id', num(b.trip_type_id));
  if (b.icon !== undefined)                 set('icon', str(b.icon));
  if (b.from_point_id !== undefined)        set('from_point_id', num(b.from_point_id));
  if (b.to_point_id !== undefined)          set('to_point_id', num(b.to_point_id));
  if (b.from_text !== undefined)            set('from_text', str(b.from_text));
  if (b.to_text !== undefined)              set('to_text', str(b.to_text));
  if (b.stops !== undefined)                set('stops', jsonArr(b.stops));
  if (b.scheduled_at !== undefined)         set('scheduled_at', b.scheduled_at || null);
  if (b.ended_at !== undefined)             set('ended_at', b.ended_at || null);
  if (b.status !== undefined)               set('status', tripStatus(b.status));
  if (b.purpose !== undefined)              set('purpose', b.purpose ?? '');
  if (b.note !== undefined)                 set('note', b.note ?? '');
  if (b.driver_name !== undefined)          set('driver_name', str(b.driver_name));
  if (b.driver_phone !== undefined)         set('driver_phone', str(b.driver_phone));
  if (b.requester_name !== undefined)       set('requester_name', str(b.requester_name));
  if (b.requester_phone !== undefined)      set('requester_phone', str(b.requester_phone));
  if (b.escorts !== undefined)              set('escorts', jsonArr(b.escorts));
  if (b.roam_permit_id !== undefined)       set('roam_permit_id', num(b.roam_permit_id));
  if (b.suggested_route_ids !== undefined)  set('suggested_route_ids', jsonArr(b.suggested_route_ids));
  if (b.route_options !== undefined)        set('route_options', jsonArr(b.route_options));
  if (b.selected_route_ids !== undefined)   set('selected_route_ids', jsonArr(b.selected_route_ids));
  if (b.selected_route_label !== undefined) set('selected_route_label', str(b.selected_route_label));
  if (b.vehicle_request_id !== undefined)   set('vehicle_request_id', num(b.vehicle_request_id));
}

/**
 * שליפת נסיעה אחת. `q` מאפשר לקרוא **דרך ה-client של הטרנזקציה**: המאגר
 * המקומי מחזיק חיבור יחיד, ו-`pool.query` בזמן ש-client תפוס הוא דדלוק
 * (ראה localPool). ברירת המחדל היא ה-pool, למסלולים שאינם בטרנזקציה.
 */
const oneTrip = async (id, q = pool) => (await q.query(`${TRIP_SELECT} WHERE t.id = $1`, [id])).rows[0] ?? null;

// ── קריאה ────────────────────────────────────────────────────────────────────

router.get('/api/entry-permits/:id/trips', async (req, res) => {
  try {
    const r = await pool.query(
      `${TRIP_SELECT} WHERE t.driver_id = $1 ORDER BY t.scheduled_at DESC NULLS LAST, t.id DESC LIMIT 200`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * נסיעות ה**שדה** - מה שחלון "ניהול נסיעות" מציג.
 *
 * `scope=upcoming` מחזיר רק את חלון ההתראה (הרכב על המפה / ההתראה המתפרצת).
 * גבולות החלון מגיעים מהלקוח (`within_minutes`, `stale_hours`) ולא מקובעים
 * כאן, כדי שהמספר יישאר במקום אחד - src/utils/trips.ts. הלקוח בודק שוב עם
 * אותה פונקציה, ולכן זהו סינון גס שמקטין את ה-poll ולא הכרעה שנייה.
 */
router.get('/api/trips', async (req, res) => {
  try {
    const { airfield_id, scope, within_minutes, stale_hours } = req.query;
    if (!airfield_id) return res.json([]);
    const vals = [airfield_id];
    let where = 't.airfield_id = $1';
    if (scope === 'upcoming') {
      const within = Math.max(0, Math.min(1440, Number(within_minutes) || 0));
      const stale = Math.max(1, Math.min(720, Number(stale_hours) || 12));
      vals.push(within, stale);
      where += ` AND t.status <> 'ended' AND t.scheduled_at IS NOT NULL
                 AND t.scheduled_at <= NOW() + make_interval(mins => $2::int)
                 AND t.scheduled_at >= NOW() - make_interval(hours => $3::int)`;
    }
    const r = await pool.query(
      `${TRIP_SELECT} WHERE ${where} ORDER BY t.scheduled_at DESC NULLS LAST, t.id DESC LIMIT 300`,
      vals
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── כתיבה ────────────────────────────────────────────────────────────────────

/** נסיעה של השדה - הנהג אינו חובה, כי נהג מזדמן אינו במרשם. */
router.post('/api/trips', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.airfield_id) return res.status(400).json({ error: 'missing_airfield' });
    const cols = [], vals = [], ph = [];
    const set = (col, v) => { cols.push(col); vals.push(v); ph.push(`$${vals.length}`); };
    set('airfield_id', num(b.airfield_id));
    tripSetters(b, set);
    const r = await pool.query(
      `INSERT INTO entry_permit_trips (${cols.join(',')}) VALUES (${ph.join(',')}) RETURNING id`, vals
    );
    res.status(201).json(await oneTrip(r.rows[0].id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * העמודות שעוברות לעותק - **רשימה מפורשת ולא `SELECT *`**.
 *
 * עמודה חדשה שתתווסף לנסיעה לא תזלוג לעותק בשקט: היא פשוט לא תועתק, וזו
 * התקלה הזולה מבין השתיים. מה שאינו כאן מתועד ב-TRIP_FIELDS_NOT_COPIED
 * (src/utils/trips.ts) - מצב חי שנוצר על הנסיעה המקורית בלבד.
 */
const TRIP_COPY_COLUMNS = [
  'airfield_id', 'driver_id', 'driver_name', 'driver_phone',
  'requester_name', 'requester_phone',
  'vehicle_id', 'vehicle_name', 'vehicle_type_id', 'trip_type_id', 'icon',
  'from_point_id', 'to_point_id', 'from_text', 'to_text', 'stops',
  'note', 'purpose', 'escorts', 'roam_permit_id',
  'suggested_route_ids', 'route_options', 'selected_route_ids', 'selected_route_label',
];

/**
 * שכפול נסיעות - בודדת או קבוצתית.
 *
 * הלקוח שולח לכל עותק את `scheduled_at` **המחושב**, ולא תאריך יעד: חישוב
 * "אותה שעה, יום אחר" חייב להיעשות בשעון המקומי של העמדה (src/utils/trips.ts
 * §duplicateSchedule), ואילו כאן, מול TIMESTAMPTZ ובאזור הזמן של השרת, הוא
 * היה זז בשעה במעבר שעון קיץ.
 *
 * ⚠️ **העותק אינו מאושר** (`status='pending'`), וללא מצב חי של המקור: אישור
 * הנהג, שינוי ממתין, סימון התראה וקישור לבקשת הכניסה. שכפול של נסיעה מאושרת
 * שהיה גורר את האישור היה מוציא לשטח רכב שאיש לא אישר - בדיוק בפעולה שנועדה
 * לחסוך הקלדה.
 *
 * הכל בטרנזקציה אחת: שכפול קבוצתי שנפל באמצע היה משאיר חצי יום נסיעות.
 */
router.post('/api/trips/duplicate', async (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [];
  // ⚠️ האימות **לפני** pool.connect: `return` מוקדם בתוך ה-try היה יוצא בלי
  // להשתחרר, והמאגר המקומי - שהוא חיבור יחיד - היה ננעל לכל בקשה שאחריו.
  if (!items.length) return res.status(400).json({ error: 'missing_items' });
  // תקרה - בקשה לאלף עותקים היא טעות הקלדה, וגילויה אחרי היצירה יקר ממניעתה
  if (items.length > 200) return res.status(400).json({ error: 'too_many_items' });

  const client = await pool.connect();
  try {
    const cols = TRIP_COPY_COLUMNS.join(', ');
    const created = [];
    await client.query('BEGIN');
    for (const it of items) {
      const srcId = num(it?.id);
      if (!srcId) continue;
      const r = await client.query(
        `INSERT INTO entry_permit_trips (${cols}, scheduled_at, status)
         SELECT ${cols}, $2, 'pending' FROM entry_permit_trips WHERE id = $1
         RETURNING id`,
        [srcId, it?.scheduled_at || null]
      );
      if (r.rows.length) created.push(r.rows[0].id);
    }
    await client.query('COMMIT');
    // הקריאה דרך ה-pool רק **אחרי** השחרור: המאגר המקומי מחזיק חיבור יחיד
    client.release();
    const full = [];
    for (const id of created) full.push(await oneTrip(id));
    return res.status(201).json(full);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    return res.status(500).json({ error: err.message });
  }
});

/** נסיעה תחת נהג מהמרשם. השדה נגזר מהנהג - נסיעה בלי שדה לא נמצאת בחלון. */
router.post('/api/entry-permits/:id/trips', async (req, res) => {
  try {
    const b = req.body || {};
    const cols = ['driver_id'], vals = [req.params.id], ph = ['$1'];
    const set = (col, v) => { cols.push(col); vals.push(v); ph.push(`$${vals.length}`); };
    set('airfield_id', num(b.airfield_id) ??
      (await pool.query('SELECT airfield_id FROM entry_permit_drivers WHERE id=$1', [req.params.id])).rows[0]?.airfield_id ?? null);
    tripSetters({ ...b, driver_id: undefined }, set);
    const r = await pool.query(
      `INSERT INTO entry_permit_trips (${cols.join(',')}) VALUES (${ph.join(',')}) RETURNING id`, vals
    );
    res.status(201).json(await oneTrip(r.rows[0].id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/entry-permit-trips/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const fields = ['updated_at=NOW()'], vals = [];
    const set = (col, v) => { vals.push(v); fields.push(`${col}=$${vals.length}`); };
    tripSetters(b, set);
    if (fields.length === 1) return res.status(400).json({ error: 'nothing_to_update' });
    vals.push(req.params.id);
    const r = await pool.query(
      `UPDATE entry_permit_trips SET ${fields.join(',')} WHERE id=$${vals.length} RETURNING id`, vals
    );
    if (!r.rows.length) return res.status(404).json({ error: 'trip_not_found' });
    res.json(await oneTrip(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/entry-permit-trips/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM entry_permit_trips WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * סימון שההתראה המתפרצת כבר הוקפצה.
 *
 * בלי הסימון ההתראה הייתה עולה בכל poll, והפקח לומד להתעלם ממנה - וזה בדיוק מה
 * שהתראה מתפרצת לא יכולה להרשות לעצמה. `COALESCE` שומר על הסימון הראשון: שתי
 * עמדות שמציגות את אותה נסיעה לא דורסות זו את חותמת הזמן של זו.
 */
router.post('/api/entry-permit-trips/:id/alerted', async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE entry_permit_trips SET departure_alerted_at = COALESCE(departure_alerted_at, NOW())
        WHERE id=$1 RETURNING id`, [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'trip_not_found' });
    res.json(await oneTrip(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * הכרעת המגדל על שינוי שהנהג הציע: `approve` מחיל אותו על השורה, `reject`
 * זורק אותו. בשני המקרים ה-`pending_change` מתנקה - שינוי שהוכרע אינו ממתין.
 */
router.post('/api/entry-permit-trips/:id/change/:decision', async (req, res) => {
  const client = await pool.connect();
  try {
    const decision = req.params.decision === 'approve' ? 'approve' : 'reject';
    await client.query('BEGIN');
    const cur = await client.query('SELECT pending_change FROM entry_permit_trips WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'trip_not_found' }); }
    const pending = cur.rows[0].pending_change || {};
    const fields = ['updated_at=NOW()', 'pending_change=NULL', 'pending_change_at=NULL'], vals = [];
    const set = (col, v) => { vals.push(v); fields.push(`${col}=$${vals.length}`); };
    if (decision === 'approve') {
      const allowed = {};
      for (const f of DRIVER_EDITABLE_FIELDS) if (f in pending) allowed[f] = pending[f];
      tripSetters(allowed, set);
    }
    vals.push(req.params.id);
    await client.query(`UPDATE entry_permit_trips SET ${fields.join(',')} WHERE id=$${vals.length}`, vals);
    const full = await oneTrip(req.params.id, client);
    await client.query('COMMIT');
    res.json(full);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── אפליקציית הנהג ───────────────────────────────────────────────────────────
//
// אסימון הנהג אינו זהות אישית אלא קוד גישה משותף (ראה middleware/auth.js), ולכן
// הנתיבים כאן **מחייבים מזהה מפורש** - טלפון או ת"ז - ואינם מחזירים רשימה בלעדיו.
// זו אותה רמת אמון של /api/vehicle-requests, ולא הרחבה שלה.

router.get('/api/driver-trips', async (req, res) => {
  try {
    const phone = str(req.query.phone);
    const nationalId = str(req.query.national_id);
    if (!phone && !nationalId) return res.status(400).json({ error: 'missing_identifier' });
    const r = await pool.query(
      `${TRIP_SELECT}
        WHERE t.status <> 'ended'
          AND (($1 <> '' AND BTRIM(t.driver_phone) = $1)
            OR ($2 <> '' AND BTRIM(d.national_id) = $2))
        ORDER BY t.scheduled_at NULLS LAST, t.id LIMIT 50`,
      [phone, nationalId]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** אישור הנהג. אינו משנה סטטוס - הסטטוס הוא הכרעת המגדל, וזו רק הצהרת הנהג. */
router.post('/api/driver-trips/:id/ack', async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE entry_permit_trips SET driver_ack_at = NOW(), updated_at = NOW()
        WHERE id=$1 RETURNING id`, [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'trip_not_found' });
    res.json(await oneTrip(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * הנהג מציע שינוי בזמן היציאה / בתחנות / בהערה.
 *
 * השינוי נשמר **בצד** ואינו נכתב על השורה: המגדל צריך לראות מה יהיה לפני
 * שהוא מחליט, והנסיעה לא יכולה להשתנות מתחת לידיו אם ידחה.
 */
router.post('/api/driver-trips/:id/change', async (req, res) => {
  try {
    const b = req.body || {};
    const change = {};
    for (const f of DRIVER_EDITABLE_FIELDS) if (b[f] !== undefined) change[f] = b[f];
    if (!Object.keys(change).length) return res.status(400).json({ error: 'nothing_to_change' });
    const r = await pool.query(
      `UPDATE entry_permit_trips
          SET pending_change=$1, pending_change_at=NOW(), updated_at=NOW()
        WHERE id=$2 RETURNING id`,
      [JSON.stringify(change), req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'trip_not_found' });
    res.json(await oneTrip(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
