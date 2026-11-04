/**
 * **מרחב בלוקים על המפה - חלוקה לפי מיקום המטרה.**
 *
 * מרחב בלוקים מקושר בניהול לאזור אחד או יותר על מפה מעוגנת (`block_spaces.zone_ids`).
 * המטרה **לא** נמצאת בתוך המרחב - מהמרחב יוצאים לתקוף אותה. לכן אין כאן
 * "נקודה בתוך פוליגון": המרחב המומלץ הוא זה שהמרכז שלו הכי קרוב לנ"צ המטרה.
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

/**
 * המרחב שהמרכז שלו הכי קרוב למטרה. מרחב בלי מרכז (לא קושר לאזורים) לא מתמודד.
 * null כשאין מטרה או אין אף מרחב עם מרכז.
 */
export function nearestSpace(target, spaces) {
  if (!target || !Number.isFinite(Number(target.lat)) || !Number.isFinite(Number(target.lon))) return null;
  let best = null, bestD = Infinity;
  for (const s of Array.isArray(spaces) ? spaces : []) {
    const lat = Number(s?.center_lat), lon = Number(s?.center_lon);
    if (s?.center_lat == null || s?.center_lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const d = distanceNm({ lat: Number(target.lat), lon: Number(target.lon) }, { lat, lon });
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}
