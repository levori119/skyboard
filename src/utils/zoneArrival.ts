// הגעה לאזור - איך פ"מ עם אזור מצויר על המפה מההמראה ועד שהפקח אישר שהוא באזור.
//
// שלושה שלבים, ופונקציות טהורות בלבד (נבדקות ב-vitest בלי עמדה):
//
//   normal  - התצוגה הרגילה של הפין (לפני המראה, או אחרי שהפקח אישר).
//   enroute - המריא ועוד לא הגיע: האו"ק **קטן ובהיר בפינת האזור** - "יש מישהו
//             בדרך לכאן", בלי לתפוס מקום של פין אמיתי.
//   arrived - התמונ"א זיהתה אותו באזור (zoneWatch כתב "באזור") והפקח עוד לא
//             אישר: האו"ק **מוגדל ומהבהב** עד לחיצה עליו.
//
// ההבחנה בין "באזור" שהמערכת זיהתה לבין "באזור" שהפקח סימן יושבת בעמודה
// `strip_zone_assignments.zone_arrival_ack`: רק כתיבה של מנוע הזיהוי מורידה
// אותה ל-false, וכל סימון ידני מחזיר אותה ל-true (server/routes/maps.js).

import { ZONE_STATUS } from '../airPicture/zoneWatch';

export type ZoneArrivalPhase = 'normal' | 'enroute' | 'arrived';

export interface ZoneArrivalInput {
  /** לפ"מ יש אזור (לא רק מיקום חופשי על המפה). */
  hasZone: boolean;
  /** `strips.airborne` - המריא. */
  airborne: boolean;
  /** `strip_zone_assignments.status`. */
  status: string | null | undefined;
  /** `strip_zone_assignments.zone_arrival_ack`. חסר (שרת ישן) = אושר. */
  ack: boolean | null | undefined;
}

export function zoneArrivalPhase({ hasZone, airborne, status, ack }: ZoneArrivalInput): ZoneArrivalPhase {
  if (!hasZone) return 'normal';
  // לא תלוי ב-airborne: הזיהוי מגיע מהתמונ"א, כלומר המטוס באוויר בפועל גם אם
  // הפקח לא סימן "מאוויר" בסטריפ
  if (status === ZONE_STATUS.inZone && ack === false) return 'arrived';
  if (airborne && status !== ZONE_STATUS.inZone && status !== ZONE_STATUS.leaving) return 'enroute';
  return 'normal';
}

/**
 * הערך של `zone_arrival_ack` אחרי כתיבת סטטוס. `auto` = הכתיבה הגיעה ממנוע
 * הזיהוי (התמונ"א). רק "באזור" אוטומטי ממתין לאישור; כל השאר - מאושר.
 */
export function arrivalAckAfterStatus(status: string, auto: boolean): boolean {
  return !(auto && status === ZONE_STATUS.inZone);
}

type Pt = { x: number; y: number };

/**
 * נקודה בפינת האזור - הקודקוד הקרוב לפינה העליונה בצד ההתחלה (ימין בעברית,
 * שמאל באנגלית), מוזז מעט פנימה לכיוון המרכז כדי שהטקסט לא יישב על הקו.
 */
export function zoneCornerPoint(polygon: Pt[], rtl: boolean, inset = 0.18): Pt | null {
  if (!Array.isArray(polygon) || polygon.length < 3) return null;
  const xs = polygon.map(p => p.x);
  const ys = polygon.map(p => p.y);
  const target = { x: rtl ? Math.max(...xs) : Math.min(...xs), y: Math.min(...ys) };
  let best = polygon[0];
  let bestD = Infinity;
  for (const p of polygon) {
    const d = Math.hypot(p.x - target.x, p.y - target.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  const cx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const cy = ys.reduce((s, v) => s + v, 0) / ys.length;
  return { x: best.x + (cx - best.x) * inset, y: best.y + (cy - best.y) * inset };
}

/**
 * כמה פ"מים בדרך לאותו אזור נערמים בפינה אחד מתחת לשני. מחזיר לכל פ"מ את
 * מקומו בערימה (0, 1, 2...) לפי סדר הופעתו - יציב בין רינדורים.
 */
export function enrouteStackIndex(items: { stripId: number; zoneId: number }[]): Map<number, number> {
  const perZone = new Map<number, number>();
  const out = new Map<number, number>();
  for (const it of items) {
    const n = perZone.get(it.zoneId) ?? 0;
    out.set(it.stripId, n);
    perZone.set(it.zoneId, n + 1);
  }
  return out;
}
