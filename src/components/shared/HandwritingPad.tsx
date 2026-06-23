// HandwritingPad — generic, offline, stroke-based handwriting input.
// Captures pen/touch/mouse strokes on a canvas, recognizes them with the
// offline $P recognizer, and resolves the result against a context candidate
// set (e.g. current strip callsigns). 100% offline — no Tesseract, no network.
//
// This is the reusable "general feature". Per-case behavior (e.g. "callsign on
// map → drag the strip") is wired by the parent via the onResolved callback.
import { useEffect, useRef, useState } from 'react';
import { DollarPRecognizer } from '../../utils/dollarRecognizer';
import { resolveContext, ContextMatch } from '../../utils/handwritingContext';

export interface HandwritingResult {
  raw: string | null;                 // best label from the recognizer
  rawScore: number;                   // recognizer confidence 0..1
  best: ContextMatch | null;          // best context match (or null)
  matches: ContextMatch[];            // ranked context candidates
  ambiguous: boolean;                 // true → parent should disambiguate
  strokes: { x: number; y: number }[][]; // raw ink (for passive learning)
}

interface Props {
  recognizer: DollarPRecognizer;      // built from seed + learned templates
  candidates: string[];               // known values for this context
  onResolved: (r: HandwritingResult) => void;
  onCancel?: () => void;
  width?: number;
  height?: number;
  threshold?: number;
  title?: string;
}

type Stroke = { x: number; y: number }[];

export default function HandwritingPad({
  recognizer, candidates, onResolved, onCancel,
  width = 320, height = 220, threshold = 0.5, title = 'כתוב כאן',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const ctx = () => canvasRef.current?.getContext('2d') ?? null;

  useEffect(() => { clear(); /* init */ }, []);

  const coords = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    // palm rejection: ignore touch when a pen is the intended device is left to
    // the OS; we accept pen/mouse/touch but each pointerdown starts a stroke.
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    strokesRef.current.push([coords(e)]);
    setHasInk(true);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const p = coords(e);
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    stroke.push(p);
    const c = ctx();
    if (c && stroke.length >= 2) {
      const a = stroke[stroke.length - 2];
      c.strokeStyle = '#e2e8f0';
      c.lineWidth = 2.5;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(p.x, p.y);
      c.stroke();
    }
  };

  const onUp = () => { drawingRef.current = false; };

  const clear = () => {
    strokesRef.current = [];
    setHasInk(false);
    const c = ctx();
    if (c && canvasRef.current) {
      c.fillStyle = '#0f172a';
      c.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const recognize = () => {
    const strokes = strokesRef.current.filter(s => s.length > 0);
    if (strokes.length === 0) return;
    const rec = recognizer.recognize(strokes);
    const { best, matches, ambiguous } = resolveContext(rec.name ?? '', candidates, { threshold });
    onResolved({ raw: rec.name, rawScore: rec.score, best, matches, ambiguous, strokes });
  };

  return (
    <div style={{ background: '#1e293b', border: '2px solid #2563eb', borderRadius: 12, padding: 14, direction: 'rtl', color: '#e2e8f0', display: 'inline-block' }}>
      <div style={{ marginBottom: 8, fontWeight: 'bold', fontSize: 14 }}>{title}</div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        style={{ touchAction: 'none', borderRadius: 8, cursor: 'crosshair', display: 'block' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
        {onCancel && (
          <button onClick={onCancel} style={btn('#475569')}>ביטול</button>
        )}
        <button onClick={clear} style={btn('#64748b')}>נקה</button>
        <button onClick={recognize} disabled={!hasInk} style={{ ...btn('#2563eb'), opacity: hasInk ? 1 : 0.5 }}>זהה</button>
      </div>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { background: bg, color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 'bold', fontSize: 13, cursor: 'pointer' };
}
