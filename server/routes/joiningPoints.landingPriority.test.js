// סדר עדיפויות לנחיתה לדת"ק: מבנה שמגיע לנקודת הצטרפות מחולק אוטומטית
// למסלולים לפי סדר העדיפויות של הדת"ק של כל מטוס, מתוך המסלולים הפתוחים לנחיתות.
import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;

const req = async (method, path, body) => {
  const r = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json() };
};

const runwaysOf = async (sid) => (await pool.query(
  'SELECT aircraft_idx, runway_ident, pattern_id FROM joining_point_aircraft WHERE strip_id = $1 ORDER BY aircraft_idx', [sid],
)).rows.map(r => ({ idx: r.aircraft_idx, runway: r.runway_ident, pattern: r.pattern_id }));

const setLanding = async (endName, on) => pool.query(
  `UPDATE runway_end_use SET in_landing = $2, updated_at = NOW() WHERE end_name = $1`, [endName, on],
);

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: router } = await import('./joiningPoints.js');
  const { listen } = await import('../listen.js');

  // זהה ל-init.js בעמודות שהנתיבים נוגעים בהן
  for (const sql of [
    `CREATE TABLE airfields (id SERIAL PRIMARY KEY, name VARCHAR(100))`,
    `CREATE TABLE airfield_runways (id SERIAL PRIMARY KEY, airfield_id INTEGER, name VARCHAR(20), heading_a VARCHAR(4), heading_b VARCHAR(4))`,
    `CREATE TABLE airfield_routes (id SERIAL PRIMARY KEY, source_runway_id INTEGER)`,
    `CREATE TABLE route_link_members (id SERIAL PRIMARY KEY, group_id INTEGER, route_id INTEGER)`,
    `CREATE TABLE runway_end_use (id SERIAL PRIMARY KEY, runway_id INTEGER NOT NULL, end_name VARCHAR(20) NOT NULL,
      in_takeoff BOOLEAN NOT NULL DEFAULT FALSE, in_landing BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(runway_id, end_name))`,
    `CREATE TABLE airfield_patterns (id SERIAL PRIMARY KEY, airfield_id INTEGER, runway_ident VARCHAR(10) NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE airfield_points (id SERIAL PRIMARY KEY, airfield_id INTEGER, name VARCHAR(100) NOT NULL,
      point_type VARCHAR(10), landing_priority JSONB NOT NULL DEFAULT '[]'::jsonb)`,
    `CREATE TABLE airfield_joining_points (id SERIAL PRIMARY KEY, airfield_id INTEGER, name VARCHAR(100) NOT NULL DEFAULT '')`,
    `CREATE TABLE strips (id SERIAL PRIMARY KEY, callsign VARCHAR(50), alt VARCHAR(10), number_of_formation VARCHAR(10),
      aircraft_indices JSONB DEFAULT NULL, workstation_preset_id INTEGER)`,
    `CREATE TABLE strip_aircraft (id SERIAL PRIMARY KEY, strip_id INTEGER, idx INTEGER NOT NULL, datk INTEGER,
      flight_status VARCHAR(20) DEFAULT 'none', UNIQUE(strip_id, idx))`,
    `CREATE TABLE joining_point_strips (id SERIAL PRIMARY KEY, joining_point_id INTEGER, strip_id INTEGER,
      is_coordinated BOOLEAN NOT NULL DEFAULT FALSE, coordination_note TEXT DEFAULT '', planned_alt VARCHAR(10),
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(joining_point_id, strip_id))`,
    `CREATE TABLE joining_point_aircraft (id SERIAL PRIMARY KEY, joining_point_id INTEGER, strip_id INTEGER, aircraft_idx INTEGER NOT NULL,
      runway_ident VARCHAR(10) DEFAULT '', pattern_id INTEGER, in_pattern BOOLEAN NOT NULL DEFAULT FALSE, pattern_frac FLOAT,
      alt VARCHAR(10), runway_auto BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(strip_id, aircraft_idx))`,
    `CREATE TABLE activity_log (id SERIAL PRIMARY KEY, event_type VARCHAR(50), severity VARCHAR(20), workstation_preset_id INTEGER,
      workstation_name VARCHAR(100), crew_member_id INTEGER, crew_member_name VARCHAR(100), strip_id VARCHAR(20),
      strip_callsign VARCHAR(50), details JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`,
  ]) await pool.query(sql);

  await pool.query(`INSERT INTO airfields (id, name) VALUES (1, 'שדה א'), (2, 'שדה ב')`);
  await pool.query(`INSERT INTO airfield_runways (id, airfield_id, name, heading_a, heading_b) VALUES
    (1, 1, '08/26', '08', '26'), (2, 1, '15/33', '15', '33'), (3, 2, '08/26', '08', '26')`);
  await pool.query(`INSERT INTO airfield_patterns (id, airfield_id, runway_ident) VALUES (7, 1, '26'), (8, 1, '33'), (9, 2, '26')`);
  await pool.query(`INSERT INTO airfield_joining_points (id, airfield_id, name) VALUES (1, 1, 'STAR A'), (2, 1, 'STAR B')`);
  await pool.query(`INSERT INTO airfield_points (airfield_id, name, point_type, landing_priority) VALUES
    (1, 'דת"ק 1', 'datk', '["26","33"]'), (1, 'דת"ק 2', 'datk', '["33","26"]'),
    (2, 'דת"ק 1', 'datk', '["08"]')`);

  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

