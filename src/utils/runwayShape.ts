// ציור מסלול המראה כ**מסלול** ולא כקו.
//
// קו בעובי אחיד אינו אומר לפקח דבר מלבד "יש כאן מסלול". השרטוט המקובל נושא מידע:
// רוחב אמיתי (ולכן יחס נכון לסביבה), ספי המסלול בשני הקצוות, קו מרכז מקווקו
// ומספר הכיוון בכל קצה - כך שמבט אחד מספיק כדי לדעת באיזה קצה מסתכלים.
//
// ⚠ אותו מרחב איזוטרופי כמו בהקפות (ראה trafficPattern.ts): שכבת ה-SVG של המפה
// היא `preserveAspectRatio="none"`, ולכן חישוב "באחוזים" היה נותן מסלול שרוחבו
// משתנה עם הכיוון. כל האורכים כאן הם ב**אחוז מגובה התמונה** וכל פונקציה מקבלת
// `aspect` (רוחב/גובה).

import type { Pt } from './trafficPattern';

export interface RunwayGeo {
  start_x_pct?: number | null; start_y_pct?: number | null;
  end_x_pct?: number | null; end_y_pct?: number | null;
  heading_a?: string | null; heading_b?: string | null;
  name?: string | null;
}

/**
 * צבע מסלול סגור. **צבע סטטוס** ולכן קבוע בכל תמה, ומשותף למפה השטוחה
 * ולסצנה התלת מימדית - מסלול סגור נראה אותו דבר בשני המבטים.
 */
export const RUNWAY_CLOSED_COLOR = '#ef4444';

/** רוחב מסלול ברירת מחדל, באחוז מגובה התמונה. */
export const DEFAULT_RUNWAY_WIDTH = 2.4;

/** גבולות הרוחב הנגזר - מתחת למינימום הסימונים אינם קריאים, מעליו זה כבר לא מסלול. */
export const MIN_RUNWAY_WIDTH = 2.0;
export const MAX_RUNWAY_WIDTH = 4.6;

/**
 * רוחב לציור, נגזר מאורך המסלול.
 *
 * הפרופורציה האמיתית (45 מ' רוחב על 3 ק"מ אורך) יוצאת חוט דק על מפה בגודל מסך,
 * ואז ספי המסלול וקו המרכז אינם נראים - כלומר חזרנו לקו. השרטוט התפעולי הוא
 * סכמטי בכוונה: רחב מספיק כדי לשאת את הסימונים, וחסום למעלה כדי שלא יבלע את
 * סביבתו. אפשר לדרוס בפרופ `width`.
 */
export function derivedRunwayWidth(length: number): number {
  return Math.min(MAX_RUNWAY_WIDTH, Math.max(MIN_RUNWAY_WIDTH, length * 0.065));
}

const RAD = Math.PI / 180;
const toIso = (p: Pt, aspect: number): Pt => ({ x: p.x * aspect, y: p.y });
const toPct = (p: Pt, aspect: number): Pt => ({ x: p.x / aspect, y: p.y });

export interface RunwayAxis {
  from: Pt; to: Pt;
  /** אורך ביחידות iso (אחוז מגובה התמונה) */
  length: number;
  /** מעלות מסך, 0 = כלפי מעלה, עם כיוון השעון - כיוון הטיסה מקצה A */
  bearing: number;
  /** וקטורי יחידה במרחב iso */
  dir: Pt; lat: Pt;
}

export function runwayAxis(rw: RunwayGeo, aspect: number): RunwayAxis | null {
  const sx = Number(rw.start_x_pct), sy = Number(rw.start_y_pct);
  const ex = Number(rw.end_x_pct), ey = Number(rw.end_y_pct);
  if (![sx, sy, ex, ey].every(Number.isFinite)) return null;
  const dx = (ex - sx) * aspect, dy = ey - sy;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  const dir = { x: dx / length, y: dy / length };
  return {
    from: { x: sx, y: sy }, to: { x: ex, y: ey }, length,
    bearing: ((Math.atan2(dx, -dy) / RAD) + 360) % 360,
    dir, lat: { x: -dir.y, y: dir.x },
  };
}

/** נקודה על המסלול: `along` מהסף A לאורך הציר, `off` לרוחב. הכל ב-iso. */
const at = (ax: RunwayAxis, aspect: number, along: number, off: number): Pt => {
  const o = toIso(ax.from, aspect);
  return toPct({ x: o.x + ax.dir.x * along + ax.lat.x * off, y: o.y + ax.dir.y * along + ax.lat.y * off }, aspect);
};

