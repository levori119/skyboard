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

// ── נ"צ בפורמט מעלות-דקות (DDM) ──────────────────────────────────────────────
//
// `NDDMM.mmm EDDDMM.mmm` - הפורמט שבו נ"צ מגיע לבקר/פקח בפרסומים ובמסמכי
// המשימה: מעלות ודקות (4 ספרות לרוחב, 5 לאורך) ועוד 3 ספרות של שברי דקה.
// זה אותו רעיון של נ"צ נקודות הכוונון (`src/types/aimPoints.ts`), שם השבר הוא
// בן 4 ספרות והמפריד הוא לוכסן; כאן הרזולוציה היא ~2 מטר וזה מספיק לקודקוד
// של אזור על מפה סרוקה.

/** מעלות עשרוניות → `N3212.450` / `E03456.820` */
export const fmtDdm = (dec: number, isLat: boolean): string => {
  const dir = isLat ? (dec >= 0 ? 'N' : 'S') : (dec >= 0 ? 'E' : 'W');
  const abs = Math.abs(dec);
  let d = Math.floor(abs);
  let m = (abs - d) * 60;
  // עיגול ל-3 ספרות עלול להגיע ל-60.000 דקות - נשיאה למעלה, אחרת מוצג "3260.000"
  if (+m.toFixed(3) >= 60) { m = 0; d += 1; }
  const degDigits = isLat ? 2 : 3;
  return `${dir}${String(d).padStart(degDigits, '0')}${m.toFixed(3).padStart(6, '0')}`;
};

/** `{lat, lon}` → `N3212.450 E03456.820` */
export const fmtCoordPair = (p: { lat: number; lon: number }): string =>
  `${fmtDdm(p.lat, true)} ${fmtDdm(p.lon, false)}`;

/**
 * רסיס נ"צ יחיד → מעלות עשרוניות, או `null` אם אינו תקין.
 *
 * סובלני בכוונה: הפקח מעתיק ממסמך ומקליד בעט, ולכן מתקבל גם `N3212.45`, גם
 * `3212.450N`, גם `N32 12.450` וגם נ"צ עם מעלות בלבד (`N3212`).
 */
export const parseDdm = (text: string, isLat: boolean): number | null => {
  const raw = String(text || '').trim().toUpperCase();
  if (!raw) return null;
  const hemi = isLat ? (/S/.test(raw) ? 'S' : 'N') : (/W/.test(raw) ? 'W' : 'E');
  if (isLat ? /[EW]/.test(raw) : /[NS]/.test(raw)) return null;   // אות המחצית לא תואמת לציר
  const [intPart = '', fracPart = ''] = raw.replace(/[^\d.]/g, '').split('.');
  const degDigits = isLat ? 2 : 3;
  if (intPart.length !== degDigits + 2 || fracPart.length > 4) return null;
  if (fracPart && !/^\d+$/.test(fracPart)) return null;
  const d = Number(intPart.slice(0, degDigits));
  const m = Number(`${intPart.slice(degDigits)}.${fracPart || '0'}`);
  if (!Number.isFinite(d) || !Number.isFinite(m) || m >= 60) return null;
  const dec = d + m / 60;
  if (isLat ? dec > 90 : dec > 180) return null;
  return hemi === 'S' || hemi === 'W' ? -dec : dec;
};

/**
 * שורת נ"צ מלאה → `{lat, lon}`, או `null`. מקבלת רווח, לוכסן, פסיק או שום
 * מפריד בין שני החלקים (`N3212.450/E03456.820`, `N3212.450E03456.820`).
 */
export const parseCoordPair = (text: string): { lat: number; lon: number } | null => {
  const raw = String(text || '').trim().toUpperCase();
  if (!raw) return null;
  const m = /^([NS][\d\s.]+?)\s*[/,]?\s*([EW][\d\s.]+)$/.exec(raw);
  if (!m) return null;
  const lat = parseDdm(m[1], true);
  const lon = parseDdm(m[2], false);
  return lat === null || lon === null ? null : { lat, lon };
};
