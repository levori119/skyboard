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

// ── הדבקת נ"צ לעיגון מפה ─────────────────────────────────────────────────────
//
// הנ"צ של נקודת העוגן מגיע בדרך כלל מ-Google Earth / Google Maps (לחיצה ימנית
// מעתיקה `31.819509, 34.796090`), או מ-Google Earth Pro במעלות-דקות-שניות
// (`31°49'10.23"N, 34°47'45.92"E`). במקום להקליד שש תיבות ביד - מדביקים את השורה
// והיא מתפרקת לשדות N/E מעלות-דקות-שניות (פורמט חה"א).

const inRange = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** `31.819509, 34.796090` (גם עם `°N`/`°E` או מינוס) → `{lat, lon}` או `null` */
const parseDecimalPair = (raw: string): { lat: number; lon: number } | null => {
  const m = /^([NS])?\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*(?:[,;/]\s*|\s+)([EW])?\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?$/.exec(raw);
  if (!m) return null;
  let lat = Number(m[2]), lon = Number(m[5]);
  if ((m[1] || m[3]) === 'S') lat = -Math.abs(lat);
  if ((m[4] || m[6]) === 'W') lon = -Math.abs(lon);
  return inRange(lat, lon) ? { lat, lon } : null;
};

/** `31°49'10.23"N, 34°47'45.92"E` (אות המחצית לפני או אחרי) → `{lat, lon}` או `null` */
const parseDmsPair = (raw: string): { lat: number; lon: number } | null => {
  const re = /([NSEW])?\s*(\d+)\s*°\s*(\d+)\s*['′]\s*(\d+(?:\.\d+)?)\s*(?:"|″|'')?\s*([NSEW])?/g;
  const parts = [...raw.matchAll(re)];
  if (parts.length !== 2) return null;
  // השארית (מפרידים בלבד) - לא לבלוע משפט שרק מכיל נ"צ בתוכו
  if (raw.replace(re, '').replace(/[\s,;/]/g, '')) return null;
  const val = (p: RegExpMatchArray) => {
    const d = Number(p[2]), mi = Number(p[3]), s = Number(p[4]);
    if (mi >= 60 || s >= 60) return NaN;
    const dec = d + mi / 60 + s / 3600;
    const h = p[1] || p[5];
    return h === 'S' || h === 'W' ? -dec : dec;
  };
  const lat = val(parts[0]), lon = val(parts[1]);
  return inRange(lat, lon) ? { lat, lon } : null;
};

/**
 * שורת נ"צ בכל פורמט נפוץ → `{lat, lon}`, או `null`:
 * עשרוני (Google Earth / Maps), מעלות-דקות-שניות (Google Earth Pro) או DDM (`N3212.450 E03456.820`).
 */
export const parseAnyCoordPair = (text: string): { lat: number; lon: number } | null => {
  const raw = String(text || '').trim().toUpperCase();
  if (!raw) return null;
  return parseDecimalPair(raw) ?? parseDmsPair(raw) ?? parseCoordPair(raw);
};

/**
 * מעלות עשרוניות → שדות העוגן `{deg, min, sec, dir}` (מחרוזות, כמו ב-state של הטופס).
 * השניות בשתי ספרות אחרי הנקודה (~30 ס"מ) כדי לא לאבד את הדיוק של Google Earth.
 */
export const decimalToDmsFields = (dec: number, isLat: boolean) => {
  const dir = isLat ? (dec >= 0 ? 'N' : 'S') : (dec >= 0 ? 'E' : 'W');
  const abs = Math.abs(dec);
  let d = Math.floor(abs);
  let m = Math.floor((abs - d) * 60);
  let s = +((((abs - d) * 60) - m) * 60).toFixed(2);
  // עיגול עלול להגיע ל-60.00 שניות / 60 דקות - נשיאה למעלה
  if (s >= 60) { s = 0; m += 1; }
  if (m >= 60) { m = 0; d += 1; }
  return { deg: String(d), min: String(m), sec: s.toFixed(2), dir };
};
