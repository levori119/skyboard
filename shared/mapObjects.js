// אובייקטים על מפה - צורות בשם, צבע וגודל שמנהל המערכת ממקם בהגדרת המפה,
// והעמדה מציגה על אותה מפה. ראה MAP_OBJECTS_SPEC.md.
//
// מקור אמת **יחיד** לשרת וללקוח: אותו נרמול רץ ב-POST/PUT בשרת
// (server/routes/maps.js) ובקליטה בלקוח (src/utils/mapObjects.ts), כדי ששורה
// שנשמרה תמיד תצויר, ושורה פגומה (צורה לא מוכרת, צבע שבור, מיקום מחוץ למפה)
// לא תפיל את השכבה כולה.
//
// יחידות - אותה מוסכמה של map_zones.polygon:
//   x, y  - אחוזים מתמונת המפה (0..100), מהפינה השמאלית העליונה.
//   size  - קוטר הצורה **באחוזים מרוחב תמונת המפה**. ולכן האובייקט גדל ומתכווץ
//           עם הזום של המפה, בדיוק כמו אזור - הוא חלק מהמפה ולא סמן מסך.

/** הצורות הנתמכות, בסדר שבו הן מוצגות בבורר. */
export const MAP_OBJECT_SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon', 'cross'];

/** גבולות הגודל (אחוז מרוחב המפה). מתחת לתחתון האובייקט נעלם, מעל העליון הוא מכסה את המפה. */
export const MAP_OBJECT_SIZE_MIN = 0.3;
export const MAP_OBJECT_SIZE_MAX = 30;
export const MAP_OBJECT_SIZE_DEFAULT = 2;

export const MAP_OBJECT_DEFAULT_COLOR = '#f59e0b';
export const MAP_OBJECT_NAME_MAX = 100;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** האם המחרוזת היא צבע hex תקין (#rgb / #rrggbb). */
export function isValidMapObjectColor(c) {
  return typeof c === 'string' && HEX_COLOR.test(c.trim());
}

/** האם זו צורה מוכרת. */
export function isMapObjectShape(s) {
  return typeof s === 'string' && MAP_OBJECT_SHAPES.includes(s);
}

const num = (v) => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const bool = (v, dflt) => {
  if (v === undefined || v === null) return dflt;
  if (typeof v === 'string') return !['false', '0', ''].includes(v.trim().toLowerCase());
  return !!v;
};

/**
 * נרמול שורת אובייקט: כל שדה חסר או פגום מקבל ערך בטוח.
 *
 * - x/y נחתכים ל-0..100 (ערך לא מספרי = מרכז המפה, 50).
 * - size נחתך לגבולות; לא מספרי = ברירת המחדל.
 * - צורה לא מוכרת = עיגול. צבע לא תקין = ענבר.
 * - שם נחתך ל-100 תווים ומנוקה מרווחים בקצוות.
 *
 * `id` ו-`map_id` עוברים כמו שהם כשקיימים (מספרים), כדי שהלקוח יוכל לנרמל
 * שורה שחזרה מהשרת בלי לאבד את הזהות שלה.
 */
export function normalizeMapObject(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const x = num(r.x), y = num(r.y), size = num(r.size), sort = num(r.sort_order);
  const out = {
    name: String(r.name ?? '').trim().slice(0, MAP_OBJECT_NAME_MAX),
    shape: isMapObjectShape(r.shape) ? r.shape : 'circle',
    x: Number.isNaN(x) ? 50 : clamp(x, 0, 100),
    y: Number.isNaN(y) ? 50 : clamp(y, 0, 100),
    size: Number.isNaN(size) ? MAP_OBJECT_SIZE_DEFAULT : clamp(size, MAP_OBJECT_SIZE_MIN, MAP_OBJECT_SIZE_MAX),
    color: isValidMapObjectColor(r.color) ? String(r.color).trim().toLowerCase() : MAP_OBJECT_DEFAULT_COLOR,
    filled: bool(r.filled, true),
    show_label: bool(r.show_label, true),
    sort_order: Number.isNaN(sort) ? 0 : Math.trunc(sort),
  };
  const id = num(r.id), mapId = num(r.map_id);
  if (!Number.isNaN(id)) out.id = id;
  if (!Number.isNaN(mapId)) out.map_id = mapId;
  return out;
}

/**
 * עדכון חלקי: רק השדות שנשלחו, אחרי נרמול. משמש את PUT בשרת - גרירה ששולחת
 * רק x/y לא תאפס את הצבע או את השם.
 */
export function normalizeMapObjectPatch(raw, current) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return normalizeMapObject({ ...(current || {}), ...r });
}

