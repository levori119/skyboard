// **מעקב נסיעה חי** מול Postgres אמיתי (PGlite בזיכרון). אפיון: TRIP_LIVE_TRACKING_SPEC.md.
//
// למה מול DB אמיתי: הטענות כאן הן על מה שיושב ב-DB ועל ה-SQL - שהסטייה נצברת
// על פני קריאות רצופות בשורה החיה, שהיסטוריית ה-GPS נחתכת, שנסיעה שהסתיימה
// לא מקבלת קריאות, ושהמגדל רואה רק נסיעות פעילות. mock של pool היה מאשר את
// כל אלה בלי לבדוק כלום.
//
// הגאומטריה: עוגן מפה x 0..100 ↔ lon 34.60..34.70, y 0..100 ↔ lat 31.30..31.20.
// ~95 מ' לאחוז x, ~111 מ' לאחוז y. הנתיב: קו אופקי ב-lat 31.25 מ-lon 34.64 ל-34.66.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

let pool, server, base, router;

const req = (method, path, body, headers = {}) => fetch(`${base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const get = p => req('GET', p);
const post = (p, b) => req('POST', p, b);
const asDriver = nid => ({ 'X-Test-Driver': nid });
const dget = (p, nid) => req('GET', p, undefined, asDriver(nid));
const dpost = (p, nid, b) => req('POST', p, b, asDriver(nid));

const AF = 1;
const MY_TZ = '012345678';
const OTHER_TZ = '087654321';
const ROUTE = [
  { lat: 31.25, lon: 34.64, xPct: 40, yPct: 50, routeType: 'vehicle', isCrossing: false },
  { lat: 31.25, lon: 34.66, xPct: 60, yPct: 50, routeType: 'vehicle', isCrossing: false },
];
const ON_ROUTE = { lat: 31.25, lng: 34.65, accuracy: 8 };
const OFF_300 = { lat: 31.2527, lng: 34.65, accuracy: 8 }; // ~300 מ' מהנתיב
const tripAt = mins => new Date(Date.now() + mins * 60_000).toISOString();

/** נסיעה מאושרת עם נתיב שמור, לנהג MY_TZ, מועדה עכשיו (בתוך חלון ההפעלה) */
const mkTrip = (over = {}) => post('/api/trips', {
  airfield_id: AF, driver_name: 'אורח', driver_national_id: MY_TZ, vehicle_name: 'מיניבוס',
  status: 'approved', scheduled_at: tripAt(0), from_point_id: 20, to_point_id: 21,
  route_options: [{ key: 'vehicle', route_ids: [5], label: 'כביש היקפי', dist_m: 1900, crossings: 0, waypoints: ROUTE }],
  selected_route_ids: [5], selected_route_label: 'כביש היקפי',
  ...over,
}).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(`mkTrip ${r.status} ${JSON.stringify(j)}`); return j; });

const mkStarted = async (over = {}) => {
  const t = await mkTrip(over);
  const s = await dpost(`/api/driver-trips/${t.id}/start`, MY_TZ);
  if (s.status !== 200) throw new Error(`start failed ${s.status} ${await s.text()}`);
  return t;
};

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  ({ default: router } = await import('./permits.js'));
  const { listen } = await import('../listen.js');

  // זהה ל-init.js בעמודות שהנתיבים נוגעים בהן
  await pool.query(`CREATE TABLE public.aviation_bases (id SERIAL PRIMARY KEY, name VARCHAR(100))`);
  await pool.query(`INSERT INTO aviation_bases (id, name) VALUES (70, 'בסיס א')`);
  await pool.query(`CREATE TABLE public.maps (
    id SERIAL PRIMARY KEY, name VARCHAR(100),
    anchor1_x_img REAL, anchor1_y_img REAL, anchor1_lat DOUBLE PRECISION, anchor1_lon DOUBLE PRECISION,
    anchor2_x_img REAL, anchor2_y_img REAL, anchor2_lat DOUBLE PRECISION, anchor2_lon DOUBLE PRECISION)`);
  await pool.query(`CREATE TABLE public.airfields (
    id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, base_id INTEGER,
    map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
    anchor1_x_img REAL, anchor1_y_img REAL, anchor1_lat DOUBLE PRECISION, anchor1_lon DOUBLE PRECISION,
    anchor2_x_img REAL, anchor2_y_img REAL, anchor2_lat DOUBLE PRECISION, anchor2_lon DOUBLE PRECISION)`);
  await pool.query(`CREATE TABLE public.airfield_points (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, x_pct FLOAT NOT NULL DEFAULT 50, y_pct FLOAT NOT NULL DEFAULT 50)`);
  await pool.query(`CREATE TABLE public.vehicle_requests (id SERIAL PRIMARY KEY, status VARCHAR(20))`);
  await pool.query(`CREATE TABLE public.airfield_permit_params (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL DEFAULT 'zone',
    name VARCHAR(200) NOT NULL,
    polygon_id INTEGER,
    color VARCHAR(20) DEFAULT '#3b82f6',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE public.entry_permit_drivers (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL DEFAULT '',
    last_name VARCHAR(100) NOT NULL DEFAULT '',
    national_id VARCHAR(20) NOT NULL DEFAULT '',
    transport_role_id INTEGER REFERENCES airfield_permit_params(id) ON DELETE SET NULL,
    permit_from DATE, permit_until DATE,
    status_override VARCHAR(20) DEFAULT NULL,
    notes TEXT,
    approved_by VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE public.entry_permit_vehicles (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES entry_permit_drivers(id) ON DELETE CASCADE,
    vehicle_type_id INTEGER REFERENCES airfield_permit_params(id) ON DELETE SET NULL,
    plate_fixed BOOLEAN NOT NULL DEFAULT TRUE,
    plate_number VARCHAR(30) NOT NULL DEFAULT '',
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE public.entry_permit_trips (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    driver_id INTEGER REFERENCES entry_permit_drivers(id) ON DELETE CASCADE,
    vehicle_id INTEGER REFERENCES entry_permit_vehicles(id) ON DELETE SET NULL,
    from_point_id INTEGER REFERENCES airfield_points(id) ON DELETE SET NULL,
    to_point_id INTEGER REFERENCES airfield_points(id) ON DELETE SET NULL,
    from_text VARCHAR(200) NOT NULL DEFAULT '', to_text VARCHAR(200) NOT NULL DEFAULT '',
    scheduled_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, purpose TEXT,
    vehicle_request_id INTEGER REFERENCES vehicle_requests(id) ON DELETE SET NULL,
    driver_name VARCHAR(120) NOT NULL DEFAULT '', driver_phone VARCHAR(40) NOT NULL DEFAULT '',
    driver_national_id VARCHAR(20) NOT NULL DEFAULT '',
    requester_name VARCHAR(120) NOT NULL DEFAULT '', requester_phone VARCHAR(40) NOT NULL DEFAULT '',
    vehicle_name VARCHAR(120) NOT NULL DEFAULT '',
    vehicle_type_id INTEGER, trip_type_id INTEGER, icon VARCHAR(16) NOT NULL DEFAULT '',
    stops JSONB DEFAULT '[]', status VARCHAR(20) NOT NULL DEFAULT 'pending', note TEXT,
    escorts JSONB DEFAULT '[]', roam_permit_id INTEGER,
    suggested_route_ids JSONB DEFAULT '[]', route_options JSONB DEFAULT '[]',
    selected_route_ids JSONB DEFAULT '[]', selected_route_label VARCHAR(300) NOT NULL DEFAULT '',
    driver_ack_at TIMESTAMPTZ, pending_change JSONB, pending_change_at TIMESTAMPTZ,
    departure_alerted_at TIMESTAMPTZ, driver_requested_at TIMESTAMPTZ, driver_started_at TIMESTAMPTZ,
    pending_change_prev_status VARCHAR(20),
    updated_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE public.airfield_element_types (
    id SERIAL PRIMARY KEY, name VARCHAR(100), icon VARCHAR(200),
    can_change_status BOOLEAN DEFAULT FALSE, allowed_statuses JSONB DEFAULT '[]',
    open_icon VARCHAR(200), close_icon VARCHAR(200), status_icons JSONB DEFAULT '{}')`);
  await pool.query(`CREATE TABLE public.airfield_elements (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    element_type_id INTEGER REFERENCES airfield_element_types(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL, status VARCHAR(20) DEFAULT 'שמיש', x_pct FLOAT, y_pct FLOAT,
    category VARCHAR(100) DEFAULT '', display_state VARCHAR(20) DEFAULT 'normal',
    rotation SMALLINT DEFAULT 0, blocking_statuses JSONB DEFAULT '[]', hidden_on_map BOOLEAN DEFAULT false,
    blink_rate FLOAT DEFAULT 1.0, open_icon_key VARCHAR(200), close_icon_key VARCHAR(200),
    relevant_for JSONB DEFAULT '["vehicles","aircraft"]')`);
  await pool.query(`CREATE TABLE public.airfield_runways (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    name VARCHAR(20), start_x_pct FLOAT, start_y_pct FLOAT, end_x_pct FLOAT, end_y_pct FLOAT)`);
  await pool.query(`CREATE TABLE public.base_routes (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, waypoints JSONB DEFAULT '[]',
    airfield_id INTEGER, route_type VARCHAR(20) DEFAULT 'vehicle')`);
  await pool.query(`CREATE TABLE public.airfield_routes (
    id SERIAL PRIMARY KEY, airfield_id INTEGER, name VARCHAR(100) NOT NULL, route_path JSONB DEFAULT '[]',
    route_category VARCHAR(20) DEFAULT 'general', is_runway BOOLEAN DEFAULT FALSE)`);
  await pool.query(`CREATE TABLE public.entry_permit_trip_gps (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES entry_permit_trips(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
    accuracy_m DOUBLE PRECISION, heading DOUBLE PRECISION, speed_kmh DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE public.entry_permit_trip_live (
    trip_id INTEGER PRIMARY KEY REFERENCES entry_permit_trips(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
    accuracy_m DOUBLE PRECISION, heading DOUBLE PRECISION, speed_kmh DOUBLE PRECISION,
    fix_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deviation_m DOUBLE PRECISION, deviation_streak INTEGER NOT NULL DEFAULT 0,
    blocking_element_id INTEGER REFERENCES airfield_elements(id) ON DELETE SET NULL,
    blocking_distance_m DOUBLE PRECISION, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use((r, _res, next) => {
    const nid = r.get('X-Test-Driver');
    if (nid !== undefined) r.user = { role: 'driver', nationalId: nid, baseIds: [70] };
    next();
  });
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

beforeEach(async () => {
  for (const t of ['entry_permit_trip_gps', 'entry_permit_trip_live', 'entry_permit_trips', 'airfield_elements',
    'airfield_element_types', 'airfield_runways', 'base_routes', 'airfield_routes', 'airfield_points', 'airfields', 'maps']) {
    await pool.query(`DELETE FROM ${t}`);
  }
  await pool.query(`INSERT INTO maps (id, name, anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon,
    anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon) VALUES (7, 'מפת שדה', 0, 0, 31.3, 34.6, 100, 100, 31.2, 34.7)`);
  await pool.query(`INSERT INTO airfields (id, name, base_id, map_id) VALUES (1, 'שדה א', 70, 7)`);
  await pool.query(`INSERT INTO airfield_points (id, airfield_id, name, x_pct, y_pct) VALUES
    (20, 1, 'שער ראשי', 40, 50), (21, 1, 'מסוף מטען', 60, 50)`);
  await pool.query(`INSERT INTO airfield_elements (id, airfield_id, name, category, display_state, x_pct, y_pct) VALUES
    (31, 1, 'מחסום צפוני', 'מחסומים', 'close', 50, 50.2),
    (32, 1, 'מחסום פתוח', 'מחסומים', 'open', 55, 50.1),
    (33, 1, 'מחסום רחוק', 'מחסומים', 'close', 50, 40),
    (34, 1, 'מצלמת שער', 'camera', 'normal', 50, 50)`);
  await pool.query(`INSERT INTO airfield_runways (id, airfield_id, name, start_x_pct, start_y_pct, end_x_pct, end_y_pct)
    VALUES (41, 1, '26L', 40, 60, 60, 60)`);
  await pool.query(`INSERT INTO base_routes (id, name, airfield_id, route_type, waypoints) VALUES
    (51, 'הסעה A', 1, 'taxiway', '[{"x":40,"y":45},{"x":60,"y":45}]'),
    (52, 'כביש היקפי', 1, 'vehicle', '[{"x":40,"y":50},{"x":60,"y":50}]')`);
  await pool.query(`INSERT INTO airfield_routes (id, airfield_id, name, route_category, is_runway, route_path) VALUES
    (61, 1, 'הסעה B', 'aircraft', false, '[{"x":40,"y":55},{"x":60,"y":55}]'),
    (62, 1, '26L', 'aircraft', true, '[{"x":40,"y":60},{"x":60,"y":60}]')`);
});

describe('GET /api/driver-trips/:id/live - נתוני המפה לנהג', () => {
  it('הנתיב שאושר, העוגן והמפה', async () => {
    const t = await mkStarted();
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.has_route).toBe(true);
    expect(d.has_anchor).toBe(true);
    expect(d.map_id).toBe(7);
    expect(d.route).toHaveLength(2);
    expect(d.route[0]).toMatchObject({ lat: 31.25, lon: 34.64 });
    expect(d.anchor).toMatchObject({ lat1: 31.3, lon2: 34.7 });
  });

  // בשדה אמיתי הרמזורים עמדו 200 מ' ויותר מהנתיב, והנהג קיבל מפה בלי אלמנטים
  it('כל אלמנטי השליטה בשדה, on_route מסמן את שעל הדרך, בלי מצלמות', async () => {
    const t = await mkStarted();
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    const byId = Object.fromEntries(d.elements.map(e => [e.id, e]));
    expect(Object.keys(byId).map(Number).sort()).toEqual([31, 32, 33]);
    expect(byId[31]).toMatchObject({ blocking: true, on_route: true });
    expect(byId[32]).toMatchObject({ blocking: false, on_route: true });
    expect(byId[33]).toMatchObject({ blocking: true, on_route: false });
    expect(byId[33].route_distance_m).toBeGreaterThan(1000);
    expect(byId[31].lat).toBeCloseTo(31.2498, 4);
  });

  // הסמל באפליקציית הנהג זהה למגדל (shared/elementSymbols.js) - וצריך את אותם שדות
  it('כל שדה שהסמל של המגדל צריך מגיע לנהג', async () => {
    await pool.query(`INSERT INTO airfield_element_types (id, name, icon, open_icon, close_icon, status_icons)
      VALUES (91, 'מחסום', 'MAP:barrier', 'MAP:barrier-open', 'MAP:barrier', '{"שמיש":"MAP:barrier"}')`);
    await pool.query(`UPDATE airfield_elements SET element_type_id=91, blink_rate=0.5, open_icon_key='MAP:stopbar', rotation=45 WHERE id=31`);
    const t = await mkStarted();
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    const el = d.elements.find(e => e.id === 31);
    expect(el).toMatchObject({
      type_icon: 'MAP:barrier', type_open_icon: 'MAP:barrier-open', type_close_icon: 'MAP:barrier',
      type_status_icons: { 'שמיש': 'MAP:barrier' }, open_icon_key: 'MAP:stopbar', blink_rate: 0.5, rotation: 45,
    });
  });

  // "למי רלוונטי": אלמנט של מטוסים בלבד (תאורת מסלול, סימון הסעה) אינו מעניין את הנהג
  it('אלמנט שרלוונטי רק למטוסים לא מגיע לנהג', async () => {
    await pool.query(`UPDATE airfield_elements SET relevant_for='["aircraft"]' WHERE id=31`);
    await pool.query(`UPDATE airfield_elements SET relevant_for='["vehicles"]' WHERE id=32`);
    const t = await mkStarted();
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.elements.map(e => e.id).sort()).toEqual([32, 33]);
  });

  // לג לכל קטע בין תחנות: הנהג צריך את מיקום התחנות, ואת סימון התחנה בנתיב שנשמר
  it('התחנות עם מיקום, והנתיב שומר את סימון התחנה', async () => {
    const withStop = [ROUTE[0], { lat: 31.25, lon: 34.65, xPct: 50, yPct: 50, routeType: 'vehicle', isCrossing: false, isStop: true }, ROUTE[1]];
    const t = await mkStarted({
      stops: [{ point_id: 20, text: '' }, { point_id: null, text: 'שער צדדי' }],
      route_options: [{ key: 'vehicle', route_ids: [5], label: 'כביש היקפי', dist_m: 1900, crossings: 0, waypoints: withStop }],
    });
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.route.map(p => !!p.isStop)).toEqual([false, true, false]);
    expect(d.stops).toHaveLength(2);
    expect(d.stops[0]).toMatchObject({ name: 'שער ראשי', xPct: 40, yPct: 50 });
    expect(d.stops[0].lat).toBeCloseTo(31.25, 3);
    expect(d.stops[1]).toMatchObject({ name: 'שער צדדי', lat: null, lon: null, xPct: null, yPct: null });
  });

  it('נסיעה בלי נתיב - האלמנטים עדיין על המפה', async () => {
    const t = await mkStarted({ route_options: [], selected_route_ids: [] });
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.has_route).toBe(false);
    expect(d.elements.map(e => e.id).sort()).toEqual([31, 32, 33]);
    expect(d.elements.every(e => e.on_route === false)).toBe(true);
  });

  // זה קרה: כל הנסיעות שאושרו לפני שהנתיב נשמר על הנסיעה הגיעו לנהג בלי קו
  it('נסיעה שאושרה לפני שמירת הנתיב - הנתיב מחושב מחדש באותו מתכנן, ונשמר', async () => {
    const t = await mkStarted({
      route_options: [{ key: 'vehicle', route_ids: [52], label: 'כביש היקפי', dist_m: 1900, crossings: 0 }],
      selected_route_ids: [52], selected_route_label: 'כביש היקפי',
    });
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.has_route).toBe(true);
    expect(d.route.length).toBeGreaterThanOrEqual(2);
    expect(d.route[0].lat).toBeCloseTo(31.25, 3);
    expect(d.route.at(-1).lon).toBeCloseTo(34.66, 3);
    const { rows: [row] } = await pool.query('SELECT route_options FROM entry_permit_trips WHERE id=$1', [t.id]);
    expect(row.route_options[0].waypoints.length).toBe(d.route.length);
    expect(row.route_options[0]).toMatchObject({ key: 'vehicle', route_ids: [52], label: 'כביש היקפי' });
  });

  // המגדל אישר נתיב אחר ממה שהמתכנן מחזיר היום (המפה השתנתה) - לא מציגים נתיב שלא אושר
  it('חישוב מחדש שאינו הנתיב שאושר - בלי נתיב, ושום דבר לא נשמר', async () => {
    const t = await mkStarted({
      route_options: [{ key: 'vehicle', route_ids: [51], label: 'הסעה A', dist_m: 1, crossings: 0 }],
      selected_route_ids: [51],
    });
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.has_route).toBe(false);
    const { rows: [row] } = await pool.query('SELECT route_options FROM entry_permit_trips WHERE id=$1', [t.id]);
    expect(row.route_options[0].waypoints).toBeUndefined();
  });

  it('מסלולי טיסה והסעה - קווים בנ"צ, מכל המקורות', async () => {
    const t = await mkStarted();
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.runways.map(r => r.name)).toContain('26L');
    expect(d.runways[0].line[0].lat).toBeCloseTo(31.24, 6);
    // מסלול טיסה שמשוקף גם ב-airfield_routes אינו נכנס פעמיים כמסלול הסעה
    expect(d.taxiways.map(r => r.name).sort()).toEqual(['הסעה A', 'הסעה B']);
    expect(d.taxiways.every(r => r.line.length === 2 && Number.isFinite(r.line[0].lat))).toBe(true);
  });

  it('מוצא ויעד עם נ"צ', async () => {
    const t = await mkStarted();
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.from).toMatchObject({ id: 20, name: 'שער ראשי' });
    expect(d.from.lat).toBeCloseTo(31.25, 6);
    expect(d.to).toMatchObject({ id: 21 });
  });

  // זה קרה בשדה: הצומת הווירטואלי בתחילת הנתיב נשמר עם xPct=null, Number(null) הפך
  // אותו ל-0, והקו על מפת השדה יצא מהפינה השמאלית העליונה של המפה
  it('נקודה עם xPct=null - האחוזים נשארים null, ונקודה עם lat=null נגזרת מהעוגן', async () => {
    const t = await mkStarted({
      route_options: [{ key: 'vehicle', route_ids: [5], label: 'x', dist_m: 1, crossings: 0, waypoints: [
        { lat: 31.25, lon: 34.64, xPct: null, yPct: null, routeType: 'virtual', isCrossing: false },
        { lat: null, lon: null, xPct: 60, yPct: 50, routeType: 'vehicle', isCrossing: false },
      ] }],
    });
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.route).toHaveLength(2);
    expect(d.route[0]).toMatchObject({ lat: 31.25, lon: 34.64, xPct: null, yPct: null });
    expect(d.route[1].xPct).toBe(60);
    expect(d.route[1].lat).toBeCloseTo(31.25, 6);
    expect(d.route[1].lon).toBeCloseTo(34.66, 6);
  });

  // חלופות יכולות לעבור באותם מקטעים (בכיוון או בקטע אחר) - התיאור שנבחר מכריע
  it('שתי אפשרויות באותם מקטעים - הנתיב של זו שהתיאור שלה נבחר', async () => {
    const ALT = [{ lat: 31.26, lon: 34.64, xPct: 40, yPct: 40 }, { lat: 31.26, lon: 34.66, xPct: 60, yPct: 40 }];
    const t = await mkStarted({
      route_options: [
        { key: 'vehicle', route_ids: [5], label: 'קצר', dist_m: 1, crossings: 0, waypoints: ROUTE },
        { key: 'vehicle', route_ids: [5], label: 'חלופה', dist_m: 2, crossings: 0, waypoints: ALT },
      ],
      selected_route_ids: [5], selected_route_label: 'חלופה',
    });
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.route[0]).toMatchObject({ lat: 31.26, lon: 34.64 });
  });

  it('נסיעה של נהג אחר - 404', async () => {
    const t = await mkStarted();
    expect((await dget(`/api/driver-trips/${t.id}/live`, OTHER_TZ)).status).toBe(404);
  });

  // D2: נסיעה שאושרה לפני שהנתיב נשמר - בלי קו, ומודיעים זאת במפורש
  it('נסיעה בלי נתיב שמור - has_route=false ונתיב ריק', async () => {
    const t = await mkStarted({ route_options: [{ key: 'vehicle', route_ids: [5], label: 'x', dist_m: 1, crossings: 0 }] });
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.has_route).toBe(false);
    expect(d.route).toEqual([]);
  });

  // D3: בלי עוגן אין דרך למקם אלמנט שנשמר באחוזים
  it('שדה בלי עוגן - has_anchor=false, ואין אלמנטים', async () => {
    await pool.query('UPDATE airfields SET map_id = NULL WHERE id = 1');
    const t = await mkStarted();
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.has_anchor).toBe(false);
    expect(d.elements).toEqual([]);
  });

  it('עוגן השדה משמש כשלמפה אין עוגן', async () => {
    await pool.query('UPDATE maps SET anchor1_lat = NULL WHERE id = 7');
    await pool.query(`UPDATE airfields SET anchor1_x_img=0, anchor1_y_img=0, anchor1_lat=31.3, anchor1_lon=34.6,
      anchor2_x_img=100, anchor2_y_img=100, anchor2_lat=31.2, anchor2_lon=34.7 WHERE id = 1`);
    const t = await mkStarted();
    const d = await (await dget(`/api/driver-trips/${t.id}/live`, MY_TZ)).json();
    expect(d.has_anchor).toBe(true);
    expect(d.elements.map(e => e.id).sort()).toEqual([31, 32, 33]);
  });
});

