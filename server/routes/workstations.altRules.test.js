// ─── הגדרות עמדה: חוקי גובה לפי חימוש (alt_armament_rules) ──────────────────
// ה-INSERT וה-UPDATE של workstation_presets הם שאילתות פוזיציונליות של 65/73
// פרמטרים. עמודה שנוספה בלי ה-$N התואם, או עם $N בלי ערך, שוברת **כל** שמירה
// של עמדה - ולכן הבדיקה בונה את הטבלה מרשימות העמודות שבקוד עצמו ושומרת בפועל.
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'workstations.js'), 'utf8');
  const insertCols = src.match(/INSERT INTO workstation_presets \(([^)]*)\)/)[1].split(',').map(c => c.trim());
  const updateCols = [...src.matchAll(/(\w+) = \$\d+/g)].map(m => m[1]);
  const cols = [...new Set([...insertCols, ...updateCols])].filter(c => c !== 'id');
  await pool.query(`CREATE TABLE workstation_presets (id SERIAL PRIMARY KEY, ${cols.map(c => `${c} TEXT`).join(', ')}, updated_at TIMESTAMPTZ)`);
  const { default: router } = await import('./workstations.js');
  const { listen } = await import('../listen.js');
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => { server?.close(); await pool?.end?.(); });

describe('workstation_presets.alt_armament_rules', () => {
  const rules = [{ armament: 'ברד כבד 84', kind: 'band', band: 'low' }, { armament: 'חד', kind: 'alt', alt_ft: 12000 }];

  it('נשמר ביצירה ובעדכון, ושאר הטופס ממשיך להישמר', async () => {
    const c = await req('POST', '/api/workstation-presets', { name: 'בדיקה', alt_armament_rules: rules, suggest_alt_range: true });
    expect(c.status).toBe(200);
    const id = c.json.id;
    let row = (await pool.query('SELECT * FROM workstation_presets WHERE id = $1', [id])).rows[0];
    expect(JSON.parse(row.alt_armament_rules)).toEqual(rules);
    expect(row.name).toBe('בדיקה');

    const u = await req('PUT', `/api/workstation-presets/${id}`, { name: 'בדיקה 2', alt_armament_rules: [rules[1]], load_relevant: false });
    expect(u.status).toBe(200);
    row = (await pool.query('SELECT * FROM workstation_presets WHERE id = $1', [id])).rows[0];
    expect(JSON.parse(row.alt_armament_rules)).toEqual([rules[1]]);
    expect(row.name).toBe('בדיקה 2');
    expect(row.load_relevant).toBe('false');
  });

  it('ערך שאינו מערך נשמר כרשימה ריקה', async () => {
    const c = await req('POST', '/api/workstation-presets', { name: 'ריק', alt_armament_rules: 'x' });
    const row = (await pool.query('SELECT alt_armament_rules FROM workstation_presets WHERE id = $1', [c.json.id])).rows[0];
    expect(JSON.parse(row.alt_armament_rules)).toEqual([]);
  });
});
