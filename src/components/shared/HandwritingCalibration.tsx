// HandwritingCalibration — one-time per-user handwriting enrollment.
// Shows every character in a grid; the user writes each in its own cell, so
// every sample is auto-labeled (no segmentation). Saved to learned_strokes
// (per crew member). Optional — the system also learns passively during use.
import { useRef, useState } from 'react';
import { FULL_CHARSET } from '../../utils/handwritingTemplates';
import { saveStrokeSample, clearStrokeSamples } from '../../utils/strokesApi';

type Stroke = { x: number; y: number }[];

function Cell({ label, onStrokes }: { label: string; onStrokes: (s: Stroke[]) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef(false);
  const size = 64;

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault(); ref.current?.setPointerCapture(e.pointerId);
    drawing.current = true; strokes.current.push([pos(e)]);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = pos(e); const s = strokes.current[strokes.current.length - 1]; s.push(p);
    const c = ref.current?.getContext('2d');
    if (c && s.length >= 2) {
      const a = s[s.length - 2];
      c.strokeStyle = '#e2e8f0'; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(p.x, p.y); c.stroke();
    }
  };
  const up = () => { drawing.current = false; onStrokes(strokes.current.filter(s => s.length)); };
  const clear = () => {
    strokes.current = []; onStrokes([]);
    const c = ref.current?.getContext('2d');
    if (c) { c.fillStyle = '#0f172a'; c.fillRect(0, 0, size, size); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ fontSize: 13, fontWeight: 'bold', color: '#93c5fd' }}>{label}</div>
      <canvas ref={ref} width={size} height={size}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        style={{ background: '#0f172a', borderRadius: 6, border: '1px solid #334155', touchAction: 'none', cursor: 'crosshair' }} />
      <button onClick={clear} style={{ fontSize: 10, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>נקה</button>
    </div>
  );
}

export default function HandwritingCalibration({ crewMemberId, onClose }: { crewMemberId?: number | null; onClose?: () => void }) {
  const samples = useRef<Record<string, Stroke[]>>({});
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const saveAll = async () => {
    setSaving(true);
    const entries = Object.entries(samples.current).filter(([, s]) => s.length > 0);
    let ok = 0;
    for (const [label, strokes] of entries) {
      if (await saveStrokeSample(label, strokes, crewMemberId, 'user')) ok++;
    }
    setSavedCount(ok); setSaving(false);
  };

  return (
    <div style={{ background: '#1e293b', border: '2px solid #2563eb', borderRadius: 14, padding: 20, direction: 'rtl', color: '#e2e8f0', maxWidth: 720 }}>
      <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 6 }}>✍️ כיול כתב יד</div>
      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
        כתוב כל תו בתא שלו (פעם אחת מספיקה). המערכת תלמד את כתב היד האישי שלך. אופציונלי — המערכת גם לומדת תוך כדי שימוש.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 10, maxHeight: '55vh', overflowY: 'auto', padding: 4 }}>
        {FULL_CHARSET.map(ch => (
          <Cell key={ch} label={ch} onStrokes={s => { samples.current[ch] = s; }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end', alignItems: 'center' }}>
        {savedCount != null && <span style={{ color: '#34d399', fontSize: 13 }}>נשמרו {savedCount} תווים ✅</span>}
        <button onClick={() => clearStrokeSamples(crewMemberId)} style={btn('#7f1d1d')}>אפס כיול שלי</button>
        {onClose && <button onClick={onClose} style={btn('#475569')}>סגור</button>}
        <button onClick={saveAll} disabled={saving} style={{ ...btn('#2563eb'), opacity: saving ? 0.5 : 1 }}>
          {saving ? 'שומר…' : 'שמור כיול'}
        </button>
      </div>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { background: bg, color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 'bold', fontSize: 13, cursor: 'pointer' };
}
