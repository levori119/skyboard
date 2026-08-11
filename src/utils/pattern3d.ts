// ─── הקפה תלת מימדית - הליבה המתמטית ─────────────────────────────────────────
//
// הפקח רואה היום את ההקפה **מלמעלה**, והגובה קיים רק כמספר בטבלת בלוקי הגבהים.
// התצוגה התלת מימדית עונה על "מי מעל מי" במבט אחד - אבל מחקר הנדסת אנוש של ATC
// מזהיר שתצוגת 3D היא **דו-משמעית**: אדם אינו אומד גובה ומרחק מהיטל בלי רמזי
// עומק. לכן כל מה שאי אפשר לאמת בעין (ההיטל, סדר העומק, קנה המידה, פרופיל
// הגבהים) יושב כאן כפונקציות טהורות ונבדק ב-vitest, והרכיב רק מצייר.
//
// ── שלוש הכרעות ──────────────────────────────────────────────────────────────
// 1. **היטל אורתוגרפי, לא פרספקטיבי.** בפרספקטיבה אותו מרווח גבהים נראה גדול
//    מקדימה וקטן מאחור - וזו בדיוק הטעות שהמחקר מזהיר מפניה. אורתוגרפי שומר
//    קנה מידה קבוע: שני בלוקים במרחק 1000 רגל נראים תמיד באותו מרחק.
// 2. **SVG עם היטל משלנו, לא three.js.** הסצנה היא עשרות פוליגונים; אלגוריתם
//    הצייר (מיון לפי עומק, ציור מהרחוק לקרוב) מספיק, וסדר ה-DOM ב-SVG מיישם
//    אותו בחינם - בלי 600KB של תלות חדשה לביקורת אבטחה.
// 3. **המסגור מחושב פעם אחת** מכדור חוסם, ולא מחדש בכל סיבוב. אחרת הסצנה
//    "נושמת" בכל תזוזה של היד, וזה בלתי נסבל למעקב.
//
// ── מרחב העולם ───────────────────────────────────────────────────────────────
//   x, y - המישור האופקי, ב**מרחב iso** של trafficPattern.ts (x_iso = x_pct*aspect),
//          y גדל **דרומה** (כלפי מטה במפה).
//   z    - גובה. `patternPath3D`/`altOnLeg` מחזירים אותו **ברגל AGL**; ההמרה
//          ליחידות עולם היא `scaleZ` עם `zScaleFor`, כדי שכל הצירים יהיו באותו
//          קנה מידה. הפרדת היחידות מכוונת: הבדיקות מדברות רגל, הציור מדבר עולם.

import {
  patternPoints,
  type LegKey,
  type PatternGeometry,
  type Pt,
} from './trafficPattern';

export interface Vec3 { x: number; y: number; z: number }

export interface Camera3D {
  /** סיבוב סביב הציר האנכי, מעלות. 0 = צפון למעלה. */
  yaw: number;
  /** גובה המצלמה מעל מישור הקרקע, מעלות. 90 = מבט על (מפה), 0 = גובה עיניים. */
  tilt: number;
  /** זום. 1 = הסצנה ממלאת את המסגרת. */
  zoom: number;
}

export interface Projected { x: number; y: number; near: number }

/** פרופיל הגבהים של ההקפה, ברגל **מעל פני השדה**. */
export interface PatternAltProfile { downwindAlt: number; baseAlt: number }

const RAD = Math.PI / 180;

/**
 * מבט הפתיחה. `tilt: 30` ולא 55 - **נבחר מהתבוננות ברינדור, לא מהנחה.**
 *
 * הרכיב האנכי של ההיטל הוא `cos(tilt)`: ב-55° נשאר ממנו 0.57, ההפרש בין "עם
 * הרוח" ל"בסיס" נדחס, ורשת הקרקע ממלאת את המסגרת כרקע במקום להיקרא כמישור.
 * ב-30° נשאר 0.87: הקרקע נקראת כמישור בפרספקטיבה, ההקפה **מרחפת** מעליה בבירור,
 * וערימת בלוקי הגבהים של נקודת ההצטרפות ברורה במבט אחד.
 */
export const DEFAULT_CAMERA: Camera3D = { yaw: 0, tilt: 30, zoom: 1 };
export const TILT_MIN = 5;
export const TILT_MAX = 90;
export const TILT_STEP = 5;
export const ROT_STEP = 15;
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 4;
export const ZOOM_FACTOR = 1.25;

/** פרישת הגובה ביחידות עולם - כל טווח הגבהים בסצנה תופס את זה. */
export const VERT_SPAN = 45;

/**
 * ברירת המחדל כשלא הוגדרו גבהים להקפה. **בקוד ולא ב-DDL**, כדי שאפשר יהיה
 * לשנות אותה בלי מיגרציה, וכדי ש"לא הוגדר" יישאר מובחן מ"הוגדר במקרה לאותו ערך".
 */
