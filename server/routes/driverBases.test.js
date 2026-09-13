// אפליקציית DRIVER - הנהג רואה רק את הבסיסים שהוא מורשה אליהם בהרשאת
// SKY-KING DRIVER במיראז': ברשימת הבסיסים, ובמפת הבסיס (שדות, נקודות, אלמנטים).
// עמדה ממשיכה לראות את כל הבסיסים.
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;

/** `who`: 'station' = עמדה; אחרת רשימת בסיסים מופרדת בפסיק לנהג */
const call = (path, who) => fetch(`${base}${path}`, { headers: { 'X-Test-User': who } });

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: baseRouter } = await import('./base.js');
  const { default: airfieldRouter } = await import('./airfield.js');
  const { listen } = await import('../listen.js');

  await pool.query(`CREATE TABLE aviation_bases (id SERIAL PRIMARY KEY, name VARCHAR(100), code VARCHAR(20),
    coord_n TEXT, coord_e TEXT, sids JSONB, stars JSONB, created_at TIMESTAMPTZ DEFAULT NOW(),
    pressure_inhg REAL, emblem_data TEXT)`);
  await pool.query(`CREATE TABLE maps (id SERIAL PRIMARY KEY, image_data TEXT)`);
  await pool.query(`CREATE TABLE airfields (id SERIAL PRIMARY KEY, name VARCHAR(100), map_id INTEGER, base_id INTEGER)`);
  await pool.query(`INSERT INTO aviation_bases (id, name) VALUES (7, 'תל נוף'), (8, 'חצור')`);
  await pool.query(`INSERT INTO airfields (id, name, base_id) VALUES (1, 'שדה תל נוף', 7), (2, 'שדה חצור', 8)`);

  const app = express();
  app.use((r, _res, next) => {
    const who = r.get('X-Test-User') || '';
    r.user = who === 'station'
      ? { role: 'user', nationalId: null, baseIds: [] }
      : { role: 'driver', nationalId: '012345678', baseIds: who.split(',').filter(Boolean).map(Number) };
    next();
  });
  app.use(baseRouter);
  app.use(airfieldRouter);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

describe('בסיסים לפי הרשאת הנהג', () => {
  it('נהג רואה ברשימת הבסיסים רק את הבסיסים שהוא מורשה אליהם', async () => {
    const rows = await (await call('/api/aviation-bases', '7')).json();
    expect(rows.map(b => b.name)).toEqual(['תל נוף']);
  });

  it('עמדה רואה את כל הבסיסים', async () => {
    expect(await (await call('/api/aviation-bases', 'station')).json()).toHaveLength(2);
  });

  it('נהג אינו מושך את מפת בסיס שאינו מורשה אליו', async () => {
    for (const p of ['/api/airfields/by-base/8', '/api/airfield-points/by-base/8', '/api/airfield-elements/by-base/8']) {
      expect(`${p} => ${(await call(p, '7')).status}`).toBe(`${p} => 403`);
    }
  });

  it('נהג מושך את מפת הבסיס שלו, ועמדה את כל בסיס', async () => {
    const mine = await (await call('/api/airfields/by-base/7', '7')).json();
    expect(mine.map(a => a.name)).toEqual(['שדה תל נוף']);
    expect((await call('/api/airfields/by-base/8', 'station')).status).toBe(200);
  });
});
