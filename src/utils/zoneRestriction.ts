/**
 * אזור **סגור** ואזור **מוגבל** - הלוגיקה הטהורה.
 *
 * שני מצבים תפעוליים שהפקח/בקר קובע בעמדה בלחיצה על **קו** האזור:
 *
 * | מצב | משמעות | מה קורה כשמאיישים אותו |
 * |-----|--------|------------------------|
 * | `closed`     | אזור סגור לחלוטין   | התראה אדומה: "אויש אזור סגור" |
 * | `restricted` | אזור מוגבל בתנאים   | התראה כתומה: "אויש אזור מוגבל" |
 * | `''`         | פתוח (ברירת מחדל)  | כלום |
 *
 * ── למה יש כאן טווח גבהים ולא רק דגל ──────────────────────────────────────
 * סגירה היא כמעט תמיד סגירה של **מרחב גובה** ולא של עמוד האוויר כולו: "האזור
 * סגור מ-100 עד 140" הוא המקרה השכיח, ולא "האזור סגור". לכן לסגירה יש טווח
 * (`alt_min`/`alt_max` ברום טיסה, כמו `zone_altitude_ranges`), ו**טווח ריק =
 * כל הגבהים** - זו הסגירה הגורפת.
 *
 * מכאן נובע שהתשובה לשאלה "האם הפ"מ הזה נכנס לאזור סגור" תלויה בגובה שלו:
 * אותו אזור סגור לפ"מ ב-120 ופתוח לפ"מ ב-200. באזור **מפוצל** לבלוקי גובה
 * הגובה נמדד לפי הבלוק שהפ"מ הוקצה לו (זו כוונת המפעיל, ראה `altBlockAtPoint`
 * ב-SectorDashboard), ורק כשאין לו בלוק נופלים לגובה שרשום בפ"מ עצמו.
 *
 * ── ברירת המחדל הבטוחה ────────────────────────────────────────────────────
 * כשאי אפשר להכריע - אין בלוק, אין גובה בפ"מ - התשובה היא **שההגבלה חלה**.
 * זו אותה הכרעה של `zoneBlockOccupancy` ("עדיף להציג אזור כתפוס מאשר כפנוי"):
 * התראה מיותרת היא רעש, התראה שלא נשמעה היא פ"מ באזור סגור.
 *
 * **פונקציות טהורות בלבד** - אין React, אין fetch, אין שעון. כל מטריצת המקרים
 * נבדקת ב-vitest (zoneRestriction.test.ts) בלי להריץ עמדה.
 */

/** ערכי `map_zone_operational_state.restriction`. **ערכי נתונים** - לא עוברים i18n. */
export type ZoneRestriction = '' | 'restricted' | 'closed';

/** האזור, כפי שהוא מגיע מ-`GET /api/map-zones` (השדות הרלוונטיים בלבד). */
export interface RestrictableZone {
  restriction?: string | null;
  /** רום טיסה. `null` בשניהם = ההגבלה חלה על כל הגבהים. */
  restriction_alt_min?: number | null;
  restriction_alt_max?: number | null;
}

/** מרחב גובה לבדיקה - בלוק גובה של האזור, ברום טיסה. */
export interface AltBand {
  lo: number | null;
  hi: number | null;
}

/** האם המצב שהתקבל הוא הגבלה מוכרת. כל ערך אחר (כולל `null`) = פתוח. */
export function zoneRestrictionOf(zone: RestrictableZone | null | undefined): ZoneRestriction {
  const r = zone?.restriction;
  return r === 'closed' || r === 'restricted' ? r : '';
}

/** האם לאזור יש הגבלה כלשהי. */
export function isRestricted(zone: RestrictableZone | null | undefined): boolean {
  return zoneRestrictionOf(zone) !== '';
}

/**
 * חפיפה בין שני טווחי גובה, כשכל גבול עשוי להיות פתוח (`null` = אין גבול).
 * הגבולות **כלולים**: סגירה 100-140 חופפת לבלוק 140-200, כי 140 עצמו סגור.
 */
