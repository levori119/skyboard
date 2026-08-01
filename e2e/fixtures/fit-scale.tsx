import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import FitScaleBox from '../../src/components/shared/FitScaleBox';
import { useDragPosition } from '../../src/hooks/useDragPosition';

/**
 * מתקן בדיקה ל-FitScaleBox: משחזר את רצועת המסלולים בחלון העזרים
 * (4 מסלולים ברוחב 56px + מרווחים = ~248px) בתוך חלון ברוחב 220px,
 * ואת אותה רצועה בחלון מוגדל (שישית מסך).
 *
 * ‎?s=1.65‎ מדמה את הזום הגלובלי של מסך 24" (`#root { zoom: var(--s) }`).
 */

const PANEL_W = 220;   // רוחב ברירת המחדל של חלון העזרים
const ZOOM_W = 460;    // ~שישית מסך על 1920x1080 (34vw x 50vh)
const ZOOM_H = 380;

const Runway = ({ name }: { name: string }) => (
  <div data-testid="rw" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
    <svg viewBox="0 0 56 144" width={56} height={144} style={{ display: 'block' }}>
      <rect x={4} y={18} width={48} height={108} fill="#052e16" stroke="#22c55e" strokeWidth={2} rx={2} />
      <text x={28} y={14} textAnchor="middle" fontSize="11" fill="#818cf8">{name}</text>
    </svg>
    <div style={{ fontSize: 10, color: '#86efac', whiteSpace: 'nowrap' }}>{name}</div>
    <div style={{ fontSize: 8, color: '#64748b', whiteSpace: 'nowrap' }}>3,609ft/1,100m</div>
  </div>
);

const stripBody = (
  <div data-testid="strip" style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'nowrap' }}>
    {['33L/15R', '09/27', '33R/15L', '18/36'].map(n => <Runway key={n} name={n} />)}
  </div>
);

/** חלון צף נגרר - כמו התצוגה המוגדלת של המסלולים (portal ל-body + zoom:var(--s)) */
function DraggableWindow() {
  const winRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);
  return (
    <div
      id="dragwin"
      ref={winRef}
      style={{
        position: 'fixed',
        zIndex: 100,
        ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { left: 300, top: 240 }),
        width: 240,
        background: '#0a2a16',
        border: '2px solid #334155',
        borderRadius: 10,
      }}
    >
      <div id="draghandle" {...drag.handleProps} style={{ ...drag.handleProps.style, minWidth: 34, minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#86efac', fontSize: 18 }}>⠿</div>
    </div>
  );
}

function Fixture() {
  return (
    <div style={{ zoom: 'var(--s)' as unknown as number, padding: 10, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div id="panel" style={{ width: PANEL_W, border: '1px solid #334155', background: '#061a0e' }}>
        <FitScaleBox>{stripBody}</FitScaleBox>
      </div>
      <div id="zoomwin" style={{ width: ZOOM_W, height: ZOOM_H, border: '1px solid #334155', background: '#061a0e', padding: 10, boxSizing: 'border-box' }}>
        <FitScaleBox mode="fill" maxScale={6}>{stripBody}</FitScaleBox>
      </div>
      <DraggableWindow />
    </div>
  );
}

// כמו באפליקציה: `--s` יושב על <html> ו-`zoom: var(--s)` על השורש
const s = Number(new URLSearchParams(location.search).get('s') || 1);
document.documentElement.style.setProperty('--s', String(s));
createRoot(document.getElementById('root')!).render(<Fixture />);