/** ארבע פינות מלבן האספלט, לפי סדר: A-שמאל, B-שמאל, B-ימין, A-ימין. */
export function runwayQuad(rw: RunwayGeo, aspect: number, width = DEFAULT_RUNWAY_WIDTH): Pt[] | null {
  const ax = runwayAxis(rw, aspect);
  if (!ax) return null;
  const h = width / 2;
  return [at(ax, aspect, 0, -h), at(ax, aspect, ax.length, -h), at(ax, aspect, ax.length, h), at(ax, aspect, 0, h)];
}

export interface ThresholdBar { end: 'a' | 'b'; points: Pt[] }

/**
 * פסי הסף ("פסנתר") בשני הקצוות. מספר הפסים קבוע והם נדחסים לרוחב המסלול,
 * ואורכם נחסם לרבע מאורך המסלול כדי שבמסלול קצר הם לא יבלעו אותו.
 */
export function thresholdBars(rw: RunwayGeo, aspect: number, width = DEFAULT_RUNWAY_WIDTH, count = 4): ThresholdBar[] {
  const ax = runwayAxis(rw, aspect);
  if (!ax) return [];
  const barLen = Math.min(width * 0.9, ax.length / 4);
  const slot = width / (count * 2 - 1); // פס, רווח, פס...
  const out: ThresholdBar[] = [];
  for (const end of ['a', 'b'] as const) {
    const base = end === 'a' ? 0 : ax.length - barLen;
    for (let i = 0; i < count; i++) {
      const off = -width / 2 + i * slot * 2;
      out.push({
        end,
        points: [
          at(ax, aspect, base, off), at(ax, aspect, base + barLen, off),
          at(ax, aspect, base + barLen, off + slot), at(ax, aspect, base, off + slot),
        ],
      });
    }
  }
  return out;
}

/** מקטעי קו המרכז המקווקו, מקצה לקצה. */
export function centerlineDashes(rw: RunwayGeo, aspect: number, dash = 3, gap = 2): { from: Pt; to: Pt }[] {
  const ax = runwayAxis(rw, aspect);
  if (!ax) return [];
  const out: { from: Pt; to: Pt }[] = [];
  const step = Math.max(0.2, dash + gap);
  for (let s = 0; s < ax.length; s += step) {
    const e = Math.min(s + dash, ax.length);
    if (e - s < 0.05) break;
    out.push({ from: at(ax, aspect, s, 0), to: at(ax, aspect, e, 0) });
  }
  return out;
}

/** גובה מספר הכיוון (בלי `sz`) - גם הסימונים שסביבו נמדדים לפיו */
export const designatorFontSize = (width: number): number => Math.max(1.7, width * 0.62);

export interface Designator { at: Pt; text: string; rotation: number }

/**
 * מספר הכיוון בכל קצה. המספר מסובב לכיוון הטיסה **מאותו קצה**, כמו על המסלול
 * עצמו - כך שמטוס שנוחת רואה אותו זקוף.
 */
export function designatorText(rw: RunwayGeo, aspect: number): { a: Designator; b: Designator } | null {
  const ax = runwayAxis(rw, aspect);
  if (!ax) return null;
  const parts = String(rw.name ?? '').split('/').map(s => s.trim());
  const a = String(rw.heading_a ?? '').trim() || parts[0] || '';
  const b = String(rw.heading_b ?? '').trim() || parts[1] || '';
  if (!a && !b) return null;
  const inset = designatorInset(ax.length);
  return {
    a: { at: at(ax, aspect, inset, 0), text: a, rotation: ax.bearing },
    b: { at: at(ax, aspect, ax.length - inset, 0), text: b, rotation: (ax.bearing + 180) % 360 },
  };
}

/** מרחק מספר הכיוון מהסף */
const designatorInset = (length: number) => Math.min(length * 0.18, length / 2 - 0.01);

export interface AidLabel { at: Pt; rotation: number; fontSize: number; lineHeight: number }

