import { tr } from '../../i18n/tr';
import React, { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import { API_URL } from '../../config';
import { sc } from '../../utils/scale';
import { imagePctToGeo, fmtDms, buildGeoAnchor as getAnchorFromMapData } from '../../utils/geo';
import { customConfirm } from '../shared/ConfirmModal';
import type { ZoneAltRange } from '../../types';

// MapZone shape as used in the editor (polygon parsed to point array)
interface MapZone { id: number; map_id: number; name: string; color: string; polygon: {x: number; y: number}[]; polygon_geo?: {lat: number; lon: number}[]; parent_zone_id?: number | null; enabled?: boolean; }

const ZONE_COLORS = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7','#06b6d4','#f97316','#ec4899'];

export const MapZoneEditor = ({ mapId, mapSrc, onClose, mapData: initialMapData }: { mapId: number; mapSrc: string; onClose: () => void; mapData?: any }) => {
  const [zones, setZones] = useState<MapZone[]>([]);
  const [draftPoints, setDraftPoints] = useState<{x: number; y: number}[]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(ZONE_COLORS[0]);
  const [editingZone, setEditingZone] = useState<MapZone | null>(null);
  const [saving, setSaving] = useState(false);
  const [altRanges, setAltRanges] = useState<ZoneAltRange[]>([]);
  const [altRangesLoading, setAltRangesLoading] = useState(false);
  const [newAltRange, setNewAltRange] = useState({ name: '', alt_min: '', alt_max: '' });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgEditorRef = useRef<HTMLImageElement>(null);
  const [imgEditorBounds, setImgEditorBounds] = useState<{left:number;top:number;width:number;height:number}|null>(null);
  const [localMapData, setLocalMapData] = useState<any>(initialMapData ?? null);
  const [editorHoverCoord, setEditorHoverCoord] = useState<{lat:number;lon:number}|null>(null);
  const [anchorMode, setAnchorMode] = useState(false);
  const [anchorStep, setAnchorStep] = useState<1|2>(1);
  const [pendingAnchor1, setPendingAnchor1] = useState<{x:number;y:number}|null>(null);
  const [pendingDmsLat1, setPendingDmsLat1] = useState({ deg: '', min: '', sec: '', dir: 'N' });
  const [pendingDmsLon1, setPendingDmsLon1] = useState({ deg: '', min: '', sec: '', dir: 'E' });
  const [pendingAnchor2, setPendingAnchor2] = useState<{x:number;y:number}|null>(null);
  const [pendingDmsLat2, setPendingDmsLat2] = useState({ deg: '', min: '', sec: '', dir: 'N' });
  const [pendingDmsLon2, setPendingDmsLon2] = useState({ deg: '', min: '', sec: '', dir: 'E' });
  const [savingAnchors, setSavingAnchors] = useState(false);
  const currentAnchor = getAnchorFromMapData(localMapData);
  const isCalibrated = currentAnchor !== null;

  const [dragOffset, setDragOffset] = useState<{zoneId: number; dx: number; dy: number} | null>(null);
  const dragRef = useRef<{zoneId: number; startX: number; startY: number; origPoly: {x:number;y:number}[]; moved: boolean} | null>(null);

  const [autoMode, setAutoMode] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoTolerance, setAutoTolerance] = useState(30);
  const [autoTargetColor, setAutoTargetColor] = useState('#3b82f6');
  const [autoResults, setAutoResults] = useState<{
    id: string; polygon: {x:number;y:number}[]; name: string;
    color: string; altRanges: {name:string;alt_min:string;alt_max:string}[];
    saving: boolean; saved: boolean;
  }[]>([]);
  const [autoSelectedId, setAutoSelectedId] = useState<string|null>(null);

  const [editorZoom, setEditorZoom] = useState(1);
  const [editorPan, setEditorPan] = useState({ x: 0, y: 0 });
  const editorPanDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [panMode, setPanMode] = useState(false);

  const [sectorMode, setSectorMode] = useState(false);
  const [sectorRect, setSectorRect] = useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [sectorDraft, setSectorDraft] = useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const sectorDragRef = useRef<{startX:number;startY:number}|null>(null);
  const [sectorName, setSectorName] = useState('');
  const [sectorCreating, setSectorCreating] = useState(false);
  const [sectorCreated, setSectorCreated] = useState<string|null>(null);

  const computeEditorImgBounds = () => {
    const img = imgEditorRef.current;
    if (!img || !img.naturalWidth) { setImgEditorBounds(null); return; }
    const c = img.parentElement; if (!c) return;
    const cw = c.clientWidth, ch = c.clientHeight;
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const scale = Math.min(cw / nw, ch / nh);
    const w = nw * scale, h = nh * scale;
    setImgEditorBounds({ left: (cw - w) / 2, top: (ch - h) / 2, width: w, height: h });
  };

  const getImageRelativePoint = (e: React.MouseEvent): {x:number;y:number}|null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const img = imgEditorRef.current;
    if (!img || !img.naturalWidth) return null;
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const cw = rect.width, ch = rect.height;
    const scale = Math.min(cw / nw, ch / nh);
    const dispW = nw * scale, dispH = nh * scale;
    const ox = (cw - dispW) / 2, oy = (ch - dispH) / 2;
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    if (cx < ox || cx > ox + dispW || cy < oy || cy > oy + dispH) return null;
    return { x: ((cx - ox) / dispW) * 100, y: ((cy - oy) / dispH) * 100 };
  };

  const dmsToDecimal = (deg: string, min: string, sec: string, dir: string): number => {
    const d = Math.abs(parseFloat(deg) || 0);
    const m = parseFloat(min) || 0;
    const s = parseFloat(sec) || 0;
    const decimal = d + m / 60 + s / 3600;
    return (dir === 'S' || dir === 'W') ? -decimal : decimal;
  };

  const decimalToDms = (decimal: number, isLat: boolean) => {
    const abs = Math.abs(decimal);
    const deg = Math.floor(abs);
    const minFull = (abs - deg) * 60;
    const min = Math.floor(minFull);
    const sec = (minFull - min) * 60;
    const dir = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
    return { deg: String(deg), min: String(min), sec: sec.toFixed(1), dir };
  };

  const saveAnchors = async () => {
    if (!pendingAnchor1 || !pendingAnchor2) return;
    const lat1 = dmsToDecimal(pendingDmsLat1.deg, pendingDmsLat1.min, pendingDmsLat1.sec, pendingDmsLat1.dir);
    const lon1 = dmsToDecimal(pendingDmsLon1.deg, pendingDmsLon1.min, pendingDmsLon1.sec, pendingDmsLon1.dir);
    const lat2 = dmsToDecimal(pendingDmsLat2.deg, pendingDmsLat2.min, pendingDmsLat2.sec, pendingDmsLat2.dir);
    const lon2 = dmsToDecimal(pendingDmsLon2.deg, pendingDmsLon2.min, pendingDmsLon2.sec, pendingDmsLon2.dir);
    if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) { alert('יש להזין נ"צ תקינים'); return; }
    setSavingAnchors(true);
    try {
      const res = await fetch(`${API_URL}/maps/${mapId}/anchors`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchor1_x_img: pendingAnchor1.x, anchor1_y_img: pendingAnchor1.y, anchor1_lat: lat1, anchor1_lon: lon1, anchor2_x_img: pendingAnchor2.x, anchor2_y_img: pendingAnchor2.y, anchor2_lat: lat2, anchor2_lon: lon2 })
      });
      if (res.ok) {
        const updated = await res.json();
        setLocalMapData((prev: any) => ({ ...prev, ...updated }));
        setAnchorMode(false);
        setPendingAnchor1(null); setPendingAnchor2(null);
        setPendingDmsLat1({ deg: '', min: '', sec: '', dir: 'N' }); setPendingDmsLon1({ deg: '', min: '', sec: '', dir: 'E' });
        setPendingDmsLat2({ deg: '', min: '', sec: '', dir: 'N' }); setPendingDmsLon2({ deg: '', min: '', sec: '', dir: 'E' });
      }
    } catch {}
    setSavingAnchors(false);
  };

  const loadAltRanges = async (zoneId: number) => {
    setAltRangesLoading(true);
    try {
      const res = await fetch(`${API_URL}/zone-altitude-ranges?zone_id=${zoneId}`);
      if (res.ok) setAltRanges(await res.json());
    } catch {} finally { setAltRangesLoading(false); }
  };

  const loadZones = async () => {
    try {
      const res = await fetch(`${API_URL}/map-zones?map_id=${mapId}`);
      if (res.ok) {
        const data = await res.json();
        setZones(data.map((z: any) => ({ ...z, polygon: typeof z.polygon === 'string' ? JSON.parse(z.polygon) : z.polygon, polygon_geo: typeof z.polygon_geo === 'string' ? JSON.parse(z.polygon_geo) : (z.polygon_geo ?? []) })));
      }
    } catch {}
  };

  useEffect(() => { loadZones(); }, [mapId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => computeEditorImgBounds());
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (anchorMode) {
        setAnchorMode(false);
        setPendingAnchor1(null);
        setPendingAnchor2(null);
        setAnchorStep(1);
      }
      if (dragRef.current) {
        dragRef.current = null;
        setDragOffset(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anchorMode]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setEditorZoom(z => Math.max(0.25, Math.min(8, +(z * factor).toFixed(3))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const getRelativePoint = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (anchorMode) {
      const pt = getSvgRelativePoint(e);
      if (!pt) return;
      if (anchorStep === 1) { setPendingAnchor1(pt); setAnchorStep(2); }
      else { setPendingAnchor2(pt); }
      return;
    }
    if (editingZone) return;
    const pt = getSvgRelativePoint(e);
    if (!pt) return;
    if (draftPoints.length >= 2) {
      const first = draftPoints[0];
      const dist = Math.hypot(pt.x - first.x, pt.y - first.y);
      if (dist < 3) { return; }
    }
    setDraftPoints(prev => [...prev, pt]);
  };

  const handleSvgDblClick = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (draftPoints.length >= 3) closeDraft();
  };

  const closeDraft = () => {
    if (draftPoints.length < 3) { alert('יש לסמן לפחות 3 נקודות'); return; }
    if (!draftName.trim()) { alert('יש להזין שם לאזור'); return; }
  };

  const computePolygonGeo = (pts: {x:number;y:number}[]): {lat:number;lon:number}[] => {
    if (!currentAnchor || pts.length === 0) return [];
    return pts.map(p => imagePctToGeo(p.x, p.y, currentAnchor));
  };

  const saveDraft = async (pts: {x:number;y:number}[]) => {
    if (pts.length < 3 || !draftName.trim()) return;
    setSaving(true);
    try {
      const polygon_geo = computePolygonGeo(pts);
      const res = await fetch(`${API_URL}/map-zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_id: mapId, name: draftName.trim(), color: draftColor, polygon: pts, polygon_geo })
      });
      if (res.ok) { await loadZones(); setDraftPoints([]); setDraftName(''); }
    } catch {}
    setSaving(false);
  };

  const saveEdit = async () => {
    if (!editingZone) return;
    setSaving(true);
    try {
      const polygon_geo = computePolygonGeo(editingZone.polygon);
      const res = await fetch(`${API_URL}/map-zones/${editingZone.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingZone.name, color: editingZone.color, polygon: editingZone.polygon, polygon_geo })
      });
      if (res.ok) { await loadZones(); setEditingZone(null); }
    } catch {}
    setSaving(false);
  };

  const deleteZone = async (id: number) => {
    if (!await customConfirm('למחוק אזור זה?')) return;
    try {
      await fetch(`${API_URL}/map-zones/${id}`, { method: 'DELETE' });
      await loadZones();
    } catch {}
  };

  // --- זיהוי אזורים אוטומטי ---
  const dpDist = (p:{x:number;y:number}, a:{x:number;y:number}, b:{x:number;y:number}) => {
    const dx = b.x-a.x, dy = b.y-a.y;
    if (!dx && !dy) return Math.hypot(p.x-a.x, p.y-a.y);
    const t = ((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy);
    return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy));
  };
  const douglasPeucker = (pts:{x:number;y:number}[], eps:number):{x:number;y:number}[] => {
    if (pts.length < 3) return pts;
    let maxD = 0, maxI = 0;
    for (let i = 1; i < pts.length-1; i++) { const d = dpDist(pts[i],pts[0],pts[pts.length-1]); if (d>maxD){maxD=d;maxI=i;} }
    if (maxD > eps) { const l=douglasPeucker(pts.slice(0,maxI+1),eps); const r=douglasPeucker(pts.slice(maxI),eps); return [...l.slice(0,-1),...r]; }
    return [pts[0],pts[pts.length-1]];
  };

  const detectAllZones = async () => {
    const img = imgEditorRef.current;
    if (!img || !img.naturalWidth) return;
    setAutoRunning(true);
    setAutoResults([]);
    setAutoSelectedId(null);
    try {
      const MAX_DIM = 600;
      const nw = img.naturalWidth, nh = img.naturalHeight;
      const sc = Math.min(1, MAX_DIM / Math.max(nw, nh));
      const cw = Math.round(nw * sc), ch = Math.round(nh * sc);
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, cw, ch);
      const { data: pixels } = ctx.getImageData(0, 0, cw, ch);

      const tR = parseInt(autoTargetColor.slice(1,3), 16);
      const tG = parseInt(autoTargetColor.slice(3,5), 16);
      const tB = parseInt(autoTargetColor.slice(5,7), 16);
      const tol = autoTolerance * 3;

      // Mark all pixels within tolerance
      const marked = new Uint8Array(cw * ch);
      for (let i = 0; i < cw * ch; i++) {
        const p = i * 4;
        if (Math.abs(pixels[p]-tR) + Math.abs(pixels[p+1]-tG) + Math.abs(pixels[p+2]-tB) <= tol) marked[i] = 1;
      }

      // DFS connected components
      const componentOf = new Int32Array(cw * ch).fill(-1);
      const comps: { pixels: number[]; rS:number; gS:number; bS:number }[] = [];
      for (let start = 0; start < cw * ch; start++) {
        if (!marked[start] || componentOf[start] >= 0) continue;
        const ci = comps.length;
        const comp = { pixels: [] as number[], rS: 0, gS: 0, bS: 0 };
        const stk: number[] = [start];
        while (stk.length) {
          const pos = stk.pop()!;
          if (componentOf[pos] >= 0) continue;
          componentOf[pos] = ci;
          comp.pixels.push(pos);
          comp.rS += pixels[pos*4]; comp.gS += pixels[pos*4+1]; comp.bS += pixels[pos*4+2];
          const x = pos % cw, y = Math.floor(pos / cw);
          if (x > 0 && marked[pos-1] && componentOf[pos-1] < 0) stk.push(pos-1);
          if (x < cw-1 && marked[pos+1] && componentOf[pos+1] < 0) stk.push(pos+1);
          if (y > 0 && marked[pos-cw] && componentOf[pos-cw] < 0) stk.push(pos-cw);
          if (y < ch-1 && marked[pos+cw] && componentOf[pos+cw] < 0) stk.push(pos+cw);
        }
        comps.push(comp);
      }

      const minPx = cw * ch * 0.003;
      const large = comps.filter(c => c.pixels.length >= minPx)
        .sort((a,b) => b.pixels.length - a.pixels.length)
        .slice(0, 12);

      // Build initial results (polygons, no OCR yet)
      const initial = large.map(comp => {
        const mask = new Uint8Array(cw * ch);
        for (const pos of comp.pixels) mask[pos] = 1;
        const leftPts:{x:number;y:number}[] = [], rightPts:{x:number;y:number}[] = [];
        for (let y = 0; y < ch; y++) {
          let minX = cw, maxX = -1;
          for (let x = 0; x < cw; x++) { if (mask[y*cw+x]) { if (x < minX) minX = x; if (x > maxX) maxX = x; } }
          if (maxX >= 0) { leftPts.push({x:(minX/cw)*100, y:(y/ch)*100}); rightPts.push({x:(maxX/cw)*100, y:(y/ch)*100}); }
        }
        const polygon = leftPts.length ? douglasPeucker([...leftPts, ...rightPts.reverse()], 0.7) : [];
        const cnt = comp.pixels.length;
        const avgColor = '#' + [comp.rS/cnt, comp.gS/cnt, comp.bS/cnt].map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
        return { id: Math.random().toString(36).slice(2), polygon, name: '', color: avgColor, altRanges: [] as {name:string;alt_min:string;alt_max:string}[], saving: false, saved: false };
      }).filter(r => r.polygon.length >= 3);

      setAutoResults(initial);
      if (initial.length > 0) setAutoSelectedId(initial[0].id);

      // OCR each zone sequentially, updating results progressively
      for (let i = 0; i < initial.length; i++) {
        const r = initial[i];
        try {
          const allX = r.polygon.map(p=>p.x), allY = r.polygon.map(p=>p.y);
          const bx = Math.max(0, Math.min(...allX)/100*nw - 10);
          const by = Math.max(0, Math.min(...allY)/100*nh - 10);
          const bw = Math.min(nw - bx, (Math.max(...allX) - Math.min(...allX))/100*nw + 20);
          const bh = Math.min(nh - by, (Math.max(...allY) - Math.min(...allY))/100*nh + 20);
          if (bw < 5 || bh < 5) continue;
          const cc = document.createElement('canvas');
          cc.width = Math.round(bw); cc.height = Math.round(bh);
          cc.getContext('2d')!.drawImage(img, bx, by, bw, bh, 0, 0, bw, bh);
          const { data: { text } } = await Tesseract.recognize(cc, 'heb+eng', { logger: ()=>{} });
          const altRanges: {name:string;alt_min:string;alt_max:string}[] = [];
          const flRange = /FL\s*(\d+)\s*[-–]\s*FL?\s*(\d+)/gi;
          let m: RegExpExecArray|null;
          while ((m = flRange.exec(text)) !== null) altRanges.push({name:`FL${m[1]}-FL${m[2]}`, alt_min:m[1], alt_max:m[2]});
          if (!altRanges.length) {
            const flS = /FL\s*(\d+)/gi; const ss:string[] = [];
            while ((m = flS.exec(text)) !== null) ss.push(m[1]);
            for (let j = 0; j+1 < ss.length; j+=2) altRanges.push({name:`FL${ss[j]}-FL${ss[j+1]}`, alt_min:ss[j], alt_max:ss[j+1]});
          }
          const cleaned = text.replace(/FL\s*\d+/gi,'').replace(/\d+/g,'').replace(/[^\u05D0-\u05EA ]/g,' ').trim();
          const lines = cleaned.split(/\s{2,}|\n/).map((l:string)=>l.trim()).filter((l:string)=>l.length>1);
          const name = lines[0] || '';
          setAutoResults(prev => prev.map((x,j) => j===i ? {...x, name, altRanges} : x));
        } catch(e) { console.warn('OCR fail zone', i, e); }
      }
    } catch(e) { console.error('detectAllZones error', e); }
    setAutoRunning(false);
  };

  const saveAutoResult = async (idx: number) => {
    const r = autoResults[idx];
    if (!r || r.saved || r.saving) return;
    setAutoResults(prev => prev.map((x,i) => i===idx ? {...x, saving:true} : x));
    try {
      const polygon_geo = computePolygonGeo(r.polygon);
      const res = await fetch(`${API_URL}/map-zones`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ map_id: mapId, name: r.name || 'אזור חדש', color: r.color, polygon: r.polygon, polygon_geo })
      });
      if (res.ok) {
        const newZone = await res.json();
        for (const ar of r.altRanges) {
          if (!ar.name.trim()) continue;
          await fetch(`${API_URL}/zone-altitude-ranges`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ zone_id: newZone.id, name: ar.name, alt_min: ar.alt_min ? Number(ar.alt_min) : null, alt_max: ar.alt_max ? Number(ar.alt_max) : null, sort_order: 0 })
          });
        }
        await loadZones();
        setAutoResults(prev => prev.map((x,i) => i===idx ? {...x, saving:false, saved:true} : x));
      } else { setAutoResults(prev => prev.map((x,i) => i===idx ? {...x, saving:false} : x)); }
    } catch(e) { setAutoResults(prev => prev.map((x,i) => i===idx ? {...x, saving:false} : x)); }
  };

  const polygonToSvgPoints = (pts: {x:number;y:number}[]) =>
    pts.map(p => `${p.x},${p.y}`).join(' ');

  const activeZone = editingZone;
  const activePoly = activeZone ? activeZone.polygon : draftPoints;

  const svgRef = useRef<SVGSVGElement>(null);

  const getSvgRelativePoint = (e: React.MouseEvent): {x:number;y:number}|null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
  };

  const handleZoneMouseDown = (e: React.MouseEvent, zone: MapZone) => {
    if (anchorMode || draftPoints.length > 0) return;
    e.stopPropagation();
    e.preventDefault();
    const pt = getSvgRelativePoint(e);
    if (!pt) return;
    dragRef.current = { zoneId: zone.id, startX: pt.x, startY: pt.y, origPoly: zone.polygon.map(p => ({...p})), moved: false };
    setDragOffset({ zoneId: zone.id, dx: 0, dy: 0 });
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    // Geo-coordinate hover display
    const anchor = getAnchorFromMapData(localMapData);
    if (anchor) {
      const pt = getSvgRelativePoint(e);
      if (pt) {
        const geo = imagePctToGeo(pt.x, pt.y, anchor);
        if (isFinite(geo.lat) && isFinite(geo.lon)) setEditorHoverCoord(geo);
        else setEditorHoverCoord(null);
      }
    }
    if (sectorMode && sectorDragRef.current) {
      const pt = getSvgRelativePoint(e);
      if (!pt) return;
      setSectorDraft({ x1: sectorDragRef.current.startX, y1: sectorDragRef.current.startY, x2: pt.x, y2: pt.y });
      return;
    }
    if (!dragRef.current) return;
    const pt = getSvgRelativePoint(e);
    if (!pt) return;
    const dx = pt.x - dragRef.current.startX;
    const dy = pt.y - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 0.3) dragRef.current.moved = true;
    setDragOffset({ zoneId: dragRef.current.zoneId, dx, dy });
  };

  const handleSvgMouseUp = async (e: React.MouseEvent<SVGSVGElement>) => {
    if (sectorMode && sectorDragRef.current) {
      const pt = getSvgRelativePoint(e);
      if (pt) setSectorRect({ x1: sectorDragRef.current.startX, y1: sectorDragRef.current.startY, x2: pt.x, y2: pt.y });
      sectorDragRef.current = null;
      setSectorDraft(null);
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragOffset(null);
    if (!drag.moved) {
      const zone = zones.find(z => z.id === drag.zoneId);
      if (zone) { setEditingZone(zone); setDraftPoints([]); setAltRanges([]); loadAltRanges(zone.id); }
      return;
    }
    const pt = getSvgRelativePoint(e);
    if (!pt) return;
    const dx = pt.x - drag.startX;
    const dy = pt.y - drag.startY;
    const newPoly = drag.origPoly.map(p => ({ x: Math.max(0, Math.min(100, p.x + dx)), y: Math.max(0, Math.min(100, p.y + dy)) }));
    const zone = zones.find(z => z.id === drag.zoneId);
    if (!zone) return;
    const polygon_geo = computePolygonGeo(newPoly);
    setZones(prev => prev.map(z => z.id === drag.zoneId ? { ...z, polygon: newPoly } : z));
    try {
      await fetch(`${API_URL}/map-zones/${drag.zoneId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: zone.name, color: zone.color, polygon: newPoly, polygon_geo })
      });
    } catch {}
  };

  const handleSvgClickFixed = (e: React.MouseEvent<SVGSVGElement>) => {
    if (sectorMode) return;
    if (dragRef.current?.moved) return;
    if (anchorMode) {
      const pt = getSvgRelativePoint(e);
      if (!pt) return;
      if (anchorStep === 1) { setPendingAnchor1(pt); setAnchorStep(2); }
      else { setPendingAnchor2(pt); }
      return;
    }
    if (autoMode) return;
    if (editingZone) return;
    const pt = getSvgRelativePoint(e);
    if (!pt) return;
    if (draftPoints.length >= 2) {
      const first = draftPoints[0];
      const dist = Math.hypot(pt.x - first.x, pt.y - first.y);
      if (dist < 2) { return; }
    }
    setDraftPoints(prev => [...prev, pt]);
  };

  const cropImageToSector = (imageSrc: string, sx1: number, sy1: number, sx2: number, sy2: number): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const srcX = (Math.min(sx1, sx2) / 100) * img.naturalWidth;
        const srcY = (Math.min(sy1, sy2) / 100) * img.naturalHeight;
        const srcW = (Math.abs(sx2 - sx1) / 100) * img.naturalWidth;
        const srcH = (Math.abs(sy2 - sy1) / 100) * img.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(srcW));
        canvas.height = Math.max(1, Math.round(srcH));
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = reject;
      img.src = imageSrc;
    });

  const createSectorMap = async () => {
    if (!sectorRect || !sectorName.trim()) return;
    setSectorCreating(true);
    setSectorCreated(null);
    try {
      const { x1, y1, x2, y2 } = sectorRect;
      const normX1 = Math.min(x1, x2), normY1 = Math.min(y1, y2);
      const normX2 = Math.max(x1, x2), normY2 = Math.max(y1, y2);
      const sw = normX2 - normX1, sh = normY2 - normY1;
      if (sw < 1 || sh < 1) { alert('הסקטור קטן מדי'); setSectorCreating(false); return; }
      const croppedImage = await cropImageToSector(mapSrc, normX1, normY1, normX2, normY2);
      const parentName = localMapData?.name ?? 'מפה';
      const mapName = `${sectorName.trim()} (חלק ממפת ${parentName})`;
      const mapRes = await fetch(`${API_URL}/maps`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: mapName, image_data: croppedImage, parent_map_id: mapId, parent_rect: { x1: normX1, y1: normY1, x2: normX2, y2: normY2 } })
      });
      if (!mapRes.ok) { const err = await mapRes.json(); alert(err.error || 'שגיאה ביצירת מפה'); setSectorCreating(false); return; }
      const newMap = await mapRes.json();
      // Propagate geo anchors from parent to child — transform anchor % coords into the child's space.
      // Even if the transformed coords fall outside 0–100, the linear mapping stays valid.
      if (currentAnchor) {
        const ca1x = ((currentAnchor.x1 - normX1) / sw) * 100;
        const ca1y = ((currentAnchor.y1 - normY1) / sh) * 100;
        const ca2x = ((currentAnchor.x2 - normX1) / sw) * 100;
        const ca2y = ((currentAnchor.y2 - normY1) / sh) * 100;
        await fetch(`${API_URL}/maps/${newMap.id}/anchors`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anchor1_x_img: ca1x, anchor1_y_img: ca1y, anchor1_lat: currentAnchor.lat1, anchor1_lon: currentAnchor.lon1, anchor2_x_img: ca2x, anchor2_y_img: ca2y, anchor2_lat: currentAnchor.lat2, anchor2_lon: currentAnchor.lon2 })
        }).catch(() => {});
      }
      for (const zone of zones) {
        const anyInside = zone.polygon.some(p => p.x >= normX1 && p.x <= normX2 && p.y >= normY1 && p.y <= normY2);
        if (!anyInside) continue;
        const newPoly = zone.polygon.map(p => ({
          x: Math.min(100, Math.max(0, ((p.x - normX1) / sw) * 100)),
          y: Math.min(100, Math.max(0, ((p.y - normY1) / sh) * 100))
        }));
        await fetch(`${API_URL}/map-zones`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ map_id: newMap.id, name: zone.name, color: zone.color, polygon: newPoly, parent_zone_id: zone.id })
        });
      }
      setSectorCreating(false);
      setSectorCreated(mapName);
      setSectorName('');
      setSectorRect(null);
    } catch (err) {
      console.error(err);
      setSectorCreating(false);
      alert('שגיאה ביצירת הסקטור');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
      <div style={{ width: '96vw', height: '93vh', background: '#0f172a', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #334155', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid #1e293b', flexShrink: 0, background: '#0f172a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: '16px' }}>{tr('map.editMapZones')}</span>
            <span style={{ color: isCalibrated ? '#22c55e' : '#f59e0b', fontSize: '12px', fontWeight: 'bold', background: isCalibrated ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: '10px' }}>
              {isCalibrated ? '✅ מכוילת' : '⚠️ לא מכוילת'}
            </span>
            {anchorMode && (
              <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold', background: anchorStep === 1 ? '#ef4444' : '#3b82f6', padding: '3px 10px', borderRadius: '10px', animation: 'elemBlink 1s infinite' }}>
                📍 {anchorStep === 1 ? 'לחץ על המפה לסימון עוגן 1' : 'לחץ על המפה לסימון עוגן 2'}
              </span>
            )}
            {autoMode && !anchorMode && (
              <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold', background: '#7c3aed', padding: '3px 10px', borderRadius: '10px', animation: autoRunning ? 'elemBlink 0.7s infinite' : 'none' }}>
                {autoRunning ? `⏳ מזהה... OCR רץ` : autoResults.length > 0 ? `🤖 נמצאו ${autoResults.length} אזורים` : '🤖 מצב זיהוי אוטומטי'}
              </span>
            )}
            {sectorMode && (
              <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold', background: '#0e7490', padding: '3px 10px', borderRadius: '10px', animation: 'elemBlink 1s infinite' }}>
                ✂️ {sectorRect ? 'סקטור מסומן — הגדר שם וצור מפה' : 'גרור על המפה לסימון סקטור'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => { setSectorMode(v => !v); if (sectorMode) { setSectorRect(null); setSectorDraft(null); setSectorCreated(null); } }}
              title={sectorMode ? 'ביטול מצב סקטור' : 'צור מפת סקטור ממפה זו'}
              style={{ background: sectorMode ? '#0e7490' : '#334155', border: 'none', color: sectorMode ? '#a5f3fc' : '#94a3b8', cursor: 'pointer', fontSize: '13px', borderRadius: '6px', padding: '4px 10px', fontWeight: sectorMode ? 'bold' : 'normal' }}
            >{tr('map.sector')}</button>
            <button
              onClick={() => setPanMode(v => !v)}
              title={panMode ? 'מצב זזה פעיל — לחץ לביטול' : 'מצב זזה (גרור להזזת המפה)'}
              style={{ background: panMode ? '#7c3aed' : '#334155', border: 'none', color: panMode ? '#e9d5ff' : '#94a3b8', cursor: 'pointer', fontSize: '14px', borderRadius: '6px', padding: '4px 10px', fontWeight: panMode ? 'bold' : 'normal' }}
            >{tr('map.pan')}</button>
            <button onClick={() => setEditorZoom(z => Math.min(8, +(z * 1.25).toFixed(3)))} title={tr('map.zoomIn')} style={{ background: '#334155', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px', borderRadius: '6px', width: '28px', height: '28px' }}>+</button>
            <span style={{ color: '#64748b', fontSize: '12px', minWidth: '38px', textAlign: 'center' }}>{Math.round(editorZoom * 100)}%</span>
            <button onClick={() => setEditorZoom(z => Math.max(0.25, +(z / 1.25).toFixed(3)))} title={tr('map.zoomOut')} style={{ background: '#334155', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px', borderRadius: '6px', width: '28px', height: '28px' }}>−</button>
            <button onClick={() => { setEditorZoom(1); setEditorPan({ x: 0, y: 0 }); }} title={tr('map.resetZoomAndPosition')} style={{ background: '#334155', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '11px', borderRadius: '6px', padding: '4px 8px' }}>{tr('shared.reset')}</button>
            <button onClick={onClose} style={{ background: '#334155', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '20px', lineHeight: 1, borderRadius: '6px', width: '32px', height: '32px' }}>×</button>
          </div>
        </div>

        {/* Body: map + side panel */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Map area — takes most of the space, SVG positioned directly over image */}
          <div
            ref={containerRef}
            style={{ flex: 1, position: 'relative', background: '#1e293b', overflow: 'hidden', cursor: panMode ? 'grab' : 'default', touchAction: 'none', userSelect: 'none' }}
            onPointerDown={e => {
              if (!panMode) return;
              const tgt = e.target as HTMLElement;
              if (tgt.closest('button') || tgt.closest('input') || tgt.closest('select')) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              editorPanDragRef.current = { startX: e.clientX, startY: e.clientY, panX: editorPan.x, panY: editorPan.y };
              (e.currentTarget as HTMLDivElement).style.cursor = 'grabbing';
            }}
            onPointerMove={e => {
              if (!editorPanDragRef.current) return;
              setEditorPan({ x: editorPanDragRef.current.panX + (e.clientX - editorPanDragRef.current.startX), y: editorPanDragRef.current.panY + (e.clientY - editorPanDragRef.current.startY) });
            }}
            onPointerUp={e => {
              if (!editorPanDragRef.current) return;
              editorPanDragRef.current = null;
              (e.currentTarget as HTMLDivElement).style.cursor = panMode ? 'grab' : 'default';
            }}
            onPointerCancel={() => { editorPanDragRef.current = null; }}
          >
            {/* Transform wrapper — zoom + pan applied here */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: `translate(${editorPan.x}px, ${editorPan.y}px) scale(${editorZoom})`, transformOrigin: 'center center' }}>
            <img
              ref={imgEditorRef}
              src={mapSrc}
              onLoad={computeEditorImgBounds}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
            />
            {/* SVG always covers the exact image-rendered area for accurate coordinate mapping */}
            {imgEditorBounds ? (() => { const sz = 1 / editorZoom; return (
              <svg
                ref={svgRef}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{
                  position: 'absolute',
                  left: imgEditorBounds.left,
                  top: imgEditorBounds.top,
                  width: imgEditorBounds.width,
                  height: imgEditorBounds.height,
                  cursor: panMode ? 'inherit' : (sectorMode ? 'crosshair' : (anchorMode || autoMode ? 'crosshair' : (dragRef.current ? 'grabbing' : (editingZone ? 'default' : 'crosshair')))),
                  userSelect: 'none',
                  pointerEvents: panMode ? 'none' : 'auto',
                }}
                onClick={handleSvgClickFixed}
                onDoubleClick={handleSvgDblClick}
                onMouseDown={e => {
                  if (!sectorMode) return;
                  e.preventDefault();
                  const pt = getSvgRelativePoint(e);
                  if (!pt) return;
                  sectorDragRef.current = { startX: pt.x, startY: pt.y };
                }}
                onMouseMove={handleSvgMouseMove}
                onMouseUp={handleSvgMouseUp}
                onMouseLeave={() => {
                  if (dragRef.current) { dragRef.current = null; setDragOffset(null); }
                  if (sectorDragRef.current) { sectorDragRef.current = null; setSectorDraft(null); }
                  setEditorHoverCoord(null);
                }}
              >
                {zones.map(z => {
                  const isDragging = dragOffset?.zoneId === z.id;
                  const isDisabled = z.enabled === false;
                  const poly = isDragging
                    ? z.polygon.map(p => ({ x: Math.max(0, Math.min(100, p.x + dragOffset!.dx)), y: Math.max(0, Math.min(100, p.y + dragOffset!.dy)) }))
                    : z.polygon;
                  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
                  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
                  return (
                  <g key={z.id} style={{ cursor: anchorMode || draftPoints.length > 0 ? 'crosshair' : 'grab', opacity: isDisabled ? 0.3 : 1 }}>
                    <polygon points={polygonToSvgPoints(poly)} fill={z.color + (isDragging ? '55' : '33')} stroke={z.color} strokeWidth={isDragging ? 1*sz : 0.5*sz} strokeDasharray={isDisabled ? `${2*sz},${1.5*sz}` : undefined}
                      onMouseDown={(e) => handleZoneMouseDown(e, z)} />
                    {poly.length > 0 && (
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill={z.color} fontSize={3*sz} fontWeight="bold"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>{z.name}{isDisabled ? ' ⊘' : ''}</text>
                    )}
                  </g>
                  );
                })}
                {activePoly.length >= 2 && (
                  <polyline points={polygonToSvgPoints(activePoly)} fill="none" stroke={editingZone ? editingZone.color : draftColor} strokeWidth={0.5*sz} strokeDasharray={`${2*sz},${1*sz}`} />
                )}
                {activePoly.length >= 3 && (
                  <polygon points={polygonToSvgPoints(activePoly)} fill={(editingZone ? editingZone.color : draftColor) + '33'} stroke={editingZone ? editingZone.color : draftColor} strokeWidth={0.5*sz} />
                )}
                {activePoly.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 0.7*sz : 0.45*sz} fill={editingZone ? editingZone.color : draftColor} style={{ pointerEvents: 'none' }} />
                ))}
                {currentAnchor && (<>
                  <line x1={currentAnchor.x1 - 2.5*sz} y1={currentAnchor.y1} x2={currentAnchor.x1 + 2.5*sz} y2={currentAnchor.y1} stroke="white" strokeWidth={0.6*sz} style={{ pointerEvents: 'none' }} />
                  <line x1={currentAnchor.x1} y1={currentAnchor.y1 - 2.5*sz} x2={currentAnchor.x1} y2={currentAnchor.y1 + 2.5*sz} stroke="white" strokeWidth={0.6*sz} style={{ pointerEvents: 'none' }} />
                  <line x1={currentAnchor.x1 - 2.2*sz} y1={currentAnchor.y1} x2={currentAnchor.x1 + 2.2*sz} y2={currentAnchor.y1} stroke="#f59e0b" strokeWidth={0.35*sz} style={{ pointerEvents: 'none' }} />
                  <line x1={currentAnchor.x1} y1={currentAnchor.y1 - 2.2*sz} x2={currentAnchor.x1} y2={currentAnchor.y1 + 2.2*sz} stroke="#f59e0b" strokeWidth={0.35*sz} style={{ pointerEvents: 'none' }} />
                  <circle cx={currentAnchor.x1} cy={currentAnchor.y1} r={0.5*sz} fill="#f59e0b" style={{ pointerEvents: 'none' }} />
                  <text x={currentAnchor.x1 + 2.5*sz} y={currentAnchor.y1} fill="#f59e0b" fontSize={3*sz} fontWeight="bold" style={{ pointerEvents: 'none' }}>A1</text>
                  <line x1={currentAnchor.x2 - 2.5*sz} y1={currentAnchor.y2} x2={currentAnchor.x2 + 2.5*sz} y2={currentAnchor.y2} stroke="white" strokeWidth={0.6*sz} style={{ pointerEvents: 'none' }} />
                  <line x1={currentAnchor.x2} y1={currentAnchor.y2 - 2.5*sz} x2={currentAnchor.x2} y2={currentAnchor.y2 + 2.5*sz} stroke="white" strokeWidth={0.6*sz} style={{ pointerEvents: 'none' }} />
                  <line x1={currentAnchor.x2 - 2.2*sz} y1={currentAnchor.y2} x2={currentAnchor.x2 + 2.2*sz} y2={currentAnchor.y2} stroke="#f59e0b" strokeWidth={0.35*sz} style={{ pointerEvents: 'none' }} />
                  <line x1={currentAnchor.x2} y1={currentAnchor.y2 - 2.2*sz} x2={currentAnchor.x2} y2={currentAnchor.y2 + 2.2*sz} stroke="#f59e0b" strokeWidth={0.35*sz} style={{ pointerEvents: 'none' }} />
                  <circle cx={currentAnchor.x2} cy={currentAnchor.y2} r={0.5*sz} fill="#f59e0b" style={{ pointerEvents: 'none' }} />
                  <text x={currentAnchor.x2 + 2.5*sz} y={currentAnchor.y2} fill="#f59e0b" fontSize={3*sz} fontWeight="bold" style={{ pointerEvents: 'none' }}>A2</text>
                </>)}
                {anchorMode && pendingAnchor1 && (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1={pendingAnchor1.x - 3*sz} y1={pendingAnchor1.y} x2={pendingAnchor1.x + 3*sz} y2={pendingAnchor1.y} stroke="white" strokeWidth={0.7*sz} />
                    <line x1={pendingAnchor1.x} y1={pendingAnchor1.y - 3*sz} x2={pendingAnchor1.x} y2={pendingAnchor1.y + 3*sz} stroke="white" strokeWidth={0.7*sz} />
                    <line x1={pendingAnchor1.x - 2.5*sz} y1={pendingAnchor1.y} x2={pendingAnchor1.x + 2.5*sz} y2={pendingAnchor1.y} stroke="#ef4444" strokeWidth={0.4*sz} />
                    <line x1={pendingAnchor1.x} y1={pendingAnchor1.y - 2.5*sz} x2={pendingAnchor1.x} y2={pendingAnchor1.y + 2.5*sz} stroke="#ef4444" strokeWidth={0.4*sz} />
                    <circle cx={pendingAnchor1.x} cy={pendingAnchor1.y} r={0.6*sz} fill="#ef4444" />
                  </g>
                )}
                {anchorMode && pendingAnchor2 && (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1={pendingAnchor2.x - 3*sz} y1={pendingAnchor2.y} x2={pendingAnchor2.x + 3*sz} y2={pendingAnchor2.y} stroke="white" strokeWidth={0.7*sz} />
                    <line x1={pendingAnchor2.x} y1={pendingAnchor2.y - 3*sz} x2={pendingAnchor2.x} y2={pendingAnchor2.y + 3*sz} stroke="white" strokeWidth={0.7*sz} />
                    <line x1={pendingAnchor2.x - 2.5*sz} y1={pendingAnchor2.y} x2={pendingAnchor2.x + 2.5*sz} y2={pendingAnchor2.y} stroke="#3b82f6" strokeWidth={0.4*sz} />
                    <line x1={pendingAnchor2.x} y1={pendingAnchor2.y - 2.5*sz} x2={pendingAnchor2.x} y2={pendingAnchor2.y + 2.5*sz} stroke="#3b82f6" strokeWidth={0.4*sz} />
                    <circle cx={pendingAnchor2.x} cy={pendingAnchor2.y} r={0.6*sz} fill="#3b82f6" />
                  </g>
                )}
                {autoResults.map(r => (
                  <g key={r.id} style={{ pointerEvents: 'none' }}>
                    <polygon points={polygonToSvgPoints(r.polygon)}
                      fill={r.saved ? r.color + '22' : r.id === autoSelectedId ? r.color + '55' : r.color + '33'}
                      stroke={r.saved ? r.color + '88' : r.color}
                      strokeWidth={r.id === autoSelectedId ? 1.2*sz : 0.7*sz}
                      strokeDasharray={r.saved ? 'none' : `${3*sz},${2*sz}`} />
                  </g>
                ))}
                {(() => {
                  const rect = sectorDraft || sectorRect;
                  if (!rect) return null;
                  const rx = Math.min(rect.x1, rect.x2), ry = Math.min(rect.y1, rect.y2);
                  const rw = Math.abs(rect.x2 - rect.x1), rh = Math.abs(rect.y2 - rect.y1);
                  const isDraft = !!sectorDraft;
                  return (
                    <g style={{ pointerEvents: 'none' }}>
                      <rect x={rx} y={ry} width={rw} height={rh}
                        fill="rgba(6,182,212,0.12)" stroke="#06b6d4"
                        strokeWidth={isDraft ? 0.6*sz : 0.9*sz}
                        strokeDasharray={isDraft ? `${3*sz},${2*sz}` : 'none'} />
                      {!isDraft && (
                        <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                          fill="#a5f3fc" fontSize={4*sz} fontWeight="bold" style={{ pointerEvents: 'none' }}>✂️</text>
                      )}
                    </g>
                  );
                })()}
              </svg>
            ); })() : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '13px' }}>{tr('map.loadingMap')}</div>
            )}
            </div>{/* end transform wrapper */}
            {/* Geo-coordinate hover display — bottom-left, shown when map is anchored */}
            {currentAnchor && (
              <div style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 50, pointerEvents: 'none' }}>
                {editorHoverCoord ? (
                  <div style={{ background: 'rgba(2,6,23,0.88)', borderRadius: '5px', padding: '3px 9px', border: '1px solid #334155', whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#e2e8f0', letterSpacing: '0.02em', direction: 'ltr', display: 'inline-block' }}>
                      ⚓&nbsp;{fmtDms(editorHoverCoord.lat, true)}&nbsp;&nbsp;{fmtDms(editorHoverCoord.lon, false)}
                    </span>
                  </div>
                ) : (
                  <div style={{ background: 'rgba(2,6,23,0.65)', borderRadius: '4px', padding: '2px 7px', border: '1px solid #334155' }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{tr('map.anchored')}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controls panel — right side */}
          <div style={{ width: '320px', overflowY: 'auto', background: '#0f172a', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '0' }}>

            {/* Sector Creation */}
            {sectorMode && (
              <div style={{ padding: '14px', borderBottom: '1px solid #0e7490', background: 'rgba(6,182,212,0.06)' }}>
                <div style={{ color: '#67e8f9', fontSize: '12px', fontWeight: 'bold', marginBottom: '10px' }}>{tr('map.createSectorMap')}</div>
                {sectorCreated ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ color: '#4ade80', fontSize: '12px', fontWeight: 'bold', padding: '8px 10px', background: 'rgba(74,222,128,0.1)', borderRadius: '6px', border: '1px solid rgba(74,222,128,0.3)' }}>
                      ✅ מפה נוצרה בהצלחה!<br/><span style={{ color: '#86efac', fontSize: '11px' }}>{sectorCreated}</span>
                    </div>
                    <button onClick={() => { setSectorCreated(null); setSectorRect(null); setSectorMode(false); }}
                      style={{ background: '#0e7490', color: '#a5f3fc', border: 'none', borderRadius: '6px', padding: '7px 14px', cursor: 'pointer', fontSize: '12px', width: '100%' }}>
                      סיים
                    </button>
                    <button onClick={() => { setSectorCreated(null); setSectorRect(null); }}
                      style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '6px', padding: '7px 14px', cursor: 'pointer', fontSize: '12px', width: '100%' }}>
                      צור סקטור נוסף
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                      {sectorRect ? '✅ סקטור מסומן על המפה' : '⬜ גרור מלבן על המפה לסימון הסקטור'}
                    </div>
                    {sectorRect && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div style={{ color: '#67e8f9', fontSize: '11px', whiteSpace: 'nowrap' }}>{tr('map.size')}</div>
                        <div style={{ color: '#a5f3fc', fontSize: '11px' }}>
                          {Math.round(Math.abs(sectorRect.x2 - sectorRect.x1))}% × {Math.round(Math.abs(sectorRect.y2 - sectorRect.y1))}%
                        </div>
                        <button onClick={() => setSectorRect(null)}
                          style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '14px', marginRight: 'auto' }}>✕</button>
                      </div>
                    )}
                    <input
                      value={sectorName}
                      onChange={e => setSectorName(e.target.value)}
                      placeholder={tr('map.newMapName')}
                      style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #0e7490', background: '#1e293b', color: 'white', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}
                    />
                    {sectorName.trim() && (
                      <div style={{ color: '#64748b', fontSize: '10px', fontStyle: 'italic', padding: '0 2px' }}>
                        ייווצר בשם: "{sectorName.trim()} (חלק ממפת {localMapData?.name ?? 'מפה'})"
                      </div>
                    )}
                    <button
                      onClick={createSectorMap}
                      disabled={!sectorRect || !sectorName.trim() || sectorCreating}
                      style={{ background: sectorRect && sectorName.trim() ? '#0e7490' : '#1e293b', color: sectorRect && sectorName.trim() ? '#a5f3fc' : '#475569', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: sectorRect && sectorName.trim() ? 'pointer' : 'not-allowed', fontSize: '12px', width: '100%', fontWeight: 'bold' }}>
                      {sectorCreating ? '⏳ יוצר מפה...' : '✂️ צור מפת סקטור'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Anchor / Calibration */}
            <div style={{ padding: '14px', borderBottom: '1px solid #1e293b' }}>
              <div style={{ color: '#7dd3fc', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>{tr('map.geoCalibration')}</div>
              {!anchorMode ? (
                <button onClick={() => {
                  setAnchorMode(true); setAnchorStep(1); setPendingAnchor1(null); setPendingAnchor2(null);
                  setPendingDmsLat1(localMapData?.anchor1_lat != null ? decimalToDms(localMapData.anchor1_lat, true)  : { deg:'', min:'', sec:'', dir:'N' });
                  setPendingDmsLon1(localMapData?.anchor1_lon != null ? decimalToDms(localMapData.anchor1_lon, false) : { deg:'', min:'', sec:'', dir:'E' });
                  setPendingDmsLat2(localMapData?.anchor2_lat != null ? decimalToDms(localMapData.anchor2_lat, true)  : { deg:'', min:'', sec:'', dir:'N' });
                  setPendingDmsLon2(localMapData?.anchor2_lon != null ? decimalToDms(localMapData.anchor2_lon, false) : { deg:'', min:'', sec:'', dir:'E' });
                }}
                  style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', padding: '7px 14px', cursor: 'pointer', fontSize: '12px', width: '100%' }}>
                  {isCalibrated ? '🔧 עדכן עיגון' : '📐 הגדר עיגון גיאו'}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {([1, 2] as const).map(step => {
                    const isActive = anchorStep === step;
                    const lat = step === 1 ? pendingDmsLat1 : pendingDmsLat2;
                    const lon = step === 1 ? pendingDmsLon1 : pendingDmsLon2;
                    const setLat = step === 1 ? setPendingDmsLat1 : setPendingDmsLat2;
                    const setLon = step === 1 ? setPendingDmsLon1 : setPendingDmsLon2;
                    const hasPin = step === 1 ? !!pendingAnchor1 : !!pendingAnchor2;
                    const inStyle = { padding: '3px 4px', borderRadius: '4px', border: `1px solid ${isActive ? '#3b82f6' : '#475569'}`, background: isActive ? '#172554' : '#1e293b', color: 'white', fontSize: '11px', textAlign: 'center' as const };
                    const selStyle = { padding: '3px 4px', borderRadius: '4px', border: `1px solid ${isActive ? '#3b82f6' : '#475569'}`, background: isActive ? '#172554' : '#0f172a', color: '#67e8f9', fontSize: '11px', fontWeight: 'bold' as const, cursor: 'pointer' };
                    return (
                      <div key={step} onClick={() => setAnchorStep(step)}
                        style={{ border: `1px solid ${isActive ? '#3b82f6' : '#334155'}`, borderRadius: '6px', padding: '6px 8px', background: isActive ? '#0f1f3d' : '#0f172a', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: isActive ? '#60a5fa' : '#64748b' }}>
                            {isActive ? '▶ ' : ''}עוגן {step} (A{step})
                          </span>
                          {hasPin && <span style={{ fontSize: '10px', color: '#34d399' }}>📍</span>}
                          {isActive && <span style={{ fontSize: '10px', color: '#fbbf24', marginRight: 'auto' }}>{tr('shared.clickOnTheMap')}</span>}
                        </div>
                        {/* Latitude row — direction:ltr so deg is leftmost, min center, sec rightmost */}
                        <div style={{ display: 'flex', gap: '3px', alignItems: 'center', direction: 'ltr' }}>
                          <select value={lat.dir} onClick={e => e.stopPropagation()} onChange={e => { setAnchorStep(step); setLat(p => ({ ...p, dir: e.target.value })); }} style={selStyle}>
                            <option value="N">N</option>
                            <option value="S">S</option>
                          </select>
                          <input type="number" min="0" max="90" value={lat.deg} onClick={e => e.stopPropagation()} onChange={e => { setAnchorStep(step); setLat(p => ({ ...p, deg: e.target.value })); }} placeholder="°" style={{ ...inStyle, width: '40px' }} />
                          <span style={{ color: '#475569', fontSize: '10px' }}>°</span>
                          <input type="number" min="0" max="59" value={lat.min} onClick={e => e.stopPropagation()} onChange={e => { setAnchorStep(step); setLat(p => ({ ...p, min: e.target.value })); }} placeholder="'" style={{ ...inStyle, width: '34px' }} />
                          <span style={{ color: '#475569', fontSize: '10px' }}>'</span>
                          <input type="number" min="0" max="59.99" step="0.1" value={lat.sec} onClick={e => e.stopPropagation()} onChange={e => { setAnchorStep(step); setLat(p => ({ ...p, sec: e.target.value })); }} placeholder="''" style={{ ...inStyle, width: '42px' }} />
                          <span style={{ color: '#475569', fontSize: '10px' }}>''</span>
                        </div>
                        {/* Longitude row — direction:ltr so deg is leftmost, min center, sec rightmost */}
                        <div style={{ display: 'flex', gap: '3px', alignItems: 'center', direction: 'ltr' }}>
                          <select value={lon.dir} onClick={e => e.stopPropagation()} onChange={e => { setAnchorStep(step); setLon(p => ({ ...p, dir: e.target.value })); }} style={selStyle}>
                            <option value="E">E</option>
                            <option value="W">W</option>
                          </select>
                          <input type="number" min="0" max="180" value={lon.deg} onClick={e => e.stopPropagation()} onChange={e => { setAnchorStep(step); setLon(p => ({ ...p, deg: e.target.value })); }} placeholder="°" style={{ ...inStyle, width: '40px' }} />
                          <span style={{ color: '#475569', fontSize: '10px' }}>°</span>
                          <input type="number" min="0" max="59" value={lon.min} onClick={e => e.stopPropagation()} onChange={e => { setAnchorStep(step); setLon(p => ({ ...p, min: e.target.value })); }} placeholder="'" style={{ ...inStyle, width: '34px' }} />
                          <span style={{ color: '#475569', fontSize: '10px' }}>'</span>
                          <input type="number" min="0" max="59.99" step="0.1" value={lon.sec} onClick={e => e.stopPropagation()} onChange={e => { setAnchorStep(step); setLon(p => ({ ...p, sec: e.target.value })); }} placeholder="''" style={{ ...inStyle, width: '42px' }} />
                          <span style={{ color: '#475569', fontSize: '10px' }}>''</span>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {anchorStep === 1 && pendingAnchor1 && (
                      <button onClick={() => setAnchorStep(2)} style={{ flex: 1, background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '4px', padding: '5px', cursor: 'pointer', fontSize: '12px' }}>{tr('shared.goToAnchor2')}</button>
                    )}
                    {pendingAnchor1 && pendingAnchor2 && (
                      <button onClick={saveAnchors} disabled={savingAnchors} style={{ flex: 1, background: '#059669', color: 'white', border: 'none', borderRadius: '4px', padding: '5px', cursor: 'pointer', fontSize: '12px' }}>
                        {savingAnchors ? '...' : '💾 שמור עיגון'}
                      </button>
                    )}
                    <button onClick={() => { setAnchorMode(false); setPendingAnchor1(null); setPendingAnchor2(null); setAnchorStep(1); }}
                      style={{ background: '#475569', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}>{tr('shared.cancel')}</button>
                  </div>
                </div>
              )}
            </div>

            {/* Editing existing zone */}
            {editingZone && (
              <div style={{ padding: '14px', borderBottom: '1px solid #1e293b' }}>
                <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '8px' }}>{tr('map.editZone')}</div>
                <input value={editingZone.name} onChange={e => setEditingZone(z => z ? { ...z, name: e.target.value } : z)} placeholder={tr('map.zoneName')}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '4px', border: '1px solid #475569', background: '#1e293b', color: 'white', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px' }} />
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                  {ZONE_COLORS.map(c => (
                    <div key={c} onClick={() => setEditingZone(z => z ? { ...z, color: c } : z)}
                      style={{ width: '22px', height: '22px', borderRadius: '50%', background: c, cursor: 'pointer', border: editingZone.color === c ? '3px solid white' : '2px solid transparent' }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  <button onClick={saveEdit} disabled={saving} style={{ flex: 1, background: '#059669', color: 'white', border: 'none', borderRadius: '4px', padding: '7px', cursor: 'pointer', fontSize: '12px' }}>
                    {saving ? '...' : '💾 שמור'}
                  </button>
                  <button onClick={() => { deleteZone(editingZone.id); setEditingZone(null); }} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '7px 10px', cursor: 'pointer', fontSize: '12px' }}>🗑</button>
                  <button onClick={() => setEditingZone(null)} style={{ background: '#334155', color: 'white', border: 'none', borderRadius: '4px', padding: '7px 10px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                </div>
                <div style={{ borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
                  <div style={{ color: '#7dd3fc', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px' }}>{tr('map.altitudeRanges')}</div>
                  {altRangesLoading ? (
                    <div style={{ color: '#64748b', fontSize: '11px' }}>{tr('shared.loading')}</div>
                  ) : (
                    <>
                      {altRanges.map(ar => (
                        <div key={ar.id} style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '5px' }}>
                          <input value={ar.name} onChange={e => setAltRanges(prev => prev.map(x => x.id === ar.id ? { ...x, name: e.target.value } : x))}
                            onBlur={async () => { await fetch(`${API_URL}/zone-altitude-ranges/${ar.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: ar.name, alt_min: ar.alt_min, alt_max: ar.alt_max, sort_order: ar.sort_order }) }); }}
                            placeholder={tr('shared.name')} style={{ flex: 2, padding: '3px 5px', border: '1px solid #334155', borderRadius: '3px', background: '#1e293b', color: 'white', fontSize: '11px' }} />
                          <input type="number" value={ar.alt_min ?? ''} onChange={e => setAltRanges(prev => prev.map(x => x.id === ar.id ? { ...x, alt_min: e.target.value ? Number(e.target.value) : null } : x))}
                            onBlur={async () => { await fetch(`${API_URL}/zone-altitude-ranges/${ar.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: ar.name, alt_min: ar.alt_min, alt_max: ar.alt_max, sort_order: ar.sort_order }) }); }}
                            placeholder="מינ'" style={{ width: '50px', padding: '3px 5px', border: '1px solid #334155', borderRadius: '3px', background: '#1e293b', color: 'white', fontSize: '11px' }} />
                          <span style={{ color: '#64748b', fontSize: '10px' }}>—</span>
                          <input type="number" value={ar.alt_max ?? ''} onChange={e => setAltRanges(prev => prev.map(x => x.id === ar.id ? { ...x, alt_max: e.target.value ? Number(e.target.value) : null } : x))}
                            onBlur={async () => { await fetch(`${API_URL}/zone-altitude-ranges/${ar.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: ar.name, alt_min: ar.alt_min, alt_max: ar.alt_max, sort_order: ar.sort_order }) }); }}
                            placeholder="מקס'" style={{ width: '50px', padding: '3px 5px', border: '1px solid #334155', borderRadius: '3px', background: '#1e293b', color: 'white', fontSize: '11px' }} />
                          <button onClick={async () => { await fetch(`${API_URL}/zone-altitude-ranges/${ar.id}`, { method: 'DELETE' }); setAltRanges(prev => prev.filter(x => x.id !== ar.id)); }}
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px', padding: '0 2px' }}>✕</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '6px' }}>
                        <input value={newAltRange.name} onChange={e => setNewAltRange(p => ({ ...p, name: e.target.value }))} placeholder={tr('map.newName')}
                          style={{ flex: 2, padding: '3px 5px', border: '1px dashed #475569', borderRadius: '3px', background: '#0f172a', color: 'white', fontSize: '11px' }} />
                        <input type="number" value={newAltRange.alt_min} onChange={e => setNewAltRange(p => ({ ...p, alt_min: e.target.value }))} placeholder="מינ'"
                          style={{ width: '50px', padding: '3px 5px', border: '1px dashed #475569', borderRadius: '3px', background: '#0f172a', color: 'white', fontSize: '11px' }} />
                        <span style={{ color: '#64748b', fontSize: '10px' }}>—</span>
                        <input type="number" value={newAltRange.alt_max} onChange={e => setNewAltRange(p => ({ ...p, alt_max: e.target.value }))} placeholder="מקס'"
                          style={{ width: '50px', padding: '3px 5px', border: '1px dashed #475569', borderRadius: '3px', background: '#0f172a', color: 'white', fontSize: '11px' }} />
                        <button onClick={async () => {
                          if (!newAltRange.name.trim()) return;
                          const res = await fetch(`${API_URL}/zone-altitude-ranges`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zone_id: editingZone.id, name: newAltRange.name.trim(), alt_min: newAltRange.alt_min ? Number(newAltRange.alt_min) : null, alt_max: newAltRange.alt_max ? Number(newAltRange.alt_max) : null, sort_order: altRanges.length }) });
                          if (res.ok) { const row = await res.json(); setAltRanges(prev => [...prev, row]); setNewAltRange({ name: '', alt_min: '', alt_max: '' }); }
                        }} style={{ background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap' }}>+</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Add new zone */}
            {!editingZone && (
              <div style={{ padding: '14px', borderBottom: '1px solid #1e293b' }}>
                <div style={{ color: '#7dd3fc', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>{tr('map.newZone')}</div>
                <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '8px', lineHeight: 1.4 }}>
                  {draftPoints.length === 0 ? 'לחץ על המפה להוסיף נקודות' : `${draftPoints.length} נקודות — לחץ ליד נקודה ראשונה לסגירה`}
                </div>
                <input value={draftName} onChange={e => setDraftName(e.target.value)} placeholder={tr('map.zoneName2')}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '4px', border: '1px solid #475569', background: '#1e293b', color: 'white', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px' }} />
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                  {ZONE_COLORS.map(c => (
                    <div key={c} onClick={() => setDraftColor(c)}
                      style={{ width: '22px', height: '22px', borderRadius: '50%', background: c, cursor: 'pointer', border: draftColor === c ? '3px solid white' : '2px solid transparent' }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {draftPoints.length >= 3 && (
                    <button onClick={() => { if (!draftName.trim()) { alert('יש להזין שם לאזור'); return; } saveDraft(draftPoints); }}
                      disabled={saving} style={{ flex: 1, background: '#059669', color: 'white', border: 'none', borderRadius: '4px', padding: '7px', cursor: 'pointer', fontSize: '12px' }}>
                      {saving ? '...' : '💾 שמור אזור'}
                    </button>
                  )}
                  {draftPoints.length > 0 && (
                    <button onClick={() => setDraftPoints([])} style={{ background: '#475569', color: 'white', border: 'none', borderRadius: '4px', padding: '7px 10px', cursor: 'pointer', fontSize: '12px' }}>{tr('shared.clear')}</button>
                  )}
                </div>
              </div>
            )}

            {/* Auto detect zone */}
            <div style={{ padding: '14px', borderBottom: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ color: '#a78bfa', fontSize: '12px', fontWeight: 'bold' }}>{tr('map.autoDetect')}</div>
                <button
                  onClick={() => { setAutoMode(m => !m); setAutoResults([]); setAutoSelectedId(null); setEditingZone(null); setDraftPoints([]); }}
                  style={{ background: autoMode ? '#7c3aed' : '#334155', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '11px', fontWeight: autoMode ? 'bold' : 'normal' }}>
                  {autoMode ? '✓ פעיל' : 'הפעל'}
                </button>
              </div>
              {autoMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                  {/* Color picker */}
                  <div>
                    <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '5px' }}>{tr('map.pickTheZoneColor')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="color" value={autoTargetColor} onChange={e => setAutoTargetColor(e.target.value)}
                        style={{ width: '36px', height: '32px', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                      <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: autoTargetColor, border: '1px solid #475569', flexShrink: 0 }} />
                      <input value={autoTargetColor} onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setAutoTargetColor(e.target.value); }}
                        style={{ flex: 1, padding: '4px 7px', borderRadius: '5px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '12px', fontFamily: 'monospace' }} />
                    </div>
                  </div>

                  {/* Tolerance slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '11px', flexShrink: 0 }}>{tr('map.tolerance')}</span>
                    <input type="range" min="5" max="80" value={autoTolerance} onChange={e => setAutoTolerance(Number(e.target.value))}
                      style={{ flex: 1, accentColor: '#7c3aed' }} />
                    <span style={{ color: '#e2e8f0', fontSize: '11px', width: '24px', textAlign: 'left' }}>{autoTolerance}</span>
                  </div>

                  {/* Detect button */}
                  <button onClick={detectAllZones} disabled={autoRunning}
                    style={{ background: autoRunning ? '#4c1d95' : '#7c3aed', color: 'white', border: 'none', borderRadius: '7px', padding: '9px', cursor: autoRunning ? 'default' : 'pointer', fontSize: '13px', fontWeight: 'bold', animation: autoRunning ? 'elemBlink 0.8s infinite' : 'none' }}>
                    {autoRunning ? '⏳ מזהה אזורים + OCR...' : '🔍 זהה אזורים'}
                  </button>

                  {/* Results list */}
                  {autoResults.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ color: '#64748b', fontSize: '10px' }}>נמצאו {autoResults.length} אזורים — לחץ לבחירה ועריכה:</div>
                      {autoResults.map((r, idx) => (
                        <div key={r.id}
                          onClick={() => setAutoSelectedId(id => id === r.id ? null : r.id)}
                          style={{ background: r.id === autoSelectedId ? '#1e1b4b' : '#1e293b', borderRadius: '8px', border: `1px solid ${r.id === autoSelectedId ? r.color : r.color + '55'}`, padding: '8px', cursor: 'pointer', opacity: r.saved ? 0.5 : 1 }}>
                          {/* Row header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: r.color, flexShrink: 0 }} />
                            <span style={{ color: r.saved ? '#64748b' : '#e2e8f0', fontSize: '12px', flex: 1 }}>
                              {r.name || <span style={{ color: '#475569', fontStyle: 'italic' }}>{tr('map.unnamed')}</span>}
                            </span>
                            {r.saved && <span style={{ color: '#22c55e', fontSize: '11px' }}>{tr('map.saved')}</span>}
                            {!r.saved && <span style={{ color: '#64748b', fontSize: '10px' }}>{r.polygon.length} נק'</span>}
                          </div>
                          {/* Expanded editor */}
                          {r.id === autoSelectedId && !r.saved && (
                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }} onClick={e => e.stopPropagation()}>
                              {/* Color */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <input type="color" value={r.color} onChange={e => setAutoResults(prev => prev.map((x,i) => i===idx ? {...x, color: e.target.value} : x))}
                                  style={{ width: '26px', height: '22px', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                                <input value={r.color} onChange={e => setAutoResults(prev => prev.map((x,i) => i===idx ? {...x, color: e.target.value} : x))}
                                  style={{ flex: 1, padding: '3px 6px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '11px', fontFamily: 'monospace' }} />
                              </div>
                              {/* Name */}
                              <input value={r.name} onChange={e => setAutoResults(prev => prev.map((x,i) => i===idx ? {...x, name: e.target.value} : x))}
                                placeholder={tr('map.zoneName2')}
                                style={{ width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '12px', boxSizing: 'border-box' }} />
                              {/* Alt ranges */}
                              {r.altRanges.length > 0 && (
                                <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '2px' }}>{tr('map.altitudes')}</div>
                              )}
                              {r.altRanges.map((ar, ai) => (
                                <div key={ai} style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                                  <input value={ar.name} onChange={e => setAutoResults(prev => prev.map((x,i) => i===idx ? {...x, altRanges: x.altRanges.map((a,j) => j===ai ? {...a, name: e.target.value} : a)} : x))}
                                    placeholder={tr('shared.name')} style={{ flex: 2, padding: '2px 4px', borderRadius: '3px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '10px' }} />
                                  <input type="number" value={ar.alt_min} onChange={e => setAutoResults(prev => prev.map((x,i) => i===idx ? {...x, altRanges: x.altRanges.map((a,j) => j===ai ? {...a, alt_min: e.target.value} : a)} : x))}
                                    placeholder="מינ'" style={{ width: '42px', padding: '2px 3px', borderRadius: '3px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '10px' }} />
                                  <span style={{ color: '#475569', fontSize: '9px' }}>—</span>
                                  <input type="number" value={ar.alt_max} onChange={e => setAutoResults(prev => prev.map((x,i) => i===idx ? {...x, altRanges: x.altRanges.map((a,j) => j===ai ? {...a, alt_max: e.target.value} : a)} : x))}
                                    placeholder="מקס'" style={{ width: '42px', padding: '2px 3px', borderRadius: '3px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '10px' }} />
                                  <button onClick={() => setAutoResults(prev => prev.map((x,i) => i===idx ? {...x, altRanges: x.altRanges.filter((_,j) => j!==ai)} : x))}
                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: '0 2px' }}>✕</button>
                                </div>
                              ))}
                              <button onClick={() => setAutoResults(prev => prev.map((x,i) => i===idx ? {...x, altRanges: [...x.altRanges, {name:'',alt_min:'',alt_max:''}]} : x))}
                                style={{ background: '#1e3a5f', color: '#7dd3fc', border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '10px' }}>{tr('map.altitude')}</button>
                              {/* Actions */}
                              <div style={{ display: 'flex', gap: '5px', marginTop: '2px' }}>
                                <button onClick={() => saveAutoResult(idx)} disabled={r.saving}
                                  style={{ flex: 1, background: '#059669', color: 'white', border: 'none', borderRadius: '5px', padding: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                                  {r.saving ? '...' : '💾 שמור'}
                                </button>
                                <button onClick={() => setAutoResults(prev => prev.filter((_,i) => i!==idx))}
                                  style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '5px', padding: '6px 10px', cursor: 'pointer', fontSize: '11px' }}>🗑</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {autoResults.some(r => !r.saved) && (
                        <button onClick={async () => { for (let i=0; i<autoResults.length; i++) { if (!autoResults[i].saved) await saveAutoResult(i); } }}
                          style={{ background: '#064e3b', color: '#6ee7b7', border: '1px solid #059669', borderRadius: '6px', padding: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                          💾 שמור הכל ({autoResults.filter(r => !r.saved).length})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Existing zones list */}
            <div style={{ padding: '14px', flex: 1 }}>
              <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '8px' }}>אזורים שמורים ({zones.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {zones.map(z => (
                  <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: editingZone?.id === z.id ? '#1e40af22' : '#1e293b', borderRadius: '6px', padding: '6px 8px', border: `1px solid ${editingZone?.id === z.id ? z.color : z.color + '44'}`, opacity: z.enabled === false ? 0.45 : 1 }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: z.color, flexShrink: 0 }} />
                    <span style={{ color: z.enabled === false ? '#64748b' : '#e2e8f0', fontSize: '12px', flex: 1, cursor: 'default', textDecoration: z.enabled === false ? 'line-through' : 'none' }}>{z.name}</span>
                    <span style={{ color: '#475569', fontSize: '10px', flexShrink: 0 }}>{z.polygon.length} נק'</span>
                    <input
                      type="checkbox"
                      checked={z.enabled !== false}
                      title={z.enabled === false ? 'הפעל אזור' : 'השבת אזור (הסתר מבלי למחוק)'}
                      onChange={async (e) => {
                        const newEnabled = e.target.checked;
                        setZones(prev => prev.map(x => x.id === z.id ? { ...x, enabled: newEnabled } : x));
                        await fetch(`${API_URL}/map-zones/${z.id}/enabled`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: newEnabled }) });
                      }}
                      style={{ width: '14px', height: '14px', flexShrink: 0, cursor: 'pointer', accentColor: z.color }}
                    />
                    <button
                      title={tr('shared.edit')}
                      onClick={() => { setEditingZone(z); setDraftPoints([]); setAltRanges([]); loadAltRanges(z.id); }}
                      style={{ background: editingZone?.id === z.id ? '#1d4ed8' : '#334155', border: 'none', color: '#94a3b8', cursor: 'pointer', borderRadius: '4px', padding: '3px 6px', fontSize: '11px', flexShrink: 0 }}>
                      ✏️
                    </button>
                    <button
                      title={tr('shared.delete')}
                      onClick={(e) => { e.stopPropagation(); deleteZone(z.id); if (editingZone?.id === z.id) setEditingZone(null); }}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', borderRadius: '4px', padding: '3px 5px', fontSize: '13px', flexShrink: 0 }}>
                      🗑
                    </button>
                  </div>
                ))}
                {zones.length === 0 && <div style={{ color: '#334155', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>{tr('map.noZonesYet')}</div>}
                {localMapData?.parent_map_id && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`${API_URL}/maps/${mapId}/sync-zones-from-parent`, { method: 'POST' });
                        const data = await res.json();
                        if (res.ok) { await loadZones(); alert(`סונכרנו ${data.synced} אזורים ממפת המקור`); }
                        else alert(data.error || 'שגיאה בסנכרון');
                      } catch { alert('שגיאה בסנכרון'); }
                    }}
                    style={{ marginTop: '8px', width: '100%', padding: '6px', background: '#0c2a1a', color: '#4ade80', border: '1px solid #166534', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                  >{tr('map.syncZonesFromSource')}</button>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default MapZoneEditor;