export function altRangesOverlap(
  aLo: number | null | undefined, aHi: number | null | undefined,
  bLo: number | null | undefined, bHi: number | null | undefined,
): boolean {
  const [aMin, aMax] = normalizeRange(aLo, aHi);
  const [bMin, bMax] = normalizeRange(bLo, bHi);
  if (aMax != null && bMin != null && aMax < bMin) return false;
  if (bMax != null && aMin != null && bMax < aMin) return false;
  return true;
}

/**
 * ממיין גבולות כך ש-min<=max. גבול חסר **נשאר חסר** ואינו משוקף לצד השני:
 * "סגור מ-200" הוא 200 ומעלה, ולא הנקודה 200 בלבד.
 */
function normalizeRange(lo: number | null | undefined, hi: number | null | undefined): [number | null, number | null] {
  const a = numOrNull(lo), b = numOrNull(hi);
  if (a != null && b != null) return [Math.min(a, b), Math.max(a, b)];
  return [a, b];
}

function numOrNull(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

/** האם טווח ההגבלה של האזור ריק - כלומר ההגבלה חלה על **כל** הגבהים. */
export function restrictionCoversAllAltitudes(zone: RestrictableZone): boolean {
  return numOrNull(zone.restriction_alt_min) == null && numOrNull(zone.restriction_alt_max) == null;
}

/** האם בלוק גובה מסוים של האזור נופל בתוך טווח ההגבלה. */
export function bandRestricted(zone: RestrictableZone | null | undefined, band: AltBand): boolean {
  if (!zone || !isRestricted(zone)) return false;
  if (restrictionCoversAllAltitudes(zone)) return true;
  return altRangesOverlap(zone.restriction_alt_min, zone.restriction_alt_max, band.lo, band.hi);
}

/** האם גובה נקודתי (רום טיסה) נופל בתוך טווח ההגבלה. */
export function altitudeRestricted(zone: RestrictableZone | null | undefined, altFl: number | null): boolean {
  if (!zone || !isRestricted(zone)) return false;
  if (restrictionCoversAllAltitudes(zone)) return true;
  if (altFl == null) return true; // אין גובה להכריע לפיו - ברירת המחדל הבטוחה
  return altRangesOverlap(zone.restriction_alt_min, zone.restriction_alt_max, altFl, altFl);
}

/**
 * ההגבלה שחלה על **הקצאה מסוימת** - התשובה שממנה נגזרת ההתראה.
 *
 * @param bands  בלוקי הגובה שהפ"מ הוקצה להם באזור (ברום טיסה). ריק = בלי בלוק.
 * @param altFl  הגובה שרשום בפ"מ עצמו, ברום טיסה. משמש רק כשאין בלוק.
 * @returns `'closed'` / `'restricted'` / `''` - `''` כשההגבלה אינה נוגעת לגובה הזה.
 */
export function assignmentRestriction(
  zone: RestrictableZone | null | undefined,
  bands: AltBand[],
  altFl: number | null = null,
): ZoneRestriction {
  const kind = zoneRestrictionOf(zone);
  if (kind === '') return '';
  if (restrictionCoversAllAltitudes(zone!)) return kind;
  // הבלוק שהפ"מ הוקצה לו הוא כוונת המפעיל, ולכן הוא גובר על הגובה הרשום.
  if (bands.length > 0) return bands.some(b => bandRestricted(zone, b)) ? kind : '';
  return altitudeRestricted(zone, altFl) ? kind : '';
}

/** תיאור טווח ההגבלה לתצוגה. מחזיר `''` כשההגבלה חלה על כל הגבהים. */
export function restrictionRangeLabel(zone: RestrictableZone): string {
  const [lo, hi] = normalizeRange(zone.restriction_alt_min, zone.restriction_alt_max);
  if (lo == null && hi == null) return '';
  if (lo != null && hi != null) return lo === hi ? `${lo}` : `${lo}-${hi}`;
  return lo != null ? `${lo}+` : `-${hi}`;
}
