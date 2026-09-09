// הגנ"ש (הגנת שמי המדינה) - ליבה טהורה.
//
// כאן יושבת כל ההכרעה המספרית של הפיצ'ר: נרמול אזימוטים, מפתחות זווית, טווחי
// גובה ואיכות עמידה במשימה. ללא DOM וללא רשת - כדי שתהיה נבדקת ב-vitest.
// זו בדיוק הלוגיקה שנשברת **בשקט**: גזרה שחוצה את הצפון, טווח גובה הפוך או
// אחוז יעילות שנקטע - כולם נראים תקינים על המסך ומחזירים תשובה שגויה.
//
// אפיון מלא: AIR_DEFENSE_SPEC.md.

/**
 * הסף שמעליו מערכת נחשבת "מתמודדת" ולא "מתמודדת חלקית", באחוזים.
 *
 * קבוע בעל שם ולא מספר קסם: זו **מדיניות** ולא חישוב, ושינוי שלה הוא שורה אחת.
 * ראה AIR_DEFENSE_SPEC.md §2.4 ו-§10.2 שאלה 3.
 */
export const AD_FULL_COVER_PCT = 50;

/** סטטוס אמצעי פרוס. **ערכי נתונים** - לא עוברים i18n (התוויות כן). */
export const AD_STATUSES = ['operational', 'deploying', 'faulty', 'maintenance'] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

/** קרקעי / אווירי - חל על מערכות אש ומערכות גילוי כאחד. */
export const AD_KINDS = ['ground', 'air'] as const;
export type AdKind = (typeof AD_KINDS)[number];

/** ייעוד הטיל: מכ"ם / חום. */
export const AD_GUIDANCE = ['radar', 'ir'] as const;
export type AdGuidance = (typeof AD_GUIDANCE)[number];

/** דירוג הכיסוי מול איום: לא מתמודד / חלקי / מתמודד. */
export type AdQualityBand = 'none' | 'partial' | 'full';

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * אזימוט → [0, 360). מחזיר `null` על קלט שאינו מספר סופי.
 *
 * **כל** השוואת אזימוט במערכת חייבת לעבור כאן. בלי זה גזרה שחוצה את הצפון
 * (350 → 020) נמדדת כ-330 מעלות לצד ההפוך - יתד שנראה סביר על המפה ומכסה את
 * ההפך הגמור ממה שהמכ"ם רואה.
 */
export function norm360(deg: number): number | null {
  const n = num(deg);
  if (n === null) return null;
  return ((n % 360) + 360) % 360;
}

/**
 * אחוז יעילות תקין (שלם, 0-100) או `null`.
 *
 * ערך מחוץ לטווח **נדחה** ולא מהודק: 150% שהופך ל-100% בשקט הוא נתון שגוי
 * שנראה תקין, וכאן זה נתון שהחישוב המבצעי נשען עליו.
 */
export function clampQualityPct(v: number): number | null {
  const n = num(v);
  if (n === null) return null;
  const rounded = Math.round(n);
  return rounded < 0 || rounded > 100 ? null : rounded;
}

/**
 * אחוז → דירוג. **חסר נחשב `none`**, לא "לא ידוע": צמד (מערכת, איום) שלא הוזן
 * אינו כיסוי. אותה ברירת מחדל בטוחה של `zoneRestriction.ts` - התראה מיותרת היא
 * רעש, כיסוי מדומה הוא אירוע לא מכוסה.
 */
export function qualityBand(pct: number | null | undefined): AdQualityBand {
  const n = num(pct);
  if (n === null || n <= 0) return 'none';
  return n >= AD_FULL_COVER_PCT ? 'full' : 'partial';
}

/** טווח גובה ברום טיסה (מאות רגל). `null` בקצה = פתוח לאותו כיוון. */
export type AdAltRange = [number | null, number | null];

/**
 * מנרמל טווח גובה: מעגל לשלם, מסדר min<=max, וגבול חסר **נשאר חסר**
 * ("מ-200" הוא 200 ומעלה, ולא 200 עד 200). אותה תבנית של `normalizeRange`
 * בהלאמת אזור זמני.
 */
export function normalizeAltRange(min: number | null, max: number | null): AdAltRange {
  const lo = num(min);
  const hi = num(max);
  const rLo = lo === null ? null : Math.round(lo);
  const rHi = hi === null ? null : Math.round(hi);
  if (rLo !== null && rHi !== null) return [Math.min(rLo, rHi), Math.max(rLo, rHi)];
  return [rLo, rHi];
}

/**
 * מקטע החפיפה בין שני טווחי גובה, או `null` כשאין חפיפה.
 *
 * **חפיפה ולא הכלה** (AIR_DEFENSE_SPEC §2.5): מכ"ם שרואה 000-200 מול אירוע
 * 150-300 מחזיר `[150, 200]` - כיסוי חלקי שמוצג ככזה, ולא נבלע ל"מכסה"/"לא
 * מכסה". נגיעה בקצה אחד נחשבת חפיפה: גבול הוא נקודה, לא חיץ.
 */
