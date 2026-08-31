// **הלאמת אזור זמני** - מחזור החיים המלא מול Postgres אמיתי (PGlite בזיכרון).
//
// למה מול DB אמיתי ולא mock של pool: מה שנבדק כאן הוא **מה יושב ב-DB** אחרי
// הקריאה - מי נרשם כיעד, מי אישר, ומה קורה לשורות כשההלאמה מסתיימת - ולא אילו
// שאילתות נשלחו. הטענה המרכזית: עמדה שהייתה מנותקת בזמן הסיום עדיין מקבלת את
// הודעת "יצאה מתוקף" בכניסה הבאה, כי המסירה נשענת על שורה ב-DB ולא על אירוע.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

let pool, server, base, router;

const GEO = [{ lat: 32.0, lon: 34.8 }, { lat: 32.2, lon: 34.8 }, { lat: 32.2, lon: 35.1 }];

const req = (method, path, body) => fetch(`${base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const post = (p, b) => req('POST', p, b);
const patch = (p, b) => req('PATCH', p, b);
const get = (p) => req('GET', p);

/** הלאמה תקינה מעמדה 1. ברירת המחדל: הפצה לעמדות 2 ו-3. */
const seizureBody = (over = {}) => ({
  name: 'תפיסת מרחב מזרח',
  purpose: 'ניסוי',
  color: '#f97316',
  alt_min: 100, alt_max: 140,
  polygon_geo: GEO,
  polygon: [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 40 }],
  creator_preset_id: 1,
  creator_preset_name: 'בקרה מרכז',
  creator_map_id: 1,
  phone: '1234', radio: '132.5', note: 'הערה',
  target_preset_ids: [2, 3],
  ...over,
});

beforeAll(async () => {
  // חייב להיקבע **לפני** ייבוא pool.js: הבחירה בין Neon למאגר המקומי נעשית
  // בזמן טעינת המודול.
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';

  ({ default: pool } = await import('../db/pool.js'));
  ({ default: router } = await import('./tempZoneSeizures.js'));
  const { listen } = await import('../listen.js');

  await pool.query(`CREATE TABLE public.workstation_presets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    map_id INTEGER,
    can_seize_zone BOOLEAN DEFAULT false)`);
  await pool.query(`CREATE TABLE public.maps (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    anchor1_x_img REAL, anchor1_y_img REAL, anchor1_lat DOUBLE PRECISION, anchor1_lon DOUBLE PRECISION,
    anchor2_x_img REAL, anchor2_y_img REAL, anchor2_lat DOUBLE PRECISION, anchor2_lon DOUBLE PRECISION)`);
  await pool.query(`CREATE TABLE public.map_zones (
    id SERIAL PRIMARY KEY,
    map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    polygon TEXT NOT NULL DEFAULT '[]',
    polygon_geo TEXT)`);
  await pool.query(`CREATE TABLE public.zone_altitude_ranges (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES map_zones(id) ON DELETE CASCADE,
    alt_min INTEGER, alt_max INTEGER, sort_order INTEGER DEFAULT 0)`);
  await pool.query(`CREATE TABLE public.activity_log (
    id SERIAL PRIMARY KEY, event_type TEXT, severity TEXT,
    workstation_preset_id INTEGER, workstation_name TEXT,
    crew_member_id INTEGER, crew_member_name TEXT, details JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE public.station_sessions (
    id SERIAL PRIMARY KEY,
    preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE SET NULL,
    entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exited_at TIMESTAMPTZ,
    last_seen TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE public.position_merges (
    id SERIAL PRIMARY KEY,
    covering_preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    covered_preset_id  INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at   TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE public.temp_zone_seizures (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    purpose TEXT DEFAULT '',
    color VARCHAR(20) NOT NULL DEFAULT '#f97316',
    alt_min INTEGER, alt_max INTEGER,
    polygon_geo JSONB NOT NULL DEFAULT '[]',
    polygon JSONB NOT NULL DEFAULT '[]',
    creator_preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE SET NULL,
    creator_preset_name VARCHAR(100) NOT NULL DEFAULT '',
    creator_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
    phone VARCHAR(60) DEFAULT '', radio VARCHAR(60) DEFAULT '', note TEXT DEFAULT '',
    eta_end TIMESTAMPTZ,
    to_all BOOLEAN DEFAULT false,
    status VARCHAR(12) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    ended_by_preset_id INTEGER)`);
  await pool.query(`CREATE TABLE public.temp_zone_seizure_targets (
    id SERIAL PRIMARY KEY,
    seizure_id INTEGER NOT NULL REFERENCES temp_zone_seizures(id) ON DELETE CASCADE,
    preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    acked BOOLEAN DEFAULT false,
    ack_note TEXT DEFAULT '',
    acked_at TIMESTAMPTZ,
    pins_in_zone INTEGER DEFAULT 0,
    affected_zone_names JSONB DEFAULT '[]',
    seen_end BOOLEAN DEFAULT false,
    UNIQUE(seizure_id, preset_id))`);

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

beforeEach(async () => {
  await pool.query(`DELETE FROM position_merges`);
  await pool.query(`DELETE FROM station_sessions`);
  await pool.query(`DELETE FROM temp_zone_seizure_targets`);
  await pool.query(`DELETE FROM temp_zone_seizures`);
  await pool.query(`DELETE FROM zone_altitude_ranges`);
  await pool.query(`DELETE FROM map_zones`);
  await pool.query(`DELETE FROM workstation_presets`);
  await pool.query(`DELETE FROM maps`);
  await pool.query(`DELETE FROM activity_log`);
  await pool.query(`INSERT INTO maps (id, name, anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon,
                                      anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon)
                    VALUES (1, 'מפה מעוגנת', 0, 0, 32.5, 34.5, 100, 100, 31.5, 35.5)`);
  await pool.query(`INSERT INTO maps (id, name) VALUES (2, 'מפה לא מעוגנת')`);
  await pool.query(`INSERT INTO workstation_presets (id, name, map_id, can_seize_zone) VALUES
    (1, 'בקרה מרכז', 1, true), (2, 'מגדל א', 1, false), (3, 'מגדל ב', 2, false), (4, 'דסק', NULL, false)`);
});

describe('יצירה', () => {
  it('נוצרת עם היעדים שנבחרו, והעמדה היוצרת אינה יעד של עצמה', async () => {
    const res = await post('/api/temp-zone-seizures', seizureBody({ target_preset_ids: [1, 2, 3] }));
    expect(res.status).toBe(200);
    const s = await res.json();
    const targets = (await pool.query('SELECT preset_id FROM temp_zone_seizure_targets WHERE seizure_id = $1 ORDER BY preset_id', [s.id])).rows;
    expect(targets.map(t => t.preset_id)).toEqual([2, 3]);
  });

  it('הפצה כללית מגיעה לכל העמדות למעט היוצרת', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody({ to_all: true, target_preset_ids: [] }))).json();
    const rows = (await pool.query('SELECT preset_id FROM temp_zone_seizure_targets WHERE seizure_id = $1 ORDER BY preset_id', [s.id])).rows;
    expect(rows.map(r => r.preset_id)).toEqual([2, 3, 4]);
  });

  it('בלי שם - נדחית', async () => {
    const res = await post('/api/temp-zone-seizures', seizureBody({ name: '   ' }));
    expect(res.status).toBe(400);
  });

  it('בלי נ"צ (פחות מ-3 קודקודים) - נדחית: אי אפשר להקרין למפה אחרת', async () => {
    const res = await post('/api/temp-zone-seizures', seizureBody({ polygon_geo: [{ lat: 32, lon: 34 }] }));
    expect(res.status).toBe(400);
  });

  it('בלי יעדים ובלי הפצה כללית - נדחית', async () => {
    const res = await post('/api/temp-zone-seizures', seizureBody({ target_preset_ids: [] }));
    expect(res.status).toBe(400);
  });

  it('טווח גבהים הפוך מנורמל בשמירה', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody({ alt_min: 200, alt_max: 100 }))).json();
    expect(s.alt_min).toBe(100);
    expect(s.alt_max).toBe(200);
  });

  it('טווח ריק נשמר כ-null - כל הגבהים', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody({ alt_min: null, alt_max: null }))).json();
    expect(s.alt_min).toBeNull();
    expect(s.alt_max).toBeNull();
  });

  it('נרשמת ביומן הביקורת', async () => {
    await post('/api/temp-zone-seizures', seizureBody());
    const log = (await pool.query(`SELECT event_type FROM activity_log`)).rows;
    expect(log.map(r => r.event_type)).toContain('temp_zone_seizure_created');
  });
});

describe('קריאה', () => {
  it('היוצר רואה את ההלאמה שלו ומסומן כיוצר', async () => {
    await post('/api/temp-zone-seizures', seizureBody());
    const rows = await (await get('/api/temp-zone-seizures?preset_id=1')).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].is_creator).toBe(true);
    expect(rows[0].is_target).toBe(false);
  });

  it('עמדת יעד רואה אותה כיעד ולא כיוצרת', async () => {
    await post('/api/temp-zone-seizures', seizureBody());
    const rows = await (await get('/api/temp-zone-seizures?preset_id=2')).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].is_target).toBe(true);
    expect(rows[0].my_acked).toBe(false);
  });

  it('עמדה שאינה יעד אינה רואה כלום', async () => {
    await post('/api/temp-zone-seizures', seizureBody({ target_preset_ids: [2] }));
    expect(await (await get('/api/temp-zone-seizures?preset_id=3')).json()).toHaveLength(0);
  });

  it('בלי preset_id מחזיר רשימה ריקה ולא שגיאה', async () => {
    expect(await (await get('/api/temp-zone-seizures')).json()).toEqual([]);
  });
});

describe('רשימת העמדות החכמה (candidates)', () => {
  it('אינה כוללת את העמדה היוצרת, ומסמנת מי מעוגנת', async () => {
    const d = await (await get('/api/temp-zone-seizures/candidates?preset_id=1')).json();
    const byId = Object.fromEntries(d.presets.map(p => [p.id, p]));
    expect(byId[1]).toBeUndefined();
    expect(byId[2].map_anchored).toBe(true);
    expect(byId[3].map_anchored).toBe(false); // מפה בלי עוגנים
    expect(byId[4].map_anchored).toBe(false); // בלי מפה בכלל
  });

  it('דופק טרי = מאוישת; מקטע פתוח בלי דופק טרי = לא פעילה', async () => {
    // 2 - נכנסה עכשיו ומדפקת · 3 - מקטע פתוח מלפני יומיים בלי דופק (סגרה לשונית)
    await pool.query(`INSERT INTO station_sessions (preset_id, last_seen) VALUES (2, NOW())`);
    await pool.query(`INSERT INTO station_sessions (preset_id, entered_at, last_seen)
                      VALUES (3, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days')`);
    const d = await (await get('/api/temp-zone-seizures/candidates?preset_id=1')).json();
    const byId = Object.fromEntries(d.presets.map(p => [p.id, p]));
    expect(byId[2].active).toBe(true);
    expect(byId[3].active).toBe(false);   // זו התקלה שדווחה מהשטח
  });

  it('מקטע שנפתח זה עתה נחשב מאויש גם לפני הדופק הראשון', async () => {
    await pool.query(`INSERT INTO station_sessions (preset_id) VALUES (2)`);  // last_seen = NULL
    const d = await (await get('/api/temp-zone-seizures/candidates?preset_id=1')).json();
    const byId = Object.fromEntries(d.presets.map(p => [p.id, p]));
    expect(byId[2].active).toBe(true);
  });

  it('מקטע ישן בלי דופק כלל - לא פעילה (כך נראים מקטעים שקדמו לדופק)', async () => {
    await pool.query(`INSERT INTO station_sessions (preset_id, entered_at)
                      VALUES (2, NOW() - INTERVAL '11 days')`);
    const d = await (await get('/api/temp-zone-seizures/candidates?preset_id=1')).json();
    const byId = Object.fromEntries(d.presets.map(p => [p.id, p]));
    expect(byId[2].active).toBe(false);
  });

  it('מקטע שנסגר, ועמדה שמעולם לא נכנסה - false ולא null', async () => {
    await pool.query(`INSERT INTO station_sessions (preset_id, exited_at, last_seen) VALUES (3, NOW(), NOW())`);
    const d = await (await get('/api/temp-zone-seizures/candidates?preset_id=1')).json();
    const byId = Object.fromEntries(d.presets.map(p => [p.id, p]));
    // null היה שקול ל"לא ידוע" בלקוח (`active === false`) והסימון לא היה מופיע
    expect(byId[3].active).toBe(false);
    expect(byId[4].active).toBe(false);
  });

  it('עמדה מאוחדת נושאת את שם העמדה שמכסה אותה', async () => {
    await pool.query(`INSERT INTO position_merges (covering_preset_id, covered_preset_id) VALUES (2, 3)`);
    const d = await (await get('/api/temp-zone-seizures/candidates?preset_id=1')).json();
    const byId = Object.fromEntries(d.presets.map(p => [p.id, p]));
    expect(byId[3].merged_into_name).toBe('מגדל א');
    expect(byId[2].merged_into_name).toBeNull();   // היא המכסה, לא המכוסה
  });

  it('איחוד שהסתיים אינו נספר - העמדה חזרה לעצמה', async () => {
    await pool.query(`INSERT INTO position_merges (covering_preset_id, covered_preset_id, ended_at) VALUES (2, 3, NOW())`);
    const d = await (await get('/api/temp-zone-seizures/candidates?preset_id=1')).json();
    const byId = Object.fromEntries(d.presets.map(p => [p.id, p]));
    expect(byId[3].merged_into_name).toBeNull();
  });

  it('מצב העמדה אינו מכפיל שורות ואינו מסתיר אף עמדה', async () => {
    await pool.query(`INSERT INTO station_sessions (preset_id) VALUES (2)`);
    await pool.query(`INSERT INTO position_merges (covering_preset_id, covered_preset_id) VALUES (2, 3)`);
    const d = await (await get('/api/temp-zone-seizures/candidates?preset_id=1')).json();
    expect(d.presets).toHaveLength(3);   // 2, 3, 4 - היוצרת (1) לעולם לא
  });

  it('מחזירה את האזורים ובלוקי הגובה של כל מפה מעוגנת', async () => {
    const z = await pool.query(`INSERT INTO map_zones (map_id, name, polygon) VALUES (1, 'אזור צפון', '[]') RETURNING id`);
    await pool.query(`INSERT INTO zone_altitude_ranges (zone_id, alt_min, alt_max) VALUES ($1, 100, 140)`, [z.rows[0].id]);
    const d = await (await get('/api/temp-zone-seizures/candidates?preset_id=1')).json();
    expect(d.zones['1']).toHaveLength(1);
    expect(d.zones['1'][0].bands).toEqual([{ lo: 100, hi: 140 }]);
    expect(d.maps['1'].anchor1_lat).toBeCloseTo(32.5, 4);
  });
});

