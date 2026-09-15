// FLOW של פ"מ - מול Postgres אמיתי (PGlite בזיכרון).
//
// מה שנבדק כאן הוא **מה נרשם ב-DB** כשהעמדות עושות את הפעולות התפעוליות שלהן:
// הסעה והמראה במגדל, שליחה לנקודת העברה, וקבלה בכל מסלולי הקבלה. והטענה
// המרכזית של הפיצ'ר: "נמצא בעמדה" נקבע רק מ**קבלה**, והקבלה נרשמת בשרת גם
// כשהיא אוטומטית - בלי תלות בלקוח שישלח יומן.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

let pool, server, base;

const req = (method, path, body) => fetch(`${base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const post = (p, b) => req('POST', p, b ?? {});
const put = (p, b) => req('PUT', p, b);
const get = (p) => req('GET', p);

const events = async (stripId) =>
  (await pool.query('SELECT * FROM strip_flow_events WHERE strip_id = $1 ORDER BY occurred_at, id', [stripId])).rows;

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';

  ({ default: pool } = await import('../db/pool.js'));
  const { default: transfersRouter } = await import('./transfers.js');
  const { default: stripsRouter } = await import('./strips.js');
  const { default: joiningRouter } = await import('./joiningPoints.js');
  const { default: flowRouter } = await import('./stripFlow.js');
  const { STRIP_FLOW_EVENTS_DDL } = await import('../db/stripFlowEvents.js');
  const { listen } = await import('../listen.js');

  await pool.query(`CREATE TABLE public.workstation_presets (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, relevant_sectors JSONB DEFAULT '[]',
    classic_receive_points JSONB DEFAULT '[]')`);
  await pool.query(`CREATE TABLE public.sectors (
    id SERIAL PRIMARY KEY, name VARCHAR(100), label_he VARCHAR(100), auto_accept_mode VARCHAR(20) DEFAULT 'off')`);
  await pool.query(`CREATE TABLE public.airfield_points (
    id SERIAL PRIMARY KEY, name VARCHAR(100), point_type VARCHAR(10))`);
  await pool.query(`CREATE TABLE public.strips (
    id SERIAL PRIMARY KEY, callsign VARCHAR(50), sq VARCHAR(10), number_of_formation VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active', workstation_preset_id INTEGER, sector_id INTEGER,
    on_map BOOLEAN DEFAULT false, in_table BOOLEAN DEFAULT false, x REAL, y REAL,
    held_by_workstation VARCHAR(36), parent_strip_id INTEGER, aircraft_indices JSONB,
    original_formation_count INTEGER, notes TEXT, landed BOOLEAN DEFAULT false,
    airborne BOOLEAN DEFAULT false, aircraft_positions JSONB DEFAULT '[]', ground_status VARCHAR(20),
    map_lat DOUBLE PRECISION, map_lon DOUBLE PRECISION,
    creator_preset_id INTEGER, creator_preset_name VARCHAR(100), creator_crew_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE public.strip_transfers (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    strip_id INTEGER REFERENCES strips(id) ON DELETE CASCADE,
    from_sector_id INTEGER, to_sector_id INTEGER, initiated_by VARCHAR(36),
    status VARCHAR(20) DEFAULT 'pending', target_x REAL DEFAULT 0, target_y REAL DEFAULT 0,
    sub_sector_label VARCHAR(50), from_workstation_id INTEGER, to_workstation_id INTEGER,
    from_preset_id INTEGER, to_preset_id INTEGER, reject_note TEXT,
    eta_minutes INTEGER, eta_set_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE public.strip_table_assignments (
    strip_id INTEGER, preset_id INTEGER, UNIQUE(strip_id, preset_id))`);
  await pool.query(`CREATE TABLE public.strip_aircraft (
    id SERIAL PRIMARY KEY, strip_id INTEGER, idx INTEGER, datk INTEGER,
    flight_status VARCHAR(20) DEFAULT 'none', greens BOOLEAN DEFAULT false,
    UNIQUE(strip_id, idx))`);
  await pool.query(`CREATE TABLE public.activity_log (
    id SERIAL PRIMARY KEY, event_type TEXT, severity TEXT, workstation_preset_id INTEGER,
    workstation_name TEXT, crew_member_id INTEGER, crew_member_name TEXT, strip_id TEXT,
    strip_callsign TEXT, details JSONB, timestamp TIMESTAMPTZ DEFAULT NOW())`);
  for (const sql of STRIP_FLOW_EVENTS_DDL) await pool.query(sql);

  const app = express();
  app.use(express.json());
  app.use((r, _res, next) => { r.user = { crewMemberId: 77, name: 'אורי לב', role: 'user' }; next(); });
  app.use(transfersRouter);
  app.use(stripsRouter);
  app.use(joiningRouter);
  app.use(flowRouter);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

beforeEach(async () => {
  for (const t of ['strip_flow_events', 'strip_table_assignments', 'strip_transfers', 'strip_aircraft', 'strips', 'airfield_points', 'sectors', 'workstation_presets', 'activity_log']) {
    await pool.query(`DELETE FROM ${t}`);
  }
  await pool.query(`INSERT INTO workstation_presets (id, name) VALUES (1, 'מגדל חצור'), (2, '305'), (3, 'בת"ק עזה')`);
  await pool.query(`INSERT INTO sectors (id, name, label_he) VALUES (10, 'palmach', 'פלמח')`);
  await pool.query(`INSERT INTO airfield_points (id, name, point_type) VALUES (100, 'דת"ק 8', 'datk'), (101, 'המתנה 33', 'waiting')`);
  await pool.query(`INSERT INTO strips (id, callsign, sq, number_of_formation, status, workstation_preset_id, creator_preset_id, creator_preset_name, aircraft_positions)
                    VALUES (5, 'בננה', '4', '2', 'active', 1, 1, 'מגדל חצור',
                            '[{"idx":1,"status":"none","point_id":100},{"idx":2,"status":"none","point_id":100}]')`);
});

async function sendToPalmach() {
  const r = await post('/api/strips/5/transfer', { toSectorId: 10, fromWorkstationId: 1, toWorkstationId: 2 });
  expect(r.status).toBe(200);
  return (await r.json()).transfer;
}

describe('אירועי קרקע - PUT /api/strips/:id/aircraft', () => {
  it('יציאה מהדת"ק, הסעה והמראה נרשמים עם שעה, עמדה, מסלול ומשתמש', async () => {
    await put('/api/strips/5/aircraft', { aircraft_positions: [
      { idx: 1, status: 'taxi', point_id: 101 }, { idx: 2, status: 'taxi', point_id: 101 }] });
    await put('/api/strips/5/aircraft', { aircraft_positions: [
      { idx: 1, status: 'takeoff', point_id: 101, takeoff_runway: '33' }, { idx: 2, status: 'takeoff', point_id: 101, takeoff_runway: '33' }] });

    const rows = await events(5);
    expect(rows.map(r => r.kind)).toEqual(['ground_point', 'taxi', 'takeoff']);
    expect(rows[0].point_label).toBe('המתנה 33');
    expect(rows[0].details).toMatchObject({ aircraft: [1, 2], fromPointName: 'דת"ק 8', fromPointType: 'datk' });
    expect(rows[2].details).toMatchObject({ runway: '33', aircraft: [1, 2] });
    expect(rows[2].preset_name).toBe('מגדל חצור');
    expect(rows[2].crew_member_name).toBe('אורי לב');
    expect(rows[2].callsign).toBe('בננה');
  });

  it('שליחה חוזרת של אותו מצב - אין אירוע כפול', async () => {
    const body = { aircraft_positions: [{ idx: 1, status: 'taxi', point_id: 100 }, { idx: 2, status: 'none', point_id: 100 }] };
    await put('/api/strips/5/aircraft', body);
    await put('/api/strips/5/aircraft', body);
    expect((await events(5)).map(r => r.kind)).toEqual(['taxi']);
  });
});

describe('העברות וקבלה', () => {
  it('שליחה לנקודת העברה נרשמת עם שם הנקודה, והפ"מ "בנקודה" ולא בעמדה', async () => {
    await sendToPalmach();
    const rows = await events(5);
    expect(rows.map(r => r.kind)).toEqual(['transfer_sent']);
    expect(rows[0].point_label).toBe('פלמח');
    expect(rows[0].preset_name).toBe('מגדל חצור');

    const flow = await (await get('/api/strips/5/flow')).json();
    expect(flow.current).toMatchObject({ kind: 'at_point', point: 'פלמח', toPresetName: '305' });
  });

  it('קבל - נרשמת העמדה שקיבלה בפועל, ו"נמצא עכשיו" הוא העמדה הזו', async () => {
    const t = await sendToPalmach();
    const r = await post(`/api/transfers/${t.id}/accept`, { receivingPresetId: 3 });
    expect(r.status).toBe(200);

    const acc = (await events(5)).find(e => e.kind === 'accepted');
    expect(acc.preset_id).toBe(3);
    expect(acc.preset_name).toBe('בת"ק עזה');
    expect(acc.point_label).toBe('פלמח');
    expect(acc.details).toMatchObject({ mode: 'manual', fromPresetName: 'מגדל חצור' });

    const flow = await (await get('/api/strips/5/flow')).json();
    expect(flow.current).toMatchObject({ kind: 'at_station', presetName: 'בת"ק עזה' });
  });

  it('קבלה למפה - אותו אירוע קבלה, עם אופן "map"', async () => {
    const t = await sendToPalmach();
    await post(`/api/transfers/${t.id}/accept-to-map`, { x: 1, y: 2, receivingPresetId: 2 });
    const acc = (await events(5)).find(e => e.kind === 'accepted');
    expect(acc.preset_name).toBe('305');
    expect(acc.details.mode).toBe('map');
  });

  it('קבלה אוטומטית בנקודת מעבר - נרשמת בשרת בלי משתמש', async () => {
    await pool.query(`UPDATE sectors SET auto_accept_mode = 'immediate' WHERE id = 10`);
    await sendToPalmach();
    const { runAutoAcceptOnce } = await import('./transfers.js');
    expect(await runAutoAcceptOnce()).toBe(1);
    const acc = (await events(5)).find(e => e.kind === 'accepted');
    expect(acc.details.mode).toBe('auto');
    expect(acc.preset_name).toBe('305');
  });

  it('דחייה וביטול נרשמים (עם הערת הדחייה)', async () => {
    let t = await sendToPalmach();
    await post(`/api/transfers/${t.id}/reject`, { note: 'עמוס' });
    t = await sendToPalmach();
    await post(`/api/transfers/${t.id}/cancel`);
    const rows = await events(5);
    expect(rows.map(r => r.kind)).toEqual(['transfer_sent', 'rejected', 'transfer_sent', 'cancelled']);
    expect(rows[1].details.note).toBe('עמוס');
  });

  it('כשל ברישום ה-FLOW אינו מפיל את הקבלה', async () => {
    const t = await sendToPalmach();
    await pool.query('ALTER TABLE strip_flow_events RENAME TO strip_flow_events_off');
    try {
      const r = await post(`/api/transfers/${t.id}/accept`, { receivingPresetId: 2 });
      expect(r.status).toBe(200);
      const st = (await pool.query('SELECT status FROM strip_transfers WHERE id = $1', [t.id])).rows[0];
      expect(st.status).toBe('accepted');
    } finally {
      await pool.query('ALTER TABLE strip_flow_events_off RENAME TO strip_flow_events');
    }
  });
});

describe('GET /api/strips/:id/flow ו-/api/strip-flows', () => {
  it('"נוצר" נגזר מהפ"מ עצמו, והאירועים כרונולוגיים', async () => {
    await put('/api/strips/5/aircraft', { aircraft_positions: [{ idx: 1, status: 'taxi', point_id: 100 }, { idx: 2, status: 'taxi', point_id: 100 }] });
    const t = await sendToPalmach();
    await post(`/api/transfers/${t.id}/accept`, { receivingPresetId: 2 });

    const flow = await (await get('/api/strips/5/flow')).json();
    expect(flow.strip).toMatchObject({ id: 5, callsign: 'בננה', sq: '4' });
    expect(flow.events.map(e => e.kind)).toEqual(['created', 'taxi', 'transfer_sent', 'accepted']);
    expect(flow.events[0].preset_name).toBe('מגדל חצור');
  });

  it('פ"מ לא קיים - 404', async () => {
    expect((await get('/api/strips/999/flow')).status).toBe(404);
  });

  it('כמה פ"מים בבקשה אחת', async () => {
    await pool.query(`INSERT INTO strips (id, callsign, sq, creator_preset_name) VALUES (6, 'חנית', '2', '305')`);
    const res = await (await get('/api/strip-flows?ids=5,s6,abc')).json();
    expect(res.flows.map(f => f.strip.id).sort()).toEqual([5, 6]);
  });

  it('נחיתת כל המטוסים - אירוע נחיתה ו"נחת"', async () => {
    await put('/api/strip-aircraft/5/1/flight-status', { flight_status: 'landed' });
    await put('/api/strip-aircraft/5/1/flight-status', { flight_status: 'landed' });
    await put('/api/strip-aircraft/5/2/flight-status', { flight_status: 'landed' });
    const rows = await events(5);
    expect(rows.map(r => r.kind)).toEqual(['landed', 'landed']);
    const flow = await (await get('/api/strips/5/flow')).json();
    expect(flow.current).toEqual({ kind: 'landed' });
  });

  it('מיזוג בקבלה - ה-FLOW של הפ"מ שנשאר כולל את קבלת החלק שנמחק', async () => {
    await pool.query(`UPDATE strips SET parent_strip_id = 5, aircraft_indices = '[1]', original_formation_count = 2, number_of_formation = '1', workstation_preset_id = 2 WHERE id = 5`);
    await pool.query(`INSERT INTO strips (id, callsign, sq, number_of_formation, status, parent_strip_id, aircraft_indices, original_formation_count, creator_preset_name)
                      VALUES (7, 'בננה', '4', '1', 'active', 5, '[2]', 2, 'מגדל חצור')`);
    await pool.query(`UPDATE strips SET workstation_preset_id = 1 WHERE id = 7`);
    const r = await post('/api/strips/7/transfer', { toSectorId: 10, fromWorkstationId: 1, toWorkstationId: 2 });
    const t = (await r.json()).transfer;
    await post(`/api/transfers/${t.id}/accept`, { receivingPresetId: 2 });

    expect((await pool.query('SELECT id FROM strips WHERE id = 7')).rows).toHaveLength(0);
    const flow = await (await get('/api/strips/5/flow')).json();
    const kinds = flow.events.map(e => e.kind);
    expect(kinds).toContain('accepted');
    expect(kinds).toContain('merged');
    expect(flow.events.find(e => e.kind === 'accepted').inherited).toBe(true);
  });
});