/**
 * מיקום סימוני אמצעי הנחיתה בקצה מסוים - **בין הזברה למספר**, עם כיוון המסלול.
 *
 * זה בדיוק המקום שבו הם מסומנים על המסלול האמיתי: הטייס שנוחת מאותו קצה חוצה
 * את הסף, ומיד אחריו קורא את האמצעים ואת מספר הכיוון - שניהם זקופים לכיוונו.
 * ולכן גם הסיבוב זהה לזה של המספר, והאמצעי הראשון הוא הקרוב לזברה.
 *
 * גודל הטקסט נגזר משני חסמים ולא מקבוע: **רוחב המסלול** (המילה נמתחת לרוחבו,
 * ו-"TACAN" ארוך מ-"GS") ו**גובה הרצועה** שנותרה בין הזברה למספר. בלי שניהם
 * הכיתוב היה חורג מהאספלט במסלול צר או דורס את המספר במסלול קצר.
 */
export function aidLabels(
  rw: RunwayGeo, aspect: number, width: number, end: 'a' | 'b', labels: string[],
): AidLabel[] {
  const ax = runwayAxis(rw, aspect);
  if (!ax || !labels.length) return [];
  const barLen = Math.min(width * 0.9, ax.length / 4);        // אורך פסי הסף
  const near = barLen + width * 0.12;                          // רווח נשימה מהזברה
  const far = designatorInset(ax.length) - designatorFontSize(width) * 0.6;
  const band = far - near;
  if (band <= 0) return [];                                    // מסלול קצר מדי לסימון
  const lineH = band / labels.length;
  const maxChars = Math.max(...labels.map(l => l.length), 1);
  // חסם שלישי: לעולם לא בגודל מספר הכיוון. הוא **הזהות** של המסלול, והאמצעים
  // תלויים בו - "GS" קצר היה יוצא גדול ממנו לפי חסם הרוחב בלבד.
  const fontSize = Math.min(
    (width * 0.86) / (maxChars * 0.62),
    lineH * 0.78,
    designatorFontSize(width) * 0.7,
  );
  return labels.map((_, i) => {
    const off = near + lineH * (i + 0.5);
    return {
      at: at(ax, aspect, end === 'a' ? off : ax.length - off, 0),
      rotation: end === 'a' ? ax.bearing : (ax.bearing + 180) % 360,
      fontSize,
      // גובה הרצועה של הסימון הבודד - המשבצת שמאחוריו נחסמת לפיו כדי
      // ששתי משבצות סמוכות לא ייגעו
      lineHeight: lineH,
    };
  });
}

// ── תצוגת המסלול: צבע ורוחב ──────────────────────────────────────────────────
//
// המסלול מצויר על תמונת שדה אמיתית, ולכן אין צבע אחד שנכון לכל מפה: על תצלום
// אוויר בהיר האספלט הכהה נבלע, ועל מפה סכמטית כהה דווקא הבהיר נעלם. הבורר הוא
// **תצוגה** ולא הגדרת שדה - כל פקח בוחר את מה שנקרא לו על המסך שלו.

export type RunwayPaletteMode = 'dark' | 'light';

export interface RunwayPalette { asphalt: string; edge: string; marking: string }

const RUNWAY_PALETTES: Record<RunwayPaletteMode, RunwayPalette> = {
  // כהה = ברירת המחדל, כפי שהיה עד היום
  dark: { asphalt: '#1f2937', edge: '#e5e7eb', marking: '#f8fafc' },
  // בהיר: המיסעה בהירה, ולכן הסימונים חייבים להתהפך לכהים כדי להישאר קריאים
  light: { asphalt: '#e5e7eb', edge: '#334155', marking: '#0f172a' },
};

export const runwayPalette = (mode?: RunwayPaletteMode | null): RunwayPalette =>
  RUNWAY_PALETTES[mode === 'light' ? 'light' : 'dark'];

/** גבולות מכפיל הרוחב הידני - מתחת למינימום הסימונים נעלמים, מעליו זה כבר לא מסלול. */
export const MIN_WIDTH_SCALE = 0.6;
export const MAX_WIDTH_SCALE = 2.5;
export const WIDTH_SCALE_STEP = 0.15;

/** הצמדת מכפיל הרוחב לתחום. ערך לא תקין חוזר ל-1. */
export const clampWidthScale = (v: unknown): number => {
  // ⚠ `Number(null)` הוא 0 - סופי, ולכן הצמדה עיוורת הייתה הופכת "אין הגדרה"
  // לרוחב המינימלי. היעדר ערך פירושו "בלי שינוי", כלומר 1.
  if (v == null || v === '') return 1;
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_WIDTH_SCALE, Math.max(MIN_WIDTH_SCALE, n));
};

