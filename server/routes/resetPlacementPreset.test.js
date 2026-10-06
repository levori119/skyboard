// ─── ניקוי הקצאות של עמדה ─────────────────────────────────────────────────────
// דווח מהשטח: פקח ניקה את הקצאות העמדה, וחלק מהפ"ממים נשארו **מחוברים** אליה.
//
// השורש: המסלול בחר את הקצאות האזור לפי `sza.map_id = ANY(מפות פתוחות)`, בעוד
// ש"נמצא בעמדה" נגזר מ-`sza.preset_id` (strips.js §at_preset_names). שתי עמודות
// שונות לאותה שאלה - ולכן הקצאה שנעשתה על מפה שאינה פתוחה ברגע הניקוי נעלמת
// מהמחיקה ונשארת מחוברת, ובמקביל הקצאה של **עמדה אחרת** על מפה משותפת נגזלת.
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

const clear = (presetId, mapIds) =>
  req('POST', '/api/strips/reset-placement-preset', { presetId, mapIds });

const zoneRows = async () =>
  (await pool.query('SELECT strip_id, preset_id, map_id FROM strip_zone_assignments ORDER BY strip_id')).rows;
const stripRow = async (id) =>
  (await pool.query('SELECT * FROM strips WHERE id = $1', [id])).rows[0];

const MINE = 1, OTHER = 2;
const MY_MAP = 5, OTHER_MAP = 7;

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: router } = await import('./strips.js');
  const { listen } = await import('../listen.js');

  await pool.query(`CREATE TABLE workstation_presets (id SERIAL PRIMARY KEY, name VARCHAR(100))`);
  await pool.query(`CREATE TABLE strips (
    id SERIAL PRIMARY KEY, callsign VARCHAR(50), status VARCHAR(50) DEFAULT 'active',
    on_map BOOLEAN DEFAULT FALSE, x REAL DEFAULT 0, y REAL DEFAULT 0,
    map_lat DOUBLE PRECISION, map_lon DOUBLE PRECISION, map_pin_x REAL, map_pin_y REAL,
    map_zone_name TEXT DEFAULT '', map_zone_alts TEXT DEFAULT '',
    in_table BOOLEAN DEFAULT FALSE, workstation_preset_id INTEGER)`);
  await pool.query(`CREATE TABLE strip_table_assignments (
    strip_id INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
    preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    PRIMARY KEY (strip_id, preset_id))`);
  await pool.query(`CREATE TABLE strip_zone_assignments (
    id SERIAL PRIMARY KEY,
    strip_id INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
    zone_id INTEGER, map_id INTEGER, preset_id INTEGER,
    UNIQUE(strip_id))`);
  await pool.query(`CREATE TABLE strip_zone_extra_zones (
    id SERIAL PRIMARY KEY,
    strip_id INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
    zone_id INTEGER NOT NULL, map_id INTEGER,
    UNIQUE(strip_id, zone_id))`);
  await pool.query(`CREATE TABLE strip_transfers (
    id SERIAL PRIMARY KEY, strip_id INTEGER, status VARCHAR(50) DEFAULT 'pending',
    from_preset_id INTEGER, to_preset_id INTEGER)`);
  await pool.query(`CREATE TABLE civilian_strip_assignments (
    id SERIAL PRIMARY KEY,
    strip_id INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
    preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    col_key VARCHAR(100) NOT NULL DEFAULT '', sub_col VARCHAR(50) NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(strip_id, preset_id))`);
  // הלאמות והגבלות אזור - נוקות רק כשהמפעיל בחר בכך בדיאלוג הניקוי
  await pool.query(`CREATE TABLE temp_zone_seizures (
    id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL DEFAULT '',
    creator_preset_id INTEGER, creator_preset_name VARCHAR(100) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    ended_at TIMESTAMPTZ, ended_by_preset_id INTEGER)`);
  await pool.query(`CREATE TABLE temp_zone_seizure_targets (
    seizure_id INTEGER NOT NULL, preset_id INTEGER NOT NULL, seen_end BOOLEAN DEFAULT TRUE)`);
  await pool.query(`CREATE TABLE map_zones (id SERIAL PRIMARY KEY, map_id INTEGER, name VARCHAR(100) DEFAULT '')`);
  await pool.query(`CREATE TABLE map_zone_operational_state (
    zone_id INTEGER PRIMARY KEY, active_alt_range_ids JSONB DEFAULT '[]', limitation_note TEXT DEFAULT '',
    restriction VARCHAR(20) NOT NULL DEFAULT '', restriction_alt_min INTEGER, restriction_alt_max INTEGER,
    restriction_range_ids JSONB DEFAULT '[]', updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`INSERT INTO workstation_presets (id, name) VALUES (1, 'מגדל'), (2, 'בקרה')`);

  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

beforeEach(async () => {
  for (const t of ['temp_zone_seizure_targets', 'temp_zone_seizures', 'map_zone_operational_state', 'map_zones',
                   'civilian_strip_assignments', 'strip_transfers', 'strip_zone_extra_zones',
                   'strip_zone_assignments', 'strip_table_assignments', 'strips']) {
    await pool.query(`DELETE FROM ${t}`);
  }
});

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

const addStrip = (id, extra = {}) => pool.query(
  `INSERT INTO strips (id, callsign, status, on_map, in_table, workstation_preset_id)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  [id, 'CS' + id, extra.status ?? 'active', extra.on_map ?? false, extra.in_table ?? false, extra.owner ?? null]);

