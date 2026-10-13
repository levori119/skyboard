// הסתרת כפתורים ופעולות - GET/PUT מול system_defaults (PGlite בזיכרון).
// הקטלוג והניקוי: shared/hiddenActions.js.
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;

const get = () => fetch(`${base}/api/system/hidden-actions`).then(r => r.json());
const put = body => fetch(`${base}/api/system/hidden-actions`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: adminRouter } = await import('./admin.js');
  const { listen } = await import('../listen.js');
  await pool.query(`CREATE TABLE system_defaults (key VARCHAR(100) PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE activity_log (id SERIAL PRIMARY KEY, event_type TEXT, severity TEXT,
    crew_member_id INTEGER, crew_member_name TEXT, details TEXT)`);
  const app = express();
  app.use(express.json());
  app.use((r, _res, next) => { r.user = { crewMemberId: 5, name: 'מנהל' }; next(); });
  app.use(adminRouter);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server?.close();
  await pool?.end?.();
});

describe('/api/system/hidden-actions', () => {
  it('לפני שהוגדר דבר - כלום מוסתר', async () => {
    expect(await get()).toEqual({ hidden: [] });
  });

  it('PUT שומר, מנקה id לא מוכרים וכפילויות, ונרשם ביומן', async () => {
    const r = await put({ hidden: ['voice', 'bogus', 'voice', 'theme'] });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ hidden: ['voice', 'theme'] });
    expect(await get()).toEqual({ hidden: ['voice', 'theme'] });
    const { rows } = await pool.query(`SELECT details FROM activity_log WHERE event_type = 'system_setting'`);
    expect(JSON.parse(rows.at(-1).details)).toEqual({ key: 'hiddenActions', hidden: ['voice', 'theme'] });
  });

  it('מערך ריק מחזיר הכל', async () => {
    await put({ hidden: [] });
    expect(await get()).toEqual({ hidden: [] });
  });

  it('גוף שאינו מערך - 400 בלי לגעת בהגדרה', async () => {
    await put({ hidden: ['voice'] });
    expect((await put({ hidden: 'voice' })).status).toBe(400);
    expect(await get()).toEqual({ hidden: ['voice'] });
  });
});