/** צעד אחד למעלה או למטה, מוצמד לתחום ומעוגל כדי שלא יצטברו שברי פיקסל. */
export const stepWidthScale = (v: unknown, dir: 1 | -1): number =>
  clampWidthScale(Math.round((clampWidthScale(v) + dir * WIDTH_SCALE_STEP) * 100) / 100);

// ── חצי המסלול בשימוש: המראה ונחיתה ──────────────────────────────────────────
//
// קצה שסומן בפאנל "מסלולים בשימוש" מקבל חץ על המסלול עצמו, כדי שהפקח יראה
// במבט אחד **לאן** ממריאים ו**מאיפה** נוחתים - בלי לקרוא את הפאנל:
//
//   המראה - גלגול על הקרקע לקראת סוף המסלול, ואז עלייה בזווית מעבר לקצה
//   נחיתה - ירידה בזווית מלפני הסף, ונגיעה בתחילת המסלול
//
// הצורה מוגדרת פעם אחת כ**פרופיל** (מרחק לאורך הציר + גובה), ושני המבטים
// מציירים אותו פרופיל: בתלת מימד הגובה הוא גובה אמיתי, ובמפה השטוחה הוא היסט
// כלפי מעלה על המסך (ראה `runwayUseArrowShape`). כך החץ לא יכול לומר דבר אחד
// במפה ודבר אחר בתלת מימד.

export type RunwayUse = 'takeoff' | 'landing';

/** הקצוות שסומנו בשימוש, לפי שם הקצה (`end_name` של runway-end-use). */
export interface RunwayUseSpec { takeoff?: string[] | null; landing?: string[] | null }

/** נקודה בפרופיל: `along` מסף A לאורך הציר, `h` גובה - שניהם ביחידות iso. */
export interface ProfilePt { along: number; h: number }

export interface RunwayUseArrow {
  use: RunwayUse;
  end: 'a' | 'b';
  ident: string;
  /** הגלגול על הקרקע לפני ההינתקות (המראה בלבד) */
  ground: [ProfilePt, ProfilePt] | null;
  /** הקטע באוויר, **בכיוון הטיסה** - ראש החץ ב-`air[1]` */
  air: [ProfilePt, ProfilePt];
}

/**
 * זווית העלייה/הירידה בשרטוט. סכמטית בכוונה - 3° אמיתיות היו נראות כקו ישר,
 * והחץ היה מאבד בדיוק את מה שהוא בא לומר.
 */
export const RUNWAY_USE_ANGLE_DEG = 25;

/**
 * צבעי החצים - **צבעי סטטוס**, קבועים בכל תמה ומשותפים לשני המבטים. לא ירוק:
 * ירוק על המסלול הוא כבר "אמצעי נחיתה תקין" (runwayAids).
 */
export const RUNWAY_USE_COLOR: Record<RunwayUse, string> = {
  takeoff: '#38bdf8',
  landing: '#f59e0b',
};

/** "09l " → "9L": אותו קצה נכתב לפעמים עם אפס מוביל ולפעמים בלי. */
export const normalizeRunwayIdent = (s: unknown): string =>
  String(s ?? '').trim().toUpperCase().replace(/^0+(?=\d)/, '');

/** שמות שני הקצוות - אותו מקור של `designatorText` (כיוונים, ובהיעדרם השם). */
const endIdents = (rw: RunwayGeo): { a: string; b: string } => {
  const parts = String(rw.name ?? '').split('/').map(s => s.trim());
  return {
    a: String(rw.heading_a ?? '').trim() || parts[0] || '',
    b: String(rw.heading_b ?? '').trim() || parts[1] || '',
  };
};

