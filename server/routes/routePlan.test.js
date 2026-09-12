// **תכנון נתיב נסיעה** (`POST /api/route-plan`) - מול Postgres אמיתי (PGlite).
//
// למה מול DB אמיתי ולא mock: הטענה המרכזית כאן היא **גאומטרית** - שהנתיב עובר
// בתחנות הביניים ולא רק מחבר מוצא ליעד. היא נבדקת על גרף של מסלולים אמיתיים
// עם נ"צ שנגזר מעוגני המפה, ו-mock היה מאשר אותה בלי לבדוק כלום.
//
// ה-endpoint משמש גם את "כניסת רכבים" ואת אפליקציית הנהג, ולכן נבדקת גם
// **תאימות לאחור**: בקשה בלי `via_point_ids` חייבת להתנהג כמו קודם.
//
// ── הגאומטריה ───────────────────────────────────────────────────────────────
// עוגני המפה ממפים 1% ל-~10 מטר, כך שהמרחקים בקנה מידה של שדה אמיתי:
//
//        A(10,10) ──────── J(50,10) ──────── B(90,10)     "ראשי"
//                             │
//                             │  "שלוחה"
//                          S(50,60)
//
// מ-A ל-B הדרך הקצרה היא על "ראשי" בלבד. תחנה ב-S **מחייבת** לרדת בשלוחה
// ולחזור - ולכן נתיב שאינו כולל את "שלוחה" הוא נתיב שלא עוצר בתחנה.
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';

// הבדיקות כאן מרימות **Postgres אמיתי** (PGlite) ומריצות מולו שאילתות
// וחישוב גרף. חמש השניות של ברירת המחדל מספיקות בבידוד ולא בריצה המלאה
// המקבילה, ושם הן הפילו את הקובץ באקראי - כלומר הפכו חוסר-מזל לכשל.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base;

