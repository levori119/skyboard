import React, { useCallback, useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import OnScreenKeyboard from './OnScreenKeyboard';
import { DRAG_HANDLE_STYLE, startPointerDrag } from '../../utils/pointerDrag';
import { DESK_BG_MAX_SIZE, DESK_BG_MIN_SIZE, deskBackgroundStyle, normalizeDeskBackground } from '../../utils/deskBackground';
import { padPaneOrder, splitAfterDrag, type PadLayout, type PadPane } from '../../utils/freeDeskLayout';

/**
 * **משטח הדסק החופשי** - מקלדת וכתב יד על "דף" אחד. משותף לדסק החופשי
 * ולפתקיות (CLAUDE.md §DRY): אותם כלים, אותה פריסה, אותה התנהגות.
 *
 * - **מקלדת שקופצת בנגיעה**: נגיעה באזור ההקלדה פותחת את המקלדת שעל המסך -
 *   העמדה היא מסך מגע, ואין לה מקלדת פיזית שתחכה לפוקוס.
 * - **ספליטר** בין המקלדת לכתב היד במצב "שניהם", **היפוך** ביניהם, ופריסה
 *   אחד מעל השני או זה לצד זה (`freeDeskLayout.ts`).
 * - **כתב היד הוא רסטר** (`data:image/png`) שנשמר בסוף כל משיכה. ה-canvas
 *   **רק גדל** ולא מתכווץ: הקטנת החלון חותכת את התצוגה, לא את הציור - אחרת
 *   השמירה הבאה הייתה מוחקת את מה שנחתך.
 *
 * רכיב **מבוקר**: הטקסט, הדיו והפריסה שייכים לבעלים (הדסק שומר ב-state
 * ובאחסון העמדה, הפתקית בשרת), והמשטח רק מציג ומדווח.
 */
export interface FreeDeskPadProps {
  text: string;
  onTextChange: (text: string) => void;
  /** סוף הקלדה (יציאה מהשדה / סגירת המקלדת) - נקודת שמירה לבעלים ששומר בשרת */
  onTextCommit?: (text: string) => void;
  ink: string | null;
  onInkChange: (ink: string | null) => void;
  layout: PadLayout;
  onLayoutChange: (layout: PadLayout) => void;
  dir: 'rtl' | 'ltr';
  /** צבע הדף. הדסק לבן; הפתקית בצבעה */
  paper?: string;
  readOnly?: boolean;
  placeholder?: string;
}

type InkTool = 'pen' | 'eraser' | 'rect' | 'circle';
const INK_TOOLS: [InkTool, string, string][] = [
  ['pen', '✏', 'ctrl.deskPen'], ['eraser', '🧹', 'ctrl.deskEraser'], ['rect', '▭', 'ctrl.deskRect'], ['circle', '⭕', 'ctrl.deskCircle'],
];

// הדף הוא נייר בכל התמות (כמו הסדק), ולכן הפקדים עליו בצבעי נייר ולא בצבעי תמה
const INK_TEXT = '#1e293b';
const MUTED = '#475569';
const LINE = 'rgba(15,23,42,0.18)';
const ACCENT = '#2563eb';

export default function FreeDeskPad({
  text, onTextChange, onTextCommit, ink, onInkChange, layout, onLayoutChange, dir,
  paper = '#ffffff', readOnly = false, placeholder,
}: FreeDeskPadProps) {
  const [showOSK, setShowOSK] = useState(false);
  const [tool, setTool] = useState<InkTool>('pen');
  const [color, setColor] = useState('#000000');
  const [penSize, setPenSize] = useState(2);
  // היחס בזמן גרירת הספליטר. נמסר לבעלים רק בשחרור - פתקית שומרת בשרת
  const [dragSplit, setDragSplit] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inkWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const snapshotRef = useRef<ImageData | null>(null);
  /** הדיו שהקנבס מציג עכשיו - כדי לא לצייר מחדש את מה שהמשטח עצמו שמר */
  const shownInkRef = useRef<string | null>(null);

  const split = dragSplit ?? layout.split;
  const panes = padPaneOrder(layout);
  const setLayout = (patch: Partial<PadLayout>) => onLayoutChange({ ...layout, ...patch });

  // ── כתב יד ──────────────────────────────────────────────────────────────
  /** מגדיל את ה-canvas (אף פעם לא מקטין) - הגדלה מוחקת אותו, ולכן מציירים מחדש */
  const growCanvas = (w: number, h: number): boolean => {
    const c = canvasRef.current;
    if (!c) return false;
    const nw = Math.max(c.width, Math.ceil(w)), nh = Math.max(c.height, Math.ceil(h));
    if (nw === c.width && nh === c.height) return false;
    c.width = nw; c.height = nh;
    c.style.width = `${nw}px`; c.style.height = `${nh}px`;
    return true;
  };
  const paintInk = useCallback((dataUrl: string | null) => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    shownInkRef.current = dataUrl;
    if (!dataUrl) { ctx.clearRect(0, 0, c.width, c.height); return; }
    const img = new Image();
    img.onload = () => {
      if (shownInkRef.current !== dataUrl) return; // הגיע בינתיים דיו חדש יותר
      growCanvas(img.naturalWidth, img.naturalHeight);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  }, []);

  // דיו שהגיע מבחוץ (שחזור, עמדה אחרת שערכה את הפתקית). לא באמצע משיכה
  useEffect(() => {
    if (drawingRef.current || ink === shownInkRef.current) return;
    paintInk(ink);
  }, [ink, paintInk]);

  // ה-canvas נולד מחדש בכל עגינה/שחרור (יעד ה-portal מתחלף) - משחזרים מהדיו
  const canvasCallbackRef = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    if (!el) return;
    const wrap = inkWrapRef.current;
    if (wrap) growCanvas(wrap.clientWidth, wrap.clientHeight);
    shownInkRef.current = null;
    paintInk(inkLatestRef.current);
  }, [paintInk]);
  const inkLatestRef = useRef(ink);
  inkLatestRef.current = ink;

  useEffect(() => {
    const wrap = inkWrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (growCanvas(wrap.clientWidth, wrap.clientHeight)) paintInk(shownInkRef.current);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [layout.mode, paintInk]);

  const saveInk = () => {
    const c = canvasRef.current;
    if (!c) return;
    const url = c.toDataURL();
    shownInkRef.current = url;
    onInkChange(url);
  };
  const clearInk = () => {
    const c = canvasRef.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    shownInkRef.current = null;
    onInkChange(null);
  };
  const endStroke = () => {
    if (drawingRef.current) saveInk();
    drawingRef.current = false; lastRef.current = null; shapeStartRef.current = null; snapshotRef.current = null;
  };
  const canvasPoint = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    // יחס בין פיקסלי ה-canvas לפיקסלים במסך - מכסה גם את ה-zoom של #root
    return { x: (e.clientX - rect.left) * (c.width / rect.width), y: (e.clientY - rect.top) * (c.height / rect.height) };
  };

  // ── מקלדת ───────────────────────────────────────────────────────────────
  const insertAtCursor = (chunk: string) => {
    const el = textareaRef.current;
    if (!el) { onTextChange(text + chunk); return; }
    const s = el.selectionStart ?? el.value.length;
    const e2 = el.selectionEnd ?? s;
    onTextChange(el.value.slice(0, s) + chunk + el.value.slice(e2));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + chunk.length, s + chunk.length); });
  };
  const backspace = () => {
    const el = textareaRef.current;
    if (!el) { onTextChange(text.slice(0, -1)); return; }
    const s = el.selectionStart ?? el.value.length;
    const e2 = el.selectionEnd ?? s;
    const next = s === e2 ? el.value.slice(0, Math.max(0, s - 1)) + el.value.slice(e2) : el.value.slice(0, s) + el.value.slice(e2);
    const ns = s === e2 ? Math.max(0, s - 1) : s;
    onTextChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ns, ns); });
  };
  const closeOSK = () => { setShowOSK(false); onTextCommit?.(textareaRef.current?.value ?? text); };

  // ── ספליטר ──────────────────────────────────────────────────────────────
  const onSplitterDown = (e: React.PointerEvent) => {
    const body = bodyRef.current;
    if (!body) return;
    const side = layout.orientation === 'side';
    // offsetWidth/Height - באותן יחידות מוגדלות של ההיסט מ-startPointerDrag
    const total = side ? body.offsetWidth : body.offsetHeight;
    let last = layout.split;
    startPointerDrag(e, {
      skipInteractive: false,
      onMove: (dx, dy) => { last = splitAfterDrag(layout, side ? dx : dy, total, dir); setDragSplit(last); },
      onEnd: () => { setDragSplit(null); if (last !== layout.split) setLayout({ split: last }); },
    });
  };

  const seg = (active: boolean): React.CSSProperties => ({
    padding: '2px 7px', fontSize: '12px', borderRadius: '4px', border: `1px solid ${active ? ACCENT : LINE}`,
    background: active ? ACCENT : 'transparent', color: active ? 'white' : MUTED, cursor: 'pointer', minWidth: 28, lineHeight: 1.3,
  });
  const bg = layout.bg;
  const setBg = (patch: Partial<typeof bg>) => setLayout({ bg: normalizeDeskBackground({ ...bg, ...patch }) });
  const side = layout.orientation === 'side';

  const textPane = (
    <div key="text" style={{ flex: `${layout.mode === 'both' ? split : 1} 1 0`, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <textarea
        data-testid="desk-pad-text"
        ref={textareaRef}
        value={text}
        readOnly={readOnly}
        onChange={e => onTextChange(e.target.value)}
        onBlur={e => { if (!showOSK) onTextCommit?.(e.target.value); }}
        // נגיעה באזור ההקלדה מקפיצה את המקלדת שעל המסך
        onPointerDown={() => { if (!readOnly) setShowOSK(true); }}
        placeholder={placeholder ?? tr('ctrl.typeFreeTextHere')}
        style={{
          flex: 1, width: '100%', minHeight: 0, border: 'none', outline: 'none', resize: 'none', fontSize: '14px', padding: '10px',
          direction: dir, fontFamily: 'inherit', color: INK_TEXT, boxSizing: 'border-box', background: paper,
          // ברקע שורות הטקסט יושב על השורות, והרקע נגלל עם הטקסט
          ...deskBackgroundStyle(bg),
          ...(bg.kind !== 'none' && { backgroundColor: paper, backgroundAttachment: 'local', backgroundPosition: '0 10px' }),
          ...(bg.kind === 'lines' && { lineHeight: `${bg.size}px` }),
        }}
      />
    </div>
  );

  const inkPane = (
    <div key="ink" style={{ flex: `${layout.mode === 'both' ? 1 - split : 1} 1 0`, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderBottom: `1px solid ${LINE}`, background: 'rgba(15,23,42,0.04)', flexWrap: 'wrap', flexShrink: 0 }}>
          {INK_TOOLS.map(([t, icon, key]) => (
            <button key={t} onClick={() => setTool(t)} title={tr(key)} style={{ ...seg(tool === t), fontSize: '13px' }}>{icon}</button>
          ))}
          <input type="color" value={color} onChange={e => setColor(e.target.value)} title={tr('shared.color')}
            style={{ width: '26px', height: '22px', padding: '1px', border: `1px solid ${LINE}`, borderRadius: '3px', cursor: 'pointer', background: 'transparent' }} />
          <input type="range" min={1} max={12} value={penSize} onChange={e => setPenSize(Number(e.target.value))}
            title={`${tr('ctrl.deskPenSize')}: ${penSize}`} style={{ width: '64px', touchAction: 'none' }} />
          <button onClick={clearInk} title={tr('shared.clearAll')}
            style={{ padding: '2px 8px', fontSize: '11px', borderRadius: '4px', border: 'none', background: '#fecaca', color: '#7f1d1d', cursor: 'pointer', fontWeight: 'bold' }}>{tr('shared.clear3')}</button>
        </div>
      )}
      {/* הרקע על העטיפה ולא על ה-canvas: המחק ו"נקה" לא נוגעים בו, והוא לא נכנס לדיו השמור */}
      <div ref={inkWrapRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: paper, ...deskBackgroundStyle(bg), ...(bg.kind !== 'none' && { backgroundColor: paper }) }}>
        <canvas
          data-testid="notepad-canvas"
          ref={canvasCallbackRef}
          width={1}
          height={1}
          style={{ position: 'absolute', left: 0, top: 0, display: 'block', cursor: readOnly ? 'default' : 'crosshair', touchAction: 'none' }}
          onPointerDown={e => {
            if (readOnly) return;
            e.stopPropagation();
            const c = canvasRef.current;
            if (!c) return;
            c.setPointerCapture(e.pointerId);
            drawingRef.current = true;
            const p = canvasPoint(e);
            lastRef.current = p;
            if (tool === 'rect' || tool === 'circle') {
              shapeStartRef.current = p;
              snapshotRef.current = c.getContext('2d')?.getImageData(0, 0, c.width, c.height) ?? null;
            }
          }}
          onPointerMove={e => {
            if (!drawingRef.current || !lastRef.current) return;
            e.stopPropagation();
            const ctx = canvasRef.current?.getContext('2d');
            if (!ctx) return;
            const cur = canvasPoint(e);
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            if (tool === 'rect' || tool === 'circle') {
              if (snapshotRef.current) ctx.putImageData(snapshotRef.current, 0, 0);
              const s = shapeStartRef.current!;
              ctx.globalCompositeOperation = 'source-over';
              ctx.strokeStyle = color; ctx.lineWidth = penSize;
              ctx.beginPath();
              if (tool === 'rect') ctx.rect(Math.min(s.x, cur.x), Math.min(s.y, cur.y), Math.abs(cur.x - s.x), Math.abs(cur.y - s.y));
              else ctx.ellipse((s.x + cur.x) / 2, (s.y + cur.y) / 2, Math.abs(cur.x - s.x) / 2, Math.abs(cur.y - s.y) / 2, 0, 0, Math.PI * 2);
              ctx.stroke();
              return;
            }
            ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
            ctx.strokeStyle = color;
            ctx.lineWidth = tool === 'eraser' ? Math.max(penSize * 5, 10) : penSize;
            ctx.beginPath();
            ctx.moveTo(lastRef.current.x, lastRef.current.y);
            ctx.lineTo(cur.x, cur.y);
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
            lastRef.current = cur;
          }}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: paper, direction: dir }}>
      {/* סרגל הדף: מצב, פריסה ורקע */}
      {!readOnly && (
        <div data-testid="notepad-bg-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', borderBottom: `1px solid ${LINE}`, background: 'rgba(15,23,42,0.04)', flexWrap: 'wrap', flexShrink: 0, color: MUTED, fontSize: '11px' }}>
          <div style={{ display: 'flex', gap: '3px' }}>
            {([['keyboard', '⌨', 'ctrl.deskModeKeyboard'], ['handwriting', '✍', 'ctrl.deskModeInk'], ['both', '⌨+✍', 'ctrl.deskModeBoth']] as const).map(([m, icon, key]) => (
              <button key={m} title={tr(key)} onClick={() => setLayout({ mode: m })} style={seg(layout.mode === m)}>{icon}</button>
            ))}
          </div>
          {layout.mode === 'both' && (
            <div style={{ display: 'flex', gap: '3px' }}>
              <button title={tr(side ? 'ctrl.deskStacked' : 'ctrl.deskSide')} onClick={() => setLayout({ orientation: side ? 'stacked' : 'side' })} style={seg(false)}>{side ? '⬍' : '⬌'}</button>
              <button title={tr('ctrl.deskSwap')} onClick={() => setLayout({ swapped: !layout.swapped })} style={seg(layout.swapped)}>{side ? '⇄' : '⇅'}</button>
            </div>
          )}
          {layout.mode !== 'handwriting' && (
            <button title={tr('shared.virtualKeyboard')} onPointerDown={e => { e.preventDefault(); if (showOSK) closeOSK(); else setShowOSK(true); }} style={seg(showOSK)}>{tr('shared.virtualKeyboard')}</button>
          )}
          <div style={{ display: 'flex', gap: '3px' }}>
            {([['none', '▢', 'ctrl.deskBgNone'], ['lines', '☰', 'ctrl.deskBgLines'], ['grid', '▦', 'ctrl.deskBgGrid']] as const).map(([k, icon, key]) => (
              <button key={k} title={tr(key)} onClick={() => setBg({ kind: k })} style={seg(bg.kind === k)}>{icon}</button>
            ))}
          </div>
          {bg.kind !== 'none' && (<>
            <div style={{ display: 'flex', gap: '3px' }}>
              {([['solid', '───', 'ctrl.deskBgSolid'], ['dashed', '- - -', 'ctrl.deskBgDashed'], ['dotted', '·····', 'ctrl.deskBgDotted']] as const).map(([k, icon, key]) => (
                <button key={k} title={tr(key)} onClick={() => setBg({ line: k })} style={{ ...seg(bg.line === k), fontWeight: 'bold', letterSpacing: '-1px' }}>{icon}</button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
              {tr(bg.kind === 'lines' ? 'ctrl.deskBgRowHeight' : 'ctrl.deskBgCellSize')}
              <button onClick={() => setBg({ size: bg.size - 2 })} style={seg(false)}>−</button>
              <input type="range" min={DESK_BG_MIN_SIZE} max={DESK_BG_MAX_SIZE} value={bg.size}
                onChange={e => setBg({ size: Number(e.target.value) })} style={{ width: '70px', touchAction: 'none' }} />
              <button onClick={() => setBg({ size: bg.size + 2 })} style={seg(false)}>+</button>
              <span style={{ minWidth: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{bg.size}</span>
            </label>
          </>)}
        </div>
      )}

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: side && layout.mode === 'both' ? 'row' : 'column', overflow: 'hidden' }}>
        {panes.map((p: PadPane, i) => (
          <React.Fragment key={p}>
            {i > 0 && (
              <div
                data-testid="desk-pad-splitter"
                title={tr('ctrl.deskSplitter')}
                onPointerDown={onSplitterDown}
                style={{
                  ...DRAG_HANDLE_STYLE, flexShrink: 0, background: LINE,
                  ...(side ? { width: 8, cursor: 'col-resize' } : { height: 8, cursor: 'row-resize' }),
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: '9px', lineHeight: 1,
                }}
              >{side ? '⋮' : '⋯'}</div>
            )}
            {p === 'text' ? textPane : inkPane}
          </React.Fragment>
        ))}
      </div>

      {showOSK && !readOnly && layout.mode !== 'handwriting' && (
        <OnScreenKeyboard onType={insertAtCursor} onBackspace={backspace} onEnter={() => insertAtCursor('\n')} onClose={closeOSK} />
      )}
    </div>
  );
}
