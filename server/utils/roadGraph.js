// גרף הכבישים של תכנון נתיב הנסיעה (`planRoute` ב-routes/driver.js).
//
// ⚠️ למה לא "קודקודים קרובים": המודל הקודם חיבר כל שני קודקודים של נתיבים
// שונים עד 80 מ' זה מזה, והמוצא/יעד - בקו ישר לעד 8 קודקודים ברדיוס 300 מ'.
// התוצאה על המפה: הנתיב **חותך באלכסון** בין נקודות של כבישים שונים, ושני
// כבישים שנחצים באמצע קטע (בלי קודקוד ליד החיתוך) לא היו מחוברים כלל.
//
// המודל כאן הוא מה שהנהג נוסע בפועל:
//   1. **יציאה בניצב** - המוצא, התחנות והיעד מתחברים ב-90° לנתיב הקרוב (רגל
//      הניצב על הקטע, גם באמצע קטע) - ולא לקודקוד.
//   2. **לאורך הנתיב** - הקשתות הן רק קטעי הנתיבים עצמם.
//   3. **מעבר רק בחיתוך** - בין נתיבים עוברים בנקודת החיתוך הגאומטרית שלהם.
//      קצה נתיב שנגמר ליד נתיב אחר (צומת T שצויר קצר מעט) מתחבר אליו בניצב.
//   4. **כיוון נסיעה** - נתיב חד-כיווני נותן קשתות רק בכיוון שהוגדר לו
//      (`forward` = בסדר שבו צויר, `backward` = הפוך, `both` = שניהם).

/** קצה נתיב במרחק הזה מנתיב אחר - צומת T שצויר קצר. מעבר לזה: דרך ללא מוצא */
export const ENDPOINT_SNAP_M = 50;
/** נתיבים שרגל הניצב אליהם רחוקה מהקרוב ביותר עד המרחק הזה - גם הם "הקרוב" */
export const ATTACH_TIE_M = 5;
/** נקודה על קטע במרחק הזה מקודקוד - היא הקודקוד (לא צומת כפול בסנטימטרים) */
const SAME_POINT_M = 0.5;

const DIRECTIONS = new Set(['both', 'forward', 'backward']);
/** ערך `base_routes.direction` כפי שהגרף מבין אותו. ערך חסר או זר = דו-כיווני */
export function normalizeDirection(d) {
  return DIRECTIONS.has(d) ? d : 'both';
}

export function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const num = v => (v == null || v === '' ? NaN : Number(v));

/**
 * בונה את הגרף. `routes` - שורות `base_routes` עם `waypoints` שכבר נושאים נ"צ
 * (`lat` + `lon`/`lng`), ו-`direction`. `attach` - נקודות השרשרת (מוצא, תחנות,
 * יעד): `{ key, geo:{lat,lon}, xPct?, yPct?, ...extra }` - כל שדה נוסף נשמר על
 * הצומת הווירטואלי (למשל `isStop`, `stopName`).
 *
 * מחזיר `{ nodes, graph }` - `graph[id]` רשימת `{ to, cost }` **מכוונת**.
 * מזהי צמתים על נתיב מתחילים ב-`r<routeId>_` (קודקוד, `_s` פיצול), כך שזיהוי
 * המקטעים שהנתיב עבר בהם ממשיך לעבוד לפי הקידומת.
 */
