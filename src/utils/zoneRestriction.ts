/**
 * אזור **סגור** ואזור **מוגבל** - הלוגיקה הטהורה.
 *
 * שני מצבים תפעוליים שהפקח/בקר קובע בעמדה בלחיצה על **קו** האזור:
 *
 * | מצב | משמעות | מה קורה כשמאיישים אותו |
 * |-----|--------|------------------------|
 * | `closed`     | אזור סגור לחלוטין   | ה**שיוך נחסם** + התראה אדומה |
 * | `restricted` | אזור מוגבל בתנאים   | השיוך מותר + התראה כתומה |
 * | `''`         | פתוח (ברירת מחדל)  | כלום |
 *
 * ההבדל בין השניים הוא **מי מכריע**: באזור סגור המערכת מכריעה שלא, ובאזור מוגבל
 * היא מוסרת את ההכרעה לפקח ומוודאת שהוא יודע. לכן "מוגבל" אינו דרגה חלשה של
 * "סגור" אלא כלי אחר - והוא הכלי המתאים לאזור שאיושו אפשרי בתנאים.
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
  /**
   * **הבלוקים שההגבלה חלה עליהם**, לפי `zone_altitude_ranges.id`. זהו המנגנון
   * המועדף באזור **מפוצל**: הפקח מסמן בתפריט אילו גבהים סגורים, וזו הכרעה על
   * הבלוקים עצמם - לא על מספרים שצריך להצליב איתם.
   *
   * ריק = אין בחירת בלוקים, ואז מכריע `restriction_alt_min/max`.
   */
  restriction_range_ids?: number[] | null;
  /**
   * טווח חופשי ברום טיסה, לאזור **לא מפוצל** (שאין לו בלוקים לסמן).
   * `null` בשניהם, וגם `restriction_range_ids` ריק = ההגבלה חלה על כל הגבהים.
   */
  restriction_alt_min?: number | null;
  restriction_alt_max?: number | null;
}

/** מרחב גובה לבדיקה - בלוק גובה של האזור, ברום טיסה. */
export interface AltBand {
  /** `zone_altitude_ranges.id`. נדרש כדי להשוות מול `restriction_range_ids`. */
  id?: number | null;
  lo: number | null;
  hi: number | null;
}

