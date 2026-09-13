import React from 'react';
import type { GroundStatusKey, AircraftPos } from '../../types/ground';
import { groundSvgIconBody } from '../../../shared/elementSymbols';

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

/**
 * סמל SVG של סוג אלמנט. **הגוף מגיע מ-shared/elementSymbols.js** - אותו מקור שממנו
 * אפליקציית הנהג מציירת את הסמלים, כך שמפת המגדל ומפת הנהג לא יכולות להיפרד.
 * התוכן סטטי (מפתח סמל מרשימה סגורה), ולכן dangerouslySetInnerHTML בטוח כאן.
 * זהות מלאה לרינדור הקודם - elementSymbols.test.tsx.
 */
export const renderGroundSvgIcon = (iconKey: string, size: number = 22, status?: string, displayState?: string): JSX.Element | null => {
  const body = groundSvgIconBody(iconKey, status, displayState);
  if (!body) return null;
  return <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }} dangerouslySetInnerHTML={{ __html: body }} />;
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
