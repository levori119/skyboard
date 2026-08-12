import React from 'react';
import { tr } from '../../i18n/tr';
import { useDragPosition } from '../../hooks/useDragPosition';
import { useToolbarScale } from '../../hooks/useToolbarScale';
import { tbPx } from '../../utils/scale';
import { windowFrame } from '../../utils/windowFrame';
import {
  DEFAULT_CAMERA, ROT_STEP, TILT_STEP, ZOOM_FACTOR,
  clampTilt, clampZoom, normYaw, northArrow, type Camera3D,
} from '../../utils/pattern3d';
import type { ThemeMode } from './Pattern3DScene';

// ─── פקדי ההקפה התלת מימדית ───────────────────────────────────────────────────
//
// חלון צף נגרר, **צפייה ותפעול** ולכן מסגרת תורכיז לפי קוד הצבע (CLAUDE.md
// §מסגרת חלון). הגרירה דרך `useDragPosition` - הוא כבר פותר את חלוקת ה---s,
// את `setPointerCapture` ואת `touchAction`, ומימוש ידני היה חוזר על המלכודות.
//
// **המספרים מוצגים כטקסט** (TILT 55° / HDG 015°) ולא רק כמצב של סליידר: פקח
// אינו אומד זווית בעין, ובלי המספר אין לו דרך לתאר לעמית מה הוא רואה.

interface Props {
  camera: Camera3D;
  onChange: (c: Camera3D) => void;
  /** מרכוז - מחזיר גם את ההזזה לאפס, ולכן הוא של ההורה ולא של החלון. */
  onRecenter: () => void;
  onClose: () => void;
  themeMode?: ThemeMode;
}

const pad3 = (n: number) => String(Math.round(n)).padStart(3, '0');

