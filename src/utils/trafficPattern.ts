// הקפה (traffic pattern) - המסלול המלבני שטס מטוס סביב המסלול:
// אחרי המראה → צולבת → עם הרוח → בסיס → פיינל, כשהפיינל מצביע חזרה למסלול.
//
// ── למה פרמטרים ולא רשימת נקודות חופשית ──────────────────────────────────────
// הקפה היא צורה **מוגדרת**: חמש צלעות בזוויות ישרות סביב ציר המסלול. אם נשמור
// שש נקודות חופשיות, גרירת פינה אחת תשבור את הזוויות וההקפה תפסיק להיות הקפה,
// ו"שכפול הפוך" יידרש לנחש איזו נקודה היא הסף. לכן המודל הוא:
//   עוגן (סף המסלול) + כיוון + צד (ימין/שמאל) + ארבעה אורכי צלעות.
// הנקודות נגזרות ממנו (patternPoints). התוצאה: גרירת פינה = הארכת הצלעות
// הצמודות לה בלבד, סיבוב = שינוי מספר אחד, ושכפול הפוך = היפוך כיוון + החלפת צד.
//
// ── יחידות ──────────────────────────────────────────────────────────────────
// הנקודות הן ב**אחוזי תמונה** (0-100 בשני הצירים) - אותו מרחב של airfield_routes
// ו-airfield_polygons, כדי שהשכבה תשב על אותו SVG overlay.
// אבל שכבת ה-SVG היא preserveAspectRatio="none": יחידה בציר X אינה שווה ליחידה
// בציר Y אלא אם התמונה ריבועית. מלבן אמיתי על הקרקע הוא מלבן ב**פיקסלים**, לא
// באחוזים. לכן כל החישוב הגאומטרי נעשה במרחב איזוטרופי ("iso"), שבו היחידה היא
// אחוז מ**גובה** התמונה, וההמרה היא x_iso = x_pct * aspect  (aspect = רוחב/גובה).
// כל האורכים המאוחסנים (rwyLen/upwind/width/baseExt) הם ביחידות iso.

export interface Pt { x: number; y: number }

export type PatternSide = 'left' | 'right';

export interface PatternGeometry {
  /** סף המסלול - הנקודה שבה הפיינל נוגע במסלול. באחוזי תמונה. */
  anchor: Pt;
  /** כיוון הטיסה בפיינל, מעלות מסך: 0 = כלפי מעלה, עם כיוון השעון. */
  bearing: number;
  /** צד ההקפה ביחס לכיוון הטיסה: הקפת שמאל = הצלעות משמאל למסלול. */
  side: PatternSide;
  /** אורך קטע המסלול שבתוך ההקפה (מהסף ועד נקודת ההמראה). */
  rwyLen: number;
  /** אורך "אחרי המראה" - המשך מעבר לקצה המסלול. */
  upwind: number;
  /** רוחב ההקפה - אורך הצולבת והבסיס. */
  width: number;
  /** אורך הפיינל - כמה ה"עם הרוח" נמשך מעבר לסף. */
  baseExt: number;
}

export const LEG_KEYS = ['upwind', 'crosswind', 'downwind', 'base', 'final'] as const;
export type LegKey = (typeof LEG_KEYS)[number];

/** מפתח i18n לשם הצלע. הטקסטים עצמם ב-src/i18n/registry/pattern.json. */
export const LEG_LABEL_KEYS: Record<LegKey, string> = {
  upwind: 'pattern.legUpwind',
  crosswind: 'pattern.legCrosswind',
  downwind: 'pattern.legDownwind',
  base: 'pattern.legBase',
  final: 'pattern.legFinal',
};

/** אורך צלע מינימלי (באחוזי גובה) - מתחתיו ההקפה מתמוטטת לקו ואי אפשר לגרור אותה חזרה. */
export const MIN_LEG = 0.5;

/** הקפה ברירת מחדל במרכז המפה, לשדה שבו המסלול עוד לא צויר. */
export const DEFAULT_GEOMETRY: PatternGeometry = {
  anchor: { x: 50, y: 62 },
  bearing: 0,
  side: 'left',
  rwyLen: 14,
  upwind: 7,
  width: 14,
  baseExt: 7,
};

