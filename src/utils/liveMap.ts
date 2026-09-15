// המפה הצפה של נסיעות בביצוע - הנגזרות, במקום אחד ונבדק.
//
// מה כאן: לאיזה טאב שייכת נסיעה, איזה צבע מקבלת כל נסיעה במפה, ואיך ממרכזים
// ומגדילים את המפה כך שכל הרכבים שבמעקב ייראו. הרינדור עצמו ב-TripLiveMapWindow
// (מפת הבסיס) וב-public/liveMap.js (Google).

/** נסיעה שהנהג הפעיל ועוד לא הסתיימה - "בביצוע". */
export function isInProgressTrip(t: { driver_started_at?: string | null; ended_at?: string | null; status?: string | null }): boolean {
  return !!t.driver_started_at && !t.ended_at && t.status !== 'ended';
}

export type TripTab = 'upcoming' | 'active' | 'history';

/**
 * הטאב של הנסיעה. **"בביצוע" גובר** על השניים האחרים: נסיעה שהופעלה ומועד
 * היציאה שלה עבר הייתה נופלת ל"היסטוריה" - בדיוק כשהרכב נוסע עכשיו בשטח.
 */
export function tripTabOf(
  t: { driver_started_at?: string | null; ended_at?: string | null; status?: string | null },
  isPast: boolean,
): TripTab {
  if (isInProgressTrip(t)) return 'active';
  return isPast ? 'history' : 'upcoming';
}

/**
 * צבעי הנסיעות במפה. **אינם צבעי סטטוס**: כחול/אדום/כתום/אפור כבר אומרים
 * "נוסע / סוטה / חסום / אות אבד" במפת המגדל, ורכב שצבעו אדום רק כי הוא השני
 * ברשימה היה נקרא כסוטה. לכן גוונים שאינם בשימוש שם, ושנבדלים זה מזה גם בעין.
 */
export const LIVE_MAP_COLORS = ['#a855f7', '#14b8a6', '#eab308', '#ec4899', '#84cc16', '#6366f1', '#f472b6', '#22d3ee'];

/**
 * צבע הנסיעה לפי **סדר ההוספה** למפה, כך שנסיעה שומרת על צבעה כשמוסיפים אחרות.
 * מעבר לשמונה - הצבעים חוזרים; שמונה רכבים במפה אחת הם כבר גבול הקריאות.
 */
export function liveMapColor(trackedIds: number[], tripId: number): string {
  const i = trackedIds.indexOf(tripId);
  return LIVE_MAP_COLORS[(i < 0 ? 0 : i) % LIVE_MAP_COLORS.length];
}

/** הוספה למפה פתוחה - בלי כפילות, ובסוף הרשימה (שומר את צבעי הקיימות). */
export const addToLiveMap = (ids: number[], id: number): number[] => (ids.includes(id) ? ids : [...ids, id]);

export const removeFromLiveMap = (ids: number[], id: number): number[] => ids.filter(x => x !== id);

/**
 * מצב המפה הצפה: **השדה** שהיא שייכת לו, הנסיעות שבה והנסיעות עם שובל.
 *
 * השדה הוא חלק מהמצב כי טבלת הנסיעות מופיעה גם מוטמעת בדסק משימה, ושם היא יכולה
 * להציג שדה של עמדה אחרת. נסיעות משני שדות אינן נכנסות לאותה מפה - אין להן מפת
 * בסיס משותפת, ורכב של שדה אחד על התמונה של שדה אחר נראה במקום שהוא אינו בו.
 */
export interface LiveMapState { airfieldId: number; tripIds: number[]; historyIds: number[] }

/** "פתח במפה צפה" - מפה לנסיעה הזו בלבד. */
export const openLiveMap = (airfieldId: number, tripId: number): LiveMapState =>
  ({ airfieldId, tripIds: [tripId], historyIds: [] });

/** "הוסף למפה פתוחה". מפה פתוחה של **שדה אחר** מוחלפת, ולא מתערבבת. */
export function addToOpenLiveMap(state: LiveMapState | null, airfieldId: number, tripId: number): LiveMapState {
  if (!state || state.airfieldId !== airfieldId) return openLiveMap(airfieldId, tripId);
  return { ...state, tripIds: addToLiveMap(state.tripIds, tripId) };
}

/** הנסיעות שטבלה של שדה מסוים צריכה לסמן כ"במפה". מפה של שדה אחר - אף אחת. */
export const liveMapTripsFor = (state: LiveMapState | null, airfieldId: number | null): number[] =>
  state && airfieldId != null && state.airfieldId === airfieldId ? state.tripIds : [];

export const toggleLiveMapHistory = (state: LiveMapState | null, tripId: number): LiveMapState | null =>
  state && { ...state, historyIds: state.historyIds.includes(tripId) ? removeFromLiveMap(state.historyIds, tripId) : addToLiveMap(state.historyIds, tripId) };

/** הסרת נסיעה - גם השובל שלה יורד. המפה האחרונה שהתרוקנה נסגרת. */
export function removeLiveMapTrip(state: LiveMapState | null, tripId: number): LiveMapState | null {
  if (!state) return null;
  const tripIds = removeFromLiveMap(state.tripIds, tripId);
  return tripIds.length ? { ...state, tripIds, historyIds: removeFromLiveMap(state.historyIds, tripId) } : null;
}

export interface PctPoint { x: number; y: number }

/**
 * מרכז וזום שבהם כל הנקודות נראות, על מפה שבזום 1 היא בגודל `baseW`x`baseH`
 * בתוך חלון `viewW`x`viewH`.
 *
 * - נקודה אחת: זום קבוע (`single`) - אין "גבולות" לנקודה אחת, ובלי זה הזום
 *   היה אינסופי.
 * - כמה נקודות: הזום שבו התיבה שלהן ממלאת את החלון, פחות `padding` מכל צד.
 * - הזום נחסם ל-[min, max]: שני רכבים שעומדים אחד ליד השני לא יגדילו עד פיקסל.
 */
export function fitLiveMap(
  points: PctPoint[],
  baseW: number, baseH: number, viewW: number, viewH: number,
  opts: { padding?: number; min?: number; max?: number; single?: number } = {},
): { center: PctPoint; zoom: number } | null {
  const pts = (points || []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pts.length || !baseW || !baseH || !viewW || !viewH) return null;
  const { padding = 0.15, min = 1, max = 12, single = 4 } = opts;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const clamp = (z: number) => Math.min(max, Math.max(min, z));
  const spanW = ((maxX - minX) / 100) * baseW;
  const spanH = ((maxY - minY) / 100) * baseH;
  if (spanW < 1 && spanH < 1) return { center, zoom: clamp(single) };
  const usable = 1 - 2 * padding;
  const zoomW = spanW > 0 ? (viewW * usable) / spanW : Infinity;
  const zoomH = spanH > 0 ? (viewH * usable) / spanH : Infinity;
  return { center, zoom: clamp(Math.min(zoomW, zoomH)) };
}

/** כמה קליטות אחרונות מציג שובל ההיסטוריה. 5 ש' לקליטה -> כעשר דקות. */
export const LIVE_TRAIL_POINTS = 120;
