/**
 * תוויות אזור על המפה - **איפה** הן יושבות ו**כמה בהיר** השם.
 *
 * הקואורדינטות הן אחוזי תמונת מפה (0..100), כמו בשכבת האזורים ובשכבת
 * המרחבים המולאמים.
 *
 * ── למה לא פשוט ממוצע הקודקודים ────────────────────────────────────────────
 * ממוצע הקודקודים של פוליגון קעור (צורת L, פרסה, מרחב מולאם שצויר ביד) נופל
 * לעיתים **מחוץ** לפוליגון, והתווית נקראת כשייכת לאזור השכן. `interiorLabelPoint`
 * מחזירה את הממוצע כשהוא בפנים (ולכן באזור רגיל דבר לא זז), ואחרת את אמצע
 * המקטע הפנימי הקרוב ביותר בשורה אופקית - כך שהתווית תמיד בתוך האזור.
 */

import { pointInPolygon, type ZonePoint } from './zoneHit';

/**
 * רמות הבהירות של שם האזור. ברירת המחדל `dim` - בגוון הגבול האפור.
 * `hidden` מסתיר את שמות האזורים (והערות המפעיל עליהם) לגמרי. תוויות **סטטוס**
 * (סגור/מוגבל, מגבלה) נשארות תמיד - הן מידע בטיחותי ולא כיתוב.
 */
export const ZONE_NAME_BRIGHTNESS_LEVELS = ['dim', 'normal', 'bright', 'hidden'] as const;
export type ZoneNameBrightness = typeof ZONE_NAME_BRIGHTNESS_LEVELS[number];
export const DEFAULT_ZONE_NAME_BRIGHTNESS: ZoneNameBrightness = 'dim';

export const isZoneNameBrightness = (v: unknown): v is ZoneNameBrightness =>
  typeof v === 'string' && (ZONE_NAME_BRIGHTNESS_LEVELS as readonly string[]).includes(v);

/** הרמה הבאה במחזור חלש -> רגיל -> בהיר -> מוסתר -> חלש. */
export const nextZoneNameBrightness = (v: ZoneNameBrightness): ZoneNameBrightness =>
  ZONE_NAME_BRIGHTNESS_LEVELS[(ZONE_NAME_BRIGHTNESS_LEVELS.indexOf(v) + 1) % ZONE_NAME_BRIGHTNESS_LEVELS.length];

/**
 * צבע שם אזור **לא מודגש**. `dim` שווה בדיוק לקו המתאר הניטרלי (הגבול האפור),
 * כך שהשם נקרא כחלק מהגבול ולא כטקסט שצועק מעל המפה.
 */
export function zoneNameFill(light: boolean, level: ZoneNameBrightness): string {
  if (level === 'hidden') return 'none';
  if (light) return level === 'dim' ? 'rgba(0,0,0,0.55)' : level === 'normal' ? 'rgba(0,0,0,0.8)' : '#000000';
  return level === 'dim' ? 'rgba(255,255,255,0.55)' : level === 'normal' ? 'rgba(255,255,255,0.8)' : '#ffffff';
}

/** המקטעים האופקיים שבתוך הפוליגון בגובה y (כלל זוגי-אי-זוגי). */
export function interiorSpansAtY(pts: ZonePoint[], y: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y)) xs.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
  }
  xs.sort((p, q) => p - q);
  const spans: [number, number][] = [];
  for (let k = 0; k + 1 < xs.length; k += 2) spans.push([xs[k], xs[k + 1]]);
  return spans;
}

/**
 * נקודת עיגון לתווית **בתוך** הפוליגון.
 *
 * @param targetY  הגובה המבוקש (ברירת מחדל - ממוצע הקודקודים). מחפשים את
 *                 השורה הקרובה אליו שיש בה מקום.
 * @param minWidth רוחב מינימלי של המקטע (אומדן רוחב הטקסט). כשאין שורה
 *                 רחבה מספיק - חוזרים למקטע הרחב ביותר שנמצא.
 */
