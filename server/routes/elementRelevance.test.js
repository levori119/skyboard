// "למי רלוונטי" לאלמנט בבסיס - רכבים / מטוסים (airfield_elements.relevant_for):
// נשמר בניהול, ואפליקציית הנהג מקבלת רק את האלמנטים שרלוונטיים לרכבים.
import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;

const req = async (method, path, body, who = 'station') => {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Test-User': who },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json() };
};

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: airfieldRouter } = await import('./airfield.js');
  const { listen } = await import('../listen.js');

  // זהה ל-init.js בעמודות שהנתיבים נוגעים בהן
  await pool.query(`CREATE TABLE airfields (id SERIAL PRIMARY KEY, name VARCHAR(100), map_id INTEGER, base_id INTEGER)`);
  await pool.query(`CREATE TABLE airfield_element_types (id SERIAL PRIMARY KEY, name VARCHAR(100), color VARCHAR(20),
    icon VARCHAR(200), can_change_status BOOLEAN DEFAULT FALSE, allowed_statuses JSONB DEFAULT '[]')`);
  await pool.query(`CREATE TABLE airfield_elements (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    element_type_id INTEGER, name VARCHAR(200) NOT NULL, status VARCHAR(20) DEFAULT 'תקין', note TEXT,
    x_pct FLOAT, y_pct FLOAT, created_at TIMESTAMPTZ DEFAULT NOW(), category VARCHAR(100) DEFAULT '',
    display_state VARCHAR(20) DEFAULT 'normal', blink_rate FLOAT DEFAULT 1.0, blink_colors VARCHAR(200),
    open_icon_key VARCHAR(200), close_icon_key VARCHAR(200), rotation SMALLINT DEFAULT 0, camera_url TEXT,
    relevant_routes JSONB DEFAULT '[]', blocking_statuses JSONB DEFAULT '[]', hidden_on_map BOOLEAN DEFAULT false,
    show_in_driver BOOLEAN DEFAULT false, relevant_for JSONB DEFAULT '["vehicles","aircraft"]',
    road_relevance JSONB DEFAULT '[]')`);
  await pool.query(`INSERT INTO airfields (id, name, base_id) VALUES (1, 'שדה א', 7)`);

  const app = express();
  app.use(express.json());
  app.use((r, _res, next) => {
    const who = r.get('X-Test-User') || '';
    r.user = who === 'station'
      ? { role: 'user', nationalId: null, baseIds: [] }
      : { role: 'driver', nationalId: '012345678', baseIds: [7] };
    next();
  });
  app.use(airfieldRouter);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

beforeEach(async () => { await pool.query('DELETE FROM airfield_elements'); });

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

const mk = body => req('POST', '/api/airfield-elements', { airfield_id: 1, name: 'אלמנט', ...body }).then(r => r.json);

describe('שמירת "למי רלוונטי"', () => {
  it('אלמנט חדש בלי בחירה - רלוונטי לשניהם', async () => {
    expect((await mk({})).relevant_for).toEqual(['vehicles', 'aircraft']);
  });

  it('אלמנט חדש עם בחירה - נשמרת מנוקה', async () => {
    expect((await mk({ relevant_for: ['aircraft', 'boats'] })).relevant_for).toEqual(['aircraft']);
  });

  it('עריכה משנה את הבחירה; עריכה בלי השדה או עם בחירה ריקה - שומרת את הקיים', async () => {
    const el = await mk({});
    const put = body => req('PUT', `/api/airfield-elements/${el.id}`, { name: 'אלמנט', ...body }).then(r => r.json);
    expect((await put({ relevant_for: ['vehicles'] })).relevant_for).toEqual(['vehicles']);
    expect((await put({})).relevant_for).toEqual(['vehicles']);
    expect((await put({ relevant_for: [] })).relevant_for).toEqual(['vehicles']);
  });
});

describe('אפליקציית הנהג - רק אלמנטים שרלוונטיים לרכבים', () => {
  it('driver_only מחזיר רק אלמנטים לנהג שרלוונטיים לרכבים', async () => {
    const a = await mk({ name: 'רמזור', relevant_for: ['vehicles'] });
    const b = await mk({ name: 'תאורת מסלול', relevant_for: ['aircraft'] });
    const c = await mk({ name: 'מחסום', relevant_for: ['vehicles', 'aircraft'] });
    await pool.query('UPDATE airfield_elements SET show_in_driver = true');
    const { json } = await req('GET', '/api/airfield-elements/by-base/7?driver_only=true', undefined, 'driver');
    expect(json.map(e => e.id).sort()).toEqual([a.id, c.id].sort());
    expect(json.some(e => e.id === b.id)).toBe(false);
  });

  it('בלי driver_only (עמדה) - כל האלמנטים', async () => {
    await mk({ relevant_for: ['vehicles'] });
    await mk({ relevant_for: ['aircraft'] });
    expect((await req('GET', '/api/airfield-elements/by-base/7')).json).toHaveLength(2);
  });
});
