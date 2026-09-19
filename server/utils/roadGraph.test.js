// גרף הכבישים של תכנון נתיב הנסיעה - גאומטריה טהורה, בלי DB.
//
// הטענות כאן הן מה שהפקח רואה על המפה: הנתיב יוצא מהנקודה **בניצב** לנתיב
// הקרוב, נוסע **לאורך** הנתיבים, ועובר מנתיב לנתיב רק ב**חיתוך** ביניהם -
// לא קו ישר בין קודקודים של שני כבישים שונים. ונתיב חד-כיווני לא נסוע נגדו.
import { describe, it, expect } from 'vitest';
import { buildRoadGraph, shortestPath, normalizeDirection } from './roadGraph.js';

// מטרים -> מעלות סביב (32, 35): מספיק מדויק לקנה המידה של שדה
const LAT0 = 32, LON0 = 35;
const M_LAT = 110574, M_LON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const g = (xM, yM) => ({ lat: LAT0 + yM / M_LAT, lon: LON0 + xM / M_LON });
const route = (id, name, pts, direction = 'both') => ({
  id, name, route_type: 'vehicle', direction, waypoints: pts.map(([x, y]) => g(x, y)),
});
/** מיקום צומת במטרים - לבדיקות גאומטריות */
const xy = n => ({ x: (n.lon - LON0) * M_LON, y: (n.lat - LAT0) * M_LAT });

const solve = (routes, from, to) => {
  const G = buildRoadGraph(routes, [
    { key: '_from', geo: g(...from) },
    { key: '_to', geo: g(...to) },
  ]);
  const path = shortestPath(G, '_from', '_to');
  return { G, path, pts: path ? path.map(id => xy(G.nodes[id])) : null };
};

describe('חיתוך בין נתיבים', () => {
  //   "אופקי" (0,0)->(1000,0) ו"אנכי" (500,-500)->(500,500): חוצים ב-(500,0),
  //   ושום קודקוד של האחד אינו ליד השני. במודל הישן לא היה ביניהם חיבור בכלל.
  const routes = [
    route(1, 'אופקי', [[0, 0], [1000, 0]]),
    route(2, 'אנכי', [[500, -500], [500, 500]]),
  ];

  it('עובר מנתיב לנתיב בנקודת החיתוך', () => {
    const { path, pts } = solve(routes, [0, 0], [500, 500]);
    expect(path).toBeTruthy();
    expect(pts.some(p => Math.abs(p.x - 500) < 1 && Math.abs(p.y) < 1)).toBe(true);
  });

  it('כל קטע בנתיב יושב על אחד הכבישים - אין קיצור באלכסון', () => {
    const { pts } = solve(routes, [0, 0], [500, 500]);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const onH = Math.abs(a.y) < 1 && Math.abs(b.y) < 1;
      const onV = Math.abs(a.x - 500) < 1 && Math.abs(b.x - 500) < 1;
      expect(onH || onV).toBe(true);
    }
  });

  // שני כבישים מקבילים במרחק 60 מ' - המודל הישן חיבר קודקודים עד 80 מ' וחתך ביניהם.
  // המוצא על "צפון" והיעד על "דרום", ואין ביניהם חיבור: אין נתיב - לא קפיצה.
  it('כבישים מקבילים שאינם נחתכים אינם מחוברים בקיצור', () => {
    const par = [
      route(1, 'צפון', [[0, 0], [500, 0], [1000, 0]]),
      route(2, 'דרום', [[0, -60], [500, -60], [1000, -60]]),
    ];
    const { path } = solve(par, [0, 0], [1000, -60]);
    expect(path).toBeNull();
  });
});

