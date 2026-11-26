// ─── מחיקת אזור במפת אב מוחקת גם את העותקים שלו במפות החתוכות ───
// עד 2026-11-26 ה-FK (parent_zone_id ON DELETE SET NULL) רק ניתק את העותק, והוא
// נשאר בעמדה כאזור "יתום" (אזור 711 במפת עפרוני החתוכה).
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  await pool.query(`CREATE TABLE map_zones (id SERIAL PRIMARY KEY, map_id INTEGER, name TEXT,
    parent_zone_id INTEGER REFERENCES map_zones(id) ON DELETE SET NULL)`);
  await pool.query(`INSERT INTO map_zones (id, map_id, name, parent_zone_id) VALUES
    (1, 10, '711', NULL), (2, 11, '711', 1), (3, 12, '711', 2),
    (4, 10, '705', NULL), (5, 11, '705', 4)`);
  const { default: router } = await import('./maps.js');
  const { listen } = await import('../listen.js');
  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => { server?.close(); await pool?.end?.(); });

const ids = async () => (await pool.query('SELECT id FROM map_zones ORDER BY id')).rows.map(r => r.id);

describe('DELETE /api/map-zones/:id', () => {
  it('אזור אב: נמחקים גם העותקים במפות החתוכות, לכל העומק', async () => {
    const r = await fetch(`${base}/api/map-zones/1`, { method: 'DELETE' });
    expect(r.status).toBe(200);
    expect(await ids()).toEqual([4, 5]);
  });
  it('עותק במפה חתוכה: נמחק רק הוא, האב נשאר', async () => {
    await fetch(`${base}/api/map-zones/5`, { method: 'DELETE' });
    expect(await ids()).toEqual([4]);
  });
});
