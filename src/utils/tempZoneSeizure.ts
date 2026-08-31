/**
 * **הלאמת אזור זמני** - הלוגיקה הטהורה.
 *
 * מרחב שהעמדה תופסת לזמן קצוב, מציירת ביד על המפה ומפיצה לשאר העמדות.
 * כאן יושבת התשובה לשאלה היחידה שכל עמדה מקבלת שואלת את עצמה:
 * **"מה המרחב הזה עושה לאזורים שלי, ולפ"מים שיושבים בהם?"**
 *
 * ── שתי שאלות נפרדות, ולא אחת ──────────────────────────────────────────────
 * ההשפעה מורכבת מ**גיאומטריה** (האם המרחב חותך את האזור על המפה) ומ**גובה**
 * (האם טווח ההלאמה חופף לגבהים של האזור). שתיהן חייבות להתקיים: מרחב שחותך את
 * האזור ב-100-140 אינו נוגע לבלוק 200-240 שמעליו, ומרחב שחופף בגובה אבל יושב
 * במקום אחר על המפה אינו נוגע לאזור כלל.
 *
 * הצבע שמוצג נגזר משתיהן יחד:
 *
 * | גיאומטריה | גובה | תוצאה | צבע |
 * |-----------|------|-------|-----|
 * | האזור כולו בפנים | כל הגבהים | `full`    | 🔴 אדום |
 * | האזור כולו בפנים | חלק מהגבהים | `partial` | 🟠 כתום |
 * | חיתוך חלקי | חופף | `partial` | 🟠 כתום |
 * | אין חיתוך | - | `none` | ללא שינוי |
 * | כל השאר | אין חפיפה | `none` | ללא שינוי |
 *
 * ── ברירת המחדל הבטוחה ────────────────────────────────────────────────────
 * כשאין גובה להכריע לפיו - התשובה היא **שההלאמה חלה**. זו אותה הכרעה של
 * `zoneRestriction.ts`: התראה מיותרת היא רעש, התראה שלא נשמעה היא פ"מ במרחב
 * מולאם.
 *
 * ── מה כאן ומה לא ─────────────────────────────────────────────────────────
 * חפיפת הגבהים נמדדת ב-`altRangesOverlap` מ-`zoneRestriction.ts` ופגיעה בפוליגון
 * ב-`pointInPolygon` מ-`zoneHit.ts` - **אותן פונקציות**, לא עותקים.
 * ההקרנה מנ"צ לאחוזי תמונה היא של `geo.ts` ואינה כאן.
 *
 * **פונקציות טהורות בלבד** - אין React, אין fetch, אין שעון.
 */

import { altRangesOverlap, type AltBand } from './zoneRestriction';
import { pointInPolygon, type ZonePoint } from './zoneHit';

/** דרגת ההשפעה של ההלאמה על אזור מסוים. */
export type SeizureCoverage = 'none' | 'partial' | 'full';

/** טווח הגבהים של ההלאמה, ברום טיסה. שניהם `null` = **כל** הגבהים. */
export interface SeizureAltRange {
  alt_min?: number | null;
  alt_max?: number | null;
}

/** צבע האזור לפי דרגת ההשפעה. **צבעי סטטוס** - זהים בכל התמות. */
export const SEIZURE_COVERAGE_COLOR: Record<Exclude<SeizureCoverage, 'none'>, string> = {
  partial: '#f97316', // כתום - האזור מוגבל חלקית
  full: '#ef4444',    // אדום - כל האזור מוגבל
};

/** צבע ברירת המחדל של מרחב חדש. */
export const SEIZURE_DEFAULT_COLOR = '#f97316';

/** מינימום קודקודים שמאפשר לסגור פוליגון. */
export const SEIZURE_MIN_VERTICES = 3;

// ── גיאומטריה ────────────────────────────────────────────────────────────────

const orient = (a: ZonePoint, b: ZonePoint, c: ZonePoint): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const onSegment = (a: ZonePoint, b: ZonePoint, p: ZonePoint): boolean =>
  Math.min(a.x, b.x) - 1e-9 <= p.x && p.x <= Math.max(a.x, b.x) + 1e-9 &&
  Math.min(a.y, b.y) - 1e-9 <= p.y && p.y <= Math.max(a.y, b.y) + 1e-9;

