// **ניהול נהגים, אישורי כניסה וניהול נסיעות** - מול Postgres אמיתי (PGlite בזיכרון).
//
// למה מול DB אמיתי ולא mock של pool: הטענות כאן הן על מה ש**יושב ב-DB** -
// שת"ז כפולה בשדה נדחית אבל שתי רשומות בלי ת"ז מותרות (אינדקס חלקי), שכתיבת
// אזורים היא החלפה מלאה ולא diff שמשאיר הרשאה ישנה, שרכב "לא קבוע" לא שומר
// מספר רישוי, ושמחיקת נהג גוררת את רכביו ונסיעותיו. אלה טענות על הסכמה ועל
// ה-SQL, ו-mock היה מאשר אותן בלי לבדוק כלום.
//
// ה-DDL כאן זהה לזה שב-server/db/init.js.
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

// הבדיקות כאן מרימות **Postgres אמיתי** (PGlite) ומריצות מולו שאילתות
// וחישוב גרף. חמש השניות של ברירת המחדל מספיקות בבידוד ולא בריצה המלאה
// המקבילה, ושם הן הפילו את הקובץ באקראי - כלומר הפכו חוסר-מזל לכשל.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base, router;

const req = (method, path, body) => fetch(`${base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const get = (p) => req('GET', p);
const post = (p, b) => req('POST', p, b);
const put = (p, b) => req('PUT', p, b);
const del = (p) => req('DELETE', p);

const AF = 1;
const driver = (over = {}) => ({
  airfield_id: AF, first_name: 'דני', last_name: 'כהן', national_id: '012345678',
  permit_from: '2026-01-01', permit_until: '2026-12-31', approved_by: 'רס"ן לוי', ...over,
});

beforeAll(async () => {
  // חייב להיקבע **לפני** ייבוא pool.js: הבחירה בין Neon למאגר המקומי נעשית
  // בזמן טעינת המודול.
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';

  ({ default: pool } = await import('../db/pool.js'));
  ({ default: router } = await import('./permits.js'));
  const { listen } = await import('../listen.js');

  await pool.query(`CREATE TABLE public.airfields (
    id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL)`);
  await pool.query(`CREATE TABLE public.airfield_polygons (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL DEFAULT '')`);
  await pool.query(`CREATE TABLE public.airfield_points (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL)`);
  await pool.query(`CREATE TABLE public.vehicle_requests (
    id SERIAL PRIMARY KEY, driver_name VARCHAR(200), status VARCHAR(20) DEFAULT 'pending')`);

  await pool.query(`CREATE TABLE public.airfield_permit_params (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL DEFAULT 'zone',
    name VARCHAR(200) NOT NULL,
    polygon_id INTEGER REFERENCES airfield_polygons(id) ON DELETE SET NULL,
    color VARCHAR(20) DEFAULT '#3b82f6',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE UNIQUE INDEX idx_permit_params_af_kind_name ON airfield_permit_params(airfield_id, kind, name)`);

  await pool.query(`CREATE TABLE public.entry_permit_drivers (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL DEFAULT '',
    last_name VARCHAR(100) NOT NULL DEFAULT '',
    national_id VARCHAR(20) NOT NULL DEFAULT '',
    transport_role_id INTEGER REFERENCES airfield_permit_params(id) ON DELETE SET NULL,
    permit_from DATE, permit_until DATE,
    status_override VARCHAR(20) DEFAULT NULL,
    notes TEXT,
    approved_by VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE UNIQUE INDEX idx_entry_permit_drivers_af_tz ON entry_permit_drivers(airfield_id, national_id) WHERE national_id <> ''`);

  await pool.query(`CREATE TABLE public.entry_permit_driver_zones (
    driver_id INTEGER NOT NULL REFERENCES entry_permit_drivers(id) ON DELETE CASCADE,
    zone_id INTEGER NOT NULL REFERENCES airfield_permit_params(id) ON DELETE CASCADE,
    PRIMARY KEY (driver_id, zone_id))`);

  await pool.query(`CREATE TABLE public.entry_permit_vehicles (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES entry_permit_drivers(id) ON DELETE CASCADE,
    vehicle_type_id INTEGER REFERENCES airfield_permit_params(id) ON DELETE SET NULL,
    plate_fixed BOOLEAN NOT NULL DEFAULT TRUE,
    plate_number VARCHAR(30) NOT NULL DEFAULT '',
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW())`);

  // זהה ל-init.js אחרי הרחבת "ניהול נסיעות": driver_id nullable (נהג מזדמן
  // שאינו במרשם), ו-airfield_id כדי לשלוף את נסיעות השדה בלי לעבור דרך הנהג.
  await pool.query(`CREATE TABLE public.entry_permit_trips (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    driver_id INTEGER REFERENCES entry_permit_drivers(id) ON DELETE CASCADE,
    vehicle_id INTEGER REFERENCES entry_permit_vehicles(id) ON DELETE SET NULL,
    from_point_id INTEGER REFERENCES airfield_points(id) ON DELETE SET NULL,
    to_point_id INTEGER REFERENCES airfield_points(id) ON DELETE SET NULL,
    from_text VARCHAR(200) NOT NULL DEFAULT '',
    to_text VARCHAR(200) NOT NULL DEFAULT '',
    scheduled_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, purpose TEXT,
    vehicle_request_id INTEGER REFERENCES vehicle_requests(id) ON DELETE SET NULL,
    driver_name VARCHAR(120) NOT NULL DEFAULT '',
    driver_phone VARCHAR(40) NOT NULL DEFAULT '',
    requester_name VARCHAR(120) NOT NULL DEFAULT '',
    requester_phone VARCHAR(40) NOT NULL DEFAULT '',
    vehicle_name VARCHAR(120) NOT NULL DEFAULT '',
    vehicle_type_id INTEGER REFERENCES airfield_permit_params(id) ON DELETE SET NULL,
    trip_type_id INTEGER REFERENCES airfield_permit_params(id) ON DELETE SET NULL,
    icon VARCHAR(16) NOT NULL DEFAULT '',
    stops JSONB DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    note TEXT,
    escorts JSONB DEFAULT '[]',
    roam_permit_id INTEGER REFERENCES airfield_permit_params(id) ON DELETE SET NULL,
    suggested_route_ids JSONB DEFAULT '[]',
    route_options JSONB DEFAULT '[]',
    selected_route_ids JSONB DEFAULT '[]',
    selected_route_label VARCHAR(300) NOT NULL DEFAULT '',
    driver_ack_at TIMESTAMPTZ,
    pending_change JSONB,
    pending_change_at TIMESTAMPTZ,
    departure_alerted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW())`);

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
  await pool.query('DELETE FROM entry_permit_trips');
  await pool.query('DELETE FROM entry_permit_vehicles');
  await pool.query('DELETE FROM entry_permit_driver_zones');
  await pool.query('DELETE FROM entry_permit_drivers');
  await pool.query('DELETE FROM airfield_permit_params');
  await pool.query('DELETE FROM airfield_points');
  await pool.query('DELETE FROM airfield_polygons');
  await pool.query('DELETE FROM vehicle_requests');
  await pool.query('DELETE FROM airfields');
  await pool.query(`INSERT INTO airfields (id, name) VALUES (1, 'שדה א'), (2, 'שדה ב')`);
  await pool.query(`INSERT INTO airfield_polygons (id, airfield_id, name) VALUES (10, 1, 'מנשא צפוני')`);
  await pool.query(`INSERT INTO airfield_points (id, airfield_id, name) VALUES (20, 1, 'שער ראשי'), (21, 1, 'מסוף מטען')`);
  await pool.query(`INSERT INTO airfield_permit_params (id, airfield_id, kind, name, polygon_id) VALUES
    (100, 1, 'zone', 'מנשא צפוני', 10),
    (101, 1, 'zone', 'אזור דלק', NULL),
    (102, 1, 'transport_role', 'הסעת צוותי אוויר', NULL),
    (103, 1, 'vehicle_type', 'מיניבוס', NULL),
    (104, 1, 'trip_type', 'הסעת אח"מ', NULL),
    (105, 1, 'roam_permit', 'ליווי צמוד', NULL)`);
});

describe('פרמטרים של השדה', () => {
  it('נטענים לפי סוג, ואזור מצורף לשם הפוליגון שלו', async () => {
    const rows = await (await get('/api/permit-params?airfield_id=1&kind=zone')).json();
    expect(rows.map(r => r.name)).toEqual(['אזור דלק', 'מנשא צפוני']);
    expect(rows.find(r => r.name === 'מנשא צפוני').polygon_name).toBe('מנשא צפוני');
  });

  it('בלי airfield_id מוחזרת רשימה ריקה ולא כל הפרמטרים של כל השדות', async () => {
    expect(await (await get('/api/permit-params')).json()).toEqual([]);
  });

  it('שם כפול באותו שדה ואותו סוג נדחה ב-409', async () => {
    expect((await post('/api/permit-params', { airfield_id: 1, kind: 'zone', name: 'אזור דלק' })).status).toBe(409);
  });

  it('אותו שם מותר בסוג אחר ובשדה אחר', async () => {
    expect((await post('/api/permit-params', { airfield_id: 1, kind: 'vehicle_type', name: 'אזור דלק' })).status).toBe(201);
    expect((await post('/api/permit-params', { airfield_id: 2, kind: 'zone', name: 'אזור דלק' })).status).toBe(201);
  });

  it('קישור לפוליגון נשמר לאזור בלבד', async () => {
    const role = await (await post('/api/permit-params', { airfield_id: 1, kind: 'transport_role', name: 'הסעת מטען', polygon_id: 10 })).json();
    expect(role.polygon_id).toBeNull();
  });

  it('שם ריק נדחה', async () => {
    expect((await post('/api/permit-params', { airfield_id: 1, kind: 'zone', name: '  ' })).status).toBe(400);
  });
});

describe('מרשם הנהגים', () => {
  it('נשמר ונטען עם האזורים והרכבים', async () => {
    const created = await (await post('/api/entry-permits', driver({ zone_ids: [100, 101], transport_role_id: 102 }))).json();
    expect(created.id).toBeTruthy();
    expect(created.zones.map(z => z.name).sort()).toEqual(['אזור דלק', 'מנשא צפוני']);
    expect(created.transport_role_name).toBe('הסעת צוותי אוויר');
    expect(created.vehicles).toEqual([]);

    const [row] = await (await get('/api/entry-permits?airfield_id=1')).json();
    expect(row.national_id).toBe('012345678');
    expect(row.approved_by).toBe('רס"ן לוי');
  });

  it('ת"ז כפולה באותו שדה נדחית ב-409 ולא יוצרת שורה שנייה', async () => {
    await post('/api/entry-permits', driver());
    expect((await post('/api/entry-permits', driver({ first_name: 'אחר' }))).status).toBe(409);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM entry_permit_drivers');
    expect(rows[0].n).toBe(1);
  });

  it('אותה ת"ז מותרת בשדה אחר', async () => {
    await post('/api/entry-permits', driver());
    expect((await post('/api/entry-permits', driver({ airfield_id: 2 }))).status).toBe(201);
  });

  it('שתי רשומות בלי ת"ז מותרות - האינדקס חלקי', async () => {
    expect((await post('/api/entry-permits', driver({ national_id: '' }))).status).toBe(201);
    expect((await post('/api/entry-permits', driver({ national_id: '', first_name: 'שני' }))).status).toBe(201);
  });

  it('רשומה בלי שם כלל נדחית', async () => {
    expect((await post('/api/entry-permits', driver({ first_name: '', last_name: '' }))).status).toBe(400);
  });

  it('רשימת השדה מכילה רק את נהגיו', async () => {
    await post('/api/entry-permits', driver());
    await post('/api/entry-permits', driver({ airfield_id: 2, national_id: '999' }));
    const rows = await (await get('/api/entry-permits?airfield_id=1')).json();
    expect(rows).toHaveLength(1);
  });

  it('עדכון חלקי לא מוחק שדות שלא נשלחו, ומקדם את updated_at', async () => {
    const d = await (await post('/api/entry-permits', driver({ notes: 'הערה מקורית' }))).json();
    const before = await pool.query('SELECT updated_at FROM entry_permit_drivers WHERE id=$1', [d.id]);
    const updated = await (await put(`/api/entry-permits/${d.id}`, { first_name: 'רון' })).json();
    expect(updated.first_name).toBe('רון');
    expect(updated.last_name).toBe('כהן');
    expect(updated.notes).toBe('הערה מקורית');
    expect(updated.approved_by).toBe('רס"ן לוי');
    const after = await pool.query('SELECT updated_at FROM entry_permit_drivers WHERE id=$1', [d.id]);
    expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before.rows[0].updated_at).getTime());
  });

  it('דריסת סטטוס נשמרת, ומחרוזת ריקה מנקה אותה בחזרה לאוטומטי', async () => {
    const d = await (await post('/api/entry-permits', driver({ status_override: 'rejected' }))).json();
    expect(d.status_override).toBe('rejected');
    const cleared = await (await put(`/api/entry-permits/${d.id}`, { status_override: '' })).json();
    expect(cleared.status_override).toBeNull();
  });

  it('כתיבת אזורים היא החלפה מלאה - הרשאה שהוסרה נעלמת', async () => {
    const d = await (await post('/api/entry-permits', driver({ zone_ids: [100, 101] }))).json();
    const after = await (await put(`/api/entry-permits/${d.id}`, { zone_ids: [101] })).json();
    expect(after.zones.map(z => z.id)).toEqual([101]);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM entry_permit_driver_zones WHERE driver_id=$1', [d.id]);
    expect(rows[0].n).toBe(1);
  });

  it('רשימת אזורים ריקה מנקה את כל ההרשאות', async () => {
    const d = await (await post('/api/entry-permits', driver({ zone_ids: [100, 101] }))).json();
    const after = await (await put(`/api/entry-permits/${d.id}`, { zone_ids: [] })).json();
    expect(after.zones).toEqual([]);
  });

  it('אזורים שלא נשלחו כלל בעדכון נשארים כפי שהם', async () => {
    const d = await (await post('/api/entry-permits', driver({ zone_ids: [100] }))).json();
    const after = await (await put(`/api/entry-permits/${d.id}`, { first_name: 'רון' })).json();
    expect(after.zones.map(z => z.id)).toEqual([100]);
  });

  it('נהג שאינו קיים מחזיר 404 ולא 500', async () => {
    expect((await get('/api/entry-permits/9999')).status).toBe(404);
    expect((await put('/api/entry-permits/9999', { first_name: 'x' })).status).toBe(404);
  });
});

describe('רכבים תחת הנהג', () => {
  it('נשמר עם סוג הרכב ומצטרף לרשומת הנהג', async () => {
    const d = await (await post('/api/entry-permits', driver())).json();
    await post(`/api/entry-permits/${d.id}/vehicles`, { vehicle_type_id: 103, plate_fixed: true, plate_number: '12-345-67' });
    const full = await (await get(`/api/entry-permits/${d.id}`)).json();
    expect(full.vehicles).toHaveLength(1);
    expect(full.vehicles[0].vehicle_type_name).toBe('מיניבוס');
    expect(full.vehicles[0].plate_number).toBe('12-345-67');
  });

  it('רכב לא קבוע אינו שומר מספר רישוי - גם אם נשלח', async () => {
    const d = await (await post('/api/entry-permits', driver())).json();
    const v = await (await post(`/api/entry-permits/${d.id}/vehicles`, { plate_fixed: false, plate_number: '12-345-67' })).json();
    expect(v.plate_fixed).toBe(false);
    expect(v.plate_number).toBe('');
  });

  it('מעבר מקבוע ללא קבוע מנקה את הרישוי שהיה', async () => {
    const d = await (await post('/api/entry-permits', driver())).json();
    const v = await (await post(`/api/entry-permits/${d.id}/vehicles`, { plate_fixed: true, plate_number: '11-222-33' })).json();
    const upd = await (await put(`/api/entry-permit-vehicles/${v.id}`, { plate_fixed: false, plate_number: '11-222-33' })).json();
    expect(upd.plate_number).toBe('');
  });

  it('מחיקת נהג גוררת את רכביו', async () => {
    const d = await (await post('/api/entry-permits', driver())).json();
    await post(`/api/entry-permits/${d.id}/vehicles`, { plate_fixed: true, plate_number: '1' });
    await del(`/api/entry-permits/${d.id}`);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM entry_permit_vehicles');
    expect(rows[0].n).toBe(0);
  });
});

describe('נסיעות', () => {
  const mkDriver = async () => (await (await post('/api/entry-permits', driver())).json()).id;

  it('נשמרת עם נקודות השדה ומוחזרת עם שמותיהן', async () => {
    const id = await mkDriver();
    await post(`/api/entry-permits/${id}/trips`, {
      from_point_id: 20, to_point_id: 21, scheduled_at: '2026-10-01T08:00:00.000Z', purpose: 'פריקת מטען',
    });
    const [t] = await (await get(`/api/entry-permits/${id}/trips`)).json();
    expect(t.from_point_name).toBe('שער ראשי');
    expect(t.to_point_name).toBe('מסוף מטען');
    expect(t.purpose).toBe('פריקת מטען');
  });

  it('יעד מחוץ לרשימת הנקודות נשמר כטקסט חופשי', async () => {
    const id = await mkDriver();
    await post(`/api/entry-permits/${id}/trips`, { from_text: 'בסיס אחר', to_text: 'מוסך חיצוני' });
    const [t] = await (await get(`/api/entry-permits/${id}/trips`)).json();
    expect(t.from_point_name).toBeNull();
    expect(t.from_text).toBe('בסיס אחר');
    expect(t.to_text).toBe('מוסך חיצוני');
  });

  it('מוחזרות מהחדשה לישנה, כדי שההיסטוריה והעתיד ייחתכו בצד הלקוח', async () => {
    const id = await mkDriver();
    await post(`/api/entry-permits/${id}/trips`, { scheduled_at: '2026-01-01T08:00:00.000Z', purpose: 'ישנה' });
    await post(`/api/entry-permits/${id}/trips`, { scheduled_at: '2026-12-01T08:00:00.000Z', purpose: 'עתידית' });
    const rows = await (await get(`/api/entry-permits/${id}/trips`)).json();
    expect(rows.map(r => r.purpose)).toEqual(['עתידית', 'ישנה']);
  });

  it('נסיעה שנרשמה מבקשת כניסה נושאת את הקישור אליה', async () => {
    const id = await mkDriver();
    const { rows } = await pool.query(`INSERT INTO vehicle_requests (driver_name) VALUES ('דני כהן') RETURNING id`);
    await post(`/api/entry-permits/${id}/trips`, { vehicle_request_id: rows[0].id, scheduled_at: '2026-09-10T08:00:00.000Z' });
    const [t] = await (await get(`/api/entry-permits/${id}/trips`)).json();
    expect(t.vehicle_request_id).toBe(rows[0].id);
    expect(t.request_status).toBe('pending');
  });

  it('רכב שנמחק לא מוחק את הנסיעה - ההיסטוריה נשמרת', async () => {
    const id = await mkDriver();
    const v = await (await post(`/api/entry-permits/${id}/vehicles`, { plate_fixed: true, plate_number: '5' })).json();
    await post(`/api/entry-permits/${id}/trips`, { vehicle_id: v.id, scheduled_at: '2026-09-01T08:00:00.000Z' });
    await del(`/api/entry-permit-vehicles/${v.id}`);
    const rows = await (await get(`/api/entry-permits/${id}/trips`)).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].vehicle_id).toBeNull();
  });

  it('מחיקת נהג גוררת את נסיעותיו', async () => {
    const id = await mkDriver();
    await post(`/api/entry-permits/${id}/trips`, { scheduled_at: '2026-09-01T08:00:00.000Z' });
    await del(`/api/entry-permits/${id}`);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM entry_permit_trips');
    expect(rows[0].n).toBe(0);
  });

  it('עדכון בלי שדות נדחה ב-400 ולא מייצר SQL שבור', async () => {
    const id = await mkDriver();
    const t = await (await post(`/api/entry-permits/${id}/trips`, { to_text: 'x' })).json();
    expect((await put(`/api/entry-permit-trips/${t.id}`, {})).status).toBe(400);
  });
});

describe('מחיקת פרמטר', () => {
  it('אזור שנמחק נעלם גם מהרשאות הנהגים', async () => {
    const d = await (await post('/api/entry-permits', driver({ zone_ids: [100, 101] }))).json();
    await del('/api/permit-params/100');
    const full = await (await get(`/api/entry-permits/${d.id}`)).json();
    expect(full.zones.map(z => z.id)).toEqual([101]);
  });

  it('סוג רכב שנמחק משאיר את הרכב, בלי סוג', async () => {
    const d = await (await post('/api/entry-permits', driver())).json();
    await post(`/api/entry-permits/${d.id}/vehicles`, { vehicle_type_id: 103, plate_fixed: true, plate_number: '7' });
    await del('/api/permit-params/103');
    const full = await (await get(`/api/entry-permits/${d.id}`)).json();
    expect(full.vehicles).toHaveLength(1);
    expect(full.vehicles[0].vehicle_type_id).toBeNull();
  });

  it('תפקיד הסעה שנמחק משאיר את הנהג, בלי תפקיד', async () => {
    const d = await (await post('/api/entry-permits', driver({ transport_role_id: 102 }))).json();
    await del('/api/permit-params/102');
    const full = await (await get(`/api/entry-permits/${d.id}`)).json();
    expect(full.transport_role_id).toBeNull();
  });
});

// ── ניהול נסיעות ─────────────────────────────────────────────────────────────
//
// הטענות כאן הן על מה שיושב ב-DB ועל ה-SQL עצמו: שנסיעה בלי נהג נשמרת ונמצאת,
// ששמות התחנות נפתרים בסדר הנכון גם כשנקודה נמחקה, שחלון ה-upcoming מסנן לפי
// הפרמטרים שהלקוח שלח, ושבקשת שינוי של הנהג **אינה** נוגעת בשורה עד שהמגדל
// מכריע בה. mock היה מאשר את כולן בלי לבדוק דבר.

const mkTripDriver = async (over = {}) =>
  (await (await post('/api/entry-permits', driver(over))).json()).id;

/** נסיעה בעוד N דקות (שלילי = כבר יצאה). */
const tripAt = mins => new Date(Date.now() + mins * 60_000).toISOString();

describe('ניהול נסיעות - רשימת השדה', () => {
  it('נסיעה נרשמת לשדה גם בלי נהג מהמרשם', async () => {
    const created = await (await post('/api/trips', {
      airfield_id: AF, driver_name: 'אורח', driver_phone: '050-1111111',
      vehicle_name: 'טנדר לבן', scheduled_at: tripAt(60),
    })).json();
    expect(created.driver_id).toBeNull();
    expect(created.airfield_id).toBe(AF);
    const rows = await (await get(`/api/trips?airfield_id=${AF}`)).json();
    expect(rows.map(r => r.vehicle_name)).toEqual(['טנדר לבן']);
  });

  it('בלי airfield_id היצירה נדחית ב-400', async () => {
    expect((await post('/api/trips', { vehicle_name: 'x' })).status).toBe(400);
  });

  it('בלי airfield_id בשאילתה מוחזרת רשימה ריקה ולא נסיעות של שדה אחר', async () => {
    await post('/api/trips', { airfield_id: AF, vehicle_name: 'א' });
    expect(await (await get('/api/trips')).json()).toEqual([]);
    expect(await (await get('/api/trips?airfield_id=2')).json()).toEqual([]);
  });

  // נסיעה בלי שדה לא הייתה נמצאת בחלון "ניהול נסיעות" - היא נשלפת לפי השדה
  it('נסיעה שנרשמה תחת נהג יורשת את השדה שלו', async () => {
    const id = await mkTripDriver();
    await post(`/api/entry-permits/${id}/trips`, { to_text: 'מסוף' });
    const rows = await (await get(`/api/trips?airfield_id=${AF}`)).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].driver_id).toBe(id);
    expect(rows[0].permit_driver_name).toBe('דני כהן');
  });
});

describe('ניהול נסיעות - תחנות ביניים', () => {
  it('שמות התחנות נפתרים לפי סדרן, ונקודה וטקסט חופשי מעורבים', async () => {
    const t = await (await post('/api/trips', {
      airfield_id: AF,
      stops: [{ point_id: 20, text: '' }, { point_id: null, text: 'שער דרומי' }, { point_id: 21, text: '' }],
    })).json();
    expect(t.stop_names).toEqual(['שער ראשי', 'שער דרומי', 'מסוף מטען']);
  });

  it('בלי תחנות מוחזר מערך ריק ולא null', async () => {
    const t = await (await post('/api/trips', { airfield_id: AF })).json();
    expect(t.stop_names).toEqual([]);
  });

  // נקודה שנמחקה מהשדה - השורה לא נעלמת, והתחנה מוחזרת כטקסט שנרשם לה
  it('תחנה שנקודתה נמחקה נופלת לטקסט שנרשם', async () => {
    const t = await (await post('/api/trips', {
      airfield_id: AF, stops: [{ point_id: 21, text: 'מסוף מטען' }],
    })).json();
    await pool.query('DELETE FROM airfield_points WHERE id=21');
    const again = await (await get(`/api/trips?airfield_id=${AF}`)).json();
    expect(again.find(x => x.id === t.id).stop_names).toEqual(['מסוף מטען']);
  });
});

describe('ניהול נסיעות - חלון ההתראה', () => {
  it('מחזיר רק נסיעות בתוך החלון שהלקוח ביקש', async () => {
    await post('/api/trips', { airfield_id: AF, vehicle_name: 'בתוך', scheduled_at: tripAt(4) });
    await post('/api/trips', { airfield_id: AF, vehicle_name: 'רחוק', scheduled_at: tripAt(45) });
    const rows = await (await get(`/api/trips?airfield_id=${AF}&scope=upcoming&within_minutes=10&stale_hours=12`)).json();
    expect(rows.map(r => r.vehicle_name)).toEqual(['בתוך']);
  });

  // נסיעה שאיחרה היא בדיוק זו שהפקח צריך לראות
  it('נסיעה שזמנה עבר נשארת בחלון עד ההתיישנות', async () => {
    await post('/api/trips', { airfield_id: AF, vehicle_name: 'איחרה', scheduled_at: tripAt(-90) });
    await post('/api/trips', { airfield_id: AF, vehicle_name: 'נשכחה', scheduled_at: tripAt(-60 * 20) });
    const rows = await (await get(`/api/trips?airfield_id=${AF}&scope=upcoming&within_minutes=10&stale_hours=12`)).json();
    expect(rows.map(r => r.vehicle_name)).toEqual(['איחרה']);
  });

  it('נסיעה שהסתיימה יורדת מהחלון', async () => {
    await post('/api/trips', { airfield_id: AF, vehicle_name: 'הסתיימה', scheduled_at: tripAt(3), status: 'ended' });
    const rows = await (await get(`/api/trips?airfield_id=${AF}&scope=upcoming&within_minutes=10&stale_hours=12`)).json();
    expect(rows).toEqual([]);
  });

  // בלי הסימון ההתראה עולה בכל poll, והפקח לומד להתעלם ממנה
  it('סימון ההתראה נשמר, והסימון הראשון אינו נדרס', async () => {
    const t = await (await post('/api/trips', { airfield_id: AF, scheduled_at: tripAt(2) })).json();
    const first = await (await post(`/api/entry-permit-trips/${t.id}/alerted`)).json();
    expect(first.departure_alerted_at).toBeTruthy();
    const second = await (await post(`/api/entry-permit-trips/${t.id}/alerted`)).json();
    expect(second.departure_alerted_at).toBe(first.departure_alerted_at);
  });

  it('סימון נסיעה שאינה קיימת מחזיר 404', async () => {
    expect((await post('/api/entry-permit-trips/9999/alerted')).status).toBe(404);
  });
});

describe('ניהול נסיעות - סטטוס וסוגים', () => {
  it('סטטוס לא מוכר נשמר כ"ממתין" ולא מזהם עמודה תפעולית', async () => {
    const t = await (await post('/api/trips', { airfield_id: AF, status: 'DROP TABLE' })).json();
    expect(t.status).toBe('pending');
    const upd = await (await put(`/api/entry-permit-trips/${t.id}`, { status: 'approved' })).json();
    expect(upd.status).toBe('approved');
  });

  it('סוג נסיעה וסוג אישור הסתובבות מצורפים בשמם', async () => {
    const t = await (await post('/api/trips', {
      airfield_id: AF, trip_type_id: 104, roam_permit_id: 105,
    })).json();
    expect(t.trip_type_name).toBe('הסעת אח"מ');
    expect(t.roam_permit_name).toBe('ליווי צמוד');
  });

  // סוג הרכב של הנסיעה גובר, ובהיעדרו נופלים לסוג של הרכב שבמרשם
  it('סוג הרכב נגזר מהנסיעה, ובהיעדרו מהרכב שבמרשם', async () => {
    const id = await mkTripDriver();
    const v = await (await post(`/api/entry-permits/${id}/vehicles`, {
      vehicle_type_id: 103, plate_fixed: true, plate_number: '12-345-67',
    })).json();
    const fromVehicle = await (await post(`/api/entry-permits/${id}/trips`, { vehicle_id: v.id })).json();
    expect(fromVehicle.vehicle_type_name).toBe('מיניבוס');
    const explicit = await (await put(`/api/entry-permit-trips/${fromVehicle.id}`, { vehicle_type_id: 104 })).json();
    expect(explicit.vehicle_type_name).toBe('הסעת אח"מ');
  });

  it('סוג נסיעה שנמחק משאיר את הנסיעה, בלי סוג', async () => {
    const t = await (await post('/api/trips', { airfield_id: AF, trip_type_id: 104 })).json();
    await del('/api/permit-params/104');
    const rows = await (await get(`/api/trips?airfield_id=${AF}`)).json();
    expect(rows.find(x => x.id === t.id).trip_type_id).toBeNull();
  });

  it('נלווים ואפשרויות נתיב נשמרים כמערכים, וזבל נשמר כמערך ריק', async () => {
    const t = await (await post('/api/trips', {
      airfield_id: AF,
      escorts: [{ name: 'דנה', national_id: '9' }],
      selected_route_ids: [3, 7],
      route_options: 'לא מערך',
    })).json();
    expect(t.escorts).toEqual([{ name: 'דנה', national_id: '9' }]);
    expect(t.selected_route_ids).toEqual([3, 7]);
    expect(t.route_options).toEqual([]);
  });
});

describe('ניהול נסיעות - אפליקציית הנהג', () => {
  const mkPhoneTrip = (over = {}) => post('/api/trips', {
    airfield_id: AF, driver_phone: '050-2222222', vehicle_name: 'מיניבוס',
    scheduled_at: tripAt(120), note: 'מקורי', ...over,
  }).then(r => r.json());

  // אסימון הנהג אינו זהות אישית, ולכן בלי מזהה מפורש אין רשימה
  it('בלי טלפון או ת"ז הבקשה נדחית ב-400', async () => {
    expect((await get('/api/driver-trips')).status).toBe(400);
  });

  it('מחזיר את נסיעות הטלפון בלבד', async () => {
    await mkPhoneTrip();
    await mkPhoneTrip({ driver_phone: '050-3333333', vehicle_name: 'אחר' });
    const rows = await (await get('/api/driver-trips?phone=050-2222222')).json();
    expect(rows.map(r => r.vehicle_name)).toEqual(['מיניבוס']);
  });

  it('מחזיר גם לפי ת"ז של נהג מהמרשם', async () => {
    const id = await mkTripDriver();
    await post(`/api/entry-permits/${id}/trips`, { vehicle_name: 'רכב המרשם' });
    const rows = await (await get('/api/driver-trips?national_id=012345678')).json();
    expect(rows.map(r => r.vehicle_name)).toEqual(['רכב המרשם']);
  });

  it('נסיעה שהסתיימה אינה מוחזרת לנהג', async () => {
    await mkPhoneTrip({ status: 'ended' });
    expect(await (await get('/api/driver-trips?phone=050-2222222')).json()).toEqual([]);
  });

  it('אישור הנהג נרשם ואינו משנה את הסטטוס - הסטטוס הוא הכרעת המגדל', async () => {
    const t = await mkPhoneTrip();
    const acked = await (await post(`/api/driver-trips/${t.id}/ack`)).json();
    expect(acked.driver_ack_at).toBeTruthy();
    expect(acked.status).toBe('pending');
  });

  // הנסיעה לא יכולה להשתנות מתחת לידי המגדל אם הוא עומד לדחות
  it('בקשת שינוי נשמרת בצד ואינה נוגעת בשורה', async () => {
    const t = await mkPhoneTrip();
    const after = await (await post(`/api/driver-trips/${t.id}/change`, {
      scheduled_at: tripAt(200), note: 'מאחר בשעה',
    })).json();
    expect(after.note).toBe('מקורי');
    expect(after.scheduled_at).toBe(t.scheduled_at);
    expect(after.pending_change.note).toBe('מאחר בשעה');
    expect(after.pending_change_at).toBeTruthy();
  });

  it('בקשה ריקה נדחית ב-400', async () => {
    const t = await mkPhoneTrip();
    expect((await post(`/api/driver-trips/${t.id}/change`, {})).status).toBe(400);
  });

  // הנהג אינו מאשר לעצמו נסיעה דרך שדה שלא נועד לו
  it('שדות שאינם ברשימת ההיתר אינם נכנסים לבקשה', async () => {
    const t = await mkPhoneTrip();
    const after = await (await post(`/api/driver-trips/${t.id}/change`, {
      note: 'בסדר', status: 'approved', driver_phone: '050-9999999',
    })).json();
    expect(Object.keys(after.pending_change)).toEqual(['note']);
  });

  it('אישור המגדל מחיל את השינוי ומנקה את ההמתנה', async () => {
    const t = await mkPhoneTrip();
    const when = tripAt(200);
    await post(`/api/driver-trips/${t.id}/change`, { scheduled_at: when, note: 'מאחר' });
    const after = await (await post(`/api/entry-permit-trips/${t.id}/change/approve`)).json();
    expect(after.note).toBe('מאחר');
    expect(new Date(after.scheduled_at).toISOString()).toBe(when);
    expect(after.pending_change).toBeNull();
    expect(after.pending_change_at).toBeNull();
  });

  it('דחיית המגדל זורקת את השינוי ומשאירה את הנסיעה כפי שהייתה', async () => {
    const t = await mkPhoneTrip();
    await post(`/api/driver-trips/${t.id}/change`, { note: 'מאחר' });
    const after = await (await post(`/api/entry-permit-trips/${t.id}/change/reject`)).json();
    expect(after.note).toBe('מקורי');
    expect(after.pending_change).toBeNull();
  });

  // הכרעה בנסיעה שנמחקה בינתיים אינה יוצרת שורה חדשה
  it('הכרעה בנסיעה שאינה קיימת מחזירה 404', async () => {
    expect((await post('/api/entry-permit-trips/9999/change/approve')).status).toBe(404);
    expect((await post('/api/driver-trips/9999/ack')).status).toBe(404);
  });
});

describe('ניהול נסיעות - שכפול', () => {
  // כל מקור צריך ת"ז משלו - אחרת ה-POST השני נדחה ב-409 והנסיעה כלל לא נוצרת
  let tzSeq = 0;
  const mkSource = async (over = {}) => {
    const id = await mkTripDriver({ national_id: `01234567${tzSeq++}` });
    return await (await post(`/api/entry-permits/${id}/trips`, {
      vehicle_name: 'מיניבוס', vehicle_type_id: 103, trip_type_id: 104, icon: '🚐',
      from_point_id: 20, to_point_id: 21,
      stops: [{ point_id: 20, text: '' }, { point_id: null, text: 'שער דרומי' }],
      scheduled_at: tripAt(60), note: 'הערה', requester_name: 'יוסי',
      requester_phone: '08-1111111', driver_phone: '050-2222222',
      escorts: [{ name: 'דנה', national_id: '9' }], roam_permit_id: 105,
      selected_route_ids: [3, 7], selected_route_label: 'כיבוי -> תחילת 15',
      status: 'approved', ...over,
    })).json();
  };

  it('העותק נושא את כל פרטי הנסיעה', async () => {
    const src = await mkSource();
    const when = tripAt(60 * 24);
    const [copy] = await (await post('/api/trips/duplicate', { items: [{ id: src.id, scheduled_at: when }] })).json();
    expect(copy.id).not.toBe(src.id);
    expect(copy.vehicle_name).toBe('מיניבוס');
    expect(copy.trip_type_name).toBe('הסעת אח"מ');
    expect(copy.icon).toBe('🚐');
    expect(copy.driver_id).toBe(src.driver_id);
    expect(copy.airfield_id).toBe(AF);
    expect(copy.stop_names).toEqual(['שער ראשי', 'שער דרומי']);
    expect(copy.escorts).toEqual([{ name: 'דנה', national_id: '9' }]);
    expect(copy.roam_permit_name).toBe('ליווי צמוד');
    expect(copy.selected_route_label).toBe('כיבוי -> תחילת 15');
    expect(new Date(copy.scheduled_at).toISOString()).toBe(when);
  });

  // שכפול של נסיעה מאושרת שהיה גורר את האישור מוציא לשטח רכב שאיש לא אישר
  it('העותק אינו מאושר, גם כשהמקור מאושר', async () => {
    const src = await mkSource({ status: 'approved' });
    expect(src.status).toBe('approved');
    const [copy] = await (await post('/api/trips/duplicate', { items: [{ id: src.id, scheduled_at: tripAt(120) }] })).json();
    expect(copy.status).toBe('pending');
  });

  it('מצב חי של המקור אינו עובר לעותק', async () => {
    const src = await mkSource();
    await post(`/api/driver-trips/${src.id}/ack`);
    await post(`/api/driver-trips/${src.id}/change`, { note: 'מאחר' });
    await post(`/api/entry-permit-trips/${src.id}/alerted`);
    const [copy] = await (await post('/api/trips/duplicate', { items: [{ id: src.id, scheduled_at: tripAt(120) }] })).json();
    expect(copy.driver_ack_at).toBeNull();
    expect(copy.pending_change).toBeNull();
    expect(copy.departure_alerted_at).toBeNull();
    expect(copy.vehicle_request_id).toBeNull();
  });

  it('המקור אינו משתנה', async () => {
    const src = await mkSource();
    await post('/api/trips/duplicate', { items: [{ id: src.id, scheduled_at: tripAt(120) }] });
    const again = await (await get(`/api/trips?airfield_id=${AF}`)).json();
    const orig = again.find(t => t.id === src.id);
    expect(orig.status).toBe('approved');
    expect(new Date(orig.scheduled_at).toISOString()).toBe(new Date(src.scheduled_at).toISOString());
  });

  it('שכפול קבוצתי יוצר עותק לכל נסיעה שנבחרה', async () => {
    const a = await mkSource({ vehicle_name: 'רכב א' });
    const b = await mkSource({ vehicle_name: 'רכב ב' });
    const copies = await (await post('/api/trips/duplicate', {
      items: [{ id: a.id, scheduled_at: tripAt(200) }, { id: b.id, scheduled_at: tripAt(260) }],
    })).json();
    expect(copies).toHaveLength(2);
    expect(copies.map(c => c.vehicle_name).sort()).toEqual(['רכב א', 'רכב ב']);
    const all = await (await get(`/api/trips?airfield_id=${AF}`)).json();
    expect(all).toHaveLength(4);
  });

  it('כמה עותקים של אותה נסיעה, בזמנים שונים', async () => {
    const src = await mkSource();
    const copies = await (await post('/api/trips/duplicate', {
      items: [
        { id: src.id, scheduled_at: tripAt(100) },
        { id: src.id, scheduled_at: tripAt(130) },
        { id: src.id, scheduled_at: tripAt(160) },
      ],
    })).json();
    expect(copies).toHaveLength(3);
    expect(new Set(copies.map(c => c.id)).size).toBe(3);
  });

  it('נסיעה בלי מועד משוכפלת בלי מועד', async () => {
    const src = await mkSource({ scheduled_at: null });
    const [copy] = await (await post('/api/trips/duplicate', { items: [{ id: src.id, scheduled_at: null }] })).json();
    expect(copy.scheduled_at).toBeNull();
  });

  it('בלי פריטים הבקשה נדחית ב-400', async () => {
    expect((await post('/api/trips/duplicate', { items: [] })).status).toBe(400);
    expect((await post('/api/trips/duplicate', {})).status).toBe(400);
  });

  // שכפול קבוצתי שנפל באמצע היה משאיר חצי יום נסיעות
  it('מזהה שאינו קיים אינו יוצר עותק ואינו מפיל את השאר', async () => {
    const src = await mkSource();
    const copies = await (await post('/api/trips/duplicate', {
      items: [{ id: 9999, scheduled_at: tripAt(100) }, { id: src.id, scheduled_at: tripAt(100) }],
    })).json();
    expect(copies).toHaveLength(1);
  });
});
