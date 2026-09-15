// סדר עדיפויות לנחיתה לדת"ק **משותף לבסיס האב**: הדת"קים של בסיס הם אותם דת"קים
// בכל השדות שלו (קרקעי / אווירי / הקפה). הגדרה בשדה אחד מסונכרנת לכולם.
import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;

const req = async (method, path, body) => {
  const r = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Test-User': 'station' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json() };
};
const priorityOf = async (id) => (await pool.query('SELECT landing_priority FROM airfield_points WHERE id = $1', [id])).rows[0].landing_priority;

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: airfieldRouter } = await import('./airfield.js');
  const { listen } = await import('../listen.js');

  // זהה ל-init.js בעמודות שהנתיבים נוגעים בהן
  await pool.query(`CREATE TABLE airfields (id SERIAL PRIMARY KEY, name VARCHAR(100), map_id INTEGER, base_id INTEGER)`);
  await pool.query(`CREATE TABLE airfield_points (
    id SERIAL PRIMARY KEY, airfield_id INTEGER, name VARCHAR(100) NOT NULL, x_pct FLOAT NOT NULL DEFAULT 50, y_pct FLOAT NOT NULL DEFAULT 50,
    display_order INTEGER DEFAULT 0, color VARCHAR(20), marker VARCHAR(30), density_warn INT DEFAULT 3, point_type VARCHAR(10),
    lat DOUBLE PRECISION, lng DOUBLE PRECISION, show_in_driver BOOLEAN DEFAULT false, landing_priority JSONB NOT NULL DEFAULT '[]'::jsonb)`);
  // בסיס 2: שלושה שדות. שדה 99 - בלי בסיס, ושדה 50 - בסיס אחר
  await pool.query(`INSERT INTO airfields (id, name, base_id) VALUES (16, 'אווירי', 2), (81, 'הקפה', 2), (7, 'קרקעי', 2), (99, 'יתום', NULL), (50, 'זר', 3)`);

  const app = express();
  app.use(express.json());
  app.use((r, _res, next) => { r.user = { role: 'user', nationalId: null, baseIds: [] }; next(); });
  app.use(airfieldRouter);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

beforeEach(async () => {
  await pool.query('DELETE FROM airfield_points');
  await pool.query(`INSERT INTO airfield_points (id, airfield_id, name, point_type, landing_priority) VALUES
    (1, 16, 'דת"ק 1', 'datk', '["36","09"]'),
    (2, 81, 'דת"ק 1', 'datk', '[]'),
    (3, 7,  'דת"ק 1', 'datk', '[]'),
    (4, 81, 'דת"ק 2', 'datk', '["27"]'),
    (5, 99, 'דת"ק 1', 'datk', '["09"]'),
    (6, 50, 'דת"ק 1', 'datk', '["09"]'),
    (7, 81, '1', 'general', '[]')`);
  await pool.query("SELECT setval(pg_get_serial_sequence('airfield_points', 'id'), 100)");
});

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

describe('שמירה בשדה אחד מסונכרנת לכל השדות של הבסיס', () => {
  it('PUT: אותו דת"ק בשאר השדות של הבסיס מקבל את הרשימה; דת"ק אחר, בסיס אחר ונקודה שאינה דת"ק - לא', async () => {
    const r = await req('PUT', '/api/airfield-points/1', { name: 'דת"ק 1', point_type: 'datk', landing_priority: ['33L', '27'] });
    expect(r.status).toBe(200);
    expect(await priorityOf(1)).toEqual(['33L', '27']);
    expect(await priorityOf(2)).toEqual(['33L', '27']);
    expect(await priorityOf(3)).toEqual(['33L', '27']);
    expect(await priorityOf(4)).toEqual(['27']);
    expect(await priorityOf(5)).toEqual(['09']);
    expect(await priorityOf(6)).toEqual(['09']);
    expect(await priorityOf(7)).toEqual([]);
  });

  it('PUT בלי השדה (מתג נהג / גרירה במפה) לא מסנכרן ולא מוחק', async () => {
    await req('PUT', '/api/airfield-points/1', { name: 'דת"ק 1', point_type: 'datk', show_in_driver: true });
    expect(await priorityOf(1)).toEqual(['36', '09']);
    expect(await priorityOf(3)).toEqual([]);
  });

  it('שדה בלי בסיס - רק הנקודה עצמה', async () => {
    await req('PUT', '/api/airfield-points/5', { name: 'דת"ק 1', point_type: 'datk', landing_priority: ['27'] });
    expect(await priorityOf(5)).toEqual(['27']);
    expect(await priorityOf(1)).toEqual(['36', '09']);
  });

  it('POST: נקודת דת"ק חדשה בלי רשימה יורשת את זו של הבסיס', async () => {
    const r = await req('POST', '/api/airfields/81/points', { name: 'דת"ק 2', point_type: 'datk' });
    expect(r.status).toBe(200);
    expect(r.json.landing_priority).toEqual(['27']);
  });
});

describe('GET: הטופס מציג את הרשימה של הבסיס', () => {
  it('נקודה בלי רשימה משלה מקבלת את הרשימה של אותו דת"ק בשדה אחר - כדי ששמירה לא תמחק אותה', async () => {
    const r = await req('GET', '/api/airfields/81/points');
    const byId = Object.fromEntries(r.json.map(p => [p.id, p.landing_priority]));
    expect(byId[2]).toEqual(['36', '09']);
    expect(byId[4]).toEqual(['27']);
    expect(byId[7]).toEqual([]);
  });
});