// ── מרחב איזוטרופי ───────────────────────────────────────────────────────────

const toIso = (p: Pt, aspect: number): Pt => ({ x: p.x * aspect, y: p.y });
const toPct = (p: Pt, aspect: number): Pt => ({ x: p.x / aspect, y: p.y });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const RAD = Math.PI / 180;

/** וקטור היחידה של כיוון הטיסה (במרחב iso). bearing 0 = כלפי מעלה במסך. */
function dirVec(bearing: number): Pt {
  return { x: Math.sin(bearing * RAD), y: -Math.cos(bearing * RAD) };
}

/** וקטור היחידה לרוחב, לצד שבו יושבת ההקפה. */
function latVec(bearing: number, side: PatternSide): Pt {
  const sign = side === 'left' ? -1 : 1; // ימינה של הטייס = 90° עם כיוון השעון
  return { x: sign * Math.cos(bearing * RAD), y: sign * Math.sin(bearing * RAD) };
}

/** יחס התמונה (רוחב/גובה) מגבולות התמונה המרונדרת. 1 כשאין תמונה. */
export function boundsAspect(b: { width: number; height: number } | null | undefined): number {
  if (!b || !(b.width > 0) || !(b.height > 0)) return 1;
  return b.width / b.height;
}

// ── גאומטריה ─────────────────────────────────────────────────────────────────

/**
 * שש נקודות ההקפה, לפי סדר הטיסה:
 * 0 = קצה המסלול (תחילת "אחרי המראה") · 1 = סוף אחרי-המראה · 2 = סוף צולבת
 * 3 = סוף עם-הרוח · 4 = סוף בסיס · 5 = סוף פיינל (= הסף, העוגן).
 */
export function patternPoints(g: PatternGeometry, aspect: number): Pt[] {
  const a = toIso(g.anchor, aspect);
  const d = dirVec(g.bearing);
  const l = latVec(g.bearing, g.side);
  const at = (along: number, lat: number): Pt =>
    toPct({ x: a.x + d.x * along + l.x * lat, y: a.y + d.y * along + l.y * lat }, aspect);
  return [
    at(g.rwyLen, 0),
    at(g.rwyLen + g.upwind, 0),
    at(g.rwyLen + g.upwind, g.width),
    at(-g.baseExt, g.width),
    at(-g.baseExt, 0),
    at(0, 0),
  ];
}

export interface PatternLeg {
  key: LegKey;
  from: Pt;
  to: Pt;
  mid: Pt;
  /** אורך הצלע ביחידות iso (אחוז מגובה התמונה). */
  length: number;
  /** נורמל **לצלע עצמה**, באחוזי תמונה - לשימוש בהזחת התווית החוצה מההקפה. */
  outward: Pt;
}

/** חמש הצלעות עם הקצוות, האמצע, האורך והכיוון שאליו התווית מוזחת. */
export function patternLegs(g: PatternGeometry, aspect: number): PatternLeg[] {
  const pts = patternPoints(g, aspect);
  const lengths = [g.upwind, g.width, g.rwyLen + g.upwind + g.baseExt, g.width, g.baseExt];
  // ההזחה היא לפי הנורמל **של הצלע**, לא לפי הכיוון ממרכז ההקפה: בצלע קצרה
  // (אחרי המראה) האמצע קרוב לפינה, והזחה מהמרכז הייתה מדביקה את התווית שלה
  // לתווית הצולבת. נורמל הצלע מרחיק כל תווית מהקו שלה, לכיוון אחר לכל צלע.
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return LEG_KEYS.map((key, i) => {
    const from = pts[i];
    const to = pts[i + 1];
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const ex = (to.x - from.x) * aspect, ey = to.y - from.y;
    const len = Math.hypot(ex, ey) || 1;
    let nx = -ey / len, ny = ex / len;
    // מבין שני הנורמלים - זה שמצביע החוצה מגוף ההקפה
    if ((mid.x - cx) * aspect * nx + (mid.y - cy) * ny < 0) { nx = -nx; ny = -ny; }
    return { key, from, to, mid, length: lengths[i], outward: toPct({ x: nx, y: ny }, aspect) };
  });
}

