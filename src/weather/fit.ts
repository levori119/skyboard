// התאמת מפת Windy לעיגון של מפת השדה.
//
// הבעיה: מפת השדה היא **תמונה** עם שני עוגנים (utils/geo.ts), כלומר מיפוי
// לינארי בין אחוזי תמונה לקו רוחב/אורך. מפת Windy היא Leaflet במרקטור, עם
// רמות זום שלמות בלבד. כדי שענן גשם ייפול על הנקודה הנכונה בסדק, צריך למצוא
// את הזום שהכי קרוב לקנה המידה של המפה שלנו - ואז לתקן את השארית ב-CSS scale.
//
// למה זה עובד: `scale` על iframe מותח את כל תוכנו במידה אחידה, בדיוק כמו על
// תמונה. השכבה יושבת **בתוך** שכבת ה-transform של המפה (כמו AirPictureLayer),
// ולכן פאן וזום של המפה זזים איתה בלי לטעון את ה-iframe מחדש.

import type { MapGeoAnchor } from '../utils/geo';
import { imagePctToGeo } from '../utils/geo';

export interface FitBox { top: number; left: number; width: number; height: number }

export interface WindyFit {
  /** רמת הזום של Leaflet שנשלחת ל-Windy (שלמה). */
  zoom: number;
  centerLat: number;
  centerLon: number;
  /** גודל ה-iframe **לפני** ה-scale, בפיקסלים. */
  frameW: number;
  frameH: number;
  scaleX: number;
  scaleY: number;
}

/** גודל אריח Leaflet - קבוע התשתית שממנו נגזר קנה המידה בכל רמת זום. */
const TILE = 256;

/**
 * גבולות הזום. מתחת ל-2 אין מה להציג בשדה, ומעל 15 אריחי המז"א של Windy
 * ממילא נמתחים - ורק מכבידים.
 */
const MIN_ZOOM = 2;
const MAX_ZOOM = 15;

/**
 * ה-iframe נבנה גדול מהחלון שרואים ממנו, וממורכז בו. הטבעת העודפת נחתכת
 * ב-`overflow: hidden` - ואיתה גם הלוגו, סרגל הזמן והמקרא של Windy, שמוצמדים
 * לשולי המסגרת. בלי זה סרגל הזמן היה יושב לרוחב תחתית מפת השדה.
 */
export const OVERSCAN = 1.5;

/**
 * חסם על העיוות בין הצירים. מפה תעופתית היא קונפורמית ולכן היחס יוצא ~1;
 * יחס קיצוני מעיד על עוגנים שגויים, ואז עדיף להציג מז"א מעט לא מדויק מאשר
 * תמונה מרוחה על כל המסך.
 */
const MAX_ASPECT_SKEW = 3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * מחשב זום, מרכז וסקייל ל-iframe של Windy כך שיתלכד עם תמונת המפה.
 * `null` = אי-אפשר להתאים (אין עוגן, אין גבולות, או עוגן מנוון).
 */
export function fitWindyToMap(
  anchor: MapGeoAnchor | null | undefined,
  bounds: FitBox | null | undefined,
  overscan: number = OVERSCAN,
): WindyFit | null {
  if (!anchor || !bounds) return null;
  if (!(bounds.width > 0) || !(bounds.height > 0)) return null;
  if (anchor.x2 === anchor.x1 || anchor.y2 === anchor.y1) return null;

  const nw = imagePctToGeo(0, 0, anchor);
  const se = imagePctToGeo(100, 100, anchor);
  const center = imagePctToGeo(50, 50, anchor);

  const degLon = Math.abs(se.lon - nw.lon);
  const degLat = Math.abs(nw.lat - se.lat);
  if (!Number.isFinite(degLon) || !Number.isFinite(degLat) || degLon <= 0 || degLat <= 0) return null;
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lon)) return null;

  const pxPerDegLon = bounds.width / degLon;
  const pxPerDegLat = bounds.height / degLat;

  // הזום נגזר מציר קו האורך, שבו מרקטור לינארי ולכן ההתאמה מדויקת.
  const zoom = clamp(Math.round(Math.log2((pxPerDegLon * 360) / TILE)), MIN_ZOOM, MAX_ZOOM);
  const worldPxPerDegLon = (TILE * 2 ** zoom) / 360;

  // במרקטור ציר הרוחב מתוח פי 1/cos(φ) מציר האורך. בלי התיקון הזה שכבת המז"א
  // הייתה מתלכדת לרוחב ומחליקה למעלה/למטה בקצוות - שגיאה של קילומטרים בקצה מפה.
  const cosLat = Math.max(0.05, Math.cos((center.lat * Math.PI) / 180));

  const scaleX = pxPerDegLon / worldPxPerDegLon;
  const scaleY = clamp(
    pxPerDegLat / (worldPxPerDegLon / cosLat),
    scaleX / MAX_ASPECT_SKEW,
    scaleX * MAX_ASPECT_SKEW,
  );

  return {
    zoom,
    centerLat: center.lat,
    centerLon: center.lon,
    frameW: Math.max(1, Math.round((bounds.width / scaleX) * overscan)),
    frameH: Math.max(1, Math.round((bounds.height / scaleY) * overscan)),
    scaleX,
    scaleY,
  };
}

/**
 * מרכז המפה בלבד - לחלון הצף, שאין לו גבולות תמונה להתאים אליהם אבל כן צריך
 * להיפתח מעל השדה ולא מעל אמצע האוקיינוס.
 */
export function anchorCenter(anchor: MapGeoAnchor | null | undefined): { lat: number; lon: number } | null {
  if (!anchor || anchor.x2 === anchor.x1 || anchor.y2 === anchor.y1) return null;
  const c = imagePctToGeo(50, 50, anchor);
  return Number.isFinite(c.lat) && Number.isFinite(c.lon) ? c : null;
}
