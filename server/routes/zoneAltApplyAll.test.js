// "החל על הכל": בלוקי הגובה של אזור מוחלים על כל אזורי המפה, לפי שם הבלוק.
// בלוק שיש בו פ"מ משויך לא נמחק - שיוך חי לא מאבד את הבלוק שלו.
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });
let pool, server, base;

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  await pool.query(`CREATE TABLE map_zones (id SERIAL PRIMARY KEY, map_id INTEGER, name VARCHAR(100), polygon TEXT DEFAULT '[]')`);
  await pool.query(`CREATE TABLE zone_altitude_ranges (id SERIAL PRIMARY KEY, zone_id INTEGER, name VARCHAR(100), alt_min INTEGER, alt_max INTEGER, sort_order INTEGER DEFAULT 0)`);
  await pool.query(`CREATE TABLE strip_zone_assignments (id SERIAL PRIMARY KEY, strip_id INTEGER, zone_id INTEGER, altitude_range_id INTEGER, altitude_range_ids JSONB DEFAULT '[]')`);
  await pool.query(`INSERT INTO map_zones (id, map_id, name) VALUES (1, 9, 'A'), (2, 9, 'B'), (3, 9, 'C'), (4, 8, 'other map')`);
  await pool.query(`INSERT INTO zone_altitude_ranges (id, zone_id, name, alt_min, alt_max, sort_order) VALUES
    (10, 1, 'נמוך', 0, 100, 0), (11, 1, 'גבוה', 100, 200, 1),
    (20, 2, 'נמוך', 0, 50, 0), (21, 2, 'ישן', 300, 400, 1),
    (30, 3, 'ישן', 300, 400, 0)`);
  // פ"מ משויך לבלוק "ישן" של C - הבלוק חייב לשרוד
  await pool.query(`INSERT INTO strip_zone_assignments (strip_id, zone_id, altitude_range_id, altitude_range_ids) VALUES (77, 3, 30, '[30]')`);
  const { default: router } = await import('./maps.js');
  const { listen } = await import('../listen.js');
  const app = express(); app.use(express.json()); app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server?.close(); await pool?.end?.(); });

const rangesOf = async z => (await pool.query('SELECT name, alt_min, alt_max FROM zone_altitude_ranges WHERE zone_id=$1 ORDER BY sort_order, name', [z])).rows;

describe('apply-to-map', () => {
  it('מעדכן לפי שם, מוסיף חסר, מוחק עודף - ושומר בלוק שיש בו פ"מ', async () => {
    const r = await fetch(`${base}/api/zone-altitude-ranges/apply-to-map`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_zone_id: 1 }) });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.zones).toBe(2);
    expect(j.keptInUse).toBe(1);
    expect(await rangesOf(2)).toEqual([{ name: 'נמוך', alt_min: 0, alt_max: 100 }, { name: 'גבוה', alt_min: 100, alt_max: 200 }]);
    const c = await rangesOf(3);
    expect(c.map(x => x.name).sort()).toEqual(['גבוה', 'ישן', 'נמוך'].sort());
    // מפה אחרת - לא נגענו
    expect(await rangesOf(4)).toEqual([]);
    // השיוך החי עדיין מצביע על בלוק קיים
    expect((await pool.query('SELECT count(*)::int c FROM zone_altitude_ranges WHERE id = 30')).rows[0].c).toBe(1);
  });
});