export const DEFAULT_ALT_PROFILE: PatternAltProfile = { downwindAlt: 3000, baseAlt: 1500 };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── ההיטל ────────────────────────────────────────────────────────────────────

/**
 * היטל אורתוגרפי של נקודת עולם למסך, עם עומק למיון.
 *
 * הצירים נגזרים ממצלמה שיושבת **בדרום** הסצנה ומוגבהת בזווית `tilt`:
 *   ימין במסך  = (cos yaw, -sin yaw, 0)
 *   מטה במסך   = (sin·sin yaw, sin·cos yaw, -cos)   → הגובה עולה כלפי מעלה
 *   אל המצלמה  = (0, cos, sin) בציר המסובב            → העומק
 * שלושתם אורתונורמליים, ולכן מרחק במסך לעולם אינו גדול מהמרחק במרחב - זה מה
 * שמאפשר למסגר את הסצנה בכדור חוסם פעם אחת (ראה viewBoxFor).
 *
 * ⚠ סימן ה-`near`: **תחתית המסך היא הקרובה לצופה**, כמו במפה שמוטה קדימה. זה
 * נגזר מאותה מצלמה שנותנת את `y`, ולא נבחר בנפרד - סימן הפוך היה מצייר את
 * הרחוק **מעל** הקרוב באלגוריתם הצייר, וזו טעות שנראית סבירה לחלוטין על המסך.
 */
export function project(p: Vec3, cam: Camera3D): Projected {
  const yr = num(cam.yaw) * RAD, tr_ = num(cam.tilt) * RAD;
  const cy = Math.cos(yr), sy = Math.sin(yr);
  const rx = p.x * cy - p.y * sy;          // סיבוב סביב הציר האנכי
  const ry = p.x * sy + p.y * cy;
  const st = Math.sin(tr_), ct = Math.cos(tr_);
  return {
    x: rx,
    y: ry * st - p.z * ct,    // y במסך גדל כלפי מטה, ולכן גובה מחסיר
    near: p.z * st + ry * ct, // גדול = קרוב למצלמה. מיון עולה = ציור מהרחוק
  };
}

/** היטל וקטור הצפון (0,-1,0) - לחץ הצפון. מסתובב עם yaw ומתקצר עם ההטיה. */
export function northArrow(cam: Camera3D): Pt {
  const q = project({ x: 0, y: -1, z: 0 }, cam);
  return { x: q.x, y: q.y };
}

// ── קנה מידה אנכי ────────────────────────────────────────────────────────────

/** יחידות עולם לרגל, כך שהגובה הגבוה בסצנה נוגע בתקרה. 0 = אין גובה בסצנה. */
export function zScaleFor(maxAltFt: number): number {
  const m = num(maxAltFt);
  return m > 0 ? VERT_SPAN / m : 0;
}

/** רגל AGL → יחידות עולם. המישור האופקי אינו משתנה. */
export function scaleZ(v: Vec3, zScale: number): Vec3 {
  return { x: v.x, y: v.y, z: v.z * num(zScale) };
}

/**
 * גובה מעל פני השדה. בלוקי נקודת ההצטרפות הם גובה **מוחלט** וגבהי ההקפה הם
 * **מעל פני השדה**; בלי גובה השדה אי אפשר לשים את שניהם על אותו ציר.
 * ערך שלילי מוחזר כמות שהוא - בלוק מתחת לפני השדה הוא הגדרה שגויה שצריך לראות.
 */
export function aglOf(altFt: number, elevFt?: number | null): number {
  return num(altFt) - num(elevFt);
}

/** גובה חיובי סופי בלבד נחשב "הוגדר"; כל השאר נופל לברירת המחדל. */
const altOr = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** פרופיל הגבהים של שורת הקפה מה-DB. שדה ריק/לא חוקי → ברירת המחדל. */
export function altProfileOf(
  row: { downwind_alt_ft?: unknown; base_alt_ft?: unknown } | null | undefined,
): PatternAltProfile {
  return {
    downwindAlt: altOr(row?.downwind_alt_ft, DEFAULT_ALT_PROFILE.downwindAlt),
    baseAlt: altOr(row?.base_alt_ft, DEFAULT_ALT_PROFILE.baseAlt),
  };
}

// ── מסגור ────────────────────────────────────────────────────────────────────

/** כדור חוסם של הסצנה: המרכז והרדיוס, במרחב העולם. */
export function sceneBounds(pts: Vec3[]): { center: Vec3; radius: number } {
  const list = (pts || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (!list.length) return { center: { x: 0, y: 0, z: 0 }, radius: 1 };
  const center = {
    x: list.reduce((s, p) => s + p.x, 0) / list.length,
    y: list.reduce((s, p) => s + p.y, 0) / list.length,
    z: list.reduce((s, p) => s + p.z, 0) / list.length,
  };
  const radius = list.reduce(
    (m, p) => Math.max(m, Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z)), 0);
  // סצנה מנוונת (נקודה אחת) - מסגרת ברוחב 0 היא SVG ריק, לא "זום מלא"
  return { center, radius: radius > 1e-6 ? radius : 1 };
}

