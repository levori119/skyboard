import React from 'react';
import type { GroundStatusKey, AircraftPos } from '../../types/ground';

export const AIR_DEFENSE_STATUSES: { label: string; color: string }[] = [
  { label: 'ראייה',              color: '#22c55e' },
  { label: 'התראה',              color: '#eab308' },
  { label: 'מכשירים',            color: '#f97316' },
  { label: 'מכשירים להקפה',     color: '#f97316' },
  { label: 'סגור',               color: '#ef4444' },
  { label: 'פתוח להזנקות',      color: '#ef4444' },
];

export const YABA_AIR_DEFENSE_STATUSES: { label: string; color: string }[] = [
  { label: 'מרחב בראייה',       color: '#22c55e' },
  { label: 'מרחב במכשירים',     color: '#f97316' },
  { label: 'מרחב סגור',         color: '#ef4444' },
];

export const ALL_MAZAA_STATUSES = [...AIR_DEFENSE_STATUSES, ...YABA_AIR_DEFENSE_STATUSES];

export const GROUND_STATUSES = [
  { key: 'none',    label: 'Pre-Call — טרם קרא',      color: '#64748b', bg: '#0f172a', dot: '#475569', flash: false },
  { key: 'taxi',    label: 'Taxi — קרא להסעה',        color: '#86efac', bg: '#14532d', dot: '#22c55e', flash: false },
  { key: 'lineup',  label: 'Line-up — להתיישרות',    color: '#60a5fa', bg: '#1e3a5f', dot: '#3b82f6', flash: false },
  { key: 'takeoff', label: 'Take-off — המראה',        color: '#fca5a5', bg: '#450a0a', dot: '#ef4444', flash: true  },
] as const;


export const GROUND_POINT_MARKERS = [
  { key: 'circle',   label: '⬤ עיגול' },
  { key: 'square',   label: '■ ריבוע' },
  { key: 'diamond',  label: '◆ מעוין' },
  { key: 'triangle', label: '▲ משולש' },
  { key: 'cross',    label: '✚ צלב' },
  { key: 'star',     label: '★ כוכב' },
  { key: 'runway',   label: '▬ מסלול' },
  { key: 'parking',  label: 'P חניה' },
  { key: 'hangar',   label: '⌂ אנגר' },
] as const;

export type GroundMarkerKey = typeof GROUND_POINT_MARKERS[number]['key'];

export const GroundMarkerSVG = ({ marker, color, size = 16, opacity = 1 }: { marker: string; color: string; size?: number; opacity?: number }) => {
  const s = size;
  const h = s / 2;
  const style: React.CSSProperties = { display: 'block', opacity };
  switch (marker) {
    case 'square':
      return <svg width={s} height={s} style={style}><rect x={1} y={1} width={s-2} height={s-2} fill={color} rx={2} /></svg>;
    case 'diamond':
      return <svg width={s} height={s} style={style}><polygon points={`${h},1 ${s-1},${h} ${h},${s-1} 1,${h}`} fill={color} /></svg>;
    case 'triangle':
      return <svg width={s} height={s} style={style}><polygon points={`${h},1 ${s-1},${s-1} 1,${s-1}`} fill={color} /></svg>;
    case 'cross':
      return <svg width={s} height={s} style={style}><rect x={h-2} y={1} width={4} height={s-2} fill={color} rx={1} /><rect x={1} y={h-2} width={s-2} height={4} fill={color} rx={1} /></svg>;
    case 'star':
      return <svg width={s} height={s} style={style}><text x={h} y={s-2} textAnchor="middle" fontSize={s-2} fill={color}>★</text></svg>;
    case 'runway':
      return <svg width={s} height={s} style={style}><rect x={1} y={h-2} width={s-2} height={4} fill={color} rx={2} /></svg>;
    case 'parking':
      return <svg width={s} height={s} style={style}><rect x={1} y={1} width={s-2} height={s-2} fill={color} rx={3} /><text x={h} y={s-3} textAnchor="middle" fontSize={s-5} fill="white" fontWeight="bold">P</text></svg>;
    case 'hangar':
      return <svg width={s} height={s} style={style}><text x={h} y={s-2} textAnchor="middle" fontSize={s-2} fill={color}>⌂</text></svg>;
    default: // circle
      return <svg width={s} height={s} style={style}><circle cx={h} cy={h} r={h-1} fill={color} /></svg>;
  }
};

