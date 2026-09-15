// המפה הצפה של נסיעות בביצוע - עמדת ניהול שדה תעופה.
//
// נפתחת מטאב "בביצוע" בחלון "ניהול נסיעות" ("פתח במפה צפה"), ואליה מוסיפים עוד
// נסיעות ("הוסף למפה פתוחה"). מציגה את המיקום שאפליקציית הנהג משדרת כל 5 שניות,
// **כל נסיעה בצבע משלה** (liveMapColor), ולבחירה - שובל הקליטות האחרונות.
//
// שתי מפות לבחירה:
//   - **מפת הבסיס** - מרונדרת כאן, מתמונת השדה ועוגן הנ"צ שלה.
//   - **Google** - בתוך iframe מאותו מקור (/live-map), כי ה-CSP של העמדה נעול
//     ל-Google בכוונה. ה-iframe אינו קורא API ואינו מקבל אסימון: העמדה שולחת לו
//     את מה שיצויר ב-postMessage. ראה LIVE_MAP_CSP.
//
// צבע הנסיעה אומר **איזו** נסיעה זו, ולא מה מצבה. המצב (אות אבד, סוטה, חסום)
// נכתב **בטקסט** ליד הרכב ובמקרא - אותו טקסט של מפת המגדל (detailText).
//
// חלון **צפייה ותפעול** (מסגרת תורכיז), נגרר בעט ובאצבע ובר-עגינה.

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import i18n from '../../i18n';
import { API_URL } from '../../config';
import { windowFrame } from '../../utils/windowFrame';
import { windowPalette, type ThemeMode } from '../../utils/windowPalette';
import { geoToImagePct, type MapGeoAnchor } from '../../utils/geo';
import { measureCssZoom } from '../../utils/mapPan';
import { suggestedVehicleIcon } from '../../utils/trips';
import { liveVehicleTone, type LiveTrip } from '../../utils/liveTrips';
import { LIVE_TRAIL_POINTS, fitLiveMap, liveMapColor, type PctPoint } from '../../utils/liveMap';
import useDragPosition from '../../hooks/useDragPosition';
import { useDockableWindow } from '../../hooks/useDockableWindow';
import { usePolling } from '../../hooks/usePollingRegistry';
import useLiveTrips, { LIVE_TRIPS_POLL_MS } from '../../hooks/useLiveTrips';
import { detailText } from './TripLiveVehicles';

type MapMode = 'base' | 'google';

interface TrailFix { lat: number; lng: number }

const ZOOM_MIN = 1;
const ZOOM_MAX = 12;
const ZOOM_STEP = 1.4;

export interface TripLiveMapWindowProps {
  airfieldId: number | null;
  themeMode: ThemeMode;
  /** תמונת מפת השדה. null = אין מפת בסיס, ורק Google זמינה */
  mapSrc: string | null;
  /** עוגן הנ"צ של המפה. בלעדיו אין דרך למקם רכב על התמונה */
  anchor: MapGeoAnchor | null;
  /** הנסיעות שבמפה, בסדר ההוספה - הסדר קובע את הצבע */
  tripIds: number[];
  /** הנסיעות שמוצג להן שובל היסטוריה */
  historyIds: number[];
  onToggleHistory: (tripId: number) => void;
  onRemove: (tripId: number) => void;
  onClose: () => void;
}

const tripName = (t: LiveTrip | undefined, id: number) =>
  (t && (t.vehicle_name || t.vehicle_type_name || t.permit_driver_name || t.driver_name)) || `#${id}`;

