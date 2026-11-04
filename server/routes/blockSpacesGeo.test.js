// ─── מרחב בלוקים על המפה ──────────────────────────────────────────────────────
// מרחב מקושר לאזורים על מפה מעוגנת; GET מחזיר את מרכזו (center_lat/center_lon),
// שממנו העמדה בוחרת את המרחב הקרוב למטרה. עריכת שם בלבד לא מוחקת את המיקום.
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;

const req = async (method, path, body) => {
  const r = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: router } = await import('./blocks.js');
  const { listen } = await import('../listen.js');

  await pool.query(`CREATE TABLE block_spaces (id SERIAL PRIMARY KEY, name VARCHAR(100), parent_base_id INTEGER,
    map_id INTEGER, zone_ids JSONB DEFAULT '[]')`);
  await pool.query(`CREATE TABLE maps (id SERIAL PRIMARY KEY, name TEXT,
    anchor1_x_img REAL, anchor1_y_img REAL, anchor1_lat DOUBLE PRECISION, anchor1_lon DOUBLE PRECISION,
    anchor2_x_img REAL, anchor2_y_img REAL, anchor2_lat DOUBLE PRECISION, anchor2_lon DOUBLE PRECISION)`);
  await pool.query(`CREATE TABLE map_zones (id SERIAL PRIMARY KEY, map_id INTEGER, name TEXT,
    polygon TEXT DEFAULT '[]', polygon_geo TEXT DEFAULT '[]')`);
  // מפה מעוגנת: 0%,0% = 33N/34E ; 100%,100% = 32N/35E
  await pool.query(`INSERT INTO maps VALUES (1, 'צפון', 0, 0, 33, 34, 100, 100, 32, 35)`);
  // אזור עם נ"צ, ואזור שנשמר רק באחוזי תמונה (מומר דרך העוגן)
  await pool.query(`INSERT INTO map_zones (id, map_id, name, polygon_geo) VALUES
    (10, 1, 'א', '[{"lat":32,"lon":34},{"lat":32,"lon":34.2},{"lat":32.2,"lon":34.2},{"lat":32.2,"lon":34}]')`);
  await pool.query(`INSERT INTO map_zones (id, map_id, name, polygon) VALUES
    (11, 1, 'ב', '[{"x":40,"y":40},{"x":60,"y":40},{"x":60,"y":60},{"x":40,"y":60}]')`);
  await pool.query(`INSERT INTO block_spaces (id, name) VALUES (1, 'מערב'), (2, 'מרכז'), (3, 'ריק')`);

  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

describe('מרחב בלוקים - מיקום על המפה', () => {
  it('PUT עם אזורים - מחזיר את מרכז האזור', async () => {
    const { json } = await req('PUT', '/api/block-spaces/1', { name: 'מערב', map_id: 1, zone_ids: [10] });
    expect(json.center_lat).toBeCloseTo(32.1, 6);
    expect(json.center_lon).toBeCloseTo(34.1, 6);
  });
  it('אזור באחוזי תמונה בלבד - מומר דרך עוגן המפה', async () => {
    await req('PUT', '/api/block-spaces/2', { name: 'מרכז', map_id: 1, zone_ids: [11] });
    const { json } = await req('GET', '/api/block-spaces');
    const sp = json.find(s => s.id === 2);
    expect(sp.center_lat).toBeCloseTo(32.5, 4);
    expect(sp.center_lon).toBeCloseTo(34.5, 4);
  });
  it('מרחב בלי אזורים - בלי מרכז', async () => {
    const { json } = await req('GET', '/api/block-spaces');
    expect(json.find(s => s.id === 3)).toMatchObject({ center_lat: null, center_lon: null });
  });
  it('עריכת שם בלבד - המיקום נשמר', async () => {
    await req('PUT', '/api/block-spaces/1', { name: 'מערב חדש' });
    const { json } = await req('GET', '/api/block-spaces');
    const sp = json.find(s => s.id === 1);
    expect(sp.name).toBe('מערב חדש');
    expect(sp.zone_ids).toEqual([10]);
    expect(sp.center_lat).toBeCloseTo(32.1, 6);
  });
  it('ניקוי המפה - האזורים מתנקים', async () => {
    const { json } = await req('PUT', '/api/block-spaces/2', { name: 'מרכז', map_id: null, zone_ids: [11] });
    expect(json.zone_ids).toEqual([]);
    expect(json.center_lat).toBe(null);
  });
});