const post = (p, body) => fetch(`${base}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

const AF = 1;
const A = 20, B = 21, S = 22;

/** נקודות לאורך קו, בצעדי 5% - צמתים סמוכים תמיד מחוברים באותו מסלול. */
const line = (x1, y1, x2, y2) => {
  const steps = Math.round(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 5);
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: x1 + ((x2 - x1) * i) / steps,
    y: y1 + ((y2 - y1) * i) / steps,
  }));
};

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';

  ({ default: pool } = await import('../db/pool.js'));
  const { default: router } = await import('./driver.js');
  const { listen } = await import('../listen.js');

  // 1% -> ~10 מטר: 100% x = 0.01 מעלות אורך (~940 מ'), 100% y = 0.01 רוחב (~1110 מ')
  await pool.query(`CREATE TABLE public.maps (
    id SERIAL PRIMARY KEY,
    anchor1_x_img REAL, anchor1_y_img REAL, anchor1_lat REAL, anchor1_lon REAL,
    anchor2_x_img REAL, anchor2_y_img REAL, anchor2_lat REAL, anchor2_lon REAL)`);
  await pool.query(`CREATE TABLE public.airfields (
    id SERIAL PRIMARY KEY, name VARCHAR(200), map_id INTEGER REFERENCES maps(id))`);
  await pool.query(`CREATE TABLE public.airfield_points (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id),
    name VARCHAR(100), x_pct REAL, y_pct REAL)`);
  await pool.query(`CREATE TABLE public.base_routes (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id),
    name VARCHAR(200), route_type VARCHAR(20), waypoints JSONB)`);
  await pool.query(`CREATE TABLE public.airfield_routes (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id),
    name VARCHAR(200), is_runway BOOLEAN DEFAULT FALSE, route_path JSONB)`);
  await pool.query(`CREATE TABLE public.airfield_element_types (
    id SERIAL PRIMARY KEY, name VARCHAR(100), icon VARCHAR(80),
    can_change_status BOOLEAN DEFAULT FALSE, open_icon VARCHAR(80), close_icon VARCHAR(80))`);
  await pool.query(`CREATE TABLE public.airfield_elements (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id),
    element_type_id INTEGER REFERENCES airfield_element_types(id),
    name VARCHAR(200), x_pct REAL, y_pct REAL, status VARCHAR(40))`);

  await pool.query(`INSERT INTO maps (id, anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon,
                                     anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon)
                    VALUES (1, 0, 0, 32.0, 35.0, 100, 100, 32.01, 35.01)`);
  await pool.query(`INSERT INTO airfields (id, name, map_id) VALUES (1, 'שדה בדיקה', 1)`);
  await pool.query(
    `INSERT INTO airfield_points (id, airfield_id, name, x_pct, y_pct) VALUES
      ($1, 1, 'מוצא', 10, 10), ($2, 1, 'יעד', 90, 10), ($3, 1, 'תחנה', 50, 60)`,
    [A, B, S]
  );
  await pool.query(
    `INSERT INTO base_routes (airfield_id, name, route_type, waypoints) VALUES
      (1, 'ראשי', 'vehicle', $1), (1, 'שלוחה', 'vehicle', $2)`,
    [JSON.stringify(line(10, 10, 90, 10)), JSON.stringify(line(50, 10, 50, 60))]
  );

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

const plan = (body) => post('/api/route-plan', { airfield_id: AF, permissions: ['vehicle'], ...body }).then(r => r.json());
const segNames = (res) => (res.routeSegments || []).map(s => s.name).sort();

describe('תכנון נתיב - מוצא ויעד (תאימות לאחור)', () => {
  it('מחזיר נתיב על המסלול הראשי בלבד', async () => {
    const res = await plan({ from_point_id: A, to_point_id: B });
    expect(res.error).toBeUndefined();
    expect(res.waypoints.length).toBeGreaterThan(2);
    expect(segNames(res)).toEqual(['ראשי']);
  });

  it('הוראת ההתחלה והסיום נושאות את שמות הנקודות', async () => {
    const res = await plan({ from_point_id: A, to_point_id: B });
    expect(res.waypoints[0].instruction).toContain('מוצא');
    expect(res.waypoints[res.waypoints.length - 1].instruction).toContain('יעד');
  });

  // `via_point_ids` שאינו נשלח כלל, או ריק, אינו משנה דבר - שני הזרימות
  // הקיימות (כניסת רכבים, אפליקציית הנהג) אינן שולחות אותו
  it('מערך תחנות ריק זהה לבקשה בלעדיו', async () => {
    const without = await plan({ from_point_id: A, to_point_id: B });
    const withEmpty = await plan({ from_point_id: A, to_point_id: B, via_point_ids: [] });
    expect(withEmpty.totalDistM).toBe(without.totalDistM);
    expect(segNames(withEmpty)).toEqual(segNames(without));
  });

  it('בלי מוצא או יעד מוחזרת שגיאה ולא נתיב חלקי', async () => {
    const res = await plan({ from_point_id: A });
    expect(res.error).toBeTruthy();
    expect(res.waypoints).toEqual([]);
  });
});

describe('תכנון נתיב - תחנות ביניים', () => {
  it('הנתיב יורד לשלוחה כדי לעבור בתחנה', async () => {
    const res = await plan({ from_point_id: A, to_point_id: B, via_point_ids: [S] });
    expect(res.error).toBeUndefined();
    expect(segNames(res)).toEqual(['ראשי', 'שלוחה']);
  });

  // תחנה שאינה על הנתיב שחושב היא תחנה שהנהג לא יעצור בה
  it('הנתיב עם התחנה ארוך מהנתיב הישיר', async () => {
    const direct = await plan({ from_point_id: A, to_point_id: B });
    const viaStop = await plan({ from_point_id: A, to_point_id: B, via_point_ids: [S] });
    expect(viaStop.totalDistM).toBeGreaterThan(direct.totalDistM);
  });

  it('התחנה מסומנת על הנתיב, עם שמה והוראה לעצור', async () => {
    const res = await plan({ from_point_id: A, to_point_id: B, via_point_ids: [S] });
    const stops = res.waypoints.filter(w => w.isStop);
    expect(stops).toHaveLength(1);
    expect(stops[0].stopName).toBe('תחנה');
    expect(stops[0].instruction).toContain('עצור בתחנה');
  });

  it('התחנה יושבת באמצע הנתיב ולא בקצהו', async () => {
    const res = await plan({ from_point_id: A, to_point_id: B, via_point_ids: [S] });
    const idx = res.waypoints.findIndex(w => w.isStop);
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(res.waypoints.length - 1);
  });

  // הסדר הוא סדר הנסיעה שהפקח קבע, ולא סדר ה-id שה-DB החזיר
  it('אותה תחנה פעמיים אינה מפילה את החישוב', async () => {
    const res = await plan({ from_point_id: A, to_point_id: B, via_point_ids: [S, S] });
    expect(res.error).toBeUndefined();
    expect(res.waypoints.filter(w => w.isStop)).toHaveLength(2);
  });

  it('מזהה תחנה שאינו קיים מדולג ואינו מפיל את הנתיב', async () => {
    const res = await plan({ from_point_id: A, to_point_id: B, via_point_ids: [9999] });
    expect(res.error).toBeUndefined();
    expect(segNames(res)).toEqual(['ראשי']);
  });

  it('התחנה יכולה להיות גם המוצא או היעד, בלי נתיב שבור', async () => {
    const res = await plan({ from_point_id: A, to_point_id: B, via_point_ids: [B] });
    expect(res.error).toBeUndefined();
    expect(res.waypoints.length).toBeGreaterThan(2);
  });
});
