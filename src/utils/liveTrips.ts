// מעקב נסיעה חי במגדל - הנגזרת לתצוגה (TRIP_LIVE_TRACKING_SPEC.md §6 T1-T12).
//
// הסטייה והחסימה **מחושבות בשרת** (GET /api/trips/live), כדי ששני מגדלים על אותו
// שדה יראו את אותה התרעה באותו רגע. כאן רק מה שנובע מהן למסך: על מה מתריעים,
// מתי התרעה שנסגרה חוזרת, ובאיזה צבע הרכב.

/** נסיעה פעילה כפי שהשרת מחזיר מ-/api/trips/live */
export interface LiveTrip {
  id: number;
  status: string;
  driver_started_at: string | null;
  ended_at: string | null;
  from_point_id: number | null;
  vehicle_name?: string;
  vehicle_type_name?: string | null;
  permit_driver_name?: string | null;
  driver_name?: string;
  icon?: string;
  route: { lat: number; lon: number; xPct: number | null; yPct: number | null; routeType: string; isCrossing: boolean }[];
  has_route: boolean;
  has_anchor: boolean;
  position: { lat: number; lng: number; accuracy_m: number | null; heading: number | null; speed_kmh: number | null; fix_at: string } | null;
  stale: boolean;
  deviation_m: number | null;
  deviating: boolean;
  blocking_element: { id: number; name: string; display_state: string | null; state_label?: string; distance_m: number | null } | null;
}

export type LiveAlertKind = 'blocked' | 'deviation';

export interface LiveAlert { key: string; kind: LiveAlertKind; trip: LiveTrip }

/** קידומות המפתחות של התרעות המעקב החי - רק אותן מנקים (pruneDismissedLive) */
const LIVE_KEY_PREFIXES = ['dev:', 'blk:'];

/**
 * על מה המגדל מתריע עכשיו.
 *
 * **חסימה לפני סטייה**: רכב מול מחסום סגור עוצר עכשיו, סטייה היא חריגה מתמשכת.
 * מפתח החסימה כולל את האלמנט - התרעה שנסגרה על מחסום אחד לא מסתירה את הבא.
 */
export function liveTripAlerts(rows: LiveTrip[]): LiveAlert[] {
  if (!Array.isArray(rows)) return [];
  const blocked: LiveAlert[] = [];
  const deviation: LiveAlert[] = [];
  for (const t of rows) {
    if (t.blocking_element) blocked.push({ key: `blk:${t.id}:${t.blocking_element.id}`, kind: 'blocked', trip: t });
    if (t.deviating) deviation.push({ key: `dev:${t.id}`, kind: 'deviation', trip: t });
  }
  return [...blocked, ...deviation];
}

/**
 * מסיר מהסגורות התרעות מעקב שהתנאי שלהן חלף - כדי שהן **יחזרו** באירוע הבא.
 *
 * בלי זה: הפקח סגר התרעת סטייה, הרכב חזר לנתיב, סטה שוב - ואין התרעה, כי המפתח
 * עדיין רשום כסגור. התרעות אחרות (תחילת נסיעה, בקשת נהג) לא נוגעים: שם הסגירה
 * היא סופית. מחזיר את אותו Set כשאין שינוי, כדי לא לרנדר סתם.
 */
export function pruneDismissedLive(dismissed: Set<string>, activeKeys: Set<string>): Set<string> {
  let next: Set<string> | null = null;
  for (const key of dismissed) {
    if (!LIVE_KEY_PREFIXES.some(p => key.startsWith(p)) || activeKeys.has(key)) continue;
    if (!next) next = new Set(dismissed);
    next.delete(key);
  }
  return next ?? dismissed;
}

export type LiveTone = 'normal' | 'waiting' | 'stale' | 'deviating' | 'blocked';

/** צבעי סטטוס - קבועים בכל תמה */
export const LIVE_TONE_COLOR: Record<LiveTone, string> = {
  normal: '#0ea5e9',
  waiting: '#a78bfa',
  stale: '#64748b',
  deviating: '#ef4444',
  blocked: '#f97316',
};

/**
 * הגוון של הרכב על המפה.
 * **אות אבד גובר על הכל** (חוץ מממתין): רכב שאיבד אות בזמן שסטה - המגדל כבר לא
 * יודע איפה הוא, והצגתו כ"סוטה" במקום האחרון היא ודאות שאין.
 */
export function liveVehicleTone(t: LiveTrip): LiveTone {
  if (!t.position) return 'waiting';
  if (t.stale) return 'stale';
  if (t.blocking_element) return 'blocked';
  if (t.deviating) return 'deviating';
  return 'normal';
}