/**
 * שכפול הקפה הפוכה: אותה הקפה, כאילו למסלול הנגדי, **באותו צד פיזי**.
 * מתמטית זהו שיקוף סביב אמצע קטע המסלול: העוגן קופץ לקצה השני, הכיוון מסתובב
 * ב-180°, והצד מתחלף (שמאל↔ימין) - כי אחרי היפוך כיוון הטיסה, "שמאל" של הטייס
 * מצביע לצד הפיזי הנגדי. האורכים אינם משתנים.
 */
export function mirrorGeometry(g: PatternGeometry, aspect: number): PatternGeometry {
  const a = toIso(g.anchor, aspect);
  const d = dirVec(g.bearing);
  return {
    ...g,
    anchor: toPct({ x: a.x + d.x * g.rwyLen, y: a.y + d.y * g.rwyLen }, aspect),
    bearing: (g.bearing + 180) % 360,
    side: g.side === 'left' ? 'right' : 'left',
  };
}

/** הזזת ההקפה כולה. הדלתא באחוזי תמונה; העוגן נשאר בגבולות המפה. */
export function translateGeometry(g: PatternGeometry, dx: number, dy: number): PatternGeometry {
  return { ...g, anchor: { x: clamp(g.anchor.x + dx, 0, 100), y: clamp(g.anchor.y + dy, 0, 100) } };
}

/**
 * גרירת פינה - מאריכה **רק** את הצלעות הצמודות לה, ומשאירה את ההקפה מלבנית.
 * פינה 5 היא העוגן עצמו (הזזה, לא שינוי גודל) ולכן אינה משנה דבר כאן.
 * גרירה מעבר לציר המסלול מחליפה צד - כך הצורה עוקבת אחרי היד ולא נתקעת ברוחב 0.
 */
export function resizeByCorner(g: PatternGeometry, corner: number, target: Pt, aspect: number): PatternGeometry {
  if (corner === 5) return g;
  const a = toIso(g.anchor, aspect);
  const t = toIso(target, aspect);
  const d = dirVec(g.bearing);
  const l = latVec(g.bearing, g.side);
  const v = { x: t.x - a.x, y: t.y - a.y };
  const along = v.x * d.x + v.y * d.y;
  const lat = v.x * l.x + v.y * l.y;

  const next: PatternGeometry = { ...g };
  const applyLat = () => {
    if (lat < 0) next.side = g.side === 'left' ? 'right' : 'left';
    next.width = Math.max(MIN_LEG, Math.abs(lat));
  };
  switch (corner) {
    case 0:
      next.rwyLen = Math.max(MIN_LEG, along);
      break;
    case 1:
      next.upwind = Math.max(MIN_LEG, along - g.rwyLen);
      break;
    case 2:
      next.upwind = Math.max(MIN_LEG, along - g.rwyLen);
      applyLat();
      break;
    case 3:
      next.baseExt = Math.max(MIN_LEG, -along);
      applyLat();
      break;
    case 4:
      next.baseExt = Math.max(MIN_LEG, -along);
      break;
  }
  return next;
}

// ── שם המסלול ────────────────────────────────────────────────────────────────

const IDENT_RE = /^(\d{1,2})([LRClrc]?)$/;

/**
 * השם ההופכי של קצה מסלול: 33 → 15, 09L → 27R.
 * שם שאינו קצה מסלול תקין מחזיר מחרוזת ריקה - עדיף שדה ריק שהמשתמש ימלא
 * מאשר שם שגוי על הקפה.
 */
export function reciprocalIdent(ident: string | null | undefined): string {
  const m = IDENT_RE.exec(String(ident ?? '').trim());
  if (!m) return '';
  const n = Number(m[1]);
  if (!(n >= 1 && n <= 36)) return '';
  const opposite = ((n + 17) % 36) + 1;
  const suffix = m[2].toUpperCase();
  const flipped = suffix === 'L' ? 'R' : suffix === 'R' ? 'L' : suffix;
  return String(opposite).padStart(2, '0') + flipped;
}

export interface RunwayEnd { runway_id: number; ident: string; end: 'a' | 'b' }

