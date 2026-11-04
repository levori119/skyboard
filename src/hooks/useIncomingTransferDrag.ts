import React, { useRef, useState } from 'react';

/**
 * **גרירת פ"מ מתקבל מנקודת העברה** - לטבלה / לסרגל או למפה. מקור אחד לשורה
 * המקוצרת (`CompactTransferRow`) ולכרטיס הקטן (`DraggableIncomingTransferMini`).
 *
 * | שחרור על | פעולה |
 * |---|---|
 * | סרגל הפ"מים (`#sidebar-area`) | קבלה (`onAccept`) |
 * | שטח המפה (`#map-area`) במוד טבלה - הטבלה יושבת שם | קבלה (`onAccept`) |
 * | שטח המפה (`#map-area`) | קבלה למפה (`onAcceptToMap`) בנקודת השחרור |
 * | מחוץ לכל אלה | כלום - ההעברה נשארת פתוחה |
 *
 * מגע ועט (CLAUDE.md §גרירה): Pointer Events + `setPointerCapture`, בלי
 * `preventDefault` על `pointerdown`, ו-`touchAction:'none'` על הידית (`handleStyle`).
 * הגרירה מתחילה רק אחרי תזוזה של כמה פיקסלים, כדי שנגיעה בשורה לא תיחשב גרירה.
 * פקדים בתוך השורה (✓, הגובה) עוצרים את ה-`pointerdown` שלהם, ולכן נשארים לחיצים.
 */
const DRAG_THRESHOLD_PX = 6;

export function useIncomingTransferDrag(opts: {
  transferId: string;
  enabled: boolean;
  tableMode?: boolean;
  zoom?: number;
  pan?: { x: number; y: number };
  onAccept: (id: string) => void;
  onAcceptToMap?: (id: string, x: number, y: number, clientX?: number, clientY?: number) => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const dragging = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const dropAt = (clientX: number, clientY: number) => {
    const o = optsRef.current;
    const hit = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom ? r : null;
    };
    if (hit('sidebar-area')) { o.onAccept(o.transferId); return; }
    const rect = hit('map-area');
    if (!rect) return;
    if (o.tableMode || !o.onAcceptToMap) { o.onAccept(o.transferId); return; }
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const z = o.zoom || 1;
    const rawX = (clientX - cx - (o.pan?.x ?? 0)) / z + rect.width / 2;
    const rawY = (clientY - cy - (o.pan?.y ?? 0)) / z + rect.height / 2;
    const x = Math.max(100, Math.min(rect.width - 100, rawX));
    const y = Math.max(40, Math.min(rect.height - 50, rawY));
    o.onAcceptToMap(o.transferId, x, y, clientX, clientY);
  };

  const end = (e: React.PointerEvent<HTMLElement>, drop: boolean) => {
    const s = start.current;
    start.current = null;
    try { if (s) e.currentTarget.releasePointerCapture(s.id); } catch { /* כבר שוחרר */ }
    const was = dragging.current;
    dragging.current = false;
    setPos(null);
    if (was && drop) dropAt(e.clientX, e.clientY);
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (!optsRef.current.enabled || e.button > 0) return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* מצביע שכבר שוחרר */ }
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      if (!dragging.current && Math.hypot(e.clientX - s.x, e.clientY - s.y) < DRAG_THRESHOLD_PX) return;
      dragging.current = true;
      setPos({ x: e.clientX, y: e.clientY });
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => end(e, true),
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => end(e, false),
  };

  const handleStyle: React.CSSProperties = opts.enabled
    ? { touchAction: 'none', userSelect: 'none', cursor: pos ? 'grabbing' : 'grab' }
    : {};

  /** מיקום המצביע בזמן גרירה (פיקסלי מסך, ל-`position:fixed` ב-portal ל-body), או null */
  return { pos, handlers, handleStyle };
}
