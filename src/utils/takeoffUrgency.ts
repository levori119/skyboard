/**
 * **דחיפות ההמראה** של פ"מ שעוד לא באוויר - לכרטיס ברשימת הפ"ממים.
 *
 * | מצב | מתי | תצוגה |
 * |---|---|---|
 * | `now`  | זמן ההמראה הגיע או עבר, והפ"מ עוד לא באוויר | אדום, מהבהב |
 * | `soon` | ממריא בעוד 10 דקות או פחות | כתום |
 * | `none` | רחוק יותר, בלי זמן, או כבר באוויר | רגיל |
 */
export type TakeoffUrgency = 'now' | 'soon' | 'none';

/** "בעוד 10 דקות" - חלון ההתראה המוקדמת */
export const TAKEOFF_SOON_MS = 10 * 60 * 1000;

export function takeoffUrgency(takeoff: string | Date | null | undefined, airborne: boolean, now: Date = new Date()): TakeoffUrgency {
  if (airborne || !takeoff) return 'none';
  const t = takeoff instanceof Date ? takeoff : new Date(takeoff);
  if (isNaN(t.getTime())) return 'none';
  const dt = t.getTime() - now.getTime();
  if (dt <= 0) return 'now';
  return dt <= TAKEOFF_SOON_MS ? 'soon' : 'none';
}

/** כמות המטוסים לתצוגה - בפ"מ מפוצל המטוסים שבו, אחרת המס"מ. `null` כשאין */
export function formationCount(s: { aircraft_indices?: unknown; numberOfFormation?: unknown; number_of_formation?: unknown } | null | undefined): number | null {
  if (!s) return null;
  if (Array.isArray(s.aircraft_indices) && s.aircraft_indices.length) return s.aircraft_indices.length;
  const n = parseInt(String(s.numberOfFormation ?? s.number_of_formation ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