describe('אישור עמדה ודיווח', () => {
  it('אישור נרשם עם ההערה והשעה', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    const res = await patch(`/api/temp-zone-seizures/${s.id}/ack`, { preset_id: 2, note: 'פיניתי שניים' });
    expect(res.status).toBe(200);
    const row = (await pool.query(`SELECT * FROM temp_zone_seizure_targets WHERE seizure_id=$1 AND preset_id=2`, [s.id])).rows[0];
    expect(row.acked).toBe(true);
    expect(row.ack_note).toBe('פיניתי שניים');
    expect(row.acked_at).not.toBeNull();
  });

  it('עמדה שאינה יעד אינה יכולה לאשר', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody({ target_preset_ids: [2] }))).json();
    expect((await patch(`/api/temp-zone-seizures/${s.id}/ack`, { preset_id: 3 })).status).toBe(404);
  });

  it('דיווח העמדה על עצמה נשמר - מספר פ"מים ושמות אזורים', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    await patch(`/api/temp-zone-seizures/${s.id}/report`, { preset_id: 2, pins_in_zone: 3, affected_zone_names: ['צפון', 'מרכז'] });
    const row = (await pool.query(`SELECT * FROM temp_zone_seizure_targets WHERE seizure_id=$1 AND preset_id=2`, [s.id])).rows[0];
    expect(row.pins_in_zone).toBe(3);
    expect(row.affected_zone_names).toEqual(['צפון', 'מרכז']);
  });

  it('טופס האישורים מחזיר את שמות העמדות', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    const rows = await (await get(`/api/temp-zone-seizures/${s.id}/targets`)).json();
    expect(rows.map(r => r.preset_name).sort()).toEqual(['מגדל א', 'מגדל ב']);
  });

  // היוצר מסתכל על טופס האישורים כשהוא מחליט אם להרים טלפון. "לא אושר" מול
  // עמדה שאיש אינו יושב בה אינו אותו מצב כמו "לא אושר" מעמדה מאוישת, ובלי
  // ההבחנה הזו הוא מחייג לחדר ריק.
  it('טופס האישורים מחזיר את מצב העמדה - מאוישת מול לא פעילה', async () => {
    await pool.query(`INSERT INTO station_sessions (preset_id, last_seen) VALUES (2, NOW())`);
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    const rows = await (await get(`/api/temp-zone-seizures/${s.id}/targets`)).json();
    const by = Object.fromEntries(rows.map(r => [r.preset_id, r]));
    expect(by[2].active).toBe(true);
    expect(by[3].active).toBe(false);
  });

  it('טופס האישורים נושא את שם העמדה המכסה בעמדה מאוחדת', async () => {
    await pool.query(`INSERT INTO position_merges (covering_preset_id, covered_preset_id) VALUES (2, 3)`);
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    const rows = await (await get(`/api/temp-zone-seizures/${s.id}/targets`)).json();
    const by = Object.fromEntries(rows.map(r => [r.preset_id, r]));
    expect(by[3].merged_into_name).toBe('מגדל א');
    expect(by[2].merged_into_name).toBeNull();
  });

  // אותו כשל שנתפס ב-candidates: JOIN למקטעים ולאיחודים שמכפיל שורות היה
  // מציג את אותה עמדה פעמיים בטופס, והיוצר היה סופר אישורים שלא קיימים.
  it('מצב העמדה אינו מכפיל שורות בטופס האישורים', async () => {
    await pool.query(`INSERT INTO station_sessions (preset_id) VALUES (2)`);
    await pool.query(`INSERT INTO position_merges (covering_preset_id, covered_preset_id) VALUES (2, 3)`);
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    const rows = await (await get(`/api/temp-zone-seizures/${s.id}/targets`)).json();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(r => r.preset_id)).size).toBe(2);
  });
});

