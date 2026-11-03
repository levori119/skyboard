// ─── מרחבי חלוקה של טבלת בלוקים ──────────────────────────────────────────────
// block_tables.split_space_ids + blocks.space_id. הבדיקה החשובה: עורך שמור
// בלוק **בלי** השדה (גרירה בצייר הבלוקים) לא מאפס את המרחב שהוגדר לו.
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
  await pool.query(`CREATE TABLE block_spaces (id SERIAL PRIMARY KEY, name VARCHAR(100), parent_base_id INTEGER)`);
  await pool.query(`CREATE TABLE block_tables (id SERIAL PRIMARY KEY, name VARCHAR(100), block_space_id INTEGER, note TEXT, category VARCHAR(100),
    parent_base_id INTEGER, split_space_ids JSONB DEFAULT '[]', updated_at TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE blocks (id SERIAL PRIMARY KEY, block_table_id INTEGER, alt_from INTEGER, alt_to INTEGER, mission VARCHAR(100),
    color VARCHAR(20), workstations JSONB DEFAULT '[]', platforms JSONB DEFAULT '[]', sort_order INTEGER DEFAULT 0, note TEXT, space_id INTEGER, updated_at TIMESTAMPTZ)`);
  await pool.query(`INSERT INTO block_spaces (id, name) VALUES (10, 'צפון'), (11, 'דרום')`);
  const { default: router } = await import('./blocks.js');
  const { listen } = await import('../listen.js');
  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => { server?.close(); await pool?.end?.(); });

describe('מרחבי חלוקה', () => {
  it('טבלה: נשמר בעדכון, ועדכון בלי השדה לא מוחק אותו', async () => {
    const t = (await req('POST', '/api/block-tables', { name: 'עזה' })).json;
    expect(t.split_space_ids).toEqual([]);
    await req('PUT', `/api/block-tables/${t.id}`, { name: 'עזה', split_space_ids: [10, '11'] });
    let row = (await pool.query('SELECT split_space_ids FROM block_tables WHERE id=$1', [t.id])).rows[0];
    expect(row.split_space_ids).toEqual([10, 11]);
    await req('PUT', `/api/block-tables/${t.id}`, { name: 'עזה 2' });
    row = (await pool.query('SELECT name, split_space_ids FROM block_tables WHERE id=$1', [t.id])).rows[0];
    expect(row.split_space_ids).toEqual([10, 11]);
    expect(row.name).toBe('עזה 2');
  });

  it('בלוק: מרחב נשמר ביצירה, ושמירה בלי השדה לא מאפסת אותו', async () => {
    const t = (await req('POST', '/api/block-tables', { name: 'ט' })).json;
    const b = (await req('POST', '/api/blocks', { block_table_id: t.id, alt_from: 100, alt_to: 120, space_id: 10 })).json;
    expect(b.space_id).toBe(10);
    // צייר הבלוקים שומר גובה בלבד
    await req('PUT', `/api/blocks/${b.id}`, { alt_from: 100, alt_to: 140 });
    let row = (await pool.query('SELECT alt_to, space_id FROM blocks WHERE id=$1', [b.id])).rows[0];
    expect(row.alt_to).toBe(140);
    expect(row.space_id).toBe(10);
    // ועורך הבלוק יכול לנקות במפורש ("כל המרחבים")
    await req('PUT', `/api/blocks/${b.id}`, { alt_from: 100, alt_to: 140, space_id: null });
    row = (await pool.query('SELECT space_id FROM blocks WHERE id=$1', [b.id])).rows[0];
    expect(row.space_id).toBeNull();
  });

  it('שכפול טבלה מעתיק את החלוקה ואת מרחבי הבלוקים', async () => {
    const t = (await req('POST', '/api/block-tables', { name: 'מקור', split_space_ids: [11] })).json;
    await req('POST', '/api/blocks', { block_table_id: t.id, alt_from: 60, alt_to: 80, space_id: 11 });
    const copy = (await req('POST', `/api/block-tables/${t.id}/duplicate`)).json;
    expect(copy.split_space_ids).toEqual([11]);
    const blks = (await pool.query('SELECT space_id FROM blocks WHERE block_table_id=$1', [copy.id])).rows;
    expect(blks.map(r => r.space_id)).toEqual([11]);
  });
});
