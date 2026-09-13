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
import { normalizeNationalId, nationalIdSql, driverScopeOf, driverMayUseBase, driverBaseGuard } from '../auth/driverIdentity.js';
import { startWindowState, START_WINDOW_MINUTES, buildTemplate } from '../../shared/driverLogic.js';
import {
  anchorFrom, pctToLatLon, metersToPolyline, metersToSegment, isElementBlocking, roadControlElements, compactWaypoints,
  nextDeviationStreak, isDeviating, isFixStale, ELEMENT_ALERT_M, MAX_ACCURACY_M, DISPLAY_STATE_LABEL,
} from '../../shared/tripTracking.js';
import { planRoute } from './driver.js';

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

/** אותה דקה. הטופס באפליקציה ברזולוציית דקה (datetime-local), וה-DB שומר שניות. */
function sameMinute(a, b) {
  const ta = a ? new Date(a).getTime() : NaN;
  const tb = b ? new Date(b).getTime() : NaN;
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.isNaN(ta) && Number.isNaN(tb);
  return Math.floor(ta / 60_000) === Math.floor(tb / 60_000);
}

/** הערה: null, ריק ורווחים בקצוות הם אותו דבר. */
const sameText = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

/**
 * שמות התחנות כפי שהנהג רואה אותם - שם הנקודה כשהתחנה מקושרת לנקודה בשדה,
 * ואחרת הטקסט שנרשם. אותה נגזרת כמו `stop_names` ב-TRIP_SELECT, כדי שתחנה
 * שחזרה מהאפליקציה כשמה לא תיספר כשינוי רק כי אבד לה ה-point_id.
 */
async function stopLabels(stops, q = pool) {
  const list = Array.isArray(stops) ? stops : [];
  const ids = [...new Set(list.map(x => num(x?.point_id)).filter(Boolean))];
  const names = new Map();
  if (ids.length) {
    const r = await q.query('SELECT id, name FROM airfield_points WHERE id = ANY($1::int[])', [ids]);
    for (const row of r.rows) names.set(row.id, row.name);
  }
  return list
    .map(x => String(names.get(num(x?.point_id)) ?? x?.text ?? '').trim())
    .filter(Boolean);
}

/**
 * השדות שהנהג **באמת** שינה, מול הערכים הנוכחיים של הנסיעה.
 *
 * אפליקציית הנהג שולחת תמיד את שלושת השדות מתוך טופס שממולא מראש בערכים
 * הנוכחיים, גם כשהנהג שינה רק אחד. שמירה של כל מה שנשלח שברה שני דברים:
 * "מהות השינוי" שהמגדל רואה מנתה את שלושתם, ו-`stops` שהיה תמיד בבקשה גרם
 * לאישור למחוק את הנתיב ולהשאיר את הנסיעה ממתינה - היא לעולם לא חזרה
 * למאושרת. ההשוואה רצה גם בהכרעה, כדי שבקשות שכבר נשמרו כך יחזרו תקינות.
 *
 * `trip` - שורת נסיעה מלאה מ-oneTrip (עם `stop_names`).
 */
async function actualDriverChanges(submitted, trip, q = pool) {
  const out = {};
  if (submitted.scheduled_at !== undefined && !sameMinute(submitted.scheduled_at, trip.scheduled_at)) {
    out.scheduled_at = submitted.scheduled_at;
  }
  if (submitted.note !== undefined && !sameText(submitted.note, trip.note)) {
    out.note = submitted.note;
  }
  if (submitted.stops !== undefined) {
    const next = await stopLabels(submitted.stops, q);
    const cur = (Array.isArray(trip.stop_names) ? trip.stop_names : []).map(x => String(x ?? '').trim()).filter(Boolean);
    if (next.length !== cur.length || next.some((label, i) => label !== cur[i])) out.stops = submitted.stops;
  }
  return out;
}

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
         taf.base_id, tb.name AS base_name,
         COALESCE(st.stop_names, '[]') AS stop_names
    FROM entry_permit_trips t
    LEFT JOIN entry_permit_drivers d ON d.id = t.driver_id
    -- הבסיס של הנסיעה - לנהג שמורשה לכמה בסיסים
    LEFT JOIN airfields taf ON taf.id = t.airfield_id
    LEFT JOIN aviation_bases tb ON tb.id = taf.base_id
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
  // ת"ז של נהג מזדמן - לפיה הנסיעה מגיעה לאפליקציית DRIVER שלו. נהג מהמרשם
  // מזוהה דרך driver_id, והת"ז שלו יושבת במרשם.
  if (b.driver_national_id !== undefined)   set('driver_national_id', normalizeNationalId(b.driver_national_id));
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
  'airfield_id', 'driver_id', 'driver_name', 'driver_phone', 'driver_national_id',
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
 *
 * **הסטטוס:** עדכון מהנהג החזיר את הנסיעה לממתין ושמר את הסטטוס שלפניו
 * (`pending_change_prev_status`). דחייה מחזירה אותו. אישור מחזיר אותו - **אלא אם
 * השתנו התחנות**: אז הנתיב שאושר כבר אינו הדרך, הוא נמחק, והנסיעה נשארת ממתינה
 * עד שהמגדל יבחר נתיב ויאשר מחדש.
 */
