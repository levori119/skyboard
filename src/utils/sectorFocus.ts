/**
 * סקטור על המפה — מפת-בת שנחתכה ממפת אב (`maps.parent_map_id` + `parent_rect`).
 *
 * בעמדה הסקטור **אינו מחליף מפה**: לחיצה על סקטור ברשימה שבפינת המפה ממקדת את
 * אותה מפה (זום + פאן) על תחום הסקטור, ו"מפה מלאה" מחזירה לזום 1. כך הפ"ממים,
 * האזורים ונקודות ההעברה שעל המפה נשארים חיים — מעבר למפת הבת היה מנתק אותם.
 */

export interface RectPct { x1: number; y1: number; x2: number; y2: number }
export interface ImgBounds { left: number; top: number; width: number; height: number }
export interface MapView { zoom: number; pan: { x: number; y: number } }

/** תקרת הזום — זהה לתקרה של כפתורי הזום בסרגל המפה, כדי שלא תיווצר קפיצה בלחיצה על + */
export const MAX_SECTOR_ZOOM = 3;
export const MIN_SECTOR_ZOOM = 0.5;

/** התצוגה המלאה — מה ש"מפה מלאה" מחזיר אליו */
export const FULL_MAP_VIEW: MapView = { zoom: 1, pan: { x: 0, y: 0 } };

/**
 * `parent_rect` מגיע כ-JSONB (אובייקט) או כמחרוזת בשורות ותיקות.
 * מנורמל לאובייקט ממוין (x1<x2, y1<y2) או null אם אינו תקין.
 */
export function parseParentRect(raw: unknown): RectPct | null {
  const r: any = typeof raw === 'string'
    ? (() => { try { return JSON.parse(raw); } catch { return null; } })()
    : raw;
  if (!r) return null;
  const nums = [r.x1, r.y1, r.x2, r.y2];
  if (nums.some(v => typeof v !== 'number' || !isFinite(v))) return null;
  return {
    x1: Math.min(r.x1, r.x2), y1: Math.min(r.y1, r.y2),
    x2: Math.max(r.x1, r.x2), y2: Math.max(r.y1, r.y2),
  };
}

/**
 * הזום והפאן שמביאים את תחום הסקטור למרכז הפאנל ולגודל המרבי שנכנס בו.
 *
 * שכבות המפה עוברות `translate(pan) scale(zoom)` עם `transform-origin: center`,
 * ולכן נקודת תוכן c ממופה למסך לפי `center + (c - center) * zoom + pan`.
 * מכאן, כדי שמרכז הסקטור יישב במרכז הפאנל: `pan = (center - sectorCenter) * zoom`.
 *
 * גודל הפאנל נגזר מ-`imgBounds` (התמונה ממורכזת ב-objectFit:contain, ולכן
 * `panelW = width + 2*left`) — כך אין צורך למדוד את ה-DOM מחדש.
 */
export function sectorFocusView(rect: RectPct, ib: ImgBounds | null, maxZoom: number = MAX_SECTOR_ZOOM): MapView {
  if (!ib) return FULL_MAP_VIEW;
  const panelW = ib.width + 2 * ib.left;
  const panelH = ib.height + 2 * ib.top;
  const rw = ((rect.x2 - rect.x1) / 100) * ib.width;
  const rh = ((rect.y2 - rect.y1) / 100) * ib.height;
  if (!(rw > 0) || !(rh > 0) || !(panelW > 0) || !(panelH > 0)) return FULL_MAP_VIEW;
  const zoom = Math.min(maxZoom, Math.max(MIN_SECTOR_ZOOM, Math.min(panelW / rw, panelH / rh)));
  const cx = ib.left + (((rect.x1 + rect.x2) / 2) / 100) * ib.width;
  const cy = ib.top + (((rect.y1 + rect.y2) / 2) / 100) * ib.height;
  return { zoom: +zoom.toFixed(3), pan: { x: (panelW / 2 - cx) * zoom, y: (panelH / 2 - cy) * zoom } };
}
