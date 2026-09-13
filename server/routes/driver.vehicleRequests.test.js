// בקשות כניסת רכב מאפליקציית DRIVER - כל נהג רואה ונוגע רק בבקשות שלו.
//
// עד כה אסימון הנהג (קוד גישה משותף) קיבל את **כל** בקשות הכניסה בבסיס, כולל
// שמות נהגים ות"ז מהמרשם. עכשיו לנהג יש זהות (ת"ז מהמיראז'), והבקשה נחתמת
// בת"ז של מי ששלח אותה. עמדה - בקר או פקח - ממשיכה לראות את כל התור.
//
// מול Postgres אמיתי (PGlite): הטענות הן על ה-WHERE של ה-SQL, ו-mock היה מאשר
// אותן בלי לבדוק דבר.
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;
const MY_TZ = '012345678';
const OTHER_TZ = '087654321';

/** `who`: ת"ז = נהג; 'station' = עמדה; undefined = אסימון נהג בלי ת"ז */
const call = (method, path, who, body) => fetch(`${base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Test-User': who ?? '' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const newRequest = (who, over = {}) => call('POST', '/api/vehicle-requests', who, {
  driver_name: 'דני', base_name: 'בסיס', supply_type: 'דלק', destination: 'מנשא', ...over,
}).then(r => r.json());

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: router } = await import('./driver.js');
  const { listen } = await import('../listen.js');

  // רק מה שהשאילתה של GET /api/vehicle-requests מצרפת. זהה ל-init.js.
  await pool.query(`CREATE TABLE maps (id SERIAL PRIMARY KEY,
    anchor1_x_img REAL, anchor1_y_img REAL, anchor1_lat REAL, anchor1_lon REAL,
    anchor2_x_img REAL, anchor2_y_img REAL, anchor2_lat REAL, anchor2_lon REAL)`);
  await pool.query(`CREATE TABLE airfields (id SERIAL PRIMARY KEY, map_id INTEGER)`);
  await pool.query(`CREATE TABLE airfield_points (id SERIAL PRIMARY KEY, airfield_id INTEGER, name VARCHAR(100))`);
  await pool.query(`CREATE TABLE base_routes (id SERIAL PRIMARY KEY, airfield_id INTEGER, name VARCHAR(100), waypoints JSONB)`);
  await pool.query(`CREATE TABLE airfield_permit_params (id SERIAL PRIMARY KEY, name VARCHAR(200), sort_order INTEGER DEFAULT 0)`);
  await pool.query(`CREATE TABLE entry_permit_drivers (id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) DEFAULT '', last_name VARCHAR(100) DEFAULT '', national_id VARCHAR(20) DEFAULT '',
    transport_role_id INTEGER, permit_from DATE, permit_until DATE, status_override VARCHAR(20), notes TEXT)`);
  await pool.query(`CREATE TABLE entry_permit_vehicles (id SERIAL PRIMARY KEY, driver_id INTEGER,
    plate_fixed BOOLEAN DEFAULT TRUE, plate_number VARCHAR(30) DEFAULT '')`);
  await pool.query(`CREATE TABLE entry_permit_driver_zones (driver_id INTEGER, zone_id INTEGER)`);
  await pool.query(`CREATE TABLE vehicle_requests (
    id SERIAL PRIMARY KEY,
    driver_name VARCHAR(100) NOT NULL, base_name VARCHAR(100) NOT NULL,
    supply_type VARCHAR(100) NOT NULL, destination VARCHAR(200) NOT NULL,
    vehicle_type VARCHAR(100) DEFAULT '', plate_number VARCHAR(50) DEFAULT '',
    status VARCHAR(30) DEFAULT 'pending',
    assigned_route_id INTEGER, notes TEXT DEFAULT '',
    origin VARCHAR(200) DEFAULT '', from_point_id INTEGER, to_point_id INTEGER, base_id INTEGER,
    via_route_ids JSONB DEFAULT '[]', show_on_map BOOLEAN DEFAULT false, permit_driver_id INTEGER,
    requester_national_id VARCHAR(20) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  const app = express();
  app.use(express.json());
  // מציב req.user כפי ש-middleware/auth.js היה מציב מהאסימון
  app.use((r, _res, next) => {
    const who = r.get('X-Test-User');
    r.user = who === 'station'
      ? { role: 'user', nationalId: null }
      : { role: 'driver', nationalId: who || null };
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

beforeEach(async () => { await pool.query('DELETE FROM vehicle_requests'); });

describe('בקשות כניסת רכב - לפי זהות הנהג', () => {
  it('הבקשה נחתמת בת"ז של הנהג ששלח אותה, ולא בת"ז שבגוף הבקשה', async () => {
    const r = await newRequest(MY_TZ, { requester_national_id: OTHER_TZ });
    expect(r.requester_national_id).toBe(MY_TZ);
  });

  it('נהג רואה רק את הבקשות שלו', async () => {
    await newRequest(MY_TZ, { driver_name: 'שלי' });
    await newRequest(OTHER_TZ, { driver_name: 'של אחר' });
    const rows = await (await call('GET', '/api/vehicle-requests', MY_TZ)).json();
    expect(rows.map(r => r.driver_name)).toEqual(['שלי']);
  });

  // התור בעמדה אינו משתנה: הפקח מאשר את כולם
  it('עמדה רואה את כל הבקשות', async () => {
    await newRequest(MY_TZ);
    await newRequest(OTHER_TZ);
    await newRequest('station');
    expect(await (await call('GET', '/api/vehicle-requests', 'station')).json()).toHaveLength(3);
  });

  it('אסימון נהג בלי ת"ז אינו רואה דבר ואינו שולח בקשה', async () => {
    await newRequest(MY_TZ);
    expect((await call('GET', '/api/vehicle-requests', undefined)).status).toBe(403);
    expect((await call('POST', '/api/vehicle-requests', undefined, { driver_name: 'x', base_name: 'x', supply_type: 'x', destination: 'x' })).status).toBe(403);
  });

  it('נהג אינו מעדכן ואינו מוחק בקשה של נהג אחר', async () => {
    const other = await newRequest(OTHER_TZ);
    expect((await call('PUT', `/api/vehicle-requests/${other.id}`, MY_TZ, { status: 'cancelled' })).status).toBe(404);
    expect((await call('DELETE', `/api/vehicle-requests/${other.id}`, MY_TZ)).status).toBe(404);
    const [row] = (await pool.query('SELECT status FROM vehicle_requests WHERE id=$1', [other.id])).rows;
    expect(row.status).toBe('pending');
  });

  it('נהג מעדכן את הבקשה שלו', async () => {
    const mine = await newRequest(MY_TZ);
    const res = await call('PUT', `/api/vehicle-requests/${mine.id}`, MY_TZ, { status: 'arrived' });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('arrived');
  });

  // האישור, המסלול והקישור למרשם הם הכרעת המגדל - הנהג רק מבטל או מדווח הגעה
  it('נהג אינו מאשר לעצמו בקשה ואינו קובע לה מסלול', async () => {
    const mine = await newRequest(MY_TZ);
    const after = await (await call('PUT', `/api/vehicle-requests/${mine.id}`, MY_TZ, {
      status: 'approved', assigned_route_id: 5, permit_driver_id: 9, show_on_map: true, notes: 'מאחר',
    })).json();
    expect(after.status).toBe('pending');
    expect(after.assigned_route_id).toBeNull();
    expect(after.permit_driver_id).toBeNull();
    expect(after.show_on_map).toBe(false);
    expect(after.notes).toBe('מאחר');
  });

  it('עמדה מאשרת בקשה של כל נהג', async () => {
    const mine = await newRequest(MY_TZ);
    expect((await call('PUT', `/api/vehicle-requests/${mine.id}`, 'station', { status: 'approved' })).status).toBe(200);
    expect((await call('DELETE', `/api/vehicle-requests/${mine.id}`, 'station')).status).toBe(200);
  });
});