// ---- Ground SVG Icons for element types ----
export const GROUND_SVG_ICON_KEYS: { key: string; label: string }[] = [
  { key: 'MAP:barrier',              label: 'מחסום' },
  { key: 'MAP:barrier-open',         label: 'מחסום פתוח' },
  { key: 'MAP:traffic-red',          label: 'רמזור אדום' },
  { key: 'MAP:traffic-orange',       label: 'רמזור כתום' },
  { key: 'MAP:traffic-green',        label: 'רמזור ירוק' },
  { key: 'MAP:traffic-red-single',   label: 'רמזור אדום נורה אחת' },
  { key: 'MAP:traffic-orange-single',label: 'רמזור כתום נורה אחת' },
  { key: 'MAP:stopbar',              label: 'STOP BAR' },
  { key: 'MAP:sweeper',              label: 'מנקה מסלולים' },
  { key: 'MAP:firetruck',            label: 'כבאית' },
  { key: 'MAP:birdcar',              label: 'רכב ציפורים' },
  { key: 'MAP:opsvehicle',           label: 'רכב מבצעי ירוק' },
];

// Returns type-aware display state options per element icon type
export const getElemDisplayStateOpts = (iconKey: string): { key: string; label: string; color: string }[] => {
  const isSingle = iconKey === 'MAP:traffic-red-single' || iconKey === 'MAP:traffic-orange-single';
  const isMulti = ['MAP:traffic-red', 'MAP:traffic-orange', 'MAP:traffic-green'].includes(iconKey);
  const isStopbar = iconKey === 'MAP:stopbar';
  const isBarrier = iconKey === 'MAP:barrier' || iconKey === 'MAP:barrier-open';
  if (isSingle || isStopbar) return [
    { key: 'off',   label: 'כבוי',   color: '#475569' },
    { key: 'blink', label: 'מהבהב',  color: '#f59e0b' },
    { key: 'fixed', label: 'קבוע',   color: '#22c55e' },
  ];
  if (isMulti) return [
    { key: 'off',   label: 'כבוי',   color: '#475569' },
    { key: 'blink', label: 'מהבהב',  color: '#f59e0b' },
    { key: 'stop',  label: '🔴 עצור', color: '#ef4444' },
    { key: 'go',    label: '🟢 עבור', color: '#22c55e' },
  ];
  if (isBarrier) return [
    { key: 'normal', label: 'רגיל',  color: '#94a3b8' },
    { key: 'open',   label: 'פתוח',  color: '#22c55e' },
    { key: 'blink',  label: 'מהבהב', color: '#f59e0b' },
    { key: 'close',  label: 'תקול',  color: '#ef4444' },
  ];
  return [
    { key: 'normal', label: 'רגיל',  color: '#3b82f6' },
    { key: 'blink',  label: 'מהבהב', color: '#f59e0b' },
    { key: 'off',    label: 'כבוי',  color: '#475569' },
    { key: 'close',  label: 'תקול',  color: '#ef4444' },
  ];
};

