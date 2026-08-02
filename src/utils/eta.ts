import { AircraftIconType } from '../types';
import { isHeliAircraftType } from './aircraft';
import { imagePctToGeo, type MapGeoAnchor } from './geo';

// ─── זמן טיסה אוטומטי לנקודת העברה ────────────────────────────────────────────
// מפה מעוגנת -> יש נ"צ לפ"מ ולנקודת ההעברה -> טווח במיילים ימיים -> זמן.
// הנוסחה: מהירות * זמן = מרחק  =>  זמן = מרחק / מהירות.
// המרחק הוא קו ישר (great circle) בתוספת מקדם, כי המטוס לא באמת טס קו ישר.

/** תוספת על הקו הישר - המסלול בפועל ארוך יותר */
export const ROUTE_FACTOR = 1.1;
/** מהירות שיוט מטוס קרב, בקשר (מייל ימי לשעה) */
export const SPEED_FIGHTER_KT = 350;
/** מהירות שיוט מסוק / מטוס תובלה / כטמ"מ, בקשר */
export const SPEED_HELI_TRANSPORT_KT = 120;

/** רדיוס כדור הארץ במייל ימי */
const EARTH_RADIUS_NM = 3440.065;

/** סוגים איטיים שאינם מסוקים: תובלה וכטמ"מ */
const SLOW_TYPES: AircraftIconType[] = ['b707', 'gulfstream', 'c130', 'uav'];

/**
 * מהירות שיוט לפי סוג הפ"מ (`strips.strip_type` / "יצירה מהירה"), בקשר.
 * הסדר משמעותי - ההתאמה היא לפי הכלה, והראשונה שמתאימה קובעת.
 */
const STRIP_TYPE_SPEED_KT: [string, number][] = [
  ['מסוק', SPEED_HELI_TRANSPORT_KT],
  ['תובלה', SPEED_HELI_TRANSPORT_KT],
  ['GA', SPEED_HELI_TRANSPORT_KT],
  ['אז"מ', 90],
  ['מרסס', 80],
  ['דאון', 50],
  ['רחפן', 20],
  ['טיסן', 20],
];

export interface GeoPoint { lat: number; lon: number }

export interface TransferEta {
  /** טווח אווירי ישיר, במייל ימי */
  distanceNm: number;
  /** המהירות ששימשה לחישוב, בקשר */
  speedKt: number;
  /** זמן מוערך עד נקודת ההעברה, בדקות (כולל ROUTE_FACTOR) */
  minutes: number;
}

/** התוצאה כפי שהיא מוצגת בטופס - עם האזור שממנו נמדד הטווח, אם היה כזה */
export interface AutoEta extends TransferEta {
  fromZone?: string;
}

const isFiniteNum = (n: unknown): n is number => typeof n === 'number' && isFinite(n);

const isValidPoint = (p: GeoPoint | null | undefined): p is GeoPoint =>
  !!p && isFiniteNum(p.lat) && isFiniteNum(p.lon);

