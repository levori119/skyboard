// ─── הגעה לאזור: strip_zone_assignments.zone_arrival_ack (src/utils/zoneArrival.ts) ───
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;
const req = async (method, p, body) => {
  const r = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const ack = async () => (await pool.query('SELECT zone_arrival_ack FROM strip_zone_assignments WHERE strip_id = 7')).rows[0].zone_arrival_ack;

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  await pool.query(`CREATE TABLE strip_zone_assignments (
    id SERIAL PRIMARY KEY, strip_id INTEGER UNIQUE, zone_id INTEGER, altitude_range_id INTEGER, altitude_range_ids JSONB DEFAULT '[]',
    status TEXT, note TEXT, coordination_note TEXT, is_coordinated BOOLEAN, pos_x FLOAT, pos_y FLOAT, requested_zone_ids JSONB DEFAULT '[]',
    map_id INTEGER, preset_id INTEGER, updated_at TIMESTAMPTZ, zone_arrival_ack BOOLEAN DEFAULT TRUE)`);
  const { default: router } = await import('./maps.js');
  const { listen } = await import('../listen.js');
  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => { server?.close(); await pool?.end?.(); });

describe('zone_arrival_ack', () => {
  it('שיוך חדש - מאושר; "באזור" מהזיהוי - ממתין; "באזור" ידני - מאושר', async () => {
    expect((await req('POST', '/api/strip-zone-assignments', { strip_id: 7, zone_id: 3, status: 'בדרך לאזור' })).status).toBe(200);
    expect(await ack()).toBe(true);
    expect((await req('PATCH', '/api/strip-zone-assignments/7/status', { status: 'באזור', auto: true })).json.zone_arrival_ack).toBe(false);
    expect(await ack()).toBe(false);
    await req('PATCH', '/api/strip-zone-assignments/7/status', { status: 'באזור' });
    expect(await ack()).toBe(true);
  });

  it('שמירה מלאה באותו אזור שומרת את ההמתנה; החלפת אזור מאפסת', async () => {
    await req('PATCH', '/api/strip-zone-assignments/7/status', { status: 'באזור', auto: true });
    await req('POST', '/api/strip-zone-assignments', { strip_id: 7, zone_id: 3, status: 'באזור', pos_x: 12, pos_y: 14 });
    expect(await ack()).toBe(false);
    await req('POST', '/api/strip-zone-assignments', { strip_id: 7, zone_id: 4, status: 'באזור' });
    expect(await ack()).toBe(true);
  });

  it('יציאה מהאזור מהזיהוי - מאושר (כניסה חוזרת תהבהב שוב)', async () => {
    await req('PATCH', '/api/strip-zone-assignments/7/status', { status: 'באזור', auto: true });
    await req('PATCH', '/api/strip-zone-assignments/7/status', { status: 'עוזב אזור', auto: true });
    expect(await ack()).toBe(true);
  });
});
