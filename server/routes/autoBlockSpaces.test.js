// ─── טופס העזר: מרחבים שמותר לשייך אליהם אוטומטית ─────────────────────────────
// PATCH /api/workstation-presets/:id/auto-block-spaces - null = כל המרחבים,
// מערך (גם ריק) = רק מה שסומן. ערך לא תקין נדחה ולא דורס.
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;
const patch = async (id, body) => {
  const r = await fetch(`${base}/api/workstation-presets/${id}/auto-block-spaces`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const stored = async id => (await pool.query('SELECT auto_block_space_ids FROM workstation_presets WHERE id = $1', [id])).rows[0].auto_block_space_ids;
const enabledOf = async id => (await pool.query('SELECT auto_block_space_by_target FROM workstation_presets WHERE id = $1', [id])).rows[0].auto_block_space_by_target;

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: router } = await import('./workstations.js');
  const { listen } = await import('../listen.js');
  await pool.query(`CREATE TABLE workstation_presets (id SERIAL PRIMARY KEY, name TEXT, auto_block_space_ids JSONB DEFAULT NULL, auto_block_space_by_target BOOLEAN DEFAULT false)`);
  await pool.query(`INSERT INTO workstation_presets (id, name) VALUES (1, 'עמדה')`);
  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

describe('מרחבים לשיוך אוטומטי', () => {
  it('ברירת מחדל - null (כל המרחבים)', async () => {
    expect(await stored(1)).toBe(null);
  });
  it('שמירת רשימה - מספרים ייחודיים', async () => {
    const { status, json } = await patch(1, { ids: [3, '5', 3] });
    expect(status).toBe(200);
    expect(json.auto_block_space_ids).toEqual([3, 5]);
    expect(await stored(1)).toEqual([3, 5]);
  });
  it('רשימה ריקה נשמרת כריקה - אין מרחב מותר', async () => {
    await patch(1, { ids: [] });
    expect(await stored(1)).toEqual([]);
  });
  it('null מחזיר ל"כל המרחבים"', async () => {
    await patch(1, { ids: null });
    expect(await stored(1)).toBe(null);
  });
  it('ערך לא תקין - 400 ולא דורס', async () => {
    await patch(1, { ids: [7] });
    const { status } = await patch(1, { ids: 'x' });
    expect(status).toBe(400);
    expect(await stored(1)).toEqual([7]);
  });
  it('עמדה לא קיימת - 404', async () => {
    expect((await patch(99, { ids: [] })).status).toBe(404);
  });
});

describe('הפעלת החלוקה האוטומטית מהטופס בעמדה', () => {
  it('enabled לבד - מדליק בלי לגעת ברשימת המרחבים', async () => {
    await patch(1, { ids: [4] });
    const { status, json } = await patch(1, { enabled: true });
    expect(status).toBe(200);
    expect(json.auto_block_space_by_target).toBe(true);
    expect(await stored(1)).toEqual([4]);
  });
  it('ids לבד - לא משנה את ההפעלה', async () => {
    await patch(1, { ids: null });
    expect(await enabledOf(1)).toBe(true);
    expect(await stored(1)).toBe(null);
  });
  it('כיבוי', async () => {
    await patch(1, { enabled: false });
    expect(await enabledOf(1)).toBe(false);
  });
  it('בלי ids ובלי enabled - 400', async () => {
    expect((await patch(1, {})).status).toBe(400);
  });
});