export const renderGroundSvgIcon = (iconKey: string, size: number = 22, status?: string, displayState?: string): JSX.Element | null => {
  const s = size;
  const isBlinking = displayState === 'blink' || (!displayState && status === 'מנצנץ');
  const isOpen = displayState === 'open' || (!displayState && status === 'פתוח');
  const isOff = displayState === 'off';
  switch (iconKey) {
    case 'MAP:barrier':
      if (isOpen) {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
            <rect x="1" y="5" width="2.5" height="15" rx="1" fill="#555"/>
            <g transform="rotate(-70, 2.25, 12.5)">
              <rect x="2.25" y="10.5" width="19" height="4" rx="1" fill="white" stroke="#888" strokeWidth="0.4"/>
              <rect x="2.25" y="10.5" width="3.5"  height="4" fill="#22c55e"/>
              <rect x="9"    y="10.5" width="3.5"  height="4" fill="#22c55e"/>
              <rect x="15.7" y="10.5" width="3.5"  height="4" fill="#22c55e"/>
            </g>
            <rect x="20.5" y="17" width="2.5" height="4" rx="1" fill="#444"/>
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <rect x="2" y="10.5" width="20" height="4" rx="1" fill="white" stroke="#888" strokeWidth="0.4"/>
          <rect x="2"  y="10.5" width="3.5" height="4" fill="#ef4444"/>
          <rect x="9"  y="10.5" width="3.5" height="4" fill="#ef4444"/>
          <rect x="16" y="10.5" width="3.5" height="4" fill="#ef4444"/>
          <rect x="1"  y="7" width="2.5" height="10" rx="1" fill="#555"/>
          <rect x="20.5" y="7" width="2.5" height="10" rx="1" fill="#555"/>
        </svg>
      );
    case 'MAP:barrier-open':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <rect x="1" y="5" width="2.5" height="15" rx="1" fill="#555"/>
          <g transform="rotate(-70, 2.25, 12.5)">
            <rect x="2.25" y="10.5" width="19" height="4" rx="1" fill="white" stroke="#888" strokeWidth="0.4"/>
            <rect x="2.25" y="10.5" width="3.5"  height="4" fill="#22c55e"/>
            <rect x="9"    y="10.5" width="3.5"  height="4" fill="#22c55e"/>
            <rect x="15.7" y="10.5" width="3.5"  height="4" fill="#22c55e"/>
          </g>
          <rect x="20.5" y="17" width="2.5" height="4" rx="1" fill="#444"/>
        </svg>
      );
    case 'MAP:traffic-red-single':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <rect x="7" y="5" width="10" height="13" rx="3" fill="#1e293b" stroke="#555" strokeWidth="0.5"/>
          <circle cx="12" cy="11.5" r="4" fill={isOff ? '#1e293b' : '#ef4444'} stroke={isOff ? '#555' : 'none'} strokeWidth={isOff ? '0.8' : '0'} className={isBlinking && !isOff ? 'elem-blink' : undefined}/>
          <rect x="11" y="18" width="2" height="4" fill="#555"/>
        </svg>
      );
    case 'MAP:traffic-orange-single':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <rect x="7" y="5" width="10" height="13" rx="3" fill="#1e293b" stroke="#555" strokeWidth="0.5"/>
          <circle cx="12" cy="11.5" r="4" fill={isOff ? '#1e293b' : '#f97316'} stroke={isOff ? '#555' : 'none'} strokeWidth={isOff ? '0.8' : '0'} className={isBlinking && !isOff ? 'elem-blink' : undefined}/>
          <rect x="11" y="18" width="2" height="4" fill="#555"/>
        </svg>
      );
    case 'MAP:stopbar':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <text x="12" y="8" textAnchor="middle" fontSize="4.5" fill={isOff ? '#475569' : '#ef4444'} fontFamily="monospace" fontWeight="bold">STOP BAR</text>
          <rect x="1" y="11" width="22" height="5" rx="1" fill="#1e293b" stroke="#555" strokeWidth="0.4"/>
          <circle cx="3.2"  cy="13.5" r="1.6" fill={isOff ? '#334155' : '#ef4444'} className={isBlinking && !isOff ? 'elem-blink' : undefined}/>
          <circle cx="7.4"  cy="13.5" r="1.6" fill={isOff ? '#334155' : '#ef4444'} className={isBlinking && !isOff ? 'elem-blink' : undefined}/>
          <circle cx="11.6" cy="13.5" r="1.6" fill={isOff ? '#334155' : '#ef4444'} className={isBlinking && !isOff ? 'elem-blink' : undefined}/>
          <circle cx="15.8" cy="13.5" r="1.6" fill={isOff ? '#334155' : '#ef4444'} className={isBlinking && !isOff ? 'elem-blink' : undefined}/>
          <circle cx="20.0" cy="13.5" r="1.6" fill={isOff ? '#334155' : '#ef4444'} className={isBlinking && !isOff ? 'elem-blink' : undefined}/>
        </svg>
      );
    case 'MAP:traffic-red':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <rect x="8" y="2" width="8" height="20" rx="3" fill="#1e293b" stroke="#555" strokeWidth="0.5"/>
          <circle cx="12" cy="7"  r="2.5" fill={isOff ? '#1a1212' : '#ef4444'} className={isBlinking && !isOff ? 'elem-blink' : undefined}/>
          <circle cx="12" cy="12" r="2.5" fill="#2d1515"/>
          <circle cx="12" cy="17" r="2.5" fill="#14260e"/>
          <rect x="11" y="22" width="2" height="2" fill="#555"/>
        </svg>
      );
    case 'MAP:traffic-orange':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <rect x="8" y="2" width="8" height="20" rx="3" fill="#1e293b" stroke="#555" strokeWidth="0.5"/>
          <circle cx="12" cy="7"  r="2.5" fill="#2d1515"/>
          <circle cx="12" cy="12" r="2.5" fill={isOff ? '#1a1000' : '#f97316'} className={isBlinking && !isOff ? 'elem-blink' : undefined}/>
          <circle cx="12" cy="17" r="2.5" fill="#14260e"/>
          <rect x="11" y="22" width="2" height="2" fill="#555"/>
        </svg>
      );
    case 'MAP:traffic-green':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <rect x="8" y="2" width="8" height="20" rx="3" fill="#1e293b" stroke="#555" strokeWidth="0.5"/>
          <circle cx="12" cy="7"  r="2.5" fill="#2d1515"/>
          <circle cx="12" cy="12" r="2.5" fill="#2d1c09"/>
          <circle cx="12" cy="17" r="2.5" fill={isOff ? '#0a160a' : '#22c55e'} className={isBlinking && !isOff ? 'elem-blink' : undefined}/>
          <rect x="11" y="22" width="2" height="2" fill="#555"/>
        </svg>
      );
    case 'MAP:sweeper':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <rect x="2" y="9" width="14" height="8" rx="2" fill="#f59e0b"/>
          <rect x="14" y="11" width="6" height="4" rx="1" fill="#f59e0b"/>
          <rect x="14" y="9" width="5" height="3" rx="1" fill="#fcd34d"/>
          <circle cx="5"  cy="19" r="2.5" fill="#333"/>
          <circle cx="5"  cy="19" r="1"   fill="#888"/>
          <circle cx="14" cy="19" r="2.5" fill="#333"/>
          <circle cx="14" cy="19" r="1"   fill="#888"/>
          <circle cx="4"  cy="14" r="3"   fill="none" stroke="#f97316" strokeWidth="1.5"/>
          <line x1="4" y1="11" x2="4" y2="17" stroke="#f97316" strokeWidth="1"/>
          <line x1="1" y1="14" x2="7" y2="14" stroke="#f97316" strokeWidth="1"/>
        </svg>
      );
    case 'MAP:firetruck':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <rect x="1"  y="10" width="18" height="8" rx="2" fill="#ef4444"/>
          <rect x="16" y="7"  width="6"  height="5" rx="1" fill="#ef4444"/>
          <rect x="16.5" y="7.5" width="4.5" height="2.5" rx="0.5" fill="#93c5fd"/>
          <line x1="3" y1="10" x2="15" y2="10" stroke="#fca5a5" strokeWidth="1"/>
          <line x1="3" y1="8"  x2="15" y2="8"  stroke="#fca5a5" strokeWidth="1"/>
          <line x1="3" y1="6"  x2="15" y2="6"  stroke="#fca5a5" strokeWidth="1"/>
          <circle cx="5"  cy="20" r="2.5" fill="#333"/>
          <circle cx="5"  cy="20" r="1"   fill="#888"/>
          <circle cx="16" cy="20" r="2.5" fill="#333"/>
          <circle cx="16" cy="20" r="1"   fill="#888"/>
        </svg>
      );
    case 'MAP:birdcar':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <rect x="1"  y="12" width="18" height="7" rx="2" fill="#64748b"/>
          <rect x="13" y="8"  width="6"  height="5" rx="1" fill="#64748b"/>
          <rect x="13.5" y="8.5" width="5" height="3" rx="0.5" fill="#93c5fd"/>
          <circle cx="5"  cy="21" r="2.5" fill="#333"/>
          <circle cx="5"  cy="21" r="1"   fill="#888"/>
          <circle cx="15" cy="21" r="2.5" fill="#333"/>
          <circle cx="15" cy="21" r="1"   fill="#888"/>
          <path d="M5,9 C5,7 7,6 9,7 C8,5 10,4 12,5 C11,3 14,3 14,5 L12,8 L9,9 Z" fill="#cbd5e1"/>
          <circle cx="13" cy="5" r="1" fill="#1e293b"/>
        </svg>
      );
    case 'MAP:opsvehicle':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <rect x="1"  y="11" width="18" height="8" rx="2" fill="#16a34a"/>
          <rect x="13" y="7"  width="6"  height="5" rx="1" fill="#16a34a"/>
          <rect x="13.5" y="7.5" width="5" height="3" rx="0.5" fill="#86efac"/>
          <rect x="2"  y="12" width="5"  height="5" fill="#15803d"/>
          <circle cx="5"  cy="21" r="2.5" fill="#333"/>
          <circle cx="5"  cy="21" r="1"   fill="#888"/>
          <circle cx="16" cy="21" r="2.5" fill="#333"/>
          <circle cx="16" cy="21" r="1"   fill="#888"/>
          <rect x="3" y="8" width="8" height="3" rx="1" fill="#4ade80" opacity="0.7"/>
        </svg>
      );
    default:
      return null;
  }
};

