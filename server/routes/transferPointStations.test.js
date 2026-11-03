// ─── נקודת העברה כבויה לעמדה - מסלול השרת ─────────────────────────────────────
// כיבוי מחזיר למוסר את ההעברות הפתוחות שקשורות לעמדה (אותה סגירה של דחייה),
// ושליחה דרך נקודה כבויה נחסמת.
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
  await pool.query(`CREATE TABLE sectors (id SERIAL PRIMARY KEY, name VARCHAR(100), label_he VARCHAR(100), disabled_preset_ids JSONB DEFAULT '[]', auto_accept_mode VARCHAR(12) DEFAULT 'off')`);
  await pool.query(`CREATE TABLE workstation_presets (id SERIAL PRIMARY KEY, name VARCHAR(100), relevant_sectors JSONB DEFAULT '[]',
    classic_transfer_points JSONB DEFAULT '[]', classic_receive_points JSONB DEFAULT '[]')`);
  await pool.query(`CREATE TABLE strips (id SERIAL PRIMARY KEY, callsign VARCHAR(50), status VARCHAR(20), workstation_preset_id INTEGER, on_map BOOLEAN DEFAULT false, in_table BOOLEAN DEFAULT false)`);
  await pool.query(`CREATE TABLE strip_transfers (id SERIAL PRIMARY KEY, strip_id INTEGER, from_sector_id INTEGER, to_sector_id INTEGER,
    from_workstation_id INTEGER, to_workstation_id INTEGER, to_preset_id INTEGER, from_preset_id INTEGER, status VARCHAR(20),
    reject_note TEXT, sub_sector_label VARCHAR(50), eta_minutes INTEGER, eta_set_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`INSERT INTO sectors (id, name, label_he) VALUES (100, 'P', 'צפון')`);
  // A=1 ו-B=2 משתמשות בנקודה; C=3 לא
  await pool.query(`INSERT INTO workstation_presets (id, name, relevant_sectors) VALUES (1, 'A', '[100]'), (2, 'B', '[100]'), (3, 'C', '[]')`);
  const { default: router } = await import('./transfers.js');
  const { listen } = await import('../listen.js');
  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => { server?.close(); await pool?.end?.(); });

const addTransfer = async (stripPreset, fromPreset, toPreset = null) => {
  const s = (await pool.query(`INSERT INTO strips (callsign, status, workstation_preset_id) VALUES ('X', 'pending_transfer', $1) RETURNING id`, [stripPreset])).rows[0].id;
  const t = (await pool.query(`INSERT INTO strip_transfers (strip_id, to_sector_id, from_workstation_id, to_preset_id, status) VALUES ($1, 100, $2, $3, 'pending') RETURNING id`, [s, fromPreset, toPreset])).rows[0].id;
  return { s, t };
};
const statusOf = async (t) => (await pool.query('SELECT status, reject_note FROM strip_transfers WHERE id = $1', [t])).rows[0];

describe('כיבוי נקודה לעמדה', () => {
  it('העברה שהעמדה שכובתה שלחה - חוזרת למוסר עם הערה; העברה של עמדה אחרת שיש לה מקבל - נשארת', async () => {
    const mine = await addTransfer(null, 1);       // A שלחה
    const other = await addTransfer(null, 3);      // C שלחה, B עדיין יכולה לקבל
    const r = await req('PUT', '/api/sectors/100/stations/1', { enabled: false });
    expect(r.status).toBe(200);
    expect(r.json.returned).toBe(1);
    const st = await statusOf(mine.t);
    expect(st.status).toBe('rejected');
    expect(st.reject_note).toMatch(/כובתה לעמדה A/);
    expect((await pool.query('SELECT workstation_preset_id FROM strips WHERE id=$1', [mine.s])).rows[0].workstation_preset_id).toBe(1);
    expect((await statusOf(other.t)).status).toBe('pending');
    const sec = (await pool.query('SELECT disabled_preset_ids FROM sectors WHERE id = 100')).rows[0];
    expect(sec.disabled_preset_ids).toEqual([1]);
  });

  it('שליחה דרך נקודה כבויה נחסמת (409)', async () => {
    const r = await req('POST', '/api/strips/1/transfer', { toSectorId: 100, fromWorkstationId: 1 });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('transfer_point_disabled');
  });

  it('כשגם B כובתה - העברה בלי יעד מפורש נתקעת, ולכן חוזרת', async () => {
    const t = await addTransfer(null, 3);
    const r = await req('PUT', '/api/sectors/100/stations/2', { enabled: false });
    expect(r.json.returned).toBeGreaterThanOrEqual(1);
    expect((await statusOf(t.t)).status).toBe('rejected');
  });

  it('הדלקה מחזירה את העמדה, בלי לגעת בהעברות', async () => {
    const r = await req('PUT', '/api/sectors/100/stations/1', { enabled: true });
    expect(r.json.returned).toBe(0);
    const sec = (await pool.query('SELECT disabled_preset_ids FROM sectors WHERE id = 100')).rows[0];
    expect(sec.disabled_preset_ids).toEqual([2]);
  });
});
