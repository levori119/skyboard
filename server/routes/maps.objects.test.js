// ─── אובייקטים על מפה: /api/maps/:id/objects + /api/map-objects/:id (MAP_OBJECTS_SPEC.md) ───
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
  await pool.query(`CREATE TABLE maps (id SERIAL PRIMARY KEY, name VARCHAR(100))`);
  // אותה הגדרה של server/db/init.js
  await pool.query(`CREATE TABLE map_objects (
    id SERIAL PRIMARY KEY,
    map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
    name VARCHAR(100) DEFAULT '',
    shape VARCHAR(20) NOT NULL DEFAULT 'circle',
    x DOUBLE PRECISION NOT NULL DEFAULT 50,
    y DOUBLE PRECISION NOT NULL DEFAULT 50,
    size DOUBLE PRECISION NOT NULL DEFAULT 2,
    color VARCHAR(20) NOT NULL DEFAULT '#f59e0b',
    filled BOOLEAN NOT NULL DEFAULT TRUE,
    show_label BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`INSERT INTO maps (id, name) VALUES (1, 'א'), (2, 'ב')`);
  const { default: router } = await import('./maps.js');
  const { listen } = await import('../listen.js');
  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => { server?.close(); await pool?.end?.(); });

describe('map objects API', () => {
  let starId;

  it('יצירה: נשמר מנורמל, ומוחזר עם id', async () => {
    const r = await req('POST', '/api/maps/1/objects', { name: '  מכ"ם  ', shape: 'star', x: 20, y: 30, size: 4, color: '#22C55E', filled: false });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ map_id: 1, name: 'מכ"ם', shape: 'star', x: 20, y: 30, size: 4, color: '#22c55e', filled: false, show_label: true });
    starId = r.json.id;
    expect(starId).toBeGreaterThan(0);
  });

  it('השרת מאמת: צורה/צבע לא תקינים ומיקום מחוץ למפה מתוקנים, לא נשמרים כמו שהם', async () => {
    const r = await req('POST', '/api/maps/1/objects', { shape: 'blob', color: 'url(javascript:1)', x: 400, y: -3, size: 1000 });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ shape: 'circle', color: '#f59e0b', x: 100, y: 0, size: 30 });
  });

  it('יצירה על מפה שאינה קיימת = 404; מזהה לא מספרי = 400', async () => {
    expect((await req('POST', '/api/maps/999/objects', { shape: 'square' })).status).toBe(404);
    expect((await req('POST', '/api/maps/abc/objects', {})).status).toBe(400);
    expect((await req('GET', '/api/maps/abc/objects')).status).toBe(400);
  });

  it('קריאה פר-מפה: רק האובייקטים של אותה מפה, לפי sort_order ואז id', async () => {
    await req('POST', '/api/maps/2/objects', { name: 'במפה אחרת' });
    const r = await req('GET', '/api/maps/1/objects');
    expect(r.status).toBe(200);
    expect(r.json).toHaveLength(2);
    expect(r.json.every(o => o.map_id === 1)).toBe(true);
    expect(r.json[0].id).toBe(starId);
  });

  it('עדכון חלקי (גרירה): רק x/y משתנים, שם/צבע/צורה נשמרים', async () => {
    const r = await req('PUT', `/api/map-objects/${starId}`, { x: 55.5, y: 66 });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ name: 'מכ"ם', shape: 'star', color: '#22c55e', size: 4, x: 55.5, y: 66, filled: false });
  });

  it('עדכון מלא + נרמול; אובייקט שאינו קיים = 404', async () => {
    const r = await req('PUT', `/api/map-objects/${starId}`, { name: 'מגדל', shape: 'hexagon', size: 0.01, show_label: false });
    expect(r.json).toMatchObject({ name: 'מגדל', shape: 'hexagon', size: 0.3, show_label: false });
    expect((await req('PUT', '/api/map-objects/99999', { x: 1 })).status).toBe(404);
  });

  it('מחיקה', async () => {
    expect((await req('DELETE', `/api/map-objects/${starId}`)).status).toBe(200);
    const r = await req('GET', '/api/maps/1/objects');
    expect(r.json.find(o => o.id === starId)).toBeUndefined();
  });

  it('מחיקת המפה מוחקת את האובייקטים שלה (ON DELETE CASCADE)', async () => {
    await pool.query('DELETE FROM maps WHERE id = 2');
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM map_objects WHERE map_id = 2');
    expect(rows[0].n).toBe(0);
  });
});

describe('מפה חתוכה יורשת את אובייקטי מפת האב (?inherit=1)', () => {
  beforeAll(async () => {
    await pool.query(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS parent_map_id INTEGER`);
    await pool.query(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS parent_rect JSONB`);
    await pool.query(`INSERT INTO maps (id, name) VALUES (10, 'אב')`);
    await pool.query(`INSERT INTO maps (id, name, parent_map_id, parent_rect) VALUES (11, 'חלק', 10, '{"x1":50,"x2":75,"y1":40,"y2":60}')`);
    await pool.query(`INSERT INTO map_objects (map_id, name, x, y, size) VALUES (10, 'בפנים', 60, 50, 1), (10, 'בחוץ', 10, 10, 1), (11, 'של הבת', 5, 5, 2)`);
  });

  it('בלי הדגל (העורך): רק האובייקטים של המפה עצמה', async () => {
    const r = await req('GET', '/api/maps/11/objects');
    expect(r.json.map(o => o.name)).toEqual(['של הבת']);
  });

  it('עם הדגל (העמדה): גם של האב שבתוך החיתוך, מומרים לקואורדינטות הבת', async () => {
    const r = await req('GET', '/api/maps/11/objects?inherit=1');
    expect(r.json.map(o => o.name)).toEqual(['בפנים', 'של הבת']);
    const o = r.json[0];
    expect(o.inherited).toBe(true);
    expect(o.x).toBeCloseTo(40);   // (60-50)/25
    expect(o.y).toBeCloseTo(50);   // (50-40)/20
    expect(o.size).toBeCloseTo(4); // 1 * 100/25 - אותו גודל ביחס לרקע
  });

  it('מפה בלי אב: הדגל לא משנה דבר', async () => {
    const r = await req('GET', '/api/maps/10/objects?inherit=1');
    expect(r.json.map(o => o.name).sort()).toEqual(['בחוץ', 'בפנים']);
  });
});