describe('ניקוי הקצאות עמדה - הקצאות אזור נבחרות לפי העמדה, לא לפי המפה הפתוחה', () => {
  it('הקצאה שהעמדה עשתה על מפה שאינה פתוחה כרגע - מנותקת גם היא', async () => {
    await addStrip(100, { on_map: true });
    await pool.query(`INSERT INTO strip_zone_assignments (strip_id, zone_id, map_id, preset_id) VALUES (100, 11, $1, $2)`, [OTHER_MAP, MINE]);

    const { status } = await clear(MINE, [MY_MAP]);
    expect(status).toBe(200);
    expect(await zoneRows()).toHaveLength(0);
    expect((await stripRow(100)).on_map).toBe(false);
  });

  it('עמדה בלי מפה פתוחה - ההקצאות שלה עדיין מנותקות', async () => {
    await addStrip(101, { on_map: true });
    await pool.query(`INSERT INTO strip_zone_assignments (strip_id, zone_id, map_id, preset_id) VALUES (101, 11, $1, $2)`, [MY_MAP, MINE]);

    const { status, json } = await clear(MINE, []);
    expect(status).toBe(200);
    expect(json.zoneAssignments).toBe(1);
    expect(await zoneRows()).toHaveLength(0);
  });

  it('אזורים מחוברים (extra zones) נמחקים יחד עם ההקצאה הראשית', async () => {
    await addStrip(102, { on_map: true });
    await pool.query(`INSERT INTO strip_zone_assignments (strip_id, zone_id, map_id, preset_id) VALUES (102, 11, $1, $2)`, [OTHER_MAP, MINE]);
    await pool.query(`INSERT INTO strip_zone_extra_zones (strip_id, zone_id, map_id) VALUES (102, 12, $1), (102, 13, $1)`, [OTHER_MAP]);

    await clear(MINE, [MY_MAP]);
    const extras = await pool.query('SELECT * FROM strip_zone_extra_zones');
    expect(extras.rowCount).toBe(0);
  });

  it('שורת legacy בלי preset_id - עדיין נתפסת לפי המפה הפתוחה', async () => {
    await addStrip(103, { on_map: true });
    await pool.query(`INSERT INTO strip_zone_assignments (strip_id, zone_id, map_id, preset_id) VALUES (103, 11, $1, NULL)`, [MY_MAP]);

    await clear(MINE, [MY_MAP]);
    expect(await zoneRows()).toHaveLength(0);
  });
});