export function altOverlap(a: AdAltRange, b: AdAltRange): AdAltRange | null {
  const [aLo, aHi] = normalizeAltRange(a[0], a[1]);
  const [bLo, bHi] = normalizeAltRange(b[0], b[1]);
  const lo = aLo === null ? bLo : bLo === null ? aLo : Math.max(aLo, bLo);
  const hi = aHi === null ? bHi : bHi === null ? aHi : Math.min(aHi, bHi);
  if (lo !== null && hi !== null && lo > hi) return null;
  return [lo, hi];
}

/**
 * מכ"ם מסתובב: **שני** גבולות המפתח ריקים. גבול אחד בלבד אינו 360 אלא הגדרה
 * חלקית - וזו טעות הזנה שהטופס חוסם, לא מצב לגיטימי.
 */
export function isFullCircle(from: number | null, to: number | null): boolean {
  return num(from) === null && num(to) === null;
}

/**
 * רוחב המפתח במעלות, **בכיוון השעון** מ-`from` ל-`to`. 360 מחזיר `null` (אין
 * למפתח משמעות במכ"ם מסתובב).
 *
 * המדידה בכיוון השעון היא מה שהופך `350 → 020` ל-30 מעלות ולא ל-330: המפתח
 * נמתח מהגבול הראשון קדימה, ולא מהקטן לגדול.
 */
export function apertureDeg(from: number | null, to: number | null): number | null {
  if (isFullCircle(from, to)) return null;
  const f = norm360(from as number);
  const t = norm360(to as number);
  if (f === null || t === null) return null;
  return ((t - f) % 360 + 360) % 360;
}

/**
 * מפתח מנוון = רוחב 0 (מ' שווה ל-עד'). גזרה כזו אינה מציגה דבר על המפה, ולכן
 * נחסמת בטופס **עם נימוק** ולא מתקבלת בשקט.
 *
 * `0 → 360` נופל לכאן בכוונה: מי שהתכוון ל-360 משאיר את שני השדות **ריקים**.
 */
export function isDegenerateAperture(from: number | null, to: number | null): boolean {
  if (isFullCircle(from, to)) return false;
  return apertureDeg(from, to) === 0;
}

/** קלט טופס קטלוג (אש או גילוי). השדות שאינם רלוונטיים לסוג פשוט חסרים. */
export interface AdSystemInput {
  name?: string;
  kind?: string;
  range_nm?: number | null;
  alt_min?: number | null;
  alt_max?: number | null;
  detect_from_deg?: number | null;
  detect_to_deg?: number | null;
  track_from_deg?: number | null;
  track_to_deg?: number | null;
  sector_from_deg?: number | null;
  sector_to_deg?: number | null;
}

/**
 * ולידציה של טופס הקטלוג. מחזיר **מפתחות שגיאה** (ולא טקסט) כדי שהניסוח יישאר
 * ב-i18n: `airDefense.err<Key>`.
 *
 * הטופס חוסם **ומנמק** - כלל CLAUDE.md "לא לתת לפקד להידלק בלי שקורה משהו"
 * חל גם בכיוון ההפוך: פקד שנחסם בלי סיבה נראה למפעיל כמו תקלה במערכת.
 */
export function validateSystemInput(input: AdSystemInput): string[] {
  const errs: string[] = [];

  if (!String(input.name ?? '').trim()) errs.push('nameRequired');
  if (!AD_KINDS.includes(input.kind as AdKind)) errs.push('kindInvalid');

  // טווח ריק לגיטימי - הוא ב"מ שנקבע בפריסה. טווח שהוזן חייב להיות חיובי.
  const range = num(input.range_nm);
  if (range !== null && range <= 0) errs.push('rangeInvalid');

  const [lo, hi] = normalizeAltRange(input.alt_min ?? null, input.alt_max ?? null);
  const rawLo = num(input.alt_min);
  const rawHi = num(input.alt_max);
  // ההיפוך עצמו אינו שגיאה שמנרמלים בשקט: בטופס הוא כמעט תמיד טעות הקלדה,
  // והמשתמש צריך לראות את זה במקום לגלות אחר כך שהגבהים התחלפו לו.
  if ((rawLo !== null && rawHi !== null && rawLo > rawHi)
    || (lo !== null && lo < 0) || (hi !== null && hi < 0)) errs.push('altRangeInvalid');

  const apertures: [string, number | null | undefined, number | null | undefined][] = [
    ['detect', input.detect_from_deg, input.detect_to_deg],
    ['track', input.track_from_deg, input.track_to_deg],
    ['sector', input.sector_from_deg, input.sector_to_deg],
  ];
  for (const [key, from, to] of apertures) {
    const f = num(from);
    const t = num(to);
    if (f === null && t === null) continue;              // 360 - תקין
    if (f === null || t === null) { errs.push(`${key}ApertureIncomplete`); continue; }
    if (isDegenerateAperture(f, t)) errs.push(`${key}ApertureDegenerate`);
  }

  return errs;
}
