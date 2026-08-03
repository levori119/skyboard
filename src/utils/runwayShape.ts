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

/** רוחב מסלול ברירת מחדל, באחוז מגובה התמונה. */
export const DEFAULT_RUNWAY_WIDTH = 2.4;

/** גבולות הרוחב הנגזר - מתחת למינימום הסימונים אינם קריאים, מעליו זה כבר לא מסלול. */
export const MIN_RUNWAY_WIDTH = 2.6;
export const MAX_RUNWAY_WIDTH = 7;

/**
 * רוחב לציור, נגזר מאורך המסלול.
 *
 * הפרופורציה האמיתית (45 מ' רוחב על 3 ק"מ אורך) יוצאת חוט דק על מפה בגודל מסך,
 * ואז ספי המסלול וקו המרכז אינם נראים - כלומר חזרנו לקו. השרטוט התפעולי הוא
 * סכמטי בכוונה: רחב מספיק כדי לשאת את הסימונים, וחסום למעלה כדי שלא יבלע את
 * סביבתו. אפשר לדרוס בפרופ `width`.
 */
export function derivedRunwayWidth(length: number): number {
  return Math.min(MAX_RUNWAY_WIDTH, Math.max(MIN_RUNWAY_WIDTH, length * 0.09));
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
  const inset = Math.min(ax.length * 0.18, ax.length / 2 - 0.01);
  return {
    a: { at: at(ax, aspect, inset, 0), text: a, rotation: ax.bearing },
    b: { at: at(ax, aspect, ax.length - inset, 0), text: b, rotation: (ax.bearing + 180) % 360 },
  };
}