describe('POST /api/driver-trips/:id/gps - קריאה מהנהג', () => {
  it('נסיעה שלא הופעלה - 409', async () => {
    const t = await mkTrip();
    expect((await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, ON_ROUTE)).status).toBe(409);
  });

  it('נסיעה של נהג אחר - 404', async () => {
    const t = await mkStarted();
    expect((await dpost(`/api/driver-trips/${t.id}/gps`, OTHER_TZ, ON_ROUTE)).status).toBe(404);
  });

  it('נ"צ לא חוקי - 400, ושום דבר לא נשמר', async () => {
    const t = await mkStarted();
    expect((await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, { lat: 200, lng: 34 })).status).toBe(400);
    expect((await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, { lat: 'x', lng: 34 })).status).toBe(400);
    const { rows } = await pool.query('SELECT COUNT(*)::int n FROM entry_permit_trip_gps');
    expect(rows[0].n).toBe(0);
  });

  it('על הנתיב - סטייה ~0, השורה החיה וההיסטוריה נכתבות', async () => {
    const t = await mkStarted();
    const r = await (await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, ON_ROUTE)).json();
    expect(r.deviation_m).toBeLessThan(5);
    expect(r.deviating).toBe(false);
    const live = (await pool.query('SELECT * FROM entry_permit_trip_live WHERE trip_id=$1', [t.id])).rows[0];
    expect(live.lat).toBe(31.25);
    expect((await pool.query('SELECT COUNT(*)::int n FROM entry_permit_trip_gps WHERE trip_id=$1', [t.id])).rows[0].n).toBe(1);
  });

  // T4/T5: הכרעת אורי - רק כשהסטייה נמשכת
  it('300 מ\' פעם אחת - עוד לא סטייה; פעמיים ברצף - סטייה', async () => {
    const t = await mkStarted();
    const r1 = await (await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, OFF_300)).json();
    expect(r1.deviation_m).toBeGreaterThan(200);
    expect(r1.deviating).toBe(false);
    const r2 = await (await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, OFF_300)).json();
    expect(r2.deviating).toBe(true);
  });

  it('חזרה לנתיב מבטלת את הסטייה', async () => {
    const t = await mkStarted();
    await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, OFF_300);
    await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, OFF_300);
    const r = await (await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, ON_ROUTE)).json();
    expect(r.deviating).toBe(false);
  });

  it('קריאה בדיוק גרוע אינה מקדמת את הסטייה', async () => {
    const t = await mkStarted();
    await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, OFF_300);
    const r = await (await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, { ...OFF_300, accuracy: 180 })).json();
    expect(r.deviating).toBe(false);
  });

  // T7: הכרעת אורי - אלמנט רק כשהוא סוגר
  it('ליד מחסום סגור על הדרך - האלמנט החוסם נרשם', async () => {
    const t = await mkStarted();
    const r = await (await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, ON_ROUTE)).json();
    expect(r.blocking_element).toMatchObject({ id: 31, name: 'מחסום צפוני' });
    expect(r.blocking_element.distance_m).toBeLessThan(50);
  });

  // ההתרעה נמדדת מהרכב: רכב שסטה ונתקל במחסום סגור - המחסום סוגר את הדרך שלו
  it('ליד מחסום סגור מחוץ לנתיב - גם נרשם', async () => {
    const t = await mkStarted();
    const r = await (await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, { lat: 31.2601, lng: 34.65, accuracy: 8 })).json();
    expect(r.blocking_element).toMatchObject({ id: 33, name: 'מחסום רחוק' });
  });

  it('מחסום סגור שרלוונטי רק למטוסים - אינו חוסם את הרכב', async () => {
    await pool.query(`UPDATE airfield_elements SET relevant_for='["aircraft"]' WHERE id=31`);
    const t = await mkStarted();
    const r = await (await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, ON_ROUTE)).json();
    expect(r.blocking_element).toBeNull();
  });

  it('ליד מחסום פתוח בלבד - אין חסימה', async () => {
    await pool.query("UPDATE airfield_elements SET display_state='open' WHERE id=31");
    const t = await mkStarted();
    const r = await (await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, ON_ROUTE)).json();
    expect(r.blocking_element).toBeNull();
  });

  it('נסיעה בלי נתיב שמור - לעולם אין סטייה', async () => {
    const t = await mkStarted({ route_options: [] });
    await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, OFF_300);
    const r = await (await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, OFF_300)).json();
    expect(r.deviation_m).toBeNull();
    expect(r.deviating).toBe(false);
  });

  it('היסטוריה נחתכת ל-500 הקריאות האחרונות', async () => {
    const t = await mkStarted();
    await pool.query(`INSERT INTO entry_permit_trip_gps (trip_id, lat, lng, recorded_at)
      SELECT $1, 31.25, 34.65, NOW() - (g || ' seconds')::interval FROM generate_series(1, 505) g`, [t.id]);
    await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, ON_ROUTE);
    expect((await pool.query('SELECT COUNT(*)::int n FROM entry_permit_trip_gps WHERE trip_id=$1', [t.id])).rows[0].n).toBe(500);
  });
});

