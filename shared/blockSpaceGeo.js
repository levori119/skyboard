/**
 * **מרחב בלוקים על המפה - חלוקה לפי מיקום המטרה.**
 *
 * מרחב בלוקים מקושר בניהול לאזור אחד או יותר על מפה מעוגנת (`block_spaces.zone_ids`).
 * המטרה **לא** נמצאת בתוך המרחב - מהמרחב יוצאים לתקוף אותה. המרחב המומלץ הוא
 * זה ש**הפוליגון** שלו הכי קרוב למטרה (הקצה הקרוב, 0 כשהמטרה בתוכו), ורק בלי
 * פוליגון - המרכז. קודם נמדד המרכז, ומרחב קדמי מוארך (שמרכזו רחוק) הפסיד
 * למרחב אחורי קומפקטי - פ"מים "נשלחו" לגזרות אחוריות, רחוק מהמטרות.
 *
 * משותף לשרת (מחשב את המרכז ב-GET /api/block-spaces) וללקוח (בוחר את הקרוב).
 */

/** מרכז מסה של פוליגון [{lat,lon}] + שטחו (ביחידות מעלות², רק להשוואה) */
export function polygonCentroid(points) {
  const pts = (Array.isArray(points) ? points : [])
    .map(p => ({ lat: Number(p?.lat), lon: Number(p?.lon) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!pts.length) return null;
  let a2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const cross = p.lon * q.lat - q.lon * p.lat;
    a2 += cross;
    cx += (p.lon + q.lon) * cross;
    cy += (p.lat + q.lat) * cross;
  }
  // פוליגון מנוון (קו, נקודה) - ממוצע הקודקודים במקום חלוקה באפס
  if (Math.abs(a2) < 1e-12) {
    const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
    return { lat, lon, area: 0 };
  }
  return { lat: cy / (3 * a2), lon: cx / (3 * a2), area: Math.abs(a2) / 2 };
}

/**
 * מרכז המרחב מכל האזורים שלו: ממוצע משוקלל-שטח של מרכזי האזורים (אזור גדול
 * מושך יותר). כשכולם מנוונים - ממוצע פשוט. null כשאין אף אזור עם נ"צ.
 */
export function spaceCenter(polygons) {
  const cs = (Array.isArray(polygons) ? polygons : []).map(polygonCentroid).filter(Boolean);
  if (!cs.length) return null;
  const total = cs.reduce((s, c) => s + c.area, 0);
  if (total <= 0) {
    return { lat: cs.reduce((s, c) => s + c.lat, 0) / cs.length, lon: cs.reduce((s, c) => s + c.lon, 0) / cs.length };
  }
  return {
    lat: cs.reduce((s, c) => s + c.lat * c.area, 0) / total,
    lon: cs.reduce((s, c) => s + c.lon * c.area, 0) / total,
  };
}

const R_NM = 3440.065;
const rad = d => (d * Math.PI) / 180;

/** מרחק ב-NM בין שתי נקודות (haversine) */
export function distanceNm(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const validPt = p => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon));

/** מרחק ב-NM מנקודה לפוליגון: 0 בתוכו, אחרת לקצה הקרוב (הטלה מקומית - מרחקים של עשרות מייל) */
export function distanceToPolygonNm(pt, polygon) {
  const ring = (Array.isArray(polygon) ? polygon : []).filter(validPt).map(p => ({ lat: Number(p.lat), lon: Number(p.lon) }));
  if (ring.length < 3) return Infinity;
  const k = Math.cos(rad(Number(pt.lat))) * 60;
  const xy = p => ({ x: p.lon * k, y: p.lat * 60 });
  const P = xy({ lat: Number(pt.lat), lon: Number(pt.lon) });
  const R = ring.map(xy);
  let inside = false, best = Infinity;
  for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
    const a = R[j], b = R[i];
    if ((b.y > P.y) !== (a.y > P.y) && P.x < ((a.x - b.x) * (P.y - b.y)) / (a.y - b.y) + b.x) inside = !inside;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((P.x - a.x) * dx + (P.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(P.x - a.x - t * dx, P.y - a.y - t * dy));
  }
  return inside ? 0 : best;
}

/** מרחק ב-NM ממטרה למרחב: לפוליגון הקרוב שלו, ובלי פוליגונים - למרכז. Infinity כשאין לו מיקום */
export function distanceToSpaceNm(target, space) {
  if (!validPt(target)) return Infinity;
  const polys = Array.isArray(space?.polygons) ? space.polygons.filter(p => Array.isArray(p) && p.length >= 3) : [];
  if (polys.length) return Math.min(...polys.map(p => distanceToPolygonNm(target, p)));
  if (space?.center_lat == null || space?.center_lon == null) return Infinity;
  const c = { lat: Number(space.center_lat), lon: Number(space.center_lon) };
  return validPt(c) ? distanceNm({ lat: Number(target.lat), lon: Number(target.lon) }, c) : Infinity;
}

/**
 * המרחב הקרוב למטרה. מרחב בלי מיקום (לא קושר לאזורים) לא מתמודד.
 * null כשאין מטרה או אין אף מרחב עם מיקום.
 */
export function nearestSpace(target, spaces) {
  let best = null, bestD = Infinity;
  for (const s of Array.isArray(spaces) ? spaces : []) {
    const d = distanceToSpaceNm(target, s);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/** המרחב הרחוק מהנקודה - "גזרה אחורית רחוקה" לפ"מ בלי מטרות */
export function farthestSpace(point, spaces) {
  let best = null, bestD = -1;
  for (const s of Array.isArray(spaces) ? spaces : []) {
    const d = distanceToSpaceNm(point, s);
    if (Number.isFinite(d) && d > bestD) { bestD = d; best = s; }
  }
  return best;
}
