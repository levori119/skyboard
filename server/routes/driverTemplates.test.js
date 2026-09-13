// **תבניות נסיעה של הנהג** מול Postgres אמיתי (PGlite בזיכרון).
//
// הטענות כאן הן על שייכות ועל מה שנשמר: שנהג רואה ועורך רק את התבניות שלו
// ובבסיסים שהוא מורשה אליהם, שהתבנית נשמרת מנוקה (בלי מועד/סטטוס), ושנקודה
// של שדה אחר נחסמת - אחרת התבנית הייתה מייצרת בקשות שנדחות.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

let pool, server, base, router, LIMIT;

const MY_TZ = '012345678';
const OTHER_TZ = '087654321';
const req = (method, path, body, nid = MY_TZ, baseIds = [70]) => fetch(`${base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Test-Driver': nid, 'X-Test-Bases': baseIds.join(',') },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const list = (nid, baseIds) => req('GET', '/api/driver-trips/templates', undefined, nid, baseIds).then(r => r.json());
const create = (body, nid) => req('POST', '/api/driver-trips/templates', body, nid);

const TPL = {
  name: 'הסעת בוקר', airfield_id: 1,
  data: { from_point_id: 20, to_text: 'שער צפוני', stops: [{ point_id: 21 }], vehicle_name: 'מיניבוס', time: '07:30',
          scheduled_at: '2026-09-14T07:30:00Z', status: 'approved', selected_route_ids: [5] },
};

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  ({ default: router, DRIVER_TEMPLATE_LIMIT: LIMIT } = await import('./permits.js'));
  const { listen } = await import('../listen.js');

  // זהה ל-init.js בעמודות שהנתיבים נוגעים בהן
  await pool.query(`CREATE TABLE public.aviation_bases (id SERIAL PRIMARY KEY, name VARCHAR(100))`);
  await pool.query(`INSERT INTO aviation_bases (id, name) VALUES (70, 'בסיס א'), (80, 'בסיס ב')`);
  await pool.query(`CREATE TABLE public.airfields (id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, base_id INTEGER)`);
  await pool.query(`INSERT INTO airfields (id, name, base_id) VALUES (1, 'שדה א', 70), (2, 'שדה ב', 80)`);
  await pool.query(`CREATE TABLE public.airfield_points (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE, name VARCHAR(100) NOT NULL)`);
  await pool.query(`INSERT INTO airfield_points (id, airfield_id, name) VALUES (20, 1, 'חניון'), (21, 1, 'מגדל'), (30, 2, 'זרה')`);
  await pool.query(`CREATE TABLE public.airfield_permit_params (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL DEFAULT 'zone', name VARCHAR(200) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0)`);
  await pool.query(`INSERT INTO airfield_permit_params (id, airfield_id, kind, name) VALUES (5, 1, 'trip_type', 'הסעה'), (6, 2, 'trip_type', 'זר')`);
  await pool.query(`CREATE TABLE IF NOT EXISTS entry_permit_trip_templates (
    id SERIAL PRIMARY KEY,
    driver_national_id VARCHAR(20) NOT NULL,
    airfield_id INTEGER NOT NULL REFERENCES airfields(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const app = express();
  app.use(express.json());
  app.use((r, _res, next) => {
    const nid = r.get('X-Test-Driver');
    const bases = (r.get('X-Test-Bases') || '').split(',').filter(Boolean).map(Number);
    if (nid !== undefined) r.user = { role: 'driver', nationalId: nid, baseIds: bases };
    next();
  });
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => { await new Promise(r => server?.close(r)); });
beforeEach(async () => { await pool.query('DELETE FROM entry_permit_trip_templates'); });

describe('תבניות נסיעה של הנהג', () => {
  it('שמירה: פרטי הבקשה בלבד, בלי מועד, סטטוס או נתיב', async () => {
    const r = await create(TPL);
    expect(r.status).toBe(201);
    const t = await r.json();
    expect(t).toMatchObject({ name: 'הסעת בוקר', airfield_id: 1, base_id: 70, from_point_name: 'חניון', to_point_name: null });
    expect(t.data).toMatchObject({ from_point_id: 20, to_text: 'שער צפוני', stops: [{ point_id: 21, text: '' }], time: '07:30' });
    for (const k of ['scheduled_at', 'status', 'selected_route_ids']) expect(t.data).not.toHaveProperty(k);
    const { rows } = await pool.query('SELECT driver_national_id FROM entry_permit_trip_templates');
    expect(rows[0].driver_national_id).toBe(MY_TZ);
  });

  it('שם ושדה חובה', async () => {
    const r = await create({ name: ' ', airfield_id: null, data: {} });
    expect(r.status).toBe(400);
    expect((await r.json()).fields).toEqual(['name', 'airfield']);
  });

  it('שדה בבסיס שהנהג אינו מורשה אליו - 403', async () => {
    expect((await create({ ...TPL, airfield_id: 2, data: {} })).status).toBe(403);
  });

  it('נקודה או סוג נסיעה של שדה אחר - 400', async () => {
    const pt = await create({ ...TPL, data: { from_point_id: 30 } });
    expect(pt.status).toBe(400);
    expect((await pt.json()).field).toBe('point');
    const tt = await create({ ...TPL, data: { trip_type_id: 6 } });
    expect((await tt.json()).field).toBe('trip_type_id');
  });

  it('כל נהג רואה רק את התבניות שלו', async () => {
    await create(TPL);
    await create({ ...TPL, name: 'של אחר' }, OTHER_TZ);
    expect((await list(MY_TZ)).map(t => t.name)).toEqual(['הסעת בוקר']);
    expect((await list(OTHER_TZ)).map(t => t.name)).toEqual(['של אחר']);
  });

  // הרשאת הבסיס הוסרה במיראז' - התבניות של הבסיס הזה נעלמות מהנהג
  it('תבנית של בסיס שכבר אינו מורשה אינה מוצגת', async () => {
    await create(TPL);
    expect(await list(MY_TZ, [80])).toEqual([]);
  });

  it('עדכון ומחיקה - רק של הבעלים; של אחר 404', async () => {
    const mine = await (await create(TPL)).json();
    expect((await req('PUT', `/api/driver-trips/templates/${mine.id}`, { ...TPL, name: 'חטיפה' }, OTHER_TZ)).status).toBe(404);
    expect((await req('DELETE', `/api/driver-trips/templates/${mine.id}`, undefined, OTHER_TZ)).status).toBe(404);

    const up = await req('PUT', `/api/driver-trips/templates/${mine.id}`, { name: 'ערב', airfield_id: 1, data: { to_point_id: 21 } });
    expect(up.status).toBe(200);
    expect(await up.json()).toMatchObject({ name: 'ערב', to_point_name: 'מגדל', data: { to_point_id: 21, from_point_id: null } });

    expect((await req('DELETE', `/api/driver-trips/templates/${mine.id}`)).status).toBe(200);
    expect(await list(MY_TZ)).toEqual([]);
  });

  it('מזהה לא מספרי - 404 ולא 500', async () => {
    expect((await req('DELETE', '/api/driver-trips/templates/abc')).status).toBe(404);
  });

  it(`תקרה של תבניות לנהג`, async () => {
    const values = Array.from({ length: LIMIT }, (_, i) => `('${MY_TZ}', 1, 't${i}')`).join(',');
    await pool.query(`INSERT INTO entry_permit_trip_templates (driver_national_id, airfield_id, name) VALUES ${values}`);
    const r = await create(TPL);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('template_limit');
  });

  it('בלי זהות נהג - 403', async () => {
    const r = await fetch(`${base}/api/driver-trips/templates`);
    expect(r.status).toBe(403);
  });
});