const fmt = (n) => {
  const v = Math.round(n * 1000) / 1000;
  return Object.is(v, -0) ? '0' : String(v);
};
const polyPath = (pts) => `M${pts.map(([px, py]) => `${fmt(px)},${fmt(py)}`).join(' L')} Z`;
const regular = (n, r, rot) => Array.from({ length: n }, (_, i) => {
  const a = rot + (i * 2 * Math.PI) / n;
  return [r * Math.cos(a), r * Math.sin(a)];
});

/**
 * נתיב SVG (`d`) של הצורה, ממורכז ב-(0,0) וחסום בתיבה [-r, r] בשני הצירים.
 * `r` = חצי הקוטר בפיקסלים של שכבת הציור. המיקום ניתן ב-transform של הקבוצה.
 *
 * כל הצורות "באותו גודל" לעין: הן ממלאות את אותה תיבה, ולכן החלפת צורה לא
 * מזיזה את התווית ולא משנה את שטח הנגיעה בעורך.
 */
export function mapObjectPath(shape, r) {
  const R = Number.isFinite(r) && r > 0 ? r : 1;
  switch (shape) {
    case 'square':
      return polyPath([[-R, -R], [R, -R], [R, R], [-R, R]]);
    case 'triangle':
      // קודקוד למעלה, בסיס ברוחב התיבה - ממלא את התיבה בדיוק כמו שאר הצורות
      return polyPath([[0, -R], [R, R], [-R, R]]);
    case 'diamond':
      return polyPath([[0, -R], [R, 0], [0, R], [-R, 0]]);
    case 'star': {
      const outer = regular(5, R, -Math.PI / 2);
      const inner = regular(5, R * 0.42, -Math.PI / 2 + Math.PI / 5);
      const pts = [];
      for (let i = 0; i < 5; i++) { pts.push(outer[i], inner[i]); }
      return polyPath(pts);
    }
    case 'hexagon':
      return polyPath(regular(6, R, 0));
    case 'cross': {
      const t = R * 0.34; // חצי עובי הזרוע
      return polyPath([
        [-t, -R], [t, -R], [t, -t], [R, -t], [R, t], [t, t],
        [t, R], [-t, R], [-t, t], [-R, t], [-R, -t], [-t, -t],
      ]);
    }
    case 'circle':
    default:
      return `M${fmt(-R)},0 A${fmt(R)},${fmt(R)} 0 1,0 ${fmt(R)},0 A${fmt(R)},${fmt(R)} 0 1,0 ${fmt(-R)},0 Z`;
  }
}

/**
 * אובייקט של מפת אב, בקואורדינטות של מפה חתוכה ממנה (maps.parent_rect, באחוזים
 * של מפת האב). אובייקט שמרכזו מחוץ לחיתוך - null.
 *
 * למה: מנהל המערכת מציב אובייקטים על המפה המלאה (למשל "אזורי עפרוני"), והעמדה
 * מציגה לעתים קרובות מפה **חתוכה** ממנה ("אזורי עפרוני (חלק...)"). בלי ההמרה
 * האובייקטים לא הופיעו בעמדה בכלל. הגודל באחוזי רוחב, ולכן מוגדל ביחס החיתוך -
 * האובייקט נשאר באותו גודל ביחס לרקע.
 */
export function projectMapObjectToChild(o, rect) {
  if (!o || !rect) return null;
  const x1 = Number(rect.x1), x2 = Number(rect.x2), y1 = Number(rect.y1), y2 = Number(rect.y2);
  if (![x1, x2, y1, y2].every(Number.isFinite) || x2 <= x1 || y2 <= y1) return null;
  const x = Number(o.x), y = Number(o.y);
  if (!(x >= x1 && x <= x2 && y >= y1 && y <= y2)) return null;
  return {
    ...o,
    x: ((x - x1) / (x2 - x1)) * 100,
    y: ((y - y1) / (y2 - y1)) * 100,
    size: Number(o.size) * (100 / (x2 - x1)),
    inherited: true,
  };
}