describe('POST /api/driver-trips/:id/end - סיום נסיעה', () => {
  it('מסיים, מעביר להיסטוריה, וקריאות נוספות נדחות', async () => {
    const t = await mkStarted();
    const r = await (await dpost(`/api/driver-trips/${t.id}/end`, MY_TZ)).json();
    expect(r.ended_at).toBeTruthy();
    expect(r.status).toBe('ended');
    expect((await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, ON_ROUTE)).status).toBe(409);
  });

  it('נסיעה שלא הופעלה - 409', async () => {
    const t = await mkTrip();
    expect((await dpost(`/api/driver-trips/${t.id}/end`, MY_TZ)).status).toBe(409);
  });

  it('נסיעה של נהג אחר - 404', async () => {
    const t = await mkStarted();
    expect((await dpost(`/api/driver-trips/${t.id}/end`, OTHER_TZ)).status).toBe(404);
  });
});

describe('GET /api/trips/live - המגדל', () => {
  it('רק נסיעות שהופעלו ולא הסתיימו, עם המיקום והמצב', async () => {
    // הנסיעה שהסתיימה מופעלת ומסתיימת **לפני** שהפעילה מופעלת: לנהג יש נסיעה
    // פעילה אחת בכל רגע, והפעלה שנייה לפני סיום הראשונה נדחית ב-409
    const ended = await mkStarted();
    await dpost(`/api/driver-trips/${ended.id}/end`, MY_TZ);
    const live = await mkStarted();
    const notStarted = await mkTrip();
    await dpost(`/api/driver-trips/${live.id}/gps`, MY_TZ, OFF_300);
    await dpost(`/api/driver-trips/${live.id}/gps`, MY_TZ, OFF_300);

    const rows = await (await get(`/api/trips/live?airfield_id=${AF}`)).json();
    expect(rows.map(r => r.id)).toEqual([live.id]);
    const r = rows[0];
    expect(r.position).toMatchObject({ lat: 31.2527, lng: 34.65 });
    expect(r.deviating).toBe(true);
    expect(r.stale).toBe(false);
    expect(r.has_route).toBe(true);
    expect(r.route).toHaveLength(2);
    expect(notStarted.id).not.toBe(r.id);
  });

  it('הופעלה ועוד אין קריאה - מופיעה בלי מיקום, ומסומנת אות אבד', async () => {
    const t = await mkStarted();
    const [r] = await (await get(`/api/trips/live?airfield_id=${AF}`)).json();
    expect(r.id).toBe(t.id);
    expect(r.position).toBeNull();
    expect(r.stale).toBe(true);
  });

  it('האלמנט החוסם מגיע עם שמו ומצבו', async () => {
    const t = await mkStarted();
    await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, ON_ROUTE);
    const [r] = await (await get(`/api/trips/live?airfield_id=${AF}`)).json();
    expect(r.blocking_element).toMatchObject({ id: 31, name: 'מחסום צפוני', display_state: 'close', state_label: 'סגור' });
  });

  it('נסיעה שאושרה לפני שמירת הנתיב - גם המגדל מקבל את הקו', async () => {
    await mkStarted({
      route_options: [{ key: 'vehicle', route_ids: [52], label: 'כביש היקפי', dist_m: 1900, crossings: 0 }],
      selected_route_ids: [52],
    });
    const [r] = await (await get(`/api/trips/live?airfield_id=${AF}`)).json();
    expect(r.has_route).toBe(true);
    expect(r.route.length).toBeGreaterThanOrEqual(2);
  });

  it('בלי airfield_id - רשימה ריקה', async () => {
    expect(await (await get('/api/trips/live')).json()).toEqual([]);
  });
});