/**
 * האם שתי צלעות נחתכות. כולל המקרה הקולינארי (צלעות על אותו ישר שחופפות),
 * שהוא בדיוק המקרה של מרחב שצויר **לאורך גבול** של אזור קיים.
 */
export function segmentsIntersect(a1: ZonePoint, a2: ZonePoint, b1: ZonePoint, b2: ZonePoint): boolean {
  const d1 = orient(b1, b2, a1), d2 = orient(b1, b2, a2);
  const d3 = orient(a1, a2, b1), d4 = orient(a1, a2, b2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (Math.abs(d1) < 1e-12 && onSegment(b1, b2, a1)) return true;
  if (Math.abs(d2) < 1e-12 && onSegment(b1, b2, a2)) return true;
  if (Math.abs(d3) < 1e-12 && onSegment(a1, a2, b1)) return true;
  if (Math.abs(d4) < 1e-12 && onSegment(a1, a2, b2)) return true;
  return false;
}

/** האם צלע כלשהי של פוליגון אחד חוצה צלע של השני. */
export function polygonEdgesCross(a: ZonePoint[], b: ZonePoint[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a1, a2, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return false;
}

/** האם **כל** קודקודי `inner` נמצאים בתוך `outer`. */
export function polygonContains(outer: ZonePoint[], inner: ZonePoint[]): boolean {
  if (outer.length < 3 || inner.length < 3) return false;
  return inner.every(p => pointInPolygon(p.x, p.y, outer));
}

/**
 * דרגת החפיפה ה**גיאומטרית** בין האזור למרחב המולאם - בלי להתחשב בגובה.
 *
 * `full` שמור למקרה שהאזור כולו בתוך המרחב. אזור **שבולע** את המרחב (המרחב
 * קטן ויושב בתוכו) הוא `partial` - ובצדק: רק חלק מהאזור מוגבל.
 */
export function geometricCoverage(zonePts: ZonePoint[], seizurePts: ZonePoint[]): SeizureCoverage {
  if (zonePts.length < 3 || seizurePts.length < 3) return 'none';
  if (polygonContains(seizurePts, zonePts)) return 'full';
  if (polygonEdgesCross(zonePts, seizurePts)) return 'partial';
  // בלי חיתוך צלעות: או שהמרחב כולו בפנים, או שהם זרים לחלוטין
  if (zonePts.some(p => pointInPolygon(p.x, p.y, seizurePts))) return 'partial';
  if (seizurePts.some(p => pointInPolygon(p.x, p.y, zonePts))) return 'partial';
  return 'none';
}

// ── גובה ─────────────────────────────────────────────────────────────────────

const num = (v: number | null | undefined): number | null =>
  v != null && Number.isFinite(v) ? v : null;

/** האם ההלאמה חלה על **כל** הגבהים (טווח ריק). */
export function seizureCoversAllAltitudes(s: SeizureAltRange): boolean {
  return num(s.alt_min) == null && num(s.alt_max) == null;
}

/**
 * דרגת החפיפה בגובה מול בלוקי הגובה של האזור.
 *
 * אזור **בלי** בלוקים (לא מפוצל) הוא עמוד אוויר שלם: הלאמה טווחית נוגעת בחלק
 * ממנו בלבד, ולכן `partial`. רק הלאמה גורפת הופכת אותו ל-`full`.
 */
export function altitudeCoverage(s: SeizureAltRange, bands: AltBand[]): SeizureCoverage {
  if (seizureCoversAllAltitudes(s)) return 'full';
  if (bands.length === 0) return 'partial';
  const hits = bands.filter(b => altRangesOverlap(s.alt_min, s.alt_max, b.lo, b.hi)).length;
  if (hits === 0) return 'none';
  return hits === bands.length ? 'full' : 'partial';
}

/**
 * האם ההלאמה נוגעת ל**גובה נקודתי** (רום טיסה) - השאלה של הפ"מ המהבהב.
 * `null` = אין גובה להכריע לפיו → **ההלאמה חלה** (ברירת המחדל הבטוחה).
 */
export function seizureAffectsAltitude(s: SeizureAltRange, altFl: number | null): boolean {
  if (seizureCoversAllAltitudes(s)) return true;
  if (altFl == null) return true;
  return altRangesOverlap(s.alt_min, s.alt_max, altFl, altFl);
}

// ── התשובה המשולבת ───────────────────────────────────────────────────────────

/**
 * ההשפעה של ההלאמה על אזור - גיאומטריה **וגם** גובה.
 *
 * @param zonePts    פוליגון האזור באחוזי תמונת מפה
 * @param seizurePts פוליגון ההלאמה, מוקרן לאותה מפה
 * @param bands      בלוקי הגובה של האזור. ריק = אזור לא מפוצל
 */
export function seizureCoverage(
  zonePts: ZonePoint[],
  seizurePts: ZonePoint[],
  bands: AltBand[],
  s: SeizureAltRange,
): SeizureCoverage {
  const geo = geometricCoverage(zonePts, seizurePts);
  if (geo === 'none') return 'none';
  const alt = altitudeCoverage(s, bands);
  if (alt === 'none') return 'none';
  return geo === 'full' && alt === 'full' ? 'full' : 'partial';
}

/**
 * האם פ"מ שמוקצה לאזור צריך **להבהב**: האזור מושפע, והגובה שלו בתוך ההלאמה.
 *
 * @param coverage ההשפעה על האזור שהפ"מ יושב בו
 * @param altFl    הגובה שהפ"מ הוקצה לו, ברום טיסה. `null` = לא ידוע → מהבהב
 */
export function pinFlagged(coverage: SeizureCoverage, s: SeizureAltRange, altFl: number | null): boolean {
  if (coverage === 'none') return false;
  return seizureAffectsAltitude(s, altFl);
}

/**
 * ההכרעה על **הקצאה** ולא על גובה בודד - הצורה שבה פ"מ באמת יושב באזור.
 *
 * זו אותה סדר-עדיפויות של `assignmentRestriction`: הבלוק שהפ"מ הוקצה לו הוא
 * **כוונת המפעיל** ולכן גובר על הגובה שרשום בפ"מ, ורק כשאין בלוק נופלים אליו.
 * בלי זה פ"מ בבלוק 100-140 מול הלאמה 130-160 לא היה מהבהב: השוואה לגובה
 * הנקודתי שלו (למשל 110) מפספסת את החפיפה שכן קיימת ברמת הבלוק.
 *
 * @param bands בלוקי הגובה שהפ"מ הוקצה להם באזור. ריק = בלי בלוק.
 * @param altFl הגובה שרשום בפ"מ, ברום טיסה. משמש רק כשאין בלוק. `null` = מהבהב.
 */
export function pinFlaggedForAssignment(
  coverage: SeizureCoverage,
  s: SeizureAltRange,
  bands: AltBand[],
  altFl: number | null,
): boolean {
  if (coverage === 'none') return false;
  if (seizureCoversAllAltitudes(s)) return true;
  if (bands.length > 0) return bands.some(b => altRangesOverlap(s.alt_min, s.alt_max, b.lo, b.hi));
  return seizureAffectsAltitude(s, altFl);
}

// ── מחוות הציור ──────────────────────────────────────────────────────────────
//
// אותה תנועה על המסך יכולה להיות שלושה דברים: **נגיעה** מוסיפה קודקוד, **גרירה**
// מזיזה קודקוד קיים, ונגיעה ב**קודקוד הראשון** סוגרת את הפוליגון. ההכרעה יושבת
// כאן ולא ברכיב כדי שאפשר יהיה לבדוק אותה בלי מסך מגע: זו הלוגיקה שנשברת בשקט
// כשמשנים סף, והיא בדיוק מה שאי אפשר לראות ב-tsc.

/** מרחק מרבי (אחוזי מפה) שעדיין נחשב "נגיעה" ולא גרירה. */
export const SEIZURE_TAP_TOL_PCT = 0.7;
/** מרחק תפיסה של קודקוד קיים. גדול מסף הנגיעה - אצבע רחבה מעט. */
export const SEIZURE_GRAB_TOL_PCT = 1.6;

const dist = (a: ZonePoint, b: ZonePoint): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * הקודקוד שנמצא מתחת לנקודה, או `-1`. כשכמה קודקודים בטווח - ה**קרוב** ביותר,
 * ולא הראשון ברשימה: בפוליגון צפוף הראשון הוא לרוב לא זה שהאצבע כיוונה אליו.
 */
export function vertexAt(pts: ZonePoint[], p: ZonePoint, tol: number = SEIZURE_GRAB_TOL_PCT): number {
  let best = -1, bestD = tol;
  for (let i = 0; i < pts.length; i++) {
    const d = dist(pts[i], p);
    if (d <= bestD) { bestD = d; best = i; }
  }
  return best;
}

/** מה עושה שחרור המצביע, כשלא נגררו קודקודים. */
export type SeizureTapAction = 'add' | 'close' | 'none';

/**
 * ההכרעה בשחרור המצביע.
 *
 * @param start נקודת הירידה · @param end נקודת השחרור (אחוזי מפה)
 * @returns `none` כשהמצביע זז (זו גרירת מפה ולא נגיעה) · `close` כשנגעו
 *          בקודקוד הראשון ויש מספיק קודקודים · אחרת `add`.
 */
export function tapAction(
  pts: ZonePoint[], start: ZonePoint, end: ZonePoint,
  tapTol: number = SEIZURE_TAP_TOL_PCT, grabTol: number = SEIZURE_GRAB_TOL_PCT,
): SeizureTapAction {
  if (dist(start, end) > tapTol) return 'none';
  if (pts.length >= SEIZURE_MIN_VERTICES && dist(end, pts[0]) <= grabTol) return 'close';
  return 'add';
}

// ── תצוגה ────────────────────────────────────────────────────────────────────

/**
 * תיאור טווח הגבהים לתצוגה. `''` = כל הגבהים (הקורא מציג את הטקסט המתורגם).
 * זהה בפורמט ל-`restrictionRangeLabel` כדי ששני הכלים ייקראו אותו דבר.
 */
export function seizureRangeLabel(s: SeizureAltRange): string {
  const lo = num(s.alt_min), hi = num(s.alt_max);
  if (lo == null && hi == null) return '';
  if (lo != null && hi != null) {
    const [a, b] = [Math.min(lo, hi), Math.max(lo, hi)];
    return a === b ? `${a}` : `${a}-${b}`;
  }
  return lo != null ? `${lo}+` : `-${hi}`;
}

/**
 * מנרמל את הטווח לשמירה: `min<=max`, וגבול חסר **נשאר חסר**.
 * "מ-200" הוא 200 ומעלה, ולא הנקודה 200 בלבד - כמו ב-`zoneRestriction`.
 */
export function normalizeSeizureRange(s: SeizureAltRange): { alt_min: number | null; alt_max: number | null } {
  const lo = num(s.alt_min), hi = num(s.alt_max);
  if (lo != null && hi != null) return { alt_min: Math.min(lo, hi), alt_max: Math.max(lo, hi) };
  return { alt_min: lo, alt_max: hi };
}

/**
 * **הזמן שעבר מרגע ההלאמה**, לשעון הרץ בטופס אישורי העמדות.
 *
 * למה זמן רץ ולא שעת ההכרזה: באירוע חי השאלה אינה "מתי זה התחיל" אלא "כמה זמן
 * זה כבר נמשך" - זה מה שמניע את היוצר להרים טלפון לעמדה שטרם אישרה. השעה
 * עצמה מוצגת לצידו, כי לתיעוד צריך גם אותה.
 *
 * הפורמט `H:MM:SS` מעל שעה ו-`MM:SS` מתחתיה - כדי שלא יוצגו אפסים מובילים
 * שגוזלים רוחב בטבלה צרה ואינם אומרים דבר.
 */
export function elapsedLabel(fromIso: string | null | undefined, now: number): string {
  if (!fromIso) return '';
  const t = Date.parse(fromIso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** האם עבר זמן הסיום המשוער - הטריגר להתראת "להאריך או לסיים?" אצל היוצר. */
export function seizureOverdue(etaEnd: string | null | undefined, now: number): boolean {
  if (!etaEnd) return false;
  const t = Date.parse(etaEnd);
  return Number.isFinite(t) && t <= now;
}
