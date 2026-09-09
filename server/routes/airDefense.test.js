// **הגנ"ש** - קטלוג המערכות מול Postgres אמיתי (PGlite בזיכרון).
//
// למה מול DB אמיתי ולא mock של pool: הטענות כאן הן על מה ש**יושב ב-DB** -
// שה-UPSERT של היעילות אינו מייצר שתי הערכות סותרות לאותו צמד, שמחיקת מערכת
// גוררת איתה את הערכותיה, ושמחיקת סוג איום שיש לו הערכות **נחסמת**. אלה
// טענות על הסכמה ועל ה-SQL, ו-mock היה מאשר אותן בלי לבדוק כלום.
//
// ה-DDL כאן זהה לזה שב-server/db/init.js (אותה תבנית כמו tempZoneSeizures.test.js).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

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

const radar = (over = {}) => ({
  name: 'מכ"ם גזרתי', kind: 'ground', range_nm: 120,
  detect_from_deg: 350, detect_to_deg: 20,
  track_from_deg: 355, track_to_deg: 15,
  alt_min: 0, alt_max: 400, ...over,
});

beforeAll(async () => {
  // חייב להיקבע **לפני** ייבוא pool.js: הבחירה בין Neon למאגר המקומי נעשית
  // בזמן טעינת המודול.
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';

  ({ default: pool } = await import('../db/pool.js'));
  ({ default: router } = await import('./airDefense.js'));
  const { listen } = await import('../listen.js');

  await pool.query(`CREATE TABLE public.ad_threat_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE public.ad_weapon_systems (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    kind VARCHAR(20) NOT NULL DEFAULT 'ground',
    range_nm NUMERIC,
    missile_type VARCHAR(120),
    guidance VARCHAR(20),
    sector_from_deg NUMERIC, sector_to_deg NUMERIC,
    alt_min INTEGER, alt_max INTEGER,
    color VARCHAR(20),
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE public.ad_sensor_systems (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    kind VARCHAR(20) NOT NULL DEFAULT 'ground',
    range_nm NUMERIC,
    detect_from_deg NUMERIC, detect_to_deg NUMERIC,
    track_from_deg NUMERIC, track_to_deg NUMERIC,
    alt_min INTEGER, alt_max INTEGER,
    color VARCHAR(20),
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW())`);
  for (const [table, parent] of [
    ['ad_weapon_effectiveness', 'ad_weapon_systems'],
    ['ad_sensor_effectiveness', 'ad_sensor_systems'],
  ]) {
    await pool.query(`CREATE TABLE public.${table} (
      id SERIAL PRIMARY KEY,
      system_id INTEGER NOT NULL REFERENCES ${parent}(id) ON DELETE CASCADE,
      threat_type_id INTEGER NOT NULL REFERENCES ad_threat_types(id) ON DELETE CASCADE,
      quality_pct SMALLINT NOT NULL DEFAULT 0 CHECK (quality_pct BETWEEN 0 AND 100),
      note TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (system_id, threat_type_id))`);
  }

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
  await pool.query('DELETE FROM ad_weapon_effectiveness');
  await pool.query('DELETE FROM ad_sensor_effectiveness');
  await pool.query('DELETE FROM ad_weapon_systems');
  await pool.query('DELETE FROM ad_sensor_systems');
  await pool.query('DELETE FROM ad_threat_types');
  await pool.query(`INSERT INTO ad_threat_types (id, name, sort_order) VALUES
    (1, 'מהיר', 1), (2, 'כטב"מ', 2), (3, 'מסוק', 3)`);
});

describe('סוגי איום', () => {
  it('נטענים לפי סדר התצוגה', async () => {
    const rows = await (await get('/api/air-defense/threat-types')).json();
    expect(rows.map(r => r.name)).toEqual(['מהיר', 'כטב"מ', 'מסוק']);
  });

  it('שם כפול נדחה ב-409 ולא יוצר שורה שנייה', async () => {
    const res = await post('/api/air-defense/threat-types', { name: 'מהיר' });
    expect(res.status).toBe(409);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM ad_threat_types');
    expect(rows[0].n).toBe(3);
  });

  it('שם ריק נדחה', async () => {
    expect((await post('/api/air-defense/threat-types', { name: '   ' })).status).toBe(400);
  });
});

