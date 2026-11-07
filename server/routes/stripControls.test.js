// ─── שמירת ערך פקד כשהמזהה מגיע עם קידומת ─────────────────────────────────────
// העמדה מזהה פ"מ כ-`s3924` (קידומת שמבדילה בין פ"מ לישויות אחרות באותה רשימה),
// ושתי הטבלאות כאן שומרות INTEGER. בלי נרמול בשער השמירה נפלה ב-500, והפקח ראה
// ערך שנכתב על המסך ונמחק מיד - בלי שום הודעה. דווח על "הערה" במוד הטבלה.
import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
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

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: router } = await import('./stripControls.js');
  const { listen } = await import('../listen.js');

  await pool.query(`CREATE TABLE strips (id SERIAL PRIMARY KEY, callsign VARCHAR(50), custom_fields JSONB)`);
  await pool.query(`CREATE TABLE workstation_presets (id SERIAL PRIMARY KEY, name VARCHAR(100))`);
  await pool.query(`CREATE TABLE strip_control_values (
    strip_id INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
    preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    control_key VARCHAR(64) NOT NULL, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (strip_id, preset_id, control_key))`);
  await pool.query(`INSERT INTO workstation_presets (id, name) VALUES (21, 'בת"ק עזה')`);
  // קטלוג השדות - כפי שהוא ב-init.js, כולל עמודת סוג הנתון
  await pool.query(`CREATE SEQUENCE strip_field_key_seq`);
  await pool.query(`CREATE TABLE strip_field_defs (
    id SERIAL PRIMARY KEY, key VARCHAR(64) NOT NULL UNIQUE, label VARCHAR(120) NOT NULL DEFAULT '',
    type VARCHAR(20) NOT NULL DEFAULT 'field', input_mode VARCHAR(20) DEFAULT 'keyboard',
    scope VARCHAR(10) NOT NULL DEFAULT 'global', values_json JSONB DEFAULT '[]', default_value JSONB,
    styles_json JSONB DEFAULT '[]', data_type VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

beforeEach(async () => {
  await pool.query('DELETE FROM strip_control_values');
  await pool.query('DELETE FROM strips');
  await pool.query(`INSERT INTO strips (id, callsign, custom_fields) VALUES (3924, 'E2E', NULL)`);
});

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

const KEY = 'custom_1777440115846';

describe('ערך גלובלי לפ"מ (strips.custom_fields)', () => {
  it('מזהה עם קידומת s נשמר ואינו נופל', async () => {
    const { status, json } = await req('PUT', '/api/strips/s3924/control-field', { control_key: KEY, value: 'שמור אותי' });
    expect(status).toBe(200);
    expect(json.custom_fields[KEY]).toBe('שמור אותי');
  });

  it('גם מזהה מספרי נשמר - הנרמול אינו שובר את הקיים', async () => {
    const { status, json } = await req('PUT', '/api/strips/3924/control-field', { control_key: KEY, value: 'א' });
    expect(status).toBe(200);
    expect(json.custom_fields[KEY]).toBe('א');
  });

  it('ערך רב-שורתי נשמר כפי שהוא', async () => {
    const { json } = await req('PUT', '/api/strips/s3924/control-field', { control_key: KEY, value: 'שורה א\nשורה ב' });
    expect(json.custom_fields[KEY]).toBe('שורה א\nשורה ב');
  });

  it('מזהה שאינו פ"מ נדחה ב-400 ולא ב-500', async () => {
    expect((await req('PUT', '/api/strips/abc/control-field', { control_key: KEY, value: 'x' })).status).toBe(400);
  });

  it('פ"מ שאינו קיים מחזיר 404', async () => {
    expect((await req('PUT', '/api/strips/s999999/control-field', { control_key: KEY, value: 'x' })).status).toBe(404);
  });
});

describe('ערך פנימי ללוח (strip_control_values)', () => {
  it('מזהה עם קידומת s נשמר ונקרא חזרה', async () => {
    const { status } = await req('PUT', '/api/strip-control-values', { strip_id: 's3924', preset_id: 21, control_key: KEY, value: 'ב' });
    expect(status).toBe(200);
    const { json } = await req('GET', '/api/strip-control-values?preset_id=21');
    expect(json['3924'][KEY]).toBe('ב');
  });

  it('מזהה שאינו פ"מ נדחה ב-400', async () => {
    const { status } = await req('PUT', '/api/strip-control-values', { strip_id: 'sxyz', preset_id: 21, control_key: KEY, value: 'x' });
    expect(status).toBe(400);
  });
});

// ─── סוג הנתון של שדה בקטלוג (CIV_STRIP_CONTROLS.md §2.4) ────────────────────
describe('קטלוג השדות - סוג נתון', () => {
  it('שדה נוצר עם סוג נתון, והסוג נקרא חזרה ב-GET', async () => {
    const created = await req('POST', '/api/strip-field-defs', { label: 'שעת המראה', type: 'field', dataType: 'time', defaultValue: '' });
    expect(created.status).toBe(200);
    expect(created.json.dataType).toBe('time');
    const list = await req('GET', '/api/strip-field-defs');
    expect(list.json.find(f => f.id === created.json.id).dataType).toBe('time');
  });

  it('עדכון משנה את הסוג', async () => {
    const created = await req('POST', '/api/strip-field-defs', { label: 'כמות', type: 'field', dataType: 'text' });
    const upd = await req('PUT', `/api/strip-field-defs/${created.json.id}`, { ...created.json, dataType: 'integer' });
    expect(upd.status).toBe(200);
    expect(upd.json.dataType).toBe('integer');
  });

  it('שדה בלי סוג (ותיק, או לקוח ישן) = טקסט', async () => {
    const created = await req('POST', '/api/strip-field-defs', { label: 'הערה', type: 'field' });
    expect(created.json.dataType).toBe('text');
    // שורה ותיקה שנכתבה לפני העמודה - NULL ב-DB
    await pool.query(`INSERT INTO strip_field_defs (key, label, type) VALUES ('legacy_1', 'ישן', 'field')`);
    const list = await req('GET', '/api/strip-field-defs');
    expect(list.json.find(f => f.key === 'legacy_1').dataType).toBe('text');
  });

  it('סוג לא מוכר נשמר כטקסט ולא נשמר שבור', async () => {
    const created = await req('POST', '/api/strip-field-defs', { label: 'x', type: 'field', dataType: 'banana' });
    expect(created.json.dataType).toBe('text');
  });

  it('לפקד שאינו שדה אין סוג נתון', async () => {
    const created = await req('POST', '/api/strip-field-defs', { label: 'מצב', type: 'button', values: ['A'], dataType: 'integer' });
    expect(created.json.dataType).toBe('text');
  });
});