describe('GET /api/entry-permit-trips/:id/gps - שובל ההיסטוריה במגדל', () => {
  const fix = i => ({ lat: 31.25, lng: 34.64 + i * 0.001, accuracy: 8 });

  it('הקליטות מהישנה לחדשה', async () => {
    const t = await mkStarted();
    for (let i = 0; i < 4; i++) await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, fix(i));
    const rows = await (await get(`/api/entry-permit-trips/${t.id}/gps`)).json();
    expect(rows.map(r => Number(r.lng.toFixed(3)))).toEqual([34.64, 34.641, 34.642, 34.643]);
  });

  // השובל הוא הקליטות **האחרונות** - לא הראשונות של הנסיעה
  it('limit מחזיר את האחרונות, עדיין מהישנה לחדשה', async () => {
    const t = await mkStarted();
    for (let i = 0; i < 5; i++) await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, fix(i));
    const rows = await (await get(`/api/entry-permit-trips/${t.id}/gps?limit=2`)).json();
    expect(rows.map(r => Number(r.lng.toFixed(3)))).toEqual([34.643, 34.644]);
  });

  it('נסיעה בלי קליטות - מערך ריק', async () => {
    const t = await mkStarted();
    expect(await (await get(`/api/entry-permit-trips/${t.id}/gps`)).json()).toEqual([]);
  });

  it('limit לא תקין נופל לברירת המחדל ולא מפיל', async () => {
    const t = await mkStarted();
    await dpost(`/api/driver-trips/${t.id}/gps`, MY_TZ, fix(0));
    expect((await get(`/api/entry-permit-trips/${t.id}/gps?limit=abc`)).status).toBe(200);
    expect((await get(`/api/entry-permit-trips/${t.id}/gps?limit=-5`)).status).toBe(200);
  });
});