describe('מערכות', () => {
  it('נשמרת ונטענת עם המפתחות והגובה', async () => {
    const created = await (await post('/api/air-defense/sensor/systems', radar())).json();
    expect(created.id).toBeTruthy();
    const [row] = await (await get('/api/air-defense/sensor/systems')).json();
    expect(row.name).toBe('מכ"ם גזרתי');
    expect(Number(row.detect_from_deg)).toBe(350);
    expect(Number(row.detect_to_deg)).toBe(20);
    expect(row.alt_max).toBe(400);
    expect(row.effectiveness).toEqual([]);
  });

  it('מכ"ם מסתובב נשמר עם מפתחות ריקים (360) ולא באפסים', async () => {
    await post('/api/air-defense/sensor/systems', radar({
      detect_from_deg: null, detect_to_deg: null, track_from_deg: null, track_to_deg: null,
    }));
    const [row] = await (await get('/api/air-defense/sensor/systems')).json();
    expect(row.detect_from_deg).toBeNull();
    expect(row.track_to_deg).toBeNull();
  });

  it('תקרה מתחת לרצפה מתהפכת בשרת - חפיפת גובה הפוכה היא "אין כיסוי" שקט', async () => {
    await post('/api/air-defense/sensor/systems', radar({ alt_min: 300, alt_max: 100 }));
    const [row] = await (await get('/api/air-defense/sensor/systems')).json();
    expect([row.alt_min, row.alt_max]).toEqual([100, 300]);
  });

  it('שם ריק נדחה', async () => {
    expect((await post('/api/air-defense/weapon/systems', { name: ' ' })).status).toBe(400);
  });

  it('סוג שאינו קרקעי/אווירי נופל לקרקעי ולא נשמר כערך זר', async () => {
    await post('/api/air-defense/weapon/systems', { name: 'טק"א', kind: 'sea' });
    const [row] = await (await get('/api/air-defense/weapon/systems')).json();
    expect(row.kind).toBe('ground');
  });

  it('משפחה לא מוכרת מחזירה 404', async () => {
    expect((await get('/api/air-defense/tanks/systems')).status).toBe(404);
  });

  it('עדכון משנה את השורה הקיימת ולא יוצר חדשה', async () => {
    const sys = await (await post('/api/air-defense/sensor/systems', radar())).json();
    await put(`/api/air-defense/sensor/systems/${sys.id}`, radar({ name: 'מכ"ם מעודכן', range_nm: 200 }));
    const rows = await (await get('/api/air-defense/sensor/systems')).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('מכ"ם מעודכן');
    expect(Number(rows[0].range_nm)).toBe(200);
  });
});

