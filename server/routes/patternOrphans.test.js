// היפוך הקפה עם מטוסים בהקפה - PATTERN_FLIP_SPEC.md §4.
// סימון בשרת אחרי שינוי מסלולים בשימוש, והכרעה שבה הראשונה גוברת.
import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import express from 'express';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base, reconcile;

const req = async (method, path, body) => {
  const r = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json() };
};

const stateOf = async () => (await pool.query(
  'SELECT aircraft_idx AS idx, pattern_id, runway_ident, pattern_orphan FROM joining_point_aircraft ORDER BY aircraft_idx',
)).rows.map(r => ({ idx: r.idx, pattern: r.pattern_id, runway: r.runway_ident, orphan: r.pattern_orphan }));

/** הפיכת כיוון במסלול 15/33: הקצה הנבחר דולק לנחיתה, הנגדי כבה. */
const flipTo = async (end) => {
  const other = end === '33' ? '15' : '33';
  await pool.query(`UPDATE runway_end_use SET in_landing = TRUE, updated_at = NOW() WHERE runway_id = 2 AND end_name = $1`, [end]);
  await pool.query(`UPDATE runway_end_use SET in_landing = FALSE, in_takeoff = FALSE, updated_at = NOW() WHERE runway_id = 2 AND end_name = $1`, [other]);
  await reconcile((q, p) => pool.query(q, p), 1);
};

const resolve = (decisions) => req('POST', '/api/pattern-orphans/resolve', { decisions });

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: router } = await import('./joiningPoints.js');
  ({ reconcilePatternOrphans: reconcile } = await import('../utils/patternOrphans.js'));
  const { listen } = await import('../listen.js');

  for (const sql of [
    `CREATE TABLE airfields (id SERIAL PRIMARY KEY, name VARCHAR(100), base_id INTEGER)`,
    `CREATE TABLE airfield_runways (id SERIAL PRIMARY KEY, airfield_id INTEGER, name VARCHAR(20), heading_a VARCHAR(4), heading_b VARCHAR(4))`,
    `CREATE TABLE airfield_routes (id SERIAL PRIMARY KEY, source_runway_id INTEGER)`,
    `CREATE TABLE route_link_members (id SERIAL PRIMARY KEY, group_id INTEGER, route_id INTEGER)`,
    `CREATE TABLE runway_end_use (id SERIAL PRIMARY KEY, runway_id INTEGER NOT NULL, end_name VARCHAR(20) NOT NULL,
      in_takeoff BOOLEAN NOT NULL DEFAULT FALSE, in_landing BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(runway_id, end_name))`,
    `CREATE TABLE airfield_patterns (id SERIAL PRIMARY KEY, airfield_id INTEGER, runway_ident VARCHAR(10) NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE airfield_joining_points (id SERIAL PRIMARY KEY, airfield_id INTEGER, name VARCHAR(100) NOT NULL DEFAULT '')`,
    `CREATE TABLE strips (id SERIAL PRIMARY KEY, callsign VARCHAR(50), alt VARCHAR(10), number_of_formation VARCHAR(10),
      aircraft_indices JSONB DEFAULT NULL, workstation_preset_id INTEGER)`,
    `CREATE TABLE strip_aircraft (id SERIAL PRIMARY KEY, strip_id INTEGER, idx INTEGER NOT NULL, datk INTEGER,
      flight_status VARCHAR(20) DEFAULT 'none', UNIQUE(strip_id, idx))`,
    `CREATE TABLE joining_point_strips (id SERIAL PRIMARY KEY, joining_point_id INTEGER, strip_id INTEGER)`,
    `CREATE TABLE joining_point_aircraft (id SERIAL PRIMARY KEY, joining_point_id INTEGER, strip_id INTEGER, aircraft_idx INTEGER NOT NULL,
      runway_ident VARCHAR(10) DEFAULT '', pattern_id INTEGER, in_pattern BOOLEAN NOT NULL DEFAULT FALSE, pattern_frac FLOAT,
      alt VARCHAR(10), runway_auto BOOLEAN NOT NULL DEFAULT FALSE, pattern_orphan VARCHAR(10),
      updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(strip_id, aircraft_idx))`,
    `CREATE TABLE activity_log (id SERIAL PRIMARY KEY, event_type VARCHAR(50), severity VARCHAR(20), workstation_preset_id INTEGER,
      workstation_name VARCHAR(100), crew_member_id INTEGER, crew_member_name VARCHAR(100), strip_id VARCHAR(20),
      strip_callsign VARCHAR(50), details JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`,
  ]) await pool.query(sql);

  await pool.query(`INSERT INTO airfields (id, name) VALUES (1, 'שדה א'), (2, 'שדה ב')`);
  await pool.query(`INSERT INTO airfield_runways (id, airfield_id, name, heading_a, heading_b) VALUES
    (1, 1, '08/26', '08', '26'), (2, 1, '15/33', '15', '33'), (3, 2, '15/33', '15', '33')`);
  // 33 - הקפה אחת · 15 - שתיים (שמאלית/ימנית) · 26 בשדה א · 33 בשדה ב
  await pool.query(`INSERT INTO airfield_patterns (id, airfield_id, runway_ident, sort_order) VALUES
    (8, 1, '33', 0), (5, 1, '15', 0), (6, 1, '15', 1), (7, 1, '26', 0), (9, 2, '33', 0)`);
  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

