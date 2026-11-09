// ─── מוד טבלה: סדר מיון (table_modes.sort_spec) ─────────────────────────────
// הניהול שומר רמות מיון לפי עדיפות; לקוח ישן שלא שולח sortSpec לא מוחק אותן.
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
  await pool.query(`CREATE TABLE table_modes (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, columns JSONB DEFAULT '[]',
    frozen_columns INTEGER DEFAULT 0, sort_spec JSONB DEFAULT '[]', skin VARCHAR(30) DEFAULT 'classic', created_at TIMESTAMPTZ DEFAULT NOW())`);
  const { default: router } = await import('./admin.js');
  const { listen } = await import('../listen.js');
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => { server?.close(); await pool?.end?.(); });

describe('table_modes.sort_spec', () => {
  it('נשמר ביצירה ומוחזר כ-sortSpec, מנוקה מכפילויות ומשדה ריק', async () => {
    const c = await req('POST', '/api/table-modes', {
      name: 'מבצעי', columns: [{ key: 'task' }, { key: 'alt' }], frozenColumns: 1,
      sortSpec: [{ key: 'task', dir: 'asc' }, { key: 'alt', dir: 'desc' }, { key: 'task', dir: 'desc' }, { key: '' }, { key: 'callSign', dir: 'weird' }],
    });
    expect(c.status).toBe(200);
    expect(c.json.sortSpec).toEqual([{ key: 'task', dir: 'asc' }, { key: 'alt', dir: 'desc' }, { key: 'callSign', dir: 'asc' }]);
    const list = await req('GET', '/api/table-modes');
    expect(list.json.find(m => m.id === c.json.id).sortSpec).toEqual(c.json.sortSpec);
  });

  it('עדכון מחליף את הסדר; עדכון בלי sortSpec משאיר אותו', async () => {
    const c = await req('POST', '/api/table-modes', { name: 'ב', columns: [], sortSpec: [{ key: 'alt', dir: 'asc' }] });
    const u = await req('PUT', `/api/table-modes/${c.json.id}`, { name: 'ב', columns: [], sortSpec: [{ key: 'task', dir: 'desc' }] });
    expect(u.json.sortSpec).toEqual([{ key: 'task', dir: 'desc' }]);
    const keep = await req('PUT', `/api/table-modes/${c.json.id}`, { name: 'ב2', columns: [] });
    expect(keep.json.name).toBe('ב2');
    expect(keep.json.sortSpec).toEqual([{ key: 'task', dir: 'desc' }]);
    const clear = await req('PUT', `/api/table-modes/${c.json.id}`, { name: 'ב2', columns: [], sortSpec: [] });
    expect(clear.json.sortSpec).toEqual([]);
  });

  it('מוד שלא קיים - 404', async () => {
    expect((await req('PUT', '/api/table-modes/99999', { name: 'x', columns: [] })).status).toBe(404);
  });
});

describe('table_modes.skin (src/utils/tableSkin.ts)', () => {
  it('ברירת מחדל קלאסי; סקין לא מוכר לא נשמר; עדכון בלי skin משאיר אותו', async () => {
    const c = await req('POST', '/api/table-modes', { name: 'ס', columns: [] });
    expect(c.json.skin).toBe('classic');
    const bad = await req('POST', '/api/table-modes', { name: 'ס2', columns: [], skin: 'neon' });
    expect(bad.json.skin).toBe('classic');
    const u = await req('PUT', `/api/table-modes/${c.json.id}`, { name: 'ס', columns: [], skin: 'calm' });
    expect(u.json.skin).toBe('calm');
    const keep = await req('PUT', `/api/table-modes/${c.json.id}`, { name: 'ס', columns: [] });
    expect(keep.json.skin).toBe('calm');
  });
});