export default function Pattern3DControls({ camera, onChange, onRecenter, onClose, themeMode = 'dark' }: Props) {
  const winRef = React.useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);
  const tb = useToolbarScale();

  // ocean היא תמה **כהה** - לא לגזור "כל מה שאינו light הוא dark" ולהפך.
  const light = themeMode === 'light';
  const C = light
    ? { panel: 'rgba(255,255,255,0.97)', border: '#cbd5e1', text: '#0f172a', dim: '#475569', btn: '#f1f5f9', btnText: '#1e293b' }
    : themeMode === 'ocean'
      ? { panel: 'rgba(5,64,78,0.97)', border: '#0e7490', text: '#cffafe', dim: '#7dd3fc', btn: '#083d4d', btnText: '#a5f3fc' }
      : { panel: 'rgba(15,23,42,0.97)', border: '#334155', text: '#e2e8f0', dim: '#94a3b8', btn: '#1e293b', btnText: '#e2e8f0' };

  const btn: React.CSSProperties = {
    width: tbPx(24, tb), height: tbPx(22, tb), padding: 0, lineHeight: 1,
    borderRadius: '4px', border: `1px solid ${C.border}`, background: C.btn, color: C.btnText,
    cursor: 'pointer', fontSize: tbPx(12, tb), display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'manipulation',
  };
  const wide: React.CSSProperties = { ...btn, width: 'auto', flex: 1, padding: `0 ${tbPx(6, tb)}`, fontSize: tbPx(10, tb) };
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '4px' };
  const readout: React.CSSProperties = { fontFamily: 'monospace', fontSize: tbPx(11, tb), color: C.text, minWidth: tbPx(52, tb), textAlign: 'center' };

  const setTilt = (d: number) => onChange({ ...camera, tilt: clampTilt(camera.tilt + d) });
  const setYaw = (d: number) => onChange({ ...camera, yaw: normYaw(camera.yaw + d) });
  const setZoom = (m: number) => onChange({ ...camera, zoom: clampZoom(camera.zoom * m) });

  // חץ הצפון מצויר מהיטל הווקטור (0,-1,0): הוא מסתובב עם ה-yaw **וגם** מתקצר
  // עם ההטיה - ולכן הוא אומר בו-זמנית "לאן צפון" ו"כמה שטוח אני מסתכל".
  // קו ונקודה לא נקראו כחץ; ראש חץ ואות בקצה הופכים אותו לזיהוי במבט אחד.
  // במבט-על עם yaw=0 ההיטל מתנוון לאורך אפס - אז אין כיוון, ומוצגת האות בלבד.
  const n = northArrow(camera);
  const R = 14;
  const mag = Math.hypot(n.x, n.y);
  const nd = mag > 1e-3 ? { x: n.x / mag, y: n.y / mag } : null;
  const tip = { x: n.x * R, y: n.y * R };
  const HL = 5, HW = 3.2;
  const head = nd
    ? [
      `${tip.x},${tip.y}`,
      `${tip.x - nd.x * HL - nd.y * HW},${tip.y - nd.y * HL + nd.x * HW}`,
      `${tip.x - nd.x * HL + nd.y * HW},${tip.y - nd.y * HL - nd.x * HW}`,
    ].join(' ')
    : null;
  const letterAt = nd ? { x: nd.x * (R + 7), y: nd.y * (R + 7) } : { x: 0, y: -(R + 7) };

  return (
    <div
      ref={winRef}
      data-testid="pattern-3d-controls"
      data-nopan
      onPointerDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      style={{
        position: 'fixed', zIndex: 420,
        ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { insetInlineEnd: 14, bottom: 96 }),
        background: C.panel, color: C.text,
        // חלון **צפייה ותפעול** - מסגרת תורכיז, מקור אמת יחיד
        ...windowFrame('view', themeMode, 10),
        padding: '7px 9px 8px', display: 'flex', flexDirection: 'column', gap: '5px',
        minWidth: 168, boxShadow: '0 6px 20px rgba(0,0,0,0.45)', userSelect: 'none',
      }}
    >
      <div style={{ ...row, marginBottom: '1px' }}>
        <span {...drag.handleProps} data-drag-handle=""
          title={tr('ctrl.dragToolbar')}
          style={{ ...drag.handleProps.style, color: C.dim, cursor: 'grab', fontSize: '12px', lineHeight: 1 }}>⠿</span>
        <b style={{ flex: 1, fontSize: '11px' }}>{tr('pattern3d.title')}</b>
        <button data-testid="close" onClick={onClose} title={tr('pattern3d.close')}
          style={{ ...btn, width: tbPx(20, tb), height: tbPx(18, tb), background: 'none', border: 'none', color: C.dim }}>✕</button>
      </div>

      <div style={row}>
        <span style={{ fontSize: '10px', color: C.dim, minWidth: tbPx(30, tb) }}>{tr('pattern3d.tilt')}</span>
        <button data-testid="tilt-down" onClick={() => setTilt(-TILT_STEP)} title={tr('pattern3d.tiltDown')} style={btn}>▼</button>
        <span data-testid="tilt-value" style={readout}>{pad3(camera.tilt)}°</span>
        <button data-testid="tilt-up" onClick={() => setTilt(TILT_STEP)} title={tr('pattern3d.tiltUp')} style={btn}>▲</button>
      </div>

      <div style={row}>
        <span style={{ fontSize: '10px', color: C.dim, minWidth: tbPx(30, tb) }}>{tr('pattern3d.heading')}</span>
        <button data-testid="rot-left" onClick={() => setYaw(-ROT_STEP)} title={tr('pattern3d.rotLeft')} style={btn}>◀</button>
        <span data-testid="yaw-value" style={readout}>{pad3(camera.yaw)}°</span>
        <button data-testid="rot-right" onClick={() => setYaw(ROT_STEP)} title={tr('pattern3d.rotRight')} style={btn}>▶</button>
      </div>

      <div style={row}>
        <button data-testid="zoom-out" onClick={() => setZoom(1 / ZOOM_FACTOR)} title={tr('pattern3d.zoomOut')} style={btn}>−</button>
        <button data-testid="recenter" onClick={onRecenter} title={tr('pattern3d.recenterHint')} style={wide}>
          {tr('pattern3d.recenter')}
        </button>
        <button data-testid="zoom-in" onClick={() => setZoom(ZOOM_FACTOR)} title={tr('pattern3d.zoomIn')} style={btn}>+</button>
      </div>

      <div style={{ ...row, justifyContent: 'space-between', gap: '6px' }}>
        <svg data-testid="north-arrow" width={2 * R + 22} height={2 * R + 22}
          viewBox={`${-R - 11} ${-R - 11} ${2 * R + 22} ${2 * R + 22}`} aria-label={tr('pattern3d.north')}>
          <title>{tr('pattern3d.north')}</title>
          <circle cx={0} cy={0} r={R} fill="none" stroke={C.border} strokeWidth={1} />
          {nd && (
            <>
              <line x1={0} y1={0} x2={tip.x} y2={tip.y} stroke={C.text} strokeWidth={2} strokeLinecap="round" />
              <polygon data-testid="north-arrow-head" points={head!} fill={C.text} />
            </>
          )}
          <circle cx={0} cy={0} r={1.8} fill="none" stroke={C.text} strokeWidth={1.2} />
          <text x={letterAt.x} y={letterAt.y} textAnchor="middle" dominantBaseline="central"
            fill={C.text} fontSize={10} fontWeight="bold">{tr('pattern3d.northLetter')}</text>
        </svg>
        <span style={{ flex: 1, fontSize: '9px', color: C.dim, lineHeight: 1.35, textAlign: 'start' }}>
          {tr('pattern3d.dragHint')}
        </span>
      </div>
    </div>
  );
}

/** מצלמת ההתחלה + הזזה מאופסת - "מרכוז" חוזר בדיוק לכאן. */
export const RECENTER: { camera: Camera3D; pan: { x: number; y: number } } = {
  camera: DEFAULT_CAMERA, pan: { x: 0, y: 0 },
};