export const TripLiveMapWindow: React.FC<TripLiveMapWindowProps> = ({
  airfieldId, themeMode, mapSrc, anchor, tripIds, historyIds, onToggleHistory, onRemove, onClose,
}) => {
  const C = windowPalette(themeMode);
  const dir = i18n.dir();
  const winRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);
  const consumerId = useId();

  // ── הנתונים: מיקום חי (סקר משותף) + שובל לנסיעות שביקשו ──────────────────
  const live = useLiveTrips(airfieldId);
  const byId = useMemo(() => new Map(live.map(t => [t.id, t])), [live]);

  const [trails, setTrails] = useState<Record<number, TrailFix[]>>({});
  const loadTrails = async () => {
    const ids = historyIds;
    if (!ids.length) { setTrails(prev => (Object.keys(prev).length ? {} : prev)); return; }
    const entries = await Promise.all(ids.map(async id => {
      try {
        const r = await fetch(`${API_URL}/entry-permit-trips/${id}/gps?limit=${LIVE_TRAIL_POINTS}`);
        return [id, r.ok ? await r.json() : null] as const;
      } catch { return [id, null] as const; }
    }));
    setTrails(prev => {
      const next: Record<number, TrailFix[]> = {};
      // תקלת רשת משאירה את השובל האחרון ולא מוחקת אותו מהמפה
      for (const [id, rows] of entries) next[id] = Array.isArray(rows) ? rows : (prev[id] || []);
      return next;
    });
  };
  // usePolling שומר את הפונקציה ב-ref, ולכן תמיד רץ עם הנסיעות הנוכחיות
  usePolling(`live-map-trails-${consumerId}`, loadTrails, LIVE_TRIPS_POLL_MS);
  // שובל שהתבקש עכשיו מופיע מיד, ולא בסבב הבא בעוד עד 5 שניות
  const historyKey = historyIds.join(',');
  useEffect(() => { void loadTrails(); }, [historyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── בחירת המפה ────────────────────────────────────────────────────────────
  const [googleKey, setGoogleKey] = useState<string | null>(null);   // null = עוד לא נבדק
  const [googleError, setGoogleError] = useState<string>('');
  useEffect(() => {
    fetch(`${API_URL}/google-maps-key`).then(r => (r.ok ? r.json() : {})).then((d: { key?: string }) => setGoogleKey(d.key || ''))
      .catch(() => setGoogleKey(''));
  }, []);
  const baseAvailable = !!mapSrc && !!anchor;
  const googleAvailable = !!googleKey && !googleError;
  const [mode, setMode] = useState<MapMode>('base');
  // בלי מפת בסיס - Google, אם יש. "לא לתת לפקד להידלק בלי שקורה משהו"
  useEffect(() => {
    if (!baseAvailable && googleAvailable && mode === 'base') setMode('google');
    if (mode === 'google' && !googleAvailable && googleKey !== null) setMode('base');
  }, [baseAvailable, googleAvailable, googleKey, mode]);

  const [fit, setFit] = useState(true);

  // ── מפת הבסיס: זום, מרכז, גרירה ─────────────────────────────────────────
  const viewRef = useRef<HTMLDivElement | null>(null);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState(0.75);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<PctPoint>({ x: 50, y: 50 });
  useEffect(() => {
    const el = viewRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setViewSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setViewSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [mode]);

  const pctOf = (lat: number, lng: number): PctPoint | null => {
    if (!anchor) return null;
    const p = geoToImagePct(lat, lng, anchor);
    return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  };

  // בזום 1 כל המפה בחלון (contain) - הפקח רואה את השדה כולו, ומתקרב לרכבים
  const baseW = viewSize.w && viewSize.h ? Math.min(viewSize.w, viewSize.h / aspect) : 0;
  const baseH = baseW * aspect;

  // "התאם לרכבים": כל רכב והשובל שלו בתוך החלון
  const fitPoints = useMemo(() => {
    const pts: PctPoint[] = [];
    for (const id of tripIds) {
      const t = byId.get(id);
      const p = t?.position ? pctOf(t.position.lat, t.position.lng) : null;
      if (p) pts.push(p);
      for (const f of historyIds.includes(id) ? trails[id] || [] : []) {
        const q = pctOf(f.lat, f.lng);
        if (q) pts.push(q);
      }
    }
    return pts;
  }, [tripIds, byId, trails, historyIds, anchor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fit || mode !== 'base') return;
    const f = fitLiveMap(fitPoints, baseW, baseH, viewSize.w, viewSize.h, { min: ZOOM_MIN, max: ZOOM_MAX });
    if (f) { setCenter(f.center); setZoom(f.zoom); }
  }, [fit, mode, fitPoints, baseW, baseH, viewSize.w, viewSize.h]);

  const sw = baseW * zoom, sh = baseH * zoom;
  const clampAxis = (view: number, size: number, want: number) =>
    size <= view ? (view - size) / 2 : Math.min(0, Math.max(view - size, want));
  const tx = clampAxis(viewSize.w, sw, viewSize.w / 2 - (center.x / 100) * sw);
  const ty = clampAxis(viewSize.h, sh, viewSize.h / 2 - (center.y / 100) * sh);

  // זום ידני מכבה את "התאם לרכבים" - אחרת העדכון הבא (כל 5 ש') מחזיר את הזום
  // שהפקח זה עתה שינה
  const zoomBy = (f: number) => { setFit(false); setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * f))); };

  // גרירה ב-Pointer Events (CLAUDE.md §גרירה): touch-action none, setPointerCapture,
  // וחלוקה בסקייל המסך - clientX בפיקסלים אמיתיים, והפריסה ביחידות המוגדלות
  const panRef = useRef<{ id: number; x: number; y: number; scale: number } | null>(null);
  const onMapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, scale: measureCssZoom(e.currentTarget) };
  };
  const onMapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = panRef.current;
    if (!p || p.id !== e.pointerId || !sw || !sh) return;
    const dx = (e.clientX - p.x) / p.scale, dy = (e.clientY - p.y) / p.scale;
    if (Math.hypot(dx, dy) < 2) return;
    // גרירה מכבה את ההתאמה - אחרת המפה קופצת חזרה לרכבים מתחת לאצבע
    setFit(false);
    setCenter(c => ({ x: c.x - (dx / sw) * 100, y: c.y - (dy / sh) * 100 }));
    panRef.current = { ...p, x: e.clientX, y: e.clientY };
  };
  const onMapPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.id === e.pointerId) panRef.current = null;
  };

  // ── Google: שליחת המצב ל-iframe ─────────────────────────────────────────
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const type = e.data?.type;
      if (type === 'live-map:ready') setFrameReady(true);
      else if (type === 'live-map:user-moved') setFit(false);
      else if (type === 'live-map:error') {
        setGoogleError(e.data.reason === 'auth_failed' ? tr('trips.liveMapGoogleBadKey')
          : e.data.reason === 'no_key' ? tr('trips.liveMapGoogleNoKey') : tr('trips.liveMapGoogleLoadFailed'));
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  useEffect(() => { if (mode !== 'google') setFrameReady(false); }, [mode]);
  useEffect(() => {
    if (mode !== 'google' || !frameReady || !googleKey) return;
    frameRef.current?.contentWindow?.postMessage({ type: 'live-map:init', key: googleKey }, window.location.origin);
  }, [mode, frameReady, googleKey]);
  useEffect(() => {
    if (mode !== 'google' || !frameReady) return;
    const trips = tripIds.map(id => {
      const t = byId.get(id);
      return {
        id, color: liveMapColor(tripIds, id),
        icon: t?.icon || suggestedVehicleIcon(t?.vehicle_type_name),
        label: tripName(t, id),
        lat: t?.position?.lat ?? null, lng: t?.position?.lng ?? null,
        stale: !!t?.stale,
        trail: historyIds.includes(id) ? trails[id] || [] : null,
      };
    });
    frameRef.current?.contentWindow?.postMessage({ type: 'live-map:state', trips, fit }, window.location.origin);
  }, [mode, frameReady, tripIds, historyIds, byId, trails, fit]);

  // ── החלון ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dock = useDockableWindow('tripLiveMap', tr('trips.liveMapTitle'), {
    setFloatingPos: (x, y) => drag.moveTo(x, y),
    floatingPos: () => drag.pos || { x: 120, y: 80 },
  });

  const chip = (on: boolean, disabled = false): React.CSSProperties => ({
    height: 26, padding: '0 10px', fontSize: 11, borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer',
    border: `1px solid ${on ? '#22d3ee' : C.border}`, background: on ? '#22d3ee26' : 'transparent',
    color: disabled ? C.muted : C.text, opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap',
  });
  const ctrlBtn: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`, background: `${C.panel}e6`,
    color: C.text, fontSize: 18, fontWeight: 'bold', cursor: 'pointer', lineHeight: 1,
  };

  const legend = tripIds.map(id => {
    const t = byId.get(id);
    const color = liveMapColor(tripIds, id);
    const ended = !t;
    const tone = t ? liveVehicleTone(t) : null;
    const status = ended ? tr('trips.liveMapEnded') : detailText(t!, tone!, !!anchor || mode === 'google');
    const hist = historyIds.includes(id);
    return (
      <div key={id} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '3px 7px', borderRadius: 8,
        border: `1px solid ${color}`, background: `${color}1f`, opacity: ended ? 0.6 : 1, fontSize: 11,
      }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span>{t?.icon || suggestedVehicleIcon(t?.vehicle_type_name)}</span>
        <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{tripName(t, id)}</span>
        {status && <span style={{ color: C.muted, whiteSpace: 'nowrap' }}>{status}</span>}
        <button
          onClick={() => onToggleHistory(id)}
          disabled={ended}
          aria-pressed={hist}
          title={tr('trips.liveMapHistoryHint')}
          style={{ ...chip(hist, ended), height: 22, padding: '0 7px', fontSize: 10 }}
        >🕘 {hist ? tr('trips.liveMapHideHistory') : tr('trips.liveMapShowHistory')}</button>
        <button
          onClick={() => onRemove(id)}
          title={tr('trips.liveMapRemove')}
          style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 13, padding: 0 }}
        >✕</button>
      </div>
    );
  });

  const baseMap = (
    <div
      ref={viewRef}
      onPointerDown={onMapPointerDown}
      onPointerMove={onMapPointerMove}
      onPointerUp={onMapPointerUp}
      onPointerCancel={onMapPointerUp}
      onWheel={e => zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#020617', touchAction: 'none', userSelect: 'none', cursor: 'grab' }}
    >
      {mapSrc && (
        <div style={{ position: 'absolute', left: tx, top: ty, width: sw, height: sh }}>
          <img
            src={mapSrc}
            alt=""
            draggable={false}
            onLoad={e => { const i = e.currentTarget; if (i.naturalWidth) setAspect(i.naturalHeight / i.naturalWidth); }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          />
          {/* הנתיב שאושר ושובל ההיסטוריה - באחוזים, ולכן נעים עם המפה */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {tripIds.map(id => {
              const t = byId.get(id);
              const color = liveMapColor(tripIds, id);
              const route = (t?.has_route ? t.route : [])
                .map(w => (Number.isFinite(w.xPct) && Number.isFinite(w.yPct) ? { x: w.xPct as number, y: w.yPct as number } : pctOf(w.lat, w.lon)))
                .filter((p): p is PctPoint => !!p);
              return route.length >= 2 ? (
                <polyline key={`r${id}`} points={route.map(p => `${p.x},${p.y}`).join(' ')} fill="none"
                  stroke={color} strokeOpacity={0.45} strokeWidth={3} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
              ) : null;
            })}
          </svg>
          {tripIds.map(id => {
            if (!historyIds.includes(id)) return null;
            const color = liveMapColor(tripIds, id);
            const fixes = trails[id] || [];
            return fixes.map((f, i) => {
              const p = pctOf(f.lat, f.lng);
              if (!p) return null;
              // דוהה מהישנה לחדשה - הכיוון נקרא בלי חצים
              return (
                <span key={`t${id}-${i}`} style={{
                  position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: 7, height: 7, borderRadius: '50%',
                  transform: 'translate(-50%,-50%)', background: color, opacity: 0.25 + 0.7 * ((i + 1) / fixes.length),
                  pointerEvents: 'none',
                }} />
              );
            });
          })}
          {tripIds.map(id => {
            const t = byId.get(id);
            const p = t?.position ? pctOf(t.position.lat, t.position.lng) : null;
            if (!t || !p) return null;
            const color = liveMapColor(tripIds, id);
            const tone = liveVehicleTone(t);
            const status = detailText(t, tone, true);
            return (
              <div key={`v${id}`} style={{
                position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)',
                display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none', zIndex: 5,
              }}>
                <span style={{
                  width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, background: t.stale ? '#64748b' : color,
                  // אות אבד: אפור, עם מסגרת בצבע הנסיעה - כך עדיין ברור איזו נסיעה זו
                  border: `3px solid ${t.stale ? color : '#fff'}`, boxShadow: '0 2px 8px #000a',
                }}>{t.icon || suggestedVehicleIcon(t.vehicle_type_name)}</span>
                <span style={{
                  fontSize: 10, fontWeight: 'bold', color: '#f1f5f9', background: '#0f172ae0', padding: '1px 5px',
                  borderRadius: 5, border: `1px solid ${color}`, whiteSpace: 'nowrap',
                }}>{tripName(t, id)}{status ? ` · ${status}` : ''}</span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ position: 'absolute', insetInlineStart: 8, bottom: 8, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10 }}>
        <button style={ctrlBtn} onClick={() => zoomBy(ZOOM_STEP)} aria-label={tr('trips.liveMapZoomIn')} title={tr('trips.liveMapZoomIn')}>＋</button>
        <button style={ctrlBtn} onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label={tr('trips.liveMapZoomOut')} title={tr('trips.liveMapZoomOut')}>－</button>
      </div>
    </div>
  );

  const win = (
    <div
      ref={winRef}
      style={{
        position: 'fixed', zIndex: 8650,
        ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { left: 120, top: 80 }),
        ...(dock.docked ? {} : { width: 'min(760px, calc(70vw / var(--s, 1)))', height: 'min(600px, calc(75vh / var(--s, 1)))' }),
        display: 'flex', flexDirection: 'column',
        background: C.panel, color: C.text, direction: dir,
        boxShadow: '0 10px 34px rgba(0,0,0,0.5)',
        // חלון **צפייה ותפעול** - מסגרת תורכיז (CLAUDE.md §מסגרת חלון)
        ...windowFrame('view', themeMode, 10),
        overflow: 'hidden',
        ...dock.rootStyle,
      }}
    >
      <div
        {...drag.handleProps}
        onPointerDown={e => { dock.onHeaderPointerDown(e); drag.handleProps.onPointerDown(e); }}
        style={{
          ...drag.handleProps.style, background: C.head, borderBottom: `1px solid ${C.border}`,
          padding: '6px 9px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 15 }}>🛰</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 'bold' }}>
          {tr('trips.liveMapTitle')}
          <span style={{ color: C.muted, fontWeight: 'normal', marginInlineStart: 6 }}>
            {tr('trips.liveMapCount', { count: tripIds.length })}
          </span>
        </span>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onClose}
          title={tr('shared.close')}
          style={{ background: 'none', border: 'none', color: C.text, fontSize: 15, cursor: 'pointer', lineHeight: 1, padding: '0 6px' }}
        >✕</button>
      </div>

      <div style={{ padding: '6px 8px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${C.line}` }}>
        <button
          onClick={() => baseAvailable && setMode('base')}
          disabled={!baseAvailable}
          title={baseAvailable ? '' : tr('trips.liveMapBaseUnavailable')}
          style={chip(mode === 'base', !baseAvailable)}
        >🗺 {tr('trips.liveMapBase')}</button>
        <button
          onClick={() => googleAvailable && setMode('google')}
          disabled={!googleAvailable}
          title={googleAvailable ? '' : (googleError || (googleKey === '' ? tr('trips.liveMapGoogleNoKey') : ''))}
          style={chip(mode === 'google', !googleAvailable)}
        >🌍 Google</button>
        <button onClick={() => setFit(true)} aria-pressed={fit} title={tr('trips.liveMapFitHint')} style={chip(fit)}>
          🎯 {tr('trips.liveMapFit')}
        </button>
        {/* הסיבה שמתג כבוי - לא רק tooltip, שבמגע אינו נראה בכלל */}
        {!googleAvailable && googleKey !== null && (
          <span style={{ fontSize: 10, color: C.muted }}>{googleError || tr('trips.liveMapGoogleNoKey')}</span>
        )}
      </div>

      <div style={{ padding: '6px 8px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: `1px solid ${C.line}`, maxHeight: 96, overflowY: 'auto' }}>
        {legend}
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {mode === 'google' && googleAvailable ? (
          <iframe
            ref={frameRef}
            src="/live-map"
            title={tr('trips.liveMapTitle')}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          />
        ) : baseAvailable ? baseMap : (
          <div style={{ padding: 24, fontSize: 12, color: C.muted, textAlign: 'center' }}>{tr('trips.liveMapNoMap')}</div>
        )}
      </div>
    </div>
  );

  return dock.render(win);
};

export default TripLiveMapWindow;