export function buildRoadGraph(routes, attach = []) {
  const nodes = {};
  const graph = {};
  const ensure = id => (graph[id] = graph[id] || []);
  const addEdge = (a, b, cost) => { ensure(a).push({ to: b, cost }); ensure(b); };
  const link = (a, b, cost) => { if (a === b) return; addEdge(a, b, cost); addEdge(b, a, cost); };

  // הטלה מקומית למטרים - כל הגאומטריה (חיתוך, ניצב) במישור, כמו על המפה
  const allPts = [];
  for (const r of routes) for (const w of r.waypoints || []) {
    const lat = num(w.lat), lon = num(w.lon ?? w.lng);
    if (Number.isFinite(lat) && Number.isFinite(lon)) allPts.push({ lat, lon });
  }
  for (const a of attach) if (a?.geo) allPts.push(a.geo);
  const lat0 = allPts.length ? allPts.reduce((s, p) => s + p.lat, 0) / allPts.length : 0;
  const lon0 = allPts.length ? allPts.reduce((s, p) => s + p.lon, 0) / allPts.length : 0;
  const KX = 111320 * Math.cos(lat0 * Math.PI / 180), KY = 110574;
  const toXY = (lat, lon) => ({ x: (lon - lon0) * KX, y: (lat - lat0) * KY });

  // ── קטעים ──────────────────────────────────────────────────────────────
  const segs = [];
  const byRoute = new Map();
  for (const route of routes) {
    const direction = normalizeDirection(route.direction);
    const list = [];
    let prev = null;
    (route.waypoints || []).forEach((wp, i) => {
      const lat = num(wp.lat), lon = num(wp.lon ?? wp.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) { prev = null; return; }
      const id = `r${route.id}_${i}`;
      const xPct = num(wp.x ?? wp.x_pct), yPct = num(wp.y ?? wp.y_pct);
      nodes[id] = {
        lat, lon,
        xPct: Number.isFinite(xPct) ? xPct : null, yPct: Number.isFinite(yPct) ? yPct : null,
        routeId: route.id, routeType: route.route_type || 'vehicle', routeName: route.name, wpIndex: i,
        ...toXY(lat, lon),
      };
      ensure(id);
      if (prev) list.push({ route, direction, a: prev, b: id, splits: [] });
      prev = id;
    });
    for (const s of list) {
      const A = nodes[s.a], B = nodes[s.b];
      s.len = Math.hypot(B.x - A.x, B.y - A.y);
      s.minX = Math.min(A.x, B.x); s.maxX = Math.max(A.x, B.x);
      s.minY = Math.min(A.y, B.y); s.maxY = Math.max(A.y, B.y);
    }
    segs.push(...list);
    byRoute.set(route.id, list);
  }

  let splitSeq = 0;
  /** צומת על הקטע בפרמטר t (0..1). ליד קודקוד - הקודקוד עצמו */
  const splitAt = (s, t) => {
    if (t * s.len <= SAME_POINT_M) return s.a;
    if ((1 - t) * s.len <= SAME_POINT_M) return s.b;
    const A = nodes[s.a], B = nodes[s.b];
    const id = `r${s.route.id}_s${splitSeq++}`;
    const lerp = (u, v) => (u == null || v == null ? null : u + (v - u) * t);
    const lat = A.lat + (B.lat - A.lat) * t, lon = A.lon + (B.lon - A.lon) * t;
    nodes[id] = {
      lat, lon, xPct: lerp(A.xPct, B.xPct), yPct: lerp(A.yPct, B.yPct),
      routeId: A.routeId, routeType: A.routeType, routeName: A.routeName,
      ...toXY(lat, lon),
    };
    ensure(id);
    s.splits.push({ t, id });
    return id;
  };

  /** הנקודה הקרובה על הקטע לנקודה p: `{ t, d }` */
  const footOn = (s, p) => {
    const A = nodes[s.a], B = nodes[s.b];
    const dx = B.x - A.x, dy = B.y - A.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / L2)) : 0;
    return { t, d: Math.hypot(A.x + dx * t - p.x, A.y + dy * t - p.y) };
  };
  /** רגל הניצב הקרובה על נתיב שלם */
  const footOnRoute = (routeId, p) => {
    let best = null;
    for (const s of byRoute.get(routeId) || []) {
      const f = footOn(s, p);
      if (!best || f.d < best.d) best = { seg: s, ...f };
    }
    return best;
  };

  // ── 1. חיתוכים בין נתיבים ─────────────────────────────────────────────
  // נאספים קודם ומפוצלים אחר כך: פיצול תוך כדי היה משנה קטעים באמצע הסריקה
  const hits = [];
  for (let i = 0; i < segs.length; i++) {
    const s1 = segs[i];
    for (let j = i + 1; j < segs.length; j++) {
      const s2 = segs[j];
      if (s1.route.id === s2.route.id) continue;
      if (s1.maxX < s2.minX || s2.maxX < s1.minX || s1.maxY < s2.minY || s2.maxY < s1.minY) continue;
      const P = nodes[s1.a], P2 = nodes[s1.b], Q = nodes[s2.a], Q2 = nodes[s2.b];
      const rx = P2.x - P.x, ry = P2.y - P.y, sx = Q2.x - Q.x, sy = Q2.y - Q.y;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-9) continue; // מקבילים - קצוות צמודים נתפסים בשלב 2
      const qx = Q.x - P.x, qy = Q.y - P.y;
      const t = (qx * sy - qy * sx) / den;
      const u = (qx * ry - qy * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      hits.push({ s1, t, s2, u });
    }
  }
  for (const h of hits) link(splitAt(h.s1, h.t), splitAt(h.s2, h.u), 0);

  // ── 2. קצה נתיב ליד נתיב אחר - צומת T, חיבור בניצב ──────────────────
  for (const [routeId, list] of byRoute) {
    if (!list.length) continue;
    for (const endId of [list[0].a, list[list.length - 1].b]) {
      const p = nodes[endId];
      for (const otherId of byRoute.keys()) {
        if (otherId === routeId) continue;
        const f = footOnRoute(otherId, p);
        if (!f || f.d > ENDPOINT_SNAP_M) continue;
        link(endId, splitAt(f.seg, f.t), f.d);
      }
    }
  }

  // ── 3. נקודות השרשרת - בניצב לנתיב הקרוב ─────────────────────────────
  // רק לנתיב הקרוב (ולנתיבים שקרובים כמוהו, למשל בצומת). לא לכל נתיב ברדיוס:
  // חיבור לנתיב רחוק יותר הוא בדיוק הקיצור מחוץ לכביש שהפקח רואה כשגוי.
  for (const a of attach) {
    const { key, geo, ...extra } = a;
    const p = toXY(geo.lat, geo.lon);
    nodes[key] = { routeType: 'virtual', xPct: null, yPct: null, ...extra, lat: geo.lat, lon: geo.lon, ...p };
    ensure(key);
    const feet = [...byRoute.keys()].map(id => footOnRoute(id, p)).filter(Boolean);
    if (!feet.length) continue;
    const min = Math.min(...feet.map(f => f.d));
    for (const f of feet) {
      if (f.d > min + ATTACH_TIE_M) continue;
      link(key, splitAt(f.seg, f.t), f.d);
    }
  }

  // ── 4. קשתות לאורך הקטעים, לפי כיוון הנסיעה ──────────────────────────
  for (const s of segs) {
    const chain = [s.a, ...s.splits.sort((x, y) => x.t - y.t).map(x => x.id), s.b];
    for (let i = 1; i < chain.length; i++) {
      const u = chain[i - 1], v = chain[i];
      if (u === v) continue;
      const cost = haversineM(nodes[u].lat, nodes[u].lon, nodes[v].lat, nodes[v].lon);
      if (s.direction !== 'backward') addEdge(u, v, cost);
      if (s.direction !== 'forward') addEdge(v, u, cost);
    }
  }

  // הקואורדינטות המישוריות הן עזר פנימי - לא חלק מהצומת שיוצא החוצה
  for (const n of Object.values(nodes)) { delete n.x; delete n.y; }
  return { nodes, graph };
}

