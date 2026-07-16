import { tr } from '../../i18n/tr';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useDragControls } from 'framer-motion';
import { createPortal } from 'react-dom';
import { API_URL } from '../../config';
import { normalizeAlt, getFormationDisplayName, computeBlockDeviation } from '../../utils/strips';
import { clampMenuPos } from '../../utils/queryBuilder';
import { parseNoteValue } from '../../utils/notes';
import { VKTrigger } from '../../VirtualKeyboard';
import HandwritingOverlay from '../shared/HandwritingOverlay';
import ContextMenu from '../shared/ContextMenu';

// Module-level singleton: only one strip details panel open at a time
let _activeStripDetailsCloser: (() => void) | null = null;

const Strip = ({ s, onMove, onUpdate, neighbors, onTransfer, onProvTransfer, onToggleAirborne, onUpdateNotes, onUpdateDetails, zoom = 1, pan = null, serials = [], serialSelections = [], onSerialSelect, onSerialDismiss, onSerialRemove, allBlockSpaces = [], allBlocks = [], allBlockTables = [], allWorkstationPresets = [], activeBlockTableId = null, mapConflictIds = null, viewerPresetId = null, lightMode = false }: any) => {
  const controls = useDragControls();
  const [edit, setEdit] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const bodyTouchRef = useRef<{ startX: number; startY: number; cleanup: () => void } | null>(null);
  const bodyDragReadyRef = useRef(false);
  const [bodyDragReady, setBodyDragReady] = useState(false);
  const [contextMenu, setContextMenu] = useState<{x: number; y: number} | null>(null);
  const [serialRowMenu, setSerialRowMenu] = useState<{x: number; y: number; station: string; latestSerialId: number; specificSerialId?: number} | null>(null);
  const [expandedStationHistory, setExpandedStationHistory] = useState<string | null>(null);
  const [serialViewPopup, setSerialViewPopup] = useState<{x: number; y: number; station: string} | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState(s.notes || '');
  const [showDetails, setShowDetails] = useState(false);
  const [detailsPos, setDetailsPos] = useState<{left: number; top: number}>({ left: 0, top: 0 });
  const [detailsData, setDetailsData] = useState({
    weapons: (s.weapons || []) as {type: string; quantity: string}[],
    targets: (s.targets || []) as {name: string; aim_point: string}[],
    systems: (s.systems || []) as {name: string}[],
    shkadia: s.shkadia || ''
  });
  const [localTakeoffTime, setLocalTakeoffTime] = useState<string>(() => {
    if (!s.takeoff_time) return '';
    const d = new Date(s.takeoff_time);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [localErka, setLocalErka] = useState(s.erka || '');
  const [localKoteret, setLocalKoteret] = useState(s.koteret || '');
  const [localMivtza, setLocalMivtza] = useState(s.mivtza || '');
  const [localTzevetShilta, setLocalTzevetShilta] = useState(s.tzevet_shilta || '');
  const [localTaShilta, setLocalTaShilta] = useState(s.ta_shilta || '');
  const [localBlockSpaceId, setLocalBlockSpaceId] = useState(s.block_space_id ? String(s.block_space_id) : '');
  const blockSpaceSavingRef = React.useRef(false);
  const [blockDeviation, setBlockDeviation] = useState(s.block_deviation || false);

  useEffect(() => {
    if (!blockSpaceSavingRef.current) {
      setLocalBlockSpaceId(s.block_space_id ? String(s.block_space_id) : '');
    }
  }, [s.block_space_id]);

  useEffect(() => {
    setDetailsData({
      weapons: s.weapons || [],
      targets: s.targets || [],
      systems: s.systems || [],
      shkadia: s.shkadia || ''
    });
  }, [s.weapons, s.targets, s.systems, s.shkadia]);

  useEffect(() => {
    if (s.takeoff_time) {
      const d = new Date(s.takeoff_time);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => n.toString().padStart(2, '0');
        setLocalTakeoffTime(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
      }
    }
  }, [s.takeoff_time]);

  const saveDetails = (updated: typeof detailsData) => {
    setDetailsData(updated);
    if (onUpdateDetails) onUpdateDetails(s.id, updated);
  };

  const hasDetails = (s.weapons && s.weapons.length > 0) || (s.targets && s.targets.length > 0) || (s.systems && s.systems.length > 0) || s.shkadia;

  // Block deviation detection (uses shared helper)
  const isBlockDeviation = React.useMemo(() => computeBlockDeviation(s, allBlocks, allBlockTables, activeBlockTableId, viewerPresetId),
    [s.alt, s.workstation_preset_id, allBlocks, activeBlockTableId]);

  // Altitude conflict with another map strip
  const isAltConflict = mapConflictIds != null && mapConflictIds.has(String(s.id));

  // Sync local blockDeviation state when prop changes (e.g. after polling)
  useEffect(() => {
    setBlockDeviation(s.block_deviation || false);
  }, [s.block_deviation]);

  // Auto-clear acknowledged deviation when altitude is fixed (no more deviation).
  // Guard: only runs when blocks are actually loaded — prevents premature clear during page refresh
  // when allBlocks hasn't populated yet and computeBlockDeviation temporarily returns false.
  useEffect(() => {
    if (!isBlockDeviation && blockDeviation && (allBlocks.length > 0 || allBlockTables.length > 0)) {
      setBlockDeviation(false);
      fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_deviation: false }) }).catch(() => {});
    }
  }, [isBlockDeviation, blockDeviation, allBlocks.length, allBlockTables.length]);

  // Sync tempNotes when notes prop changes
  useEffect(() => {
    setTempNotes(s.notes || '');
  }, [s.notes]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleEditClick = () => {
    if (altRef.current) {
      setAnchorRect(altRef.current.getBoundingClientRect());
    }
    setEdit(true);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Do NOT call setPointerCapture: it redirects elementsFromPoint inside CSS-transformed
    // containers (contain:paint + scale) and can cause pointercancel on re-render.
    // Instead, attach listeners immediately on window — no race with useEffect.
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    startPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const pointerStartX = e.clientX;
    const pointerStartY = e.clientY;
    let dragActivated = false;

    // Use getBoundingClientRect for both markers and neighbor panels — reliable through CSS transforms.
    // elementsFromPoint can be unreliable inside contain:paint contexts and CSS-scaled containers.
    const findMarker = (cx: number, cy: number): Element | null => {
      for (const el of Array.from(document.querySelectorAll('.marker-drop-zone[data-marker-sector]'))) {
        const r = el.getBoundingClientRect();
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return el;
      }
      return null;
    };
    const findNeighborPanel = (cx: number, cy: number): Element | null => {
      for (const el of Array.from(document.querySelectorAll('.neighbor-drop-zone[data-sector-id]'))) {
        const r = el.getBoundingClientRect();
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return el;
      }
      return null;
    };
    // נקודת העברה זמנית (בפאנל או על המפה) — העברת עמדה-לעמדה
    const findProvZone = (cx: number, cy: number): Element | null => {
      for (const el of Array.from(document.querySelectorAll('.prov-drop-zone[data-prov-id]'))) {
        const r = el.getBoundingClientRect();
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return el;
      }
      return null;
    };
    const clearHighlights = () => {
      document.querySelectorAll('.marker-drop-zone.strip-drag-active, .neighbor-drop-zone.strip-drag-active, .prov-drop-zone.strip-drag-active').forEach(el => el.classList.remove('strip-drag-active'));
    };

    // Helper: convert viewport coords to map-container coords (accounts for zoom + pan with center origin)
    // pan is passed as prop: { x, y } translation applied to the map container before scale.
    const viewportToMapCoords = (vx: number, vy: number, mapRect: DOMRect): { x: number; y: number } => {
      const z = zoom || 1;
      const px = pan?.x ?? 0;
      const py = pan?.y ?? 0;
      const cw = mapRect.width;
      const ch = mapRect.height;
      return {
        x: (vx - mapRect.left - cw / 2 - px) / z + cw / 2,
        y: (vy - mapRect.top  - ch / 2 - py) / z + ch / 2,
      };
    };

    // Track last pointer position — used in handleDragCancel fallback (tablet pointercancel)
    let lastCx = e.clientX;
    let lastCy = e.clientY;

    const handleDragMove = (ev: PointerEvent) => {
      lastCx = ev.clientX;
      lastCy = ev.clientY;
      if (!dragActivated) {
        if (Math.abs(ev.clientX - pointerStartX) < 5 && Math.abs(ev.clientY - pointerStartY) < 5) return;
        dragActivated = true;
        setIsDragging(true);
      }
      setDragPos({ x: ev.clientX - startPosRef.current.x, y: ev.clientY - startPosRef.current.y });
      clearHighlights();
      const m = findMarker(ev.clientX, ev.clientY);
      if (m) { m.classList.add('strip-drag-active'); return; }
      const pv = findProvZone(ev.clientX, ev.clientY);
      if (pv) { pv.classList.add('strip-drag-active'); return; }
      const n = findNeighborPanel(ev.clientX, ev.clientY);
      if (n) n.classList.add('strip-drag-active');
    };

    const performDrop = (cx: number, cy: number) => {
      const mapArea = document.getElementById('map-area');
      const sidebar = document.getElementById('sidebar-area');

      // 0. נקודת העברה זמנית — עדיפות (בפאנל או על המפה) → העברת עמדה-לעמדה
      const topProv = findProvZone(cx, cy);
      if (topProv) {
        const provId = Number(topProv.getAttribute('data-prov-id'));
        const otherPreset = Number(topProv.getAttribute('data-prov-preset'));
        if (provId && otherPreset && onProvTransfer) { onProvTransfer(s.id, provId, otherPreset); return; }
      }

      // 1. נקודת העברה (neighbor panel) — getBoundingClientRect, אמין דרך כל CSS transforms
      const topNeighbor = findNeighborPanel(cx, cy);
      if (topNeighbor) {
        const sectorId = parseInt(topNeighbor.getAttribute('data-sector-id') || '0');
        if (sectorId && onTransfer) { onTransfer(s.id, sectorId); return; }
      }

      // 2. סמן מפה — getBoundingClientRect אמין דרך CSS transforms
      const topMarker = findMarker(cx, cy);
      if (topMarker && mapArea) {
        const sectorId = parseInt(topMarker.getAttribute('data-marker-sector') || '0');
        const subLabel = topMarker.getAttribute('data-marker-sublabel') || undefined;
        if (sectorId && onTransfer) {
          const mapRect = mapArea.getBoundingClientRect();
          const mc = viewportToMapCoords(cx, cy, mapRect);
          onTransfer(s.id, sectorId, mc.x, mc.y, subLabel || undefined);
          return;
        }
      }

      if (mapArea) {
        const mapRect = mapArea.getBoundingClientRect();

        // 3. החזרה לרשימה (drop על סרגל הצד)
        if (sidebar) {
          const sr = sidebar.getBoundingClientRect();
          if (cx >= sr.left && cx <= sr.right && cy >= sr.top && cy <= sr.bottom) {
            onMove(s.id, 0, 0, false);
            return;
          }
        }

        // 4. מיקום על המפה — ממיר לקואורדינטות map-container (מתחשב בזום/פאן)
        if (cx >= mapRect.left && cx <= mapRect.right &&
            cy >= mapRect.top  && cy <= mapRect.bottom) {
          // stripLeft/Top: viewport position of the strip's top-left corner at release
          const stripLeft = cx - startPosRef.current.x;
          const stripTop  = cy - startPosRef.current.y;
          const mcStrip = viewportToMapCoords(stripLeft, stripTop, mapRect);
          onMove(s.id, mcStrip.x, mcStrip.y, true);
        }
      }
    };

    const handleDragUp = (ev: PointerEvent) => {
      clearHighlights();
      setIsDragging(false);
      window.removeEventListener('pointermove', handleDragMove);
      window.removeEventListener('pointerup', handleDragUp);
      window.removeEventListener('pointercancel', handleDragCancel);
      if (dragActivated) performDrop(ev.clientX, ev.clientY);
    };

    const handleDragCancel = () => {
      clearHighlights();
      setIsDragging(false);
      window.removeEventListener('pointermove', handleDragMove);
      window.removeEventListener('pointerup', handleDragUp);
      window.removeEventListener('pointercancel', handleDragCancel);
      if (!dragActivated) return;
      // Tablet fallback: attempt transfer at last known position (prov / neighbor panel / marker only).
      // Does NOT reposition on map to avoid accidental moves on system-cancelled gestures.
      const topProvC = findProvZone(lastCx, lastCy);
      if (topProvC) {
        const provId = Number(topProvC.getAttribute('data-prov-id'));
        const otherPreset = Number(topProvC.getAttribute('data-prov-preset'));
        if (provId && otherPreset && onProvTransfer) { onProvTransfer(s.id, provId, otherPreset); return; }
      }
      const topNeighbor = findNeighborPanel(lastCx, lastCy);
      if (topNeighbor) {
        const sectorId = parseInt(topNeighbor.getAttribute('data-sector-id') || '0');
        if (sectorId && onTransfer) { onTransfer(s.id, sectorId); return; }
      }
      const topMarker = findMarker(lastCx, lastCy);
      const mapArea = document.getElementById('map-area');
      if (topMarker && mapArea) {
        const sectorId = parseInt(topMarker.getAttribute('data-marker-sector') || '0');
        const subLabel = topMarker.getAttribute('data-marker-sublabel') || undefined;
        if (sectorId && onTransfer) {
          const mapRect = mapArea.getBoundingClientRect();
          const mc = viewportToMapCoords(lastCx, lastCy, mapRect);
          onTransfer(s.id, sectorId, mc.x, mc.y, subLabel || undefined);
        }
      }
    };

    window.addEventListener('pointermove', handleDragMove);
    window.addEventListener('pointerup', handleDragUp);
    window.addEventListener('pointercancel', handleDragCancel);
  };

  const handleBodyPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    if (!s.onMap) return;
    if (isDragging) return;
    if ((e.target as HTMLElement).closest('button, input, textarea, select')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    bodyDragReadyRef.current = false;

    const longPressTimer = setTimeout(() => {
      if (!bodyTouchRef.current) return;
      bodyDragReadyRef.current = true;
      setBodyDragReady(true);
      if (navigator.vibrate) navigator.vibrate(60);
    }, 2000);

    const onMove = (me: PointerEvent) => {
      if (!bodyTouchRef.current) return;
      if (bodyDragReadyRef.current) {
        cleanup();
        handlePointerDown({ clientX: startX, clientY: startY, preventDefault: () => {}, stopPropagation: () => {} } as any);
        return;
      }
      if (Math.abs(me.clientX - startX) > 10 || Math.abs(me.clientY - startY) > 10) {
        cleanup();
      }
    };
    const cleanup = () => {
      clearTimeout(longPressTimer);
      bodyDragReadyRef.current = false;
      setBodyDragReady(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (bodyTouchRef.current) bodyTouchRef.current = null;
    };
    const onUp = cleanup;
    bodyTouchRef.current = { startX, startY, cleanup };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  useEffect(() => {
    return () => {
      document.querySelectorAll('.marker-drop-zone.strip-drag-active, .neighbor-drop-zone.strip-drag-active').forEach(el => el.classList.remove('strip-drag-active'));
    };
  }, []);

  // רכיב הפ"מ הבסיסי
  const stripContent = (style: React.CSSProperties) => (
    <div data-strip-id={s.id} ref={!isDragging ? containerRef : undefined} className={`bt-strip${isBlockDeviation && !blockDeviation ? ' block-deviation-flash' : ''}${isAltConflict ? ' alt-conflict-flash' : ''}`} style={{ ...style, outline: bodyDragReady ? '3px solid #22c55e' : undefined, transition: 'outline 0.15s' }} onContextMenu={handleContextMenu} onPointerDown={s.onMap ? handleBodyPointerDown : undefined}>
      <div style={{ width: 22, background: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0', userSelect: 'none', touchAction: 'none', WebkitUserSelect: 'none', flexShrink: 0 }}>
        <div
          onPointerDown={e => {
            e.preventDefault();
            e.stopPropagation();
            handlePointerDown(e);
          }}
          title={tr('strips.dragToMove')}
          style={{ cursor: 'grab', color: 'white', fontSize: '13px', lineHeight: 1, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '2px', width: '100%' }}
        >⋮</div>
        <button
          onClick={(e) => { e.stopPropagation(); if (showDetails) { _activeStripDetailsCloser = null; setShowDetails(false); } else { if (_activeStripDetailsCloser) _activeStripDetailsCloser(); const rect = containerRef.current?.getBoundingClientRect(); if (rect) { const pw=230,ph=420; let left=rect.right+8; if(left+pw>window.innerWidth-8) left=rect.left-pw-8; if(left<8) left=8; let top=rect.top; if(top+ph>window.innerHeight-8) top=window.innerHeight-ph-8; if(top<8) top=8; setDetailsPos({left,top}); } _activeStripDetailsCloser=()=>setShowDetails(false); setShowDetails(true); } }}
          title={showDetails ? 'סגור פרטים' : 'פתח פרטים'}
          style={{ background: 'transparent', border: 'none', color: hasDetails ? '#60a5fa' : '#94a3b8', fontSize: '9px', cursor: 'pointer', padding: '1px 0', lineHeight: 1 }}
        >{showDetails ? '▴' : '▾'}</button>
      </div>
      <div onDoubleClick={(e) => { e.stopPropagation(); if (showDetails) { _activeStripDetailsCloser = null; setShowDetails(false); } else { if (_activeStripDetailsCloser) _activeStripDetailsCloser(); const rect = containerRef.current?.getBoundingClientRect(); if (rect) { const pw=230,ph=420; let left=rect.right+8; if(left+pw>window.innerWidth-8) left=rect.left-pw-8; if(left<8) left=8; let top=rect.top; if(top+ph>window.innerHeight-8) top=window.innerHeight-ph-8; if(top<8) top=8; setDetailsPos({left,top}); } _activeStripDetailsCloser=()=>setShowDetails(false); setShowDetails(true); } }} style={{ padding: '2px 4px', flex: 1, direction: 'rtl', textAlign: 'right', minWidth: 0, overflowX: 'hidden' }}>
        {/* שורה 1: או"ק + טייסת + משימה */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'nowrap', overflow: 'hidden' }}>
          <div style={{
            fontWeight: 'bold',
            fontSize: '11px',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1,
            ...(s.airborne ? { background: '#1d4ed8', color: 'white', border: '1px solid #3b82f6', borderRadius: '3px', padding: '0 3px' } : {})
          }}>{getFormationDisplayName(s)}{s.numberOfFormation && !s.aircraft_indices ? ` / ${s.numberOfFormation}` : ''}{s.aircraft_indices ? <span style={{ fontSize: '8px', color: '#fb923c', fontWeight: 'normal', marginRight: '3px' }}>{tr('strips.partial')}</span> : null}</div>
          {(s.sq || s.squadron) && <div style={{ fontSize: '8px', color: '#7c3aed', fontWeight: 'bold', flexShrink: 0 }}>{s.sq || s.squadron}</div>}
          {s.task && <div style={{ fontSize: '9px', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>{s.task}</div>}
        </div>
        {/* שורה 2: גובה + הערה */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
          <div ref={altRef} onClick={handleEditClick}
            style={{ fontSize: '11px', fontWeight: 'bold', color: (isBlockDeviation || blockDeviation) ? '#f97316' : isAltConflict ? '#ef4444' : '#374151', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {s.alt ? `גובה: ${normalizeAlt(s.alt)}` : ''}
          </div>
          {isAltConflict && (
            <span title={tr('strips.altitudeConflictWithAnother')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', borderRadius: '50%', background: '#ef4444', color: 'white', fontSize: '10px', fontWeight: 'bold', flexShrink: 0, lineHeight: 1, userSelect: 'none' }}>!</span>
          )}
          {isBlockDeviation && !blockDeviation && (
            <span
              onClick={async (e) => { e.stopPropagation(); setBlockDeviation(true); try { await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_deviation: true }) }); } catch {} }}
              title={tr('strips.approveBlockDeviation')}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', borderRadius: '50%', background: '#f97316', color: 'white', fontSize: '10px', fontWeight: 'bold', flexShrink: 0, cursor: 'pointer', lineHeight: 1, userSelect: 'none' }}
            >!</span>
          )}
          {blockDeviation && (
            <span
              onClick={async (e) => { e.stopPropagation(); setBlockDeviation(false); try { await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_deviation: false }) }); } catch {} }}
              title={tr('strips.deviationApprovedClickTo')}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', borderRadius: '50%', background: '#22c55e', color: 'white', fontSize: '10px', fontWeight: 'bold', flexShrink: 0, cursor: 'pointer', lineHeight: 1, userSelect: 'none' }}
            >!</span>
          )}
          {!editingNotes && s.notes && (() => { const np = parseNoteValue(s.notes || ''); return (
            <div onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }} style={{ fontSize: '8px', color: '#64748b', cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tr('shared.clickToEdit')}>
              {np.text && <span>📝 {np.text}</span>}
              {np.hw && <img src={np.hw} alt={tr('shared.handwriting')} style={{ maxHeight: '14px', borderRadius: '2px', verticalAlign: 'middle' }} />}
            </div>
          ); })()}
          {!editingNotes && !s.notes && onUpdateNotes && (
            <button onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '8px', cursor: 'pointer', flexShrink: 0, padding: 0 }}>{tr('strips.note')}</button>
          )}
        </div>
        {/* עריכת הערה — נפתח בלחיצה מהשורה השנייה */}
        {editingNotes && (
          <div onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '2px' }}>
              <textarea
                value={tempNotes}
                onChange={(e) => setTempNotes(e.target.value)}
                style={{ flex: 1, padding: '2px', border: '1px solid #cbd5e1', borderRadius: '2px', fontSize: '8px', resize: 'none', boxSizing: 'border-box' }}
                rows={2}
                autoFocus
              />
              <VKTrigger value={tempNotes} onChange={v => setTempNotes(v)} mode="full" label="הערה" size={14} />
            </div>
            <div style={{ display: 'flex', gap: '2px', marginTop: '2px' }}>
              <button
                onClick={() => { if (onUpdateNotes) onUpdateNotes(s.id, tempNotes); setEditingNotes(false); }}
                style={{ flex: 1, padding: '1px', background: '#10b981', color: 'white', border: 'none', borderRadius: '2px', fontSize: '8px', cursor: 'pointer' }}
              >{tr('shared.save')}</button>
              <button
                onClick={() => { setTempNotes(s.notes || ''); setEditingNotes(false); }}
                style={{ flex: 1, padding: '1px', background: '#64748b', color: 'white', border: 'none', borderRadius: '2px', fontSize: '8px', cursor: 'pointer' }}
              >{tr('shared.cancel')}</button>
            </div>
          </div>
        )}

        {/* Expandable Details Panel — floating portal */}
        {showDetails && createPortal(
          <>
            <div onClick={() => { _activeStripDetailsCloser = null; setShowDetails(false); }} style={{ position: 'fixed', inset: 0, zIndex: 9990 }} />
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', left: detailsPos.left, top: detailsPos.top, zIndex: 9991, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 8px 28px rgba(0,0,0,0.28)', width: '230px', maxHeight: '80vh', overflowY: 'auto', direction: 'rtl' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid #e2e8f0', background: '#dde5f0', borderRadius: '6px 6px 0 0', position: 'sticky', top: 0, zIndex: 1 }}>
                <span style={{ fontWeight: 'bold', fontSize: '10px', color: '#1e293b' }}>📋 {s.callSign || s.callsign || 'פרטים'}</span>
                <button onClick={() => { _activeStripDetailsCloser = null; setShowDetails(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', fontSize: '13px', lineHeight: 1, padding: '0 2px' }}>✕</button>
              </div>
              <div style={{ padding: '6px', fontSize: '9px' }}>

            {/* זמן המראה */}
            <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#475569', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{tr('strips.takeoffTime')}</span>
              <input
                type="datetime-local"
                value={localTakeoffTime}
                onChange={e => setLocalTakeoffTime(e.target.value)}
                onBlur={async e => {
                  const val = e.target.value;
                  if (!val) return;
                  try {
                    await fetch(`${API_URL}/strips/${s.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ takeoff_time: new Date(val).toISOString() })
                    });
                  } catch {}
                }}
                style={{ flex: 1, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', background: 'white', minWidth: 0 }}
              />
              {localTakeoffTime && (
                <button
                  onClick={async () => {
                    setLocalTakeoffTime('');
                    try {
                      await fetch(`${API_URL}/strips/${s.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ takeoff_time: null })
                      });
                    } catch {}
                  }}
                  style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', cursor: 'pointer' }}
                >✕</button>
              )}
            </div>

            {/* חימושים */}
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{tr('strips.armaments')}</span>
                <button onClick={() => saveDetails({ ...detailsData, weapons: [...detailsData.weapons, { type: '', quantity: '' }] })}
                  style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', cursor: 'pointer' }}>+</button>
              </div>
              {detailsData.weapons.map((w, i) => (
                <div key={i} style={{ display: 'flex', gap: '3px', marginBottom: '2px', alignItems: 'center' }}>
                  <input value={w.type} placeholder={tr('shared.type')} onChange={(e) => {
                    const updated = detailsData.weapons.map((item, idx) => idx === i ? { ...item, type: e.target.value } : item);
                    saveDetails({ ...detailsData, weapons: updated });
                  }} style={{ flex: 2, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }} />
                  <input value={w.quantity} placeholder={tr('strips.quantity')} onChange={(e) => {
                    const updated = detailsData.weapons.map((item, idx) => idx === i ? { ...item, quantity: e.target.value } : item);
                    saveDetails({ ...detailsData, weapons: updated });
                  }} style={{ flex: 1, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }} />
                  <button onClick={() => saveDetails({ ...detailsData, weapons: detailsData.weapons.filter((_, idx) => idx !== i) })}
                    style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 4px', fontSize: '9px', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
              ))}
              {detailsData.weapons.length === 0 && <div style={{ color: '#94a3b8', fontSize: '8px' }}>{tr('strips.clickToAdd')}</div>}
            </div>

            {/* מטרות */}
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{tr('strips.targets')}</span>
                <button onClick={() => saveDetails({ ...detailsData, targets: [...detailsData.targets, { name: '', aim_point: '' }] })}
                  style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', cursor: 'pointer' }}>+</button>
              </div>
              {detailsData.targets.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: '3px', marginBottom: '2px', alignItems: 'center' }}>
                  <input value={t.name} placeholder={tr('strips.targetName')} onChange={(e) => {
                    const updated = detailsData.targets.map((item, idx) => idx === i ? { ...item, name: e.target.value } : item);
                    saveDetails({ ...detailsData, targets: updated });
                  }} style={{ flex: 2, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }} />
                  <input value={t.aim_point} placeholder={tr('strips.guided')} onChange={(e) => {
                    const updated = detailsData.targets.map((item, idx) => idx === i ? { ...item, aim_point: e.target.value } : item);
                    saveDetails({ ...detailsData, targets: updated });
                  }} style={{ flex: 1, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }} />
                  <button onClick={() => saveDetails({ ...detailsData, targets: detailsData.targets.filter((_, idx) => idx !== i) })}
                    style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 4px', fontSize: '9px', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
              ))}
              {detailsData.targets.length === 0 && <div style={{ color: '#94a3b8', fontSize: '8px' }}>{tr('strips.clickToAdd')}</div>}
            </div>

            {/* מערכות */}
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{tr('strips.systems')}</span>
                <button onClick={() => saveDetails({ ...detailsData, systems: [...detailsData.systems, { name: '' }] })}
                  style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', cursor: 'pointer' }}>+</button>
              </div>
              {detailsData.systems.map((sys, i) => (
                <div key={i} style={{ display: 'flex', gap: '3px', marginBottom: '2px', alignItems: 'center' }}>
                  <input value={sys.name} placeholder={tr('shared.systemName')} onChange={(e) => {
                    const updated = detailsData.systems.map((item, idx) => idx === i ? { name: e.target.value } : item);
                    saveDetails({ ...detailsData, systems: updated });
                  }} style={{ flex: 1, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }} />
                  <button onClick={() => saveDetails({ ...detailsData, systems: detailsData.systems.filter((_, idx) => idx !== i) })}
                    style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 4px', fontSize: '9px', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
              ))}
              {detailsData.systems.length === 0 && <div style={{ color: '#94a3b8', fontSize: '8px' }}>{tr('strips.clickToAdd')}</div>}
            </div>

            {/* שקדיה */}
            <div>
              <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '3px' }}>{tr('shared.shkadia')}</div>
              <input
                value={detailsData.shkadia}
                placeholder={tr('strips.whichFormationMemberHas')}
                onChange={(e) => saveDetails({ ...detailsData, shkadia: e.target.value })}
                style={{ width: '100%', padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', boxSizing: 'border-box' }}
              />
            </div>

            {/* כותרת / ערכה / מבצע */}
            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <input
                value={localKoteret}
                placeholder={tr('strips.title')}
                onChange={e => setLocalKoteret(e.target.value)}
                onBlur={async e => {
                  const val = e.target.value;
                  try { await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ koteret: val }) }); } catch {}
                }}
                style={{ width: '100%', padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  value={localErka}
                  placeholder={tr('strips.kit')}
                  onChange={e => setLocalErka(e.target.value)}
                  onBlur={async e => {
                    const val = e.target.value;
                    try { await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ erka: val }) }); } catch {}
                  }}
                  style={{ flex: 1, padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }}
                />
                <input
                  value={localMivtza}
                  placeholder={tr('strips.operation')}
                  onChange={e => setLocalMivtza(e.target.value)}
                  onBlur={async e => {
                    const val = e.target.value;
                    try { await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mivtza: val }) }); } catch {}
                  }}
                  style={{ flex: 1, padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }}
                />
              </div>
              {/* צוות שליטה / תא שליטה */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  value={localTzevetShilta}
                  placeholder={tr('strips.controlTeam')}
                  onChange={e => setLocalTzevetShilta(e.target.value)}
                  onBlur={async e => {
                    const val = e.target.value;
                    try { await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tzevet_shilta: val }) }); } catch {}
                  }}
                  style={{ flex: 1, padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }}
                />
                <input
                  value={localTaShilta}
                  placeholder={tr('strips.controlCell')}
                  onChange={e => setLocalTaShilta(e.target.value)}
                  onBlur={async e => {
                    const val = e.target.value;
                    try { await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ta_shilta: val }) }); } catch {}
                  }}
                  style={{ flex: 1, padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }}
                />
              </div>
            </div>
            {allBlockSpaces.length > 0 && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '2px' }}>{tr('strips.blockSpace')}</div>
                <select
                  value={localBlockSpaceId}
                  onChange={async e => {
                    const val = e.target.value;
                    setLocalBlockSpaceId(val);
                    blockSpaceSavingRef.current = true;
                    try {
                      await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_space_id: val || null }) });
                      const bsName = val ? (allBlockSpaces.find((b: any) => String(b.id) === val)?.name || val) : null;
                      fetch(`${API_URL}/activity-log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'block_assigned', severity: 'normal', strip_id: String(s.id), strip_callsign: s.callsign || s.callSign || '', details: { blockSpaceName: bsName, blockSpaceId: val || null } }) }).catch(() => {});
                    } catch {}
                    setTimeout(() => { blockSpaceSavingRef.current = false; }, 5000);
                  }}
                  style={{ width: '100%', padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', background: 'white', color: '#1e293b' }}
                >
                  <option value="">{tr('strips.noBlockSpace')}</option>
                  {allBlockSpaces.map((bs: any) => <option key={bs.id} value={String(bs.id)}>{bs.name}</option>)}
                </select>
              </div>
            )}
              </div>
            </div>
          </>,
          document.body
        )}
      </div>
      {edit && (
        <HandwritingOverlay 
          onCancel={() => setEdit(false)} 
          onComplete={(val: string) => { onUpdate(s.id, val); setEdit(false); }} 
          anchorRect={anchorRect}
        />
      )}
      {serialRowMenu && (
        <>
          <div onClick={() => setSerialRowMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }}/>
          <div style={{ position: 'fixed', left: clampMenuPos(serialRowMenu.x, serialRowMenu.y, 190, 150).left, top: clampMenuPos(serialRowMenu.x, serialRowMenu.y, 190, 150).top, zIndex: 9999, background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', minWidth: '170px', overflow: 'hidden', direction: 'rtl' }}>
            <div style={{ padding: '4px 0' }}>
              <button
                onClick={() => { onSerialSelect && onSerialSelect(s.id, serialRowMenu.station, serialRowMenu.specificSerialId ?? serialRowMenu.latestSerialId, false); setSerialRowMenu(null); }}
                style={{ width: '100%', background: 'none', border: 'none', color: '#e2e8f0', padding: '8px 14px', cursor: 'pointer', textAlign: 'right', fontSize: '13px', display: 'block' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#2563eb')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >{tr('strips.acceptSerial')}</button>
              <button
                onClick={() => { onSerialDismiss && onSerialDismiss(s.id, serialRowMenu.station); setSerialRowMenu(null); }}
                style={{ width: '100%', background: 'none', border: 'none', color: '#fca5a5', padding: '8px 14px', cursor: 'pointer', textAlign: 'right', fontSize: '13px', display: 'block' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#7f1d1d')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >{tr('strips.serialNotRelevant')}</button>
              <div style={{ borderTop: '1px solid #334155', margin: '2px 0' }}/>
              <button
                onClick={() => { setSerialViewPopup({ x: serialRowMenu.x, y: serialRowMenu.y, station: serialRowMenu.station }); setSerialRowMenu(null); }}
                style={{ width: '100%', background: 'none', border: 'none', color: '#93c5fd', padding: '8px 14px', cursor: 'pointer', textAlign: 'right', fontSize: '13px', display: 'block' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1e3a5f')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >{tr('strips.showSerial')}</button>
            </div>
          </div>
        </>
      )}
      {serialViewPopup && (() => {
        const station = serialViewPopup.station;
        const allStationSerials = [...serials].filter((sr: any) => sr.control_station === station).sort((a: any, b: any) => b.serial_number - a.serial_number);
        const latestSerial = allStationSerials[0];
        const mySelection = serialSelections.find((sel: any) => sel.strip_id === s.id && sel.control_station === station);
        const mySerial = mySelection?.serial_id ? serials.find((sr: any) => sr.id === mySelection.serial_id) : null;
        const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
        const recentSerials = allStationSerials.filter((sr: any) => {
          const t = sr.created_at ? new Date(sr.created_at).getTime() : 0;
          return t >= threeHoursAgo;
        });
        const fmt = (dt: string) => dt ? new Date(dt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
        const { left: popLeft, top: popTop } = clampMenuPos(serialViewPopup.x, serialViewPopup.y, 330, 440);
        return (
          <>
            <div onClick={() => setSerialViewPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }}/>
            <div style={{ position: 'fixed', left: popLeft, top: popTop, zIndex: 9999, background: '#0f172a', border: '1px solid #1d4ed8', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.7)', width: '320px', direction: 'rtl', overflow: 'hidden', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
              {/* כותרת */}
              <div style={{ background: '#1e3a5f', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ color: '#93c5fd', fontWeight: 'bold', fontSize: '13px' }}>{tr('shared.serial')} {station}</span>
                <button onClick={() => setSerialViewPopup(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {/* הספרור הנוכחי של הפ"מ */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e3a5f', background: '#0c1a2e' }}>
                  <div style={{ color: '#60a5fa', fontSize: '10px', marginBottom: '6px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tr('strips.currentSerialOfThe')}</div>
                  {mySerial && !mySelection?.dismissed ? (
                    <div style={{ background: '#14432a', border: '1px solid #166534', borderRadius: '6px', padding: '8px 10px' }}>
                      <div style={{ color: '#4ade80', fontSize: '16px', fontWeight: 'bold', marginBottom: '3px' }}>#{mySerial.serial_number}</div>
                      {mySerial.essence && <div style={{ color: '#bbf7d0', fontSize: '11px', marginBottom: '2px' }}>{tr('shared.nature2')} {mySerial.essence}</div>}
                      {mySerial.relevant_to && <div style={{ color: '#86efac', fontSize: '10px', marginBottom: '2px' }}>{tr('strips.relevantTo')} {mySerial.relevant_to}</div>}
                      <div style={{ color: '#4ade80', fontSize: '9px', opacity: 0.7 }}>{tr('strips.created')} {fmt(mySerial.created_at)}</div>
                      {latestSerial && latestSerial.id !== mySerial.id && (
                        <div style={{ marginTop: '6px', padding: '4px 8px', background: '#dc2626', borderRadius: '4px', color: 'white', fontSize: '10px', fontWeight: 'bold' }}>
                          {tr('strips.aNewerSerialExists')}{latestSerial.serial_number}
                          <button
                            onClick={e => { e.stopPropagation(); onSerialSelect && onSerialSelect(s.id, station, latestSerial.id, false); setSerialViewPopup(null); }}
                            style={{ marginRight: '8px', background: 'white', color: '#dc2626', border: 'none', borderRadius: '3px', padding: '1px 6px', cursor: 'pointer', fontSize: '9px', fontWeight: 'bold' }}
                          >{tr('strips.update')}</button>
                        </div>
                      )}
                    </div>
                  ) : mySelection?.dismissed ? (
                    <div style={{ color: '#f87171', fontSize: '12px', padding: '4px 0' }}>{tr('strips.markedAsNotRelevant')}</div>
                  ) : (
                    <div style={{ color: '#64748b', fontSize: '12px', padding: '4px 0' }}>{tr('strips.noSerialAssignedTo')}</div>
                  )}
                </div>
                {/* ספרורים מ-3 שעות האחרונות */}
                <div style={{ padding: '8px 12px 6px' }}>
                  <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '6px', fontWeight: 'bold' }}>{tr('strips.serialsFromTheLast')}</div>
                  {recentSerials.length === 0 ? (
                    <div style={{ color: '#475569', fontSize: '11px', padding: '6px 0', textAlign: 'center' }}>{tr('strips.noSerialsFromThe')}</div>
                  ) : (
                    recentSerials.map((sr: any) => {
                      const isCurrent = mySelection?.serial_id === sr.id && !mySelection?.dismissed;
                      const isLatest = latestSerial?.id === sr.id;
                      return (
                        <div key={sr.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '5px', marginBottom: '3px', background: isCurrent ? '#14432a' : isLatest ? '#1e3a5f' : '#0f172a', border: `1px solid ${isCurrent ? '#166534' : isLatest ? '#1d4ed8' : '#1e293b'}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: isCurrent ? '#4ade80' : isLatest ? '#93c5fd' : '#e2e8f0', fontWeight: 'bold', fontSize: '12px' }}>#{sr.serial_number}</span>
                              {isLatest && <span style={{ background: '#1d4ed8', color: 'white', fontSize: '8px', borderRadius: '3px', padding: '0 4px' }}>{tr('strips.newest')}</span>}
                              {isCurrent && <span style={{ background: '#166534', color: '#4ade80', fontSize: '8px', borderRadius: '3px', padding: '0 4px' }}>{tr('strips.current')}</span>}
                            </div>
                            {sr.essence && <div style={{ color: '#64748b', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sr.essence}</div>}
                            <div style={{ color: '#475569', fontSize: '9px' }}>{fmt(sr.created_at)}</div>
                          </div>
                          {!isCurrent && (
                            <button
                              onClick={e => { e.stopPropagation(); onSerialSelect && onSerialSelect(s.id, station, sr.id, false); setSerialViewPopup(null); }}
                              style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '3px', padding: '3px 7px', cursor: 'pointer', fontSize: '9px', fontWeight: 'bold', flexShrink: 0 }}
                            >{tr('shared.accept')}</button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              {/* כפתורי פעולה */}
              <div style={{ display: 'flex', gap: '6px', padding: '8px 12px', borderTop: '1px solid #1e3a5f', flexShrink: 0 }}>
                {latestSerial && mySerial?.id !== latestSerial.id && !mySelection?.dismissed && (
                  <button
                    onClick={() => { onSerialSelect && onSerialSelect(s.id, station, latestSerial.id, false); setSerialViewPopup(null); }}
                    style={{ flex: 1, background: '#1d4ed8', border: 'none', borderRadius: '4px', color: 'white', padding: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                  >{tr('strips.acceptLatestSerial')}</button>
                )}
                <button
                  onClick={() => { onSerialDismiss && onSerialDismiss(s.id, station); setSerialViewPopup(null); }}
                  style={{ flex: 1, background: '#7f1d1d', border: 'none', borderRadius: '4px', color: '#fca5a5', padding: '6px', cursor: 'pointer', fontSize: '11px' }}
                >{tr('shared.notRelevant')}</button>
              </div>
            </div>
          </>
        );
      })()}
      {contextMenu && (
        <ContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          neighbors={neighbors || []} 
          onSelect={(sectorId) => {
            if (onTransfer) onTransfer(s.id, sectorId);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
          extraActions={(() => {
            const mySelections = serialSelections.filter((sel: any) => sel.strip_id === s.id && !sel.dismissed);
            const alertSelections = mySelections.filter((sel: any) => {
              const latestForStation = [...serials].filter((sr: any) => sr.control_station === sel.control_station).sort((a: any, b: any) => b.serial_number - a.serial_number)[0];
              return sel.serial_id && latestForStation && latestForStation.id !== sel.serial_id;
            });
            const actions = [];
            if (mySelections.length > 0) {
              actions.push({ label: 'ספרור לא רלוונטי לפ"מ', onClick: () => mySelections.forEach((sel: any) => onSerialDismiss && onSerialDismiss(s.id, sel.control_station)) });
            }
            if (alertSelections.length > 0) {
              actions.push({ label: 'פ"מ עודכן בספרור', onClick: () => alertSelections.forEach((sel: any) => {
                const latest = [...serials].filter((sr: any) => sr.control_station === sel.control_station).sort((a: any, b: any) => b.serial_number - a.serial_number)[0];
                if (latest && onSerialSelect) onSerialSelect(s.id, sel.control_station, latest.id, false);
              })});
            }
            if (isBlockDeviation && !blockDeviation) {
              actions.push({ label: '⚠️ אשר חריגה מבלוק', onClick: async () => {
                setBlockDeviation(true);
                try { await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_deviation: true }) }); } catch {}
                setContextMenu(null);
              }});
            }
            if (blockDeviation && !isBlockDeviation) {
              actions.push({ label: 'נקה סטייה ממרחב בלוקים', onClick: async () => {
                setBlockDeviation(false);
                try { await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_deviation: false }) }); } catch {}
                setContextMenu(null);
              }});
            }
            return actions;
          })()}
        />
      )}
    </div>
  );

  const baseStyle: React.CSSProperties = {
    width: 130,
    background: (isBlockDeviation && !blockDeviation)
      ? undefined
      : blockDeviation
        ? (lightMode ? 'white' : 'rgba(234, 88, 12, 0.15)')
        : isAltConflict
          ? (lightMode ? 'white' : 'rgba(127, 29, 29, 0.15)')
          : s.airborne ? '#dbeafe' : 'white',
    border: (isBlockDeviation || blockDeviation)
      ? (lightMode ? '2px solid black' : '2px solid #f97316')
      : isAltConflict
        ? '2px solid #ef4444'
        : s.airborne ? '2px solid #3b82f6' : '2px solid black',
    display: 'flex', flexDirection: 'row-reverse',
    marginBottom: '6px', touchAction: 'none'
  };

  // אם בגרירה, מציג בפורטל שיעקוב אחרי העכבר
  if (isDragging) {
    return (
      <>
        {/* Placeholder במקום המקורי — call stripContent directly to avoid double-positioning */}
        {stripContent({ ...baseStyle, opacity: 0.3, position: s.onMap ? 'absolute' : 'relative', left: s.onMap ? s.x : 0, top: s.onMap ? s.y : 0, transform: s.onMap ? `scale(${1/zoom})` : undefined, transformOrigin: 'top left' })}
        {/* רכיב גרירה שעוקב אחרי העכבר */}
        {createPortal(
          <div style={{ 
            ...baseStyle, 
            position: 'fixed', 
            left: dragPos.x, 
            top: dragPos.y, 
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
            transform: 'rotate(2deg)'
          }}>
            <div style={{ width: 35, background: '#1e293b', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '20px' }}>⋮</div>
            <div style={{ padding: '8px', flex: 1, direction: 'rtl', textAlign: 'right' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{getFormationDisplayName(s)}{s.numberOfFormation && !s.aircraft_indices ? ` / ${s.numberOfFormation}` : ''}</div>
                <div style={{ fontSize: '11px', background: '#3b82f6', color: 'white', padding: '1px 6px', borderRadius: '3px' }}>{s.sq}</div>
              </div>
              {(!s.sq && s.squadron) && <div style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 'bold', marginTop: '2px' }}>{s.squadron}</div>}
              <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
                <div style={{ fontSize: '10px', border: '1px solid #e2e8f0', flex: 1, padding: '2px', background: '#f1f5f9' }}>{tr('shared.altitude')} {normalizeAlt(s.alt || '')}</div>
                <div style={{ fontSize: '10px', flex: 1, color: '#64748b' }}>{s.task}</div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return stripContent({
    ...baseStyle,
    position: s.onMap ? 'absolute' : 'relative',
    left: s.onMap ? s.x : 0, 
    top: s.onMap ? s.y : 0,
    zIndex: 50,
    transform: s.onMap ? `scale(${1/zoom})` : undefined,
    transformOrigin: 'top left'
  });
};

export default Strip;