beforeEach(async () => {
  for (const t of ['joining_point_aircraft', 'strip_aircraft', 'strips', 'runway_end_use', 'activity_log']) {
    await pool.query(`DELETE FROM ${t}`);
  }
  await pool.query(`INSERT INTO runway_end_use (runway_id, end_name, in_landing) VALUES
    (2, '33', TRUE), (2, '15', FALSE), (1, '26', FALSE), (1, '08', FALSE)`);
  await pool.query(`INSERT INTO strips (id, callsign, number_of_formation) VALUES (10, 'בננה', '3')`);
  await pool.query(`INSERT INTO strip_aircraft (strip_id, idx) VALUES (10, 1), (10, 2), (10, 3)`);
  // שלושת המטוסים בהקפה של 33; השלישי נגרר ועוד לא הוכנס
  await pool.query(`INSERT INTO joining_point_aircraft (strip_id, aircraft_idx, runway_ident, pattern_id, in_pattern) VALUES
    (10, 1, '33', 8, TRUE), (10, 2, '33', 8, TRUE), (10, 3, '33', 8, FALSE)`);
});

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

describe('סימון בשרת אחרי היפוך', () => {
  it('#2/#13 היפוך ל-15: כל מטוסי ההקפה של 33 ממתינים, כולל מי שנגרר ועוד לא הוכנס', async () => {
    await flipTo('15');
    expect((await stateOf()).map(a => a.orphan)).toEqual(['pending', 'pending', 'pending']);
  });

  it('#1 בלי היפוך - אין סימון', async () => {
    await reconcile((q, p) => pool.query(q, p), 1);
    expect((await stateOf()).map(a => a.orphan)).toEqual([null, null, null]);
  });

  it('#8 החזרת הכיוון לפני הכרעה - ההתראה נעלמת', async () => {
    await flipTo('15');
    await flipTo('33');
    expect((await stateOf()).map(a => a.orphan)).toEqual([null, null, null]);
  });

  it('מטוס שנחת אינו מסומן', async () => {
    await pool.query(`UPDATE strip_aircraft SET flight_status = 'landed' WHERE idx = 1`);
    await flipTo('15');
    expect((await stateOf()).map(a => a.orphan)).toEqual([null, 'pending', 'pending']);
  });
});

describe('POST /api/pattern-orphans/resolve', () => {
  it('#5 גורף + חריג: שניים עוברים ל-15 (שתי ההקפות), אחד ממשיך', async () => {
    await flipTo('15');
    const r = await resolve([
      { strip_id: 10, aircraft_idx: 1, action: 'move', pattern_id: 5 },
      { strip_id: 10, aircraft_idx: 2, action: 'move', pattern_id: 6 },
      { strip_id: 10, aircraft_idx: 3, action: 'keep' },
    ]);
    expect(r.json).toEqual({ applied: 3 });
    expect(await stateOf()).toEqual([
      { idx: 1, pattern: 5, runway: '15', orphan: null },
      { idx: 2, pattern: 6, runway: '15', orphan: null },
      { idx: 3, pattern: 8, runway: '33', orphan: 'kept' },
    ]);
    const log = await pool.query(`SELECT details FROM activity_log WHERE event_type = 'pattern_flip_decision'`);
    expect(log.rows[0].details.decisions).toHaveLength(3);
  });

  it('#7 שתי עמדות - הראשונה גוברת, השנייה לא דורסת', async () => {
    await flipTo('15');
    const all = (d) => [1, 2, 3].map(i => ({ strip_id: 10, aircraft_idx: i, ...d }));
    expect((await resolve(all({ action: 'keep' }))).json).toEqual({ applied: 3 });
    expect((await resolve(all({ action: 'move', pattern_id: 5 }))).json).toEqual({ applied: 0 });
    expect((await stateOf()).map(a => [a.pattern, a.orphan])).toEqual([[8, 'kept'], [8, 'kept'], [8, 'kept']]);
  });

  it('יעד מהקפה של שדה אחר - נדחה', async () => {
    await flipTo('15');
    expect((await resolve([{ strip_id: 10, aircraft_idx: 1, action: 'move', pattern_id: 9 }])).json).toEqual({ applied: 0 });
    expect((await stateOf())[0]).toEqual({ idx: 1, pattern: 8, runway: '33', orphan: 'pending' });
  });

  it('#9 "ממשיכים" ואז הכיוון חוזר - ההבהוב נעלם', async () => {
    await flipTo('15');
    await resolve([{ strip_id: 10, aircraft_idx: 1, action: 'keep' }]);
    await flipTo('33');
    expect((await stateOf())[0].orphan).toBeNull();
  });

  it('#12 גרירה ידנית של מטוס ממתין להקפה אחרת - הסימון מתאפס', async () => {
    await flipTo('15');
    await req('PUT', '/api/joining-point-aircraft/10/1', { runway_ident: '15', pattern_id: 5, in_pattern: true });
    expect((await stateOf())[0]).toEqual({ idx: 1, pattern: 5, runway: '15', orphan: null });
    // עדכון שלא משנה הקפה (צלע/גרירה עליה) אינו מוחק את הסימון
    await req('PUT', '/api/joining-point-aircraft/10/2', { runway_ident: '33', pattern_id: 8, in_pattern: true, pattern_frac: 0.3 });
    expect((await stateOf())[1].orphan).toBe('pending');
  });
});