/** הבלוקים המסומנים כמוגבלים, מנורמל למערך מספרים. */
export function restrictedBandIds(zone: RestrictableZone | null | undefined): number[] {
  const ids = zone?.restriction_range_ids;
  return Array.isArray(ids) ? ids.filter(n => typeof n === 'number') : [];
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

/**
 * האם ההגבלה חלה על **כל** הגבהים - כלומר לא נבחרו בלוקים ולא הוגדר טווח.
 * זו הסגירה הגורפת: "האזור סגור", בלי סייג.
 */
export function restrictionCoversAllAltitudes(zone: RestrictableZone): boolean {
  return restrictedBandIds(zone).length === 0
    && numOrNull(zone.restriction_alt_min) == null
    && numOrNull(zone.restriction_alt_max) == null;
}

/**
 * האם בלוק גובה מסוים של האזור מוגבל.
 *
 * סימון הבלוקים גובר על הטווח המספרי: כשהפקח סימן בלוקים בתפריט, זו ההכרעה -
 * ובלוק שאינו ברשימה פתוח גם אם גבהיו נופלים במקרה בתוך טווח ישן שנשאר.
 */
export function bandRestricted(zone: RestrictableZone | null | undefined, band: AltBand): boolean {
  if (!zone || !isRestricted(zone)) return false;
  const ids = restrictedBandIds(zone);
  if (ids.length > 0) return band.id != null && ids.includes(band.id);
  if (restrictionCoversAllAltitudes(zone)) return true;
  return altRangesOverlap(zone.restriction_alt_min, zone.restriction_alt_max, band.lo, band.hi);
}

/**
 * האם גובה נקודתי (רום טיסה) נופל בתוך ההגבלה.
 * כשההגבלה מוגדרת ב**בלוקים**, גובה בלי בלוק אינו ניתן להכרעה - ואז ברירת
 * המחדל הבטוחה: ההגבלה חלה.
 */
export function altitudeRestricted(zone: RestrictableZone | null | undefined, altFl: number | null): boolean {
  if (!zone || !isRestricted(zone)) return false;
  if (restrictedBandIds(zone).length > 0) return true;
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
  // `bandRestricted` הוא שמכריע אם ההגבלה הוגדרה בבלוקים או בטווח.
  if (bands.length > 0) return bands.some(b => bandRestricted(zone, b)) ? kind : '';
  return altitudeRestricted(zone, altFl) ? kind : '';
}

/**
 * האזור **סגור לכל גובה שאפשר להקצות בו** - ולכן אין טעם לפתוח בו טופס הקצאה.
 *
 * זו שאלה אחרת מ-`assignmentRestriction`: שם נשאלים על גובה **מסוים**, וכאן על
 * כל האפשרויות. אזור שסגור רק בבלוק אחד אינו "סגור לכל": הטופס כן נפתח, הבלוק
 * הסגור מסומן ואינו נבחר, והחסימה הסופית נופלת על `assignmentRestriction`.
 *
 * @param bands בלוקי הגובה של האזור. ריק = אין פיצול, ואז מכריע `altFl`.
 * @param altFl הגובה שרשום בפ"מ, ברום טיסה. משמש רק כשאין בלוקים.
 */
export function closedForAllBands(
  zone: RestrictableZone | null | undefined,
  bands: AltBand[],
  altFl: number | null = null,
): boolean {
  if (zoneRestrictionOf(zone) !== 'closed') return false;
  if (restrictionCoversAllAltitudes(zone!)) return true;
  if (bands.length === 0) return altitudeRestricted(zone, altFl);
  return bands.every(b => bandRestricted(zone, b));
}

/**
 * ההגבלה שחלה על **בלוק בודד** שהפ"מ שוחרר עליו במפה המפוצלת לגבהים.
 *
 * זו השאלה של תצוגת הגבהים: הפקח רואה את האזור חלוק לרצועות ומשחרר את הפ"מ
 * ברצועה שהוא מתכוון אליה, ולכן הרצועה - ולא הפ"מ ולא האזור כולו - היא מה
 * שנשאל עליו.
 */
export function bandRestrictionKind(zone: RestrictableZone | null | undefined, band: AltBand): ZoneRestriction {
  const kind = zoneRestrictionOf(zone);
  if (kind === '') return '';
  return bandRestricted(zone, band) ? kind : '';
}

/**
 * תיאור ההגבלה לתצוגה. מחזיר `''` כשההגבלה חלה על כל הגבהים.
 *
 * @param bands בלוקי האזור - כדי לתאר הגבלה שהוגדרה בבלוקים בשמותיהם.
 */
export function restrictionRangeLabel(zone: RestrictableZone, bands: (AltBand & { name?: string })[] = []): string {
  const ids = restrictedBandIds(zone);
  if (ids.length > 0) {
    const named = bands.filter(b => b.id != null && ids.includes(b.id))
      .map(b => b.name || bandLabel(b)).filter(Boolean);
    if (named.length > 0) return named.join(', ');
  }
  const [lo, hi] = normalizeRange(zone.restriction_alt_min, zone.restriction_alt_max);
  if (lo == null && hi == null) return '';
  if (lo != null && hi != null) return lo === hi ? `${lo}` : `${lo}-${hi}`;
  return lo != null ? `${lo}+` : `-${hi}`;
}

/** "100-140" / "200+" / "-140" לבלוק בודד. `''` כשאין לו גבהים. */
export function bandLabel(band: AltBand): string {
  const [lo, hi] = normalizeRange(band.lo, band.hi);
  if (lo == null && hi == null) return '';
  if (lo != null && hi != null) return lo === hi ? `${lo}` : `${lo}-${hi}`;
  return lo != null ? `${lo}+` : `-${hi}`;
}

/** הבלוקים ש**אינם** מוגבלים - "הגבהים הפתוחים" שמוצגים בהתראה. */
export function openBands<B extends AltBand & { name?: string }>(
  zone: RestrictableZone | null | undefined, bands: B[],
): B[] {
  return bands.filter(b => !bandRestricted(zone, b));
}
