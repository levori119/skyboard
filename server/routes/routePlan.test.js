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
const C = 30, D = 31;
const E = 40, F = 41, G = 42, H = 43;

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
    name VARCHAR(200), route_type VARCHAR(20), waypoints JSONB, direction VARCHAR(10) DEFAULT 'both')`);
  await pool.query(`CREATE TABLE public.airfield_routes (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id),
    name VARCHAR(200), is_runway BOOLEAN DEFAULT FALSE, route_path JSONB)`);
  await pool.query(`CREATE TABLE public.airfield_element_types (
    id SERIAL PRIMARY KEY, name VARCHAR(100), icon VARCHAR(80),
    can_change_status BOOLEAN DEFAULT FALSE, open_icon VARCHAR(80), close_icon VARCHAR(80))`);
  await pool.query(`CREATE TABLE public.airfield_elements (
    id SERIAL PRIMARY KEY, airfield_id INTEGER REFERENCES airfields(id),
    element_type_id INTEGER REFERENCES airfield_element_types(id),
    name VARCHAR(200), x_pct REAL, y_pct REAL, status VARCHAR(40),
    relevant_for JSONB DEFAULT '["vehicles","aircraft"]',
    road_relevance JSONB DEFAULT '[]')`);

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

  // שדה 2 - שתי דרכים בין C ל-D: "ישר" הקצרה, ו"עוקף" שיורד ל-y=95 וחוזר
  //        C(10,80) ──────── ישר ──────── D(90,80)
  //           │                              │
  //           └────────────  עוקף  ──────────┘  (y=95)
  await pool.query(`INSERT INTO airfields (id, name, map_id) VALUES (2, 'שדה חלופות', 1)`);
  await pool.query(`INSERT INTO airfield_points (id, airfield_id, name, x_pct, y_pct) VALUES ($1, 2, 'C', 10, 80), ($2, 2, 'D', 90, 80)`, [C, D]);
  await pool.query(
    `INSERT INTO base_routes (airfield_id, name, route_type, waypoints) VALUES (2, 'ישר', 'vehicle', $1), (2, 'עוקף', 'vehicle', $2)`,
    [JSON.stringify(line(10, 80, 90, 80)), JSON.stringify([...line(10, 80, 10, 95), ...line(10, 95, 90, 95).slice(1), ...line(90, 95, 90, 80).slice(1)])]
  );

  // שדה 3 - "אופקי" ו"אנכי" נחצים ב-(50,50) באמצע קטע, בלי קודקוד ליד החיתוך
  // (קטעים ארוכים - שתי נקודות לכל נתיב). "חד" (60,80)->(90,80) חד-כיווני קדימה.
  //
  //                   │ אנכי (50,20)->(50,95)
  //   (10,50) ────────┼──────── (90,50)  אופקי
  //                   │
  //   E(30,58)         F(50,95)
  await pool.query(`INSERT INTO airfields (id, name, map_id) VALUES (3, 'שדה חיתוך', 1)`);
  await pool.query(
    `INSERT INTO airfield_points (id, airfield_id, name, x_pct, y_pct) VALUES
      ($1, 3, 'E', 30, 58), ($2, 3, 'F', 50, 95), ($3, 3, 'G', 62, 83), ($4, 3, 'H', 88, 83)`,
    [E, F, G, H]
  );
  await pool.query(
    `INSERT INTO base_routes (airfield_id, name, route_type, waypoints, direction) VALUES
      (3, 'אופקי', 'vehicle', $1, 'both'), (3, 'אנכי', 'vehicle', $2, 'both'), (3, 'חד', 'vehicle', $3, 'forward')`,
    [JSON.stringify([{ x: 10, y: 50 }, { x: 90, y: 50 }]), JSON.stringify([{ x: 50, y: 20 }, { x: 50, y: 95 }]),
     JSON.stringify([{ x: 60, y: 80 }, { x: 90, y: 80 }])]
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

// "צריך להציג כמה אופציות של נסיעה - מציג רק אחת": שלוש רמות ההרשאה החזירו
// באותו שדה אותו נתיב בדיוק, וחלון ניהול הנסיעות איחד אותן לשורה אחת.
describe('תכנון נתיב - חלופות', () => {
  const planAt = (af, body) => post('/api/route-plan', { airfield_id: af, permissions: ['vehicle'], ...body }).then(r => r.json());

  it('בלי alternatives - רשימה ריקה, והתשובה כמו קודם', async () => {
    const res = await planAt(2, { from_point_id: C, to_point_id: D });
    expect(res.alternatives).toEqual([]);
    expect(segNames(res)).toEqual(['ישר']);
  });

  it('דרך נוספת בשדה - מוחזרת כחלופה ארוכה יותר, עם הוראות ומקטעים משלה', async () => {
    const res = await planAt(2, { from_point_id: C, to_point_id: D, alternatives: 2 });
    expect(segNames(res)).toEqual(['ישר']);
    expect(res.alternatives).toHaveLength(1);
    const [alt] = res.alternatives;
    expect(segNames(alt)).toContain('עוקף');
    expect(alt.totalDistM).toBeGreaterThan(res.totalDistM);
    expect(alt.waypoints.length).toBeGreaterThan(2);
    expect(alt.waypoints[0].instruction).toContain('C');
    expect(alt.segmentPath).toContain('עוקף');
  });

  it('אין דרך אחרת - אין חלופות (לא אותו נתיב פעמיים)', async () => {
    const res = await planAt(AF, { from_point_id: A, to_point_id: B, alternatives: 3 });
    expect(res.alternatives).toEqual([]);
  });

  it('תקרה של 3 חלופות', async () => {
    const res = await planAt(2, { from_point_id: C, to_point_id: D, alternatives: 99 });
    expect(res.alternatives.length).toBeLessThanOrEqual(3);
  });
});

// "זה אמור לקחת מנקודת היציאה לנתיב הכי קרוב ב-90 מעלות, ומשם לעשות את כל
// החיתוכים בין הנקודות עד נקודה אחרונה - בפועל זה חותך בין הנקודות."
describe('תכנון נתיב - ניצב לנתיב הקרוב ומעבר בחיתוך', () => {
  const planAt = (af, body) => post('/api/route-plan', { airfield_id: af, permissions: ['vehicle'], ...body }).then(r => r.json());

  it('מוצא ליד "אופקי" ויעד על "אנכי" - עוברים בחיתוך (50,50)', async () => {
    const res = await planAt(3, { from_point_id: E, to_point_id: F });
    expect(res.error).toBeUndefined();
    expect(segNames(res)).toEqual(['אופקי', 'אנכי']);
    const atCross = res.waypoints.some(w => Math.abs(w.xPct - 50) < 0.1 && Math.abs(w.yPct - 50) < 0.1);
    expect(atCross).toBe(true);
  });

  it('הנקודה השנייה היא רגל הניצב מהמוצא על "אופקי" - (30,50)', async () => {
    const res = await planAt(3, { from_point_id: E, to_point_id: F });
    expect(res.waypoints[1].xPct).toBeCloseTo(30, 1);
    expect(res.waypoints[1].yPct).toBeCloseTo(50, 1);
  });

  it('אין נקודה כפולה בחיתוך (הוראת פנייה אחת)', async () => {
    const res = await planAt(3, { from_point_id: E, to_point_id: F });
    for (let i = 1; i < res.waypoints.length; i++) {
      const a = res.waypoints[i - 1], b = res.waypoints[i];
      expect(Math.hypot(a.xPct - b.xPct, a.yPct - b.yPct)).toBeGreaterThan(0.01);
    }
  });

  it('נתיב חד-כיווני: עם הכיוון יש נתיב, נגדו אין', async () => {
    const withDir = await planAt(3, { from_point_id: G, to_point_id: H });
    expect(withDir.error).toBeUndefined();
    expect(segNames(withDir)).toEqual(['חד']);
    const against = await planAt(3, { from_point_id: H, to_point_id: G });
    expect(against.error).toBeTruthy();
  });
});