const f3 = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * מסגרת ריבועית סביב היטל מרכז הסצנה, ברוחב קבוע `2R/zoom`.
 *
 * **הרדיוס נמדד במרחב ולא במסך**, ולכן הוא חוסם את ההיטל בכל זווית (ההיטל
 * אורתונורמלי - ראה project). זה מה שמונע מהסצנה "לנשום" בסיבוב: המסגרת אינה
 * תלויה ב-yaw/tilt כלל, רק המרכז זז.
 */
export function viewBoxFor(center: Vec3, radius: number, cam: Camera3D, pan: Pt): string {
  const c = project(center, cam);
  const r = num(radius) > 0 ? num(radius) : 1;
  const z = num(cam.zoom) > 0 ? num(cam.zoom) : 1;
  const size = (2 * r) / z;
  return `${f3(c.x - size / 2 + num(pan?.x))} ${f3(c.y - size / 2 + num(pan?.y))} ${f3(size)} ${f3(size)}`;
}

// ── פקדי המצלמה ──────────────────────────────────────────────────────────────

export const clampTilt = (t: number): number => clamp(num(t), TILT_MIN, TILT_MAX);
export const clampZoom = (z: number): number => clamp(num(z), ZOOM_MIN, ZOOM_MAX);
export const normYaw = (y: number): number => ((num(y) % 360) + 360) % 360;

// ── פרופיל הגבהים של ההקפה ───────────────────────────────────────────────────

/**
 * השבר על צלע ה"עם הרוח" שבו המטוס **מול הסף** - שם מתחילה ההנמכה בטיסה
 * אמיתית ("abeam the numbers"), ולכן שם היא מתחילה גם בציור.
 */
function abeamFrac(g: PatternGeometry): number {
  const total = num(g.rwyLen) + num(g.upwind) + num(g.baseExt);
  return total > 0 ? clamp((num(g.rwyLen) + num(g.upwind)) / total, 0, 1) : 0.5;
}

/**
 * צומתי ההקפה התלת מימדית, **בסדר הטיסה**. x/y ביחידות iso, z ב**רגל AGL**.
 *
 *  0 קצה המסלול (המראה)      z=0
 *  1 סוף אחרי-המראה           z=downwind/2   (טיפוס)
 *  2 סוף צולבת = תחילת עה"ר   z=downwind
 *  3 **מול הסף** על העה"ר     z=downwind     ← הצומת השביעית שאינה ב-patternPoints
 *  4 סוף עם-הרוח              z=base
 *  5 סוף בסיס                 z=base         (הבסיס מפולס)
 *  6 סוף פיינל = הסף          z=0
 */
export function patternPath3D(g: PatternGeometry, aspect: number, prof: PatternAltProfile): Vec3[] {
  const a = num(aspect) || 1;
  const pts = patternPoints(g, a).map(p => ({ x: p.x * a, y: p.y }));
  const dw = num(prof?.downwindAlt);
  const base = num(prof?.baseAlt);
  const t = abeamFrac(g);
  const abeam = {
    x: pts[2].x + (pts[3].x - pts[2].x) * t,
    y: pts[2].y + (pts[3].y - pts[2].y) * t,
  };
  return [
    { ...pts[0], z: 0 },
    { ...pts[1], z: dw / 2 },
    { ...pts[2], z: dw },
    { ...abeam, z: dw },
    { ...pts[3], z: base },
    { ...pts[4], z: base },
    { ...pts[5], z: 0 },
  ];
}

const legFrac = (frac: number | null | undefined): number =>
  frac == null || !Number.isFinite(Number(frac)) ? 0.5 : clamp(Number(frac), 0, 1);

/**
 * גובה AGL של מטוס שיושב על צלע נתונה בשבר נתון.
 *
 * **נגזר מאותו פרופיל שמצייר את הקו** - אחרת המטוס מרחף מעל ההקפה או שוקע
 * מתחתיה, וזה נראה על המסך כמו תקלת נתונים ולא כמו באג תצוגה.
 */
export function altOnLeg(
  g: PatternGeometry, prof: PatternAltProfile, leg: LegKey, frac: number | null | undefined,
): number {
  const f = legFrac(frac);
  const dw = num(prof?.downwindAlt);
  const base = num(prof?.baseAlt);
  const lerp = (a: number, b: number) => a + (b - a) * f;
  switch (leg) {
    case 'upwind': return lerp(0, dw / 2);
    case 'crosswind': return lerp(dw / 2, dw);
    case 'downwind': {
      const t = abeamFrac(g);
      if (f <= t) return dw;                       // שומר גובה עד מול הסף
      const k = t >= 1 ? 1 : (f - t) / (1 - t);
      return dw + (base - dw) * k;
    }
    case 'base': return base;                      // הבסיס מפולס
    case 'final': return lerp(base, 0);
    default: return 0;
  }
}