describe('הארכה וסיום', () => {
  it('הארכה מעדכנת את זמן הסיום המשוער', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    const eta = '2030-01-01T10:00:00.000Z';
    const res = await patch(`/api/temp-zone-seizures/${s.id}/extend`, { eta_end: eta });
    expect(res.status).toBe(200);
    expect(new Date((await res.json()).eta_end).toISOString()).toBe(eta);
  });

  it('זמן לא תקין נדחה', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    expect((await patch(`/api/temp-zone-seizures/${s.id}/extend`, { eta_end: 'לא תאריך' })).status).toBe(400);
  });

  it('סיום מסמן ended ואינו מוחק את השורה', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    await patch(`/api/temp-zone-seizures/${s.id}/end`, { preset_id: 1 });
    const row = (await pool.query(`SELECT status, ended_at FROM temp_zone_seizures WHERE id=$1`, [s.id])).rows[0];
    expect(row.status).toBe('ended');
    expect(row.ended_at).not.toBeNull();
  });

  it('סיום כפול נדחה - אין מה לסיים פעמיים', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    await patch(`/api/temp-zone-seizures/${s.id}/end`, { preset_id: 1 });
    expect((await patch(`/api/temp-zone-seizures/${s.id}/end`, { preset_id: 1 })).status).toBe(404);
  });

  it('אחרי הסיום היעד מקבל את הודעת "יצאה מתוקף", והיוצר כבר לא רואה אותה כפעילה', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    await patch(`/api/temp-zone-seizures/${s.id}/end`, { preset_id: 1 });

    const forTarget = await (await get('/api/temp-zone-seizures?preset_id=2')).json();
    expect(forTarget).toHaveLength(1);
    expect(forTarget[0].status).toBe('ended');
    expect(forTarget[0].my_seen_end).toBe(false);

    expect(await (await get('/api/temp-zone-seizures?preset_id=1')).json()).toHaveLength(0);
  });

  it('אחרי שהעמדה ראתה את הודעת הסיום - היא לא חוזרת', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    await patch(`/api/temp-zone-seizures/${s.id}/end`, { preset_id: 1 });
    await patch(`/api/temp-zone-seizures/${s.id}/seen-end`, { preset_id: 2 });
    expect(await (await get('/api/temp-zone-seizures?preset_id=2')).json()).toHaveLength(0);
    // ולעמדה השנייה כן - כל עמדה והמסירה שלה
    expect(await (await get('/api/temp-zone-seizures?preset_id=3')).json()).toHaveLength(1);
  });

  it('סיום מאפס seen_end - עמדה שראתה סיום קודם תראה גם את זה', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    await pool.query(`UPDATE temp_zone_seizure_targets SET seen_end = true WHERE seizure_id = $1`, [s.id]);
    await patch(`/api/temp-zone-seizures/${s.id}/end`, { preset_id: 1 });
    const rows = (await pool.query(`SELECT seen_end FROM temp_zone_seizure_targets WHERE seizure_id=$1`, [s.id])).rows;
    expect(rows.every(r => r.seen_end === false)).toBe(true);
  });

  it('מחיקת ההלאמה = סיום, לא מחיקת שורה', async () => {
    const s = await (await post('/api/temp-zone-seizures', seizureBody())).json();
    await req('DELETE', `/api/temp-zone-seizures/${s.id}`);
    const row = (await pool.query(`SELECT status FROM temp_zone_seizures WHERE id=$1`, [s.id])).rows[0];
    expect(row.status).toBe('ended');
  });
});