beforeEach(async () => {
  for (const t of ['joining_point_aircraft', 'joining_point_strips', 'strip_aircraft', 'strips', 'runway_end_use', 'activity_log']) {
    await pool.query(`DELETE FROM ${t}`);
  }
  // שדה א: 26 ו-33 פתוחים לנחיתה; 08/15 כבויים. שדה ב: 26 פתוח (מסלול 08 סגור).
  await pool.query(`INSERT INTO runway_end_use (runway_id, end_name, in_landing) VALUES
    (1, '26', TRUE), (1, '08', FALSE), (2, '33', TRUE), (2, '15', FALSE), (3, '26', TRUE)`);
  // רביעייה: מטוסים 1,2 בדת"ק 1 · מטוס 3 בדת"ק 2 · מטוס 4 בלי דת"ק
  await pool.query(`INSERT INTO strips (id, callsign, number_of_formation) VALUES (10, 'בננה', '4')`);
  await pool.query(`INSERT INTO strip_aircraft (strip_id, idx, datk) VALUES (10, 1, 1), (10, 2, 1), (10, 3, 2), (10, 4, NULL)`);
});

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

describe('חלוקה אוטומטית למסלולים כשמבנה מגיע לנקודת הצטרפות', () => {
  it('שיבוץ ראשון: כל מטוס לפי הדת"ק שלו, עם ההקפה של המסלול', async () => {
    const r = await req('POST', '/api/joining-point-strips', { joining_point_id: 1, strip_id: 10, alt: '050' });
    expect(r.status).toBe(200);
    expect(await runwaysOf(10)).toEqual([
      { idx: 1, runway: '26', pattern: 7 },
      { idx: 2, runway: '26', pattern: 7 },
      { idx: 3, runway: '33', pattern: 8 },
    ]);
    const log = await pool.query(`SELECT details FROM activity_log WHERE event_type = 'joining_point_auto_runway'`);
    expect(log.rows).toHaveLength(1);
  });

  it('העדיפות הראשונה סגורה לנחיתה - יורדים לבאה ברשימה', async () => {
    await setLanding('26', false);
    await req('POST', '/api/joining-point-strips', { joining_point_id: 1, strip_id: 10, alt: '050' });
    expect((await runwaysOf(10)).map(a => a.runway)).toEqual(['33', '33', '33']);
  });

  it('שיבוץ חוזר באותה נקודה (שינוי גובה) לא מחלק מחדש - מסלול שהפקח ניקה נשאר ריק', async () => {
    await req('POST', '/api/joining-point-strips', { joining_point_id: 1, strip_id: 10, alt: '050' });
    await pool.query(`UPDATE joining_point_aircraft SET runway_ident = '' WHERE strip_id = 10 AND aircraft_idx = 1`);
    await req('POST', '/api/joining-point-strips', { joining_point_id: 1, strip_id: 10, alt: '060' });
    expect((await runwaysOf(10)).map(a => a.runway)).toEqual(['', '26', '33']);
  });

  it('מסלול שהפקח כבר בחר לא נדרס', async () => {
    await pool.query(`INSERT INTO joining_point_aircraft (strip_id, aircraft_idx, runway_ident) VALUES (10, 1, '33')`);
    await req('POST', '/api/joining-point-strips', { joining_point_id: 1, strip_id: 10, alt: '050' });
    expect((await runwaysOf(10)).map(a => a.runway)).toEqual(['33', '26', '33']);
  });

  it('גם כשהמבנה נכנס דרך פיצול לגבהים', async () => {
    const r = await req('PUT', '/api/joining-point-strips/1/10/split', { alt: '070', indices: [3, 4] });
    expect(r.status).toBe(200);
    expect((await runwaysOf(10)).filter(a => a.runway).map(a => [a.idx, a.runway])).toEqual([[1, '26'], [2, '26'], [3, '33']]);
  });

  it('רק הדת"קים והמסלולים של השדה של הנקודה', async () => {
    await pool.query(`INSERT INTO airfield_joining_points (id, airfield_id, name) VALUES (3, 2, 'STAR C') ON CONFLICT DO NOTHING`);
    await req('POST', '/api/joining-point-strips', { joining_point_id: 3, strip_id: 10, alt: '050' });
    // דת"ק 1 בשדה ב מעדיף 08, והוא סגור שם - אין שיבוץ; דת"ק 2 לא מוגדר בשדה ב
    expect(await runwaysOf(10)).toEqual([]);
  });

  it('מבנה מפוצל (aircraft_indices) - רק המטוסים שלו', async () => {
    await pool.query(`UPDATE strips SET aircraft_indices = '[3]'::jsonb, number_of_formation = '1' WHERE id = 10`);
    await req('POST', '/api/joining-point-strips', { joining_point_id: 1, strip_id: 10, alt: '050' });
    expect((await runwaysOf(10)).map(a => [a.idx, a.runway])).toEqual([[3, '33']]);
  });
});