export function interiorLabelPoint(pts: ZonePoint[], targetY?: number, minWidth = 0): ZonePoint {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p.x, 0) / (n || 1);
  const cy = pts.reduce((s, p) => s + p.y, 0) / (n || 1);
  if (n < 3) return { x: cx, y: cy };
  const ty = targetY ?? cy;
  const fits = (x: number, y: number) => interiorSpansAtY(pts, y)
    .some(([a, b]) => x - a >= minWidth / 2 && b - x >= minWidth / 2);
  if (pointInPolygon(cx, ty, pts) && fits(cx, ty)) return { x: cx, y: ty };

  const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
  const step = Math.max((maxY - minY) / 80, 0.05);
  let best: { x: number; y: number; w: number } | null = null;
  for (let k = 0; k <= 160; k++) {
    // 0, +1, -1, +2, -2 ... - השורה הקרובה ביותר לגובה המבוקש קודמת
    const off = (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * step;
    const y = ty + off;
    if (y <= minY || y >= maxY) continue;
    // מקטע שמכיל את cx גובר: התווית לא קופצת הצידה בלי צורך
    const spans = interiorSpansAtY(pts, y)
      .map(([a, b]) => ({ a, b, w: b - a, hasCx: cx >= a && cx <= b }))
      .sort((p, q) => Number(q.hasCx) - Number(p.hasCx) || q.w - p.w);
    for (const sp of spans) {
      if (sp.w >= minWidth) {
        const half = minWidth / 2;
        const x = sp.hasCx ? Math.min(Math.max(cx, sp.a + half), sp.b - half) : (sp.a + sp.b) / 2;
        return { x, y };
      }
      if (!best || sp.w > best.w) best = { x: (sp.a + sp.b) / 2, y, w: sp.w };
    }
  }
  return best ? { x: best.x, y: best.y } : { x: cx, y: cy };
}

/** אומדן רוחב טקסט ביחידות ה-viewBox (גס בכוונה - מספיק כדי לבחור שורה). */
export const estimateTextWidth = (text: string, fontSize: number): number =>
  [...text].length * fontSize * 0.55;

/**
 * מבהיר צבע hex לכיוון לבן (`amt` 0..1). צבע שאינו `#rgb`/`#rrggbb` חוזר כמו
 * שהוא. משמש להבהרת תוויות סטטוס על רקע כהה.
 */
export function lightenHex(color: string, amt: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
    .map(v => Math.round(v + (255 - v) * Math.min(Math.max(amt, 0), 1)));
  return '#' + ch.map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * קו וטקסט של אזור **בסטטוס**: סגור/מוגבל, ופוליגון האזורים המחוברים של פ"מ.
 *
 * **דק בכוונה.** הקו מקיף שטח שיש בתוכו אזורים, שמות ופ"מים; קו עבה ותווית
 * גדולה מתחרים בהם ומסתירים בדיוק את מה שהם אמורים לסמן. הצבע והקווקו נושאים
 * את המשמעות (אדום=סגור, כתום=מוגבל), לא העובי. עוביי הסגור/מוגבל מוכפלים
 * בבורר עובי הקווים שבסרגל (`zoneLineWidthFactor`); המחובר אינו קו מתאר של אזור.
 */
export const ZONE_STATUS_STYLE = {
  /** מסגרת האזור הסגור/המוגבל כולו */
  outlineW: 0.5,
  /** בלוק גובה סגור/מוגבל בתצוגת "פצל לגבהים" */
  bandOutlineW: 0.35,
  /** פוליגון האזורים המחוברים של פ"מ */
  groupOutlineW: 0.4,
  /** גודל תווית הסטטוס ("⛔ סגור 100-140", מגבלה חופשית) */
  fontSize: 1.3,
  /** הילה סביב התווית - מפרידה מהמפה. עבה מדי והיא נראית כמו bold */
  haloW: 0.22,
  /** משקל התווית. 300 = Light; פחות מזה נופל ל-300 ברוב הגופנים */
  weight: 300,
} as const;

/**
 * עובי קווי האזורים - מכפיל על כל קווי המתאר של האזור (ניטרלי, מודגש, רצועות
 * גובה, סגור/מוגבל). ברירת המחדל `normal` = העובי הקיים. הבהוב והדגשת אזור
 * נבחר אינם מושפעים - הם התראה ולא קו מתאר.
 */
export const ZONE_LINE_WIDTH_LEVELS = ['thin', 'normal', 'thick', 'xthick'] as const;
export type ZoneLineWidth = typeof ZONE_LINE_WIDTH_LEVELS[number];
export const DEFAULT_ZONE_LINE_WIDTH: ZoneLineWidth = 'normal';
const LINE_WIDTH_FACTOR: Record<ZoneLineWidth, number> = { thin: 0.5, normal: 1, thick: 2, xthick: 3 };

export const isZoneLineWidth = (v: unknown): v is ZoneLineWidth =>
  typeof v === 'string' && (ZONE_LINE_WIDTH_LEVELS as readonly string[]).includes(v);
export const zoneLineWidthFactor = (v: ZoneLineWidth): number => LINE_WIDTH_FACTOR[v] ?? 1;
/** הרמה הבאה במחזור דק -> רגיל -> עבה -> עבה מאוד -> דק. */
export const nextZoneLineWidth = (v: ZoneLineWidth): ZoneLineWidth =>
  ZONE_LINE_WIDTH_LEVELS[(ZONE_LINE_WIDTH_LEVELS.indexOf(v) + 1) % ZONE_LINE_WIDTH_LEVELS.length];