/**
 * קצוות המסלול לבחירה ב"לאיזה מסלול ההקפה הזו".
 * המקור הראשי הוא heading_a/heading_b; אם הם ריקים - מפרקים את השם ("33/15").
 */
export function runwayEnds(rw: { id: number; name?: string | null; heading_a?: string | null; heading_b?: string | null }): RunwayEnd[] {
  const parts = String(rw.name ?? '').split('/').map(s => s.trim());
  const a = String(rw.heading_a ?? '').trim() || parts[0] || '';
  const b = String(rw.heading_b ?? '').trim() || parts[1] || '';
  const out: RunwayEnd[] = [];
  if (a) out.push({ runway_id: rw.id, ident: a, end: 'a' });
  if (b) out.push({ runway_id: rw.id, ident: b, end: 'b' });
  return out;
}

/**
 * מכווץ את צלעות ההקפה עד שכולה נכנסת לגבולות המפה (0-100 בשני הצירים).
 *
 * למה: הקפה אמיתית גדולה פי כמה מהמסלול, ומפת שדה היא תרשים של השדה עצמו - הצעה
 * "נכונה אווירודינמית" למסלול ארוך יוצאת מחוץ לתמונה והמשתמש רואה שני קווים
 * חתוכים. העוגן, הכיוון, הצד ואורך המסלול נשמרים; רק שלוש הצלעות מתכווצות
 * **באותו יחס**, כך שצורת ההקפה נשמרת. המשתמש תמיד יכול להאריך חזרה בגרירת פינה.
 */
export function fitToMap(g: PatternGeometry, aspect: number): PatternGeometry {
  const scaled = (k: number): PatternGeometry => ({
    ...g,
    upwind: Math.max(MIN_LEG, g.upwind * k),
    width: Math.max(MIN_LEG, g.width * k),
    baseExt: Math.max(MIN_LEG, g.baseExt * k),
  });
  // שוליים זעירים: התוצאה מעוגלת לשלוש ספרות לפני השמירה, ובלעדיהם עיגול כלפי
  // מעלה של הספרה האחרונה היה מוציא נקודה שנגעה בדיוק בקצה אל מחוץ למפה.
  const M = 0.05;
  const fits = (k: number) => patternPoints(scaled(k), aspect)
    .every(p => p.x >= M && p.x <= 100 - M && p.y >= M && p.y <= 100 - M);
  if (fits(1)) return g;
  // הנקודות אפיניות ב-k, ולכן חיפוש בינארי מתכנס מהר ובלי מקרי קצה של פתרון אנליטי.
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return scaled(lo);
}

/**
 * הקפה מוצעת למסלול שכבר סומן על המפה: העוגן על הסף של הקצה הנבחר, הכיוון לאורך
 * המסלול, והאורכים ביחס לאורך המסלול - כדי שההצעה תיראה סבירה בכל קנה מידה.
 * קצה A = מ-start ל-end (כפי שנשמר בטופס המסלול), קצה B = ההפך.
 */
export function geometryFromRunway(
  rw: { start_x_pct?: number | null; start_y_pct?: number | null; end_x_pct?: number | null; end_y_pct?: number | null },
  end: 'a' | 'b',
  side: PatternSide,
  aspect: number,
): PatternGeometry | null {
  const sx = Number(rw.start_x_pct), sy = Number(rw.start_y_pct);
  const ex = Number(rw.end_x_pct), ey = Number(rw.end_y_pct);
  if (![sx, sy, ex, ey].every(Number.isFinite)) return null;
  const from = end === 'a' ? { x: sx, y: sy } : { x: ex, y: ey };
  const to = end === 'a' ? { x: ex, y: ey } : { x: sx, y: sy };
  const dx = (to.x - from.x) * aspect;
  const dy = to.y - from.y;
  const rwyLen = Math.hypot(dx, dy);
  if (rwyLen < 1e-6) return null;
  const bearing = (Math.atan2(dx, -dy) / RAD + 360) % 360;
  const round = (g: PatternGeometry): PatternGeometry => ({
    ...g,
    bearing: +g.bearing.toFixed(3), rwyLen: +g.rwyLen.toFixed(3),
    upwind: +g.upwind.toFixed(3), width: +g.width.toFixed(3), baseExt: +g.baseExt.toFixed(3),
  });
  return round(fitToMap({
    anchor: { x: from.x, y: from.y },
    bearing,
    side,
    rwyLen,
    upwind: Math.max(MIN_LEG, rwyLen * 0.4),
    width: Math.max(MIN_LEG, rwyLen * 0.6),
    baseExt: Math.max(MIN_LEG, rwyLen * 0.4),
  }, aspect));
}