describe('טבלת היעילות', () => {
  const newSensor = async () => (await (await post('/api/air-defense/sensor/systems', radar())).json()).id;

  it('נשמרת ומוחזרת עם שם האיום', async () => {
    const id = await newSensor();
    await put(`/api/air-defense/sensor/systems/${id}/effectiveness`, { threat_type_id: 2, quality_pct: 72 });
    const [row] = await (await get('/api/air-defense/sensor/systems')).json();
    expect(row.effectiveness).toHaveLength(1);
    expect(row.effectiveness[0].quality_pct).toBe(72);
    expect(row.effectiveness[0].threat_name).toBe('כטב"מ');
  });

  it('שמירה חוזרת לאותו צמד מעדכנת ולא מכפילה', async () => {
    const id = await newSensor();
    await put(`/api/air-defense/sensor/systems/${id}/effectiveness`, { threat_type_id: 1, quality_pct: 30 });
    await put(`/api/air-defense/sensor/systems/${id}/effectiveness`, { threat_type_id: 1, quality_pct: 80 });
    const [row] = await (await get('/api/air-defense/sensor/systems')).json();
    expect(row.effectiveness).toHaveLength(1);
    expect(row.effectiveness[0].quality_pct).toBe(80);
  });

  it('אפס נשמר כשורה - "בדקנו ואינו מתמודד" אינו "לא הוזן"', async () => {
    const id = await newSensor();
    await put(`/api/air-defense/sensor/systems/${id}/effectiveness`, { threat_type_id: 1, quality_pct: 0 });
    const [row] = await (await get('/api/air-defense/sensor/systems')).json();
    expect(row.effectiveness[0].quality_pct).toBe(0);
  });

  it('אחוז מחוץ לטווח נדחה ולא מהודק', async () => {
    const id = await newSensor();
    for (const bad of [-1, 101, 'abc', null]) {
      expect((await put(`/api/air-defense/sensor/systems/${id}/effectiveness`,
        { threat_type_id: 1, quality_pct: bad })).status).toBe(400);
    }
    const [row] = await (await get('/api/air-defense/sensor/systems')).json();
    expect(row.effectiveness).toEqual([]);
  });

  it('שבר מתעגל לשלם', async () => {
    const id = await newSensor();
    await put(`/api/air-defense/sensor/systems/${id}/effectiveness`, { threat_type_id: 1, quality_pct: 72.6 });
    const [row] = await (await get('/api/air-defense/sensor/systems')).json();
    expect(row.effectiveness[0].quality_pct).toBe(73);
  });

  it('סוג איום שאינו קיים מוחזר כ-404 ולא כשגיאת שרת', async () => {
    const id = await newSensor();
    expect((await put(`/api/air-defense/sensor/systems/${id}/effectiveness`,
      { threat_type_id: 999, quality_pct: 50 })).status).toBe(404);
  });

  it('ניקוי מחזיר את הצמד ל"לא הוזן"', async () => {
    const id = await newSensor();
    await put(`/api/air-defense/sensor/systems/${id}/effectiveness`, { threat_type_id: 1, quality_pct: 50 });
    await del(`/api/air-defense/sensor/systems/${id}/effectiveness/1`);
    const [row] = await (await get('/api/air-defense/sensor/systems')).json();
    expect(row.effectiveness).toEqual([]);
  });

  it('שתי המשפחות אינן מתערבבות', async () => {
    const sensorId = await newSensor();
    const weaponId = (await (await post('/api/air-defense/weapon/systems', { name: 'טק"א', kind: 'ground' })).json()).id;
    await put(`/api/air-defense/sensor/systems/${sensorId}/effectiveness`, { threat_type_id: 1, quality_pct: 40 });
    await put(`/api/air-defense/weapon/systems/${weaponId}/effectiveness`, { threat_type_id: 1, quality_pct: 90 });
    const [sensor] = await (await get('/api/air-defense/sensor/systems')).json();
    const [weapon] = await (await get('/api/air-defense/weapon/systems')).json();
    expect(sensor.effectiveness[0].quality_pct).toBe(40);
    expect(weapon.effectiveness[0].quality_pct).toBe(90);
  });
});

describe('מחיקות', () => {
  it('מחיקת מערכת גוררת את הערכותיה - הן חסרות משמעות בלעדיה', async () => {
    const id = (await (await post('/api/air-defense/sensor/systems', radar())).json()).id;
    await put(`/api/air-defense/sensor/systems/${id}/effectiveness`, { threat_type_id: 1, quality_pct: 50 });
    await del(`/api/air-defense/sensor/systems/${id}`);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM ad_sensor_effectiveness');
    expect(rows[0].n).toBe(0);
  });

  it('מחיקת סוג איום שיש לו הערכות **נחסמת** ומדווחת כמה', async () => {
    const id = (await (await post('/api/air-defense/sensor/systems', radar())).json()).id;
    await put(`/api/air-defense/sensor/systems/${id}/effectiveness`, { threat_type_id: 1, quality_pct: 50 });
    const res = await del('/api/air-defense/threat-types/1');
    expect(res.status).toBe(409);
    expect((await res.json()).used).toBe(1);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM ad_threat_types');
    expect(rows[0].n).toBe(3);
  });

  it('סוג איום בלי הערכות נמחק', async () => {
    expect((await del('/api/air-defense/threat-types/3')).status).toBe(200);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM ad_threat_types');
    expect(rows[0].n).toBe(2);
  });
});