const sourceOf = async (sid) => (await pool.query(
  'SELECT aircraft_idx, runway_ident, runway_auto FROM joining_point_aircraft WHERE strip_id = $1 ORDER BY aircraft_idx', [sid],
)).rows.map(r => [r.aircraft_idx, r.runway_ident, r.runway_auto ? 'auto' : 'manual']);

describe('מקור המסלול - אוטומטי או ידני', () => {
  it('חלוקה אוטומטית מסמנת את המסלול כאוטומטי', async () => {
    await req('POST', '/api/joining-point-strips', { joining_point_id: 1, strip_id: 10, alt: '050' });
    expect(await sourceOf(10)).toEqual([[1, '26', 'auto'], [2, '26', 'auto'], [3, '33', 'auto']]);
  });

  it('בחירה ידנית של מסלול אחר - ידני; עדכון שלא משנה מסלול (הקפה) - נשאר אוטומטי', async () => {
    await req('POST', '/api/joining-point-strips', { joining_point_id: 1, strip_id: 10, alt: '050' });
    await req('PUT', '/api/joining-point-aircraft/10/1', { joining_point_id: 1, runway_ident: '33', pattern_id: 8 });
    await req('PUT', '/api/joining-point-aircraft/10/2', { joining_point_id: 1, runway_ident: '26', pattern_id: 7, pattern_frac: 0.4 });
    expect(await sourceOf(10)).toEqual([[1, '33', 'manual'], [2, '26', 'auto'], [3, '33', 'auto']]);
  });
});

describe('סדר מחדש מסלולים לפי דת"קים - פעולה על הנקודה', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO strips (id, callsign, number_of_formation) VALUES (11, 'תפוח', '1')`);
    await pool.query(`INSERT INTO strip_aircraft (strip_id, idx, datk) VALUES (11, 1, 2)`);
  });

  it('דורס גם בחירה ידנית, לכל הפ"ממים בנקודה, ומסמן אוטומטי', async () => {
    await req('POST', '/api/joining-point-strips', { joining_point_id: 1, strip_id: 10, alt: '050' });
    await req('POST', '/api/joining-point-strips', { joining_point_id: 1, strip_id: 11, alt: '060' });
    await req('PUT', '/api/joining-point-aircraft/10/1', { joining_point_id: 1, runway_ident: '33' });
    await req('PUT', '/api/joining-point-aircraft/11/1', { joining_point_id: 1, runway_ident: '26' });
    // המצב בשדה השתנה: 26 נסגר לנחיתה
    await setLanding('26', false);

    const r = await req('POST', '/api/joining-points/1/reorder-runways', {});
    expect(r.status).toBe(200);
    expect(r.json.assigned).toHaveLength(4);
    expect(await sourceOf(10)).toEqual([[1, '33', 'auto'], [2, '33', 'auto'], [3, '33', 'auto']]);
    expect(await sourceOf(11)).toEqual([[1, '33', 'auto']]);
  });

  it('מטוס בהקפה לא נוגעים בו; מטוס בלי תוצאה שומר את המסלול שלו', async () => {
    await req('POST', '/api/joining-point-strips', { joining_point_id: 1, strip_id: 10, alt: '050' });
    await pool.query(`UPDATE joining_point_aircraft SET in_pattern = TRUE, runway_auto = FALSE WHERE strip_id = 10 AND aircraft_idx = 1`);
    await pool.query(`INSERT INTO joining_point_aircraft (joining_point_id, strip_id, aircraft_idx, runway_ident) VALUES (1, 10, 4, '33')`);
    await req('PUT', '/api/joining-point-aircraft/10/3', { joining_point_id: 1, runway_ident: '26' });

    await req('POST', '/api/joining-points/1/reorder-runways', {});
    expect(await sourceOf(10)).toEqual([[1, '26', 'manual'], [2, '26', 'auto'], [3, '33', 'auto'], [4, '33', 'manual']]);
  });

  it('נקודה לא קיימת - 404', async () => {
    expect((await req('POST', '/api/joining-points/999/reorder-runways', {})).status).toBe(404);
  });
});
