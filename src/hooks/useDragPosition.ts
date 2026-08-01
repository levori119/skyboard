import React, { useCallback, useRef, useState } from 'react';

/**
 * גרירת חלון צף (`position: fixed`) בעכבר, בעט או באצבע.
 *
 * למה hook ולא קוד בכל חלון: לכל חלון גרירה יש בדיוק אותן שלוש מלכודות, ובכל
 * מימוש מחדש שוכחים לפחות אחת מהן -
 *
 * 1. **סקייל גודל המסך.** החלון יושב תחת `zoom: var(--s)` (1.00 ל-15.6" ועד 1.65
 *    ל-24"), ולכן `left/top` נמדדים ביחידות המוגדלות בעוד `clientX/clientY`
 *    מגיעים בפיקסלים אמיתיים. בלי חלוקה ב---s החלון זז פי 1.65 מהיד.
 * 2. **מגע ועט.** בלי `touch-action: none` הדפדפן תופס את התנועה כגלילה ולא
 *    שולח `pointermove` בכלל, ובלי `setPointerCapture` הגרירה נקטעת ברגע
 *    שהמצביע עובר מעל iframe (סרגל הצצה לעמדות) או יוצא מהחלון.
 * 3. **קפיצה בגרירה הראשונה.** לפני הגרירה החלון ממוקם ב-`right/bottom` או
 *    ממורכז; המיקום ההתחלתי נקרא מה-DOM (`getBoundingClientRect`) כדי שהגרירה
 *    תתחיל בדיוק מהמקום שבו החלון נראה.
 *
 * **בלי `preventDefault` על ה-pointerdown:** בעט/מגע הוא מבטל את אירועי העכבר
 * התואמים, ותפריטים שנסגרים ב-`mousedown` נתקעים פתוחים (REFACTOR_LOG 2026-08-01,
 * גרירת מפה). סימון טקסט נמנע ב-`user-select` במקום.
 *
 * שימוש:
 *   const winRef = useRef<HTMLDivElement | null>(null);
 *   const drag = useDragPosition(winRef);
 *   <div ref={winRef} style={{ position:'fixed', ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { right: 10, bottom: 14 }) }}>
 *     <div {...drag.handleProps}>⠿</div>
 *   </div>
 */

export interface DragPos { x: number; y: number }

/** כמה מהחלון חייב להישאר על המסך (ביחידות מוגדלות) - שלא ייגרר לאיבוד */
const KEEP_VISIBLE_X = 90;
const KEEP_VISIBLE_Y = 40;

export function useDragPosition(elRef: React.RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<DragPos | null>(null);
  const posRef = useRef<DragPos | null>(null);

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (e.button > 0) return; // לחצן ימני/אמצעי - לא גרירה
    const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
    const handle = e.currentTarget as HTMLElement;

    let origin = posRef.current;
    if (!origin) {
      const r = elRef.current ? elRef.current.getBoundingClientRect() : null;
      origin = r ? { x: r.left / s, y: r.top / s } : { x: e.clientX / s, y: e.clientY / s };
      posRef.current = origin;
      setPos(origin);
    }
    const start = { mx: e.clientX / s, my: e.clientY / s, ox: origin.x, oy: origin.y };
    try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    const move = (me: PointerEvent) => {
      const maxX = window.innerWidth / s - KEEP_VISIBLE_X;
      const maxY = window.innerHeight / s - KEEP_VISIBLE_Y;
      const next = {
        x: Math.min(Math.max(start.ox + me.clientX / s - start.mx, 0), Math.max(maxX, 0)),
        y: Math.min(Math.max(start.oy + me.clientY / s - start.my, 0), Math.max(maxY, 0)),
      };
      posRef.current = next;
      setPos(next);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      try { handle.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }, [elRef]);

  const reset = useCallback(() => { posRef.current = null; setPos(null); }, []);

  /** מוצמד לידית הגרירה - כולל ההגנות למגע/עט */
  const handleProps = {
    onPointerDown: startDrag,
    style: { cursor: 'move', touchAction: 'none', userSelect: 'none' } as React.CSSProperties,
  };

  return { pos, dragged: pos !== null, startDrag, reset, handleProps };
}

export default useDragPosition;