describe('ניקוי הקצאות עמדה - לא גוזל מעמדה אחרת', () => {
  it('פ"מ על הדסק שלי שעמדה אחרת הציבה על המפה - ההקצאה שלה שורדת', async () => {
    await addStrip(200, { on_map: true, in_table: true });
    await pool.query(`INSERT INTO strip_table_assignments (strip_id, preset_id) VALUES (200, $1)`, [MINE]);
    await pool.query(`INSERT INTO strip_zone_assignments (strip_id, zone_id, map_id, preset_id) VALUES (200, 11, $1, $2)`, [MY_MAP, OTHER]);

    const { status } = await clear(MINE, [MY_MAP]);
    expect(status).toBe(200);
    const rows = await zoneRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].preset_id).toBe(OTHER);
    // הפ"מ נשאר על המפה של העמדה האחרת
    expect((await stripRow(200)).on_map).toBe(true);
    // ומהדסק שלי הוא כן ירד
    expect((await pool.query('SELECT * FROM strip_table_assignments')).rowCount).toBe(0);
  });

  it('פ"מ על הדסק של עמדה אחרת - in_table נשאר TRUE', async () => {
    await addStrip(201, { in_table: true });
    await pool.query(`INSERT INTO strip_table_assignments (strip_id, preset_id) VALUES (201, $1), (201, $2)`, [MINE, OTHER]);

    await clear(MINE, [MY_MAP]);
    expect((await stripRow(201)).in_table).toBe(true);
    const left = await pool.query('SELECT preset_id FROM strip_table_assignments');
    expect(left.rows.map(r => r.preset_id)).toEqual([OTHER]);
  });

  it('פ"מ שהיה רק אצלי - in_table מתאפס', async () => {
    await addStrip(202, { in_table: true });
    await pool.query(`INSERT INTO strip_table_assignments (strip_id, preset_id) VALUES (202, $1)`, [MINE]);

    await clear(MINE, [MY_MAP]);
    expect((await stripRow(202)).in_table).toBe(false);
  });
});

describe('ניקוי הקצאות עמדה - תצוגה אזרחית', () => {
  it('הקצאות אזרחיות של העמדה נוקו, ושל עמדה אחרת נשמרו', async () => {
    await addStrip(300);
    await addStrip(301);
    await pool.query(`INSERT INTO civilian_strip_assignments (strip_id, preset_id, col_key) VALUES (300, $1, 'a'), (301, $2, 'b')`, [MINE, OTHER]);

    const { json } = await clear(MINE, [MY_MAP]);
    const left = await pool.query('SELECT preset_id FROM civilian_strip_assignments');
    expect(left.rows.map(r => r.preset_id)).toEqual([OTHER]);
    expect(json.civilianAssignments).toBe(1);
  });
});

describe('ניקוי הקצאות עמדה - בעלות והעברות', () => {
  it('בעלות מתאפסת רק אם היא שלי', async () => {
    await addStrip(400, { owner: MINE });
    await addStrip(401, { owner: OTHER, in_table: true });
    await pool.query(`INSERT INTO strip_table_assignments (strip_id, preset_id) VALUES (401, $1)`, [MINE]);

    await clear(MINE, [MY_MAP]);
    expect((await stripRow(400)).workstation_preset_id).toBe(null);
    expect((await stripRow(401)).workstation_preset_id).toBe(OTHER);
  });

  it('העברה ממתינה של פ"מ שלי נמחקת והסטטוס חוזר ל-active', async () => {
    await addStrip(402, { owner: MINE, status: 'pending_transfer' });
    await pool.query(`INSERT INTO strip_transfers (strip_id, status, from_preset_id, to_preset_id) VALUES (402, 'pending', $1, $2)`, [MINE, OTHER]);

    const { json } = await clear(MINE, [MY_MAP]);
    expect(json.transfers).toBe(1);
    expect((await pool.query('SELECT * FROM strip_transfers')).rowCount).toBe(0);
    expect((await stripRow(402)).status).toBe('active');
  });
});