export function runwayUseArrows(rw: RunwayGeo, aspect: number, use: RunwayUseSpec): RunwayUseArrow[] {
  const ax = runwayAxis(rw, aspect);
  if (!ax) return [];
  const L = ax.length;
  const tan = Math.tan(RUNWAY_USE_ANGLE_DEG * RAD);
  /** אורך הקטע באוויר - יחסי לאורך המסלול, וחסום כדי שיישאר חץ ולא יציף את המפה */
  const run = Math.min(9, Math.max(3, L * 0.18));
  const ids = endIdents(rw);
  const out: RunwayUseArrow[] = [];
  for (const kind of ['takeoff', 'landing'] as const) {
    const wanted = new Set((use[kind] || []).map(normalizeRunwayIdent).filter(Boolean));
    if (!wanted.size) continue;
    for (const end of ['a', 'b'] as const) {
      const ident = ids[end];
      if (!ident || !wanted.has(normalizeRunwayIdent(ident))) continue;
      // `s` = מרחק מהסף של הקצה הזה בכיוון הטיסה; מכאן אל `along` שנמדד מסף A
      const pt = (s: number, h: number): ProfilePt => ({ along: end === 'a' ? s : L - s, h });
      if (kind === 'takeoff') {
        // הגלגול נשאר מעבר למספר הכיוון של הקצה הנגדי, כדי לא לדרוס אותו
        const liftoff = L * 0.95;
        out.push({
          use: kind, end, ident,
          ground: [pt(L * 0.86, 0), pt(liftoff, 0)],
          air: [pt(liftoff, 0), pt(liftoff + run, run * tan)],
        });
      } else {
        // הנגיעה מעט אחרי הסף - לפני מספר הכיוון שהנוחת קורא
        const touchdown = L * 0.08;
        out.push({
          use: kind, end, ident,
          ground: null,
          air: [pt(-run, (run + touchdown) * tan), pt(touchdown, 0)],
        });
      }
    }
  }
  return out;
}

/**
 * כיוון "למעלה" של הפרופיל במפה השטוחה, במרחב iso: ניצב למסלול, לצד שפונה
 * למעלה על המסך - כמו מבט צד שהונח על המפה, כשהשמיים בראש המסך. במסלול אנכי
 * "למעלה" מתלכד עם הציר עצמו והזווית הייתה נעלמת, ולכן שם ההרמה לימין.
 */
const liftDir = (ax: RunwayAxis): Pt => {
  const { lat } = ax;
  if (Math.abs(lat.y) < 1e-6) return { x: Math.abs(lat.x), y: 0 };
  return lat.y < 0 ? lat : { x: -lat.x, y: -lat.y };
};

/** משולש ראש חץ שקצהו ב-`tip` ומכוון מ-`from`. מרחב איזוטרופי בלבד. */
export function arrowHeadPoints(from: Pt, tip: Pt, len: number, halfW: number): Pt[] {
  const dx = tip.x - from.x, dy = tip.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  const bx = tip.x - ux * len, by = tip.y - uy * len;
  return [tip, { x: bx - uy * halfW, y: by + ux * halfW }, { x: bx + uy * halfW, y: by - ux * halfW }];
}

export interface RunwayUseArrowShape {
  ground: [Pt, Pt] | null;
  air: [Pt, Pt];
  /** הטלת הקטע שבאוויר על קו המרכז - המיקום האופקי האמיתי */
  shadow: [Pt, Pt];
  /** קו הורדה מהנקודה הגבוהה אל הצל שלה */
  drop: [Pt, Pt];
  head: Pt[];
}

/** הפרופיל כשרטוט במפה השטוחה (אחוזי תמונה). `width` = רוחב המסלול המצויר. */
export function runwayUseArrowShape(rw: RunwayGeo, aspect: number, arrow: RunwayUseArrow, width: number): RunwayUseArrowShape {
  const ax = runwayAxis(rw, aspect)!;
  const lift = liftDir(ax);
  const o = toIso(ax.from, aspect);
  const iso = (p: ProfilePt): Pt => ({
    x: o.x + ax.dir.x * p.along + lift.x * p.h,
    y: o.y + ax.dir.y * p.along + lift.y * p.h,
  });
  const pct = (p: Pt) => toPct(p, aspect);
  const [a0, a1] = arrow.air;
  const high = a0.h > a1.h ? a0 : a1;
  const headLen = Math.max(1, width * 0.45);
  return {
    ground: arrow.ground ? [pct(iso(arrow.ground[0])), pct(iso(arrow.ground[1]))] : null,
    air: [pct(iso(a0)), pct(iso(a1))],
    shadow: [pct(iso({ along: a0.along, h: 0 })), pct(iso({ along: a1.along, h: 0 }))],
    drop: [pct(iso(high)), pct(iso({ along: high.along, h: 0 }))],
    head: arrowHeadPoints(iso(a0), iso(a1), headLen, headLen * 0.55).map(pct),
  };
}
