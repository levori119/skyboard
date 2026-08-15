import React, { useEffect, useRef } from 'react';
import { tr } from '../../i18n/tr';
import { readRootScale } from '../../utils/pointerDrag';

/**
 * משטח כתיבה בכתב יד, ב**חצי מסך**, שמחזיר דיו נקי (`data:image/png`).
 *
 * למה לא [`TableHandwritingCanvas`](../transfers/DraggablePanels.tsx): שם הערך
 * הוא **הערה** (טקסט + דיו יחד, בסריאליזציה משלה) בגודל קבוע, וכאן הערך הוא
 * הדיו עצמו בגודל שהאפיון דורש. אותו רכיב לא יכול לשרת את שניהם בלי לשבור את
 * חוזה ההערות, ולכן זו יחידה נפרדת - והיא ב-`shared` כדי שתהיה **הרכיב** לכתב
 * יד של פקדים ולא עוד עותק.
 */
export const InkPad = ({ existing, onSave, onCancel }: {
  existing?: string;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const dirtyRef = useRef(false);

  // `#root` יושב תחת `zoom: var(--s)`, ולכן `50vw` בתוכו היה נמדד ביחידות
  // מוגדלות ומכסה הרבה יותר מחצי מסך. החלוקה ב---s היא שמחזירה את "חצי מסך"
  // למשמעותו הפיזית. אותה מלכודת כמו בגרירה (CLAUDE.md §גרירה, סעיף 3).
  const s = readRootScale();
  const half = (vw: number) => `${vw / s}vw`;
  const halfH = (vh: number) => `${vh / s}vh`;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (existing && existing.startsWith('data:image')) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = existing;
    }
  }, [existing]);

  const at = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const down = (e: React.PointerEvent) => {
    // בלי setPointerCapture הקו נקטע ברגע שהעט יוצא מהקנבס
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = at(e);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawingRef.current || !lastRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = at(e);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    dirtyRef.current = true;
  };

  const up = () => { drawingRef.current = false; lastRef.current = null; };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    dirtyRef.current = true;
  };

  /**
   * שמירה. קנבס לבן נשמר כ**ריק** ולא כתמונה לבנה (מטריצת המקרים, מקרה 24) -
   * אחרת "מחקתי" היה נראה למערכת כמו "כתבתי", והתנאי "ריק/לא ריק" היה משקר.
   */
  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return onCancel();
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    const bctx = blank.getContext('2d');
    if (bctx) { bctx.fillStyle = '#ffffff'; bctx.fillRect(0, 0, blank.width, blank.height); }
    const data = canvas.toDataURL('image/png');
    onSave(data === blank.toDataURL('image/png') ? '' : data);
  };

  return (
    <div
      onClick={e => { e.stopPropagation(); onCancel(); }}
      style={{ position: 'fixed', inset: 0, width: half(100), height: halfH(100), background: 'rgba(0,0,0,0.65)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: half(50), height: halfH(50), minWidth: '320px', minHeight: '220px', background: '#f8fafc', border: '2px solid #0ea5e9', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
      >
        <canvas
          ref={canvasRef}
          width={960}
          height={480}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          // בלי touchAction:'none' הדפדפן תופס את התנועה כגלילה, ובאצבע לא
          // נשלחים pointermove בכלל - כלומר "אי אפשר לכתוב באצבע"
          style={{ flex: 1, width: '100%', minHeight: 0, background: '#ffffff', borderRadius: '6px', border: '1px solid #cbd5e1', touchAction: 'none', cursor: 'crosshair' }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={clear} style={{ padding: '8px 16px', background: '#e2e8f0', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>{tr('shared.clear2')}</button>
          <button onClick={onCancel} style={{ padding: '8px 16px', background: '#475569', color: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>{tr('shared.cancel')}</button>
          <button onClick={save} style={{ padding: '8px 20px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>{tr('shared.save')}</button>
        </div>
      </div>
    </div>
  );
};

export default InkPad;