export const normalizeAircraftPositions = (strip: any): AircraftPos[] => {
  const count = Math.max(1, parseInt(strip.numberOfFormation ?? strip.number_of_formation) || 1);
  const existing: AircraftPos[] = Array.isArray(strip.aircraft_positions) ? strip.aircraft_positions : [];
  // Use aircraft_indices when present (split formations) so idx values match the original numbering
  let rawIdx = strip.aircraft_indices;
  if (typeof rawIdx === 'string') { try { rawIdx = JSON.parse(rawIdx); } catch { rawIdx = null; } }
  const indices: number[] | null = Array.isArray(rawIdx) && rawIdx.length > 0
    ? [...rawIdx].sort((a, b) => a - b)
    : null;
  const indexList = indices ?? Array.from({ length: count }, (_, i) => i + 1);
  return indexList.map(idx => {
    const ex = existing.find(a => a.idx === idx);
    return ex || { idx, point_id: null, status: 'none' };
  });
};

export function ptLineDist(p:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number}):number {
  const dx=b.x-a.x,dy=b.y-a.y;
  if(!dx&&!dy) return Math.hypot(p.x-a.x,p.y-a.y);
  const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy);
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function dpSimplify(pts:{x:number;y:number}[],eps:number):{x:number;y:number}[] {
  if(pts.length<=2) return pts;
  let maxD=0,maxI=0;
  for(let i=1;i<pts.length-1;i++){const d=ptLineDist(pts[i],pts[0],pts[pts.length-1]);if(d>maxD){maxD=d;maxI=i;}}
  if(maxD>eps) return [...dpSimplify(pts.slice(0,maxI+1),eps).slice(0,-1),...dpSimplify(pts.slice(maxI),eps)];
  return [pts[0],pts[pts.length-1]];
}

export function toEmbedUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    // youtube.com/watch?v=ID → youtube.com/embed/ID
    if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') && u.pathname === '/watch') {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    // youtu.be/ID → youtube.com/embed/ID
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch { /* not a valid URL, return as-is */ }
  return url;
}
