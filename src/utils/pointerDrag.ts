import React from 'react';

/**
 * גרירה בעכבר, בעט ובאצבע - מימוש אחד לכל המערכת.
 *
 * למה קיים: עמדת היעד היא מסך מגע (Wacom Cintiq 24 Touch + Pro Pen 3), והפקח/בקר
 * עובד בעט ובאצבע. `onMouseDown` + `mousemove`/`mouseup` **לא נשלחים באצבע**, ולכן
 * כל ידית שמומשה כך פשוט לא נגררת בעמדה. ראה CLAUDE.md §גרירה - מגע ועט.
 *
 * ארבע המלכודות שהפונקציה סוגרת, וכל מימוש ידני שוכח לפחות אחת:
 *
 * 1. **`touchAction: 'none'`** על הידית (דרך `DRAG_HANDLE_STYLE`) - בלעדיו הדפדפן
 *    תופס את התנועה כגלילה ו-`pointermove` לא נשלח **בכלל** באצבע.
 * 2. **`setPointerCapture`** - בלעדיו הגרירה נקטעת ברגע שהמצביע עובר מעל iframe
 *    (סרגל הצצה לעמדות) או יוצא מהאלמנט.
 * 3. **סקייל גודל המסך** - `#root` תחת `zoom: var(--s)` (1.00 ל-15.6" עד 1.65 ל-24"),
 *    ולכן `clientX/clientY` מגיעים בפיקסלים אמיתיים בעוד `left/top`/`offsetWidth`
 *    ביחידות מוגדלות. ההיסט שמוחזר ל-`onMove` כבר **מחולק ב---s**, כלומר באותן
 *    יחידות של `left/top` - להשוות אותו רק מול גדלים ביחידות אלה
 *    (`offsetWidth`/`offsetHeight`, לא `getBoundingClientRect().width`).
 * 4. **בלי `preventDefault` על ה-pointerdown** - בעט/מגע הוא מבטל את אירועי העכבר
 *    התואמים, ותפריטים שנסגרים ב-`mousedown` נתקעים פתוחים (REFACTOR_LOG 2026-08-01,
 *    גרירת מפה). סימון טקסט נמנע ב-`userSelect` במקום.
 *
 * שימוש:
 *   <div
 *     style={{ ...DRAG_HANDLE_STYLE, cursor: 'move' }}
 *     onPointerDown={e => startPointerDrag(e, {
 *       onMove: (dx, dy) => setPos({ x: orig.x + dx, y: orig.y + dy }),
 *     })}
 *   />
 *
 * לחלון צף שממוקם ב-`right/bottom` יש עטיפה נוחה יותר: `useDragPosition`.
 */

/** הסקייל הגלובלי של גודל המסך (`#root { zoom: var(--s) }`). */
export function readRootScale(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
}

/** סגנון חובה לכל ידית גרירה. בלי `touchAction:'none'` אין `pointermove` באצבע. */
export const DRAG_HANDLE_STYLE: React.CSSProperties = { touchAction: 'none', userSelect: 'none' };

export interface PointerDragOptions {
  /** היסט מנקודת ההתחלה, **ביחידות מוגדלות** (כבר מחולק ב---s) */
  onMove: (dx: number, dy: number, ev: PointerEvent) => void;
  /** שחרור או ביטול (pointercancel) */
  onEnd?: (ev: PointerEvent) => void;
  /**
   * להתעלם מגרירה שהתחילה על כפתור/קלט (ברירת מחדל: true).
   * ⚠ בלי זה ה-pointer capture על הכותרת בולע את ה-click של כפתורי הכותרת
   * והם פשוט לא נלחצים.
   */
  skipInteractive?: boolean;
}

/**
 * מתחיל גרירה מ-`onPointerDown`. מחזיר `false` אם הגרירה לא התחילה
 * (לחצן ימני, או התחלה על כפתור).
 */
export function startPointerDrag(e: React.PointerEvent, opts: PointerDragOptions): boolean {
  if (e.button > 0) return false; // לחצן ימני/אמצעי - לא גרירה
  if (opts.skipInteractive !== false) {
    const t = e.target as Element | null;
    if (t && typeof t.closest === 'function' && t.closest('button, input, select, textarea, a')) return false;
  }
  const handle = e.currentTarget as Element;
  const s = readRootScale();
  const startX = e.clientX / s;
  const startY = e.clientY / s;
  try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }

  const move = (ev: Event) => {
    const pe = ev as PointerEvent;
    opts.onMove(pe.clientX / s - startX, pe.clientY / s - startY, pe);
  };
  const up = (ev: Event) => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', up);
    try { handle.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    opts.onEnd?.(ev as PointerEvent);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
  return true;
}

export default startPointerDrag;