describe('יציאה מהנקודה בניצב לנתיב הקרוב', () => {
  const routes = [route(1, 'ראשי', [[0, 0], [1000, 0]])];

  it('הצומת הראשון אחרי המוצא הוא רגל הניצב על הכביש', () => {
    const { pts } = solve(routes, [300, 120], [800, 0]);
    expect(pts[1].x).toBeCloseTo(300, 0);
    expect(pts[1].y).toBeCloseTo(0, 0);
  });

  it('גם ביעד: נכנסים אליו בניצב מהכביש', () => {
    const { pts } = solve(routes, [100, 0], [700, -90]);
    const beforeLast = pts[pts.length - 2];
    expect(beforeLast.x).toBeCloseTo(700, 0);
    expect(beforeLast.y).toBeCloseTo(0, 0);
  });

  it('רגל הניצב נופלת בין שני קודקודים - לא נצמדת לקודקוד הקרוב', () => {
    const { pts } = solve(routes, [420, 50], [1000, 0]);
    expect(pts[1].x).toBeCloseTo(420, 0);
  });

  it('מתחבר לכביש הקרוב ולא לרחוק', () => {
    const two = [
      route(1, 'קרוב', [[0, 0], [1000, 0]]),
      route(2, 'רחוק', [[0, 200], [1000, 200]]),
      route(3, 'מחבר', [[1000, 0], [1000, 200]]),
    ];
    const { G, path } = solve(two, [500, 40], [1000, 200]);
    expect(G.nodes[path[1]].routeName).toBe('קרוב');
  });
});

describe('קצה כביש ליד כביש אחר - צומת T', () => {
  it('קצה שמסתיים 10 מ\' לפני כביש אחר מתחבר אליו בניצב', () => {
    const routes = [
      route(1, 'ראשי', [[0, 0], [1000, 0]]),
      route(2, 'שלוחה', [[500, 10], [500, 400]]),
    ];
    const { path, pts } = solve(routes, [0, 0], [500, 400]);
    expect(path).toBeTruthy();
    expect(pts.some(p => Math.abs(p.x - 500) < 1 && Math.abs(p.y) < 1)).toBe(true);
  });
});

describe('כיוון נסיעה', () => {
  // לולאה: "ישר" (0,0)->(1000,0) ו"עוקף" שחוזר דרך y=300. מ-A ל-B הקצר הוא "ישר".
  const loop = (dirStraight) => [
    route(1, 'ישר', [[0, 0], [1000, 0]], dirStraight),
    route(2, 'עוקף', [[0, 0], [0, 300], [1000, 300], [1000, 0]]),
  ];
  const names = (G, path) => [...new Set(path.map(id => G.nodes[id].routeName).filter(Boolean))];

  it('דו-כיווני: נוסע על הישר בשני הכיוונים', () => {
    const f = solve(loop('both'), [0, 0], [1000, 0]);
    const b = solve(loop('both'), [1000, 0], [0, 0]);
    expect(names(f.G, f.path)).not.toContain('עוקף');
    expect(names(b.G, b.path)).not.toContain('עוקף');
  });

  it('חד-כיווני קדימה (לפי סדר הציור): מותר קדימה, אחורה עוקפים', () => {
    const f = solve(loop('forward'), [0, 0], [1000, 0]);
    const b = solve(loop('forward'), [1000, 0], [0, 0]);
    expect(names(f.G, f.path)).not.toContain('עוקף');
    expect(names(b.G, b.path)).toContain('עוקף');
  });

  it('חד-כיווני אחורה: ההפך', () => {
    const f = solve(loop('backward'), [0, 0], [1000, 0]);
    const b = solve(loop('backward'), [1000, 0], [0, 0]);
    expect(names(f.G, f.path)).toContain('עוקף');
    expect(names(b.G, b.path)).not.toContain('עוקף');
  });

  it('אין דרך אלא נגד הכיוון - אין נתיב', () => {
    const one = [route(1, 'חד', [[0, 0], [1000, 0]], 'forward')];
    expect(solve(one, [0, 0], [1000, 0]).path).toBeTruthy();
    expect(solve(one, [1000, 0], [0, 0]).path).toBeNull();
  });

  it('נקודה באמצע כביש חד-כיווני - נוסעים רק קדימה ממנה', () => {
    const one = [route(1, 'חד', [[0, 0], [1000, 0]], 'forward')];
    expect(solve(one, [300, 20], [700, 20]).path).toBeTruthy();
    expect(solve(one, [700, 20], [300, 20]).path).toBeNull();
  });

  it('ערך כיוון לא מוכר או חסר = דו-כיווני', () => {
    expect(normalizeDirection(undefined)).toBe('both');
    expect(normalizeDirection('xyz')).toBe('both');
    expect(normalizeDirection('forward')).toBe('forward');
    expect(normalizeDirection('backward')).toBe('backward');
  });
});