/**
 * A* על הגרף. `edgeCost(from, to, cost)` - עלות מותאמת לקשת (חלופות נתיב: קנס
 * על מקטע). בלעדיו - המרחק. מחזיר שרשרת מזהים או `null` כשאין דרך.
 */
export function astarPath(graph, nodes, startId, endId, edgeCost = null) {
  if (!nodes[startId] || !nodes[endId]) return null;
  const h = id => haversineM(nodes[id].lat, nodes[id].lon, nodes[endId].lat, nodes[endId].lon);
  const open = new Map([[startId, h(startId)]]);
  const cameFrom = {};
  const gScore = { [startId]: 0 };
  while (open.size > 0) {
    let current = null, lowestF = Infinity;
    for (const [id, f] of open) { if (f < lowestF) { lowestF = f; current = id; } }
    if (current === endId) {
      const path = [];
      let c = current;
      while (c !== undefined) { path.unshift(c); c = cameFrom[c]; }
      return path;
    }
    open.delete(current);
    for (const { to, cost } of (graph[current] || [])) {
      if (!nodes[to]) continue;
      const tg = gScore[current] + (edgeCost ? edgeCost(current, to, cost) : cost);
      if (tg < (gScore[to] ?? Infinity)) {
        cameFrom[to] = current;
        gScore[to] = tg;
        open.set(to, tg + h(to));
      }
    }
  }
  return null;
}

/** קיצור לבדיקות ולצרכן יחיד: הנתיב הקצר בגרף שבנה `buildRoadGraph` */
export function shortestPath({ graph, nodes }, startId, endId, edgeCost = null) {
  return astarPath(graph, nodes, startId, endId, edgeCost);
}
