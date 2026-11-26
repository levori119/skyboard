// "פח" צף - אייקון פח זבל שצף על המסך, ואליו גוררים פ"מ מהלוח או מהמפה כדי
// להסתיר אותו מהעמדה הזו בלבד (utils/stripTrash). עד 1.0.510 הפח היה כפתור
// בראש לוח הפ"מים, ולכן נעלם יחד עם הלוח וגרירה מהמפה חייבה לחצות את המסך.
//
// - גרירת האייקון עצמו מזיזה אותו (useDragPosition - עט, אצבע ועכבר), והמיקום
//   נשמר פר-עמדה. לחיצה בלי תזוזה פותחת את רשימת המוסתרים לשחזור.
// - יעד השחרור מזוהה לפי `data-strip-trash` (pointInStripTrash) בכל מסלולי
//   הגרירה, ולגרירת HTML5 יש onDrop משלו.
// - בזמן גרירת פ"מ הפח נצבע אדום וגדל, כדי שיהיה ברור לאן משחררים.

import React, { useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { useDragPosition } from '../../hooks/useDragPosition';
import { windowFrame } from '../../utils/windowFrame';
import { parseTrashPos, clampTrashPos, TRASH_ICON_PX } from '../../utils/stripTrash';

type Palette = { bg: string; surface: string; border: string; text: string; muted: string };

export const FloatingStripTrash = ({ presetId, dragging, trashed, displayName, onDropStrip, onRestore, onRestoreAll, themeMode, lightMode, T }: {
  presetId: number | string | null | undefined;
  /** פ"מ בגרירה כרגע (מכל מסלול) - הפח נדלק */
  dragging: boolean;
  trashed: any[];
  displayName: (s: any) => string;
  onDropStrip: (id: string | number) => void;
  onRestore: (id: string | number) => void;
  onRestoreAll: () => void;
  themeMode: 'light' | 'dark' | 'ocean';
  lightMode: boolean;
  T: Palette;
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(rootRef);
  const [open, setOpen] = useState(false);
  const downRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const posKey = `strip-trash-pos-${presetId ?? 'none'}`;

  // מיקום שמור - מוצמד לגבולות המסך הנוכחי (העמדה יכולה לעלות על מסך קטן יותר)
  useEffect(() => {
    let saved = null;
    try { saved = parseTrashPos(localStorage.getItem(posKey)); } catch { /* אין אחסון */ }
    if (!saved) return;
    const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
    const p = clampTrashPos(saved, window.innerWidth / s, window.innerHeight / s);
    drag.moveTo(p.x, p.y);
  }, [posKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e: React.PointerEvent) => {
    downRef.current = { x: e.clientX, y: e.clientY, moved: false };
    drag.startDrag(e);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = downRef.current;
    if (d && !d.moved && (Math.abs(e.clientX - d.x) > 5 || Math.abs(e.clientY - d.y) > 5)) d.moved = true;
  };
  const onPointerUp = () => {
    if (downRef.current?.moved && drag.pos) {
      try { localStorage.setItem(posKey, JSON.stringify(drag.pos)); } catch { /* נשאר לסשן */ }
    }
  };
  const onClick = () => {
    const moved = downRef.current?.moved;
    downRef.current = null;
    if (!moved) setOpen(v => !v);
  };

  const size = dragging ? TRASH_ICON_PX + 14 : TRASH_ICON_PX;
  // הרשימה נפתחת לכיוון מרכז המסך - כך היא לא נחתכת כשהפח צמוד לקצה.
  // מיקום גאומטרי ביחס למסך, ולכן צד פיזי ולא logical
  const s = typeof window !== 'undefined' ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1) : 1;
  const vw = typeof window !== 'undefined' ? window.innerWidth / s : 1920;
  const vh = typeof window !== 'undefined' ? window.innerHeight / s : 1080;
  const px = drag.pos?.x ?? 20;
  const py = drag.pos?.y ?? vh - 90 - TRASH_ICON_PX;
  const listUp = py > vh / 2;
  const listAlignRight = px > vw / 2;

  return (
    <div ref={rootRef} data-testid="strip-trash-floating"
      style={{ position: 'fixed', zIndex: 9000, width: size, height: size, transition: 'width 0.15s, height 0.15s',
        ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { left: 20, bottom: 90 }) }}>
      <button
        type="button"
        data-strip-trash="1"
        data-testid="strip-trash"
        title={tr('ctrl.stripTrashHint')}
        aria-label={tr('ctrl.stripTrash')}
        {...drag.handleProps}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onClick}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDrop={e => {
          e.preventDefault();
          let id: string | number | null = e.dataTransfer.getData('text/strip-id') || e.dataTransfer.getData('text/strip-id-for-transfer') || null;
          if (!id) { try { id = JSON.parse(e.dataTransfer.getData('text/plain') || '{}').stripId ?? null; } catch { id = null; } }
          if (id != null) onDropStrip(id);
        }}
        style={{ ...drag.handleProps.style, cursor: 'pointer', width: '100%', height: '100%', borderRadius: '50%', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
          fontSize: dragging ? 30 : 24, lineHeight: 1, fontFamily: 'inherit',
          border: `2px ${dragging ? 'solid' : 'dashed'} ${dragging ? '#ef4444' : T.border}`,
          background: dragging ? (lightMode ? '#fee2e2' : '#450a0a') : T.surface,
          color: dragging ? (lightMode ? '#b91c1c' : '#fca5a5') : T.text,
          boxShadow: dragging ? '0 0 0 4px rgba(239,68,68,0.35), 0 4px 14px rgba(0,0,0,0.45)' : '0 3px 10px rgba(0,0,0,0.4)',
          opacity: dragging || open || trashed.length > 0 ? 1 : 0.85 }}
      >
        <span aria-hidden style={{ pointerEvents: 'none' }}>🗑</span>
        {trashed.length > 0 && (
          <span style={{ position: 'absolute', top: -4, insetInlineEnd: -4, minWidth: 20, height: 20, padding: '0 5px', borderRadius: 10,
            background: '#ef4444', color: 'white', fontSize: 11, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            {trashed.length}
          </span>
        )}
      </button>
      {open && (
        <div data-testid="strip-trash-list"
          style={{ position: 'absolute', width: 220, maxHeight: 320, overflowY: 'auto', padding: 8, background: T.bg,
            ...windowFrame('view', themeMode, 8), boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', gap: 4,
            ...(listUp ? { bottom: '100%', marginBottom: 6 } : { top: '100%', marginTop: 6 }),
            ...(listAlignRight ? { right: 0 } : { left: 0 }) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 'bold', color: T.text, marginBottom: 2 }}>
            <span style={{ flex: 1 }}>🗑 {tr('ctrl.stripTrash')}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label={tr('ctrl.stripTrashClose')}
              style={{ border: 'none', background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
          </div>
          {trashed.length === 0
            ? <span style={{ fontSize: 11, color: T.muted, textAlign: 'center' }}>{tr('ctrl.stripTrashEmpty')}</span>
            : <>
                {trashed.map((x: any) => (
                  <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text }}>
                    <span style={{ flex: 1, fontWeight: 'bold' }}>{displayName(x)}</span>
                    <button type="button" data-testid={`strip-trash-restore-${x.id}`} onClick={() => onRestore(x.id)}
                      style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: 'inherit' }}>{tr('ctrl.stripTrashRestore')}</button>
                  </div>
                ))}
                <button type="button" data-testid="strip-trash-restore-all" onClick={() => { onRestoreAll(); setOpen(false); }}
                  style={{ marginTop: 2, padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: 'inherit' }}>{tr('ctrl.stripTrashRestoreAll')}</button>
              </>}
        </div>
      )}
    </div>
  );
};

export default FloatingStripTrash;