// ── ציור ─────────────────────────────────────────────────────────────────────

export interface PathSeg { cmd: 'M' | 'L' | 'Q'; c?: Pt; to: Pt }

/**
 * קטעי מסלול הציור עם פינות מעוגלות (כמו בשרטוט ההקפה המקובל).
 * העיגול נחתך לחצי הצלע הקצרה, כדי שקשת לא תבלע צלע שלמה.
 * radius ביחידות iso; מוחזרות נקודות באחוזי תמונה.
 */
export function patternPathSegments(g: PatternGeometry, aspect: number, radius: number): PathSeg[] {
  const iso = patternPoints(g, aspect).map(p => toIso(p, aspect));
  const out: PathSeg[] = [];
  const push = (cmd: PathSeg['cmd'], to: Pt, c?: Pt) => out.push({ cmd, to: toPct(to, aspect), ...(c ? { c: toPct(c, aspect) } : {}) });
  const towards = (from: Pt, to: Pt, dist: number): Pt => {
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const k = Math.min(1, dist / len);
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
  };
  push('M', iso[0]);
  for (let i = 1; i < iso.length - 1; i++) {
    const prev = iso[i - 1], cur = iso[i], next = iso[i + 1];
    const r = Math.min(
      radius,
      Math.hypot(cur.x - prev.x, cur.y - prev.y) / 2,
      Math.hypot(next.x - cur.x, next.y - cur.y) / 2,
    );
    if (r <= 0) { push('L', cur); continue; }
    push('L', towards(cur, prev, r));
    push('Q', towards(cur, next, r), cur);
  }
  push('L', iso[iso.length - 1]);
  return out;
}

/** מחרוזת ה-d של ה-path, מוכנה ל-SVG באחוזי תמונה. */
export function patternPathD(g: PatternGeometry, aspect: number, radius: number): string {
  const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
  return patternPathSegments(g, aspect, radius)
    .map(s => (s.cmd === 'Q' ? `Q ${f(s.c!.x)} ${f(s.c!.y)} ${f(s.to.x)} ${f(s.to.y)}` : `${s.cmd} ${f(s.to.x)} ${f(s.to.y)}`))
    .join(' ');
}

/** נרמול גאומטריה שהגיעה מה-DB (JSONB) - כל שדה חסר נופל לברירת המחדל. */
export function normalizeGeometry(raw: unknown): PatternGeometry {
  const g = (raw && typeof raw === 'object' ? raw : {}) as Partial<PatternGeometry>;
  const anchor = (g.anchor && typeof g.anchor === 'object' ? g.anchor : {}) as Partial<Pt>;
  const num = (v: unknown, fallback: number, min = -Infinity) =>
    Number.isFinite(Number(v)) ? Math.max(min, Number(v)) : fallback;
  return {
    anchor: {
      x: clamp(num(anchor.x, DEFAULT_GEOMETRY.anchor.x), 0, 100),
      y: clamp(num(anchor.y, DEFAULT_GEOMETRY.anchor.y), 0, 100),
    },
    bearing: ((num(g.bearing, 0) % 360) + 360) % 360,
    side: g.side === 'right' ? 'right' : 'left',
    rwyLen: num(g.rwyLen, DEFAULT_GEOMETRY.rwyLen, MIN_LEG),
    upwind: num(g.upwind, DEFAULT_GEOMETRY.upwind, MIN_LEG),
    width: num(g.width, DEFAULT_GEOMETRY.width, MIN_LEG),
    baseExt: num(g.baseExt, DEFAULT_GEOMETRY.baseExt, MIN_LEG),
  };
}
