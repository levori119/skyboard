// שירות "טקסט חופשי" — חלון כתב יד (דיו) בדסק משימה כללי.
// כמו הסדק: כותבים בצ'ינו ומוחקים בפלנלית. strokes נשמרים כ-JSON בקואורדינטות
// יחסיות (0..1) — עמידים לשינוי גודל חלון. Pointer Events + setPointerCapture +
// touchAction:none (מותאם Cintiq/Pro Pen). ללא OCR — רישום חופשי בלבד.
import { useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { customConfirm } from '../shared/ConfirmModal';
import type { MDFreeTextConfig, MDFreeTextState, MDInkStroke } from '../../types/missionDesk';
import { eraseStrokesAt } from '../../utils/missionDesk';
import type { MDTheme } from './theme';

interface Props {
  config: MDFreeTextConfig;
  state: MDFreeTextState;
  onChange: (next: MDFreeTextState) => void;
  theme: MDTheme;
  onInteracting: (busy: boolean) => void;
}

const COLORS = ['#f1f5f9', '#0f172a', '#ef4444', '#22c55e', '#3b82f6', '#eab308'];

export default function InkPad({ config, state, onChange, theme, onInteracting }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState(theme.ink);
  const [size, setSize] = useState(2.5);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const currentRef = useRef<MDInkStroke | null>(null);
  const erasingRef = useRef<MDInkStroke[] | null>(null); // strokes בזמן גרירת מחיקה
  const strokes = state?.strokes || [];

  const redraw = () => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const { clientWidth: w, clientHeight: h } = wrap;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    // שורות הפרדה לפי הגדרת האדמין
    if (config.ruled) {
      const gap = Math.max(18, config.lineGap || 34);
      ctx.strokeStyle = theme.ruled;
      ctx.lineWidth = 1;
      for (let y = gap; y < h; y += gap) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    }
    const paint = (s: MDInkStroke) => {
      if (s.points.length < 2) return;
      ctx.strokeStyle = s.color; ctx.lineWidth = s.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(s.points[0].x * w, s.points[0].y * h);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * w, s.points[i].y * h);
      ctx.stroke();
    };
    (erasingRef.current || strokes).forEach(paint);
    if (currentRef.current) paint(currentRef.current);
  };

  useEffect(() => {
    redraw();
    const ro = new ResizeObserver(() => redraw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, config.ruled, config.lineGap, theme]);

  const toFrac = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  // רדיוס מחיקה יחסי (~14px על משטח סטנדרטי) — "פלנלית לפי מיקום הסמן"
  const ERASE_R = 0.018;

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onInteracting(true);
    if (tool === 'eraser') {
      const p = toFrac(e);
      erasingRef.current = eraseStrokesAt(strokes, p.x, p.y, ERASE_R);
      redraw();
      return;
    }
    currentRef.current = { points: [toFrac(e)], color, size };
  };
  const onMove = (e: React.PointerEvent) => {
    if (erasingRef.current) {
      const p = toFrac(e);
      const next = eraseStrokesAt(erasingRef.current, p.x, p.y, ERASE_R);
      if (next !== erasingRef.current) { erasingRef.current = next; redraw(); }
      return;
    }
    if (!currentRef.current) return;
    currentRef.current.points.push(toFrac(e));
    redraw();
  };
  const onUp = () => {
    onInteracting(false);
    if (erasingRef.current) {
      const next = erasingRef.current;
      erasingRef.current = null;
      if (next.length !== strokes.length) onChange({ strokes: next });
      return;
    }
    const s = currentRef.current;
    currentRef.current = null;
    if (s && s.points.length > 1) onChange({ strokes: [...strokes, s] });
  };

  const clearAll = async () => {
    if (!strokes.length) return;
    if (!(await customConfirm(tr('missiondesk.confirmClearInk')))) return;
    onChange({ strokes: [] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* סרגל כלים */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: `1px solid ${theme.border}`, flexWrap: 'wrap' }}>
        {config.title && <span style={{ fontSize: 13, fontWeight: 'bold', color: theme.text, marginInlineEnd: 'auto' }}>{config.title}</span>}
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)} title={tr('missiondesk.penColor')}
            style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: color === c ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`, cursor: 'pointer', padding: 0 }} />
        ))}
        <select value={size} onChange={e => setSize(Number(e.target.value))} title={tr('missiondesk.penSize')}
          style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.text, fontSize: 12, padding: '2px 4px' }}>
          <option value={1.5}>{tr('missiondesk.penThin')}</option>
          <option value={2.5}>{tr('missiondesk.penMedium')}</option>
          <option value={5}>{tr('missiondesk.penThick')}</option>
        </select>
        <button onClick={() => onChange({ strokes: strokes.slice(0, -1) })} disabled={!strokes.length}
          style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.subtext, cursor: strokes.length ? 'pointer' : 'default', fontSize: 12, padding: '2px 8px', opacity: strokes.length ? 1 : 0.4 }}>
          ↩ {tr('missiondesk.undo')}
        </button>
        {/* מחק (אייקון) — מוחק במעבר הסמן, כמו ציור רק הפוך; ו"מחק הכל" */}
        <button onClick={() => setTool(t => t === 'eraser' ? 'pen' : 'eraser')}
          title={tr('missiondesk.eraserTool')}
          style={{ background: tool === 'eraser' ? '#7c2d12' : 'none', border: `1px solid ${tool === 'eraser' ? '#ea580c' : theme.border}`, borderRadius: 6, color: tool === 'eraser' ? '#fdba74' : theme.subtext, cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
            <path d="M22 21H7" />
            <path d="m5 11 9 9" />
          </svg>
        </button>
        <button onClick={clearAll} disabled={!strokes.length}
          style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, color: '#f87171', cursor: strokes.length ? 'pointer' : 'default', fontSize: 12, padding: '2px 8px', opacity: strokes.length ? 1 : 0.4 }}>
          {tr('missiondesk.clearInk')}
        </button>
      </div>
      {/* משטח כתיבה */}
      <div ref={wrapRef} style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
        />
      </div>
    </div>
  );
}
