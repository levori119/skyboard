// מיון וגודל גופן בלוח הפ"מים (הסרגל שליד המפה).
//
//   takeoff - ברירת המחדל: באוויר קודם, ואז לפי זמן המראה (compareAirborneThenTakeoff)
//   zone    - לפי האזור: המשויך במפה, ובהיעדרו האזור המתוכנן הראשון (plannedZones).
//             פ"מ בלי אזור בסוף; בתוך אותו אזור - לפי זמן המראה
//   alpha   - לפי או"ק, א"ב עם מספרים טבעיים (ע9 לפני ע10)

import { compareAirborneThenTakeoff } from './stripOrder';
import { parsePlannedZones } from './plannedZones';

export type StripListSort = 'takeoff' | 'zone' | 'alpha';
export const STRIP_LIST_SORTS: StripListSort[] = ['takeoff', 'zone', 'alpha'];

export function isStripListSort(v: unknown): v is StripListSort {
  return v === 'takeoff' || v === 'zone' || v === 'alpha';
}

const collator = new Intl.Collator('he', { numeric: true, sensitivity: 'base' });

/** שם האזור למיון: המשויך, ואם אין - המתוכנן הראשון. '' = בלי אזור */
export function stripZoneSortName(strip: any, assignedZoneName: string | null | undefined): string {
  const a = String(assignedZoneName ?? '').trim();
  if (a) return a;
  return parsePlannedZones(strip?.planned_zones)[0] ?? '';
}

export function compareStripsBy(
  mode: StripListSort, a: any, b: any,
  zoneNameOf: (s: any) => string = () => '',
): number {
  if (mode === 'alpha') {
    const c = collator.compare(String(a?.callSign ?? a?.call_sign ?? ''), String(b?.callSign ?? b?.call_sign ?? ''));
    return c !== 0 ? c : compareAirborneThenTakeoff(a, b);
  }
  if (mode === 'zone') {
    const za = zoneNameOf(a), zb = zoneNameOf(b);
    if (za && !zb) return -1;
    if (!za && zb) return 1;
    const c = collator.compare(za, zb);
    return c !== 0 ? c : compareAirborneThenTakeoff(a, b);
  }
  return compareAirborneThenTakeoff(a, b);
}

// ── גודל גופן הלוח ───────────────────────────────────────────────────────────
export const STRIP_LIST_SCALE_MIN = 0.8;
export const STRIP_LIST_SCALE_MAX = 1.8;
export const STRIP_LIST_SCALE_STEP = 0.1;

/** צעד + / - בגודל הלוח, מעוגל לעשירית ובתוך הגבולות */
export function stepStripListScale(cur: number, dir: 1 | -1): number {
  const base = Number.isFinite(cur) ? cur : 1;
  const next = Math.round((base + dir * STRIP_LIST_SCALE_STEP) * 10) / 10;
  return Math.min(STRIP_LIST_SCALE_MAX, Math.max(STRIP_LIST_SCALE_MIN, next));
}

/** ערך שנשמר (localStorage) → סקייל תקין. כל דבר אחר - 1 */
export function parseStripListScale(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(STRIP_LIST_SCALE_MAX, Math.max(STRIP_LIST_SCALE_MIN, Math.round(n * 10) / 10));
}
