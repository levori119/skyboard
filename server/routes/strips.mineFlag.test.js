// ─── דגל "אצלי" של הדסק (strip_table_assignments.marked_mine) ───────────────
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;
const req = async (method, p, body) => {
  const r = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  await pool.query(`CREATE TABLE strip_table_assignments (strip_id INTEGER, preset_id INTEGER, marked_mine BOOLEAN DEFAULT FALSE, PRIMARY KEY (strip_id, preset_id))`);
  await pool.query(`INSERT INTO strip_table_assignments (strip_id, preset_id) VALUES (10, 26)`);
  const { default: router } = await import('./strips.js');
  const { listen } = await import('../listen.js');
  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => { server?.close(); await pool?.end?.(); });

describe('PATCH /api/strip-table-assignments/:strip/:preset/mine', () => {
  const flag = async () => (await pool.query('SELECT marked_mine FROM strip_table_assignments WHERE strip_id = 10 AND preset_id = 26')).rows[0].marked_mine;

  it('מסמן ומבטל', async () => {
    expect((await req('PATCH', '/api/strip-table-assignments/s10/26/mine', { mine: true })).status).toBe(200);
    expect(await flag()).toBe(true);
    expect((await req('PATCH', '/api/strip-table-assignments/10/26/mine', { mine: false })).status).toBe(200);
    expect(await flag()).toBe(false);
  });

  it('ערך שאינו בוליאני - 400; פ"מ שאינו בדסק - 404', async () => {
    expect((await req('PATCH', '/api/strip-table-assignments/10/26/mine', { mine: 'yes' })).status).toBe(400);
    expect((await req('PATCH', '/api/strip-table-assignments/99/26/mine', { mine: true })).status).toBe(404);
  });
});
