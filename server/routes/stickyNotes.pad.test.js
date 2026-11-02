// ─── פתקית = משטח הדסק החופשי ────────────────────────────────────────────────
// הפתקית קיבלה את המשטח של הדסק החופשי (FreeDeskPad): כתב יד, פריסה (מצב,
// ספליטר, היפוך, רקע) וגודל. כתב היד והפריסה שייכים **לפתקית** ומופצים איתה;
// הגודל, כמו המיקום, שייך **לעמדה** - כל נמען מסדר את המסך שלו.
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;

const req = async (method, path, body) => {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const notesOf = async (presetId) => (await req('GET', `/api/sticky-notes?presetId=${presetId}`)).json;

const MINE = 1, PEER = 2;

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: router } = await import('./collaboration.js');
  const { listen } = await import('../listen.js');

  await pool.query(`CREATE TABLE workstation_presets (id SERIAL PRIMARY KEY, name VARCHAR(100))`);
  await pool.query(`INSERT INTO workstation_presets (id, name) VALUES (1, 'א'), (2, 'ב')`);
  // הסכמה כפי שהיא נבנית ב-init.js, כולל העמודות החדשות
  await pool.query(`CREATE TABLE sticky_notes (
    id SERIAL PRIMARY KEY, title VARCHAR(200) DEFAULT '', content TEXT DEFAULT '',
    background_color VARCHAR(20) DEFAULT '#fef08a',
    creator_preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE SET NULL,
    creator_preset_name VARCHAR(100), creator_crew_name VARCHAR(100),
    allow_all_edit BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW(),
    last_edited_by_preset_name VARCHAR(100), last_edited_by_crew_name VARCHAR(100), last_edited_at TIMESTAMPTZ,
    ink_image TEXT DEFAULT '', pad_layout JSONB DEFAULT '{}')`);
  await pool.query(`CREATE TABLE sticky_note_recipients (
    sticky_note_id INTEGER REFERENCES sticky_notes(id) ON DELETE CASCADE,
    preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
    x FLOAT DEFAULT 100, y FLOAT DEFAULT 100, minimized BOOLEAN DEFAULT FALSE,
    width INTEGER, height INTEGER,
    PRIMARY KEY (sticky_note_id, preset_id))`);

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(r => server?.close(r));
});

describe('פתקית עם משטח הדסק החופשי', () => {
  let id;

  it('פתקית חדשה נולדת בלי כתב יד, בפריסה ריקה ובלי גודל שמור', async () => {
    const created = await req('POST', '/api/sticky-notes', { creator_preset_id: MINE, creator_preset_name: 'א', x: 50, y: 60 });
    expect(created.status).toBe(200);
    id = created.json.id;
    const [n] = await notesOf(MINE);
    expect(n.ink_image).toBe('');
    expect(n.pad_layout).toEqual({});
    expect(n.width).toBeNull();
    expect(n.height).toBeNull();
  });

  it('כתב היד והפריסה נשמרים על הפתקית', async () => {
    const layout = { mode: 'both', orientation: 'side', swapped: true, split: 0.3, bg: { kind: 'lines', size: 24, line: 'solid' } };
    const r = await req('PUT', `/api/sticky-notes/${id}`, { ink_image: 'data:image/png;base64,AAA', pad_layout: layout, preset_id: MINE });
    expect(r.status).toBe(200);
    const [n] = await notesOf(MINE);
    expect(n.ink_image).toBe('data:image/png;base64,AAA');
    expect(n.pad_layout).toEqual(layout);
  });

  it('הגודל נשמר לעמדה, כמו המיקום', async () => {
    await req('PUT', `/api/sticky-notes/${id}`, { width: 420.4, height: 380, preset_id: MINE });
    const [n] = await notesOf(MINE);
    expect(n.width).toBe(420);
    expect(n.height).toBe(380);
  });

  it('בהפצה הנמען מקבל את כתב היד והפריסה, אבל לא את הגודל של השולח', async () => {
    await req('POST', `/api/sticky-notes/${id}/distribute`, { preset_ids: [PEER] });
    const [n] = await notesOf(PEER);
    expect(n.ink_image).toBe('data:image/png;base64,AAA');
    expect(n.pad_layout.mode).toBe('both');
    expect(n.width).toBeNull();
  });

  it('מחיקת כתב היד חוזרת לריק', async () => {
    await req('PUT', `/api/sticky-notes/${id}`, { ink_image: null, preset_id: MINE });
    const [n] = await notesOf(MINE);
    expect(n.ink_image).toBe('');
  });
});