/** טווח בקו ישר בין שתי נקודות נ"צ, במייל ימי */
export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * מהירות שיוט לפי סוג המטוס.
 * `planeType` (סוג הפ"מ, למשל "מסוק אזרחי") גובר על הסיווג לפי טייסת.
 */
export function cruiseSpeedKt(acType: AircraftIconType, planeType?: string | null): number {
  const pt = String(planeType || '');
  if (pt) {
    const hit = STRIP_TYPE_SPEED_KT.find(([name]) => pt.includes(name));
    if (hit) return hit[1];
  }
  if (isHeliAircraftType(acType) || SLOW_TYPES.includes(acType)) return SPEED_HELI_TRANSPORT_KT;
  return SPEED_FIGHTER_KT;
}

/** זמן טיסה בדקות לטווח נתון: (מרחק * מקדם) / מהירות. מעוגל, מינימום דקה כשיש טווח */
export function etaMinutesFor(distanceNm: number, speedKt: number): number {
  if (!isFiniteNum(distanceNm) || !isFiniteNum(speedKt) || distanceNm <= 0 || speedKt <= 0) return 0;
  return Math.max(1, Math.round(distanceNm * ROUTE_FACTOR / speedKt * 60));
}

/**
 * זמן מוערך מעזיבת הפ"מ ועד נקודת ההעברה.
 * מחזיר null כשאין נ"צ לאחד הצדדים (מפה לא מעוגנת / פ"מ לא על המפה).
 */
export function computeTransferEta(
  from: GeoPoint | null | undefined,
  to: GeoPoint | null | undefined,
  acType: AircraftIconType,
  planeType?: string | null,
): TransferEta | null {
  if (!isValidPoint(from) || !isValidPoint(to)) return null;
  const distanceNm = haversineNm(from.lat, from.lon, to.lat, to.lon);
  const speedKt = cruiseSpeedKt(acType, planeType);
  return { distanceNm, speedKt, minutes: etaMinutesFor(distanceNm, speedKt) };
}

// ─── מיקום על המפה → נ"צ ──────────────────────────────────────────────────────

/** גבולות תמונת המפה בתוך המכל, בפיקסלים */
export interface ImgBounds { left: number; top: number; width: number; height: number }

/** פין/מרקר של נקודת העברה כפי שהוא יושב על המפה */
export interface TransferPointMarker {
  sectorId: number;
  x: number;
  y: number;
  subLabel?: string;
  lat?: number | null;
  lon?: number | null;
}

/** נ"צ מנקודה בפיקסלים של המכל. null כשהמפה לא מעוגנת או שהתמונה עוד לא נמדדה */
export function pixelToGeo(
  px: number, py: number,
  bounds: ImgBounds | null | undefined,
  anchor: MapGeoAnchor | null | undefined,
): GeoPoint | null {
  if (!anchor || !bounds || !(bounds.width > 0) || !(bounds.height > 0)) return null;
  if (!isFiniteNum(px) || !isFiniteNum(py)) return null;
  return imagePctToGeo(((px - bounds.left) / bounds.width) * 100, ((py - bounds.top) / bounds.height) * 100, anchor);
}

/** נ"צ הפ"מ כפי שנשמר בהנחה על המפה (`map_lat`/`map_lon`) */
export function stripSavedGeo(strip: any): GeoPoint | null {
  if (!strip || strip.map_lat == null || strip.map_lon == null) return null;
  const p = { lat: Number(strip.map_lat), lon: Number(strip.map_lon) };
  return isValidPoint(p) ? p : null;
}

/**
 * נ"צ הפ"מ מהפין שלו על המפה. `map_pin_x/y` הם state מקומי בלבד (לא חוזרים
 * מהשרת), ולכן זו נפילה־לאחור לפ"מ שהונח לפני שהמפה עוגנה - באותו סשן.
 */
export function stripPinGeo(
  strip: any,
  bounds: ImgBounds | null | undefined,
  anchor: MapGeoAnchor | null | undefined,
): GeoPoint | null {
  if (!strip || strip.map_pin_x == null || strip.map_pin_y == null) return null;
  return pixelToGeo(Number(strip.map_pin_x), Number(strip.map_pin_y), bounds, anchor);
}

/**
 * הנקודה בפוליגון האזור הקרובה ביותר ליעד - ממנה יטוס הפ"מ בפועל.
 * יעד שנמצא **בתוך** האזור מוחזר כמו שהוא (טווח 0 - הפ"מ כבר שם).
 *
 * העבודה נעשית במישור מקומי סביב היעד (מייל ימי לציר), כי מעלת אורך מתקצרת
 * עם קו הרוחב - חישוב ישיר על lat/lon היה מטה את הנקודה הקרובה מזרחה/מערבה.
 */
export function closestGeoOnPolygon(polygon: GeoPoint[], target: GeoPoint): GeoPoint | null {
  if (!Array.isArray(polygon) || polygon.length === 0 || !isValidPoint(target)) return null;
  const verts = polygon.filter(isValidPoint);
  if (verts.length === 0) return null;

  const NM_PER_DEG = 60;
  const lonScale = NM_PER_DEG * Math.cos(target.lat * Math.PI / 180);
  const toXY = (p: GeoPoint) => ({ x: (p.lon - target.lon) * lonScale, y: (p.lat - target.lat) * NM_PER_DEG });
  const toGeo = (q: { x: number; y: number }): GeoPoint => ({
    lat: target.lat + q.y / NM_PER_DEG,
    lon: target.lon + (lonScale === 0 ? 0 : q.x / lonScale),
  });
  const pts = verts.map(toXY);

  // היעד (ראשית הצירים) בתוך הפוליגון? ray casting
  if (pts.length >= 3) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > 0) !== (b.y > 0) && 0 < (b.x - a.x) * (0 - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    if (inside) return target;
  }

  if (pts.length === 1) return toGeo(pts[0]);

  let best = pts[0];
  let bestD2 = best.x ** 2 + best.y ** 2;
  // צלע אחרונה→ראשונה נסגרת רק בפוליגון (3+), לא בקטע בודד
  const segments = pts.length > 2 ? pts.length : 1;
  for (let i = 0; i < segments; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d2 = q.x ** 2 + q.y ** 2;
    if (d2 < bestD2) { bestD2 = d2; best = q; }
  }
  return toGeo(best);
}

/**
 * נ"צ נקודת ההעברה המסומנת על המפה, לפי סקטור (ותת-נקודה אם יש).
 * מעדיף את הנ"צ השמור בנקודה; אחרת גוזר מהמיקום על המפה.
 */
export function transferPointGeo(
  points: TransferPointMarker[],
  toSectorId: number,
  subLabel: string | undefined,
  bounds: ImgBounds | null | undefined,
  anchor: MapGeoAnchor | null | undefined,
): GeoPoint | null {
  const forSector = points.filter(p => Number(p.sectorId) === Number(toSectorId));
  const pin = (subLabel ? forSector.find(p => p.subLabel === subLabel) : null) || forSector[0];
  if (!pin) return null;
  if (pin.lat != null && pin.lon != null) {
    const p = { lat: Number(pin.lat), lon: Number(pin.lon) };
    if (isValidPoint(p)) return p;
  }
  if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) return null;
  // שכבת הפינים מפרשת ערך ≤1.5 כשבר של המכל, אחרת כפיקסלים
  const px = Math.abs(pin.x) <= 1.5 ? bounds.left + pin.x * bounds.width : pin.x;
  const py = Math.abs(pin.y) <= 1.5 ? bounds.top + pin.y * bounds.height : pin.y;
  return pixelToGeo(px, py, bounds, anchor);
}