router.post('/api/entry-permit-trips/:id/change/:decision', async (req, res) => {
  const client = await pool.connect();
  try {
    const decision = req.params.decision === 'approve' ? 'approve' : 'reject';
    await client.query('BEGIN');
    const cur = await client.query(
      'SELECT pending_change, pending_change_prev_status, status FROM entry_permit_trips WHERE id=$1 FOR UPDATE',
      [req.params.id]);
    if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'trip_not_found' }); }
    const pending = cur.rows[0].pending_change || {};
    const prevStatus = cur.rows[0].pending_change_prev_status;
    const fields = ['updated_at=NOW()', 'pending_change=NULL', 'pending_change_at=NULL', 'pending_change_prev_status=NULL'], vals = [];
    const set = (col, v) => { vals.push(v); fields.push(`${col}=$${vals.length}`); };
    if (decision === 'approve') {
      const allowed = {};
      for (const f of DRIVER_EDITABLE_FIELDS) if (f in pending) allowed[f] = pending[f];
      // שוב מול הנסיעה עצמה: בקשות שנשמרו לפני התיקון מחזיקות את שלושת השדות,
      // ובלי ההשוואה `stops` שלא השתנה היה מוחק את הנתיב גם בהן
      const actual = await actualDriverChanges(allowed, await oneTrip(req.params.id, client), client);
      tripSetters(actual, set);
      if ('stops' in actual) {
        set('selected_route_ids', '[]');
        set('selected_route_label', '');
        set('status', 'pending');
      } else if (prevStatus) {
        set('status', tripStatus(prevStatus));
      }
    } else if (prevStatus) {
      set('status', tripStatus(prevStatus));
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
// הנהג מתחבר ל-DRIVER במיראז' עם **ת"ז**, והת"ז חתומה באסימון (routes/mirage.js
// §/api/auth/driver). הנסיעות נשלפות **רק** לפיה - פרמטר ת"ז או טלפון מהלקוח
// אינו מקנה דבר. נסיעה שייכת לנהג כשהת"ז שלו במרשם (driver_id) או שנרשמה על
// הנסיעה עצמה לנהג מזדמן (driver_national_id). ובנוסף - הנסיעה בשדה של **בסיס
// שהנהג מורשה אליו** בהרשאת SKY-KING DRIVER במיראז'. אסימון בלי ת"ז או בלי בסיס
// (עמדה, או אסימון ישן) מקבל 403.

/**
 * תנאי השייכות לנהג: `$n` הוא הת"ז המנורמלת מהאסימון, ו-`$(n+1)` מערך הבסיסים
 * המורשים. בסיס הנסיעה נגזר מהשדה שלה (airfields.base_id).
 */
const tripOwnedBy = n =>
  `$${n} IN (${nationalIdSql('d.national_id')}, ${nationalIdSql('t.driver_national_id')})
   AND EXISTS (SELECT 1 FROM airfields a WHERE a.id = t.airfield_id AND a.base_id = ANY($${n + 1}::int[]))`;

/** זהות הנהג מהאסימון (ת"ז + בסיסים), או 403. מחזיר `null` כשהתשובה כבר נשלחה. */
function driverScope(req, res) {
  const scope = driverScopeOf(req.user);
  if (!scope.nationalId) {
    res.status(403).json({ error: 'driver_identity_required', message: 'נדרשת כניסת נהג מזוהה' });
    return null;
  }
  return scope;
}

/**
 * האם הנסיעה שייכת לנהג. נסיעה של נהג אחר מחזירה 404 ולא 403 - הנהג אינו
 * לומד שקיימת נסיעה במזהה הזה.
 */
const ownsTrip = async (id, scope) => (await pool.query(
  `SELECT 1 FROM entry_permit_trips t LEFT JOIN entry_permit_drivers d ON d.id = t.driver_id
    WHERE t.id = $1 AND ${tripOwnedBy(2)}`, [id, scope.nationalId, scope.baseIds]
)).rows.length > 0;

/**
 * הנסיעות של הנהג. ברירת מחדל - הפעילות (לטאבים "מאושרות" ו"ממתינות").
 * `view=history` - רק נסיעות שבוצעו (status=ended), האחרונה ראשונה.
 */
router.get('/api/driver-trips', async (req, res) => {
  try {
    const scope = driverScope(req, res);
    if (!scope) return;
    const history = req.query.view === 'history';
    const r = await pool.query(
      `${TRIP_SELECT}
        WHERE t.status ${history ? '=' : '<>'} 'ended' AND ${tripOwnedBy(1)}
        ORDER BY ${history
          ? 'COALESCE(t.scheduled_at, t.ended_at) DESC NULLS LAST, t.id DESC LIMIT 100'
          : 't.scheduled_at NULLS LAST, t.id LIMIT 100'}`,
      [scope.nationalId, scope.baseIds]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * הנהג שולח **בקשת נסיעה** מהאפליקציה - אותה ישות נסיעה שהמגדל רושם בחלון
 * "ניהול נסיעות", ולכן היא מופיעה שם כמו כל נסיעה ממתינה.
 *
 * הנהג קובע רק את מה שהוא יודע: מתי, מאיפה לאן, דרך אילו תחנות, במה ועם מי.
 * **הזהות** נלקחת מהאסימון, **הסטטוס** תמיד "ממתין", ו**הנתיב** ו**אישור
 * ההסתובבות** הם הכרעת המגדל - שדות אלה פשוט אינם נקראים מהגוף.
 * `driver_requested_at` מקפיץ למגדל התראה על בקשה חדשה (TripAlertsLayer).
 */
const DRIVER_REQUEST_FIELDS = [
  'trip_type_id', 'vehicle_type_id', 'vehicle_name', 'scheduled_at',
  'from_point_id', 'to_point_id', 'from_text', 'to_text', 'stops',
  'requester_name', 'requester_phone', 'driver_phone', 'escorts', 'note',
];

/**
 * כל מזהה שהנהג שלח חייב להשתייך לשדה הזה ולסוג הנכון. אחרת נקודה של שדה אחר
 * נשמרת בשקט, והמגדל רואה נסיעה ממקום שאינו בשדה שלו. מחזיר את השדה השגוי, או null.
 * משותף לבקשת נסיעה ולתבנית - תבנית עם נקודה זרה הייתה מייצרת בקשות שנדחות.
 */
async function invalidDriverReference(airfieldId, b) {
  const stops = Array.isArray(b.stops) ? b.stops : [];
  const pointIds = [b.from_point_id, b.to_point_id, ...stops.map(s => s?.point_id)].map(num).filter(Boolean);
  if (pointIds.length) {
    const { rows } = await pool.query(
      'SELECT COUNT(DISTINCT id)::int AS n FROM airfield_points WHERE airfield_id=$1 AND id = ANY($2::int[])',
      [airfieldId, pointIds]);
    if (rows[0].n !== new Set(pointIds).size) return 'point';
  }
  for (const [field, kind] of [['trip_type_id', 'trip_type'], ['vehicle_type_id', 'vehicle_type']]) {
    const id = num(b[field]);
    if (!id) continue;
    const { rows } = await pool.query(
      'SELECT 1 FROM airfield_permit_params WHERE id=$1 AND airfield_id=$2 AND kind=$3', [id, airfieldId, kind]);
    if (!rows.length) return field;
  }
  return null;
}

router.post('/api/driver-trips', async (req, res) => {
  try {
    const scope = driverScope(req, res);
    if (!scope) return;
    const raw = req.body || {};
    const b = Object.fromEntries(DRIVER_REQUEST_FIELDS.filter(f => raw[f] !== undefined).map(f => [f, raw[f]]));
    const airfieldId = num(raw.airfield_id);
    if (!airfieldId || !b.scheduled_at || !(num(b.from_point_id) || str(b.from_text)) || !(num(b.to_point_id) || str(b.to_text))) {
      return res.status(400).json({ error: 'missing_fields', required: ['airfield_id', 'scheduled_at', 'from', 'to'] });
    }

    const af = (await pool.query('SELECT base_id FROM airfields WHERE id=$1', [airfieldId])).rows[0];
    if (!af || !driverMayUseBase(scope, af.base_id)) {
      return res.status(403).json({ error: 'base_not_permitted', message: 'אינך מורשה לבסיס זה' });
    }

    const badRef = await invalidDriverReference(airfieldId, b);
    if (badRef) return res.status(400).json({ error: 'invalid_reference', field: badRef });

    const cols = [], vals = [], ph = [];
    const set = (col, v) => { cols.push(col); vals.push(v); ph.push(`$${vals.length}`); };
    set('airfield_id', airfieldId);
    tripSetters(b, set);
    set('status', 'pending');
    set('driver_national_id', scope.nationalId);
    set('driver_name', str(req.user?.name));
    const r = await pool.query(
      `INSERT INTO entry_permit_trips (${cols.join(',')}, driver_requested_at)
       VALUES (${ph.join(',')}, NOW()) RETURNING id`, vals
    );
    res.status(201).json(await oneTrip(r.rows[0].id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── תבניות נסיעה של הנהג ─────────────────────────────────────────────────────
// נסיעה שחוזרת (הסעת בוקר, אספקה שבועית) נשמרת פעם אחת כתבנית, וממנה הנהג
// מייצר בקשה בלחיצה. התבנית היא **פרטי בקשה בלבד** - בלי מועד, סטטוס או נתיב -
// ויצירת הבקשה עוברת את אותו POST /api/driver-trips ואת אותה בדיקה.
//
// שייכות: הת"ז מהאסימון, והשדה חייב להיות בבסיס שהנהג מורשה אליו **עכשיו**.
// נהג שהרשאת הבסיס שלו הוסרה לא רואה את התבניות של הבסיס הזה.

export const DRIVER_TEMPLATE_LIMIT = 50;

const TEMPLATE_SELECT = `
  SELECT tp.id, tp.name, tp.airfield_id, tp.data, tp.created_at, tp.updated_at,
         a.base_id, b.name AS base_name, a.name AS airfield_name,
         fp.name AS from_point_name, tpt.name AS to_point_name
    FROM entry_permit_trip_templates tp
    JOIN airfields a ON a.id = tp.airfield_id
    LEFT JOIN aviation_bases b ON b.id = a.base_id
    LEFT JOIN airfield_points fp ON fp.id = NULLIF(tp.data->>'from_point_id', '')::int AND fp.airfield_id = tp.airfield_id
    LEFT JOIN airfield_points tpt ON tpt.id = NULLIF(tp.data->>'to_point_id', '')::int AND tpt.airfield_id = tp.airfield_id`;

const templateOwnedBy = n => `tp.driver_national_id = $${n} AND a.base_id = ANY($${n + 1}::int[])`;

/** גוף התבנית מנוקה (buildTemplate המשותף), מאומת מול השדה והבסיס. `null` כשהתשובה נשלחה. */
async function templateBody(req, res, scope) {
  const raw = req.body || {};
  const { body, errors } = buildTemplate({ ...(raw.data || {}), name: raw.name, airfield_id: raw.airfield_id });
  if (errors.length) { res.status(400).json({ error: 'missing_fields', fields: errors }); return null; }
  const af = (await pool.query('SELECT base_id FROM airfields WHERE id=$1', [body.airfield_id])).rows[0];
  if (!af || !driverMayUseBase(scope, af.base_id)) {
    res.status(403).json({ error: 'base_not_permitted', message: 'אינך מורשה לבסיס זה' });
    return null;
  }
  const badRef = await invalidDriverReference(body.airfield_id, body.data);
  if (badRef) { res.status(400).json({ error: 'invalid_reference', field: badRef }); return null; }
  return body;
}

const oneTemplate = async (id) => (await pool.query(`${TEMPLATE_SELECT} WHERE tp.id=$1`, [id])).rows[0] || null;

router.get('/api/driver-trips/templates', async (req, res) => {
  try {
    const scope = driverScope(req, res);
    if (!scope) return;
    const r = await pool.query(
      `${TEMPLATE_SELECT} WHERE ${templateOwnedBy(1)} ORDER BY tp.name, tp.id`,
      [scope.nationalId, scope.baseIds]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/driver-trips/templates', async (req, res) => {
  try {
    const scope = driverScope(req, res);
    if (!scope) return;
    const body = await templateBody(req, res, scope);
    if (!body) return;
    const { rows: [{ n }] } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM entry_permit_trip_templates WHERE driver_national_id=$1', [scope.nationalId]);
    if (n >= DRIVER_TEMPLATE_LIMIT) return res.status(409).json({ error: 'template_limit', limit: DRIVER_TEMPLATE_LIMIT });
    const r = await pool.query(
      `INSERT INTO entry_permit_trip_templates (driver_national_id, airfield_id, name, data)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [scope.nationalId, body.airfield_id, body.name, JSON.stringify(body.data)]);
    res.status(201).json(await oneTemplate(r.rows[0].id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** תבנית של נהג אחר (או של בסיס שכבר אינו מורשה) - 404, כמו נסיעה. */
const ownsTemplate = async (id, scope) => (await pool.query(
  `SELECT 1 FROM entry_permit_trip_templates tp JOIN airfields a ON a.id = tp.airfield_id
    WHERE tp.id = $1 AND ${templateOwnedBy(2)}`, [num(id), scope.nationalId, scope.baseIds]
)).rows.length > 0;

router.put('/api/driver-trips/templates/:id', async (req, res) => {
  try {
    const scope = driverScope(req, res);
    if (!scope) return;
    if (!Number.isInteger(num(req.params.id)) || !(await ownsTemplate(req.params.id, scope))) {
      return res.status(404).json({ error: 'template_not_found' });
    }
    const body = await templateBody(req, res, scope);
    if (!body) return;
    await pool.query(
      `UPDATE entry_permit_trip_templates SET airfield_id=$2, name=$3, data=$4, updated_at=NOW() WHERE id=$1`,
      [num(req.params.id), body.airfield_id, body.name, JSON.stringify(body.data)]);
    res.json(await oneTemplate(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/driver-trips/templates/:id', async (req, res) => {
  try {
    const scope = driverScope(req, res);
    if (!scope) return;
    if (!Number.isInteger(num(req.params.id)) || !(await ownsTemplate(req.params.id, scope))) {
      return res.status(404).json({ error: 'template_not_found' });
    }
    await pool.query('DELETE FROM entry_permit_trip_templates WHERE id=$1', [num(req.params.id)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * מה טופס הבקשה של הנהג צריך כדי למלא נסיעה בבסיס: השדות, הנקודות שלהם, וסוגי
 * הרכב והנסיעה הפעילים. נתיב אחד במקום ארבעה, כי הנהג אינו מורשה לנתיבי
 * הניהול (`/api/permit-params`, `/api/airfields/:id/points`).
 */
router.get('/api/driver-trip-options/:baseId', driverBaseGuard, async (req, res) => {
  try {
    const baseId = num(req.params.baseId);
    const airfields = (await pool.query(
      'SELECT id, name FROM airfields WHERE base_id=$1 ORDER BY name, id', [baseId])).rows;
    const ids = airfields.map(a => a.id);
    const points = ids.length ? (await pool.query(
      'SELECT id, name, airfield_id FROM airfield_points WHERE airfield_id = ANY($1::int[]) ORDER BY name, id', [ids])).rows : [];
    const params = ids.length ? (await pool.query(
      `SELECT id, name, kind, airfield_id FROM airfield_permit_params
        WHERE airfield_id = ANY($1::int[]) AND kind IN ('vehicle_type','trip_type') AND active
        ORDER BY sort_order, name`, [ids])).rows : [];
    const strip = ({ kind, ...p }) => p;
    res.json({
      airfields,
      points,
      vehicle_types: params.filter(p => p.kind === 'vehicle_type').map(strip),
      trip_types: params.filter(p => p.kind === 'trip_type').map(strip),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** אישור הנהג. אינו משנה סטטוס - הסטטוס הוא הכרעת המגדל, וזו רק הצהרת הנהג. */
router.post('/api/driver-trips/:id/ack', async (req, res) => {
  try {
    const scope = driverScope(req, res);
    if (!scope) return;
    if (!(await ownsTrip(req.params.id, scope))) return res.status(404).json({ error: 'trip_not_found' });
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
    const scope = driverScope(req, res);
    if (!scope) return;
    const b = req.body || {};
    const change = {};
    for (const f of DRIVER_EDITABLE_FIELDS) if (b[f] !== undefined) change[f] = b[f];
    if (!Object.keys(change).length) return res.status(400).json({ error: 'nothing_to_change' });
    if (!(await ownsTrip(req.params.id, scope))) return res.status(404).json({ error: 'trip_not_found' });
    // רק מה שהשתנה באמת. טופס שנשלח בלי שינוי אינו בקשה - ואסור שיוריד נסיעה
    // מאושרת לממתין רק כי הנהג לחץ "שלח".
    const actual = await actualDriverChanges(change, await oneTrip(req.params.id));
    if (!Object.keys(actual).length) return res.status(400).json({ error: 'nothing_to_change' });
    // כל עדכון מחזיר את הנסיעה ל**ממתין** - גם אם אושרה - עד שהמגדל מכריע.
    // הסטטוס שלפני העדכון נשמר פעם אחת: עדכון שני לפני הכרעה אינו דורס אותו.
    const r = await pool.query(
      `UPDATE entry_permit_trips
          SET pending_change=$1, pending_change_at=NOW(), updated_at=NOW(),
              pending_change_prev_status = COALESCE(pending_change_prev_status, status),
              status = 'pending'
        WHERE id=$2 RETURNING id`,
      [JSON.stringify(actual), req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'trip_not_found' });
    res.json(await oneTrip(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * "הפעל נסיעה" - הנהג יוצא לדרך. מותר רק לנסיעה **מאושרת**, ורק מחצי שעה לפני
 * מועד היציאה ועד חצי שעה אחריו (START_WINDOW_MINUTES, משותף לאפליקציה). מחוץ
 * לחלון - 409, והאפליקציה אומרת לנהג שנדרש לעדכן את זמן היציאה.
 * `driver_started_at` מקפיץ למגדל התראה (TripAlertsLayer).
 */
router.post('/api/driver-trips/:id/start', async (req, res) => {
  try {
    const scope = driverScope(req, res);
    if (!scope) return;
    if (!(await ownsTrip(req.params.id, scope))) return res.status(404).json({ error: 'trip_not_found' });
    const t = await oneTrip(req.params.id);
    if (!t) return res.status(404).json({ error: 'trip_not_found' });
    if (t.status !== 'approved') return res.status(409).json({ error: 'not_approved' });
    const window = startWindowState(t.scheduled_at);
    if (window !== 'open') {
      return res.status(409).json({ error: 'outside_start_window', window, minutes: START_WINDOW_MINUTES });
    }
    await pool.query(
      `UPDATE entry_permit_trips SET driver_started_at = COALESCE(driver_started_at, NOW()), updated_at = NOW()
        WHERE id=$1`, [req.params.id]);
    res.json(await oneTrip(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── מעקב נסיעה חי (TRIP_LIVE_TRACKING_SPEC.md) ──────────────────────────────
//
// הגאומטריה, הספים וכלל החסימה חיים ב-shared/tripTracking.js - אותו קוד שרץ
// באפליקציית הנהג ובמגדל. כאן רק השליפה, השמירה והבעלות.

/** היסטוריית ה-GPS נחתכת לאורך הזה לכל נסיעה */
export const GPS_HISTORY_LIMIT = 500;

const parseList = v => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } }
  return [];
};

/**
 * העוגן של השדה: המפה קודמת, ובהיעדר עוגן בה - העוגן של השדה עצמו.
 * אותו סדר עדיפויות כמו SectorDashboard (groundAnchor), כדי שהנהג והמגדל
 * ימקמו את אותה נקודה באותו מקום.
 */
async function airfieldGeo(airfieldId, q = pool) {
  if (!airfieldId) return { map_id: null, anchor: null };
  const r = await q.query(
    `SELECT a.map_id,
            m.anchor1_x_img AS m_ax1, m.anchor1_y_img AS m_ay1, m.anchor1_lat AS m_alat1, m.anchor1_lon AS m_alon1,
            m.anchor2_x_img AS m_ax2, m.anchor2_y_img AS m_ay2, m.anchor2_lat AS m_alat2, m.anchor2_lon AS m_alon2,
            a.anchor1_x_img, a.anchor1_y_img, a.anchor1_lat, a.anchor1_lon,
            a.anchor2_x_img, a.anchor2_y_img, a.anchor2_lat, a.anchor2_lon
       FROM airfields a LEFT JOIN maps m ON m.id = a.map_id WHERE a.id = $1`, [airfieldId]);
  const row = r.rows[0];
  if (!row) return { map_id: null, anchor: null };
  const fromMap = anchorFrom({
    anchor1_x_img: row.m_ax1, anchor1_y_img: row.m_ay1, anchor1_lat: row.m_alat1, anchor1_lon: row.m_alon1,
    anchor2_x_img: row.m_ax2, anchor2_y_img: row.m_ay2, anchor2_lat: row.m_alat2, anchor2_lon: row.m_alon2,
  });
  return { map_id: row.map_id ?? null, anchor: fromMap || anchorFrom(row) };
}

/** האפשרות שהמגדל בחר: route_ids שלה שווה (כקבוצה) ל-selected_route_ids. */
function selectedOption(trip) {
  const selected = new Set(parseList(trip.selected_route_ids).map(Number).filter(Number.isFinite));
  if (!selected.size) return { option: null, index: -1 };
  const options = parseList(trip.route_options);
  const index = options.findIndex(o => {
    const ids = parseList(o?.route_ids).map(Number);
    return ids.length === selected.size && ids.every(id => selected.has(id));
  });
  return { option: index >= 0 ? options[index] : null, index };
}

/**
 * הנתיב **שהמגדל אישר**, מהנקודות שנשמרו על האפשרות שנבחרה. לא חישוב מחדש -
 * רשת הדרכים עלולה להשתנות בין האישור ליציאה, ואז "סטייה" הייתה נמדדת מול דרך
 * שאיש לא אישר (לנסיעה ישנה בלי נקודות - resolveApprovedRoute).
 * כל נקודה מקבלת נ"צ: מהנתיב עצמו, ובהיעדרו מהאחוזים דרך העוגן.
 */
function approvedRoute(trip, anchor) {
  const wps = parseList(selectedOption(trip).option?.waypoints);
  const route = [];
  for (const w of wps) {
    // num ולא Number: Number(null) הוא 0, ונקודה בלי נ"צ או בלי אחוזים נחתה בפינת המפה
    let lat = num(w?.lat), lon = num(w?.lon ?? w?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const g = pctToLatLon(w?.xPct ?? w?.x, w?.yPct ?? w?.y, anchor);
      if (!g) continue;
      ({ lat, lon } = g);
    }
    route.push({
      lat, lon,
      xPct: Number.isFinite(num(w?.xPct)) ? num(w.xPct) : null,
      yPct: Number.isFinite(num(w?.yPct)) ? num(w.yPct) : null,
      routeType: w?.routeType || 'vehicle',
      isCrossing: !!w?.isCrossing,
    });
  }
  return route.length >= 2 ? route : [];
}

// ── השלמת נתיב לנסיעה שאושרה לפני שהנתיב נשמר ─────────────────────────────
// זה קרה: כל הנסיעות שאושרו לפני שמירת הנקודות על הנסיעה הגיעו לנהג ולמגדל בלי
// קו. הנתיב מחושב מחדש **באותו מתכנן** שהפקח ראה (planRoute), עם ההרשאות של
// האפשרות שנבחרה - ומתקבל **רק** אם עבר בדיוק באותם מקטעים שאושרו. רשת שהשתנתה
// מאז נותנת מקטעים אחרים, ואז אין קו: "סטייה" מול דרך שאיש לא אישר גרועה מחוסר
// נתיב, שהמסך אומר במפורש. נתיב שהתקבל נשמר על האפשרות, כך שהחישוב קורה פעם אחת.

/** ההרשאות של כל אפשרות - אותן שלוש כמו ROUTE_VARIANTS בחלון ניהול נסיעות */
const ROUTE_VARIANT_PERMISSIONS = {
  vehicle: ['vehicle'],
  taxiways: ['vehicle', 'taxiways'],
  runways: ['vehicle', 'taxiways', 'runways'],
};
/** חישוב שלא הניב את הנתיב שאושר אינו חוזר על כל קריאה (5 ש') - רק כשהנסיעה השתנתה או שעבר הזמן */
const REPLAN_RETRY_MS = 10 * 60_000;
const replanMisses = new Map();

async function resolveApprovedRoute(trip, anchor) {
  const route = approvedRoute(trip, anchor);
  if (route.length || !anchor) return route;
  const { option, index } = selectedOption(trip);
  // יש נקודות שמורות ועדיין אין קו - הבעיה אינה נתיב חסר, וחישוב מחדש לא יפתור אותה
  if (!option || parseList(option.waypoints).length) return route;
  const permissions = ROUTE_VARIANT_PERMISSIONS[option.key];
  if (!permissions || !trip.from_point_id || !trip.to_point_id) return [];

  const missKey = `${trip.id}|${new Date(trip.updated_at).getTime()}`;
  const missAt = replanMisses.get(missKey);
  if (missAt && Date.now() - missAt < REPLAN_RETRY_MS) return [];

  let plan = null;
  try {
    plan = await planRoute({
      airfield_id: trip.airfield_id,
      from_point_id: trip.from_point_id,
      to_point_id: trip.to_point_id,
      via_point_ids: parseList(trip.stops).map(st => num(st?.point_id)).filter(Boolean),
      permissions,
    });
  } catch { plan = null; }
  const approved = new Set(parseList(option.route_ids).map(Number));
  const got = [...new Set((plan?.routeSegments || []).map(sg => Number(sg.id)))];
  const waypoints = compactWaypoints(plan?.waypoints);
  if (got.length !== approved.size || !got.every(id => approved.has(id)) || waypoints.length < 2) {
    if (replanMisses.size > 1000) replanMisses.clear();
    replanMisses.set(missKey, Date.now());
    return [];
  }

  const options = parseList(trip.route_options);
  const next = options.map((o, i) => (i === index ? { ...o, waypoints } : o));
  // רק אם האפשרויות לא השתנו בינתיים (הפקח שומר בדיוק עכשיו) - לא דורסים אותו.
  // updated_at לא מתעדכן: זו השלמה של מה שאושר, לא שינוי בנסיעה.
  await pool.query(
    'UPDATE entry_permit_trips SET route_options = $2::jsonb WHERE id = $1 AND route_options = $3::jsonb',
    [trip.id, JSON.stringify(next), JSON.stringify(options)]);
  return approvedRoute({ ...trip, route_options: next }, anchor);
}

/** קו בנ"צ מרשימת נקודות באחוזים ({x,y} או {xPct,yPct}). נקודה שכבר נושאת נ"צ - נשמרת. */
function geoLine(points, anchor) {
  const line = [];
  for (const pt of parseList(points)) {
    const lat = num(pt?.lat), lon = num(pt?.lon ?? pt?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lon)) { line.push({ lat, lon }); continue; }
    const g = pctToLatLon(pt?.xPct ?? pt?.x, pt?.yPct ?? pt?.y, anchor);
    if (g) line.push(g);
  }
  return line;
}

/**
 * אלמנטי השליטה בתנועה בשדה (roadControlElements), כל אחד עם נ"צ, האם הוא על
 * הנתיב והאם הוא סוגר את הדרך עכשיו. גם בלי נתיב - המפה לא נשארת ריקה.
 */
async function routeElements(airfieldId, route, anchor, q = pool) {
  if (!anchor) return [];
  const r = await q.query(
    `SELECT ae.id, ae.name, ae.category, ae.status, ae.display_state, ae.blocking_statuses,
            ae.x_pct, ae.y_pct, ae.rotation, aet.icon AS type_icon, aet.allowed_statuses AS type_allowed_statuses
       FROM airfield_elements ae LEFT JOIN airfield_element_types aet ON aet.id = ae.element_type_id
      WHERE ae.airfield_id = $1 AND ae.x_pct IS NOT NULL AND ae.y_pct IS NOT NULL`, [airfieldId]);
  return roadControlElements(r.rows, route, anchor).map(el => ({
    id: el.id, name: el.name, category: el.category, status: el.status, display_state: el.display_state,
    blocking_statuses: el.blocking_statuses, type_allowed_statuses: el.type_allowed_statuses,
    type_icon: el.type_icon, rotation: el.rotation,
    x_pct: el.x_pct, y_pct: el.y_pct, lat: el.lat, lon: el.lon,
    route_distance_m: el.route_distance_m, on_route: el.on_route, blocking: isElementBlocking(el),
  }));
}

/** נקודת שדה (מוצא/יעד) עם נ"צ */
async function pointGeo(id, anchor, q = pool) {
  if (!id) return null;
  const r = await q.query('SELECT id, name, x_pct, y_pct FROM airfield_points WHERE id = $1', [id]);
  const pt = r.rows[0];
  if (!pt) return null;
  const g = pctToLatLon(pt.x_pct, pt.y_pct, anchor);
  return { id: pt.id, name: pt.name, x_pct: pt.x_pct, y_pct: pt.y_pct, lat: g?.lat ?? null, lon: g?.lon ?? null };
}

/**
 * מסלולי הטיסה וההסעה של השדה כקווים בנ"צ.
 * טיסה - airfield_runways (קו האמצע). הסעה - base_routes מסוג taxiway ו-airfield_routes
 * של כלי טיס שאינם מסלול טיסה (מסלול טיסה משוקף שם כקו, ולא ייספר פעמיים).
 */
async function movementAreas(airfieldId, anchor, q = pool) {
  if (!airfieldId || !anchor) return { runways: [], taxiways: [] };
  const [rw, br, ar] = await Promise.all([
    q.query('SELECT id, name, start_x_pct, start_y_pct, end_x_pct, end_y_pct FROM airfield_runways WHERE airfield_id = $1', [airfieldId]),
    q.query("SELECT id, name, waypoints FROM base_routes WHERE airfield_id = $1 AND route_type = 'taxiway'", [airfieldId]),
    q.query("SELECT id, name, route_path FROM airfield_routes WHERE airfield_id = $1 AND route_category = 'aircraft' AND NOT COALESCE(is_runway, false)", [airfieldId]),
  ]);
  const runways = rw.rows
    .map(r => ({ id: `rw${r.id}`, name: r.name || '', line: geoLine([{ x: r.start_x_pct, y: r.start_y_pct }, { x: r.end_x_pct, y: r.end_y_pct }], anchor) }))
    .filter(r => r.line.length >= 2);
  const taxiways = [
    ...br.rows.map(r => ({ id: `br${r.id}`, name: r.name || '', line: geoLine(r.waypoints, anchor) })),
    ...ar.rows.map(r => ({ id: `ar${r.id}`, name: r.name || '', line: geoLine(r.route_path, anchor) })),
  ].filter(r => r.line.length >= 2);
  return { runways, taxiways };
}

/** נסיעה פעילה: הופעלה, לא הסתיימה */
const isLiveTrip = t => !!t?.driver_started_at && !t.ended_at && t.status !== 'ended';

/**
 * כל נתוני המפה לנהג בקריאה אחת (D1-D3). האפליקציה טוענת אותם בהפעלה ומחשבת
 * מהם את ההתרעות **מקומית**, כך שהן לא תלויות בקליטה.
 */
router.get('/api/driver-trips/:id/live', async (req, res) => {
  try {
    const scope = driverScope(req, res);
    if (!scope) return;
    if (!(await ownsTrip(req.params.id, scope))) return res.status(404).json({ error: 'trip_not_found' });
    const t = await oneTrip(req.params.id);
    if (!t) return res.status(404).json({ error: 'trip_not_found' });
    const geo = await airfieldGeo(t.airfield_id);
    const route = await resolveApprovedRoute(t, geo.anchor);
    const [elements, areas, from, to] = await Promise.all([
      routeElements(t.airfield_id, route, geo.anchor),
      movementAreas(t.airfield_id, geo.anchor),
      pointGeo(t.from_point_id, geo.anchor),
      pointGeo(t.to_point_id, geo.anchor),
    ]);
    res.json({
      trip: t,
      map_id: geo.map_id,
      anchor: geo.anchor,
      has_anchor: !!geo.anchor,
      has_route: route.length >= 2,
      route, elements, from, to,
      stop_names: parseList(t.stop_names),
      runways: areas.runways, taxiways: areas.taxiways,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * קריאת GPS מהנהג. השרת שומר, מחשב סטייה ואלמנט חוסם **בעצמו** - כך ששני
 * מגדלים רואים את אותה התרעה - ומחזיר את המצב.
 */
router.post('/api/driver-trips/:id/gps', async (req, res) => {
  try {
    const scope = driverScope(req, res);
    if (!scope) return;
    const b = req.body || {};
    const lat = Number(b.lat), lng = Number(b.lng ?? b.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'invalid_position' });
    }
    const opt = v => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const accuracy = opt(b.accuracy), heading = opt(b.heading), speed = opt(b.speed_kmh ?? b.speed);

    if (!(await ownsTrip(req.params.id, scope))) return res.status(404).json({ error: 'trip_not_found' });
    const t = await oneTrip(req.params.id);
    if (!t) return res.status(404).json({ error: 'trip_not_found' });
    if (!t.driver_started_at) return res.status(409).json({ error: 'not_started' });
    if (!isLiveTrip(t)) return res.status(409).json({ error: 'trip_ended' });

    const geo = await airfieldGeo(t.airfield_id);
    const route = await resolveApprovedRoute(t, geo.anchor);
    const pos = { lat, lon: lng };
    const dev = route.length >= 2 ? metersToPolyline(pos, route) : null;
    const deviationM = dev ? dev.meters : null;

    const prev = (await pool.query('SELECT deviation_streak FROM entry_permit_trip_live WHERE trip_id = $1', [t.id])).rows[0];
    const streak = nextDeviationStreak(prev?.deviation_streak ?? 0, deviationM, accuracy);

    // האלמנט הסוגר הקרוב ביותר **לרכב** - גם כשסטה מהנתיב, המחסום שמולו סוגר את
    // הדרך שלו. קריאה בדיוק גרוע אינה מקפיצה התרעה.
    let blocking = null;
    if (accuracy === null || accuracy <= MAX_ACCURACY_M) {
      for (const el of await routeElements(t.airfield_id, route, geo.anchor)) {
        if (!el.blocking) continue;
        const d = metersToSegment(pos, el, el);
        if (d <= ELEMENT_ALERT_M && (!blocking || d < blocking.distance_m)) {
          blocking = { id: el.id, name: el.name, display_state: el.display_state, distance_m: d };
        }
      }
    }

    await pool.query(
      `INSERT INTO entry_permit_trip_gps (trip_id, lat, lng, accuracy_m, heading, speed_kmh) VALUES ($1,$2,$3,$4,$5,$6)`,
      [t.id, lat, lng, accuracy, heading, speed]);
    await pool.query(
      `DELETE FROM entry_permit_trip_gps WHERE trip_id = $1 AND id NOT IN (
         SELECT id FROM entry_permit_trip_gps WHERE trip_id = $1 ORDER BY recorded_at DESC, id DESC LIMIT $2)`,
      [t.id, GPS_HISTORY_LIMIT]);
    await pool.query(
      `INSERT INTO entry_permit_trip_live
         (trip_id, lat, lng, accuracy_m, heading, speed_kmh, fix_at, deviation_m, deviation_streak,
          blocking_element_id, blocking_distance_m, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9,$10,NOW())
       ON CONFLICT (trip_id) DO UPDATE SET
         lat=EXCLUDED.lat, lng=EXCLUDED.lng, accuracy_m=EXCLUDED.accuracy_m, heading=EXCLUDED.heading,
         speed_kmh=EXCLUDED.speed_kmh, fix_at=EXCLUDED.fix_at, deviation_m=EXCLUDED.deviation_m,
         deviation_streak=EXCLUDED.deviation_streak, blocking_element_id=EXCLUDED.blocking_element_id,
         blocking_distance_m=EXCLUDED.blocking_distance_m, updated_at=NOW()`,
      [t.id, lat, lng, accuracy, heading, speed, deviationM, streak, blocking?.id ?? null, blocking?.distance_m ?? null]);

    res.json({ deviation_m: deviationM, deviation_streak: streak, deviating: isDeviating(streak), blocking_element: blocking });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * סיום נסיעה (D12). בלעדיו המעקב אינו נגמר, והמגדל רואה רכב רפאים עומד על המפה.
 * הנסיעה עוברת להיסטוריה - היא בוצעה, וזו עובדה ולא הכרעה של המגדל.
 */
router.post('/api/driver-trips/:id/end', async (req, res) => {
  try {
    const scope = driverScope(req, res);
    if (!scope) return;
    if (!(await ownsTrip(req.params.id, scope))) return res.status(404).json({ error: 'trip_not_found' });
    const t = await oneTrip(req.params.id);
    if (!t) return res.status(404).json({ error: 'trip_not_found' });
    if (!t.driver_started_at) return res.status(409).json({ error: 'not_started' });
    await pool.query(
      `UPDATE entry_permit_trips SET ended_at = COALESCE(ended_at, NOW()), status = 'ended', updated_at = NOW()
        WHERE id = $1`, [t.id]);
    res.json(await oneTrip(t.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * הנסיעות הפעילות בשדה, למגדל: מיקום אחרון, סטייה, אלמנט חוסם והנתיב שאושר.
 * `stale` - אין קריאה, או שהאחרונה ישנה מ-60 ש' (אות אבד).
 */
router.get('/api/trips/live', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    if (!airfield_id) return res.json([]);
    const trips = (await pool.query(
      `${TRIP_SELECT} WHERE t.airfield_id = $1 AND t.driver_started_at IS NOT NULL
         AND t.ended_at IS NULL AND t.status <> 'ended' ORDER BY t.driver_started_at`, [airfield_id])).rows;
    if (!trips.length) return res.json([]);
    const ids = trips.map(t => t.id);
    const live = (await pool.query(
      `SELECT l.*, e.name AS blocking_name, e.display_state AS blocking_display_state
         FROM entry_permit_trip_live l LEFT JOIN airfield_elements e ON e.id = l.blocking_element_id
        WHERE l.trip_id = ANY($1::int[])`, [ids])).rows;
    const byTrip = new Map(live.map(l => [l.trip_id, l]));
    const geo = await airfieldGeo(Number(airfield_id));
    const now = Date.now();
    const routes = await Promise.all(trips.map(t => resolveApprovedRoute(t, geo.anchor)));
    res.json(trips.map((t, i) => {
      const l = byTrip.get(t.id);
      const route = routes[i];
      return {
        ...t,
        route,
        has_route: route.length >= 2,
        has_anchor: !!geo.anchor,
        position: l ? { lat: l.lat, lng: l.lng, accuracy_m: l.accuracy_m, heading: l.heading, speed_kmh: l.speed_kmh, fix_at: l.fix_at } : null,
        stale: isFixStale(l?.fix_at ?? null, now),
        deviation_m: l?.deviation_m ?? null,
        deviating: isDeviating(l?.deviation_streak ?? 0),
        blocking_element: l?.blocking_element_id
          // התווית בעברית מגיעה מכאן - מאותה מפה שכלל החסימה משתמש בה - ולא
          // מעותק שלישי שלה בלקוח
          ? { id: l.blocking_element_id, name: l.blocking_name, display_state: l.blocking_display_state,
              state_label: DISPLAY_STATE_LABEL[l.blocking_display_state] || '', distance_m: l.blocking_distance_m }
          : null,
      };
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
