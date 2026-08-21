export interface MapGeoAnchor {
  x1: number; y1: number; lat1: number; lon1: number;
  x2: number; y2: number; lat2: number; lon2: number;
  /**
   * ההיטל של התמונה. **ברירת המחדל `linear` היא ההתנהגות ההיסטורית** של כל
   * המפות בטבלת `maps`, ולכן קוד קיים אינו משתנה בכלל.
   *
   * `mercator` נחוץ למפות שמגיעות מ**מאגר התמונ"א (ATSIM)**: מפה שצולמה ממפת
   * רשת היא במרקטור, ושם מעלת רוחב **מתארכת** ככל שמתרחקים מקו המשווה.
   * מתיחה ליניארית של מפה כזו מזיזה מטוס בכמה קילומטרים באמצע התמונה - סטייה
   * שלא נראית לעין על התמונה עצמה, וזה בדיוק הכשל השקט שאין להרשות כאן.
   */
  projection?: 'linear' | 'mercator';
}

/**
 * קו רוחב → y מנורמל במרקטור. הפונקציה שהופכת את ההיטל ללינארי, כך שאותה
 * אינטרפולציה בשתי נקודות עובדת לשני ההיטלים.
 */
const MAX_LAT = 85.05112878;
const latToMerc = (lat: number): number => {
  const s = Math.sin((Math.min(MAX_LAT, Math.max(-MAX_LAT, lat)) * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const mercToLat = (y: number): number => {
  const n = Math.PI * (1 - 2 * y);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};

/** המרחב שבו קו הרוחב ליניארי, לפי ההיטל. */
const latSpace = (a: MapGeoAnchor) => (a.projection === 'mercator'
  ? { to: latToMerc, from: mercToLat }
  : { to: (lat: number) => lat, from: (v: number) => v });

export const buildGeoAnchor = (m: Record<string, unknown> | null): MapGeoAnchor | null => {
  if (!m?.anchor1_lat || !m?.anchor2_lat || m.anchor1_x_img == null || m.anchor2_x_img == null) return null;
  return {
    x1: m.anchor1_x_img as number, y1: m.anchor1_y_img as number,
    lat1: Number(m.anchor1_lat), lon1: Number(m.anchor1_lon),
    x2: m.anchor2_x_img as number, y2: m.anchor2_y_img as number,
    lat2: Number(m.anchor2_lat), lon2: Number(m.anchor2_lon),
  };
};

export const geoToImagePct = (lat: number, lon: number, a: MapGeoAnchor): { x: number; y: number } => {
  const S = latSpace(a);
  const tx = (lon - a.lon1) / (a.lon2 - a.lon1);
  const ty = (S.to(lat) - S.to(a.lat1)) / (S.to(a.lat2) - S.to(a.lat1));
  return { x: a.x1 + tx * (a.x2 - a.x1), y: a.y1 + ty * (a.y2 - a.y1) };
};

export const imagePctToGeo = (xImg: number, yImg: number, a: MapGeoAnchor): { lat: number; lon: number } => {
  const S = latSpace(a);
  const tx = (xImg - a.x1) / (a.x2 - a.x1);
  const ty = (yImg - a.y1) / (a.y2 - a.y1);
  return {
    lat: S.from(S.to(a.lat1) + ty * (S.to(a.lat2) - S.to(a.lat1))),
    lon: a.lon1 + tx * (a.lon2 - a.lon1),
  };
};

export const fmtDms = (dec: number, isLat: boolean): string => {
  const abs = Math.abs(dec);
  const d = Math.floor(abs);
  const mFull = (abs - d) * 60;
  const m = Math.floor(mFull);
  const s = ((mFull - m) * 60).toFixed(1);
  const dir = isLat ? (dec >= 0 ? 'N' : 'S') : (dec >= 0 ? 'E' : 'W');
  return `${dir}${d}°${String(m).padStart(2, '0')}'${parseFloat(s) < 10 ? '0' : ''}${s}"`;
};