// ─── ניקוי מורחב: הלאמות והגבלות אזור ────────────────────────────────────────
// "נקה הקצאות עמדה" שואל אם לנקות גם ציורים, הלאמות והגבלות. הציורים נוקים
// בלקוח (collab-state); השניים האחרים כאן, ורק כשהדגל נשלח.
const seizureRow = async (id) => (await pool.query('SELECT * FROM temp_zone_seizures WHERE id = $1', [id])).rows[0];
const zoneState = async (id) => (await pool.query('SELECT * FROM map_zone_operational_state WHERE zone_id = $1', [id])).rows[0];

describe('ניקוי הקצאות עמדה - הלאמות אזור זמני', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO temp_zone_seizures (id, name, creator_preset_id, status) VALUES
      (1, 'שלי', $1, 'active'), (2, 'של אחר', $2, 'active'), (3, 'שלי שהסתיימה', $1, 'ended')`, [MINE, OTHER]);
    await pool.query(`INSERT INTO temp_zone_seizure_targets (seizure_id, preset_id, seen_end) VALUES (1, $1, TRUE)`, [OTHER]);
  });

  it('בלי הדגל - ההלאמות לא נוגעות', async () => {
    const { json } = await clear(MINE, [MY_MAP]);
    expect((await seizureRow(1)).status).toBe('active');
    expect(json.seizures ?? 0).toBe(0);
  });

  it('עם הדגל - מסתיימות רק ההלאמות הפעילות שהעמדה יצרה, וההודעה נמסרת ליעדים', async () => {
    const { status, json } = await req('POST', '/api/strips/reset-placement-preset',
      { presetId: MINE, mapIds: [MY_MAP], clearSeizures: true });
    expect(status).toBe(200);
    expect(json.seizures).toBe(1);
    const mine = await seizureRow(1);
    expect(mine.status).toBe('ended');
    expect(mine.ended_by_preset_id).toBe(MINE);
    expect((await seizureRow(2)).status).toBe('active');
    const t = (await pool.query('SELECT seen_end FROM temp_zone_seizure_targets WHERE seizure_id = 1')).rows[0];
    expect(t.seen_end).toBe(false);
  });
});

describe('ניקוי הקצאות עמדה - הגבלות אזור (סגור / מוגבל)', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO map_zones (id, map_id) VALUES (21, $1), (22, $1), (23, $2)`, [MY_MAP, OTHER_MAP]);
    await pool.query(`INSERT INTO map_zone_operational_state (zone_id, restriction, restriction_alt_min, restriction_alt_max, restriction_range_ids, limitation_note) VALUES
      (21, 'closed', 10, 50, '[4]', 'הערה'), (22, 'restricted', NULL, NULL, '[]', ''), (23, 'closed', NULL, NULL, '[]', '')`);
  });

  it('בלי הדגל - ההגבלות נשארות', async () => {
    await clear(MINE, [MY_MAP]);
    expect((await zoneState(21)).restriction).toBe('closed');
  });

  it('עם הדגל - נפתחים האזורים של המפות שבעמדה, והטווח מתאפס; מפה אחרת לא נוגעת', async () => {
    const { json } = await req('POST', '/api/strips/reset-placement-preset',
      { presetId: MINE, mapIds: [MY_MAP], clearRestrictions: true });
    expect(json.restrictions).toBe(2);
    const z = await zoneState(21);
    expect(z.restriction).toBe('');
    expect(z.restriction_alt_min).toBe(null);
    expect(z.restriction_alt_max).toBe(null);
    expect(z.restriction_range_ids).toEqual([]);
    expect(z.limitation_note).toBe('הערה');
    expect((await zoneState(22)).restriction).toBe('');
    expect((await zoneState(23)).restriction).toBe('closed');
  });

  it('עם הדגל ובלי מפה פתוחה - שום הגבלה לא נפתחת', async () => {
    const { json } = await req('POST', '/api/strips/reset-placement-preset',
      { presetId: MINE, mapIds: [], clearRestrictions: true });
    expect(json.restrictions).toBe(0);
    expect((await zoneState(21)).restriction).toBe('closed');
  });
});
