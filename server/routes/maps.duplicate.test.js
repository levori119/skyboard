// שיכפול מפה מעוגנת — **עותק נקי**, מול Postgres אמיתי (PGlite בזיכרון).
//
// הטענה המרכזית שנבדקת כאן: העותק נושא את **התמונה ואת נקודות העיגון** ותו לא.
// כל מה שצויר על המפה — אזורים, בלוקי הגובה שלהם, נקודות העברה ותת-מפות —
// **אינו** מועתק. זו בדיוק הדרישה ("ללא עזרים"), והיא בדיקה שאי אפשר לעשות
// מול mock של pool: מה שנבדק הוא מה שיושב ב-DB אחרי הקריאה, לא אילו שאילתות
// נשלחו אליו.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

let pool, server, base;

const ANCHORS = {
  anchor1_x_img: 20, anchor1_y_img: 10, anchor1_lat: 33.25, anchor1_lon: 34.5,
  anchor2_x_img: 80, anchor2_y_img: 90, anchor2_lat: 31.75, anchor2_lon: 35.25,
};

const IMAGE = 'data:image/png;base64,AAAA';

const post = (path, body) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
});

/** מפה מקורית: מעוגנת, משויכת לבסיס אב, ועליה אזור ונקודת העברה */
async function seedMap({ name = 'מרחב א׳', parent_map_id = null, parent_rect = null } = {}) {
  const map = await pool.query(
    `INSERT INTO maps (name, image_data, parent_base_id, parent_map_id, parent_rect,
                       anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon,
                       anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [name, IMAGE, 7, parent_map_id, parent_rect,
     ANCHORS.anchor1_x_img, ANCHORS.anchor1_y_img, ANCHORS.anchor1_lat, ANCHORS.anchor1_lon,
     ANCHORS.anchor2_x_img, ANCHORS.anchor2_y_img, ANCHORS.anchor2_lat, ANCHORS.anchor2_lon]);
  const id = map.rows[0].id;
  const zone = await pool.query(
    `INSERT INTO map_zones (map_id, name, color, polygon) VALUES ($1,$2,$3,$4) RETURNING id`,
    [id, 'אזור תרגול', '#3b82f6', '[{"x":10,"y":10}]']);
  await pool.query(
    `INSERT INTO zone_altitude_ranges (zone_id, name, alt_min, alt_max) VALUES ($1,$2,$3,$4)`,
    [zone.rows[0].id, 'בלוק תחתון', 50, 100]);
  await pool.query(
    `INSERT INTO map_transfer_points (map_id, sector_id, x_pct, y_pct) VALUES ($1,$2,$3,$4)`,
    [id, 1, 42, 24]);
  return map.rows[0];
}

beforeAll(async () => {
  // חייב להיקבע **לפני** ייבוא pool.js: הבחירה בין Neon למאגר המקומי נעשית
  // בזמן טעינת המודול.
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';

  ({ default: pool } = await import('../db/pool.js'));
  const { default: mapsRouter } = await import('./maps.js');
  const { listen } = await import('../listen.js');

  await pool.query(`CREATE TABLE public.maps (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    image_data TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    parent_base_id INTEGER,
    parent_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
    parent_rect JSONB,
    anchor1_x_img REAL, anchor1_y_img REAL, anchor1_lat DOUBLE PRECISION, anchor1_lon DOUBLE PRECISION,
    anchor2_x_img REAL, anchor2_y_img REAL, anchor2_lat DOUBLE PRECISION, anchor2_lon DOUBLE PRECISION)`);
  await pool.query(`CREATE TABLE public.map_zones (
    id SERIAL PRIMARY KEY,
    map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
    polygon TEXT NOT NULL DEFAULT '[]',
    parent_zone_id INTEGER)`);
  await pool.query(`CREATE TABLE public.zone_altitude_ranges (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES map_zones(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL DEFAULT '',
    alt_min INTEGER, alt_max INTEGER)`);
  await pool.query(`CREATE TABLE public.map_transfer_points (
    id SERIAL PRIMARY KEY,
    map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    preset_id INTEGER,
    sector_id INTEGER NOT NULL,
    sub_label VARCHAR(50),
    x_pct FLOAT NOT NULL DEFAULT 50,
    y_pct FLOAT NOT NULL DEFAULT 50)`);

  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(mapsRouter);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise(r => server?.close(r));
  await pool?.end?.();
});

beforeEach(async () => {
  await pool.query(`DELETE FROM map_transfer_points`);
  await pool.query(`DELETE FROM zone_altitude_ranges`);
  await pool.query(`DELETE FROM map_zones`);
  await pool.query(`DELETE FROM maps`);
});

describe('שיכפול מפה — מה שעובר לעותק', () => {
  it('התמונה ושמונת ערכי העיגון זהים למקור', async () => {
    const src = await seedMap();

    const res = await post(`/api/maps/${src.id}/duplicate`);
    expect(res.status).toBe(200);
    const copy = await res.json();
    expect(copy.id).not.toBe(src.id);

    const row = (await pool.query('SELECT * FROM maps WHERE id = $1', [copy.id])).rows[0];
    expect(row.image_data).toBe(IMAGE);
    for (const [col, val] of Object.entries(ANCHORS)) {
      expect(Number(row[col]), col).toBeCloseTo(val, 4);
    }
  });

  it('בסיס האב עובר — העותק נשאר במכלול של המקור', async () => {
    const src = await seedMap();
    const copy = await (await post(`/api/maps/${src.id}/duplicate`)).json();
    expect(copy.parent_base_id).toBe(7);
  });

  it('שם ברירת המחדל: "<שם המקור> (העתק)"', async () => {
    const src = await seedMap({ name: 'מרחב א׳' });
    const copy = await (await post(`/api/maps/${src.id}/duplicate`)).json();
    expect(copy.name).toBe('מרחב א׳ (העתק)');
  });

  it('שם מפורש מהמשתמש גובר', async () => {
    const src = await seedMap();
    const copy = await (await post(`/api/maps/${src.id}/duplicate`, { name: '  מרחב ב׳  ' })).json();
    expect(copy.name).toBe('מרחב ב׳');
  });
});

describe('שיכפול מפה — מה שלא עובר לעותק ("ללא עזרים")', () => {
  it('אין אזורי מפה בעותק', async () => {
    const src = await seedMap();
    const copy = await (await post(`/api/maps/${src.id}/duplicate`)).json();

    const zones = await pool.query('SELECT id FROM map_zones WHERE map_id = $1', [copy.id]);
    expect(zones.rows).toHaveLength(0);
    // והמקור לא נפגע
    expect((await pool.query('SELECT id FROM map_zones WHERE map_id = $1', [src.id])).rows).toHaveLength(1);
  });

  it('אין נקודות העברה בעותק', async () => {
    const src = await seedMap();
    const copy = await (await post(`/api/maps/${src.id}/duplicate`)).json();

    const pts = await pool.query('SELECT id FROM map_transfer_points WHERE map_id = $1', [copy.id]);
    expect(pts.rows).toHaveLength(0);
  });

  it('שיכפול של תת-מפה מנתק את הקשר לאב — העותק הוא מפה עצמאית', async () => {
    const parent = await seedMap({ name: 'מפת האב' });
    const child = await seedMap({ name: 'סקטור צפון', parent_map_id: parent.id, parent_rect: JSON.stringify({ x1: 0, y1: 0, x2: 50, y2: 50 }) });

    const copy = await (await post(`/api/maps/${child.id}/duplicate`)).json();
    const row = (await pool.query('SELECT parent_map_id, parent_rect FROM maps WHERE id = $1', [copy.id])).rows[0];
    expect(row.parent_map_id).toBeNull();
    expect(row.parent_rect).toBeNull();
  });

  it('תתי-המפות של המקור אינן משוכפלות', async () => {
    const parent = await seedMap({ name: 'מפת האב' });
    await seedMap({ name: 'סקטור צפון', parent_map_id: parent.id });

    const copy = await (await post(`/api/maps/${parent.id}/duplicate`)).json();
    const kids = await pool.query('SELECT id FROM maps WHERE parent_map_id = $1', [copy.id]);
    expect(kids.rows).toHaveLength(0);
  });
});

describe('שיכפול מפה — שמות ומקרי קצה', () => {
  it('שיכפול שני לא נופל על שם תפוס — "(העתק 2)"', async () => {
    const src = await seedMap({ name: 'מרחב א׳' });
    const first = await (await post(`/api/maps/${src.id}/duplicate`)).json();
    const second = await (await post(`/api/maps/${src.id}/duplicate`)).json();
    expect(first.name).toBe('מרחב א׳ (העתק)');
    expect(second.name).toBe('מרחב א׳ (העתק 2)');
  });

  it('שם ארוך נקטע כדי להיכנס ל-100 התווים של העמודה', async () => {
    const src = await seedMap({ name: 'מ'.repeat(100) });
    const res = await post(`/api/maps/${src.id}/duplicate`);
    expect(res.status).toBe(200);
    const copy = await res.json();
    expect(copy.name.length).toBeLessThanOrEqual(100);
    expect(copy.name.endsWith('(העתק)')).toBe(true);
  });

  it('שם שכבר תפוס בשליחה מפורשת מוחזר כ-409, בלי ליצור מפה', async () => {
    const src = await seedMap({ name: 'מרחב א׳' });
    await seedMap({ name: 'תפוס' });
    const res = await post(`/api/maps/${src.id}/duplicate`, { name: 'תפוס' });
    expect(res.status).toBe(409);
    expect((await pool.query('SELECT id FROM maps')).rows).toHaveLength(2);
  });

  it('מפה שאינה קיימת — 404', async () => {
    const res = await post('/api/maps/999999/duplicate');
    expect(res.status).toBe(404);
  });
});
