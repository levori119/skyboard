import { tr } from '../../i18n/tr';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { API_URL } from '../../config';
import { sc } from '../../utils/scale';
import { getFormationDisplayName } from '../../utils/strips';
import { VKTrigger } from '../../VirtualKeyboard';
import Strip from '../strips/Strip';
import type { GroundStatusKey, AircraftPos, GroundAircraftRow, VectorData } from '../../types/ground';
import {
  GROUND_STATUSES, normalizeAircraftPositions, toEmbedUrl,
  renderGroundSvgIcon, getElemDisplayStateOpts, GroundMarkerSVG,
} from '../ground/groundShared';

export const GroundView = ({ strips, incomingTransfers, outgoingTransfers, airfield, airfieldMapSrc, lightMode, allSectors, presetSectors, onUpdateAircraft, onTransfer, onAcceptTransfer, onUpdateStripField, stripAircraftData, onUpdateStripAircraft, onCreateStrip, currentPresetId, currentSectorId, singleTransfers, airfieldRoutes, aviationBases, presetRole, onUpdateStripMeta, crewMemberId, initialUndoDurationMs, initialDatkFilter, initialStatusFilter, initialFilterMode, airfieldElements, elementTypes, onUpdateElementStatus, onUpdateElement, onMergePartial, onSplitPartial, headerButtons, initialDatkShowMinutes, onUpdatePreset, stripsPinned: stripsPinnedProp, onTogglePin, vectorData, airfieldPolygons, airfieldSectors, airfieldStatusTypes, airfieldPolygonStatuses, onUpdatePolygonStatus, onUpdateElementDisplayState, onCreateElement, onDeleteElement, hideStrips, hideElementPanel, externalCatHighlight, externalHiddenElements, topOffset, liveRunwayConflicts, airfieldRunways = [], airfieldRunwayNotams = [], activeTakeoffs = [], airfieldTaxiways = [], showTaxiwayOpenOnly = false, onToggleTaxiwayOpenOnly, mapBottomOverlay, showLayersPanel = true }: {
  strips: any[];
  incomingTransfers: any[];
  outgoingTransfers: any[];
  airfield: any | null;
  airfieldMapSrc: string | null;
  lightMode: boolean;
  allSectors: any[];
  presetSectors: number[];
  onUpdateAircraft: (stripId: string, aircraft: AircraftPos[]) => void;
  onTransfer: (stripId: string, toSectorId: number, aircraftIdx?: number) => void;
  onAcceptTransfer: (transferId: string) => void;
  onUpdateStripField?: (stripId: string, field: string, val: string) => void;
  stripAircraftData: Record<string, GroundAircraftRow[]>;
  onUpdateStripAircraft: (stripId: string, idx: number, datk: number | null, kipa: string | null) => void;
  onCreateStrip: (callSign: string, sq: string, count: number, sectorId: number | null) => Promise<void>;
  currentPresetId?: number | null;
  currentSectorId?: number | null;
  singleTransfers?: { sectorId: number; callSign: string; aircraftIdx: number; totalCount: number }[];
  airfieldRoutes?: any[];
  aviationBases?: any[];
  presetRole?: string | null;
  onUpdateStripMeta?: (stripId: string, fields: Record<string, any>) => void;
  crewMemberId?: number | null;
  initialUndoDurationMs?: number | null;
  initialDatkFilter?: number | null;
  initialStatusFilter?: string[] | null;
  initialFilterMode?: 'AND' | 'OR' | null;
  vectorData?: VectorData | null;
  airfieldElements?: any[];
  elementTypes?: any[];
  onUpdateElementStatus?: (elementId: number, status: string) => void;
  onUpdateElement?: (elementId: number, fields: { name: string; category: string; status: string; note: string; display_state?: string; blink_rate?: number; open_icon_key?: string; close_icon_key?: string; rotation?: number; camera_url?: string | null; x_pct?: number | null; y_pct?: number | null; hidden_on_map?: boolean }) => Promise<void>;
  onMergePartial?: (targetStripId: string, sourceStripId: string) => Promise<void>;
  onSplitPartial?: (sourceStripId: string, indices: number[]) => Promise<void>;
  headerButtons?: React.ReactNode;
  initialDatkShowMinutes?: number | null;
  onUpdatePreset?: (fields: Record<string, any>) => void;
  stripsPinned?: boolean;
  onTogglePin?: () => void;
  airfieldPolygons?: any[];
  airfieldSectors?: any[];
  airfieldStatusTypes?: any[];
  airfieldPolygonStatuses?: any[];
  onUpdatePolygonStatus?: (polygonId: number, statusTypeId: number | null, note: string, grfStatus?: string | null, rvrMeters?: number | null) => Promise<void>;
  onUpdateElementDisplayState?: (elementId: number, displayState: string, blinkRate?: number) => Promise<void>;
  onCreateElement?: (fields: { name: string; element_type_id?: number | null; x_pct: number; y_pct: number }) => Promise<any>;
  onDeleteElement?: (elementId: number) => Promise<void>;
  hideStrips?: boolean;
  hideElementPanel?: boolean;
  externalCatHighlight?: Set<string>;
  externalHiddenElements?: Set<number>;
  topOffset?: number;
  liveRunwayConflicts?: {routeName:string;conflicts:{type:string;name:string;callsign:string}[];recommendations:{id:number;name:string;category:string;display_state:string;blocking_statuses:string[];allowed_statuses:string[]}[]}[];
  airfieldRunways?: any[];
  airfieldRunwayNotams?: any[];
  activeTakeoffs?: {stripId: number|string; callsign: string; runway: string; routeName: string}[];
  airfieldTaxiways?: any[];
  showTaxiwayOpenOnly?: boolean;
  onToggleTaxiwayOpenOnly?: () => void;
  mapBottomOverlay?: React.ReactNode;
  showLayersPanel?: boolean;
}) => {
  const [elemPanelOpen, setElemPanelOpen] = useState(false);
  const [hiddenElements, setHiddenElements] = useState<Set<number>>(new Set());
  // Runway takeoff highlighting — maps heading → timestamp when first seen in activeTakeoffs
  const [recentTakeoffTimes, setRecentTakeoffTimes] = React.useState<Record<string, number>>({});
  const [recentTakeoffCallsigns, setRecentTakeoffCallsigns] = React.useState<Record<string, string>>({});
  const [rwNow, setRwNow] = React.useState(() => Date.now());
  const [collapsedElemCats, setCollapsedElemCats] = useState<Set<string>>(new Set());
  const [sectorZoomPanelOpen, setSectorZoomPanelOpen] = useState(false);
  const [mapLayers, setMapLayers] = useState({ elements: true, routes_aircraft: false, routes_vehicle: false, points: true, polygons: false, sectors: false, cameras: true, admin_points: false });
  const [mapDisplaySettings, setMapDisplaySettings] = useState({ showNames: false, showStatus: false, showRoutes: true, showChipBorder: true, showChipBg: true });
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [dragging, setDragging] = useState<{ stripId: string; idx: number } | null>(null);
  const [mapDragOver, setMapDragOver] = useState<number | null>(null); // point_id or -1 for "no point"
  const [transferPending, setTransferPending] = useState<{ stripId: string; sectorId: number; aircraftIdx: number; stripName: string; totalCount: number } | null>(null);
  const [sidModal, setSidModal] = useState<{ strip: any; idx: number } | null>(null);
  const [sidSectorPick, setSidSectorPick] = useState<{ label: string; sector_ids: number[] } | null>(null);
  const [elemEditModal, setElemEditModal] = useState<{ el: any; name: string; category: string; status: string; note: string; displayState: string; blinkRate: number; openIconKey: string; closeIconKey: string; rotation: number; cameraUrl: string; hiddenOnMap: boolean } | null>(null);
  const [cameraPanels, setCameraPanels] = useState<{ id: number; url: string; name: string; dragPos: { x: number; y: number }; expanded: boolean }[]>([]);
  const nextCamId = useRef(0);
  // Route animation — vehicle moving along its path
  const [routeAnimProgress, setRouteAnimProgress] = useState<Record<number, number>>({});
  const routeAnimRaf = React.useRef<Record<number, number>>({});

  const startRouteAnim = React.useCallback((elId: number, endFrac: number) => {
    if (routeAnimRaf.current[elId]) cancelAnimationFrame(routeAnimRaf.current[elId]);
    const DURATION = 6000;
    const PAUSE = 600; // pause at end before looping
    let loopStart = performance.now();
    const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
    const tick = (now: number) => {
      const elapsed = now - loopStart;
      if (elapsed >= DURATION + PAUSE) {
        // restart loop
        loopStart = now;
        setRouteAnimProgress(prev => ({ ...prev, [elId]: 0 }));
        routeAnimRaf.current[elId] = requestAnimationFrame(tick);
        return;
      }
      const raw = Math.min(1, elapsed / DURATION);
      const t = ease(raw) * endFrac;
      setRouteAnimProgress(prev => ({ ...prev, [elId]: t }));
      routeAnimRaf.current[elId] = requestAnimationFrame(tick);
    };
    setRouteAnimProgress(prev => ({ ...prev, [elId]: 0 }));
    routeAnimRaf.current[elId] = requestAnimationFrame(tick);
  }, []);

  const stopRouteAnim = React.useCallback((elId: number) => {
    if (routeAnimRaf.current[elId]) { cancelAnimationFrame(routeAnimRaf.current[elId]); delete routeAnimRaf.current[elId]; }
    setRouteAnimProgress(prev => { const n = { ...prev }; delete n[elId]; return n; });
  }, []);

  const [cameraWall, setCameraWall] = useState(false);
  const [cameraPicker, setCameraPicker] = useState<{ el: any; url: string } | null>(null);
  const [cameraPickerPos, setCameraPickerPos] = useState<'right'|'left'|'top'|'bottom'|'full'>('right');
  const [editingElemField, setEditingElemField] = useState<'name' | 'category' | 'status' | 'note' | null>(null);
  const [catMapHighlight, setCatMapHighlight] = useState<Set<string>>(new Set());
  const [elemStatusPicker, setElemStatusPicker] = useState<{ el: any; x: number; y: number } | null>(null);
  const [elemNavModal, setElemNavModal] = useState<{ el: any; fromPointId: number|null; toPointId: number|null; viaRouteIds: number[] } | null>(null);
  const [elemNavData, setElemNavData] = useState<Record<number, { fromPointId: number|null; toPointId: number|null; viaRouteIds: number[] }>>({});
  const [navModalPos, setNavModalPos] = useState<{x:number;y:number}>({x:180,y:80});
  const [navBlockedGroupsOpen, setNavBlockedGroupsOpen] = useState<Record<string,boolean>>({});
  const navModalDragRef = React.useRef<{startMX:number;startMY:number;startPX:number;startPY:number}|null>(null);
  const navModalOrigNavRef = React.useRef<{elId:number;data:{fromPointId:number|null;toPointId:number|null;viaRouteIds:number[]}|undefined}|null>(null);
  // Vehicle placement
  const [addVehicleMode, setAddVehicleMode] = useState(false);
  const [vehiclePlaceModal, setVehiclePlaceModal] = useState<{ x_pct: number; y_pct: number } | null>(null);
  const [vehicleForm, setVehicleForm] = useState({ name: '', element_type_id: '' });
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [placingExistingElement, setPlacingExistingElement] = useState<any | null>(null);
  const [polygonStatusPicker, setPolygonStatusPicker] = useState<{ polygon: any; x: number; y: number; currentStatus: any | null } | null>(null);
  const [polygonPickerNote, setPolygonPickerNote] = useState('');
  const [polygonPickerGrf, setPolygonPickerGrf] = useState<string | null>(null);
  const [polygonPickerRvr, setPolygonPickerRvr] = useState<string>('');
  const [focusedSectorId, setFocusedSectorId] = useState<number | null>(null);
  const [draggingTransferId, setDraggingTransferId] = useState<string | null>(null);
  const [pendingPointAssign, setPendingPointAssign] = React.useState<{ stripId: string; pointId: number } | null>(null);
  const [leftDragOver, setLeftDragOver] = useState<number | null>(null); // sector_id
  const [groundQuickMenu, setGroundQuickMenu] = useState<{ stripId: string; idx: number; x: number; y: number } | null>(null);
  const [expandedStrips, setExpandedStrips] = useState<Set<string>>(new Set());
  const [sectorContactsOpenId, setSectorContactsOpenId] = useState<number | null>(null);
  const [allContactsCache, setAllContactsCache] = useState<any[] | null>(null);
  const [stripSortKey, setStripSortKey] = useState<'callsign' | 'time_asc' | 'time_desc' | 'squadron'>('callsign');
  const [stripGroupBySquadron, setStripGroupBySquadron] = useState(false);
  const [squadronCollapse, setSquadronCollapse] = React.useState<Record<string, 'open' | 'half' | 'closed'>>({});
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [actionMenuRect, setActionMenuRect] = useState<{ left: number; bottom: number } | null>(null);
  const [rightPanelW, setRightPanelW] = useState(360);
  const [leftPanelW, setLeftPanelW] = useState(280);
  const stripsPinned = stripsPinnedProp ?? true;
  const panelResizeRef = React.useRef<{ which: 'right' | 'left'; startX: number; startW: number } | null>(null);
  const startPanelResize = (which: 'right' | 'left') => (e: React.PointerEvent) => {
    e.preventDefault();
    // pointer-capture: the drag keeps working even when the pointer moves over the map/canvas
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const startX = e.clientX;
    const startW = which === 'right' ? rightPanelW : leftPanelW;
    const onMove = (me: PointerEvent) => {
      const dx = me.clientX - startX;
      const newW = Math.max(80, Math.min(520, startW + (which === 'right' ? -dx : dx)));
      if (which === 'right') setRightPanelW(newW);
      else setLeftPanelW(newW);
    };
    const onUp = () => {
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };
  const [datkFilter, setDatkFilter] = useState<number | null>(() => {
    if (initialDatkFilter !== undefined && initialDatkFilter !== null) return initialDatkFilter;
    try {
      const stored = localStorage.getItem('datkFilter');
      if (stored === null || stored === 'null') return null;
      const parsed = Number(stored);
      return isNaN(parsed) ? null : parsed;
    } catch {
      return null;
    }
  }); // minimum datk to highlight; null = no filter
  const isFirstDatkMount = React.useRef(true);
  // Track when each runway heading first appeared in activeTakeoffs; clear stale entries (>3 min + no longer active)
  React.useEffect(() => {
    const WINDOW_MS = 3 * 60 * 1000;
    const now = Date.now();
    const activeSet = new Set((activeTakeoffs || []).map((t: any) => t.runway).filter(Boolean));
    setRecentTakeoffTimes(prev => {
      const next = { ...prev };
      let changed = false;
      for (const t of (activeTakeoffs || [])) {
        if (t.runway && !next[t.runway]) { next[t.runway] = now; changed = true; }
      }
      for (const heading of Object.keys(next)) {
        if (!activeSet.has(heading) && (now - next[heading]) >= WINDOW_MS) { delete next[heading]; changed = true; }
      }
      return changed ? next : prev;
    });
    // Also store the callsign per runway heading (kept as long as timestamp lives)
    setRecentTakeoffCallsigns(prev => {
      const next = { ...prev };
      let changed = false;
      for (const t of (activeTakeoffs || [])) {
        if (t.runway && t.callsign && next[t.runway] !== t.callsign) { next[t.runway] = t.callsign; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [activeTakeoffs]);

  // Live clock for runway countdown timers — ticks every second
  React.useEffect(() => {
    const iv = setInterval(() => setRwNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  React.useEffect(() => {
    setPolygonPickerNote(polygonStatusPicker?.currentStatus?.note || '');
    setPolygonPickerGrf(polygonStatusPicker?.currentStatus?.grf_status || null);
    setPolygonPickerRvr(polygonStatusPicker?.currentStatus?.rvr_meters != null ? String(polygonStatusPicker.currentStatus.rvr_meters) : '');
  }, [polygonStatusPicker]);

  React.useEffect(() => {
    if (isFirstDatkMount.current) { isFirstDatkMount.current = false; return; }
    try {
      localStorage.setItem('datkFilter', String(datkFilter));
    } catch {
      // ignore storage errors
    }
    if (crewMemberId) {
      fetch(`${API_URL}/crew-members/${crewMemberId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ground_datk_filter: datkFilter })
      }).catch(() => {});
    }
  }, [datkFilter]);
  const [statusFilter, setStatusFilter] = useState<string[]>(() => {
    if (initialStatusFilter !== undefined && initialStatusFilter !== null && Array.isArray(initialStatusFilter)) {
      const validKeys = GROUND_STATUSES.map(s => s.key) as readonly string[];
      return [...new Set(initialStatusFilter.filter((k: unknown) => typeof k === 'string' && validKeys.includes(k as string)))] as string[];
    }
    try {
      const stored = localStorage.getItem('groundStatusFilter');
      if (!stored || stored === 'null') return [];
      const validKeys = GROUND_STATUSES.map(s => s.key) as readonly string[];
      // Legacy format: plain string key stored without JSON encoding
      if (!stored.startsWith('[') && !stored.startsWith('"')) {
        return validKeys.includes(stored) ? [stored] : [];
      }
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.filter((k: unknown) => typeof k === 'string' && validKeys.includes(k as string)))] as string[];
      }
      if (typeof parsed === 'string' && validKeys.includes(parsed)) return [parsed];
      return [];
    } catch {
      return [];
    }
  }); // set of status keys to highlight; empty = no filter
  const isFirstStatusMount = React.useRef(true);
  React.useEffect(() => {
    if (isFirstStatusMount.current) { isFirstStatusMount.current = false; return; }
    try {
      localStorage.setItem('groundStatusFilter', JSON.stringify(statusFilter));
    } catch {
      // ignore storage errors
    }
    if (crewMemberId) {
      fetch(`${API_URL}/crew-members/${crewMemberId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ground_status_filter: statusFilter })
      }).catch(() => {});
    }
  }, [statusFilter]);
  const [filterMode, setFilterMode] = useState<'AND' | 'OR'>(() => {
    if (initialFilterMode === 'AND' || initialFilterMode === 'OR') return initialFilterMode;
    try {
      const stored = localStorage.getItem('groundFilterMode');
      return stored === 'OR' ? 'OR' : 'AND';
    } catch {
      return 'AND';
    }
  });
  const isFirstFilterModeMount = React.useRef(true);
  React.useEffect(() => {
    if (isFirstFilterModeMount.current) { isFirstFilterModeMount.current = false; return; }
    try {
      localStorage.setItem('groundFilterMode', filterMode);
    } catch {
      // ignore storage errors
    }
    if (crewMemberId) {
      fetch(`${API_URL}/crew-members/${crewMemberId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ground_filter_mode: filterMode })
      }).catch(() => {});
    }
  }, [filterMode]);
  // When the active crew member hot-swaps, reload their saved filter preferences
  const isFirstCrewMemberMount = React.useRef(true);
  React.useEffect(() => {
    if (isFirstCrewMemberMount.current) { isFirstCrewMemberMount.current = false; return; }
    // Load new crew member's datkFilter
    const newDatk = (initialDatkFilter !== undefined && initialDatkFilter !== null)
      ? initialDatkFilter
      : (() => {
          try {
            const stored = localStorage.getItem('datkFilter');
            if (stored === null || stored === 'null') return null;
            const parsed = Number(stored);
            return isNaN(parsed) ? null : parsed;
          } catch { return null; }
        })();
    // Load new crew member's statusFilter
    const validKeys = GROUND_STATUSES.map(s => s.key) as readonly string[];
    const newStatus = (initialStatusFilter !== undefined && initialStatusFilter !== null && Array.isArray(initialStatusFilter))
      ? [...new Set(initialStatusFilter.filter((k: unknown) => typeof k === 'string' && validKeys.includes(k as string)))] as string[]
      : (() => {
          try {
            const stored = localStorage.getItem('groundStatusFilter');
            if (!stored || stored === 'null') return [];
            if (!stored.startsWith('[') && !stored.startsWith('"')) return validKeys.includes(stored) ? [stored] : [];
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) return [...new Set(parsed.filter((k: unknown) => typeof k === 'string' && validKeys.includes(k as string)))] as string[];
            if (typeof parsed === 'string' && validKeys.includes(parsed)) return [parsed];
            return [];
          } catch { return []; }
        })();
    // Load new crew member's filterMode
    const newMode: 'AND' | 'OR' = (initialFilterMode === 'AND' || initialFilterMode === 'OR')
      ? initialFilterMode
      : (() => {
          try {
            const stored = localStorage.getItem('groundFilterMode');
            return stored === 'OR' ? 'OR' : 'AND';
          } catch { return 'AND'; }
        })();
    // Load new crew member's undoDurationMs
    const UNDO_OPTS = [3000, 6000, 10000] as const;
    const newUndo = (initialUndoDurationMs && (UNDO_OPTS as readonly number[]).includes(initialUndoDurationMs))
      ? initialUndoDurationMs
      : (() => {
          try {
            const stored = localStorage.getItem('groundUndoDurationMs');
            if (stored) {
              const parsed = Number(stored);
              if ((UNDO_OPTS as readonly number[]).includes(parsed)) return parsed;
            }
          } catch { /* ignore */ }
          return 6000;
        })();
    setDatkFilter(newDatk);
    setStatusFilter(newStatus);
    setFilterMode(newMode);
    setUndoDurationMs(newUndo);
  }, [crewMemberId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [clearSnapshot, setClearSnapshot] = React.useState<{ datkFilter: number | null; statusFilter: string[]; filterMode: 'AND' | 'OR' } | null>(null);

  // ─── פ"מ אב state — armaments, systems, formation summary ───────────────
  const [acArmaments, setAcArmaments] = React.useState<Record<number, any[]>>({});
  const [acSystems, setAcSystems] = React.useState<Record<number, any[]>>({});
  const [openAcPanel, setOpenAcPanel] = React.useState<{ stripId: string; idx: number; type: 'armaments' | 'systems' } | null>(null);
  const [formationSummary, setFormationSummary] = React.useState<Record<string, { hasShakadia: boolean; armaments: { name: string; totalQty: number; aircraftNums: number[] }[] }>>({});
  const [formationPanelStripId, setFormationPanelStripId] = React.useState<string | null>(null);
  const [defaultArmamentNames, setDefaultArmamentNames] = React.useState<string[]>([]);
  const [defaultSystemNames, setDefaultSystemNames] = React.useState<string[]>([]);

  // Sort strips so split siblings appear together, ordered by their min aircraft index
  const sortedStrips = React.useMemo(() => {
    const getTime = (s: any) => s.takeoffTime || s.takeoff_time || '';
    const getCs = (s: any) => s.callSign || s.callsign || '';
    const getSq = (s: any) => s.sq || s.squadron || '';

    const primarySort = (a: any, b: any): number => {
      if (stripSortKey === 'time_asc') return getTime(a).localeCompare(getTime(b));
      if (stripSortKey === 'time_desc') return getTime(b).localeCompare(getTime(a));
      if (stripSortKey === 'squadron') return getSq(a).localeCompare(getSq(b), 'he');
      return getCs(a).localeCompare(getCs(b), 'he'); // 'callsign' default
    };

    // Within each formation group, keep partials together sorted by aircraft index
    const groupsByParent = new Map<string, any[]>();
    const groupOrder: string[] = [];
    for (const strip of strips) {
      const key = strip.parent_strip_id ? String(strip.parent_strip_id) : String(strip.id);
      if (!groupsByParent.has(key)) { groupsByParent.set(key, []); groupOrder.push(key); }
      groupsByParent.get(key)!.push(strip);
    }

    // Sort the group representatives (first strip in each group) then sort within groups
    const sortedGroups = groupOrder.slice().sort((ka, kb) => {
      const ra = groupsByParent.get(ka)![0];
      const rb = groupsByParent.get(kb)![0];
      return primarySort(ra, rb);
    });

    const result: any[] = [];
    for (const key of sortedGroups) {
      const group = (groupsByParent.get(key) || []).slice().sort((a: any, b: any) => {
        const aMin = Array.isArray(a.aircraft_indices) ? Math.min(...a.aircraft_indices) : 0;
        const bMin = Array.isArray(b.aircraft_indices) ? Math.min(...b.aircraft_indices) : 0;
        return aMin - bMin;
      });
      result.push(...group);
    }
    return result;
  }, [strips, stripSortKey]);

  // Display items: optionally grouped by squadron with header rows
  const groundDisplayItems = React.useMemo((): Array<
    { type: 'strip'; strip: any; squadronLabel: string; squadronIdx: number; squadronTotal: number } |
    { type: 'header'; label: string; total: number }
  > => {
    if (!stripGroupBySquadron) return sortedStrips.map(s => ({ type: 'strip' as const, strip: s, squadronLabel: '', squadronIdx: 0, squadronTotal: 0 }));
    // Re-sort by squadron first (stable), preserving the existing secondary sort within each squadron
    const bySq = sortedStrips.slice().sort((a, b) => {
      const sqA = a.sq || a.squadron || 'ללא טייסת';
      const sqB = b.sq || b.squadron || 'ללא טייסת';
      return sqA.localeCompare(sqB, 'he');
    });
    // First pass: count per squadron
    const sqCounts: Record<string, number> = {};
    for (const strip of bySq) {
      const sq = strip.sq || strip.squadron || 'ללא טייסת';
      sqCounts[sq] = (sqCounts[sq] || 0) + 1;
    }
    // Second pass: build items with index/total
    const items: Array<{ type: 'strip'; strip: any; squadronLabel: string; squadronIdx: number; squadronTotal: number } | { type: 'header'; label: string; total: number }> = [];
    let lastSq: string | null = null;
    const sqIdx: Record<string, number> = {};
    for (const strip of bySq) {
      const sq = strip.sq || strip.squadron || 'ללא טייסת';
      if (sq !== lastSq) { items.push({ type: 'header', label: sq, total: sqCounts[sq] }); lastSq = sq; sqIdx[sq] = 0; }
      items.push({ type: 'strip', strip, squadronLabel: sq, squadronIdx: sqIdx[sq]!, squadronTotal: sqCounts[sq] });
      sqIdx[sq]!++;
    }
    return items;
  }, [sortedStrips, stripGroupBySquadron]);
  const [stripFormationMeta, setStripFormationMeta] = React.useState<Record<string, { notes: string; parentCallsign: string; takeoffAirfieldId: number|null; landingAirfieldId: number|null }>>({});
  const formationMetaDebounceRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [groundSplitModal, setGroundSplitModal] = React.useState<{ strip: any } | null>(null);
  const [groundSplitSelected, setGroundSplitSelected] = React.useState<number[]>([]);
  const [groundMergeModal, setGroundMergeModal] = React.useState<{ strip: any; siblings: any[] } | null>(null);
  const [groundMergeConfirm, setGroundMergeConfirm] = React.useState<{ targetId: string; sourceId: string; targetName: string; sourceName: string } | null>(null);
  const [sidPreStep, setSidPreStep] = React.useState<boolean>(false);
  const [sidPartialSelected, setSidPartialSelected] = React.useState<number[]>([]);
  const [sidRunwayName, setSidRunwayName] = React.useState<string | null>(null);
  const [sidRunwayRouteId, setSidRunwayRouteId] = React.useState<number | null>(null);
  const [runwayConflicts, setRunwayConflicts] = React.useState<Record<number, {id:number;call_sign:string;callsign:string}[]>>({});

  // Reset runway step state when sidModal closes; load conflicts when it opens
  React.useEffect(() => {
    if (!sidModal) {
      setSidRunwayName(null);
      setSidRunwayRouteId(null);
      setRunwayConflicts({});
      return;
    }
    const afId = airfield?.id ?? null;
    const runwayRoutes = (airfieldRoutes || []).filter((r: any) => r.is_runway && (afId ? Number(r.airfield_id) === Number(afId) : false));
    if (runwayRoutes.length === 0) return;
    Promise.all(runwayRoutes.map((r: any) =>
      fetch(`${API_URL}/runway-conflict?route_id=${r.id}`).then(res => res.ok ? res.json() : []).then((c: any[]) => ({ id: r.id, conflicts: c }))
    )).then(results => {
      const map: Record<number, any[]> = {};
      results.forEach(({ id, conflicts }) => { map[id] = conflicts; });
      setRunwayConflicts(map);
    }).catch(() => {});
  }, [sidModal?.strip?.id, sidModal?.idx]);

  // Load armaments + systems for all visible aircraft
  React.useEffect(() => {
    const allAcIds: number[] = [];
    Object.values(stripAircraftData).forEach(rows => {
      rows.forEach((r: GroundAircraftRow) => { if (r.id) allAcIds.push(r.id); });
    });
    if (allAcIds.length === 0) return;
    Promise.all([
      fetch(`${API_URL}/strip-aircraft-armaments/bulk?aircraft_ids=${allAcIds.join(',')}`).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/strip-aircraft-systems/bulk?aircraft_ids=${allAcIds.join(',')}`).then(r => r.ok ? r.json() : [])
    ]).then(([arms, syss]) => {
      const armsByAc: Record<number, any[]> = {};
      arms.forEach((a: any) => { if (!armsByAc[a.strip_aircraft_id]) armsByAc[a.strip_aircraft_id] = []; armsByAc[a.strip_aircraft_id].push(a); });
      const sysByAc: Record<number, any[]> = {};
      syss.forEach((s: any) => { if (!sysByAc[s.strip_aircraft_id]) sysByAc[s.strip_aircraft_id] = []; sysByAc[s.strip_aircraft_id].push(s); });
      setAcArmaments(armsByAc);
      setAcSystems(sysByAc);
    }).catch(console.error);
  }, [stripAircraftData]);

  // Load formation summary for all visible strips
  React.useEffect(() => {
    strips.forEach((strip: any) => {
      fetch(`${API_URL}/strips/${strip.id}/formation-summary`)
        .then(r => r.ok ? r.json() : null)
        .then((data: any) => { if (data) setFormationSummary(prev => ({ ...prev, [String(strip.id)]: data })); })
        .catch(() => {});
    });
  }, [strips.length]);

  // Load default armament/system names for autocomplete
  React.useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/default-armament-names`).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/default-system-names`).then(r => r.ok ? r.json() : [])
    ]).then(([arms, syss]) => {
      setDefaultArmamentNames((arms as any[]).map((a: any) => a.name));
      setDefaultSystemNames((syss as any[]).map((s: any) => s.name));
    }).catch(() => {});
  }, []);

  // Sync stripFormationMeta from strips prop (only init new strips, don't override editing state)
  React.useEffect(() => {
    setStripFormationMeta(prev => {
      const next = { ...prev };
      strips.forEach((strip: any) => {
        const sid = String(strip.id);
        if (next[sid] === undefined) {
          next[sid] = { notes: strip.formation_notes || '', parentCallsign: strip.parent_callsign || '', takeoffAirfieldId: null, landingAirfieldId: null };
        }
      });
      return next;
    });
  }, [strips]);

  const refreshFormationSummary = (stripId: string) => {
    fetch(`${API_URL}/strips/${stripId}/formation-summary`)
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => { if (data) setFormationSummary(prev => ({ ...prev, [stripId]: data })); })
      .catch(() => {});
  };

  const getFormationSiblings = (strip: any): any[] => {
    const parentCs = (stripFormationMeta[String(strip.id)]?.parentCallsign) || strip.parent_callsign || '';
    const parentId = strip.parent_strip_id;
    const baseCs = strip.callSign || strip.callsign || '';
    const myIndices: number[] | null = Array.isArray(strip.aircraft_indices) && strip.aircraft_indices.length > 0
      ? strip.aircraft_indices : null;
    const myOrigCount = strip.original_formation_count;
    return strips.filter((s: any) => {
      if (String(s.id) === String(strip.id)) return false;
      const sCs = (stripFormationMeta[String(s.id)]?.parentCallsign) || s.parent_callsign || '';
      if (parentCs && sCs && parentCs === sCs) return true;
      if (parentId && s.parent_strip_id && String(s.parent_strip_id) === String(parentId)) return true;
      // Fallback: same base callsign + both are partial formations (have aircraft_indices)
      const theirIndices: number[] | null = Array.isArray(s.aircraft_indices) && s.aircraft_indices.length > 0
        ? s.aircraft_indices : null;
      if (myIndices && theirIndices && baseCs && (s.callSign || s.callsign) === baseCs) {
        const sameOrigCount = !myOrigCount || !s.original_formation_count ||
          String(myOrigCount) === String(s.original_formation_count);
        if (sameOrigCount) return true;
      }
      return false;
    });
  };

  const doSplitFormation = async (strip: any, selectedIndices: number[]) => {
    setGroundSplitModal(null);
    if (onSplitPartial) {
      await onSplitPartial(String(strip.id), selectedIndices);
    }
  };

  const doMergeFormations = async (targetId: string, sourceId: string) => {
    setGroundMergeConfirm(null);
    setGroundMergeModal(null);
    if (onMergePartial) {
      await onMergePartial(targetId, sourceId);
    }
  };
  const addArmament = async (aircraftId: number) => {
    const row = await fetch(`${API_URL}/strip-aircraft-armaments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strip_aircraft_id: aircraftId, armament_name: '', quantity: 1 }) }).then(r => r.json());
    setAcArmaments(prev => ({ ...prev, [aircraftId]: [...(prev[aircraftId] || []), row] }));
    return row;
  };
  const updateArmament = async (id: number, aircraftId: number, name: string, qty: number) => {
    const row = await fetch(`${API_URL}/strip-aircraft-armaments/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ armament_name: name, quantity: qty }) }).then(r => r.json());
    setAcArmaments(prev => ({ ...prev, [aircraftId]: (prev[aircraftId] || []).map((r: any) => r.id === id ? row : r) }));
  };
  const deleteArmament = async (id: number, aircraftId: number) => {
    await fetch(`${API_URL}/strip-aircraft-armaments/${id}`, { method: 'DELETE' });
    setAcArmaments(prev => ({ ...prev, [aircraftId]: (prev[aircraftId] || []).filter((r: any) => r.id !== id) }));
  };
  const addSystem = async (aircraftId: number) => {
    const row = await fetch(`${API_URL}/strip-aircraft-systems`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strip_aircraft_id: aircraftId, system_name: '', status: 'שמיש' }) }).then(r => r.json());
    setAcSystems(prev => ({ ...prev, [aircraftId]: [...(prev[aircraftId] || []), row] }));
    return row;
  };
  const updateSystem = async (id: number, aircraftId: number, name: string, status: string) => {
    const row = await fetch(`${API_URL}/strip-aircraft-systems/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system_name: name, status }) }).then(r => r.json());
    setAcSystems(prev => ({ ...prev, [aircraftId]: (prev[aircraftId] || []).map((r: any) => r.id === id ? row : r) }));
  };
  const deleteSystem = async (id: number, aircraftId: number) => {
    await fetch(`${API_URL}/strip-aircraft-systems/${id}`, { method: 'DELETE' });
    setAcSystems(prev => ({ ...prev, [aircraftId]: (prev[aircraftId] || []).filter((r: any) => r.id !== id) }));
  };
  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [taxiInstModal, setTaxiInstModal] = React.useState<{ stripId: string; idx: number | null } | null>(null);
  const [taxiDestRouteId, setTaxiDestRouteId] = React.useState<number | null>(null);
  const [taxiViaRouteIds, setTaxiViaRouteIds] = React.useState<number[]>([]);
  const [hoveredDensePtId, setHoveredDensePtId] = React.useState<number | null>(null);
  React.useEffect(() => {
    return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); };
  }, []);
  const UNDO_DURATION_OPTIONS = [3000, 6000, 10000] as const;
  const [undoDurationMs, setUndoDurationMs] = React.useState<number>(() => {
    if (initialUndoDurationMs && (UNDO_DURATION_OPTIONS as readonly number[]).includes(initialUndoDurationMs)) {
      return initialUndoDurationMs;
    }
    try {
      const stored = localStorage.getItem('groundUndoDurationMs');
      if (stored) {
        const parsed = Number(stored);
        if ((UNDO_DURATION_OPTIONS as readonly number[]).includes(parsed)) return parsed;
      }
    } catch { /* ignore */ }
    return 6000;
  });
  const isFirstUndoMount = React.useRef(true);
  React.useEffect(() => {
    if (isFirstUndoMount.current) { isFirstUndoMount.current = false; return; }
    try { localStorage.setItem('groundUndoDurationMs', String(undoDurationMs)); } catch { /* ignore */ }
    if (crewMemberId) {
      fetch(`${API_URL}/crew-members/${crewMemberId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ undo_duration_ms: undoDurationMs })
      }).catch(() => {});
    }
  }, [undoDurationMs]);

  const getAircraftPositions = (strip: any): AircraftPos[] => normalizeAircraftPositions(strip);

  const [datkShowMinutes, setDatkShowMinutes] = React.useState<number | null>(() => initialDatkShowMinutes ?? null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(iv);
  }, []);

  // Track actual rendered image bounds (objectFit:contain letterboxing compensation)
  const airfieldImgRef = React.useRef<HTMLImageElement>(null);
  const [imgBounds, setImgBounds] = React.useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // User-controlled map zoom & pan (= / - keys, wheel, drag)
  const [groundMapZoom, setGroundMapZoom] = React.useState(1.0);
  const [groundMapPan, setGroundMapPan] = React.useState({ x: 0, y: 0 });
  const [effectiveMapScale, setEffectiveMapScale] = React.useState(1.0);
  const groundMapDragRef = React.useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  // Keyboard zoom handler
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); setGroundMapZoom(z => Math.min(+(z * 1.25).toFixed(3), 8)); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); setGroundMapZoom(z => Math.max(+(z / 1.25).toFixed(3), 0.2)); }
      else if (e.key === '0' && !e.ctrlKey && !e.metaKey) { setGroundMapZoom(1); setGroundMapPan({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const updateImgBounds = React.useCallback(() => {
    const img = airfieldImgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) { setImgBounds(null); return; }
    const c = img.parentElement; if (!c) { setImgBounds(null); return; }
    // Use clientWidth/clientHeight (logical, pre-transform) so imgBounds stays stable
    // when the user zooms/pans (CSS transform doesn't affect clientWidth/clientHeight).
    const cW = c.clientWidth, cH = c.clientHeight;
    const iAspect = img.naturalWidth / img.naturalHeight;
    const cAspect = cW / cH;
    let w: number, h: number, left: number, top: number;
    if (iAspect > cAspect) {
      // image wider than container — fills by width, letterboxes top/bottom
      w = cW; h = cW / iAspect;
      left = 0; top = (cH - h) / 2;
    } else {
      // image taller than container — fills by height, letterboxes left/right
      h = cH; w = cH * iAspect;
      left = (cW - w) / 2; top = 0;
    }
    setImgBounds({ left, top, width: w, height: h });
  }, []);
  React.useEffect(() => {
    const img = airfieldImgRef.current;
    if (!img) return;
    const ro = new ResizeObserver(updateImgBounds);
    if (img.parentElement) ro.observe(img.parentElement);
    return () => ro.disconnect();
  }, [updateImgBounds, airfieldMapSrc]);

  // When a transfer is dragged to a map point, accept it then auto-assign aircraft to that point
  React.useEffect(() => {
    if (!pendingPointAssign) return;
    // Transfer strip_ids are plain integers; strips array uses 's'-prefixed IDs — match either form
    const raw = String(pendingPointAssign.stripId).replace(/^s/, '');
    const strip = strips.find(s => String(s.id).replace(/^s/, '') === raw);
    if (!strip) return;
    const positions = getAircraftPositions(strip);
    const updated = positions.map(x => ({ ...x, point_id: pendingPointAssign.pointId }));
    onUpdateAircraft(String(strip.id), updated);
    setPendingPointAssign(null);
  }, [strips, pendingPointAssign]);

  // Load element nav routing data for this airfield
  React.useEffect(() => {
    const afId = airfield?.id;
    if (!afId) { setElemNavData({}); return; }
    fetch(`${API_URL}/element-nav?airfield_id=${afId}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const d: Record<number, { fromPointId: number|null; toPointId: number|null; viaRouteIds: number[] }> = {};
        rows.forEach((r: any) => { d[r.element_id] = { fromPointId: r.from_point_id ?? null, toPointId: r.to_point_id ?? null, viaRouteIds: Array.isArray(r.via_route_ids) ? r.via_route_ids : [] }; });
        setElemNavData(d);
      }).catch(() => {});
  }, [airfield?.id]);

  // Convert % coordinates to absolute px within the rendered image area
  const ptPos = (x_pct: number, y_pct: number) => imgBounds
    ? { left: `${imgBounds.left + (x_pct / 100) * imgBounds.width}px`, top: `${imgBounds.top + (y_pct / 100) * imgBounds.height}px` }
    : { left: `${x_pct}%`, top: `${y_pct}%` };

  const [showConflictPanel, setShowConflictPanel] = React.useState(false);

  const routeConflicts = React.useMemo(() => {
    const conflicts: { vehicleName: string; vehicleId: number; elementName: string; elementId: number; routeNames: string[]; status: string }[] = [];
    if (!airfieldElements || !airfieldRoutes) return conflicts;
    Object.entries(elemNavData).forEach(([elIdStr, nav]) => {
      if (!nav.viaRouteIds.length) return;
      const vehicle = airfieldElements.find((e: any) => e.id === Number(elIdStr));
      if (!vehicle) return;
      airfieldElements.forEach((el: any) => {
        if (el.id === Number(elIdStr)) return;
        const relRoutes: number[] = Array.isArray(el.relevant_routes) ? el.relevant_routes : [];
        const blockStatuses: string[] = Array.isArray(el.blocking_statuses) ? el.blocking_statuses : [];
        if (!relRoutes.length || !blockStatuses.length) return;
        const overlapping = nav.viaRouteIds.filter(rid => relRoutes.includes(rid));
        if (!overlapping.length) return;
        // Map display_state → Hebrew label so "סגור" blocking config matches display_state='close'
        const dState = el.display_state || 'normal';
        const dStateLabel: Record<string, string> = { close: 'סגור', open: 'פתוח', off: 'כבוי', stop: 'עצור', go: 'עבור', blink: 'מנצנץ' };
        const effectiveStatus = dStateLabel[dState] || el.status;
        if (!blockStatuses.includes(effectiveStatus) && !blockStatuses.includes(el.status)) return;
        const reportedStatus = blockStatuses.includes(effectiveStatus) ? effectiveStatus : el.status;
        const routeNames = overlapping.map(rid => (airfieldRoutes as any[]).find((r: any) => r.id === rid)?.name).filter(Boolean);
        conflicts.push({ vehicleName: vehicle.name, vehicleId: Number(elIdStr), elementName: el.name, elementId: el.id, routeNames, status: reportedStatus });
      });
    });
    return conflicts;
  }, [elemNavData, airfieldElements, airfieldRoutes]);

  const conflictElementIds = React.useMemo(() => new Set(routeConflicts.map(c => c.elementId)), [routeConflicts]);
  const conflictVehicleIds  = React.useMemo(() => new Set(routeConflicts.map(c => c.vehicleId)),  [routeConflicts]);

  // Yellow caution — blocking elements that are non-operational (לא שמיש)
  const malfunctionWarnings = React.useMemo(() => {
    if (!airfieldElements) return [];
    const BROKEN_STATUSES = ['לא שמיש', 'תקלה', 'מושבת', 'אינו פועל'];
    return (airfieldElements as any[]).filter(el => {
      const blockStatuses: string[] = Array.isArray(el.blocking_statuses) ? el.blocking_statuses : [];
      if (!blockStatuses.length) return false; // not a blocking element
      const effectiveStatus = el.status || '';
      return BROKEN_STATUSES.includes(effectiveStatus);
    }).map(el => ({ id: el.id, name: el.name, status: el.status }));
  }, [airfieldElements]);

  const [showMalfunctionPanel, setShowMalfunctionPanel] = React.useState(false);

  // Red conflicts suppressed when the blocking element already has a yellow malfunction warning
  const malfunctionElementIds = React.useMemo(() => new Set(malfunctionWarnings.map(w => w.id)), [malfunctionWarnings]);
  const visibleConflicts = React.useMemo(
    () => routeConflicts.filter((c: any) => !malfunctionElementIds.has(c.elementId)),
    [routeConflicts, malfunctionElementIds]
  );

  const animatedRouteIds = React.useMemo(() => {
    const ids = new Set<number>();
    Object.keys(routeAnimProgress).forEach(elIdStr => {
      const nav = elemNavData[Number(elIdStr)];
      if (nav?.viaRouteIds) nav.viaRouteIds.forEach((id: number) => ids.add(id));
    });
    return ids;
  }, [routeAnimProgress, elemNavData]);

  const DENSITY_WARN = 3; // warn when >= this many aircraft at a point
  const pointAircraftCount = React.useMemo(() => {
    const counts: Record<number, number> = {};
    strips.forEach(strip => {
      const aircraft = getAircraftPositions(strip);
      aircraft.forEach(ac => { if (ac.point_id) counts[ac.point_id] = (counts[ac.point_id] || 0) + 1; });
    });
    return counts;
  }, [strips]);

  const border = lightMode ? '#cbd5e1' : '#1e3a5f';
  const panelBg = lightMode ? '#f1f5f9' : '#0b1220';
  const headerBg = lightMode ? '#e2e8f0' : '#1e293b';
  const headerColor = lightMode ? '#374151' : '#94a3b8';

  const points: any[] = airfield?.points || [];

  // Extract datk number from point name — handles all naming variants:
  //   "5"           pure number
  //   "דת"ק 5"     with Hebrew quotes, space before number
  //   "דת"ק5"      with Hebrew quotes, no space
  //   "דתק 5"      without quotes, space before number
  //   "דתק5"       without quotes, no space
  //   "דת"ק-5"     with separator
  //   "דת״ק 3"     with Gershayim (Unicode 05F4)
  const extractDatkPointNumber = (name: string): number | null => {
    if (!name) return null;
    // Covers: optional datkPrefix (with any quote variant) + optional separator + digits
    const m = name.trim().match(/^(?:דת["״\u05F4]?ק[\s\-]?)?(\d+)$/u);
    if (m) return parseInt(m[1], 10);
    return null;
  };

  const autoDatkPlacements = React.useMemo((): Record<string, Record<number, number>> => {
    const result: Record<string, Record<number, number>> = {};
    // Pre-compute datk number for every point once
    const pointDatkNum: Record<number, number> = {};
    points.forEach((p: any) => {
      const n = extractDatkPointNumber(p.name);
      if (n != null) pointDatkNum[p.id] = n;
    });
    const useTimeWindow = datkShowMinutes != null && datkShowMinutes > 0;
    const windowMs = useTimeWindow ? datkShowMinutes! * 60 * 1000 : null;
    strips.forEach((strip: any) => {
      // If time-window filter is active, apply takeoff_time check
      if (useTimeWindow) {
        if (!strip.takeoff_time) return;
        const takeoffMs = new Date(strip.takeoff_time).getTime();
        const diff = takeoffMs - nowMs;
        if (diff < -(5 * 60 * 1000) || diff > windowMs!) return;
      }
      const acData: GroundAircraftRow[] = stripAircraftData[String(strip.id).replace(/^s/, '')] || [];
      const existingPositions = normalizeAircraftPositions(strip);
      acData.forEach((ac: GroundAircraftRow) => {
        if (ac.datk == null) return;
        const existing = existingPositions.find((p: AircraftPos) => p.idx === ac.idx);
        if (existing?.point_id) return;
        const matchPt = points.find((p: any) => pointDatkNum[p.id] === Number(ac.datk));
        if (!matchPt) return;
        if (!result[String(strip.id)]) result[String(strip.id)] = {};
        result[String(strip.id)][ac.idx] = matchPt.id;
      });
    });
    return result;
  }, [strips, stripAircraftData, points, datkShowMinutes, nowMs]);

  const getEffectivePositions = (strip: any): (AircraftPos & { isAuto?: boolean })[] => {
    const base = normalizeAircraftPositions(strip);
    const autoForStrip = autoDatkPlacements[String(strip.id)] || {};
    if (Object.keys(autoForStrip).length === 0) return base;
    // When no manual positions exist, synthesize entries from auto-placements
    if (base.length === 0) {
      return Object.entries(autoForStrip).map(([idxStr, pointId]) => ({
        idx: Number(idxStr),
        point_id: pointId as number,
        isAuto: true,
      } as AircraftPos & { isAuto: boolean }));
    }
    return base.map((ac: AircraftPos) =>
      (ac.point_id == null && autoForStrip[ac.idx] != null)
        ? { ...ac, point_id: autoForStrip[ac.idx], isAuto: true }
        : ac
    );
  };
  const parseAirfieldSids = (raw: any): { label: string; sector_ids: number[] }[] => {
    const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : []);
    return arr.map((s: any) => {
      if (typeof s === 'string') return { label: s, sector_ids: [] };
      const label = s.label || s.name || '';
      const sector_ids: number[] = Array.isArray(s.sector_ids)
        ? s.sector_ids.map(Number).filter(Boolean)
        : s.sector_id ? [Number(s.sector_id)] : [];
      return { label, sector_ids };
    });
  };

  const transferSectors = allSectors.filter(s => presetSectors.includes(s.id));

  const getContactsForSector = (sectorId: number): { presetId: number; presetName: string; contacts: any[] }[] => {
    if (!allContactsCache) return [];
    // Derive the current workstation's name so we can exclude same-name day/night variants.
    const myPresetName = allContactsCache.find(c => Number(c.preset_id) === Number(currentPresetId))?.preset_name || '';
    const byPreset = new Map<number, { presetName: string; contacts: any[] }>();
    for (const c of allContactsCache) {
      // Exclude current workstation by ID and by name (handles day/night preset variants).
      if (Number(c.preset_id) === Number(currentPresetId)) continue;
      if (myPresetName && (c.preset_name || '') === myPresetName) continue;
      let sectors: number[] = [];
      try { sectors = Array.isArray(c.relevant_sectors) ? c.relevant_sectors : (typeof c.relevant_sectors === 'string' ? JSON.parse(c.relevant_sectors) : []); } catch {}
      if (!sectors.map(Number).includes(sectorId)) continue;
      if (!byPreset.has(c.preset_id)) byPreset.set(c.preset_id, { presetName: c.preset_name || `עמדה ${c.preset_id}`, contacts: [] });
      byPreset.get(c.preset_id)!.contacts.push(c);
    }
    return Array.from(byPreset.entries()).map(([presetId, v]) => ({ presetId, ...v }));
  };

  const openSectorContacts = async (sectorId: number) => {
    if (sectorContactsOpenId === sectorId) { setSectorContactsOpenId(null); return; }
    if (!allContactsCache) {
      const data = await fetch(`${API_URL}/workstation-contacts/all`).then(r => r.ok ? r.json() : []).catch(() => []);
      setAllContactsCache(data);
    }
    setSectorContactsOpenId(sectorId);
  };

  const renderSectorContactsPanel = (sectorId: number, headerBg?: string) => {
    if (sectorContactsOpenId !== sectorId || !allContactsCache) return null;
    const groups = getContactsForSector(sectorId);
    const bg = headerBg ?? (lightMode ? '#1e3a5f' : '#1e293b');
    return (
      <div style={{ background: bg, padding: '4px 8px 6px', fontSize: '11px', direction: 'rtl' }}>
        {groups.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>{tr('shared.noContactsDefinedFor')}</div>
        ) : groups.map(g => (
          <div key={g.presetId} style={{ marginBottom: '4px' }}>
            <div style={{ fontWeight: 'bold', color: 'rgba(255,255,255,0.6)', fontSize: '9px', marginBottom: '2px', paddingBottom: '1px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>📍 {g.presetName}</div>
            {g.contacts.map((c: any) => (
              <div key={c.id} style={{ display: 'flex', gap: '5px', padding: '2px 4px', borderRadius: '3px', background: 'rgba(0,0,0,0.25)', marginBottom: '2px', alignItems: 'center', flexWrap: 'wrap' }}>
                {c.device_type && <span style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '9px', minWidth: '24px', flexShrink: 0 }}>{c.device_type}</span>}
                {c.mahut && <span style={{ color: 'rgba(255,255,255,0.75)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px' }}>{c.mahut}</span>}
                {c.oketz && <span style={{ color: '#93c5fd', fontWeight: 'bold', fontSize: '10px', flexShrink: 0 }}>{c.oketz}</span>}
                {c.frequency && <span style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: '10px', flexShrink: 0 }}>{c.frequency}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const airfieldSidList = parseAirfieldSids(airfield?.sids);
  const sidTransferEntries: { sidLabel: string; sectorId: number }[] = airfieldSidList
    .flatMap(s => s.sector_ids.map(id => ({ sidLabel: s.label, sectorId: id })));

  const handleAircraftStatusCycle = (strip: any, idx: number) => {
    const positions = getAircraftPositions(strip);
    const a = positions.find(x => x.idx === idx)!;
    const statuses: GroundStatusKey[] = ['none', 'taxi', 'lineup', 'takeoff'];
    const nextStatus = statuses[(statuses.indexOf(a.status) + 1) % statuses.length];
    if (nextStatus === 'takeoff') {
      setSidModal({ strip, idx });
      return;
    }
    const updated = positions.map(x => x.idx === idx ? { ...x, status: nextStatus } : x);
    onUpdateAircraft(String(strip.id), updated);
  };

  const handleAircraftPointAssign = (strip: any, idx: number, pointId: number | null) => {
    const positions = getAircraftPositions(strip);
    const updated = positions.map(x => x.idx === idx ? { ...x, point_id: pointId } : x);
    onUpdateAircraft(String(strip.id), updated);
  };

  const mapRef = React.useRef<HTMLDivElement>(null);
  // mapInnerRef wraps the image + overlays — receives CSS transform.
  // The sector list and layers panels stay in mapRef (outside this inner wrapper) so they are never scaled.
  const mapInnerRef = React.useRef<HTMLDivElement>(null);

  // Sector zoom: when a sector is focused, smoothly zoom + pan the map to that sector.
  // When no sector focused, apply user-controlled zoom+pan instead.
  React.useEffect(() => {
    const el = mapInnerRef.current;
    if (!el) return;
    if (!focusedSectorId) {
      if (groundMapZoom === 1 && groundMapPan.x === 0 && groundMapPan.y === 0) {
        el.style.transform = '';
        el.style.transformOrigin = '';
        el.style.transition = '';
        setEffectiveMapScale(1);
      } else {
        el.style.transformOrigin = '50% 50%';
        el.style.transition = 'transform 0.1s ease';
        el.style.transform = `translate(${groundMapPan.x}px,${groundMapPan.y}px) scale(${groundMapZoom})`;
        setEffectiveMapScale(groundMapZoom);
      }
      return;
    }
    if (!imgBounds) return;
    const sec = (airfieldSectors || []).find((s: any) => s.id === focusedSectorId);
    if (!sec) { el.style.transform = ''; setEffectiveMapScale(1); return; }
    const cW = el.offsetWidth;
    const cH = el.offsetHeight;
    const r = sec.rect || {};
    const x = (r.x ?? 10) / 100;
    const y = (r.y ?? 10) / 100;
    const w = (r.w ?? 30) / 100;
    const h = (r.h ?? 20) / 100;
    const secLeft = imgBounds.left + x * imgBounds.width;
    const secTop = imgBounds.top + y * imgBounds.height;
    const secW = w * imgBounds.width;
    const secH = h * imgBounds.height;
    if (secW < 1 || secH < 1) return;
    const scale = Math.min(cW / secW, cH / secH) * 0.88;
    const secCx = secLeft + secW / 2;
    const secCy = secTop + secH / 2;
    const tx = cW / 2 - secCx * scale;
    const ty = cH / 2 - secCy * scale;
    el.style.transformOrigin = '0 0';
    el.style.transition = 'transform 0.4s ease';
    el.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
    setEffectiveMapScale(scale);
  }, [focusedSectorId, imgBounds, airfieldSectors, groundMapZoom, groundMapPan]);

  const PANEL: React.CSSProperties = { display: 'flex', flexDirection: 'column', overflow: 'hidden', background: panelBg };
  const HDR: React.CSSProperties = { background: headerBg, color: headerColor, padding: '6px 10px', fontSize: '13px', fontWeight: 'bold', textAlign: 'center', flexShrink: 0, borderBottom: `1px solid ${border}` };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, direction: 'rtl', position: 'relative' }}>
      {/* RIGHT panel — Strips list (collapsible like aids) */}
      <div style={{ ...PANEL, width: stripsPinned ? `${rightPanelW}px` : 32, flexShrink: 0, borderInlineStart: 'none', borderLeft: `1px solid ${border}`, order: 1, transition: 'width 0.2s', overflow: 'hidden', ...(hideStrips && { display: 'none' }) }}>
        {/* Header */}
        <div style={{ background: headerBg, borderBottom: stripsPinned ? `1px solid ${border}` : 'none', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '4px 6px', gap: '4px', direction: 'rtl' }}>
          <button onClick={onTogglePin} title={stripsPinned ? 'כווץ פאנל' : 'פתח פאנל פמ"מים'}
            style={{ background: stripsPinned ? '#1e3a5f' : 'transparent', border: `1px solid ${stripsPinned ? '#3b82f6' : (lightMode ? '#cbd5e1' : '#475569')}`, borderRadius: '4px', cursor: 'pointer', fontSize: '12px', padding: '2px 5px', color: stripsPinned ? '#60a5fa' : '#94a3b8', flexShrink: 0 }}>
            📌
          </button>
          {stripsPinned && <span style={{ color: headerColor, fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', flex: 1 }}>{tr('ground.formations')}{strips.length})</span>}
          {stripsPinned && headerButtons && <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>{headerButtons}</div>}
        </div>
        {!stripsPinned && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: lightMode ? '#94a3b8' : '#64748b', fontSize: '10px', writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>{tr('ground.formations')}{strips.length})</span>
          </div>
        )}


        {/* Sort & Group toolbar */}
        <div style={{ background: lightMode ? '#f1f5f9' : '#0f1a2e', borderBottom: `1px solid ${border}`, flexShrink: 0, padding: '4px 6px', display: stripsPinned ? 'flex' : 'none', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', color: lightMode ? '#64748b' : '#94a3b8', flexShrink: 0 }}>{tr('ground.sort')}</span>
            {([
              { key: 'callsign', label: 'או"ק' },
              { key: 'squadron', label: 'טייסת' },
              { key: 'time_asc', label: 'זמן ↑' },
              { key: 'time_desc', label: 'זמן ↓' },
            ] as { key: typeof stripSortKey; label: string }[]).map(opt => (
              <button key={opt.key} onClick={() => setStripSortKey(opt.key)}
                style={{ padding: '1px 6px', fontSize: '10px', borderRadius: '3px', border: 'none', cursor: 'pointer', flexShrink: 0,
                  background: stripSortKey === opt.key ? '#6d28d9' : (lightMode ? '#cbd5e1' : '#1e293b'),
                  color: stripSortKey === opt.key ? '#fff' : (lightMode ? '#334155' : '#94a3b8'),
                  fontWeight: stripSortKey === opt.key ? 'bold' : 'normal' }}>
                {opt.label}
              </button>
            ))}
            <button onClick={() => setStripGroupBySquadron(v => !v)}
              style={{ marginInlineStart: 'auto', padding: '1px 7px', fontSize: '10px', borderRadius: '3px', border: 'none', cursor: 'pointer', flexShrink: 0,
                background: stripGroupBySquadron ? '#0369a1' : (lightMode ? '#cbd5e1' : '#1e293b'),
                color: stripGroupBySquadron ? '#fff' : (lightMode ? '#334155' : '#94a3b8'),
                fontWeight: stripGroupBySquadron ? 'bold' : 'normal' }}>
              {stripGroupBySquadron ? '▤ קיבוץ: טייסת' : '▤ קבץ לפי טייסת'}
            </button>
          </div>
        </div>

        {/* Incoming transfers zone */}
        {incomingTransfers.length > 0 && (
          <div style={{ padding: '4px', borderBottom: `1px solid ${border}`, background: lightMode ? '#eff6ff' : '#0f1f3a', flexShrink: 0 }}>
            <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>{tr('ground.awaitingAcceptance')}{incomingTransfers.length})</div>
            {incomingTransfers.map(t => (
              <div key={t.id} draggable
                onDragStart={() => setDraggingTransferId(String(t.id))}
                onDragEnd={() => setDraggingTransferId(null)}
                style={{ padding: '4px 8px', marginBottom: '3px', borderRadius: '4px', background: lightMode ? '#dbeafe' : '#1e3a5f', cursor: 'grab', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <span style={{ fontWeight: 'bold', color: lightMode ? '#1e40af' : '#93c5fd' }}>{getFormationDisplayName(t) || '?'}</span>
                  <span style={{ fontSize: '10px', color: lightMode ? '#3b82f6' : '#60a5fa', opacity: 0.8 }}>{t.from_sector_name || ''}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '10px', color: lightMode ? '#374151' : '#94a3b8' }}>{tr('ground.altitude')}</span>
                  <input
                    type="text"
                    defaultValue={t.alt || ''}
                    onClick={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                    onDragStart={e => e.stopPropagation()}
                    onBlur={e => {
                      const val = e.target.value.trim();
                      if (onUpdateStripField && val !== (t.alt || '')) {
                        onUpdateStripField(String(t.strip_id), 'alt', val);
                      }
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                    style={{ flex: 1, padding: '1px 4px', fontSize: '11px', border: `1px solid ${lightMode ? '#93c5fd' : '#1e3a5f'}`, borderRadius: '3px', background: lightMode ? '#fff' : '#0f172a', color: lightMode ? '#1e40af' : '#93c5fd', minWidth: 0 }}
                  />
                  <button
                    onClick={e => { e.stopPropagation(); onAcceptTransfer(String(t.id)); }}
                    title={tr('shared.acceptTransfer')}
                    style={{ padding: '2px 8px', background: '#166534', color: '#86efac', border: 'none', borderRadius: '3px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0 }}>
                    {tr('shared.accept')}
                  </button>
                </div>
                <div style={{ fontSize: '9px', color: lightMode ? '#3b82f6' : '#60a5fa', opacity: 0.6, marginTop: '2px', textAlign: 'center' }}>{tr('ground.dragToAPoint')}</div>
              </div>
            ))}
          </div>
        )}

        {/* Strip cards list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px', minHeight: 0 }}>
          {strips.length === 0 && <div style={{ color: headerColor, fontSize: '12px', textAlign: 'center', padding: '20px', opacity: 0.5 }}>{tr('shared.noFormations')}</div>}
          {groundDisplayItems.map((item, itemIdx) => {
            if (item.type === 'header') {
              const colState = squadronCollapse[item.label] ?? 'open';
              const cycleCollapse = () => setSquadronCollapse(prev => {
                const cur = prev[item.label] ?? 'open';
                const next = cur === 'open' ? 'half' : cur === 'half' ? 'closed' : 'open';
                return { ...prev, [item.label]: next };
              });
              const stateIcon = colState === 'open' ? '▼' : colState === 'half' ? '▶' : '▶▶';
              const stateHint = colState === 'open' ? 'לחץ להצגת 5 ראשונים' : colState === 'half' ? 'לחץ לסגירה' : 'לחץ לפתיחה';
              const visibleCount = colState === 'open' ? item.total : colState === 'half' ? Math.min(5, item.total) : 0;
              return (
                <div key={`hdr-${item.label}-${itemIdx}`}
                  onClick={cycleCollapse}
                  title={stateHint}
                  style={{ padding: '4px 8px', marginTop: itemIdx === 0 ? 0 : '6px', marginBottom: '2px', borderRadius: '4px', background: lightMode ? '#e0f2fe' : '#0c2a45', color: lightMode ? '#0369a1' : '#38bdf8', fontSize: '11px', fontWeight: 'bold', borderRight: `3px solid ${lightMode ? '#0369a1' : '#0ea5e9'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}>
                  <span>✈ {item.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', opacity: 0.85 }}>
                    <span style={{ background: lightMode ? '#bae6fd' : '#0e3a5e', borderRadius: '9px', padding: '1px 7px', fontWeight: 700 }}>
                      {visibleCount}/{item.total}
                    </span>
                    <span style={{ fontSize: '9px' }}>{stateIcon}</span>
                  </span>
                </div>
              );
            }
            // Strip visibility gating by squadron collapse state
            if (stripGroupBySquadron) {
              const colState = squadronCollapse[item.squadronLabel] ?? 'open';
              if (colState === 'closed') return null;
              if (colState === 'half' && item.squadronIdx >= 5) return null;
            }
            const strip = item.strip;
            const aircraft = getAircraftPositions(strip);
            const isWholeDragging = dragging?.stripId === String(strip.id) && dragging?.idx === -1;
            const isExpanded = expandedStrips.has(String(strip.id));
            const toggleExpand = () => setExpandedStrips(prev => {
              const next = new Set(prev);
              next.has(String(strip.id)) ? next.delete(String(strip.id)) : next.add(String(strip.id));
              return next;
            });
            const sid = String(strip.id);
            const acRows = stripAircraftData[sid.replace(/^s/, '')] || [];
            const getAcRow = (idx: number): GroundAircraftRow => acRows.find(r => r.idx === idx) || { idx, datk: null, kipa: null };
            const sq = strip.sq || strip.squadron || '';
            const callSign = strip.callSign || strip.callsign || '—';
            const count = aircraft.length;

            return (
              <div key={strip.id} style={{ marginBottom: '6px', border: `1px solid ${border}`, borderRadius: '6px', overflow: 'hidden', background: lightMode ? '#ffffff' : '#0f172a', opacity: isWholeDragging ? 0.4 : 1 }}>
                {/* Collapsed header — 2 rows: row1=callSign+count, row2=squadron+time+buttons */}
                <div style={{ display: 'flex', alignItems: 'flex-start', background: lightMode ? '#e2e8f0' : '#1e293b' }}>
                  {/* Drag handle (whole strip) */}
                  <div
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ stripId: strip.id, all: true })); setDragging({ stripId: sid, idx: -1 }); }}
                    onDragEnd={() => setDragging(null)}
                    title='גרור להעברת כל הפמ"מ'
                    style={{ padding: '5px 6px 5px 8px', cursor: 'grab', userSelect: 'none', display: 'flex', flexDirection: 'column', flex: 1, gap: '2px', minWidth: 0 }}>
                    {/* Row 1: expand + callSign + count + shakadia */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                      <span style={{ opacity: 0.45, fontSize: '13px', flexShrink: 0 }}>≡</span>
                      <button
                        title={expandedStrips.has(sid) ? 'כווץ מטוסים' : 'פתח מטוסים'}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); setExpandedStrips(prev => { const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n; }); }}
                        style={{ padding: '0 2px', background: 'transparent', border: 'none', cursor: 'pointer', color: expandedStrips.has(sid) ? '#38bdf8' : headerColor, fontSize: '10px', flexShrink: 0, lineHeight: 1 }}>
                        {expandedStrips.has(sid) ? '▼' : '▶'}
                      </button>
                      <span style={{ fontWeight: 'bold', fontSize: '13px', color: strip.aircraft_indices ? '#fb923c' : (lightMode ? '#0f172a' : '#ffffff'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.3px', flex: 1, minWidth: 0 }}>{getFormationDisplayName(strip)}</span>
                      {count > 0 && <span style={{ fontSize: '12px', color: lightMode ? '#475569' : '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>×{count}</span>}
                      {/* strip_type badge */}
                      {strip.strip_type === 'אז"מ' && <span title='אז"מ' style={{ flexShrink: 0, fontSize: '11px', lineHeight: 1, padding: '1px 4px', borderRadius: '4px', background: '#7f1d1d', color: '#fca5a5', fontWeight: 700 }}>🛸</span>}
                      {strip.strip_type === 'GA' && <span title='GA' style={{ flexShrink: 0, fontSize: '11px', lineHeight: 1, padding: '1px 4px', borderRadius: '4px', background: '#14532d', color: '#86efac', fontWeight: 700 }}>✈</span>}
                      {strip.strip_type === 'מסוק אזרחי' && <span title={tr('ground.civilianHelicopter')} style={{ flexShrink: 0, fontSize: '11px', lineHeight: 1, padding: '1px 4px', borderRadius: '4px', background: '#0c4a6e', color: '#7dd3fc', fontWeight: 700 }}>🚁</span>}
                      {/* שקדיה indicator */}
                      {formationSummary[sid]?.hasShakadia && (
                        <span title={tr('ground.serviceableShkadiaInThe')} style={{ flexShrink: 0, fontSize: '12px', lineHeight: 1 }}>🌰</span>
                      )}
                    </div>
                    {/* Row 2: squadron + takeoff time */}
                    {(sq || strip.takeoff_time) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '18px' }}>
                        {sq && <span style={{ fontSize: '11px', color: lightMode ? '#2563eb' : '#60a5fa', fontWeight: 600, whiteSpace: 'nowrap' }}>✈ {sq}</span>}
                        {strip.takeoff_time && (() => {
                          const d = new Date(strip.takeoff_time);
                          const hh = String(d.getHours()).padStart(2, '0');
                          const mm = String(d.getMinutes()).padStart(2, '0');
                          const past = d.getTime() < Date.now();
                          return <span style={{ fontSize: '11px', color: past ? '#f87171' : '#facc15', fontWeight: 700, letterSpacing: '0.5px', flexShrink: 0 }}>🕐 {hh}:{mm}</span>;
                        })()}
                      </div>
                    )}
                    
                    {/* Armament summary row (collapsed view) */}
                    {(formationSummary[sid]?.armaments?.length > 0) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', paddingLeft: '18px', marginTop: '2px' }}>
                        {formationSummary[sid].armaments.map((arm, i) => (
                          <span key={i} style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '9px', background: lightMode ? '#fef3c7' : '#292524', color: lightMode ? '#92400e' : '#fcd34d', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            🚀 {arm.name} ×{arm.totalQty}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Taxi instructions badge */}
                    {(() => {
                      const pos = getAircraftPositions(strip) as any[];
                      const taxiAc = pos.filter(x => x.taxi_dest_route_id || (x.taxi_via_route_ids && x.taxi_via_route_ids.length > 0));
                      if (taxiAc.length === 0) return null;
                      const destRoute = airfieldRoutes?.find((r: any) => r.id === taxiAc[0].taxi_dest_route_id);
                      const viaRoutes = (taxiAc[0].taxi_via_route_ids || []).map((id: number) => airfieldRoutes?.find((r: any) => r.id === id)?.name).filter(Boolean);
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '18px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '10px', color: '#f59e0b' }}>🛤️</span>
                          {destRoute && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '9px', background: '#292524', color: '#fcd34d', fontWeight: 600, whiteSpace: 'nowrap' }}>→ {destRoute.name}</span>}
                          {viaRoutes.map((v: string, i: number) => <span key={i} style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '9px', background: '#1c1400', color: '#f59e0b', whiteSpace: 'nowrap' }}>{v}</span>)}
                        </div>
                      );
                    })()}
                  </div>
                  {/* Actions dropdown (פצל + אחד) — single ⋮ button to save space */}
                  {(() => {
                    const formationCount = Math.max(
                      parseInt(strip.numberOfFormation ?? strip.number_of_formation ?? '0') || 0,
                      acRows.length,
                      aircraft.length,
                      1
                    );
                    const canSplit = formationCount > 1 && !!onSplitPartial;
                    const siblings = onMergePartial ? getFormationSiblings(strip) : [];
                    const canMerge = siblings.length > 0;
                    if (!canSplit && !canMerge) return null;
                    const isOpen = openActionMenu === sid;
                    return (
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                          title={tr('ground.formationActionsSplitMerge')}
                          onClick={e => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setActionMenuRect({ left: r.left, bottom: r.bottom }); setOpenActionMenu(prev => prev === sid ? null : sid); }}
                          style={{ padding: '4px 7px', background: isOpen ? (lightMode ? '#e2e8f0' : '#374151') : 'transparent', border: `1px solid ${isOpen ? '#6b7280' : 'transparent'}`, color: isOpen ? (lightMode ? '#0f172a' : '#e2e8f0') : headerColor, cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', borderRadius: '4px', flexShrink: 0, lineHeight: 1 }}
                        >⋮</button>
                        {isOpen && (<>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={e => { e.stopPropagation(); setOpenActionMenu(null); }} />
                          <div style={{ position: 'fixed', top: (actionMenuRect?.bottom ?? 0) + 2, left: actionMenuRect?.left ?? 0, background: lightMode ? '#f8fafc' : '#1e293b', border: `1px solid ${border}`, borderRadius: '6px', zIndex: 999, minWidth: '110px', boxShadow: '0 4px 12px rgba(0,0,0,0.35)', overflow: 'hidden', direction: 'rtl' }}>
                            {canSplit && (
                              <button
                                onClick={e => { e.stopPropagation(); setOpenActionMenu(null); setGroundSplitSelected([]); setGroundSplitModal({ strip }); }}
                                style={{ display: 'block', width: '100%', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: canMerge ? `1px solid ${border}` : 'none', color: '#a78bfa', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', textAlign: 'right' }}
                              >{tr('shared.splitFormation')}</button>
                            )}
                            {canMerge && (
                              <button
                                onClick={e => {
                                  e.stopPropagation(); setOpenActionMenu(null);
                                  if (siblings.length === 1) {
                                    setGroundMergeConfirm({ targetId: String(siblings[0].id), sourceId: sid, targetName: getFormationDisplayName(siblings[0]), sourceName: getFormationDisplayName(strip) });
                                  } else {
                                    setGroundMergeModal({ strip, siblings });
                                  }
                                }}
                                style={{ display: 'block', width: '100%', padding: '9px 12px', background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', textAlign: 'right' }}
                              >{tr('shared.mergeFormation')}</button>
                            )}
                          </div>
                        </>)}
                      </div>
                    );
                  })()}
                  {/* פ"מ אב panel toggle */}
                  <button title='פ"מ אב — פרטי תצורה' onClick={e => { e.stopPropagation(); setFormationPanelStripId(prev => prev === sid ? null : sid); }}
                    style={{ padding: '6px 6px', background: 'transparent', border: 'none', cursor: 'pointer', color: formationPanelStripId === sid ? '#f59e0b' : headerColor, fontSize: '12px', flexShrink: 0 }}>
                    📋</button>
                </div>

                {/* Expanded aircraft rows — shown when strip is expanded via triangle toggle */}
                {expandedStrips.has(sid) && (
                  <div>
                    {/* Formation header row */}
                    <div style={{ padding: '4px 10px', background: lightMode ? '#f1f5f9' : '#0f172a', borderTop: `1px solid ${border}`, fontSize: '11px', color: headerColor, direction: 'rtl' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '3px' }}>
                        <span style={{ fontWeight: 'bold', color: lightMode ? '#334155' : '#94a3b8' }}>{getFormationDisplayName(strip)} {count}</span>
                        {sq && <span>- {sq}</span>}
                        {strip.takeoff_time && (() => {
                          const d = new Date(strip.takeoff_time);
                          const hh = String(d.getHours()).padStart(2, '0');
                          const mm = String(d.getMinutes()).padStart(2, '0');
                          const past = d.getTime() < Date.now();
                          return <span style={{ fontSize: '11px', color: past ? '#f87171' : '#facc15', fontWeight: 700, letterSpacing: '0.5px' }}>🕐 {hh}:{mm}</span>;
                        })()}
                        {(stripFormationMeta[sid]?.parentCallsign !== undefined ? stripFormationMeta[sid].parentCallsign : (strip.parent_callsign || '')) && (
                          <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>← {stripFormationMeta[sid]?.parentCallsign ?? strip.parent_callsign}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                        <input
                          value={stripFormationMeta[sid]?.parentCallsign !== undefined ? stripFormationMeta[sid].parentCallsign : (strip.parent_callsign || '')}
                          onChange={e => { const v = e.target.value; setStripFormationMeta(prev => ({ ...prev, [sid]: { notes: prev[sid]?.notes ?? (strip.formation_notes || ''), parentCallsign: v, takeoffAirfieldId: prev[sid]?.takeoffAirfieldId ?? null, landingAirfieldId: prev[sid]?.landingAirfieldId ?? null } })); if (formationMetaDebounceRef.current[`pc_${sid}`]) clearTimeout(formationMetaDebounceRef.current[`pc_${sid}`]); formationMetaDebounceRef.current[`pc_${sid}`] = setTimeout(() => { fetch(`${API_URL}/strips/${sid}/formation-meta`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parent_callsign: v }) }).catch(() => {}); }, 700); }}
                          placeholder='או"ק פמ מקורי'
                          style={{ width: '80px', padding: '2px 5px', background: lightMode ? '#fff' : '#0c1824', border: `1px solid ${border}`, borderRadius: '4px', color: '#f59e0b', fontSize: '10px', direction: 'rtl', outline: 'none' }}
                        />
                        <input
                          value={stripFormationMeta[sid]?.notes !== undefined ? stripFormationMeta[sid].notes : (strip.formation_notes || '')}
                          onChange={e => { const v = e.target.value; setStripFormationMeta(prev => ({ ...prev, [sid]: { parentCallsign: prev[sid]?.parentCallsign ?? (strip.parent_callsign || ''), notes: v, takeoffAirfieldId: prev[sid]?.takeoffAirfieldId ?? null, landingAirfieldId: prev[sid]?.landingAirfieldId ?? null } })); if (formationMetaDebounceRef.current[`fn_${sid}`]) clearTimeout(formationMetaDebounceRef.current[`fn_${sid}`]); formationMetaDebounceRef.current[`fn_${sid}`] = setTimeout(() => { fetch(`${API_URL}/strips/${sid}/formation-meta`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ formation_notes: v }) }).catch(() => {}); }, 700); }}
                          placeholder={tr('ground.generalNoteForThe')}
                          style={{ flex: 1, minWidth: '80px', padding: '2px 5px', background: lightMode ? '#fff' : '#0c1824', border: `1px solid ${border}`, borderRadius: '4px', color: lightMode ? '#1e293b' : '#e2e8f0', fontSize: '10px', direction: 'rtl', outline: 'none' }}
                        />
                      </div>
                      {/* שדה המראה + שדה נחיתה — FK לטבלת בסיסי תעופה */}
                      {aviationBases && aviationBases.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', marginTop: '3px' }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                          <select
                            value={(stripFormationMeta[sid]?.takeoffAirfieldId !== undefined ? stripFormationMeta[sid].takeoffAirfieldId : strip.takeoff_airfield_id) ?? ''}
                            onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null; setStripFormationMeta(prev => ({ ...prev, [sid]: { notes: prev[sid]?.notes ?? (strip.formation_notes || ''), parentCallsign: prev[sid]?.parentCallsign ?? (strip.parent_callsign || ''), takeoffAirfieldId: v, landingAirfieldId: prev[sid]?.landingAirfieldId !== undefined ? prev[sid].landingAirfieldId : (strip.landing_airfield_id ?? null) } })); if (onUpdateStripMeta) onUpdateStripMeta(sid, { takeoff_airfield_id: v }); }}
                            style={{ flex: 1, padding: '2px 4px', background: lightMode ? '#fff' : '#0c1824', border: `1px solid ${lightMode ? '#86efac' : '#166534'}`, borderRadius: '4px', color: lightMode ? '#166534' : '#86efac', fontSize: '10px', direction: 'rtl', outline: 'none' }}
                          >
                            <option value="">{tr('shared.departureAirfield')}</option>
                            {aviationBases.map((b: any) => <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>)}
                          </select>
                          <select
                            value={(stripFormationMeta[sid]?.landingAirfieldId !== undefined ? stripFormationMeta[sid].landingAirfieldId : strip.landing_airfield_id) ?? ''}
                            onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null; setStripFormationMeta(prev => ({ ...prev, [sid]: { notes: prev[sid]?.notes ?? (strip.formation_notes || ''), parentCallsign: prev[sid]?.parentCallsign ?? (strip.parent_callsign || ''), takeoffAirfieldId: prev[sid]?.takeoffAirfieldId !== undefined ? prev[sid].takeoffAirfieldId : (strip.takeoff_airfield_id ?? null), landingAirfieldId: v } })); if (onUpdateStripMeta) onUpdateStripMeta(sid, { landing_airfield_id: v }); }}
                            style={{ flex: 1, padding: '2px 4px', background: lightMode ? '#fff' : '#0c1824', border: `1px solid ${lightMode ? '#93c5fd' : '#1e3a5f'}`, borderRadius: '4px', color: lightMode ? '#1d4ed8' : '#93c5fd', fontSize: '10px', direction: 'rtl', outline: 'none' }}
                          >
                            <option value="">{tr('shared.landingAirfield')}</option>
                            {aviationBases.map((b: any) => <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                    {/* SID row — populated from airfield.sids */}
                    {airfield && (() => {
                      const airfieldSids = parseAirfieldSids(airfield.sids);
                      if (airfieldSids.length === 0) return null;
                      return (
                        <div style={{ padding: '4px 8px', background: lightMode ? '#f8fafc' : '#0a0f1a', borderTop: `1px solid ${border}`, display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <label style={{ fontSize: '10px', color: '#7dd3fc', flexShrink: 0 }}>SID:</label>
                          <select value={strip.sid || ''}
                            onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
                            onChange={e => { if (onUpdateStripMeta) onUpdateStripMeta(String(strip.id), { sid: e.target.value || null }); }}
                            style={{ padding: '1px 4px', borderRadius: '4px', border: `1px solid ${border}`, background: lightMode ? '#f8fafc' : '#0f172a', color: strip.sid ? '#93c5fd' : (lightMode ? '#94a3b8' : '#64748b'), fontSize: '11px', maxWidth: '130px', fontFamily: 'monospace' }}>
                            <option value="">—</option>
                            {airfieldSids.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
                          </select>
                        </div>
                      );
                    })()}
                    {aircraft.map(ac => {
                      const st = GROUND_STATUSES.find(s => s.key === ac.status) || GROUND_STATUSES[0];
                      const acRow = getAcRow(ac.idx);
                      const acCallSign = `${callSign}${ac.idx}`;
                      const armPanelOpen = openAcPanel?.stripId === sid && openAcPanel?.idx === ac.idx && openAcPanel?.type === 'armaments';
                      const sysPanelOpen = openAcPanel?.stripId === sid && openAcPanel?.idx === ac.idx && openAcPanel?.type === 'systems';
                      return (
                        <React.Fragment key={ac.idx}>
                        <div
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ stripId: strip.id, idx: ac.idx })); setDragging({ stripId: sid, idx: ac.idx }); }}
                          onDragEnd={() => setDragging(null)}
                          style={{ padding: '4px 8px', borderTop: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: '5px', background: st.bg + '30', userSelect: 'none', cursor: 'grab' }}>
                          <span style={{ opacity: 0.35, fontSize: '10px', flexShrink: 0 }}>⠿</span>
                          {/* Call sign + datk */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: lightMode ? '#1e293b' : '#e2e8f0', whiteSpace: 'nowrap' }}>{acCallSign}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                              <span style={{ fontSize: '10px', color: '#64748b', flexShrink: 0 }}>{tr('shared.parking')}</span>
                              <input type="number" min={1} max={9}
                                value={acRow.datk ?? ''}
                                onPointerDown={e => e.stopPropagation()}
                                onDragStart={e => e.stopPropagation()}
                                onClick={e => e.stopPropagation()}
                                onChange={e => { const v = e.target.value === '' ? null : parseInt(e.target.value); onUpdateStripAircraft(sid, ac.idx, v, acRow.kipa); }}
                                placeholder='—'
                                style={{ width: '36px', padding: '1px 4px', borderRadius: '4px', border: `1px solid ${border}`, background: lightMode ? '#f8fafc' : '#0f172a', color: lightMode ? '#1e293b' : '#e2e8f0', fontSize: '11px', textAlign: 'center' }} />
                              <VKTrigger
                                value={String(acRow.datk ?? '')}
                                onChange={v => { const n = v === '' ? null : parseInt(v); onUpdateStripAircraft(sid, ac.idx, n, acRow.kipa); }}
                                mode="numeric" label='דת"ק' size={13}
                              />
                              <span style={{ fontSize: '10px', color: '#64748b', flexShrink: 0 }}>{tr('ground.kipa')}</span>
                              <input type="text"
                                value={acRow.kipa ?? ''}
                                onPointerDown={e => e.stopPropagation()}
                                onDragStart={e => e.stopPropagation()}
                                onClick={e => e.stopPropagation()}
                                onChange={e => { onUpdateStripAircraft(sid, ac.idx, acRow.datk, e.target.value || null); }}
                                placeholder='—'
                                style={{ width: '44px', padding: '1px 4px', borderRadius: '4px', border: `1px solid ${border}`, background: lightMode ? '#f8fafc' : '#0f172a', color: lightMode ? '#1e293b' : '#e2e8f0', fontSize: '11px' }} />
                              <VKTrigger
                                value={acRow.kipa ?? ''}
                                onChange={v => { onUpdateStripAircraft(sid, ac.idx, acRow.datk, v || null); }}
                                mode="full" label="כיפה" size={13}
                              />
                            </div>
                          </div>
                          {/* פ"מ אב buttons — armaments + systems */}
                          {acRow.id && (
                            <>
                              <button onClick={e => { e.stopPropagation(); setOpenAcPanel(armPanelOpen ? null : { stripId: sid, idx: ac.idx, type: 'armaments' }); }}
                                title={`תצורה/חימושים${(acArmaments[acRow.id] || []).length > 0 ? ` (${(acArmaments[acRow.id] || []).length})` : ''}`}
                                style={{ padding: '1px 5px', borderRadius: '4px', border: `1px solid ${armPanelOpen ? '#0369a1' : '#334155'}`, background: armPanelOpen ? '#0c4a6e' : (acArmaments[acRow.id] || []).length > 0 ? '#1c2030' : 'transparent', color: '#f59e0b', cursor: 'pointer', fontSize: '11px', flexShrink: 0, position: 'relative' }}>
                                🚀{(acArmaments[acRow.id] || []).length > 0 && <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#f59e0b', color: '#000', borderRadius: '50%', width: '12px', height: '12px', fontSize: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{(acArmaments[acRow.id] || []).length}</span>}
                              </button>
                              <button onClick={e => { e.stopPropagation(); setOpenAcPanel(sysPanelOpen ? null : { stripId: sid, idx: ac.idx, type: 'systems' }); }}
                                title={`מערכות${(acSystems[acRow.id] || []).length > 0 ? ` (${(acSystems[acRow.id] || []).length})` : ''}`}
                                style={{ padding: '1px 5px', borderRadius: '4px', border: `1px solid ${sysPanelOpen ? '#0f766e' : '#334155'}`, background: sysPanelOpen ? '#042f2e' : (acSystems[acRow.id] || []).length > 0 ? '#0a2520' : 'transparent', color: '#2dd4bf', cursor: 'pointer', fontSize: '11px', flexShrink: 0, position: 'relative' }}>
                                ⚙{(acSystems[acRow.id] || []).length > 0 && <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#2dd4bf', color: '#000', borderRadius: '50%', width: '12px', height: '12px', fontSize: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{(acSystems[acRow.id] || []).length}</span>}
                              </button>
                            </>
                          )}
                          {/* Status button */}
                          <button onClick={e => { e.stopPropagation(); handleAircraftStatusCycle(strip, ac.idx); }}
                            title={st.label}
                            style={{ padding: '2px 5px', borderRadius: '8px', border: 'none', background: st.bg, color: st.color, fontSize: '10px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {st.label.split(' ').slice(-2).join(' ')}
                          </button>
                        </div>
                        {/* פ"מ אב data panel — armaments or systems editor */}
                        {acRow.id && (armPanelOpen || sysPanelOpen) && (
                          <div style={{ padding: '6px 10px 8px', background: lightMode ? '#f0f9ff' : '#071428', borderTop: `1px solid ${border}`, direction: 'rtl' }}>
                            {armPanelOpen && (
                              <div>
                                <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 'bold', marginBottom: '4px' }}>{tr('ground.armaments')} {acCallSign}</div>
                                {(acArmaments[acRow.id] || []).map((arm: any) => (
                                  <div key={arm.id} style={{ display: 'flex', gap: '4px', marginBottom: '4px', alignItems: 'center' }}>
                                    <input
                                      value={arm.armament_name}
                                      onChange={e => setAcArmaments(prev => ({ ...prev, [acRow.id!]: (prev[acRow.id!] || []).map((r: any) => r.id === arm.id ? { ...r, armament_name: e.target.value } : r) }))}
                                      onBlur={() => updateArmament(arm.id, acRow.id!, arm.armament_name, arm.quantity).then(() => refreshFormationSummary(sid))}
                                      onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
                                      placeholder={tr('ground.armamentName')}
                                      list="ground-armament-names"
                                      style={{ flex: 1, padding: '2px 6px', background: lightMode ? '#fff' : '#0f172a', border: `1px solid ${border}`, borderRadius: '4px', color: lightMode ? '#1e293b' : '#e2e8f0', fontSize: '11px', direction: 'rtl' }} />
                                    <input
                                      type="number" min={0}
                                      value={arm.quantity}
                                      onChange={e => setAcArmaments(prev => ({ ...prev, [acRow.id!]: (prev[acRow.id!] || []).map((r: any) => r.id === arm.id ? { ...r, quantity: parseInt(e.target.value) || 0 } : r) }))}
                                      onBlur={() => updateArmament(arm.id, acRow.id!, arm.armament_name, arm.quantity).then(() => refreshFormationSummary(sid))}
                                      onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
                                      style={{ width: '44px', padding: '2px 4px', background: lightMode ? '#fff' : '#0f172a', border: `1px solid ${border}`, borderRadius: '4px', color: '#f59e0b', fontSize: '11px', textAlign: 'center' }} />
                                    <button onClick={e => { e.stopPropagation(); deleteArmament(arm.id, acRow.id!).then(() => refreshFormationSummary(sid)); }} style={{ padding: '2px 6px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                                  </div>
                                ))}
                                <button onClick={e => { e.stopPropagation(); addArmament(acRow.id!).then(() => refreshFormationSummary(sid)); }} style={{ padding: '3px 10px', background: 'transparent', color: '#f59e0b', border: '1px dashed #92400e', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', marginTop: '2px' }}>{tr('ground.addArmament')}</button>
                              </div>
                            )}
                            {sysPanelOpen && (
                              <div>
                                <div style={{ fontSize: '10px', color: '#2dd4bf', fontWeight: 'bold', marginBottom: '4px' }}>{tr('ground.systems')} {acCallSign}</div>
                                {(acSystems[acRow.id] || []).map((sys: any) => (
                                  <div key={sys.id} style={{ display: 'flex', gap: '4px', marginBottom: '4px', alignItems: 'center' }}>
                                    <input
                                      value={sys.system_name}
                                      onChange={e => setAcSystems(prev => ({ ...prev, [acRow.id!]: (prev[acRow.id!] || []).map((r: any) => r.id === sys.id ? { ...r, system_name: e.target.value } : r) }))}
                                      onBlur={() => updateSystem(sys.id, acRow.id!, sys.system_name, sys.status).then(() => refreshFormationSummary(sid))}
                                      onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
                                      placeholder={tr('shared.systemName')}
                                      list="ground-system-names"
                                      style={{ flex: 1, padding: '2px 6px', background: lightMode ? '#fff' : '#0f172a', border: `1px solid ${border}`, borderRadius: '4px', color: lightMode ? '#1e293b' : '#e2e8f0', fontSize: '11px', direction: 'rtl' }} />
                                    <select
                                      value={sys.status}
                                      onChange={e => { e.stopPropagation(); updateSystem(sys.id, acRow.id!, sys.system_name, e.target.value).then(() => refreshFormationSummary(sid)); }}
                                      onPointerDown={e => e.stopPropagation()}
                                      style={{ padding: '2px 4px', background: lightMode ? '#fff' : '#0f172a', border: `1px solid ${border}`, borderRadius: '4px', color: sys.status === 'שמיש' ? '#22c55e' : sys.status === 'חלקי' ? '#f59e0b' : '#ef4444', fontSize: '10px', cursor: 'pointer' }}>
                                      <option value="שמיש">{tr('ground.serviceable')}</option>
                                      <option value="חלקי">{tr('shared.partial')}</option>
                                      <option value="לא שמיש">{tr('ground.unserviceable')}</option>
                                    </select>
                                    <button onClick={e => { e.stopPropagation(); deleteSystem(sys.id, acRow.id!).then(() => refreshFormationSummary(sid)); }} style={{ padding: '2px 6px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                                  </div>
                                ))}
                                <button onClick={e => { e.stopPropagation(); addSystem(acRow.id!).then(() => refreshFormationSummary(sid)); }} style={{ padding: '3px 10px', background: 'transparent', color: '#2dd4bf', border: '1px dashed #0f766e', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', marginTop: '2px' }}>{tr('ground.addSystem')}</button>
                              </div>
                            )}
                          </div>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Element panel (collapsible) — inside right panel, below strips list */}
        {stripsPinned && !hideElementPanel && airfieldElements && airfieldElements.length > 0 && (() => {
          const elCats = Array.from(new Set(airfieldElements.map((el: any) => el.category || 'כללי').filter(Boolean))).sort();
          const elByCat: Record<string, any[]> = {};
          airfieldElements.forEach((el: any) => { const c = el.category || 'כללי'; if (!elByCat[c]) elByCat[c] = []; elByCat[c].push(el); });
          const ESTATUS_COLORS: Record<string, string> = { 'תקין': '#22c55e', 'שמיש': '#22c55e', 'לא תקין': '#ef4444', 'תקול': '#ef4444', 'חלקי': '#f97316' };
          return (
            <div style={{ flexShrink: 0, maxHeight: elemPanelOpen ? '42%' : 'auto', display: 'flex', flexDirection: 'column', borderTop: '2px solid #452eb2', borderRadius: '1px', overflow: 'hidden' }}>
              {/* Panel toggle header */}
              <div style={{ background: '#452eb2', color: '#e4e2f0', padding: '5px 8px', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flexShrink: 0 }}
                onClick={() => setElemPanelOpen(v => !v)}>
                <span style={{ transform: elemPanelOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block', fontSize: '10px' }}>▶</span>
                {tr('ground.elements')} <span style={{ fontWeight: 'normal', opacity: 0.7, fontSize: '11px' }}>({airfieldElements.length})</span>
              </div>
              {elemPanelOpen && (
                <div style={{ flex: 1, overflowY: 'auto', direction: 'rtl' }}>
                  {elCats.map(cat => {
                    const catEls = elByCat[cat] || [];
                    const isCatCollapsed = collapsedElemCats.has(cat);
                    const isCatOnMap = catMapHighlight.has(cat);
                    return (
                      <div key={cat}>
                        {/* Category header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 8px', background: '#452eb2', border: '1px solid #452eb2', borderRadius: '0', marginTop: '2px' }}>
                          <span onClick={() => setCollapsedElemCats(prev => { const n = new Set(prev); isCatCollapsed ? n.delete(cat) : n.add(cat); return n; })}
                            style={{ flex: 1, fontSize: '11px', fontWeight: 'bold', color: '#e4e2f0', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none' }}>
                            <span style={{ fontSize: '9px', transform: isCatCollapsed ? 'rotate(0)' : 'rotate(90deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                            {cat}
                            <span style={{ fontWeight: 'normal', opacity: 0.6, fontSize: '10px' }}>({catEls.length})</span>
                          </span>
                          <button
                            onClick={() => setCatMapHighlight(prev => { const n = new Set(prev); isCatOnMap ? n.delete(cat) : n.add(cat); return n; })}
                            title={isCatOnMap ? 'הסתר הדגשה על מפה' : 'הדגש קטגוריה על המפה'}
                            style={{ padding: '2px 6px', fontSize: '10px', borderRadius: '4px', border: `1px solid ${isCatOnMap ? '#3b82f6' : '#e4e2f0'}`, background: isCatOnMap ? '#1d4ed8' : 'transparent', color: isCatOnMap ? '#bfdbfe' : '#e4e2f0', cursor: 'pointer', flexShrink: 0 }}>
                            👁
                          </button>
                        </div>
                        {/* Elements in category */}
                        {!isCatCollapsed && catEls.map((el: any) => {
                          const sc = ESTATUS_COLORS[el.status] || '#94a3b8';
                          return (
                            <div key={el.id} style={{ display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${lightMode ? '#f1f5f9' : '#1e293b'}`, background: elemEditModal?.el?.id === el.id ? (lightMode ? '#eff6ff' : '#0c1a2e') : 'transparent' }}>
                              {/* Main row */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px 4px 12px' }}>
                                <button
                                  onPointerDown={e => e.stopPropagation()}
                                  onClick={e => { e.stopPropagation(); e.preventDefault(); setHiddenElements(prev => { const n = new Set(prev); n.has(el.id) ? n.delete(el.id) : n.add(el.id); return n; }); }}
                                  title={hiddenElements.has(el.id) ? 'הצג על מפה' : 'הסתר מהמפה'}
                                  style={{ width: '22px', height: '22px', borderRadius: '4px', border: `2px solid ${hiddenElements.has(el.id) ? '#475569' : '#22c55e'}`, background: hiddenElements.has(el.id) ? '#1e293b' : '#166534', color: hiddenElements.has(el.id) ? '#64748b' : '#4ade80', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0, padding: 0, fontWeight: 'bold', touchAction: 'none' }}>
                                  {hiddenElements.has(el.id) ? '–' : '✓'}
                                </button>
                                <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: el.type_color || '#f59e0b', border: `2px solid ${sc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', flexShrink: 0 }}>{el.category === 'camera' ? '📷' : (el.type_icon || '🔧')}</span>
                                <span style={{ flex: 1, fontSize: '11px', fontWeight: 'bold', color: lightMode ? '#1e293b' : '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.name}</span>
                                {/* Status badge — clickable to cycle תקין/לא תקין */}
                                {onUpdateElement ? (
                                  <button onClick={async () => {
                                    const nextStatus = el.status === 'תקין' ? 'לא תקין' : 'תקין';
                                    await onUpdateElement(el.id, { name: el.name, category: el.category, status: nextStatus, note: el.note, display_state: el.display_state, blink_rate: el.blink_rate, open_icon_key: el.open_icon_key, close_icon_key: el.close_icon_key, rotation: el.rotation, camera_url: el.camera_url });
                                  }} title={tr('ground.clickToChangeStatus')}
                                    style={{ fontSize: '9px', fontWeight: 'bold', color: sc, background: sc + '22', padding: '1px 5px', borderRadius: '3px', border: `1px solid ${sc}44`, cursor: 'pointer', flexShrink: 0 }}>
                                    {el.status || '?'}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '9px', fontWeight: 'bold', color: sc, background: sc + '22', padding: '1px 4px', borderRadius: '3px', flexShrink: 0 }}>{el.status || '?'}</span>
                                )}
                                {el.category === 'camera' && el.camera_url && (
                                  <button onClick={() => { if (cameraPanels.some(p => p.url === el.camera_url)) return; const id = nextCamId.current++; const off = (cameraPanels.length % 6) * 28; setCameraPanels(prev => [...prev, { id, url: el.camera_url, name: el.name, dragPos: { x: 80 + off, y: 80 + off }, expanded: false }]); }}
                                    title={tr('ground.openCameraView')}
                                    style={{ padding: '2px 5px', fontSize: '11px', borderRadius: '4px', border: '1px solid #3b82f6', background: '#1e3a5f', color: '#93c5fd', cursor: 'pointer', flexShrink: 0 }}>
                                    📷
                                  </button>
                                )}
                                {(el.type_can_have_route === true || el.type_can_have_route === 'true') && (<>
                                <button onClick={() => { const existing = elemNavData[el.id] || { fromPointId: null, toPointId: null, viaRouteIds: [] }; setElemNavModal({ el, fromPointId: existing.fromPointId, toPointId: existing.toPointId, viaRouteIds: [...existing.viaRouteIds] }); }}
                                  title={tr('ground.defineARouteFor')}
                                  style={{ padding: '2px 5px', fontSize: '11px', borderRadius: '4px', border: `1px solid ${elemNavData[el.id]?.viaRouteIds?.length ? '#3b82f6' : (lightMode ? '#cbd5e1' : '#334155')}`, background: elemNavData[el.id]?.viaRouteIds?.length ? '#1e3a5f' : 'transparent', color: elemNavData[el.id]?.viaRouteIds?.length ? '#93c5fd' : (lightMode ? '#64748b' : '#64748b'), cursor: 'pointer', flexShrink: 0 }}>
                                  🛣
                                </button>
                                {routeAnimProgress[el.id] !== undefined
                                  ? <button onClick={() => stopRouteAnim(el.id)}
                                      title={tr('ground.stopAnimation')}
                                      style={{ padding: '2px 5px', fontSize: '11px', borderRadius: '4px', border: '1px solid #ef4444', background: '#450a0a', color: '#fca5a5', cursor: 'pointer', flexShrink: 0 }}>
                                      ■
                                    </button>
                                  : <button
                                      onClick={() => {
                                        if (elemNavData[el.id]?.viaRouteIds?.length > 0) {
                                          startRouteAnim(el.id, 1.0);
                                        } else {
                                          const existing = elemNavData[el.id] || { fromPointId: null, toPointId: null, viaRouteIds: [] };
                                          setElemNavModal({ el, fromPointId: existing.fromPointId, toPointId: existing.toPointId, viaRouteIds: [...existing.viaRouteIds] });
                                        }
                                      }}
                                      title={elemNavData[el.id]?.viaRouteIds?.length > 0 ? 'הפעל אנימציית נסיעה' : 'הגדר מסלול תחילה — לחץ לפתיחת חלון הגדרה'}
                                      style={{ padding: '2px 5px', fontSize: '11px', borderRadius: '4px', border: `1px solid ${elemNavData[el.id]?.viaRouteIds?.length > 0 ? '#22c55e' : '#475569'}`, background: elemNavData[el.id]?.viaRouteIds?.length > 0 ? '#052e16' : 'transparent', color: elemNavData[el.id]?.viaRouteIds?.length > 0 ? '#86efac' : '#64748b', cursor: 'pointer', flexShrink: 0 }}>
                                      ▶
                                    </button>
                                }
                                </>)}
                                {onUpdateElement && (
                                  <button onClick={() => { setElemEditModal({ el, name: el.name || '', category: el.category || '', status: el.status || 'תקין', note: el.note || '', displayState: el.display_state || 'normal', blinkRate: el.blink_rate || 1.0, openIconKey: el.open_icon_key || '', closeIconKey: el.close_icon_key || '', rotation: el.rotation || 0, cameraUrl: el.camera_url || '', hiddenOnMap: el.hidden_on_map || false }); setEditingElemField(null); }}
                                    title={tr('ground.editElement')}
                                    style={{ padding: '2px 5px', fontSize: '11px', borderRadius: '4px', border: `1px solid ${elemEditModal?.el?.id === el.id ? '#3b82f6' : (lightMode ? '#cbd5e1' : '#334155')}`, background: elemEditModal?.el?.id === el.id ? '#1d4ed8' : 'transparent', color: elemEditModal?.el?.id === el.id ? '#bfdbfe' : (lightMode ? '#64748b' : '#64748b'), cursor: 'pointer', flexShrink: 0 }}>
                                    ✏
                                  </button>
                                )}
                                {onUpdateElement && el.x_pct == null && (
                                  <button onClick={() => setPlacingExistingElement(placingExistingElement?.id === el.id ? null : el)}
                                    title={tr('ground.placeOnTheMap')}
                                    style={{ padding: '2px 5px', fontSize: '11px', borderRadius: '4px', border: `1px solid ${placingExistingElement?.id === el.id ? '#f59e0b' : (lightMode ? '#cbd5e1' : '#334155')}`, background: placingExistingElement?.id === el.id ? '#92400e' : 'transparent', color: placingExistingElement?.id === el.id ? '#fde68a' : '#f59e0b', cursor: 'pointer', flexShrink: 0 }}>
                                    📍
                                  </button>
                                )}
                              </div>
                              {/* Display state quick selector row */}
                              {onUpdateElement && (() => {
                                const rawA = el.type_allowed_statuses;
                                const allowedA: string[] = Array.isArray(rawA) ? rawA : (typeof rawA === 'string' ? (() => { try { return JSON.parse(rawA); } catch { return []; } })() : []);
                                const aToDsMap: Record<string, [string,string]> = { 'פתוח':['open','#22c55e'],'סגור':['close','#ef4444'],'מנצנץ':['blink','#f59e0b'],'כבוי':['off','#64748b'],'עצור':['stop','#ef4444'],'עבור':['go','#22c55e'],'דולק':['open','#22c55e'],'עומד':['normal','#a855f7'],'נוסע':['normal','#3b82f6'],'רגיל':['normal','#94a3b8'] };
                                const ALL_DS = [['normal','רגיל','#475569'],['blink','מהבהב','#f59e0b'],['close','סגור','#ef4444'],['open','פתוח','#22c55e'],['off','כבוי','#64748b'],['stop','עצור','#ef4444'],['go','עבור','#22c55e']] as [string,string,string][];
                                const dsRows: [string,string,string][] = allowedA.length > 0
                                  ? allowedA.map(s => { const d = aToDsMap[s]; return d ? [d[0], s, d[1]] as [string,string,string] : null; }).filter(Boolean) as [string,string,string][]
                                  : ALL_DS;
                                return (
                                  <div style={{ display: 'flex', gap: '3px', padding: '0 12px 4px 12px', flexWrap: 'wrap' }}>
                                    {dsRows.map(([key,label,color]) => (
                                      <button key={key+label}
                                        onClick={async () => { await onUpdateElement(el.id, { name: el.name, category: el.category, status: el.status, note: el.note, display_state: key, blink_rate: el.blink_rate, open_icon_key: el.open_icon_key, close_icon_key: el.close_icon_key, rotation: el.rotation, camera_url: el.camera_url }); }}
                                        style={{ padding: '1px 4px', fontSize: '8px', borderRadius: '3px', border: `1px solid ${(el.display_state || 'normal') === key ? color : '#334155'}`, background: (el.display_state || 'normal') === key ? color + '33' : 'transparent', color: (el.display_state || 'normal') === key ? color : '#64748b', cursor: 'pointer', fontWeight: (el.display_state || 'normal') === key ? 'bold' : 'normal' }}>
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

      </div>

      {/* Autocomplete datalists for armament/system names */}
      <datalist id="ground-armament-names">
        {defaultArmamentNames.map((n, i) => <option key={i} value={n} />)}
      </datalist>
      <datalist id="ground-system-names">
        {defaultSystemNames.map((n, i) => <option key={i} value={n} />)}
      </datalist>

      {/* פ"מ אב floating panel */}
      {formationPanelStripId && (() => {
        const panelStrip = strips.find((s: any) => String(s.id) === formationPanelStripId);
        if (!panelStrip) return null;
        const panelSid = formationPanelStripId;
        const panelSummary = formationSummary[panelSid];
        const panelCallSign = panelStrip.callSign || panelStrip.callsign || '?';
        const panelCount = parseInt(panelStrip.numberOfFormation ?? panelStrip.number_of_formation ?? '1') || 1;
        const panelSq = panelStrip.sq || panelStrip.squadron || '';
        const panelAcRows: GroundAircraftRow[] = stripAircraftData[String(panelSid).replace(/^s/, '')] || [];
        const panelMeta = stripFormationMeta[panelSid];
        const panelNotes = panelMeta?.notes ?? (panelStrip.formation_notes || '');
        const panelParentCallsign = panelMeta?.parentCallsign ?? (panelStrip.parent_callsign || '');
        return (
          <div style={{ position: 'fixed', top: '60px', right: '20px', width: '320px', maxHeight: '82vh', background: lightMode ? '#ffffff' : '#0f172a', border: `2px solid ${lightMode ? '#cbd5e1' : '#334155'}`, borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.55)', zIndex: 3100, display: 'flex', flexDirection: 'column', direction: 'rtl', overflow: 'hidden' }}>
            {/* Panel header */}
            <div style={{ padding: '10px 12px', background: lightMode ? '#e2e8f0' : '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px', color: lightMode ? '#1e293b' : '#e2e8f0' }}>
                  {tr('ground.parentFormation')} {panelCallSign}
                  {panelSummary?.hasShakadia && <span title={tr('shared.shkadiaServiceable')} style={{ marginRight: '5px' }}>🌰</span>}
                </span>
                <span style={{ fontSize: '11px', color: lightMode ? '#64748b' : '#94a3b8' }}>{panelCount} מטוסים{panelSq ? ` / ${panelSq}` : ''}</span>
              </div>
              <button onClick={() => setFormationPanelStripId(null)} style={{ background: 'transparent', border: 'none', color: lightMode ? '#64748b' : '#94a3b8', cursor: 'pointer', fontSize: '16px', padding: '2px 6px', lineHeight: 1 }}>✕</button>
            </div>
            {/* Panel content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Parent callsign + notes */}
              {(panelParentCallsign || panelNotes) && (
                <div style={{ padding: '7px 9px', background: lightMode ? '#fefce8' : '#1c1a08', borderRadius: '6px', border: `1px solid ${lightMode ? '#fde68a' : '#451a03'}` }}>
                  {panelParentCallsign && (
                    <div style={{ fontSize: '11px', color: '#f59e0b' }}>
                      <span style={{ fontWeight: 600 }}>{tr('ground.originalCallsign')} </span>{panelParentCallsign}
                    </div>
                  )}
                  {panelNotes && (
                    <div style={{ fontSize: '11px', color: lightMode ? '#78350f' : '#fcd34d', marginTop: panelParentCallsign ? '3px' : 0 }}>{panelNotes}</div>
                  )}
                </div>
              )}
              {/* Armament summary table */}
              {(panelSummary?.armaments?.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#f59e0b', marginBottom: '5px' }}>{tr('ground.computedArmaments')}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                    <thead>
                      <tr style={{ background: lightMode ? '#f1f5f9' : '#1e293b' }}>
                        <th style={{ padding: '3px 6px', textAlign: 'right', color: lightMode ? '#64748b' : '#94a3b8', fontWeight: 'normal' }}>{tr('ground.armament')}</th>
                        <th style={{ padding: '3px 6px', textAlign: 'center', color: lightMode ? '#64748b' : '#94a3b8', fontWeight: 'normal' }}>{tr('ground.total')}</th>
                        <th style={{ padding: '3px 6px', textAlign: 'right', color: lightMode ? '#64748b' : '#94a3b8', fontWeight: 'normal' }}>{tr('shared.aircraft')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {panelSummary!.armaments.map((arm, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${lightMode ? '#e2e8f0' : '#1e293b'}` }}>
                          <td style={{ padding: '3px 6px', color: lightMode ? '#1e293b' : '#e2e8f0' }}>{arm.name || '—'}</td>
                          <td style={{ padding: '3px 6px', textAlign: 'center', color: '#f59e0b', fontWeight: 'bold' }}>{arm.totalQty}</td>
                          <td style={{ padding: '3px 6px', color: lightMode ? '#64748b' : '#94a3b8' }}>{arm.aircraftNums.map((n: number) => `#${n}`).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Per-aircraft breakdown */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#2dd4bf', marginBottom: '6px' }}>{tr('ground.systemsBreakdownByAircraft')}</div>
                {panelAcRows.map((acRow: GroundAircraftRow) => {
                  const acCallSign = `${panelCallSign}${acRow.idx}`;
                  const armaments: any[] = acRow.id ? (acArmaments[acRow.id] || []) : [];
                  const systems: any[] = acRow.id ? (acSystems[acRow.id] || []) : [];
                  if (armaments.length === 0 && systems.length === 0) return null;
                  return (
                    <div key={acRow.idx} style={{ marginBottom: '7px', padding: '6px 8px', background: lightMode ? '#f8fafc' : '#0c1824', borderRadius: '6px', border: `1px solid ${lightMode ? '#e2e8f0' : '#1e293b'}` }}>
                      <div style={{ fontWeight: 'bold', fontSize: '11px', color: lightMode ? '#334155' : '#94a3b8', marginBottom: '4px' }}>{acCallSign}</div>
                      {armaments.length > 0 && (
                        <div style={{ fontSize: '10px', color: '#f59e0b', marginBottom: '3px' }}>
                          {armaments.map((a: any) => `${a.armament_name} ×${a.quantity}`).join(' | ')}
                        </div>
                      )}
                      {systems.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {systems.map((s: any) => (
                            <span key={s.id} style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '8px', background: s.status === 'שמיש' ? '#14532d' : s.status === 'חלקי' ? '#451a03' : '#450a0a', color: s.status === 'שמיש' ? '#86efac' : s.status === 'חלקי' ? '#fdba74' : '#fca5a5' }}>
                              {s.system_name}: {s.status}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {panelAcRows.every((r: GroundAircraftRow) => !r.id || ((!acArmaments[r.id] || acArmaments[r.id].length === 0) && (!acSystems[r.id] || acSystems[r.id].length === 0))) && (
                  <div style={{ fontSize: '10px', color: lightMode ? '#94a3b8' : '#475569', textAlign: 'center', padding: '10px' }}>{tr('ground.noSystemsArmamentsDefined')}</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}


        {/* Vehicle requests panel — now a floating panel opened from view menu */}

      {/* Resize handle: right panel ↔ center */}
      {!hideStrips && <div onPointerDown={startPanelResize('right')} title={tr('shared.dragToChangeWidth')} style={{ width: '5px', flexShrink: 0, cursor: 'col-resize', background: lightMode ? '#cbd5e1' : '#1e3a5f', order: 2, zIndex: 10, transition: 'background 0.15s', touchAction: 'none' }} onMouseEnter={e => (e.currentTarget.style.background = '#3b82f6')} onMouseLeave={e => (e.currentTarget.style.background = lightMode ? '#cbd5e1' : '#1e3a5f')} />}
      {/* CENTER — Airfield map */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', order: 3 }}>

        {/* datk filter bar */}
        {!hideStrips && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', background: lightMode ? '#e2e8f0' : '#0f172a', borderBottom: `1px solid ${border}`, flexShrink: 0, flexWrap: 'wrap', direction: 'rtl' }}>
          {/* Auto-show control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px', paddingLeft: '8px', borderLeft: `1px solid ${border}` }}>
            <span style={{ fontSize: '11px', color: datkShowMinutes ? '#34d399' : headerColor, fontWeight: 'bold', flexShrink: 0, whiteSpace: 'nowrap' }}>{tr('ground.showNextToParking')}</span>
            <input
              type="number"
              min={0}
              max={999}
              value={datkShowMinutes ?? ''}
              placeholder="דק'"
              onChange={e => {
                const v = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0);
                setDatkShowMinutes(v);
                if (onUpdatePreset) onUpdatePreset({ datk_show_minutes: v });
              }}
              title={'כמה דקות לפני המראה להציג מטוס ליד הדת"ק שלו'}
              style={{ width: '52px', padding: '2px 5px', borderRadius: '6px', border: `1px solid ${datkShowMinutes ? '#34d399' : border}`, background: datkShowMinutes ? '#052e16' : (lightMode ? '#f8fafc' : '#1e293b'), color: datkShowMinutes ? '#34d399' : headerColor, fontSize: '11px', textAlign: 'center' }}
            />
            <span style={{ fontSize: '10px', color: headerColor, flexShrink: 0 }}>{tr('ground.min')}</span>
            {datkShowMinutes != null && datkShowMinutes > 0 && (
              <button onClick={() => { setDatkShowMinutes(null); if (onUpdatePreset) onUpdatePreset({ datk_show_minutes: null }); }}
                style={{ padding: '1px 5px', borderRadius: '4px', border: '1px solid #6b7280', background: 'transparent', color: '#9ca3af', fontSize: '10px', cursor: 'pointer' }}>✕</button>
            )}
          </div>
          <span style={{ fontSize: '11px', color: headerColor, fontWeight: 'bold', flexShrink: 0 }}>{tr('ground.parkingFilter')}</span>
          {([null, 1, 2, 3, 4, 5, 6, 7, 8, 9] as (number | null)[]).map(val => {
            const active = datkFilter === val;
            return (
              <button
                key={val ?? 'all'}
                onClick={() => setDatkFilter(val)}
                style={{
                  padding: '2px 9px',
                  borderRadius: '12px',
                  border: active ? '2px solid #3b82f6' : `1px solid ${border}`,
                  background: active ? '#3b82f6' : (lightMode ? '#f8fafc' : '#1e293b'),
                  color: active ? '#fff' : headerColor,
                  fontSize: '11px',
                  fontWeight: active ? 'bold' : 'normal',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}
              >
                {val === null ? 'הכל' : `${val}+`}
              </button>
            );
          })}
          {datkFilter !== null && (
            <span style={{ fontSize: '10px', color: '#94a3b8', marginRight: '4px' }}>
              {tr('ground.highlightsParking')} {datkFilter}
            </span>
          )}
          {(datkFilter !== null || statusFilter.length > 0) && (
            <button
              onClick={() => {
                setClearSnapshot({ datkFilter, statusFilter, filterMode });
                setDatkFilter(null);
                setStatusFilter([]);
                setFilterMode('AND');
                if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
                undoTimerRef.current = setTimeout(() => {
                  setClearSnapshot(null);
                  undoTimerRef.current = null;
                }, undoDurationMs);
              }}
              title={tr('ground.clearAllFilters')}
              style={{
                padding: '2px 10px',
                borderRadius: '12px',
                border: '1px solid #ef4444',
                background: '#ef4444',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.15s',
                flexShrink: 0,
                marginRight: 'auto',
              }}
            >
              {tr('ground.clearFilters')}
            </button>
          )}
          {clearSnapshot !== null && (
            <button
              onClick={() => {
                if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
                setDatkFilter(clearSnapshot.datkFilter);
                setStatusFilter(clearSnapshot.statusFilter);
                setFilterMode(clearSnapshot.filterMode);
                setClearSnapshot(null);
              }}
              title={tr('ground.undoClearingTheFilters')}
              style={{
                position: 'relative',
                overflow: 'hidden',
                padding: '2px 10px',
                borderRadius: '12px',
                border: '1px solid #f59e0b',
                background: '#f59e0b',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.15s',
                flexShrink: 0,
                marginRight: 'auto',
                animation: 'fadeIn 0.2s ease',
              }}
            >
              {tr('shared.cancel3')}
              <div className="undo-timer-bar" style={{ animationDuration: `${undoDurationMs}ms` }} />
            </button>
          )}
          <span style={{ fontSize: '10px', color: '#64748b', flexShrink: 0, marginRight: clearSnapshot !== null ? '0' : 'auto' }}>{tr('ground.cancellationTime')}</span>
          {UNDO_DURATION_OPTIONS.map(opt => {
            const active = undoDurationMs === opt;
            return (
              <button
                key={opt}
                onClick={() => setUndoDurationMs(opt)}
                title={`זמן ביטול: ${opt / 1000} שניות`}
                style={{
                  padding: '2px 7px',
                  borderRadius: '10px',
                  border: active ? '2px solid #8b5cf6' : `1px solid ${border}`,
                  background: active ? '#8b5cf6' : (lightMode ? '#f8fafc' : '#1e293b'),
                  color: active ? '#fff' : headerColor,
                  fontSize: '10px',
                  fontWeight: active ? 'bold' : 'normal',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}
              >
                {opt / 1000}{tr('shared.s')}
              </button>
            );
          })}
        </div>}

        {/* status filter bar */}
        {!hideStrips && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', background: lightMode ? '#dde4ed' : '#0a0f1a', borderBottom: `1px solid ${border}`, flexShrink: 0, flexWrap: 'wrap', direction: 'rtl' }}>
          <span style={{ fontSize: '11px', color: headerColor, fontWeight: 'bold', flexShrink: 0 }}>{tr('ground.statusFilter')}</span>
          <button
            onClick={() => setStatusFilter([])}
            style={{
              padding: '2px 9px',
              borderRadius: '12px',
              border: statusFilter.length === 0 ? '2px solid #3b82f6' : `1px solid ${border}`,
              background: statusFilter.length === 0 ? '#3b82f6' : (lightMode ? '#f8fafc' : '#1e293b'),
              color: statusFilter.length === 0 ? '#fff' : headerColor,
              fontSize: '11px',
              fontWeight: statusFilter.length === 0 ? 'bold' : 'normal',
              cursor: 'pointer',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            {tr('admin.hkl')}
          </button>
          {GROUND_STATUSES.map(s => {
            const active = statusFilter.includes(s.key);
            return (
              <button
                key={s.key}
                onClick={() => setStatusFilter(prev => active ? prev.filter(k => k !== s.key) : [...prev, s.key])}
                style={{
                  padding: '2px 9px',
                  borderRadius: '12px',
                  border: active ? `2px solid ${s.dot}` : `1px solid ${border}`,
                  background: active ? s.bg : (lightMode ? '#f8fafc' : '#1e293b'),
                  color: active ? s.color : headerColor,
                  fontSize: '11px',
                  fontWeight: active ? 'bold' : 'normal',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: active ? s.dot : '#475569', display: 'inline-block', flexShrink: 0 }} />
                {s.label.split('—')[0].trim()}
              </button>
            );
          })}
          {statusFilter.length > 0 && (
            <span style={{ fontSize: '10px', color: '#94a3b8', marginRight: '4px' }}>
              — מדגיש סטטוס: {statusFilter.map(k => GROUND_STATUSES.find(s => s.key === k)?.label.split('—')[0].trim()).join(', ')}
            </span>
          )}
        </div>}

        {/* AND / OR combination toggle — only shown when both filters are active */}
        {!hideStrips && datkFilter !== null && statusFilter.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: lightMode ? '#f0f4f8' : '#060d18', borderBottom: `1px solid ${border}`, flexShrink: 0, direction: 'rtl' }}>
            <span style={{ fontSize: '11px', color: headerColor, fontWeight: 'bold', flexShrink: 0 }}>{tr('ground.filterCombination')}</span>
            {(['AND', 'OR'] as const).map(mode => {
              const active = filterMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  title={mode === 'AND' ? 'הצג רק מטוסים שעומדים בשני הסינונים' : 'הצג מטוסים שעומדים בלפחות אחד מהסינונים'}
                  style={{
                    padding: '2px 10px',
                    borderRadius: '12px',
                    border: active ? '2px solid #8b5cf6' : `1px solid ${border}`,
                    background: active ? '#8b5cf6' : (lightMode ? '#f8fafc' : '#1e293b'),
                    color: active ? '#fff' : headerColor,
                    fontSize: '11px',
                    fontWeight: active ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    flexShrink: 0,
                  }}
                >
                  {mode}
                </button>
              );
            })}
            <span style={{ fontSize: '10px', color: '#94a3b8', marginRight: '2px' }}>
              {filterMode === 'AND' ? '— חייב לעמוד בשני הסינונים' : '— מספיק לעמוד באחד מהסינונים'}
            </span>
          </div>
        )}

        <div ref={mapRef}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', background: airfieldMapSrc ? 'transparent' : (lightMode ? '#e2e8f0' : '#0f172a'), cursor: 'default', touchAction: 'none', userSelect: 'none' }}
          onWheel={e => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            setGroundMapZoom(z => Math.max(0.2, Math.min(8, +(z * factor).toFixed(3))));
          }}
        >
          {/* ── Live runway conflict banner — positioned above map only ── */}
          {liveRunwayConflicts && liveRunwayConflicts.length > 0 && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999, background: '#7f1d1d', borderBottom: '2px solid #dc2626', padding: '6px 14px', display: 'flex', flexDirection: 'column', gap: '5px', direction: 'rtl', animation: 'groundTakeoffFlash 0.8s ease-in-out infinite alternate' }}>
              {liveRunwayConflicts.map((rc, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <span style={{ color: '#fca5a5', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap' }}>{tr('ground.runwayConflict')} {rc.routeName}:</span>
                    {rc.conflicts.map((c, ci) => (
                      <span key={ci} style={{ color: '#fecaca', fontSize: '12px', background: '#991b1b', borderRadius: '4px', padding: '1px 7px', whiteSpace: 'nowrap' }}>
                        {c.type === 'vehicle' ? `🚗 ${c.name || 'רכב'}` : c.type === 'takeoff_clearance' ? `✈️ ${c.callsign} (אישור המראה)` : `✈️ ${c.callsign}`}
                      </span>
                    ))}
                  </div>
                  {rc.recommendations && rc.recommendations.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#fcd34d', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{tr('ground.recommendClosing')}</span>
                      {rc.recommendations.map(rec => {
                        const hebrewToDsMap: Record<string,string> = { 'מנצנץ':'blink','כבוי':'off','סגור':'close','פתוח':'open','עצור':'stop','עבור':'go','דולק':'open','רגיל':'normal' };
                        const targetHeb = rec.blocking_statuses[0] || '';
                        const targetDs = hebrewToDsMap[targetHeb] || targetHeb;
                        const curDs = rec.display_state || 'normal';
                        const alreadyBlocking = rec.blocking_statuses.some(s => (hebrewToDsMap[s] || s) === curDs);
                        const icon = rec.category === 'STOP BAR' ? '🛑' : rec.category === 'רמזורים' ? '🚦' : rec.category === 'מחסומים' ? '🚧' : '🔒';
                        return (
                          <button key={rec.id}
                            onClick={() => { if (!alreadyBlocking && targetDs && onUpdateElementDisplayState) onUpdateElementDisplayState(rec.id, targetDs); }}
                            disabled={alreadyBlocking}
                            title={alreadyBlocking ? `${rec.name} כבר פעיל (${targetHeb})` : `הפעל ${rec.name} → ${targetHeb}`}
                            style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 'bold', borderRadius: '5px', cursor: alreadyBlocking ? 'default' : 'pointer', border: `1px solid ${alreadyBlocking ? '#15803d' : '#fbbf24'}`, background: alreadyBlocking ? '#14532d' : '#92400e', color: alreadyBlocking ? '#86efac' : '#fef3c7', whiteSpace: 'nowrap', opacity: alreadyBlocking ? 0.8 : 1 }}>
                            {icon} {rec.name}{alreadyBlocking ? ' ✓' : ` → ${targetHeb}`}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Fixed UI panels (outside inner wrapper — never scaled/transformed) ── */}

          {/* Sector list panel + Add vehicle button — always visible, top-right */}
          {((airfieldSectors || []).length > 0 || onCreateElement || placingExistingElement) && (
            <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 31, direction: 'rtl', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              {/* Add vehicle button */}
              {onCreateElement && (
                <button
                  onClick={() => { setAddVehicleMode(v => !v); setVehiclePlaceModal(null); setPlacingExistingElement(null); }}
                  style={{ padding: '5px 12px', background: addVehicleMode ? '#854d0eee' : (lightMode ? '#ffffffee' : '#0f172aee'), border: `1px solid ${addVehicleMode ? '#f59e0b' : (lightMode ? '#cbd5e1' : '#1e3a5f')}`, borderRadius: '8px', color: addVehicleMode ? '#fde68a' : headerColor, fontSize: '11px', fontWeight: addVehicleMode ? 'bold' : 'normal', cursor: 'pointer', direction: 'rtl', boxShadow: '0 4px 16px #0006', whiteSpace: 'nowrap' }}
                  title={tr('ground.clickTheMapTo')}>
                  🚗 {addVehicleMode ? '← לחץ על המפה' : '+ הוסף רכב'}
                </button>
              )}
              {/* Placing existing element hint */}
              {placingExistingElement && (
                <div style={{ padding: '5px 12px', background: '#92400eee', border: '1px solid #f59e0b', borderRadius: '8px', color: '#fde68a', fontSize: '11px', fontWeight: 'bold', direction: 'rtl', boxShadow: '0 4px 16px #0006', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{tr('ground.place')}{placingExistingElement.name}{tr('ground.clickOnTheMap')}</span>
                  <button onClick={() => setPlacingExistingElement(null)} style={{ background: 'none', border: 'none', color: '#fde68a', cursor: 'pointer', fontSize: '13px', padding: '0', lineHeight: 1 }}>✕</button>
                </div>
              )}
              {/* Reset zoom button */}
              {focusedSectorId && (
                <button onClick={() => setFocusedSectorId(null)}
                  style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #22c55e', background: '#052e16ee', color: '#86efac', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 8px #0008', whiteSpace: 'nowrap' }}>
                  {tr('ground.backToTheFull')}
                </button>
              )}
              {/* Sector list — always open */}
              <div style={{ background: lightMode ? '#ffffffee' : '#0f172aee', border: `1px solid ${lightMode ? '#cbd5e1' : '#1e3a5f'}`, borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 16px #0006' }}>
                <div style={{ padding: '4px 8px', background: lightMode ? '#e2e8f0' : '#0a1628', borderBottom: `1px solid ${lightMode ? '#cbd5e1' : '#1e3a5f'}`, fontSize: '10px', fontWeight: 'bold', color: lightMode ? '#475569' : '#94a3b8' }}>{tr('ground.mapZones')}</div>
                <div style={{ padding: '4px', display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '260px', overflowY: 'auto', minWidth: '130px' }}>
                  {(airfieldSectors || []).map((sec: any) => {
                    const isFocused = focusedSectorId === sec.id;
                    const col = sec.color || '#f59e0b';
                    return (
                      <button key={sec.id}
                        onClick={() => setFocusedSectorId(isFocused ? null : sec.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 8px', borderRadius: '5px', border: `1px solid ${isFocused ? '#22c55e' : (lightMode ? '#e2e8f0' : '#334155')}`, background: isFocused ? (lightMode ? '#dcfce7' : '#052e16cc') : (lightMode ? '#f8fafc' : '#1e293bcc'), cursor: 'pointer', textAlign: 'right', width: '100%', transition: 'background 0.12s' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: col, flexShrink: 0, border: `1px solid ${col}88` }} />
                        <span style={{ fontSize: '11px', fontWeight: isFocused ? 'bold' : 'normal', color: isFocused ? (lightMode ? '#15803d' : '#86efac') : headerColor, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec.name}</span>
                        {isFocused && <span style={{ fontSize: '10px', color: '#22c55e' }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {/* Fallback reset button when no sectors exist */}
          {(airfieldSectors || []).length === 0 && focusedSectorId && (
            <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 31 }}>
              <button onClick={() => setFocusedSectorId(null)}
                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #22c55e', background: '#052e16ee', color: '#86efac', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 8px #0008' }}>
                {tr('ground.backToTheFull')}
              </button>
            </div>
          )}

          {/* Layers panel + zoom controls — top-left; toggled from תצוגה menu */}
          {showLayersPanel && (
          <div style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 30, direction: 'rtl', background: lightMode ? '#ffffffee' : '#0f172aee', border: `1px solid ${lightMode ? '#cbd5e1' : '#1e3a5f'}`, borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 16px #0006' }} data-nopan>
            <div style={{ padding: '4px 8px', background: lightMode ? '#e2e8f0' : '#0a1628', borderBottom: `1px solid ${lightMode ? '#cbd5e1' : '#1e3a5f'}`, fontSize: '10px', fontWeight: 'bold', color: lightMode ? '#475569' : '#94a3b8' }}>{tr('ground.layers')}</div>
            <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[{ key: 'polygons', label: '🔷 אזורים' }, { key: 'sectors', label: '⬛ סקטורים' }, { key: 'routes_aircraft', label: '✈ מסלולי מטוסים' }, { key: 'routes_vehicle', label: '🚗 מסלולי רכבים' }, { key: 'elements', label: '🔧 אלמנטים' }, { key: 'points', label: '📍 נקודות' }, { key: 'cameras', label: '📷 מצלמות' }].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: headerColor }}>
                  <input type="checkbox" checked={(mapLayers as any)[key]} onChange={e => setMapLayers(p => ({ ...p, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
              {airfieldTaxiways.length > 0 && onToggleTaxiwayOpenOnly && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: showTaxiwayOpenOnly ? '#38bdf8' : headerColor, marginTop: '2px', borderTop: `1px solid ${lightMode ? '#e2e8f0' : '#1e293b'}`, paddingTop: '4px' }}>
                  <input type="checkbox" checked={showTaxiwayOpenOnly} onChange={onToggleTaxiwayOpenOnly} />
                  {tr('ground.openTaxiwaysOnly')}
                </label>
              )}
            </div>
            <div style={{ padding: '3px 10px', borderTop: `1px solid ${lightMode ? '#e2e8f0' : '#1e3a5f'}`, background: lightMode ? '#f1f5f9' : '#0a1628' }}>
              <div style={{ fontSize: '9px', fontWeight: 'bold', color: lightMode ? '#64748b' : '#64748b', padding: '3px 0 3px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{tr('ground.displaySettings')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingBottom: '4px' }}>
                {[{ key: 'showRoutes', label: 'הצג מסלול נסיעה' }, { key: 'showNames', label: 'הצג שמות' }, { key: 'showStatus', label: 'הצג סטטוס' }].map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: headerColor }}>
                    <input type="checkbox" checked={(mapDisplaySettings as any)[key]} onChange={e => setMapDisplaySettings(p => ({ ...p, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {/* Zoom controls */}
            <div style={{ borderTop: `1px solid ${lightMode ? '#cbd5e1' : '#1e3a5f'}`, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'space-between' }}>
              <button onClick={() => setGroundMapZoom(z => Math.min(+(z * 1.25).toFixed(3), 8))}
                style={{ width: '22px', height: '22px', borderRadius: '4px', border: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`, background: lightMode ? '#f1f5f9' : '#1e293b', color: headerColor, cursor: 'pointer', fontSize: '14px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>+</button>
              <button onClick={() => { setGroundMapZoom(1); setGroundMapPan({ x: 0, y: 0 }); }}
                title={tr('ground.resetZoomKey0')}
                style={{ flex: 1, padding: '2px 4px', borderRadius: '4px', border: `1px solid ${groundMapZoom !== 1 || groundMapPan.x !== 0 || groundMapPan.y !== 0 ? '#6366f1' : (lightMode ? '#cbd5e1' : '#334155')}`, background: groundMapZoom !== 1 || groundMapPan.x !== 0 || groundMapPan.y !== 0 ? '#6366f122' : (lightMode ? '#f1f5f9' : '#1e293b'), color: groundMapZoom !== 1 || groundMapPan.x !== 0 || groundMapPan.y !== 0 ? '#818cf8' : headerColor, cursor: 'pointer', fontSize: '10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                {Math.round(groundMapZoom * 100)}%
              </button>
              <button onClick={() => setGroundMapZoom(z => Math.max(+(z / 1.25).toFixed(3), 0.2))}
                style={{ width: '22px', height: '22px', borderRadius: '4px', border: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`, background: lightMode ? '#f1f5f9' : '#1e293b', color: headerColor, cursor: 'pointer', fontSize: '14px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>−</button>
            </div>
            <div style={{ padding: '2px 8px 4px', fontSize: '8px', color: lightMode ? '#94a3b8' : '#475569', textAlign: 'center' }}>{tr('ground.wheelDrag')}</div>
          </div>
          )}

          {/* ── Alert panels — FIXED position relative to map container, not inner pan/zoom ── */}
          <style>{`@keyframes af-elem-blink{0%,49%{opacity:1}50%,100%{opacity:0.15}}.elem-blink{animation:af-elem-blink var(--blink-rate,1s) step-end infinite}@keyframes conflict-ring{0%{box-shadow:0 0 0 0 rgba(239,68,68,0.9),0 0 12px rgba(239,68,68,0.6);border-color:#ef4444}50%{box-shadow:0 0 0 8px rgba(239,68,68,0),0 0 24px rgba(239,68,68,0.9);border-color:#fca5a5}100%{box-shadow:0 0 0 0 rgba(239,68,68,0.9),0 0 12px rgba(239,68,68,0.6);border-color:#ef4444}}.conflict-ring{animation:conflict-ring 0.7s ease-in-out infinite}@keyframes conflict-alert-flash{0%,100%{box-shadow:0 0 16px rgba(239,68,68,0.5)}50%{box-shadow:0 0 32px rgba(239,68,68,1),0 0 60px rgba(239,68,68,0.5)}}.conflict-alert-flash{animation:conflict-alert-flash 0.8s ease-in-out infinite}@keyframes accept-green-flash{0%,100%{outline:3px solid #22c55e;outline-offset:2px;box-shadow:0 0 12px rgba(34,197,94,0.7)}50%{outline:3px solid transparent;outline-offset:2px;box-shadow:none}}.accept-green-flash{animation:accept-green-flash 0.55s ease-in-out 9;z-index:10;position:relative}@keyframes transfer-out-green-flash{0%,100%{outline:3px solid #22c55e;outline-offset:2px;box-shadow:0 0 16px rgba(34,197,94,0.8)}50%{outline:3px solid rgba(34,197,94,0.25);outline-offset:2px;box-shadow:none}}.transfer-out-flash{animation:transfer-out-green-flash 0.7s ease-in-out infinite;z-index:10;position:relative}@keyframes rw-closed-blink{0%,49%{opacity:1}50%,100%{opacity:0.15}}.rw-closed-line{animation:rw-closed-blink 0.85s step-end infinite}@keyframes voicePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(1.15)}}`}</style>

          {/* Route conflict warning panel — prominent burst alert */}
          {visibleConflicts.length > 0 && (
            <div style={{ position: 'absolute', top: '8px', left: '160px', zIndex: 900, direction: 'rtl', maxWidth: '340px', pointerEvents: 'none' }} data-nopan>
              {/* Header — always visible, flashing */}
              <div className="conflict-alert-flash"
                style={{ background: '#7f1d1d', border: '2px solid #ef4444', borderRadius: showConflictPanel ? '10px 10px 0 0' : '10px', padding: '8px 12px', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', pointerEvents: 'auto' }}
                onClick={() => setShowConflictPanel(p => !p)}>
                <span style={{ fontSize: '20px', animation: 'conflict-ring 0.7s ease-in-out infinite', display: 'inline-block' }}>🚨</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fef2f2', letterSpacing: '0.5px' }}>
                    {tr('ground.operationalAlert')}
                  </div>
                  <div style={{ fontSize: '11px', color: '#fca5a5' }}>
                    {visibleConflicts.length} {tr('ground.conflict2')}{visibleConflicts.length !== 1 ? 'ים' : ''} {tr('ground.active2')}{visibleConflicts.length !== 1 ? 'ים' : ''}
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: '#fca5a5', opacity: 0.8 }}>{showConflictPanel ? '▲' : '▼'}</span>
              </div>
              {/* Expanded details */}
              {showConflictPanel && (
                <div style={{ background: '#1a0000', border: '2px solid #ef4444', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: '0 8px 24px rgba(239,68,68,0.35)', pointerEvents: 'auto' }}>
                  {visibleConflicts.map((c, i) => (
                    <div key={i} style={{ background: '#2a0000', borderRadius: '7px', padding: '8px 10px', border: '1px solid #ef444466', borderRight: '4px solid #ef4444' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px' }}>🚗</span>
                        <span style={{ color: '#fef2f2', fontSize: '12px', fontWeight: 'bold' }}>{c.vehicleName}</span>
                      </div>
                      <div style={{ color: '#fecaca', fontSize: '11px', lineHeight: 1.5 }}>
                        {tr('ground.itsRouteCrosses')} <span style={{ color: '#f87171', fontWeight: 'bold', textDecoration: 'underline' }}>{c.elementName}</span>
                        {' '}{tr('ground.whoseStateIs')} <span style={{ background: '#450a0a', color: '#fca5a5', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>{c.status}</span>
                      </div>
                      {c.routeNames.length > 0 && (
                        <div style={{ color: '#64748b', fontSize: '10px', marginTop: '4px' }}>{tr('ground.runways')} {c.routeNames.join(', ')}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Yellow caution panel — blocking elements that are non-operational */}
          {malfunctionWarnings.length > 0 && (
            <div style={{ position: 'absolute', bottom: routeConflicts.length > 0 ? '78px' : '8px', right: '8px', zIndex: 890, direction: 'rtl', maxWidth: '320px' }} data-nopan>
              <div style={{ background: '#713f12', border: '2px solid #eab308', borderRadius: showMalfunctionPanel ? '10px 10px 0 0' : '10px', padding: '7px 11px', color: '#fef08a', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 0 12px rgba(234,179,8,0.35)' }}
                onClick={() => setShowMalfunctionPanel(p => !p)}>
                <span style={{ fontSize: '18px' }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fefce8' }}>{tr('ground.noteAnUnserviceableBlocking')}</div>
                  <div style={{ fontSize: '10px', color: '#fde047' }}>
                    {malfunctionWarnings.length} {tr('ground.element')}{malfunctionWarnings.length !== 1 ? 'ים' : ''} {tr('ground.gen')}{malfunctionWarnings.length !== 1 ? 'שים' : 'ש'} {tr('ground.note')}
                  </div>
                </div>
                <span style={{ fontSize: '10px', color: '#fde047', opacity: 0.8 }}>{showMalfunctionPanel ? '▲' : '▼'}</span>
              </div>
              {showMalfunctionPanel && (
                <div style={{ background: '#1c1400', border: '2px solid #eab308', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '5px', boxShadow: '0 8px 20px rgba(234,179,8,0.2)' }}>
                  {malfunctionWarnings.map((w, i) => (
                    <div key={i} style={{ background: '#2a1f00', borderRadius: '7px', padding: '7px 9px', border: '1px solid #eab30866', borderRight: '4px solid #eab308' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '13px' }}>🔧</span>
                        <span style={{ color: '#fefce8', fontSize: '12px', fontWeight: 'bold' }}>{w.name}</span>
                      </div>
                      <div style={{ color: '#fde047', fontSize: '11px' }}>
                        {tr('admin.mtsb')} <span style={{ background: '#422006', color: '#fbbf24', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>{w.status}</span>
                        {' '}{tr('ground.thisElementMayBlock')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Inner content wrapper — receives CSS zoom/pan transform ──
              Image + all overlays go here. The UI panels above are in mapRef and stay fixed. */}
          <div ref={mapInnerRef} style={{ position: 'absolute', inset: 0 }}>
          {airfieldMapSrc
            ? <img ref={airfieldImgRef} src={airfieldMapSrc} alt="airfield" onLoad={updateImgBounds} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none', pointerEvents: 'none' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: headerColor, fontSize: '14px', opacity: 0.5 }}>{tr('ground.noMapDefinedFor')}</div>
          }

          {/* Airfield Polygons overlay */}
          {mapLayers.polygons && imgBounds && (airfieldPolygons || []).length > 0 && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: 'absolute', top: imgBounds.top, left: imgBounds.left, width: imgBounds.width, height: imgBounds.height, zIndex: 3 }}>
              <defs></defs>
              {(airfieldPolygons || []).map((pg: any) => {
                const pts: { x: number; y: number }[] = Array.isArray(pg.polygon) ? pg.polygon : [];
                if (pts.length < 3) return null;
                const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
                const assignment = (airfieldPolygonStatuses || []).find((s: any) => Number(s.polygon_id) === Number(pg.id));
                const fillColor = assignment?.status_color || pg.color || '#3b82f6';
                const label = assignment ? `${pg.name}: ${assignment.status_name}` : pg.name;
                const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
                const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
                // GRF water drops
                const grf = assignment?.grf_status;
                const grfDrops = grf === 'רטוב' ? 3 : grf === 'חלקי' ? 1 : 0;
                // RVR visibility overlay opacity
                const rvr = assignment?.rvr_meters;
                const rvrOpacity = rvr == null ? 0 : rvr <= 200 ? 0.55 : rvr <= 600 ? 0.38 : rvr <= 1500 ? 0.22 : rvr <= 5000 ? 0.1 : 0;
                // RVR label
                const rvrLabel = rvr != null && rvr > 0 ? (rvr >= 1000 ? `${(rvr/1000).toFixed(1)}km` : `${rvr}m`) : null;
                const dropOffsets = grfDrops === 3 ? [-3, 0, 3] : grfDrops === 1 ? [0] : [];
                return (
                  <g key={pg.id} style={{ cursor: onUpdatePolygonStatus ? 'pointer' : 'default' }}
                    onClick={onUpdatePolygonStatus ? (e: React.MouseEvent<SVGGElement>) => {
                      e.stopPropagation();
                      setPolygonStatusPicker({ polygon: pg, x: e.clientX, y: e.clientY, currentStatus: assignment || null });
                    } : undefined}>
                    <polygon points={pointsStr} fill={fillColor} fillOpacity={assignment ? 0.55 : 0.2} stroke={fillColor} strokeWidth="0.5" strokeOpacity="0.9" />
                    {/* RVR visibility gray overlay */}
                    {rvrOpacity > 0 && (
                      <polygon points={pointsStr} fill="#94a3b8" fillOpacity={rvrOpacity} style={{ pointerEvents: 'none' }} />
                    )}
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="2.2" fontWeight="bold"
                      style={{ userSelect: 'none', textShadow: '0 1px 2px #0008', pointerEvents: 'none' }}>
                      {pg.name}
                    </text>
                    {assignment && (
                      <text x={cx} y={cy + 2.8} textAnchor="middle" dominantBaseline="middle" fill={fillColor} fontSize="1.9" fontWeight="bold"
                        style={{ userSelect: 'none', pointerEvents: 'none' }}>
                        {assignment.status_name}
                      </text>
                    )}
                    {/* GRF status label + drops */}
                    {grf && grf !== 'יבש' && (
                      <text x={cx} y={cy + (assignment ? 5.8 : 2.8)} textAnchor="middle" dominantBaseline="middle" fill="#60a5fa" fontSize="1.7" fontWeight="bold"
                        style={{ userSelect: 'none', pointerEvents: 'none' }}>
                        💧 {grf}
                      </text>
                    )}
                    {/* Water drops for GRF wet state */}
                    {dropOffsets.map((dx, di) => (
                      <ellipse key={di} cx={cx + dx} cy={cy - 3} rx="0.7" ry="1.1" fill="#60a5fa" fillOpacity="0.85" style={{ pointerEvents: 'none' }} />
                    ))}
                    {/* RVR label */}
                    {rvrLabel && (
                      <text x={cx} y={cy + (assignment ? (grf && grf !== 'יבש' ? 8.5 : 5.8) : (grf && grf !== 'יבש' ? 5.8 : 2.8))} textAnchor="middle" dominantBaseline="middle"
                        fill="#94a3b8" fontSize="1.6" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                        👁 {rvrLabel}
                      </text>
                    )}
                    <title>{label}{assignment?.note ? `\n${assignment.note}` : ''}{grf ? `\nGRF: ${grf}` : ''}{rvr ? `\nRVR: ${rvr}m` : ''}</title>
                  </g>
                );
              })}
            </svg>
          )}

          {/* Airfield Sectors overlay */}
          {mapLayers.sectors && imgBounds && (airfieldSectors || []).length > 0 && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: 'absolute', top: imgBounds.top, left: imgBounds.left, width: imgBounds.width, height: imgBounds.height, pointerEvents: 'all', zIndex: 4 }}>
              {(airfieldSectors || []).map((sec: any) => {
                const rr = sec.rect || {};
                const x = rr.x ?? 10;
                const y = rr.y ?? 10;
                const w = rr.w ?? 30;
                const h = rr.h ?? 20;
                if (w < 0.5 || h < 0.5) return null;
                const col = sec.color || '#f59e0b';
                const isFocused = focusedSectorId === sec.id;
                return (
                  <g key={sec.id} style={{ cursor: 'pointer' }} onClick={() => setFocusedSectorId(isFocused ? null : sec.id)}>
                    <rect x={x} y={y} width={w} height={h} fill={col} fillOpacity={isFocused ? 0.15 : 0.08}
                      stroke={isFocused ? '#22c55e' : col} strokeWidth={isFocused ? 1.2 : 0.6}
                      strokeDasharray={isFocused ? undefined : '2,1.2'}
                      style={isFocused ? { filter: 'drop-shadow(0 0 3px #22c55e)' } : undefined} />
                    <text x={x + w / 2} y={y + 1.6} textAnchor="middle" dominantBaseline="hanging" fill={isFocused ? '#22c55e' : col} fontSize="2.4" fontWeight="bold"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {sec.name}
                    </text>
                    {sec.description && (
                      <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="middle" fill={col} fontSize="1.7" fillOpacity="0.8"
                        style={{ userSelect: 'none', pointerEvents: 'none' }}>
                        {sec.description}
                      </text>
                    )}
                    {isFocused && (
                      <text x={x + w - 0.4} y={y + 0.4} textAnchor="end" dominantBaseline="hanging" fill="#22c55e" fontSize="2" fontWeight="bold"
                        style={{ userSelect: 'none', pointerEvents: 'none' }}>✕</text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          {/* Route lines overlay */}
          {(mapLayers.routes_aircraft || mapLayers.routes_vehicle || animatedRouteIds.size > 0) && imgBounds && airfieldRoutes && airfieldRoutes.some((r: any) => { const p = Array.isArray(r.route_path) ? r.route_path : (typeof r.route_path === 'string' ? JSON.parse(r.route_path) : []); return p.length >= 2; }) && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: 'absolute', top: imgBounds.top, left: imgBounds.left, width: imgBounds.width, height: imgBounds.height, pointerEvents: 'none', zIndex: 2 }}>
              {(airfieldRoutes || []).map((r: any) => {
                const cat = r.route_category || 'general';
                const isVehicle = cat === 'vehicle';
                if (isVehicle && !mapLayers.routes_vehicle && !animatedRouteIds.has(r.id)) return null;
                if (!isVehicle && !mapLayers.routes_aircraft) return null;
                const pts: {x:number;y:number}[] = Array.isArray(r.route_path) ? r.route_path : (typeof r.route_path === 'string' ? JSON.parse(r.route_path) : []);
                if (pts.length < 2) return null;
                const col = r.color || '#3b82f6';
                const labelPts = [pts[0], pts[pts.length - 1]];
                return (
                  <g key={r.id}>
                    {isVehicle
                      ? <polyline points={pts.map((p: any) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={col} strokeWidth="0.3" strokeDasharray="1.8,1.1" strokeLinecap="round" />
                      : <polyline points={pts.map((p: any) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={col} strokeWidth="0.2" />
                    }
                    {labelPts.map((lp: any, li: number) => (
                      <g key={li}>
                        <circle cx={lp.x} cy={lp.y} r="1.6" fill={col} opacity="0.9" />
                        <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="0.9" fontWeight="bold" style={{ userSelect: 'none' }}>{r.name}</text>
                      </g>
                    ))}
                    {r.notes && <title>{r.notes}</title>}
                  </g>
                );
              })}
            </svg>
          )}

          {/* ── Closed-runway blinking red line overlay ── */}
          {imgBounds && (airfieldRunways || []).some((rw: any) =>
            rw.start_x_pct != null && rw.end_x_pct != null &&
            (airfieldRunwayNotams || []).some((n: any) => n.runway_id === rw.id && n.notam_type === 'closed')
          ) && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: 'absolute', top: imgBounds.top, left: imgBounds.left, width: imgBounds.width, height: imgBounds.height, pointerEvents: 'none', zIndex: 16 }}>
              {(airfieldRunways || []).map((rw: any) => {
                if (rw.start_x_pct == null || rw.end_x_pct == null) return null;
                const isClosedRw = (airfieldRunwayNotams || []).some((n: any) => n.runway_id === rw.id && n.notam_type === 'closed');
                if (!isClosedRw) return null;
                return (
                  <g key={rw.id} className="rw-closed-line">
                    <line
                      x1={rw.start_x_pct} y1={rw.start_y_pct}
                      x2={rw.end_x_pct}   y2={rw.end_y_pct}
                      stroke="#7f1d1d" strokeWidth="2.2" strokeLinecap="round"
                    />
                    <line
                      x1={rw.start_x_pct} y1={rw.start_y_pct}
                      x2={rw.end_x_pct}   y2={rw.end_y_pct}
                      stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round"
                      strokeDasharray="2.5,1.5"
                    />
                    <line
                      x1={rw.start_x_pct} y1={rw.start_y_pct}
                      x2={rw.end_x_pct}   y2={rw.end_y_pct}
                      stroke="#fca5a5" strokeWidth="0.4" strokeLinecap="round"
                      opacity="0.6"
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {/* Nav route highlights — trimmed at intersection points */}
          {mapDisplaySettings.showRoutes && imgBounds && Object.entries(elemNavData).map(([elIdStr, nav]) => {
            if (!nav.viaRouteIds.length && !nav.fromPointId && !nav.toPointId) return null;
            const el = (airfieldElements || []).find((e: any) => e.id === Number(elIdStr));
            if (!el || el.x_pct == null) return null;

            // Helpers
            const parsePts = (route: any): {x:number;y:number}[] =>
              Array.isArray(route.route_path) ? route.route_path
              : (typeof route.route_path === 'string' ? (() => { try { return JSON.parse(route.route_path); } catch { return []; } })() : []);

            const segCross = (p1:{x:number;y:number}, p2:{x:number;y:number}, p3:{x:number;y:number}, p4:{x:number;y:number}): {x:number;y:number}|null => {
              const d1x=p2.x-p1.x, d1y=p2.y-p1.y, d2x=p4.x-p3.x, d2y=p4.y-p3.y;
              const denom = d1x*d2y - d1y*d2x;
              if (Math.abs(denom) < 1e-10) return null;
              const t = ((p3.x-p1.x)*d2y - (p3.y-p1.y)*d2x) / denom;
              const u = ((p3.x-p1.x)*d1y - (p3.y-p1.y)*d1x) / denom;
              if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { x: p1.x+t*d1x, y: p1.y+t*d1y };
              return null;
            };

            const polylineIntersect = (pts1:{x:number;y:number}[], pts2:{x:number;y:number}[]): {pt:{x:number;y:number};si:number;sj:number}|null => {
              for (let i=0; i<pts1.length-1; i++)
                for (let j=0; j<pts2.length-1; j++) {
                  const pt = segCross(pts1[i], pts1[i+1], pts2[j], pts2[j+1]);
                  if (pt) return { pt, si: i, sj: j };
                }
              return null;
            };

            // Build route objects
            const routeObjs: ({id:number;pts:{x:number;y:number}[];color:string;category:string}|null)[] = nav.viaRouteIds.map((rid: number) => {
              const route = (airfieldRoutes || []).find((r: any) => r.id === rid);
              if (!route) return null;
              const pts = parsePts(route);
              return pts.length >= 2 ? { id: rid, pts, color: route.color || '#3b82f6', category: route.route_category || 'general' } : null;
            });

            // Resolve from/to nav points early (needed for direction normalisation below)
            const fromPt = nav.fromPointId ? (points as any[]).find((p: any) => p.id === nav.fromPointId) : null;
            const toPt   = nav.toPointId   ? (points as any[]).find((p: any) => p.id === nav.toPointId)   : null;

            // Normalize route directions so each route points in the correct travel direction.
            // When two consecutive routes don't geometrically cross, we use endpoint proximity
            // to determine which end of the next route to enter from — and reverse its pts if needed.
            const NEAR_EP2_disp = 8 * 8; // % units squared
            const ptD2_disp = (a:{x:number;y:number}, b:{x:number;y:number}) => (a.x-b.x)**2 + (a.y-b.y)**2;
            // Normalise first route direction based on fromPt
            if (fromPt && routeObjs[0]) {
              const r0 = routeObjs[0]!;
              const dToStart = ptD2_disp({ x: fromPt.x_pct, y: fromPt.y_pct }, r0.pts[0]);
              const dToEnd   = ptD2_disp({ x: fromPt.x_pct, y: fromPt.y_pct }, r0.pts[r0.pts.length - 1]);
              if (dToEnd < dToStart) {
                routeObjs[0] = { ...r0, pts: [...r0.pts].reverse() };
              }
            }
            // Normalise each subsequent route relative to the previous route's exit point
            for (let i = 0; i < routeObjs.length - 1; i++) {
              const r1 = routeObjs[i], r2 = routeObjs[i+1];
              if (!r1 || !r2) continue;
              // Skip if they already cross geometrically — intersection handles trimming
              if (polylineIntersect(r1.pts, r2.pts)) continue;
              // r1's "exit point" is its last pt after any prior normalisation
              const exitPt = r1.pts[r1.pts.length - 1];
              const dToR2Start = ptD2_disp(exitPt, r2.pts[0]);
              const dToR2End   = ptD2_disp(exitPt, r2.pts[r2.pts.length - 1]);
              // If r1's exit is closer to r2's END, reverse r2 so travel enters at index 0
              if (dToR2End < dToR2Start && dToR2End <= NEAR_EP2_disp) {
                routeObjs[i + 1] = { ...r2, pts: [...r2.pts].reverse() };
              }
            }

            // Compute intersection between each consecutive pair
            const intersections: ({pt:{x:number;y:number};si:number;sj:number}|null)[] = [];
            for (let i=0; i<routeObjs.length-1; i++) {
              const r1 = routeObjs[i], r2 = routeObjs[i+1];
              intersections.push(r1 && r2 ? polylineIntersect(r1.pts, r2.pts) : null);
            }

            // Foot-of-perpendicular helper: returns {foot, segIdx} for closest point on polyline
            const footOnPoly = (pts: {x:number;y:number}[], px: number, py: number): {foot:{x:number;y:number};segIdx:number} => {
              let best = pts[0], bestD = Infinity, bestSeg = 0;
              for (let i = 0; i < pts.length - 1; i++) {
                const ax=pts[i].x, ay=pts[i].y, bx=pts[i+1].x, by=pts[i+1].y;
                const dx=bx-ax, dy=by-ay, lenSq=dx*dx+dy*dy;
                if (lenSq < 1e-10) continue;
                const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/lenSq));
                const cx=ax+t*dx, cy=ay+t*dy;
                const d=(px-cx)*(px-cx)+(py-cy)*(py-cy);
                if (d < bestD) { bestD=d; best={x:cx,y:cy}; bestSeg=i; }
              }
              return { foot: best, segIdx: bestSeg };
            };

            // Trim each route: keep only the portion between its adjacent intersection points
            const trimmedPaths = routeObjs.map((ro: any, i: number) => {
              if (!ro) return null;
              const startIntersect = i > 0 ? intersections[i-1] : null;
              const endIntersect   = i < intersections.length ? intersections[i] : null;
              let startIdx = startIntersect ? startIntersect.sj + 1 : 0;
              let startPts: {x:number;y:number}[] = startIntersect ? [startIntersect.pt] : [];
              let endIdx   = endIntersect   ? endIntersect.si + 1  : ro.pts.length;
              let endPts: {x:number;y:number}[]   = endIntersect   ? [endIntersect.pt]    : [];
              // Trim first route to start from fromPt foot
              if (i === 0 && fromPt && !startIntersect) {
                const { foot, segIdx } = footOnPoly(ro.pts, fromPt.x_pct, fromPt.y_pct);
                startIdx = segIdx + 1;
                startPts = [foot];
              }
              // Trim last route to end at toPt foot
              if (i === routeObjs.length - 1 && toPt && !endIntersect) {
                const { foot, segIdx } = footOnPoly(ro.pts, toPt.x_pct, toPt.y_pct);
                endIdx = segIdx + 1;
                endPts = [foot];
              }
              // If startIdx > endIdx the route is traversed in reverse — reverse the middle segment
              const midPts: {x:number;y:number}[] = startIdx <= endIdx
                ? ro.pts.slice(startIdx, endIdx)
                : ro.pts.slice(endIdx - 1, Math.max(startIdx, endIdx)).reverse();
              const pts = [...startPts, ...midPts, ...endPts];
              return pts.length >= 2 ? { ...ro, pts } : null;
            });
            if (trimmedPaths.every((r: any) => !r) && !fromPt && !toPt) return null;

            const sc = effectiveMapScale || 1;
            const rIntersect  = 0.7 / sc;
            const rFoot       = 0.45 / sc;
            const rEndpoint   = 1.3 / sc;
            const swIntersect = 0.4 / sc;
            const swFoot      = 0.25 / sc;
            const swEndpoint  = 0.5 / sc;
            const swLine      = 0.6 / sc;
            const swPoly      = (isVehicle: boolean) => (isVehicle ? 0.7 : 0.5) / sc;
            const dashPoly    = (isVehicle: boolean) => isVehicle ? `${3/sc},${1.5/sc}` : `${2.5/sc},${1.5/sc}`;
            const dashLine    = `${1.2/sc},${0.7/sc}`;
            const fontSize    = 2.0 / sc;
            const labelOff    = 2.5 / sc;
            return (
              <svg key={elIdStr} viewBox="0 0 100 100" preserveAspectRatio="none"
                style={{ position: 'absolute', top: imgBounds.top, left: imgBounds.left, width: imgBounds.width, height: imgBounds.height, pointerEvents: 'none', zIndex: 4 }}>
                {trimmedPaths.map((rp: any, i: number) => {
                  if (!rp) return null;
                  const isVehicle = rp.category === 'vehicle';
                  const stroke = isVehicle ? '#f97316' : '#60a5fa';
                  return (
                    <React.Fragment key={`${rp.id}-${i}`}>
                      <polyline
                        points={rp.pts.map((p:any) => `${p.x},${p.y}`).join(' ')}
                        fill="none" stroke={stroke}
                        strokeWidth={swPoly(isVehicle)}
                        strokeDasharray={dashPoly(isVehicle)}
                        opacity="0.95" strokeLinecap="round" />
                      {/* Red dot at intersection with next route */}
                      {intersections[i] && (
                        <circle cx={intersections[i]!.pt.x} cy={intersections[i]!.pt.y}
                          r={rIntersect} fill="#ef4444" stroke="white" strokeWidth={swIntersect} opacity="0.95" />
                      )}
                    </React.Fragment>
                  );
                })}
                {(() => {
                  // Find closest point on a polyline (perpendicular foot)
                  const closestOnPoly = (pts: {x:number;y:number}[], px: number, py: number): {x:number;y:number} => {
                    let best = pts[0], bestD = Infinity;
                    for (let i = 0; i < pts.length - 1; i++) {
                      const ax=pts[i].x, ay=pts[i].y, bx=pts[i+1].x, by=pts[i+1].y;
                      const dx=bx-ax, dy=by-ay, lenSq=dx*dx+dy*dy;
                      if (lenSq < 1e-10) continue;
                      const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/lenSq));
                      const cx=ax+t*dx, cy=ay+t*dy;
                      const d=(px-cx)*(px-cx)+(py-cy)*(py-cy);
                      if (d < bestD) { bestD=d; best={x:cx,y:cy}; }
                    }
                    return best;
                  };
                  const firstPath = trimmedPaths.find((r: any) => r && r.pts.length >= 2);
                  const lastPath  = [...trimmedPaths].reverse().find((r: any) => r && r.pts.length >= 2);
                  return (
                    <>
                      {fromPt && firstPath && (() => {
                        const foot = closestOnPoly(firstPath.pts, fromPt.x_pct, fromPt.y_pct);
                        return (
                          <>
                            <line x1={fromPt.x_pct} y1={fromPt.y_pct} x2={foot.x} y2={foot.y} stroke="#22c55e" strokeWidth={swLine} strokeDasharray={dashLine} opacity="0.9" />
                            <circle cx={foot.x} cy={foot.y} r={rFoot} fill="#22c55e" stroke="white" strokeWidth={swFoot} opacity="0.95" />
                            <circle cx={fromPt.x_pct} cy={fromPt.y_pct} r={rEndpoint} fill="#22c55e" stroke="white" strokeWidth={swEndpoint} opacity="0.95" />
                            <text x={fromPt.x_pct} y={fromPt.y_pct - labelOff} textAnchor="middle" fill="#22c55e" fontSize={fontSize} fontWeight="bold">{tr('ground.from')}</text>
                          </>
                        );
                      })()}
                      {toPt && lastPath && (() => {
                        const foot = closestOnPoly(lastPath.pts, toPt.x_pct, toPt.y_pct);
                        return (
                          <>
                            <line x1={toPt.x_pct} y1={toPt.y_pct} x2={foot.x} y2={foot.y} stroke="#22c55e" strokeWidth={swLine} strokeDasharray={dashLine} opacity="0.9" />
                            <circle cx={foot.x} cy={foot.y} r={rFoot} fill="#22c55e" stroke="white" strokeWidth={swFoot} opacity="0.95" />
                            <circle cx={toPt.x_pct} cy={toPt.y_pct} r={rEndpoint} fill="#f43f5e" stroke="white" strokeWidth={swEndpoint} opacity="0.95" />
                            <text x={toPt.x_pct} y={toPt.y_pct - labelOff} textAnchor="middle" fill="#f43f5e" fontSize={fontSize} fontWeight="bold">{tr('ground.to2')}</text>
                          </>
                        );
                      })()}
                    </>
                  );
                })()}
                {/* Moving vehicle dot animation */}
                {(() => {
                  const rawProgress = routeAnimProgress[Number(elIdStr)];
                  if (rawProgress === undefined) return null;
                  // Build full path by chaining all trimmed paths
                  const fullPts: {x:number;y:number}[] = [];
                  trimmedPaths.forEach((rp: any) => { if (rp && rp.pts.length >= 2) { if (fullPts.length > 0) fullPts.push(...rp.pts.slice(1)); else fullPts.push(...rp.pts); } });
                  if (fullPts.length < 2) return null;
                  // Path length helpers
                  const segLens: number[] = [];
                  let totalLen = 0;
                  for (let i = 0; i < fullPts.length - 1; i++) { const dx=fullPts[i+1].x-fullPts[i].x, dy=fullPts[i+1].y-fullPts[i].y; const l=Math.sqrt(dx*dx+dy*dy); segLens.push(l); totalLen += l; }
                  if (totalLen < 1e-6) return null;
                  // Find blocking fraction — closest conflict element on path
                  const myConflicts = routeConflicts.filter((c: any) => c.vehicleId === Number(elIdStr));
                  let blockFrac = 1.0;
                  myConflicts.forEach((c: any) => {
                    const bel = (airfieldElements || []).find((e: any) => e.id === c.elementId);
                    if (!bel || bel.x_pct == null) return;
                    let acc2 = 0, bestFrac2 = 1.0, bestD2 = Infinity;
                    for (let i = 0; i < fullPts.length - 1; i++) {
                      const ax=fullPts[i].x, ay=fullPts[i].y, bx=fullPts[i+1].x, by=fullPts[i+1].y;
                      const dx=bx-ax, dy=by-ay, lenSq=dx*dx+dy*dy;
                      if (lenSq < 1e-10) { acc2 += segLens[i]; continue; }
                      const t2 = Math.max(0, Math.min(1, ((bel.x_pct-ax)*dx+(bel.y_pct-ay)*dy)/lenSq));
                      const cx2=ax+t2*dx, cy2=ay+t2*dy;
                      const d2=(bel.x_pct-cx2)*(bel.x_pct-cx2)+(bel.y_pct-cy2)*(bel.y_pct-cy2);
                      if (d2 < bestD2) { bestD2=d2; bestFrac2=(acc2+t2*segLens[i])/totalLen; }
                      acc2 += segLens[i];
                    }
                    if (bestFrac2 < blockFrac) blockFrac = bestFrac2;
                  });
                  // Cap progress at blocking fraction
                  const t = Math.min(rawProgress, blockFrac);
                  const isBlocked = blockFrac < 1.0 && rawProgress >= blockFrac - 0.01;
                  // Interpolate point along path
                  const target = t * totalLen;
                  let acc3 = 0, dotX = fullPts[0].x, dotY = fullPts[0].y, dirAngle = 0;
                  for (let i = 0; i < fullPts.length - 1; i++) {
                    const ax=fullPts[i].x, ay=fullPts[i].y, bx=fullPts[i+1].x, by=fullPts[i+1].y;
                    if (acc3 + segLens[i] >= target || i === fullPts.length - 2) {
                      const localT = segLens[i] > 1e-10 ? (target - acc3) / segLens[i] : 0;
                      dotX = ax + localT * (bx - ax); dotY = ay + localT * (by - ay);
                      dirAngle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
                      break;
                    }
                    acc3 += segLens[i];
                  }
                  const dotColor = isBlocked ? '#ef4444' : '#f97316';
                  const dotScale = 1 / effectiveMapScale;
                  return (
                    <g transform={`translate(${dotX},${dotY}) scale(${dotScale})`}>
                      {/* Outer glow ring */}
                      <circle r="3.5" fill={dotColor} opacity="0.15" />
                      {/* Mid glow */}
                      <circle r="2.4" fill={dotColor} opacity="0.3" />
                      {/* Vehicle body */}
                      <circle r="1.6" fill={dotColor} stroke="white" strokeWidth="0.6" />
                      {/* Direction arrow */}
                      <polygon points="0,-1.1 0.7,0.5 -0.7,0.5"
                        fill="white" opacity="0.95"
                        transform={`rotate(${dirAngle + 90})`} />
                      {/* Blocked X mark */}
                      {isBlocked && (
                        <>
                          <line x1="-1.3" y1="-1.3" x2="1.3" y2="1.3" stroke="white" strokeWidth="0.7" />
                          <line x1="1.3" y1="-1.3" x2="-1.3" y2="1.3" stroke="white" strokeWidth="0.7" />
                        </>
                      )}
                    </g>
                  );
                })()}
              </svg>
            );
          })}

          {/* Airfield elements overlay */}
          {mapLayers.elements && airfieldElements && airfieldElements.filter(el => el.x_pct != null && el.y_pct != null && !hiddenElements.has(el.id) && !(externalHiddenElements?.has(el.id)) && (!el.hidden_on_map || (mapDisplaySettings.showRoutes && elemNavData[el.id])) && (el.category !== 'camera' || mapLayers.cameras)).map(el => {
            const elColor = el.type_color || '#f59e0b';
            const statusColors: Record<string, string> = { 'תקין': '#22c55e', 'לא תקין': '#ef4444', 'חלקי': '#f97316', 'שמיש': '#22c55e', 'תקול': '#ef4444', 'לא שמיש': '#ef4444' };
            const sColor = statusColors[el.status] || '#94a3b8';
            const isTakul = el.status === 'תקול';
            const isLaTakin = el.status === 'לא תקין';
            const isLaShamish = el.status === 'לא שמיש';
            const isTakin = el.status === 'תקין';
            const isShamish = el.status === 'שמיש';
            const canChangeStatus = el.type_can_change_status === true || el.type_can_change_status === 'true';
            const canHaveRoute = el.type_can_have_route === true || el.type_can_have_route === 'true';
            const isSvgIcon = typeof el.type_icon === 'string' && el.type_icon.startsWith('MAP:');
            const elCatKey = el.category || 'כללי';
            const isCatHighlighted = catMapHighlight.has(elCatKey) || (externalCatHighlight?.has(elCatKey) ?? false);
            const isBeingEdited = elemEditModal?.el?.id === el.id;
            const pos = imgBounds
              ? { left: `${imgBounds.left + (el.x_pct / 100) * imgBounds.width}px`, top: `${imgBounds.top + (el.y_pct / 100) * imgBounds.height}px` }
              : { left: `${el.x_pct}%`, top: `${el.y_pct}%` };
            const opStatusColors: Record<string, string> = { 'דולק': '#22c55e', 'כבוי': '#64748b', 'מנצנץ': '#f59e0b', 'נוסע': '#3b82f6', 'עומד': '#a855f7', 'פתוח': '#22c55e', 'סגור': '#ef4444' };
            const opColor = opStatusColors[el.status] || sColor;
            const statusIconEmoji: string | null = (() => { const si = typeof el.type_status_icons === 'object' && !Array.isArray(el.type_status_icons) ? el.type_status_icons : (typeof el.type_status_icons === 'string' ? (() => { try { return JSON.parse(el.type_status_icons); } catch { return null; } })() : null); return si && el.status ? (si[el.status] || null) : null; })();
            const statusMapIcon: string | null = statusIconEmoji?.startsWith('MAP:') ? statusIconEmoji : null;
            const statusEmojiOnly: string | null = statusIconEmoji && !statusIconEmoji.startsWith('MAP:') ? statusIconEmoji : null;
            // Display state: normal / blink / open / close
            const dState = el.display_state || 'normal';
            const isBlinking = dState === 'blink';
            const isClosed = dState === 'close';
            const isOpen = dState === 'open';
            const isOff = dState === 'off';
            const isStop = dState === 'stop';
            const isGo = dState === 'go';
            const iconRotation = el.rotation || 0;
            const baseIconKey = el.type_icon || '';
            const isTrafficMulti = ['MAP:traffic-red','MAP:traffic-orange','MAP:traffic-green'].includes(baseIconKey);
            const effectiveMapIconKey = isTrafficMulti
              ? (isStop ? 'MAP:traffic-red' : isGo ? 'MAP:traffic-green' : baseIconKey)
              : baseIconKey;
            const blinkRate = el.blink_rate || 1.0;
            // For SVG icons: blink only the inner light elements (via .elem-blink class + --blink-rate CSS var)
            // For emoji/circle icons: blink the whole container
            const blinkAnimStyle: React.CSSProperties = isBlinking
              ? isSvgIcon
                ? ({ '--blink-rate': `${blinkRate}s` } as React.CSSProperties)
                : { animation: `af-elem-blink ${blinkRate}s step-end infinite` }
              : {};
            const hasNav = !!(elemNavData[el.id]?.viaRouteIds?.length || elemNavData[el.id]?.fromPointId || elemNavData[el.id]?.toPointId);
            const isMoving = el.status === 'נוסע';
            const navForEl = elemNavData[el.id];
            const navFromPt = navForEl?.fromPointId ? points.find((p: any) => p.id === navForEl.fromPointId) : null;
            const navToPt = navForEl?.toPointId ? points.find((p: any) => p.id === navForEl.toPointId) : null;
            const navRouteNames = (navForEl?.viaRouteIds || []).map((rid: number) => (airfieldRoutes || []).find((r: any) => r.id === rid)?.name).filter(Boolean);
            return (
              <div key={el.id}
                style={{ position: 'absolute', left: pos.left, top: pos.top, transform: `translate(-50%,-50%) scale(${1/effectiveMapScale})`, transformOrigin: 'center center', pointerEvents: 'all', zIndex: isCatHighlighted || isBeingEdited ? 20 : 12, textAlign: 'center', cursor: 'pointer' }}
                title={`${el.name}${el.status ? ` [${el.status}]` : ''}${el.note ? ` — ${el.note}` : ''}${dState !== 'normal' ? ` (${dState})` : ''}`}
                onClick={(e) => { e.stopPropagation(); if (el.camera_url) { if (cameraPanels.some(p => p.url === el.camera_url)) return; const id = nextCamId.current++; const off = (cameraPanels.length % 6) * 28; setCameraPanels(prev => [...prev, { id, url: el.camera_url, name: el.name, dragPos: { x: 80 + off, y: 80 + off }, expanded: false }]); } else if (canChangeStatus) { setElemStatusPicker({ el, x: e.clientX, y: e.clientY }); } else if (canHaveRoute) { const existing = elemNavData[el.id] || { fromPointId: null, toPointId: null, viaRouteIds: [] }; setElemNavModal({ el, fromPointId: existing.fromPointId, toPointId: existing.toPointId, viaRouteIds: [...existing.viaRouteIds] }); } }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                {/* Conflict alert ring — pulsing red */}
                {conflictElementIds.has(el.id) && (
                  <div className="conflict-ring" style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', width: '44px', height: '44px', borderRadius: '50%', border: '3px solid #ef4444', pointerEvents: 'none', zIndex: 25 }} />
                )}
                {/* Category highlight ring */}
                {isCatHighlighted && (
                  <div style={{ position: 'absolute', top: '-6px', left: '50%', transform: 'translateX(-50%)', width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #3b82f6', boxShadow: '0 0 12px #3b82f688', pointerEvents: 'none', animation: 'pulse 1.5s infinite' }} />
                )}
                {/* Being-edited ring */}
                {isBeingEdited && (
                  <div style={{ position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)', width: '40px', height: '40px', borderRadius: '50%', border: '3px solid #f59e0b', boxShadow: '0 0 16px #f59e0b99', pointerEvents: 'none' }} />
                )}
                <div>
                  {el.category === 'camera' ? (
                    <div style={{ width: '26px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.7))' }}>
                      <svg width="26" height="20" viewBox="0 0 26 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="1" y="4" width="24" height="14" rx="2.5" fill="#0c2a4a" stroke="#3b82f6" strokeWidth="1.5"/>
                        <circle cx="13" cy="11" r="4.5" fill="none" stroke="#60a5fa" strokeWidth="1.5"/>
                        <circle cx="13" cy="11" r="2.2" fill="#93c5fd"/>
                        <circle cx="13" cy="11" r="0.8" fill="#1e3a5f"/>
                        <rect x="9" y="1.5" width="8" height="3.5" rx="1" fill="#1d4ed8" stroke="#3b82f6" strokeWidth="0.8"/>
                        <rect x="20" y="7" width="2.5" height="2" rx="0.5" fill="#f59e0b"/>
                        <rect x="2.5" y="6" width="3" height="2" rx="0.5" fill="#1e3a5f" stroke="#334155" strokeWidth="0.5"/>
                      </svg>
                    </div>
                  ) : isSvgIcon ? (
                    <div style={{ ...(isBlinking ? ({ '--blink-rate': `${blinkRate}s` } as React.CSSProperties) : {}), width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))', outline: canChangeStatus ? `2px solid ${isClosed ? '#ef4444' : isOff ? '#475569' : isStop ? '#ef4444' : isGo ? '#22c55e' : isOpen ? '#22c55e' : opColor}` : 'none', borderRadius: '4px', background: isCatHighlighted ? '#3b82f622' : canChangeStatus ? (isClosed ? '#ef444422' : opColor + '22') : 'transparent', transform: iconRotation ? `rotate(${iconRotation}deg)` : undefined }}>
                      {renderGroundSvgIcon(isClosed ? (el.close_icon_key || el.type_close_icon || effectiveMapIconKey) : isOpen ? (el.open_icon_key || el.type_open_icon || effectiveMapIconKey) : (statusMapIcon || effectiveMapIconKey), 26, el.status, dState)}
                    </div>
                  ) : (
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: isClosed ? '#1e293b' : isOff ? '#1e293b' : (isTakul || isLaTakin || isLaShamish) ? '#ef4444' : elColor, border: isBeingEdited ? '3px solid #f59e0b' : isCatHighlighted ? '3px solid #3b82f6' : isClosed ? '3px solid #ef4444' : isOff ? '3px solid #475569' : (isLaTakin || isLaShamish) ? '3px solid #ef4444' : isTakin ? '3px solid #22c55e' : isOpen ? '3px solid #22c55e' : isShamish ? '4px solid #22c55e' : `2px solid ${canChangeStatus ? opColor : sColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', boxShadow: isBeingEdited ? '0 0 10px #f59e0b88' : isCatHighlighted ? '0 0 10px #3b82f688' : isClosed ? '0 0 8px #ef444488' : (isLaTakin || isLaShamish) ? '0 0 8px #ef444488' : isTakin ? '0 0 6px #22c55e88' : canChangeStatus ? `0 0 6px ${opColor}88` : isShamish ? '0 0 6px #22c55e88' : '0 1px 4px rgba(0,0,0,0.5)', margin: '0 auto', transition: 'box-shadow 0.2s, border 0.2s', opacity: isOff ? 0.5 : 1, transform: iconRotation ? `rotate(${iconRotation}deg)` : undefined, animation: isBlinking ? `af-elem-blink ${blinkRate}s step-end infinite` : undefined }}>
                      {isOff ? '○' : !(isTakul || isLaTakin || isLaShamish) && (statusEmojiOnly || el.type_icon || (el.category === 'camera' ? '📷' : '🔧'))}
                    </div>
                  )}
                  {/* X overlay for SVG icons — לא תקין / לא שמיש only (not for closed) */}
                  {(isLaTakin || isLaShamish) && isSvgIcon && (
                    <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: '#ef4444', fontWeight: 'bold', pointerEvents: 'none', textShadow: '0 0 6px #000' }}>✕</div>
                  )}
                  {/* Big red X overlay for לא תקין / לא שמיש non-SVG elements */}
                  {(isLaTakin || isLaShamish) && !isSvgIcon && el.category !== 'camera' && (
                    <div style={{ position: 'absolute', top: '-2px', left: '50%', transform: 'translateX(-50%)', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: '#ef4444', fontWeight: 'bold', pointerEvents: 'none', textShadow: '0 0 4px #000, 0 0 8px #ef4444' }}>✕</div>
                  )}
                  {mapDisplaySettings.showNames && <div style={{ background: isBeingEdited ? '#f59e0bcc' : '#000000cc', color: isBeingEdited ? '#fff' : (isClosed || isLaTakin || isLaShamish) ? '#fca5a5' : isTakul ? '#fca5a5' : isTakin ? '#86efac' : isShamish ? '#86efac' : elColor, fontSize: '8px', fontWeight: 'bold', padding: '1px 4px', borderRadius: '3px', whiteSpace: 'nowrap', marginTop: '1px', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{el.name}</div>}
                  {/* Play/Stop button directly on map element — only for route-capable types */}
                {canHaveRoute && (routeAnimProgress[el.id] !== undefined
                  ? <button
                      onClick={e => { e.stopPropagation(); stopRouteAnim(el.id); }}
                      title={tr('ground.stopAnimation')}
                      style={{ position: 'absolute', top: '-9px', right: '-9px', width: '16px', height: '16px', borderRadius: '50%', background: '#ef4444', border: '1.5px solid white', color: 'white', fontSize: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, boxShadow: '0 0 6px #ef444488', lineHeight: 1, padding: 0 }}>
                      ■
                    </button>
                  : <button
                      onClick={e => {
                        e.stopPropagation();
                        if (elemNavData[el.id]?.viaRouteIds?.length > 0) {
                          startRouteAnim(el.id, 1.0);
                        } else {
                          const existing = elemNavData[el.id] || { fromPointId: null, toPointId: null, viaRouteIds: [] };
                          setElemNavModal({ el, fromPointId: existing.fromPointId, toPointId: existing.toPointId, viaRouteIds: [...existing.viaRouteIds] });
                        }
                      }}
                      title={elemNavData[el.id]?.viaRouteIds?.length > 0 ? 'הפעל אנימציית נסיעה' : 'הגדר מסלול'}
                      style={{ position: 'absolute', top: '-9px', right: '-9px', width: '16px', height: '16px', borderRadius: '50%', background: elemNavData[el.id]?.viaRouteIds?.length > 0 ? '#22c55e' : '#475569', border: '1.5px solid white', color: 'white', fontSize: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, boxShadow: elemNavData[el.id]?.viaRouteIds?.length > 0 ? '0 0 6px #22c55e88' : 'none', lineHeight: 1, padding: 0 }}>
                      ▶
                    </button>
                )}
                {hasNav && !isMoving && <div style={{ fontSize: '7px', color: '#60a5fa', background: '#1e3a5fcc', padding: '0px 3px', borderRadius: '2px', marginTop: '1px', whiteSpace: 'nowrap' }}>{tr('shared.route')}</div>}
                  {mapDisplaySettings.showStatus && (canChangeStatus && el.status || dState !== 'normal') && (
                    <div style={{ background: isClosed ? '#ef4444dd' : isBlinking ? '#f59e0bdd' : isOff ? '#475569dd' : isStop ? '#ef4444dd' : isGo ? '#22c55edd' : isOpen ? '#22c55edd' : opColor + 'dd', color: 'white', fontSize: '7px', fontWeight: 'bold', padding: '0px 3px', borderRadius: '2px', whiteSpace: 'nowrap', marginTop: '1px' }}>
                      {isClosed ? 'סגור' : isBlinking ? 'מהבהב' : isOff ? 'כבוי' : isStop ? 'עצור' : isGo ? 'עבור' : isOpen ? 'שמיש' : el.status}
                    </div>
                  )}
                  {/* Route tooltip — shown only when status = נוסע and a route is defined */}
                  {isMoving && hasNav && (navFromPt || navRouteNames.length > 0 || navToPt) && (
                    <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '3px', background: '#0c1a2edd', border: '1px solid #3b82f688', borderRadius: '5px', padding: '4px 7px', fontSize: '8px', color: '#93c5fd', whiteSpace: 'nowrap', zIndex: 30, pointerEvents: 'none', direction: 'rtl', display: 'flex', flexDirection: 'column', gap: '2px', boxShadow: '0 2px 8px #0008' }}>
                      {navFromPt && <span style={{ color: '#86efac' }}>📍 {navFromPt.name}</span>}
                      {navRouteNames.map((n: string, i: number) => (
                        <span key={i} style={{ color: '#93c5fd' }}>↓ 🛣 {n}</span>
                      ))}
                      {navToPt && <span style={{ color: '#fca5a5' }}>🏁 {navToPt.name}</span>}
                    </div>
                  )}
                </div>
                {/* Camera indicator — small icon shown below camera elements that have a URL */}
                {el.camera_url && el.category === 'camera' && (
                  <div style={{ fontSize: '7px', color: '#60a5fa', background: '#0c1a2ecc', padding: '0px 3px', borderRadius: '2px', marginTop: '1px', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{tr('ground.clickToView')}</div>
                )}
                {/* Route button — for canHaveRoute elements (tap instead of right-click) */}
                {canHaveRoute && !el.camera_url && (
                  <button
                    onClick={e => { e.stopPropagation(); if (elemNavData[el.id]?.viaRouteIds?.length > 0) { startRouteAnim(el.id, 1.0); } else { const existing = elemNavData[el.id] || { fromPointId: null, toPointId: null, viaRouteIds: [] }; setElemNavModal({ el, fromPointId: existing.fromPointId, toPointId: existing.toPointId, viaRouteIds: [...existing.viaRouteIds] }); } }}
                    style={{ display: 'block', margin: '2px auto 0', padding: '1px 5px', fontSize: '8px', background: '#1e3a5fcc', border: '1px solid #3b82f655', borderRadius: '3px', color: '#60a5fa', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    title={tr('ground.defineActivateRoute')}>
                    🛣 {elemNavData[el.id]?.viaRouteIds?.length > 0 ? 'הפעל' : 'מסלול'}
                  </button>
                )}
                {/* Large STOP button — shown only when this element is in a conflict */}
                {conflictElementIds.has(el.id) && canChangeStatus && onUpdateElementDisplayState && (() => {
                  const catBlockDs: Record<string,string> = { 'STOP BAR':'blink', 'רמזורים':'blink', 'מחסומים':'close' };
                  const blockDs = catBlockDs[el.category] || 'blink';
                  const curDs = el.display_state || 'normal';
                  const alreadyBlocked = curDs === blockDs;
                  return (
                    <button
                      onClick={e => { e.stopPropagation(); onUpdateElementDisplayState(el.id, alreadyBlocked ? 'normal' : blockDs); }}
                      style={{ display: 'block', margin: '3px auto 0', padding: '5px 10px', fontSize: '13px', fontWeight: 'bold', background: alreadyBlocked ? '#14532d' : '#7f1d1d', border: `2px solid ${alreadyBlocked ? '#22c55e' : '#ef4444'}`, borderRadius: '7px', color: alreadyBlocked ? '#86efac' : '#fca5a5', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: alreadyBlocked ? '0 0 8px #22c55e66' : '0 0 10px #ef444466', minWidth: '56px' }}
                      title={alreadyBlocked ? 'שחרר חסימה' : 'עצור / חסום מסלול'}>
                      {alreadyBlocked ? '✓ חסום' : '🛑 עצור'}
                    </button>
                  );
                })()}
                {/* Delete button — only for dynamically-added vehicles (כלי רכב) */}
                {onDeleteElement && el.category === 'כלי רכב' && (
                  <button
                    onClick={e => { e.stopPropagation(); if (window.confirm(`מחק את "${el.name}"?`)) onDeleteElement(el.id); }}
                    style={{ position: 'absolute', top: '-10px', left: '-10px', width: '16px', height: '16px', borderRadius: '50%', background: '#7f1d1d', border: '1px solid #ef4444', color: '#fff', fontSize: '9px', cursor: 'pointer', display: isBeingEdited || isCatHighlighted || addVehicleMode ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}
                    title={tr('ground.deleteVehicle')}>
                    ✕
                  </button>
                )}
              </div>
            );
          })}

          {/* Airfield points — drop zones + labels */}
          {mapLayers.points && points.filter((pt: any) => pt.point_type !== 'admin_loc').map(pt => {
            const isDrop = mapDragOver === pt.id;
            const ptColor = pt.color || '#3b82f6';
            const ptCount = pointAircraftCount[pt.id] || 0;
            const ptDensityWarn = pt.density_warn ?? 3;
            const isDense = ptCount >= ptDensityWarn;
            const isHovered = hoveredDensePtId === pt.id;
            const pos = ptPos(pt.x_pct, pt.y_pct);
            return (
              <div key={pt.id}
                style={{ position: 'absolute', left: pos.left, top: pos.top, transform: `translate(-50%, -50%) scale(${1/effectiveMapScale})`, transformOrigin: 'center center', zIndex: isHovered ? 50 : 10, pointerEvents: 'all' }}
                onMouseEnter={() => { if (isDense) setHoveredDensePtId(pt.id); }}
                onMouseLeave={() => setHoveredDensePtId(null)}
                onDragOver={e => { e.preventDefault(); setMapDragOver(pt.id); }}
                onDragLeave={() => { if (mapDragOver === pt.id) setMapDragOver(null); }}
                onDrop={e => {
                  e.preventDefault();
                  setMapDragOver(null);
                  // Handle incoming transfer dragged to a map point: accept + place
                  if (draggingTransferId) {
                    const t = incomingTransfers.find(tr => String(tr.id) === draggingTransferId);
                    if (t) {
                      setPendingPointAssign({ stripId: String(t.strip_id), pointId: pt.id });
                      onAcceptTransfer(draggingTransferId);
                    }
                    setDraggingTransferId(null);
                    return;
                  }
                  try {
                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                    if (!data.stripId) return;
                    const strip = strips.find(s => String(s.id) === String(data.stripId));
                    if (!strip) return;
                    if (data.all) {
                      // Whole formation → assign every aircraft to this point.
                      const positions = getAircraftPositions(strip);
                      const updated = positions.map(x => ({ ...x, point_id: pt.id }));
                      onUpdateAircraft(String(strip.id), updated);
                    } else if (data.idx) {
                      handleAircraftPointAssign(strip, data.idx, pt.id);
                    }
                  } catch {}
                }}
              >
                {isDrop
                  ? <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#22c55e55', border: '2px solid #22c55e', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <GroundMarkerSVG marker={pt.marker || 'circle'} color="#22c55e" size={20} />
                    </div>
                  : <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.8))' }}>
                      {isDense && (
                        <div style={{ position: 'absolute', inset: '-6px', borderRadius: '50%', border: '2px solid #f59e0b', boxShadow: '0 0 8px 2px #f59e0b88', pointerEvents: 'none', animation: 'groundTakeoffFlash 1s ease-in-out infinite' }} />
                      )}
                      <GroundMarkerSVG marker={pt.marker || 'circle'} color={ptColor} size={22} />
                      {mapDisplaySettings.showStatus && ptCount > 0 && (
                        <div style={{ position: 'absolute', top: '-6px', right: '-8px', background: isDense ? '#f59e0b' : ptColor, color: '#000', fontSize: '9px', fontWeight: 'bold', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #000' }}>
                          {ptCount}
                        </div>
                      )}
                    </div>
                }
                {mapDisplaySettings.showNames && (
                  <div style={{ position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)', background: '#000000cc', color: isDense ? '#f59e0b' : ptColor, fontSize: '10px', fontWeight: 'bold', padding: '1px 5px', borderRadius: '3px', whiteSpace: 'nowrap', pointerEvents: 'none', border: `1px solid ${isDense ? '#f59e0b' : ptColor}55` }}>
                    {isDense && '⚠️ '}{pt.name}
                  </div>
                )}
                {/* Density warning popup — shown on hover */}
                {isHovered && isDense && (
                  <div style={{ position: 'absolute', bottom: '38px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, pointerEvents: 'none', minWidth: '150px', maxWidth: '200px', direction: 'rtl' }}>
                    <div style={{ background: '#1c1400', border: '2px solid #f59e0b', borderRadius: '8px', padding: '8px 10px', boxShadow: '0 4px 16px rgba(0,0,0,0.8)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                        <span style={{ fontSize: '13px' }}>⚠️</span>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#f59e0b' }}>{tr('ground.loadAlert')}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#fde68a', marginBottom: '3px' }}>
                        <span style={{ color: '#94a3b8' }}>{tr('ground.point')} </span>{pt.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#fde68a', marginBottom: '3px' }}>
                        <span style={{ color: '#94a3b8' }}>{tr('ground.aircraftNow')} </span>
                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{ptCount}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#fde68a' }}>
                        <span style={{ color: '#94a3b8' }}>{tr('shared.threshold')} </span>
                        <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>{ptDensityWarn}</span>
                      </div>
                      <div style={{ marginTop: '5px', borderTop: '1px solid #78350f', paddingTop: '4px', fontSize: '10px', color: '#92400e' }}>
                        {tr('ground.thePointIsLoaded')}
                      </div>
                    </div>
                    {/* Arrow pointing down */}
                    <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #f59e0b', margin: '0 auto' }} />
                  </div>
                )}
              </div>
            );
          })}

          {/* Aircraft markers on the map.
              Per strip, group placed aircraft by point. When ALL aircraft of a formation are
              at the same point AND share the same status, render a single merged "whole-strip"
              chip ("CALL ×N"). Otherwise render individual chips per aircraft, slightly stacked.
              Across strips, chips at the same point are stacked vertically so existing chips
              remain visible when a new aircraft is dropped on the same point. */}
          {(() => {
            // Sort strips by takeoff_time ascending for stacking order (earliest takeoff = nearest slot to point)
            const sortedStrips = [...strips].sort((a: any, b: any) => {
              const tA = a.takeoff_time ? new Date(a.takeoff_time).getTime() : Infinity;
              const tB = b.takeoff_time ? new Date(b.takeoff_time).getTime() : Infinity;
              return tA !== tB ? tA - tB : (Number(a.id) - Number(b.id));
            });
            // Pre-compute a global slot index for every chip at every point so chips from
            // *different* strips also stack instead of overlapping each other.
            const ptSlots: Record<number, string[]> = {};
            sortedStrips.forEach((strip: any) => {
              const aircraft = getEffectivePositions(strip);
              const placed = aircraft.filter(ac => ac.point_id);
              if (placed.length === 0) return;
              const byPoint: Record<number, AircraftPos[]> = {};
              placed.forEach(ac => { const pid = ac.point_id as number; (byPoint[pid] = byPoint[pid] || []).push(ac); });
              Object.entries(byPoint).forEach(([pidStr, acsAtPoint]) => {
                const pid = Number(pidStr);
                const allSameStatus = acsAtPoint.every(a => a.status === acsAtPoint[0].status);
                const merged = aircraft.length > 1 && acsAtPoint.length === aircraft.length && allSameStatus;
                ptSlots[pid] = ptSlots[pid] || [];
                if (merged) {
                  ptSlots[pid].push(`${strip.id}|all`);
                } else {
                  acsAtPoint.forEach(ac => ptSlots[pid].push(`${strip.id}|${ac.idx}`));
                }
              });
            });
            const slotIndex = (pid: number, key: string): number => {
              const arr = ptSlots[pid] || [];
              const i = arr.indexOf(key);
              return i < 0 ? 0 : i;
            };
            const SLOT_GAP = 46; // px between stacked chips (~24px single-line, ~42px with takeoff-time row + border + gap)
            return sortedStrips.map((strip: any) => {
            const aircraft = getEffectivePositions(strip);
            const placed = aircraft.filter(ac => ac.point_id);
            if (placed.length === 0) return null;
            const byPoint: Record<number, AircraftPos[]> = {};
            placed.forEach(ac => {
              const pid = ac.point_id as number;
              (byPoint[pid] = byPoint[pid] || []).push(ac);
            });
            return Object.entries(byPoint).map(([pidStr, acsAtPoint]) => {
              const pid = Number(pidStr);
              const pt = points.find(p => p.id === pid);
              if (!pt) return null;
              const allSameStatus = acsAtPoint.every(a => a.status === acsAtPoint[0].status);
              const anyIsAutoMerged = acsAtPoint.some(a => (a as any).isAuto);
              // Only merge when there's actually >1 aircraft to merge — single-ship strips
              // should keep the per-aircraft visual ("#1") for consistency with their card.
              const merged = aircraft.length > 1 && acsAtPoint.length === aircraft.length && allSameStatus;
              if (merged) {
                const st = GROUND_STATUSES.find(s => s.key === acsAtPoint[0].status) || GROUND_STATUSES[0];
                const isDragging = dragging?.stripId === String(strip.id) && dragging?.idx === -1;
                const isMenuOpen = groundQuickMenu?.stripId === String(strip.id) && groundQuickMenu?.idx === -1;
                const pos = ptPos(pt.x_pct, pt.y_pct);
                const slot = slotIndex(pid, `${strip.id}|all`);
                const stackOffset = slot * SLOT_GAP;
                const mergedRows = stripAircraftData[String(strip.id).replace(/^s/, '')] || [];
                const mergedDatkValues = acsAtPoint.map(a => mergedRows.find(r => r.idx === a.idx)?.datk).filter((d): d is number => d != null);
                const mergedMatchesDatk = datkFilter === null || mergedDatkValues.some(d => d >= datkFilter);
                const mergedMatchesStatus = statusFilter.length === 0 || statusFilter.includes(acsAtPoint[0].status);
                const mergedMatchesFilter = (filterMode === 'OR' && datkFilter !== null && statusFilter.length > 0)
                  ? mergedMatchesDatk || mergedMatchesStatus
                  : mergedMatchesDatk && mergedMatchesStatus;
                const anyFilterActive = datkFilter !== null || statusFilter.length > 0;
                const mergedFilterOpacity = isDragging ? 0.4 : (anyFilterActive && !mergedMatchesFilter ? 0.2 : 1);
                const mergedHighlight = anyFilterActive && mergedMatchesFilter;
                return (
                  <div key={`${strip.id}-all-${pid}`}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ stripId: strip.id, all: true })); setDragging({ stripId: String(strip.id), idx: -1 }); setGroundQuickMenu(null); }}
                    onDragEnd={() => { setDragging(null); setMapDragOver(null); }}
                    style={{ position: 'absolute', left: pos.left, top: pos.top, transform: `translate(-50%, calc(-100% - 28px - ${stackOffset}px)) scale(${1/effectiveMapScale})`, transformOrigin: 'center bottom', zIndex: 30 + slot, cursor: 'grab', opacity: mergedFilterOpacity, pointerEvents: 'all', userSelect: 'none', transition: 'opacity 0.2s' }}>
                    <div
                      className={st.flash ? 'ground-takeoff-flash' : ''}
                      onClick={e => { e.stopPropagation(); setGroundQuickMenu(isMenuOpen ? null : { stripId: String(strip.id), idx: -1, x: e.clientX, y: e.clientY }); }}
                      title={anyIsAutoMerged ? 'מוצב אוטומטית לפי דת"ק + זמן המראה' : undefined}
                      style={{ background: mapDisplaySettings.showChipBg ? st.bg : 'transparent', border: !mapDisplaySettings.showChipBg ? 'none' : !mapDisplaySettings.showChipBorder ? 'none' : anyIsAutoMerged ? `2.5px dashed #34d399` : `2.5px solid ${mergedHighlight ? '#3b82f6' : st.dot}`, borderRadius: '5px', padding: mapDisplaySettings.showChipBg ? '3px 7px' : '0 2px', fontSize: '12px', color: st.color, fontWeight: 'bold', whiteSpace: 'nowrap', boxShadow: mapDisplaySettings.showChipBg ? (mergedHighlight ? '0 0 10px 3px #3b82f6aa, 0 2px 8px rgba(0,0,0,0.6)' : anyIsAutoMerged ? '0 0 8px 2px #34d39944, 0 2px 8px rgba(0,0,0,0.6)' : '0 2px 8px rgba(0,0,0,0.6)') : 'none', display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <span style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 'bold' }}>{getFormationDisplayName(strip)}</span>
                        <span style={{ color: st.color, fontSize: '11px', fontWeight: 'bold' }}>×{acsAtPoint.length}</span>
                        {(strip.sq || strip.squadron) && <span style={{ color: '#94a3b8', fontSize: '10px' }}>{strip.sq || strip.squadron}</span>}
                      </div>
                      {strip.takeoff_time && (() => {
                        const d = new Date(strip.takeoff_time);
                        const hh = String(d.getHours()).padStart(2, '0');
                        const mm = String(d.getMinutes()).padStart(2, '0');
                        const past = d.getTime() < Date.now();
                        return <span style={{ color: past ? '#f87171' : '#facc15', fontSize: '10px', fontWeight: 'bold' }}>🕐 {hh}:{mm}</span>;
                      })()}
                    </div>
                    {isMenuOpen && (
                      <div style={{ position: 'absolute', ...(groundQuickMenu && groundQuickMenu.y < window.innerHeight / 2 ? { top: 'calc(100% + 4px)' } : { bottom: 'calc(100% + 4px)' }), left: '50%', transform: 'translateX(-50%)', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '6px', zIndex: 100, minWidth: '160px', boxShadow: '0 4px 20px rgba(0,0,0,0.7)' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', marginBottom: '5px', textAlign: 'center' }}>{tr('ground.changeStatusForThe')}</div>
                        {GROUND_STATUSES.map(s => (
                          <button key={s.key} onClick={() => {
                            if (s.key === 'takeoff') { setGroundQuickMenu(null); setSidModal({ strip, idx: -1 }); return; }
                            const positions = getAircraftPositions(strip); const updated = positions.map(x => ({ ...x, status: s.key as GroundStatusKey })); onUpdateAircraft(String(strip.id), updated); setGroundQuickMenu(null);
                          }}
                            style={{ display: 'block', width: '100%', padding: '4px 8px', marginBottom: '3px', background: acsAtPoint[0].status === s.key ? s.bg : 'transparent', color: s.color, border: `1px solid ${acsAtPoint[0].status === s.key ? s.dot : '#1e293b'}`, borderRadius: '5px', cursor: 'pointer', fontSize: '11px', textAlign: 'right', fontWeight: acsAtPoint[0].status === s.key ? 'bold' : 'normal' }}>
                            {s.label}
                          </button>
                        ))}
                        {(airfieldRoutes?.length ?? 0) > 0 && (
                          <div style={{ borderTop: '1px solid #1e293b', marginTop: '4px', paddingTop: '4px' }}>
                            <button onClick={() => { const pos = getAircraftPositions(strip); const anyAc = acsAtPoint[0]; const existing: any = pos.find(x => x.idx === anyAc.idx); setTaxiDestRouteId(existing?.taxi_dest_route_id ?? null); setTaxiViaRouteIds(existing?.taxi_via_route_ids ?? []); setTaxiInstModal({ stripId: String(strip.id), idx: null }); setGroundQuickMenu(null); }}
                              style={{ display: 'block', width: '100%', padding: '4px 8px', background: '#0c1a2e', color: '#60a5fa', border: '1px solid #1e3a5f', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', textAlign: 'right', fontWeight: 'bold' }}>
                              {tr('ground.taxiInstructions')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
              // Not merged — render one chip per aircraft at this point, stacked across all strips.
              return acsAtPoint.map((ac, acMapIdx) => {
                const st = GROUND_STATUSES.find(s => s.key === ac.status) || GROUND_STATUSES[0];
                const isDragging = dragging?.stripId === String(strip.id) && dragging?.idx === ac.idx;
                const isMenuOpen = groundQuickMenu?.stripId === String(strip.id) && groundQuickMenu?.idx === ac.idx;
                const slot = slotIndex(pid, `${strip.id}|${ac.idx}`);
                const stackOffset = slot * SLOT_GAP;
                const pos = ptPos(pt.x_pct, pt.y_pct);
                const acRow = (stripAircraftData[String(strip.id).replace(/^s/, '')] || []).find(r => r.idx === ac.idx);
                const acMatchesDatk = datkFilter === null || (acRow?.datk != null && acRow.datk >= datkFilter);
                const acMatchesStatus = statusFilter.length === 0 || statusFilter.includes(ac.status);
                const acMatchesFilter = (filterMode === 'OR' && datkFilter !== null && statusFilter.length > 0)
                  ? acMatchesDatk || acMatchesStatus
                  : acMatchesDatk && acMatchesStatus;
                const anyFilterActiveAc = datkFilter !== null || statusFilter.length > 0;
                const acFilterOpacity = isDragging ? 0.4 : (anyFilterActiveAc && !acMatchesFilter ? 0.2 : 1);
                const acHighlight = anyFilterActiveAc && acMatchesFilter;
                return (
                  <div key={`${strip.id}-${ac.idx}`}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ stripId: strip.id, idx: ac.idx })); setDragging({ stripId: String(strip.id), idx: ac.idx }); setGroundQuickMenu(null); }}
                    onDragEnd={() => { setDragging(null); setMapDragOver(null); }}
                    style={{ position: 'absolute', left: pos.left, top: pos.top, transform: `translate(-50%, calc(-100% - 28px - ${stackOffset}px)) scale(${1/effectiveMapScale})`, transformOrigin: 'center bottom', zIndex: 20 + slot + acMapIdx, cursor: 'grab', opacity: acFilterOpacity, pointerEvents: 'all', userSelect: 'none', transition: 'opacity 0.2s' }}>
                    <div
                      className={st.flash ? 'ground-takeoff-flash' : ''}
                      onClick={e => { e.stopPropagation(); setGroundQuickMenu(isMenuOpen ? null : { stripId: String(strip.id), idx: ac.idx, x: e.clientX, y: e.clientY }); }}
                      title={(ac as any).isAuto ? 'מוצב אוטומטית לפי דת"ק + זמן המראה' : undefined}
                      style={{ background: mapDisplaySettings.showChipBg ? st.bg : 'transparent', border: !mapDisplaySettings.showChipBg ? 'none' : !mapDisplaySettings.showChipBorder ? 'none' : (ac as any).isAuto ? `2px dashed #34d399` : `2px solid ${acHighlight ? '#3b82f6' : st.dot}`, borderRadius: '5px', padding: mapDisplaySettings.showChipBg ? '3px 7px' : '0 2px', fontSize: '12px', color: st.color, fontWeight: 'bold', whiteSpace: 'nowrap', boxShadow: mapDisplaySettings.showChipBg ? (acHighlight ? '0 0 10px 3px #3b82f6aa, 0 2px 6px rgba(0,0,0,0.5)' : (ac as any).isAuto ? '0 0 8px 2px #34d39944, 0 2px 6px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.5)') : 'none', display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <span style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 'bold' }}>{strip.callSign || strip.callsign || '?'}</span>
                        <span style={{ color: st.color, fontSize: '11px' }}>#{ac.idx}</span>
                        {(strip.sq || strip.squadron) && <span style={{ color: '#94a3b8', fontSize: '10px' }}>{strip.sq || strip.squadron}</span>}
                      </div>
                      {strip.takeoff_time && (() => {
                        const d = new Date(strip.takeoff_time);
                        const hh = String(d.getHours()).padStart(2, '0');
                        const mm = String(d.getMinutes()).padStart(2, '0');
                        const past = d.getTime() < Date.now();
                        return <span style={{ color: past ? '#f87171' : '#facc15', fontSize: '10px', fontWeight: 'bold' }}>🕐 {hh}:{mm}</span>;
                      })()}
                    </div>
                    {isMenuOpen && (
                      <div style={{ position: 'absolute', ...(groundQuickMenu && groundQuickMenu.y < window.innerHeight / 2 ? { top: 'calc(100% + 4px)' } : { bottom: 'calc(100% + 4px)' }), left: '50%', transform: 'translateX(-50%)', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '6px', zIndex: 100, minWidth: '140px', boxShadow: '0 4px 20px rgba(0,0,0,0.7)' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', marginBottom: '5px', textAlign: 'center' }}>{tr('ground.changeStatus')}</div>
                        {GROUND_STATUSES.map(s => (
                          <button key={s.key} onClick={() => {
                            if (s.key === 'takeoff') { setGroundQuickMenu(null); setSidModal({ strip, idx: ac.idx }); return; }
                            const positions = getAircraftPositions(strip); const updated = positions.map(x => x.idx === ac.idx ? { ...x, status: s.key as GroundStatusKey } : x); onUpdateAircraft(String(strip.id), updated); setGroundQuickMenu(null);
                          }}
                            style={{ display: 'block', width: '100%', padding: '4px 8px', marginBottom: '3px', background: ac.status === s.key ? s.bg : 'transparent', color: s.color, border: `1px solid ${ac.status === s.key ? s.dot : '#1e293b'}`, borderRadius: '5px', cursor: 'pointer', fontSize: '11px', textAlign: 'right', fontWeight: ac.status === s.key ? 'bold' : 'normal' }}>
                            {s.label}
                          </button>
                        ))}
                        {(airfieldRoutes?.length ?? 0) > 0 && (
                          <div style={{ borderTop: '1px solid #1e293b', marginTop: '4px', paddingTop: '4px' }}>
                            <button onClick={() => { const pos = getAircraftPositions(strip); const existing: any = pos.find(x => x.idx === ac.idx); setTaxiDestRouteId(existing?.taxi_dest_route_id ?? null); setTaxiViaRouteIds(existing?.taxi_via_route_ids ?? []); setTaxiInstModal({ stripId: String(strip.id), idx: ac.idx }); setGroundQuickMenu(null); }}
                              style={{ display: 'block', width: '100%', padding: '4px 8px', background: '#0c1a2e', color: '#60a5fa', border: '1px solid #1e3a5f', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', textAlign: 'right', fontWeight: 'bold' }}>
                              {tr('ground.taxiInstructions')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            });
            });
          })()}

          {/* Click anywhere on map to close quick menu */}
          {groundQuickMenu && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 15 }} onClick={() => setGroundQuickMenu(null)} />
          )}
        </div>
      </div>

      {/* Taxi Instructions Modal */}
      {taxiInstModal && (() => {
        // taxiViaRouteIds holds ordered route IDs; 0 means "empty slot"
        const viaSlots: number[] = taxiViaRouteIds.length > 0 ? taxiViaRouteIds : [0];
        const routes = airfieldRoutes || [];
        // Blocked route detection for taxi modal
        const TAXI_DS: Record<string,string> = { close:'סגור', open:'פתוח', off:'כבוי', stop:'עצור', go:'עבור', blink:'מנצנץ' };
        const taxiBlockedRouteToElem: Record<number,string> = {};
        (airfieldElements||[]).forEach((ae: any) => {
          const rels: number[] = Array.isArray(ae.relevant_routes) ? ae.relevant_routes : [];
          const bsts: string[] = Array.isArray(ae.blocking_statuses) ? ae.blocking_statuses : [];
          if (!rels.length || !bsts.length) return;
          const eff = TAXI_DS[ae.display_state||''] || ae.status || '';
          if (!bsts.includes(eff) && !bsts.includes(ae.status||'')) return;
          rels.forEach((rid: number) => { taxiBlockedRouteToElem[rid] = ae.name; });
        });
        const taxiBlockedRouteSet = new Set<number>(Object.keys(taxiBlockedRouteToElem).map(Number));
        const filledVia = viaSlots.filter(id => id > 0);
        const taxiBlockedVia = filledVia.filter(id => taxiBlockedRouteSet.has(id));
        const taxiDestBlocked = taxiDestRouteId != null && taxiBlockedRouteSet.has(taxiDestRouteId);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}
            onClick={() => setTaxiInstModal(null)}>
            <div style={{ background: '#1e293b', borderRadius: '12px', padding: '22px', maxWidth: '380px', width: '90%', border: '1px solid #334155', boxShadow: '0 8px 32px rgba(0,0,0,0.7)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#e2e8f0', marginBottom: '18px' }}>{tr('ground.taxiInstructions')}</div>

              {/* יעד */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: '#94a3b8', letterSpacing: '0.03em' }}>{tr('ground.destination2')}</label>
                <select value={taxiDestRouteId ?? ''} onChange={e => setTaxiDestRouteId(e.target.value ? Number(e.target.value) : null)}
                  style={{ width: '100%', padding: '9px 10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '7px', color: 'white', fontSize: '13px', direction: 'rtl' }}>
                  <option value="">{tr('ground.noDestination')}</option>
                  {routes.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              {/* דרך — ordered slots */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 'bold', color: '#94a3b8', letterSpacing: '0.03em' }}>{tr('ground.via')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {viaSlots.map((routeId, slotIdx) => (
                    <div key={slotIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '18px', textAlign: 'center', fontSize: '11px', color: '#475569', fontWeight: 'bold', flexShrink: 0 }}>{slotIdx + 1}</span>
                      <select
                        value={routeId || ''}
                        onChange={e => {
                          const val = e.target.value ? Number(e.target.value) : 0;
                          const next = [...viaSlots];
                          next[slotIdx] = val;
                          setTaxiViaRouteIds(next);
                        }}
                        style={{ flex: 1, padding: '7px 10px', background: '#0f172a', border: `1px solid ${routeId ? '#3b82f6' : '#334155'}`, borderRadius: '6px', color: routeId ? '#93c5fd' : '#475569', fontSize: '13px', direction: 'rtl' }}
                      >
                        <option value="">{tr('shared.selectRunway')}</option>
                        {routes.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <button
                        onClick={() => setTaxiViaRouteIds(viaSlots.filter((_, i) => i !== slotIdx))}
                        style={{ padding: '4px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}
                        title={tr('ground.removeRow')}
                      >✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => setTaxiViaRouteIds([...viaSlots, 0])}
                    style={{ alignSelf: 'flex-start', marginTop: '2px', padding: '4px 12px', background: 'transparent', color: '#3b82f6', border: '1px dashed #3b82f6', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}
                  >{tr('ground.addVia')}</button>
                </div>
              </div>

              {/* Blocked route warning for taxi */}
              {(taxiBlockedVia.length > 0 || taxiDestBlocked) && (
                <div style={{ marginBottom: '16px', background: '#2d0b0b', border: '1px solid #dc2626', borderRadius: '7px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '12px', color: '#fca5a5', fontWeight: 'bold', marginBottom: taxiBlockedVia.length > 0 ? '4px' : 0 }}>
                    {tr('ground.routeBlocked')}
                  </div>
                  {taxiDestBlocked && (
                    <div style={{ fontSize: '11px', color: '#fca5a5', marginBottom: '3px' }}>
                      יעד: {routes.find((r: any) => r.id === taxiDestRouteId)?.name || `#${taxiDestRouteId}`}
                      {taxiBlockedRouteToElem[taxiDestRouteId!] ? ` — חסום ע"י ${taxiBlockedRouteToElem[taxiDestRouteId!]}` : ''}
                    </div>
                  )}
                  {taxiBlockedVia.map((id: number) => (
                    <div key={id} style={{ fontSize: '11px', color: '#fca5a5' }}>
                      דרך: {routes.find((r: any) => r.id === id)?.name || `#${id}`}
                      {taxiBlockedRouteToElem[id] ? ` — חסום ע"י ${taxiBlockedRouteToElem[id]}` : ''}
                    </div>
                  ))}
                  <div style={{ fontSize: '10px', color: '#f87171', marginTop: '6px' }}>{tr('ground.chooseAnAlternativeRoute')}</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setTaxiInstModal(null)}
                  style={{ padding: '8px 16px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  {tr('shared.cancel')}
                </button>
                <button onClick={() => {
                  if (!onUpdateStripMeta) { setTaxiInstModal(null); return; }
                  const savedVia = viaSlots.filter(id => id > 0);
                  const strip = strips.find(s => String(s.id) === taxiInstModal.stripId);
                  const pos: AircraftPos[] = getAircraftPositions(strip || {});
                  const updated = taxiInstModal.idx === null
                    ? pos.map(x => ({ ...x, taxi_dest_route_id: taxiDestRouteId, taxi_via_route_ids: savedVia }))
                    : pos.map(x => x.idx === taxiInstModal.idx ? { ...x, taxi_dest_route_id: taxiDestRouteId, taxi_via_route_ids: savedVia } : x);
                  onUpdateStripMeta(taxiInstModal.stripId, { aircraft_positions: JSON.stringify(updated) });
                  setTaxiInstModal(null);
                }}
                  style={{ padding: '8px 20px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                  {tr('shared.save')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
          {/* Vehicle placement click overlay */}
          {addVehicleMode && (
            <div
              style={{ position: 'absolute', inset: 0, zIndex: 60, cursor: 'crosshair' }}
              onClick={e => {
                const img = airfieldImgRef.current;
                if (!img || !img.naturalWidth || !img.naturalHeight) return;
                // Compute image bounds fresh from DOM at click time (avoids stale state)
                const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const cW = containerRect.width / groundMapZoom;
                const cH = containerRect.height / groundMapZoom;
                const iAspect = img.naturalWidth / img.naturalHeight;
                const cAspect = cW / cH;
                let imgLeft: number, imgTop: number, imgW: number, imgH: number;
                if (iAspect > cAspect) {
                  imgW = cW; imgH = cW / iAspect;
                  imgLeft = 0; imgTop = (cH - imgH) / 2;
                } else {
                  imgH = cH; imgW = cH * iAspect;
                  imgLeft = (cW - imgW) / 2; imgTop = 0;
                }
                const relX = (e.clientX - containerRect.left) / groundMapZoom;
                const relY = (e.clientY - containerRect.top) / groundMapZoom;
                const x_pct = Math.max(0, Math.min(100, ((relX - imgLeft) / imgW) * 100));
                const y_pct = Math.max(0, Math.min(100, ((relY - imgTop) / imgH) * 100));
                setVehiclePlaceModal({ x_pct, y_pct });
                setVehicleForm({ name: '', element_type_id: '' });
              }}
            />
          )}
          {/* Place existing element click overlay */}
          {placingExistingElement && (
            <div
              style={{ position: 'absolute', inset: 0, zIndex: 60, cursor: 'crosshair', background: 'rgba(245,158,11,0.08)' }}
              onClick={async e => {
                const img = airfieldImgRef.current;
                if (!img || !img.naturalWidth || !img.naturalHeight) return;
                const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const cW = containerRect.width / groundMapZoom;
                const cH = containerRect.height / groundMapZoom;
                const iAspect = img.naturalWidth / img.naturalHeight;
                const cAspect = cW / cH;
                let imgLeft: number, imgTop: number, imgW: number, imgH: number;
                if (iAspect > cAspect) {
                  imgW = cW; imgH = cW / iAspect;
                  imgLeft = 0; imgTop = (cH - imgH) / 2;
                } else {
                  imgH = cH; imgW = cH * iAspect;
                  imgLeft = (cW - imgW) / 2; imgTop = 0;
                }
                const relX = (e.clientX - containerRect.left) / groundMapZoom;
                const relY = (e.clientY - containerRect.top) / groundMapZoom;
                const x_pct = Math.max(0, Math.min(100, ((relX - imgLeft) / imgW) * 100));
                const y_pct = Math.max(0, Math.min(100, ((relY - imgTop) / imgH) * 100));
                const el = placingExistingElement;
                if (onUpdateElement) {
                  await onUpdateElement(el.id, { name: el.name, category: el.category, status: el.status, note: el.note || '', display_state: el.display_state, blink_rate: el.blink_rate, open_icon_key: el.open_icon_key, close_icon_key: el.close_icon_key, rotation: el.rotation, camera_url: el.camera_url, x_pct, y_pct });
                }
                setPlacingExistingElement(null);
              }}
            />
          )}
          {mapBottomOverlay && (
            <div style={{ position: 'absolute', bottom: 14, right: 10, zIndex: 200, pointerEvents: 'auto' }}>
              {mapBottomOverlay}
            </div>
          )}
          </div>{/* end mapInnerRef — image + overlays stop here; panels above stay fixed */}

      {/* Camera position picker modal */}
      {cameraPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
          onClick={e => { if (e.target === e.currentTarget) setCameraPicker(null); }}>
          <div style={{ background: '#0f172a', border: '2px solid #1e3a5f', borderRadius: '14px', padding: '20px', width: '320px', direction: 'rtl', boxShadow: '0 8px 32px rgba(0,0,0,0.7)' }}>
            <div style={{ fontWeight: 'bold', color: '#7dd3fc', marginBottom: '14px', fontSize: '15px' }}>📷 {cameraPicker.el.name}</div>
            {/* URL */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>{tr('ground.cameraAddress')}</div>
              <input value={cameraPicker.url}
                onChange={e => setCameraPicker(p => p ? { ...p, url: e.target.value } : p)}
                placeholder="https://..."
                style={{ width: '100%', padding: '7px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '7px', color: '#e2e8f0', fontSize: '12px', direction: 'ltr', boxSizing: 'border-box' }} />
            </div>
            {/* Position selector */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>{tr('ground.cameraWindowPosition')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {([
                  { key: 'right', label: '◧ חלון ימני', icon: '▶' },
                  { key: 'left',  label: '◨ חלון שמאלי', icon: '◀' },
                  { key: 'top',   label: '⬒ למעלה', icon: '▲' },
                  { key: 'bottom',label: '⬓ למטה', icon: '▼' },
                ] as const).map(opt => (
                  <button key={opt.key}
                    onClick={() => setCameraPickerPos(opt.key)}
                    style={{ padding: '8px', background: cameraPickerPos === opt.key ? '#1d4ed844' : 'transparent', border: `1px solid ${cameraPickerPos === opt.key ? '#3b82f6' : '#334155'}`, borderRadius: '7px', color: cameraPickerPos === opt.key ? '#60a5fa' : '#94a3b8', cursor: 'pointer', fontSize: '11px', fontWeight: cameraPickerPos === opt.key ? 'bold' : 'normal' }}>
                    {opt.label}
                  </button>
                ))}
                <button
                  onClick={() => setCameraPickerPos('full')}
                  style={{ gridColumn: '1 / -1', padding: '8px', background: cameraPickerPos === 'full' ? '#1d4ed844' : 'transparent', border: `1px solid ${cameraPickerPos === 'full' ? '#3b82f6' : '#334155'}`, borderRadius: '7px', color: cameraPickerPos === 'full' ? '#60a5fa' : '#94a3b8', cursor: 'pointer', fontSize: '11px', fontWeight: cameraPickerPos === 'full' ? 'bold' : 'normal' }}>
                  {tr('ground.fullScreen')}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { if (cameraPicker.url) { if (!cameraPanels.some(p => p.url === cameraPicker.url)) { const id = nextCamId.current++; const off = (cameraPanels.length % 6) * 28; setCameraPanels(prev => [...prev, { id, url: cameraPicker.url, name: cameraPicker.el.name, dragPos: { x: 80 + off, y: 80 + off }, expanded: false }]); } setCameraPicker(null); } }}
                disabled={!cameraPicker.url}
                style={{ flex: 2, padding: '10px', background: cameraPicker.url ? '#1d4ed8' : '#1e293b', color: cameraPicker.url ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: cameraPicker.url ? 'pointer' : 'default', fontSize: '13px', fontWeight: 'bold' }}>
                {tr('ground.openCamera')}
              </button>
              <button onClick={() => setCameraPicker(null)}
                style={{ flex: 1, padding: '10px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                {tr('shared.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera wall — fullscreen grid of all cameras */}
      {cameraWall && (() => {
        const allCams = (airfieldElements || []).filter((e: any) => e.camera_url);
        const n = allCams.length;
        const cols = n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : Math.ceil(Math.sqrt(n));
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: '#000', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
            <div style={{ padding: '6px 12px', background: '#0f172a', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontSize: '16px' }}>📷</span>
              <span style={{ color: '#7dd3fc', fontWeight: 'bold', fontSize: '14px', flex: 1 }}>{tr('shared.cameraBoard')} {n} {tr('shared.cameras')}</span>
              <button onClick={() => setCameraWall(false)}
                style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '6px', padding: '4px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>{tr('shared.close2')}</button>
            </div>
            {n === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '16px' }}>{tr('shared.noCamerasWithA')}</div>
            ) : (
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '2px', padding: '2px', overflow: 'hidden', minHeight: 0 }}>
                {allCams.map((cam: any) => (
                  <div key={cam.id} style={{ position: 'relative', background: '#0a0a0a', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                    <div style={{ padding: '3px 8px', background: '#0f172a', borderBottom: '1px solid #1e3a5f', fontSize: '11px', color: '#93c5fd', fontWeight: 'bold', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>📷</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cam.name}</span>
                    </div>
                    <iframe src={toEmbedUrl(cam.camera_url)} style={{ flex: 1, border: 'none', width: '100%', height: '100%' }} allow="camera; microphone; autoplay" allowFullScreen title={cam.name} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Camera panels — multiple draggable floating windows */}
      {cameraPanels.map(panel => {
        const w = panel.expanded ? 700 : 380;
        const h = panel.expanded ? 520 : 260;
        return (
          <div key={panel.id} style={{ position: 'fixed', left: panel.dragPos.x, top: panel.dragPos.y, width: w, height: h, zIndex: 9999, background: '#000', border: '2px solid #3b82f6', borderRadius: '10px', boxShadow: '0 8px 40px rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div
              onMouseDown={e => {
                const startX = e.clientX - panel.dragPos.x, startY = e.clientY - panel.dragPos.y;
                const onMove = (ev: MouseEvent) => setCameraPanels(prev => prev.map(p => p.id === panel.id ? { ...p, dragPos: { x: ev.clientX - startX, y: ev.clientY - startY } } : p));
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
              style={{ cursor: 'grab', padding: '6px 10px', background: '#0f172a', borderBottom: '1px solid #1e3a5f', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none', direction: 'rtl' }}>
              <span style={{ fontSize: '14px' }}>📷</span>
              <span style={{ color: '#7dd3fc', fontWeight: 'bold', fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{panel.name}</span>
              <button onClick={() => setCameraPanels(prev => prev.map(p => p.id === panel.id ? { ...p, expanded: !p.expanded } : p))}
                title={panel.expanded ? 'כווץ' : 'הגדל'}
                style={{ padding: '2px 7px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' }}>
                {panel.expanded ? '⊡' : '⊞'}
              </button>
              <button onClick={() => setCameraPanels(prev => prev.filter(p => p.id !== panel.id))}
                style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>✕</button>
            </div>
            <iframe src={toEmbedUrl(panel.url)} style={{ flex: 1, border: 'none', width: '100%' }} allow="camera; microphone; autoplay" allowFullScreen title="camera" />
          </div>
        );
      })}

      {/* Vehicle placement modal */}
      {vehiclePlaceModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}
          onClick={e => { if (e.target === e.currentTarget) { setVehiclePlaceModal(null); setAddVehicleMode(false); } }}>
          <div style={{ background: lightMode ? '#fff' : '#0f172a', border: `2px solid ${lightMode ? '#cbd5e1' : '#1e3a5f'}`, borderRadius: '12px', padding: '18px', width: '280px', direction: 'rtl', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
            <div style={{ fontWeight: 'bold', color: lightMode ? '#1e293b' : 'white', marginBottom: '12px', fontSize: '14px' }}>{tr('ground.addAVehicleTo')}</div>
            <input
              autoFocus
              placeholder={tr('ground.vehicleName')}
              value={vehicleForm.name}
              onChange={e => setVehicleForm(p => ({ ...p, name: e.target.value }))}
              onKeyDown={async e => { if (e.key === 'Enter' && vehicleForm.name.trim()) { e.preventDefault(); setVehicleSaving(true); try { await onCreateElement!({ name: vehicleForm.name.trim(), element_type_id: vehicleForm.element_type_id ? Number(vehicleForm.element_type_id) : null, x_pct: vehiclePlaceModal.x_pct, y_pct: vehiclePlaceModal.y_pct }); } finally { setVehicleSaving(false); } setVehiclePlaceModal(null); setAddVehicleMode(false); } }}
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: '6px', border: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`, background: lightMode ? '#f8fafc' : '#0c1824', color: lightMode ? '#1e293b' : '#e2e8f0', fontSize: '13px', marginBottom: '8px', direction: 'rtl' }}
            />
            {elementTypes && (elementTypes.filter((t: any) => t.category === 'vehicle' || t.category === 'כלי רכב').length > 0 ? elementTypes.filter((t: any) => t.category === 'vehicle' || t.category === 'כלי רכב') : elementTypes).length > 0 && (
              <select
                value={vehicleForm.element_type_id}
                onChange={e => setVehicleForm(p => ({ ...p, element_type_id: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`, background: lightMode ? '#f8fafc' : '#0c1824', color: lightMode ? '#1e293b' : '#e2e8f0', fontSize: '12px', marginBottom: '10px', direction: 'rtl' }}>
                <option value="">{tr('ground.vehicleTypeOptional')}</option>
                {(elementTypes.filter((t: any) => t.category === 'vehicle' || t.category === 'כלי רכב').length > 0
                  ? elementTypes.filter((t: any) => t.category === 'vehicle' || t.category === 'כלי רכב')
                  : elementTypes
                ).map((t: any) => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </select>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setVehiclePlaceModal(null); setAddVehicleMode(false); }}
                style={{ padding: '6px 14px', borderRadius: '6px', border: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`, background: 'transparent', color: lightMode ? '#475569' : '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>
                {tr('shared.cancel')}
              </button>
              <button
                disabled={!vehicleForm.name.trim() || vehicleSaving}
                onClick={async () => {
                  if (!vehicleForm.name.trim() || !onCreateElement) return;
                  setVehicleSaving(true);
                  try { await onCreateElement({ name: vehicleForm.name.trim(), element_type_id: vehicleForm.element_type_id ? Number(vehicleForm.element_type_id) : null, x_pct: vehiclePlaceModal.x_pct, y_pct: vehiclePlaceModal.y_pct }); }
                  finally { setVehicleSaving(false); }
                  setVehiclePlaceModal(null);
                  setAddVehicleMode(false);
                }}
                style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: vehicleForm.name.trim() ? '#1d4ed8' : '#334155', color: vehicleForm.name.trim() ? 'white' : '#64748b', fontSize: '12px', cursor: vehicleForm.name.trim() ? 'pointer' : 'default', fontWeight: 'bold' }}>
                {vehicleSaving ? '...' : '➕ הוסף'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Element edit drawer — side panel with focus-mode field editing */}
      {elemEditModal && (() => {
        const ELEM_STATUS_OPTS = ['תקין', 'שמיש', 'חלקי', 'לא תקין', 'תקול'];
        const ELEM_STATUS_COLOR: Record<string, string> = { 'תקין': '#22c55e', 'שמיש': '#22c55e', 'לא תקין': '#ef4444', 'תקול': '#ef4444', 'חלקי': '#f97316' };
        const el = elemEditModal.el;
        const save = async () => {
          if (onUpdateElement) await onUpdateElement(el.id, { name: elemEditModal.name, category: elemEditModal.category, status: elemEditModal.status, note: elemEditModal.note, display_state: elemEditModal.displayState, blink_rate: elemEditModal.blinkRate, open_icon_key: elemEditModal.openIconKey, close_icon_key: elemEditModal.closeIconKey, rotation: elemEditModal.rotation, camera_url: elemEditModal.cameraUrl || null, hidden_on_map: elemEditModal.hiddenOnMap });
          setElemEditModal(null);
          setEditingElemField(null);
        };
        const D_BG = lightMode ? '#ffffff' : '#0f172a';
        const D_BORDER = lightMode ? '#e2e8f0' : '#1e3a5f';
        const D_HDR = lightMode ? '#1e3a5f' : '#0a1628';
        const D_LABEL = lightMode ? '#64748b' : '#94a3b8';
        const D_INPUT_BG = lightMode ? '#f8fafc' : '#0c1824';
        const D_TEXT = lightMode ? '#1e293b' : '#e2e8f0';
        type ElemField = 'name' | 'category' | 'status' | 'note';
        const FIELDS: { key: ElemField; label: string; icon: string }[] = [
          { key: 'name', label: 'שם', icon: '✏' },
          { key: 'category', label: 'קטגוריה', icon: '🏷' },
          { key: 'status', label: 'סטטוס', icon: '🔵' },
          { key: 'note', label: 'הערה', icon: '📝' },
        ];
        const activeField = editingElemField;
        const elCat = elemEditModal.category || 'כללי';
        const isCatOnMap = catMapHighlight.has(elCat) || (externalCatHighlight?.has(elCat) ?? false);
        return (
          <div style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: '260px', background: D_BG, borderRight: `2px solid #3b82f6`, boxShadow: '-6px 0 28px rgba(0,0,0,0.45)', zIndex: 4500, display: 'flex', flexDirection: 'column', direction: 'rtl', overflow: 'hidden' }}>
            {/* Drawer header */}
            <div style={{ background: D_HDR, padding: '10px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${D_BORDER}` }}>
              <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: el.type_color || '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0, border: `2px solid ${ELEM_STATUS_COLOR[elemEditModal.status] || '#94a3b8'}` }}>
                {el.type_icon || (el.category === 'camera' ? '📷' : '🔧')}
              </span>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#93c5fd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{elemEditModal.name || el.name}</div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>{elemEditModal.category || '—'}</div>
              </div>
              <button onClick={() => { setElemEditModal(null); setEditingElemField(null); }}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px', padding: '2px', flexShrink: 0 }}>✕</button>
            </div>

            {/* Category map-highlight toggle */}
            <div style={{ padding: '7px 12px', background: lightMode ? '#f1f5f9' : '#0a1020', borderBottom: `1px solid ${D_BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: D_LABEL, flex: 1 }}>{tr('shared.category2')} <strong style={{ color: D_TEXT }}>{elCat}</strong></span>
              <button
                onClick={() => setCatMapHighlight(prev => { const n = new Set(prev); isCatOnMap ? n.delete(elCat) : n.add(elCat); return n; })}
                style={{ padding: '3px 8px', fontSize: '10px', borderRadius: '4px', border: `1px solid ${isCatOnMap ? '#3b82f6' : D_BORDER}`, background: isCatOnMap ? '#1d4ed8' : 'transparent', color: isCatOnMap ? '#bfdbfe' : D_LABEL, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                {isCatOnMap ? '👁 מוצג' : '👁 הצג על מפה'}
              </button>
            </div>

            {/* Fields — focus mode: active field expanded, others collapsed */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {FIELDS.map(f => {
                const isActive = activeField === f.key;
                const isOtherActive = activeField !== null && activeField !== f.key;
                if (isOtherActive) return null; // hide other fields when one is being edited

                let currentVal: string = '';
                if (f.key === 'name') currentVal = elemEditModal.name;
                else if (f.key === 'category') currentVal = elemEditModal.category;
                else if (f.key === 'status') currentVal = elemEditModal.status;
                else if (f.key === 'note') currentVal = elemEditModal.note;

                const statusColor = f.key === 'status' ? (ELEM_STATUS_COLOR[elemEditModal.status] || '#94a3b8') : undefined;

                return (
                  <div key={f.key}
                    style={{ margin: '4px 10px', borderRadius: '8px', border: `1px solid ${isActive ? '#3b82f6' : D_BORDER}`, background: isActive ? (lightMode ? '#eff6ff' : '#0c1828') : D_BG, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                    {/* Field header / collapsed view — click to activate */}
                    <div
                      onClick={() => setEditingElemField(isActive ? null : f.key)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', cursor: 'pointer', userSelect: 'none' }}>
                      <span style={{ fontSize: '13px', flexShrink: 0 }}>{f.icon}</span>
                      <span style={{ fontSize: '11px', color: D_LABEL, flexShrink: 0, minWidth: '48px' }}>{f.label}</span>
                      {!isActive && (
                        <span style={{ flex: 1, fontSize: '12px', color: f.key === 'status' ? statusColor : D_TEXT, fontWeight: f.key === 'status' ? 'bold' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'right' }}>
                          {currentVal || <span style={{ color: '#475569', fontStyle: 'italic' }}>—</span>}
                        </span>
                      )}
                      <span style={{ fontSize: '10px', color: '#475569', flexShrink: 0, transform: isActive ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                    </div>
                    {/* Expanded / active input */}
                    {isActive && (
                      <div style={{ padding: '0 10px 10px' }}>
                        {f.key === 'name' && (
                          <input
                            autoFocus
                            value={elemEditModal.name}
                            onChange={e => setElemEditModal(p => p ? { ...p, name: e.target.value } : p)}
                            onKeyDown={e => { if (e.key === 'Enter') setEditingElemField(null); if (e.key === 'Escape') setEditingElemField(null); }}
                            style={{ width: '100%', padding: '7px 10px', background: D_INPUT_BG, border: `1px solid #3b82f6`, borderRadius: '6px', color: D_TEXT, fontSize: '13px', direction: 'rtl', boxSizing: 'border-box', outline: 'none' }} />
                        )}
                        {f.key === 'category' && (
                          <input
                            autoFocus
                            value={elemEditModal.category}
                            onChange={e => setElemEditModal(p => p ? { ...p, category: e.target.value } : p)}
                            onKeyDown={e => { if (e.key === 'Enter') setEditingElemField(null); if (e.key === 'Escape') setEditingElemField(null); }}
                            placeholder={tr('shared.forExampleLightingFuel')}
                            style={{ width: '100%', padding: '7px 10px', background: D_INPUT_BG, border: `1px solid #3b82f6`, borderRadius: '6px', color: D_TEXT, fontSize: '13px', direction: 'rtl', boxSizing: 'border-box', outline: 'none' }} />
                        )}
                        {f.key === 'status' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {ELEM_STATUS_OPTS.map(s => (
                              <button key={s}
                                onClick={() => { setElemEditModal(p => p ? { ...p, status: s } : p); setEditingElemField(null); }}
                                style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${elemEditModal.status === s ? ELEM_STATUS_COLOR[s] : D_BORDER}`, background: elemEditModal.status === s ? ELEM_STATUS_COLOR[s] + '22' : D_INPUT_BG, color: elemEditModal.status === s ? ELEM_STATUS_COLOR[s] : D_LABEL, cursor: 'pointer', fontSize: '13px', fontWeight: elemEditModal.status === s ? 'bold' : 'normal', textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px', direction: 'rtl' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: ELEM_STATUS_COLOR[s] || '#888', display: 'inline-block', flexShrink: 0 }} />
                                {s}
                                {elemEditModal.status === s && <span style={{ marginRight: 'auto', fontSize: '12px' }}>✓</span>}
                              </button>
                            ))}
                          </div>
                        )}
                        {f.key === 'note' && (
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                            <textarea
                              autoFocus
                              value={elemEditModal.note}
                              onChange={e => setElemEditModal(p => p ? { ...p, note: e.target.value } : p)}
                              rows={3}
                              placeholder={tr('shared.optionalNote')}
                              style={{ flex: 1, padding: '7px 10px', background: D_INPUT_BG, border: `1px solid #3b82f6`, borderRadius: '6px', color: D_TEXT, fontSize: '12px', direction: 'rtl', resize: 'none', boxSizing: 'border-box', outline: 'none' }} />
                            <VKTrigger value={elemEditModal.note || ''} onChange={v => setElemEditModal(p => p ? { ...p, note: v } : p)} mode="full" label="הערה" size={16} />
                          </div>
                        )}
                        <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={() => setEditingElemField(null)}
                            style={{ padding: '4px 10px', fontSize: '11px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>{tr('ground.closeAirfield')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* When no field is active — show hint */}
              {activeField === null && (
                <div style={{ padding: '10px 14px', fontSize: '11px', color: '#475569', direction: 'rtl', fontStyle: 'italic' }}>
                  {tr('ground.clickAFieldTo')}
                </div>
              )}

              {/* Display state section — visible when no field editing */}
              {activeField === null && (
                <div style={{ padding: '10px 12px', borderTop: `1px solid ${D_BORDER}` }}>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: D_LABEL, marginBottom: '7px' }}>{tr('ground.displayMode')}</div>
                  {/* display_state buttons — type-aware */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                    {getElemDisplayStateOpts(el.type_icon || '').map(opt => (
                      <button key={opt.key}
                        onClick={() => setElemEditModal(p => p ? { ...p, displayState: opt.key } : p)}
                        style={{ padding: '5px 4px', background: elemEditModal.displayState === opt.key ? opt.color + '33' : 'transparent', border: `1px solid ${elemEditModal.displayState === opt.key ? opt.color : D_BORDER}`, borderRadius: '5px', color: elemEditModal.displayState === opt.key ? opt.color : D_LABEL, cursor: 'pointer', fontSize: '11px', fontWeight: elemEditModal.displayState === opt.key ? 'bold' : 'normal', textAlign: 'center' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {/* Blink rate — only when blink selected */}
                  {elemEditModal.displayState === 'blink' && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '10px', color: D_LABEL, marginBottom: '4px' }}>{tr('ground.blinkRateSeconds')}</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[0.5, 1.0, 1.5, 2.0].map(r => (
                          <button key={r}
                            onClick={() => setElemEditModal(p => p ? { ...p, blinkRate: r } : p)}
                            style={{ flex: 1, padding: '4px 0', background: elemEditModal.blinkRate === r ? '#f59e0b33' : 'transparent', border: `1px solid ${elemEditModal.blinkRate === r ? '#f59e0b' : D_BORDER}`, borderRadius: '4px', color: elemEditModal.blinkRate === r ? '#fbbf24' : D_LABEL, cursor: 'pointer', fontSize: '11px', fontWeight: elemEditModal.blinkRate === r ? 'bold' : 'normal' }}>
                            {r}s
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Rotation control */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', color: D_LABEL, marginBottom: '5px' }}>{tr('ground.rotateIcon')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                      {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
                        <button key={deg}
                          onClick={() => setElemEditModal(p => p ? { ...p, rotation: deg } : p)}
                          style={{ padding: '3px 6px', background: elemEditModal.rotation === deg ? '#6366f133' : 'transparent', border: `1px solid ${elemEditModal.rotation === deg ? '#6366f1' : D_BORDER}`, borderRadius: '4px', color: elemEditModal.rotation === deg ? '#818cf8' : D_LABEL, cursor: 'pointer', fontSize: '10px', fontWeight: elemEditModal.rotation === deg ? 'bold' : 'normal' }}>
                          {deg}°
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Open icon key */}
                  <div style={{ marginBottom: '6px' }}>
                    <div style={{ fontSize: '10px', color: D_LABEL, marginBottom: '3px' }}>{tr('ground.openIconKeyOpen')}</div>
                    <input value={elemEditModal.openIconKey} onChange={e => setElemEditModal(p => p ? { ...p, openIconKey: e.target.value } : p)}
                      placeholder={tr('ground.forExampleMapRunway2')}
                      style={{ width: '100%', padding: '5px 8px', background: D_INPUT_BG, border: `1px solid ${D_BORDER}`, borderRadius: '5px', color: D_TEXT, fontSize: '11px', direction: 'ltr', boxSizing: 'border-box' }} />
                  </div>
                  {/* Close icon key */}
                  <div>
                    <div style={{ fontSize: '10px', color: D_LABEL, marginBottom: '3px' }}>{tr('ground.closedIconKeyClose')}</div>
                    <input value={elemEditModal.closeIconKey} onChange={e => setElemEditModal(p => p ? { ...p, closeIconKey: e.target.value } : p)}
                      placeholder={tr('ground.forExampleMapRunway')}
                      style={{ width: '100%', padding: '5px 8px', background: D_INPUT_BG, border: `1px solid ${D_BORDER}`, borderRadius: '5px', color: D_TEXT, fontSize: '11px', direction: 'ltr', boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Hidden on map toggle */}
            <div style={{ padding: '8px 12px', borderTop: `1px solid ${D_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: elemEditModal.hiddenOnMap ? '#f97316' : D_LABEL }}>{tr('ground.hideOnMap')}</div>
                <div style={{ fontSize: '9px', color: D_LABEL, marginTop: '2px' }}>{tr('ground.theElementWillNot')}</div>
              </div>
              <button
                onClick={() => setElemEditModal(p => p ? { ...p, hiddenOnMap: !p.hiddenOnMap } : p)}
                style={{ flexShrink: 0, padding: '5px 12px', borderRadius: '6px', border: `1.5px solid ${elemEditModal.hiddenOnMap ? '#f97316' : (lightMode ? '#cbd5e1' : '#334155')}`, background: elemEditModal.hiddenOnMap ? '#7c2d1233' : 'transparent', color: elemEditModal.hiddenOnMap ? '#fb923c' : D_LABEL, cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                {elemEditModal.hiddenOnMap ? 'מוסתר' : 'מוצג'}
              </button>
            </div>

            {/* Camera URL section */}
            <div style={{ padding: '10px 12px', borderTop: `1px solid ${D_BORDER}` }}>
              <div style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: 'bold', marginBottom: '6px' }}>{tr('ground.camera')}</div>
              <div style={{ fontSize: '10px', color: D_LABEL, marginBottom: '3px' }}>{tr('ground.cameraUrlStreamRtsp')}</div>
              <input value={elemEditModal.cameraUrl} onChange={e => setElemEditModal(p => p ? { ...p, cameraUrl: e.target.value } : p)}
                placeholder="https://..."
                style={{ width: '100%', padding: '5px 8px', background: D_INPUT_BG, border: `1px solid ${elemEditModal.cameraUrl ? '#3b82f6' : D_BORDER}`, borderRadius: '5px', color: D_TEXT, fontSize: '11px', direction: 'ltr', boxSizing: 'border-box' }} />
              {elemEditModal.cameraUrl && (
                <div style={{ fontSize: '9px', color: '#60a5fa', marginTop: '4px' }}>{tr('ground.clickingTheElementOn')}</div>
              )}
            </div>

            {/* Footer — Save / Cancel */}
            <div style={{ padding: '10px 12px', borderTop: `1px solid ${D_BORDER}`, flexShrink: 0, display: 'flex', gap: '8px' }}>
              <button onClick={save}
                style={{ flex: 2, padding: '9px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                {tr('shared.save')}
              </button>
              <button onClick={() => { setElemEditModal(null); setEditingElemField(null); }}
                style={{ flex: 1, padding: '9px', background: lightMode ? '#e2e8f0' : '#1e293b', color: D_LABEL, border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                {tr('shared.cancel')}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Element quick status picker — for can_change_status elements */}
      {/* Polygon status picker */}
      {polygonStatusPicker && (() => {
        const { polygon, x, y, currentStatus } = polygonStatusPicker;
        const px = Math.min(x + 8, window.innerWidth - 230);
        const py = Math.min(y + 8, window.innerHeight - 320);
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 99999 }} onClick={() => setPolygonStatusPicker(null)}>
            <div style={{ position: 'absolute', left: px, top: py, background: '#1e293b', borderRadius: '12px', padding: '14px', border: '1px solid #334155', boxShadow: '0 8px 32px rgba(0,0,0,0.75)', direction: 'rtl', minWidth: '190px' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px', fontWeight: 'bold' }}>
                🔷 {polygon.name}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '8px' }}>
                {(airfieldStatusTypes || []).map((st: any) => {
                  const isSelected = currentStatus?.status_type_id === st.id;
                  return (
                    <button key={st.id} onClick={() => {
                      if (onUpdatePolygonStatus) onUpdatePolygonStatus(polygon.id, st.id, polygonPickerNote, polygonPickerGrf || null, polygonPickerRvr ? Number(polygonPickerRvr) : null);
                      setPolygonStatusPicker(null);
                    }}
                      style={{ padding: '7px 12px', background: isSelected ? (st.color || '#888') + '33' : 'transparent', border: `1px solid ${isSelected ? (st.color || '#888') : '#334155'}`, borderRadius: '7px', color: isSelected ? (st.color || '#e2e8f0') : '#cbd5e1', cursor: 'pointer', fontSize: '13px', fontWeight: isSelected ? 'bold' : 'normal', textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: st.color || '#888', display: 'inline-block', flexShrink: 0 }} />
                      {st.name}
                      {isSelected && <span style={{ marginRight: 'auto', fontSize: '11px' }}>✓</span>}
                    </button>
                  );
                })}
                {currentStatus && (
                  <button onClick={() => {
                    if (onUpdatePolygonStatus) onUpdatePolygonStatus(polygon.id, null, '');
                    setPolygonStatusPicker(null);
                  }}
                    style={{ padding: '5px 12px', background: 'transparent', border: '1px solid #475569', borderRadius: '7px', color: '#94a3b8', cursor: 'pointer', fontSize: '12px', textAlign: 'right' }}>
                    {tr('ground.clearStatus')}
                  </button>
                )}
              </div>
              {/* GRF — wetness status */}
              <div style={{ marginTop: '10px', marginBottom: '6px' }}>
                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '5px', fontWeight: 'bold' }}>{tr('ground.grfRunwayCondition')}</div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['יבש', 'חלקי', 'רטוב'].map(g => (
                    <button key={g} onClick={() => setPolygonPickerGrf(polygonPickerGrf === g ? null : g)}
                      style={{ flex: 1, padding: '4px 6px', borderRadius: '5px', border: `1px solid ${polygonPickerGrf === g ? '#60a5fa' : '#334155'}`, background: polygonPickerGrf === g ? '#1e40af55' : 'transparent', color: polygonPickerGrf === g ? '#93c5fd' : '#94a3b8', fontSize: '11px', cursor: 'pointer', fontWeight: polygonPickerGrf === g ? 'bold' : 'normal' }}>
                      {g === 'יבש' ? '☀' : g === 'חלקי' ? '💧' : '🌊'} {g}
                    </button>
                  ))}
                </div>
              </div>
              {/* RVR — visibility */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: 'bold' }}>{tr('ground.rvrVisibilityMeters')}</div>
                <input type="number" value={polygonPickerRvr} onChange={e => setPolygonPickerRvr(e.target.value)}
                  placeholder={tr('ground.0NoLimit')}
                  min="0" max="9999"
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px', padding: '5px 8px', boxSizing: 'border-box' }} />
                {polygonPickerRvr && (
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                    {Number(polygonPickerRvr) <= 200 ? '🔴 ≤200m — נמוך מאוד' : Number(polygonPickerRvr) <= 600 ? '🟠 ≤600m — נמוך' : Number(polygonPickerRvr) <= 1500 ? '🟡 ≤1500m — בינוני' : Number(polygonPickerRvr) <= 5000 ? '🟢 ≤5000m — טוב' : '✅ >5000m — ללא הגבלה'}
                  </div>
                )}
              </div>
              <input value={polygonPickerNote} onChange={e => setPolygonPickerNote(e.target.value)} placeholder={tr('shared.noteOptional')}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px', padding: '5px 8px', boxSizing: 'border-box' }} />
              {/* Apply GRF/RVR button when something changed */}
              {currentStatus && (polygonPickerGrf !== (currentStatus?.grf_status || null) || polygonPickerRvr !== (currentStatus?.rvr_meters != null ? String(currentStatus.rvr_meters) : '')) && (
                <button onClick={() => {
                  if (onUpdatePolygonStatus) onUpdatePolygonStatus(polygon.id, currentStatus.status_type_id, polygonPickerNote, polygonPickerGrf || null, polygonPickerRvr ? Number(polygonPickerRvr) : null);
                  setPolygonStatusPicker(null);
                }} style={{ marginTop: '6px', width: '100%', padding: '5px', background: '#1d4ed8', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                  {tr('ground.saveGrfVisibility')}
                </button>
              )}
              {polygonPickerNote !== (currentStatus?.note || '') && currentStatus && (
                <button onClick={() => {
                  if (onUpdatePolygonStatus) onUpdatePolygonStatus(polygon.id, currentStatus.status_type_id, polygonPickerNote, polygonPickerGrf || null, polygonPickerRvr ? Number(polygonPickerRvr) : null);
                  setPolygonStatusPicker(null);
                }} style={{ marginTop: '4px', width: '100%', padding: '5px', background: '#1d4ed8', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '12px' }}>
                  {tr('ground.saveNote')}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {elemStatusPicker && (() => {
        const el = elemStatusPicker.el;
        const rawAllowed = el.type_allowed_statuses;
        const allowedStatuses: string[] = Array.isArray(rawAllowed) ? rawAllowed : (typeof rawAllowed === 'string' ? (() => { try { return JSON.parse(rawAllowed); } catch { return []; } })() : []);
        const px = Math.min(elemStatusPicker.x + 8, window.innerWidth - 210);
        const py = Math.min(elemStatusPicker.y + 8, window.innerHeight - 380);
        const isSvg = typeof el.type_icon === 'string' && el.type_icon.startsWith('MAP:');
        const curDState = el.display_state || 'normal';
        const dStateOpts = getElemDisplayStateOpts(el.type_icon || '');
        // Map allowed_statuses labels to display_state keys + colors
        const allowedToDs: Record<string, { key: string; color: string }> = {
          'פתוח': { key: 'open',   color: '#22c55e' },
          'סגור': { key: 'close',  color: '#ef4444' },
          'מנצנץ': { key: 'blink', color: '#f59e0b' },
          'כבוי':  { key: 'off',   color: '#64748b' },
          'עצור':  { key: 'stop',  color: '#ef4444' },
          'עבור':  { key: 'go',    color: '#22c55e' },
          'דולק':  { key: 'open',  color: '#22c55e' },
          'עומד':  { key: 'normal',color: '#a855f7' },
          'נוסע':  { key: 'normal',color: '#3b82f6' },
          'רגיל':  { key: 'normal',color: '#94a3b8' },
        };
        const filteredDsOpts = allowedStatuses.length > 0
          ? allowedStatuses.map(s => { const d = allowedToDs[s]; return d ? { key: d.key, label: s, color: d.color } : null; }).filter(Boolean) as { key:string; label:string; color:string }[]
          : dStateOpts;
        const isShamish   = el.status === 'שמיש';
        const isLaShamish = el.status === 'לא שמיש';
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 99999 }} onClick={() => setElemStatusPicker(null)}>
            <div style={{ position: 'absolute', left: px, top: py, background: '#1e293b', borderRadius: '12px', padding: '14px', border: '1px solid #334155', boxShadow: '0 8px 32px rgba(0,0,0,0.75)', direction: 'rtl', minWidth: '190px', maxHeight: '90vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isSvg ? <span style={{ display: 'inline-flex' }}>{renderGroundSvgIcon(el.type_icon, 18)}</span> : <span>{el.type_icon || (el.category === 'camera' ? '📷' : '🔧')}</span>}
                <span>{el.name}</span>
              </div>
              {/* Display state — filtered to allowed_statuses values */}
              <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '5px', fontWeight: 'bold' }}>{tr('shared.displayMode')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                {filteredDsOpts.map(opt => (
                  <button key={opt.key + opt.label} onClick={() => { if (onUpdateElementDisplayState) onUpdateElementDisplayState(el.id, opt.key); setElemStatusPicker(null); }}
                    style={{ padding: '7px 4px', background: curDState === opt.key ? opt.color + '33' : 'transparent', border: `1px solid ${curDState === opt.key ? opt.color : '#334155'}`, borderRadius: '6px', color: curDState === opt.key ? opt.color : '#94a3b8', cursor: 'pointer', fontSize: '12px', fontWeight: curDState === opt.key ? 'bold' : 'normal', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: opt.color, flexShrink: 0, display: 'inline-block' }} />
                    {opt.label}
                    {curDState === opt.key && <span style={{ fontSize: '10px' }}>✓</span>}
                  </button>
                ))}
              </div>
              {/* Blink rate when blink is selected */}
              {curDState === 'blink' && (
                <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{tr('shared.rateSeconds')}</span>
                  {[0.5, 1.0, 1.5, 2.0].map(r => (
                    <button key={r} onClick={() => { if (onUpdateElementDisplayState) onUpdateElementDisplayState(el.id, 'blink', r); setElemStatusPicker(null); }}
                      style={{ padding: '3px 6px', background: (el.blink_rate || 1.0) === r ? '#f59e0b33' : 'transparent', border: `1px solid ${(el.blink_rate || 1.0) === r ? '#f59e0b' : '#334155'}`, borderRadius: '4px', color: (el.blink_rate || 1.0) === r ? '#fbbf24' : '#94a3b8', cursor: 'pointer', fontSize: '10px' }}>
                      {r}s
                    </button>
                  ))}
                </div>
              )}
              {/* Serviceability — שמיש / לא שמיש */}
              <div style={{ borderTop: '1px solid #1e3a5f', paddingTop: '8px' }}>
                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '5px', fontWeight: 'bold' }}>{tr('ground.serviceability')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                  <button onClick={() => { if (onUpdateElementStatus) onUpdateElementStatus(el.id, 'שמיש'); setElemStatusPicker(null); }}
                    style={{ padding: '8px 4px', background: isShamish ? '#22c55e33' : 'transparent', border: `2px solid ${isShamish ? '#22c55e' : '#334155'}`, borderRadius: '7px', color: isShamish ? '#22c55e' : '#94a3b8', cursor: 'pointer', fontSize: '12px', fontWeight: isShamish ? 'bold' : 'normal', textAlign: 'center' }}>
                    {isShamish ? '✓ ' : ''}{tr('ground.serviceable')}
                  </button>
                  <button onClick={() => { if (onUpdateElementStatus) onUpdateElementStatus(el.id, 'לא שמיש'); setElemStatusPicker(null); }}
                    style={{ padding: '8px 4px', background: isLaShamish ? '#ef444433' : 'transparent', border: `2px solid ${isLaShamish ? '#ef4444' : '#334155'}`, borderRadius: '7px', color: isLaShamish ? '#ef4444' : '#94a3b8', cursor: 'pointer', fontSize: '12px', fontWeight: isLaShamish ? 'bold' : 'normal', textAlign: 'center' }}>
                    {isLaShamish ? '✕ ' : ''}{tr('ground.unserviceable')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Element nav routing modal — right-click on 'נוסע' element */}
      {elemNavModal && (() => {
        const { el, fromPointId, toPointId, viaRouteIds } = elemNavModal;
        const airfieldRoutesLocal: any[] = airfieldRoutes || [];
        // Intersection helpers
        const cross2d = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
        const segIntersect = (p1: {x:number;y:number}, p2: {x:number;y:number}, p3: {x:number;y:number}, p4: {x:number;y:number}) => {
          const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
          const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
          const denom = cross2d(d1x, d1y, d2x, d2y);
          if (Math.abs(denom) < 1e-10) return false;
          const t = cross2d(p3.x - p1.x, p3.y - p1.y, d2x, d2y) / denom;
          const u = cross2d(p3.x - p1.x, p3.y - p1.y, d1x, d1y) / denom;
          return t >= 0 && t <= 1 && u >= 0 && u <= 1;
        };
        // Distance from point to segment (perpendicular foot or endpoint)
        const _ptSegDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
          const dx = bx - ax, dy = by - ay;
          const lenSq = dx*dx + dy*dy;
          if (lenSq === 0) return Math.hypot(px - ax, py - ay);
          const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / lenSq));
          return Math.hypot(px - ax - t*dx, py - ay - t*dy);
        };
        // Min distance from point to any segment of a parsed polyline
        const _ptPolySegDist = (px: number, py: number, pts: {x:number;y:number}[]) => {
          if (pts.length < 2) return pts.length === 1 ? Math.hypot(pts[0].x - px, pts[0].y - py) : Infinity;
          let minD = Infinity;
          for (let i = 0; i < pts.length - 1; i++) { const d = _ptSegDist(px, py, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y); if (d < minD) minD = d; }
          return minD;
        };
        const routesIntersect = (r1: any, r2: any) => {
          const p1: {x:number;y:number}[] = Array.isArray(r1.route_path) ? r1.route_path : (typeof r1.route_path === 'string' ? (() => { try { return JSON.parse(r1.route_path); } catch { return []; } })() : []);
          const p2: {x:number;y:number}[] = Array.isArray(r2.route_path) ? r2.route_path : (typeof r2.route_path === 'string' ? (() => { try { return JSON.parse(r2.route_path); } catch { return []; } })() : []);
          if (p1.length < 2 || p2.length < 2) return false;
          // 1. Geometric intersection of segments
          for (let i = 0; i < p1.length - 1; i++) for (let j = 0; j < p2.length - 1; j++) if (segIntersect(p1[i], p1[i+1], p2[j], p2[j+1])) return true;
          // 2. Endpoint of r1 near any VERTEX of r2 (and vice versa)
          //    Checks both endpoint-to-endpoint (junction) and endpoint-to-intermediate-vertex (T-junction)
          //    Deliberately avoids checking arbitrary interior points on segments — that causes false positives
          //    when two routes happen to be geometrically close but don't share a defined node.
          const NEAR_V = 4;
          const eps1 = [p1[0], p1[p1.length - 1]];
          const eps2 = [p2[0], p2[p2.length - 1]];
          for (const ep of eps1) for (const v of p2) if (Math.hypot(ep.x - v.x, ep.y - v.y) < NEAR_V) return true;
          for (const ep of eps2) for (const v of p1) if (Math.hypot(ep.x - v.x, ep.y - v.y) < NEAR_V) return true;
          return false;
        };
        const catLabel: Record<string, string> = { general: 'כללי', aircraft: 'מטוסים', vehicle: 'כלי רכב' };
        const routesByCategory = ['aircraft', 'vehicle', 'general'].reduce<Record<string, any[]>>((acc, cat) => {
          acc[cat] = airfieldRoutesLocal.filter((r: any) => (r.route_category || 'general') === cat);
          return acc;
        }, {});

        // --- Pathfinding helpers ---
        const parsePts = (r: any): {x:number;y:number}[] => Array.isArray(r.route_path) ? r.route_path : (typeof r.route_path === 'string' ? (() => { try { return JSON.parse(r.route_path); } catch { return []; } })() : []);
        const ptToRouteDist = (px: number, py: number, r: any) => { const p = parsePts(r); return _ptPolySegDist(px, py, p); };
        const NAV_DS: Record<string,string> = { close:'סגור', open:'פתוח', off:'כבוי', stop:'עצור', go:'עבור', blink:'מנצנץ' };
        // Build set of currently blocked route IDs
        // "לא שמיש" elements get a yellow warning — NOT counted as blockers even if they have blocking_statuses
        const unusableRouteSet = new Set<number>((airfieldElements||[]).flatMap((ae: any) => {
          if (ae.status !== 'לא שמיש') return [];
          const rels: number[] = Array.isArray(ae.relevant_routes) ? ae.relevant_routes : [];
          return rels;
        }));
        const unusableRouteToElem: Record<number,string> = {};
        (airfieldElements||[]).forEach((ae: any) => {
          if (ae.status !== 'לא שמיש') return;
          const rels: number[] = Array.isArray(ae.relevant_routes) ? ae.relevant_routes : [];
          rels.forEach((rid: number) => { unusableRouteToElem[rid] = ae.name; });
        });
        // Blocked routes: element's effective status matches blocking_statuses, but ONLY if element is NOT "לא שמיש"
        const blockedRouteSet = new Set<number>((airfieldElements||[]).flatMap((ae: any) => {
          if (ae.status === 'לא שמיש') return []; // לא שמיש → yellow warning, never a hard blocker
          const rels: number[] = Array.isArray(ae.relevant_routes) ? ae.relevant_routes : [];
          const bsts: string[] = Array.isArray(ae.blocking_statuses) ? ae.blocking_statuses : [];
          if (!rels.length || !bsts.length) return [];
          const eff = NAV_DS[ae.display_state||''] || ae.status || '';
          if (!bsts.includes(eff) && !bsts.includes(ae.status||'')) return [];
          return rels;
        }));
        // Map blocked route → element name for display
        const blockedRouteToElem: Record<number,string> = {};
        (airfieldElements||[]).forEach((ae: any) => {
          if (ae.status === 'לא שמיש') return;
          const rels: number[] = Array.isArray(ae.relevant_routes) ? ae.relevant_routes : [];
          const bsts: string[] = Array.isArray(ae.blocking_statuses) ? ae.blocking_statuses : [];
          if (!rels.length || !bsts.length) return;
          const eff = NAV_DS[ae.display_state||''] || ae.status || '';
          if (!bsts.includes(eff) && !bsts.includes(ae.status||'')) return;
          rels.forEach((rid: number) => { blockedRouteToElem[rid] = ae.name; });
        });
        const blockedOnPath = viaRouteIds.filter((id: number) => blockedRouteSet.has(id));
        // DFS: find ALL connected route chains from point A to point B, sorted shortest→longest
        const findAllPaths = (fromPt: any, toPt: any, exclude: Set<number> = new Set()): number[][] => {
          if (!fromPt || !toPt) return [];
          const NEAR = 6;
          const startIds: number[] = airfieldRoutesLocal.filter((r: any) => !exclude.has(r.id) && ptToRouteDist(fromPt.x_pct, fromPt.y_pct, r) < NEAR).sort((a: any,b: any) => ptToRouteDist(fromPt.x_pct, fromPt.y_pct, a) - ptToRouteDist(fromPt.x_pct, fromPt.y_pct, b)).map((r: any) => r.id as number);
          const endIds = new Set<number>(airfieldRoutesLocal.filter((r: any) => !exclude.has(r.id) && ptToRouteDist(toPt.x_pct, toPt.y_pct, r) < NEAR).map((r: any) => r.id as number));
          if (!startIds.length || !endIds.size) return [];
          const MAX_LEN = 8;
          const results: number[][] = [];
          const dfs = (path: number[]) => {
            const lastId = path[path.length - 1];
            if (endIds.has(lastId)) { results.push([...path]); return; }
            if (path.length >= MAX_LEN) return;
            const lastR = airfieldRoutesLocal.find((r: any) => r.id === lastId);
            if (!lastR) return;
            for (const r of airfieldRoutesLocal) {
              if (path.includes(r.id) || exclude.has(r.id)) continue;
              if (routesIntersect(lastR, r)) dfs([...path, r.id]);
            }
          };
          for (const sid of startIds) dfs([sid]);
          results.sort((a, b) => a.length - b.length);
          const seen = new Set<string>();
          return results.filter(p => { const k = p.join(','); if (seen.has(k)) return false; seen.add(k); return true; });
        };
        const fromPt = fromPointId ? (points as any[]).find((p: any) => p.id === fromPointId) : null;
        const toPt = toPointId ? (points as any[]).find((p: any) => p.id === toPointId) : null;
        // Split into clear / unusable (yellow) / blocked (red) paths
        const allSuggestedPaths: number[][] = (fromPt && toPt) ? findAllPaths(fromPt, toPt) : [];
        // Clear: no blocked AND no unusable routes
        const clearPaths = allSuggestedPaths.filter(path =>
          !path.some((id: number) => blockedRouteSet.has(id)) &&
          !path.some((id: number) => unusableRouteSet.has(id))
        );
        // Unusable (yellow): passes through לא שמיש route, but NOT a hard-blocked route
        const unusablePaths = allSuggestedPaths.filter(path =>
          !path.some((id: number) => blockedRouteSet.has(id)) &&
          path.some((id: number) => unusableRouteSet.has(id))
        );
        // Group unusable paths by the unusable element name
        const unusablePathsByElem: Record<string, {path:number[];unusableIds:number[]}[]> = {};
        for (const path of unusablePaths) {
          const uIds = path.filter((id: number) => unusableRouteSet.has(id));
          const key = [...new Set(uIds.map((id: number) => unusableRouteToElem[id] || `מסלול #${id}`))].join(', ');
          if (!unusablePathsByElem[key]) unusablePathsByElem[key] = [];
          unusablePathsByElem[key].push({ path, unusableIds: uIds });
        }
        // Blocked (red): passes through a hard-blocked route
        const blockedPaths = allSuggestedPaths.filter(path => path.some((id: number) => blockedRouteSet.has(id)));
        // Group blocked paths by the names of the blocking elements
        const blockedPathsByElem: Record<string, {path:number[];blockedIds:number[]}[]> = {};
        for (const path of blockedPaths) {
          const bIds = path.filter((id: number) => blockedRouteSet.has(id));
          const key = [...new Set(bIds.map((id: number) => blockedRouteToElem[id] || `מסלול #${id}`))].join(', ');
          if (!blockedPathsByElem[key]) blockedPathsByElem[key] = [];
          blockedPathsByElem[key].push({ path, blockedIds: bIds });
        }

        // Preview a path on the map and select it in the modal
        const handleApplyPath = (path: number[]) => {
          if (!navModalOrigNavRef.current || navModalOrigNavRef.current.elId !== el.id) {
            navModalOrigNavRef.current = { elId: el.id, data: elemNavData[el.id] };
          }
          setElemNavModal(m => m ? { ...m, viaRouteIds: path } : null);
          setElemNavData(prev => ({ ...prev, [el.id]: { fromPointId: fromPointId ?? null, toPointId: toPointId ?? null, viaRouteIds: path } }));
        };

        // Cancel: revert preview and close
        const handleCancel = () => {
          const saved = navModalOrigNavRef.current;
          if (saved && saved.elId === el.id) {
            const orig = saved.data;
            if (orig) setElemNavData(prev => ({ ...prev, [el.id]: orig }));
            else setElemNavData(prev => { const n = {...prev}; delete n[el.id]; return n; });
            navModalOrigNavRef.current = null;
          }
          setElemNavModal(null);
        };

        // Drag handlers
        const handleDragStart = (e: React.MouseEvent) => {
          e.preventDefault();
          navModalDragRef.current = { startMX: e.clientX, startMY: e.clientY, startPX: navModalPos.x, startPY: navModalPos.y };
          const onMove = (ev: MouseEvent) => {
            if (!navModalDragRef.current) return;
            setNavModalPos({ x: navModalDragRef.current.startPX + ev.clientX - navModalDragRef.current.startMX, y: navModalDragRef.current.startPY + ev.clientY - navModalDragRef.current.startMY });
          };
          const onUp = () => { navModalDragRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        };

        return (
          <div style={{ position: 'fixed', left: navModalPos.x, top: navModalPos.y, zIndex: 99999, background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', width: '480px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', color: 'white', direction: 'rtl', boxShadow: '0 20px 60px rgba(0,0,0,0.75)', overflow: 'hidden' }}>
            {/* Drag handle header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#1e3a5f', borderBottom: '1px solid #334155', cursor: 'grab', userSelect: 'none', flexShrink: 0 }}
              onMouseDown={handleDragStart}>
              <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#60a5fa' }}>{tr('ground.routeNavigation')} {el.name}</span>
              <button onClick={handleCancel} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '14px 16px', flex: 1 }}>

              {/* From / To points */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: '#22c55e', marginBottom: '4px', fontWeight: 'bold' }}>{tr('ground.fromOrigin2')}</div>
                  <select value={fromPointId ?? ''} onChange={e => setElemNavModal(m => m ? { ...m, fromPointId: e.target.value ? Number(e.target.value) : null } : null)}
                    style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #22c55e44', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl' }}>
                    <option value="">{tr('shared.none')}</option>
                    {points.map((p: any) => <option key={p.id} value={p.id}>{p.name || `דת"ק ${p.id}`}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: '#f43f5e', marginBottom: '4px', fontWeight: 'bold' }}>{tr('ground.toDestination2')}</div>
                  <select value={toPointId ?? ''} onChange={e => setElemNavModal(m => m ? { ...m, toPointId: e.target.value ? Number(e.target.value) : null } : null)}
                    style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #f43f5e44', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl' }}>
                    <option value="">{tr('shared.none')}</option>
                    {points.map((p: any) => <option key={p.id} value={p.id}>{p.name || `דת"ק ${p.id}`}</option>)}
                  </select>
                </div>
              </div>

              {/* Clear paths — sorted shortest to longest */}
              {fromPt && toPt && (
                <div style={{ marginBottom: '10px' }}>
                  {clearPaths.length > 0 ? (
                    <>
                      <div style={{ fontSize: '10px', color: '#22c55e', fontWeight: 'bold', marginBottom: '4px' }}>{tr('ground.availableRoutesShortestTo')}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '200px', overflowY: 'auto' }}>
                        {clearPaths.map((path: number[], i: number) => {
                          const isActive = path.join(',') === viaRouteIds.join(',');
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isActive ? '#052e16' : i === 0 ? '#0c2440' : '#0f172a', border: `1px solid ${isActive ? '#16a34a' : i === 0 ? '#1d4ed8' : '#1e293b'}`, borderRadius: '6px', padding: '5px 10px' }}>
                              <span style={{ fontSize: '10px', color: isActive ? '#86efac' : i === 0 ? '#60a5fa' : '#64748b', minWidth: '16px', fontWeight: 'bold' }}>{path.length}</span>
                              <span style={{ fontSize: '11px', color: isActive ? '#86efac' : i === 0 ? '#93c5fd' : '#cbd5e1', flex: 1 }}>
                                {path.map((id: number) => airfieldRoutesLocal.find((r: any) => r.id === id)?.name || `#${id}`).join(' → ')}
                              </span>
                              <button onClick={() => handleApplyPath(path)}
                                style={{ padding: '2px 9px', background: isActive ? '#16a34a' : i === 0 ? '#1d4ed8' : '#334155', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>
                                {isActive ? '✓ נבחר' : 'החל'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : allSuggestedPaths.length > 0 ? (
                    <div style={{ fontSize: '11px', color: '#f97316', background: '#1c0a00', border: '1px solid #9a3412', borderRadius: '6px', padding: '6px 10px' }}>{tr('ground.allPossibleRoutesAre')}</div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#64748b', background: '#0c1a2e', border: '1px solid #1e293b', borderRadius: '6px', padding: '6px 10px' }}>{tr('ground.noRouteFoundBetween')}</div>
                  )}
                </div>
              )}

              {/* Unusable paths (yellow) — collapsed by unusable element */}
              {fromPt && toPt && Object.keys(unusablePathsByElem).length > 0 && (
                <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '10px', color: '#eab308', fontWeight: 'bold', marginBottom: '2px' }}>{tr('ground.routesThroughAnUnserviceable')}</div>
                  {Object.entries(unusablePathsByElem).map(([elemName, entries]) => {
                    const isOpen = navBlockedGroupsOpen['u_' + elemName] ?? false;
                    return (
                      <div key={elemName} style={{ background: '#1a1500', border: '1px solid #854d0e', borderRadius: '6px', overflow: 'hidden' }}>
                        <button onClick={() => setNavBlockedGroupsOpen(prev => ({ ...prev, ['u_' + elemName]: !isOpen }))}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'none', border: 'none', color: '#fde68a', cursor: 'pointer', textAlign: 'right', direction: 'rtl', fontSize: '11px', fontWeight: 'bold' }}>
                          <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '10px' }}>{isOpen ? '▲' : '▼'} {entries.length}</span>
                          <span style={{ flex: 1 }}>{tr('ground.unserviceable2')} {elemName}</span>
                        </button>
                        {isOpen && (
                          <div style={{ borderTop: '1px solid #854d0e', padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {entries.map(({ path, unusableIds }, i) => {
                              const isActive = path.join(',') === viaRouteIds.join(',');
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isActive ? '#052e16' : 'transparent', borderRadius: '4px', padding: '3px 4px' }}>
                                  <span style={{ fontSize: '10px', color: '#64748b', minWidth: '14px' }}>{path.length}</span>
                                  <span style={{ fontSize: '11px', color: '#fde68a', flex: 1 }}>
                                    {path.map((id: number) => {
                                      const name = airfieldRoutesLocal.find((r: any) => r.id === id)?.name || `#${id}`;
                                      return unusableIds.includes(id)
                                        ? <span key={id} style={{ color: '#eab308', fontWeight: 'bold' }}>{name}</span>
                                        : <span key={id}>{name}</span>;
                                    }).reduce<React.ReactNode[]>((acc, el2, i2) => i2 === 0 ? [el2] : [...acc, <span key={`u${i2}`} style={{ color: '#475569' }}> → </span>, el2], [])}
                                  </span>
                                  <button onClick={() => handleApplyPath(path)}
                                    style={{ padding: '2px 8px', background: isActive ? '#16a34a' : '#422006', color: isActive ? 'white' : '#fde68a', border: `1px solid ${isActive ? '#16a34a' : '#854d0e'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '10px', flexShrink: 0 }}>
                                    {isActive ? '✓' : 'החל'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Blocked paths (red) — collapsed by blocking element */}
              {fromPt && toPt && Object.keys(blockedPathsByElem).length > 0 && (
                <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 'bold', marginBottom: '2px' }}>{tr('ground.blockedRoutesByBlocking')}</div>
                  {Object.entries(blockedPathsByElem).map(([elemName, entries]) => {
                    const isOpen = navBlockedGroupsOpen[elemName] ?? false;
                    return (
                      <div key={elemName} style={{ background: '#1a0505', border: '1px solid #7f1d1d', borderRadius: '6px', overflow: 'hidden' }}>
                        <button onClick={() => setNavBlockedGroupsOpen(prev => ({ ...prev, [elemName]: !isOpen }))}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', textAlign: 'right', direction: 'rtl', fontSize: '11px', fontWeight: 'bold' }}>
                          <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '10px' }}>{isOpen ? '▲' : '▼'} {entries.length}</span>
                          <span style={{ flex: 1 }}>🔒 {elemName}</span>
                        </button>
                        {isOpen && (
                          <div style={{ borderTop: '1px solid #7f1d1d', padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {entries.map(({ path, blockedIds }, i) => {
                              const isActive = path.join(',') === viaRouteIds.join(',');
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isActive ? '#052e16' : 'transparent', borderRadius: '4px', padding: '3px 4px' }}>
                                  <span style={{ fontSize: '10px', color: '#64748b', minWidth: '14px' }}>{path.length}</span>
                                  <span style={{ fontSize: '11px', color: '#fca5a5', flex: 1 }}>
                                    {path.map((id: number) => {
                                      const name = airfieldRoutesLocal.find((r: any) => r.id === id)?.name || `#${id}`;
                                      return blockedIds.includes(id) ? <span key={id} style={{ color: '#ef4444', textDecoration: 'line-through' }}>{name}</span> : <span key={id}>{name}</span>;
                                    }).reduce<React.ReactNode[]>((acc, el2, i2) => i2 === 0 ? [el2] : [...acc, <span key={`a${i2}`} style={{ color: '#475569' }}> → </span>, el2], [])}
                                  </span>
                                  <button onClick={() => handleApplyPath(path)}
                                    style={{ padding: '2px 8px', background: isActive ? '#16a34a' : '#450a0a', color: isActive ? 'white' : '#fca5a5', border: `1px solid ${isActive ? '#16a34a' : '#7f1d1d'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '10px', flexShrink: 0 }}>
                                    {isActive ? '✓' : 'החל'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Via routes — by category (additive selection) */}
              {(() => {
                const lastRouteId = viaRouteIds.length > 0 ? viaRouteIds[viaRouteIds.length - 1] : null;
                const lastRoute = lastRouteId != null ? airfieldRoutesLocal.find((x: any) => x.id === lastRouteId) : null;
                const gapAfterIdx: boolean[] = viaRouteIds.map((rid, i) => {
                  if (i >= viaRouteIds.length - 1) return false;
                  const r1 = airfieldRoutesLocal.find((x: any) => x.id === rid);
                  const r2 = airfieldRoutesLocal.find((x: any) => x.id === viaRouteIds[i + 1]);
                  return !(r1 && r2 && routesIntersect(r1, r2));
                });
                const hasAnyGap = gapAfterIdx.some(Boolean);
                return (
                  <>
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>{tr('ground.routesClickToAdd2')}</div>
                        {viaRouteIds.length > 0 && (
                          <button onClick={() => setElemNavModal(m => m ? { ...m, viaRouteIds: m.viaRouteIds.slice(0, -1) } : null)}
                            style={{ padding: '2px 8px', background: '#451a03', color: '#fb923c', border: '1px solid #92400e', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>{tr('ground.undoLast')}</button>
                        )}
                      </div>
                      {(['aircraft', 'vehicle', 'general'] as const).map(cat => {
                        const catRoutes = routesByCategory[cat] || [];
                        if (catRoutes.length === 0) return null;
                        return (
                          <div key={cat} style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: '10px', color: '#475569', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{catLabel[cat]}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                              {catRoutes.map((r: any) => {
                                const count = viaRouteIds.filter((id: number) => id === r.id).length;
                                const intersectsWithLast = !lastRoute || routesIntersect(r, lastRoute);
                                const isConnecting = viaRouteIds.length > 0 && intersectsWithLast;
                                const isDisconnected = viaRouteIds.length > 0 && !intersectsWithLast;
                                return (
                                  <button key={r.id}
                                    onClick={() => setElemNavModal(m => m ? { ...m, viaRouteIds: [...m.viaRouteIds, r.id] } : null)}
                                    title={isDisconnected ? 'נתיב שגוי — המסלולים אינם מצטלבים' : `הוסף: ${r.name}`}
                                    style={{ padding: '4px 10px', background: isConnecting ? '#dc262622' : '#1e293b', border: `1.5px solid ${isConnecting ? '#ef4444' : '#334155'}`, borderRadius: '6px', color: isConnecting ? '#fca5a5' : '#94a3b8', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', position: 'relative', opacity: isDisconnected ? 0.6 : 1 }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.color || '#3b82f6', display: 'inline-block', flexShrink: 0 }} />
                                    {r.name}
                                    {count > 0 && <span style={{ background: '#3b82f6', color: 'white', borderRadius: '50%', minWidth: '16px', height: '16px', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', fontWeight: 'bold' }}>{count}</span>}
                                    {isDisconnected && <span title={tr('ground.invalidPathTheRoutes')} style={{ fontSize: '10px' }}>⚠️</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {airfieldRoutesLocal.length === 0 && <div style={{ color: '#475569', fontSize: '11px' }}>{tr('ground.noRoutesDefinedFor')}</div>}
                    </div>

                    {/* Sequence display */}
                    {viaRouteIds.length > 0 && (
                      <div style={{ background: '#0c1a2e', border: `1px solid ${hasAnyGap ? '#991b1b' : '#1e3a5f'}`, borderRadius: '6px', padding: '8px 12px', marginBottom: '14px', fontSize: '11px' }}>
                        <div style={{ color: '#7dd3fc', marginBottom: '6px', fontWeight: 'bold', fontSize: '10px' }}>{tr('ground.selectedSequence')}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                          {viaRouteIds.map((rid: number, i: number) => {
                            const r = airfieldRoutesLocal.find((x: any) => x.id === rid);
                            const hasGapAfter = gapAfterIdx[i];
                            return (
                              <React.Fragment key={i}>
                                <span style={{ padding: '2px 7px', background: (r?.color || '#60a5fa') + '22', border: `1px solid ${r?.color || '#60a5fa'}`, borderRadius: '4px', color: r?.color || '#60a5fa', fontSize: '10px', whiteSpace: 'nowrap' }}>
                                  {i + 1}. {r?.name || `#${rid}`}
                                </span>
                                {i < viaRouteIds.length - 1 && (
                                  hasGapAfter
                                    ? <span title={tr('ground.gapTheRoutesDo')} style={{ color: '#ef4444', fontSize: '11px', fontWeight: 'bold' }}>⚠️→</span>
                                    : <span style={{ color: '#22c55e', fontSize: '11px' }}>→</span>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                        {hasAnyGap && <div style={{ color: '#ef4444', fontSize: '10px', marginTop: '5px', fontWeight: 'bold' }}>{tr('ground.invalidPathThereAre')}</div>}
                      </div>
                    )}
                  </>
                );
              })()}

            </div>
            {/* Sticky action bar */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start', padding: '10px 16px', borderTop: '1px solid #1e293b', background: '#0f172a', flexShrink: 0 }}>
              <button onClick={async () => {
                await fetch(`${API_URL}/element-nav/${el.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from_point_id: fromPointId, to_point_id: toPointId, via_route_ids: viaRouteIds }) });
                setElemNavData(prev => ({ ...prev, [el.id]: { fromPointId, toPointId, viaRouteIds } }));
                navModalOrigNavRef.current = null;
                setElemNavModal(null);
              }} style={{ padding: '7px 18px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>{tr('ground.saveNavigation')}</button>
              <button onClick={async () => {
                await fetch(`${API_URL}/element-nav/${el.id}`, { method: 'DELETE' });
                setElemNavData(prev => { const n = { ...prev }; delete n[el.id]; return n; });
                navModalOrigNavRef.current = null;
                setElemNavModal(null);
              }} style={{ padding: '7px 14px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>{tr('shared.clear3')}</button>
              <button onClick={handleCancel} style={{ padding: '7px 14px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>{tr('shared.cancel')}</button>
            </div>
          </div>
        );
      })()}

      {/* SID selection modal — opens when cycling to takeoff */}
      {sidModal && (() => {
        const sids = parseAirfieldSids(airfield?.sids);
        const strip = sidModal.strip;
        const callSign = strip.callSign || strip.call_sign || '';
        const allAircraft = sidModal.idx === -1;
        const positions = getAircraftPositions(strip);
        const totalCount = positions.length;
        const activeIndices = sidPartialSelected.length > 0 ? sidPartialSelected : positions.map((p: any) => p.idx);
        const affectedIndices: number[] = allAircraft && sidPartialSelected.length > 0 ? sidPartialSelected : allAircraft ? positions.map((p: any) => p.idx) : [sidModal.idx];
        const applyTakeoff = (pts: any[]) => pts.map((x: any) =>
          affectedIndices.includes(x.idx) ? { ...x, status: 'takeoff', takeoff_runway: sidRunwayName || null } : x
        );
        const closeSidModal = () => { setSidModal(null); setSidPreStep(false); setSidPartialSelected([]); setSidSectorPick(null); };
        const recordLocalTakeoff = () => {
          if (sidRunwayName) {
            const now = Date.now();
            setRecentTakeoffTimes(prev => ({ ...prev, [sidRunwayName]: now }));
            setRecentTakeoffCallsigns(prev => ({ ...prev, [sidRunwayName]: callSign }));
          }
        };
        const confirmSid = (sid: { label: string; sector_ids: number[] }) => {
          if (sid.sector_ids.length > 1) { setSidSectorPick(sid); return; }
          if (onUpdateStripMeta) onUpdateStripMeta(String(strip.id), { sid: sid.label });
          onUpdateAircraft(String(strip.id), applyTakeoff(positions));
          if (sid.sector_ids[0]) onTransfer(String(strip.id), sid.sector_ids[0]);
          recordLocalTakeoff();
          closeSidModal();
        };
        const confirmSidWithSector = (sid: { label: string; sector_ids: number[] }, sectorId: number) => {
          if (onUpdateStripMeta) onUpdateStripMeta(String(strip.id), { sid: sid.label });
          onUpdateAircraft(String(strip.id), applyTakeoff(positions));
          onTransfer(String(strip.id), sectorId);
          recordLocalTakeoff();
          closeSidModal();
        };
        const skipSid = () => {
          onUpdateAircraft(String(strip.id), applyTakeoff(positions));
          recordLocalTakeoff();
          closeSidModal();
        };

        if (allAircraft && totalCount > 1 && sidPreStep) {
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={closeSidModal}>
              <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', maxWidth: '340px', width: '90%', border: '1px solid #fca5a5', direction: 'rtl' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#fca5a5', marginBottom: '4px' }}>{tr('ground.takeoffSelectAircraft')}</div>
                <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '14px' }}>{tr('ground.formation')} <strong style={{ color: 'white' }}>{callSign}</strong> · {totalCount} {tr('shared.aircraft3')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                  {positions.map((p: any) => (
                    <label key={p.idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '8px 10px', borderRadius: '6px', background: sidPartialSelected.includes(p.idx) ? '#1d3a5f' : '#0f172a', border: `1px solid ${sidPartialSelected.includes(p.idx) ? '#3b82f6' : '#334155'}` }}>
                      <input type="checkbox" checked={sidPartialSelected.includes(p.idx)} onChange={ev => { setSidPartialSelected(prev => ev.target.checked ? [...prev, p.idx] : prev.filter(i => i !== p.idx)); }} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                      <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>{callSign}{p.idx}</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{tr('shared.aircraft2')}{p.idx}</span>
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { if (sidPartialSelected.length === 0) { setSidPartialSelected([]); } setSidPreStep(false); }}
                    disabled={sidPartialSelected.length === 0}
                    style={{ flex: 2, padding: '9px', background: sidPartialSelected.length > 0 ? '#1d4ed8' : '#334155', color: 'white', border: 'none', borderRadius: '8px', cursor: sidPartialSelected.length > 0 ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 'bold' }}
                  >{tr('ground.continueSelectSid')}{sidPartialSelected.length}/{totalCount})</button>
                  <button onClick={() => { setSidPartialSelected([]); setSidPreStep(false); }} style={{ flex: 1, padding: '9px', background: '#475569', color: '#e2e8f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>{tr('ground.wholeFormation2')}</button>
                  <button onClick={closeSidModal} style={{ flex: 1, padding: '9px', background: '#0f172a', color: '#64748b', border: '1px solid #334155', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>{tr('shared.cancel')}</button>
                </div>
              </div>
            </div>
          );
        }

        if (allAircraft && totalCount > 1 && !sidPreStep && sidPartialSelected.length === 0) {
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setSidModal(null)}>
              <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', maxWidth: '340px', width: '90%', border: '1px solid #334155', direction: 'rtl' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#fca5a5', marginBottom: '4px' }}>{tr('ground.takeoffWholeFormationOr')}</div>
                <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '18px' }}>{tr('ground.formation')} <strong style={{ color: 'white' }}>{callSign}</strong> · {totalCount} {tr('shared.aircraft3')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button onClick={() => { setSidPartialSelected([]); }}
                    style={{ padding: '12px 16px', background: '#16a34a', color: 'white', border: '1px solid #22c55e', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', textAlign: 'right' }}>
                    {tr('ground.wholeFormation3')}{totalCount} {tr('ground.aircraft3')}
                  </button>
                  <button onClick={() => { setSidPartialSelected(positions.map((p: any) => p.idx)); setSidPreStep(true); }}
                    style={{ padding: '12px 16px', background: '#1d4ed8', color: 'white', border: '1px solid #3b82f6', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', textAlign: 'right' }}>
                    {tr('ground.specificNumbers')}
                  </button>
                  <button onClick={() => setSidModal(null)}
                    style={{ padding: '9px', background: '#0f172a', color: '#64748b', border: '1px solid #334155', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                    {tr('shared.cancel')}
                  </button>
                </div>
              </div>
            </div>
          );
        }

        const _stepAfId = airfield?.id ?? null;
        const runwayRoutesForStep = (airfieldRoutes || []).filter((r: any) => r.is_runway && _stepAfId && Number(r.airfield_id) === Number(_stepAfId));
        if (runwayRoutesForStep.length > 0 && sidRunwayName === null) {
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setSidModal(null)}>
              <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', maxWidth: '380px', width: '90%', border: '1px solid #f59e0b', direction: 'rtl' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fcd34d', marginBottom: '4px' }}>{tr('ground.takeoffSelectRunway')}</div>
                <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '18px' }}>
                  {tr('ground.formation')} <strong style={{ color: 'white' }}>{callSign}</strong>
                  {allAircraft && sidPartialSelected.length > 0 ? <span> {tr('ground.aircraft2')} {sidPartialSelected.join(',')}</span> : allAircraft ? <span> {tr('ground.wholeFormation')}</span> : <span> {tr('ground.aircraft')}{sidModal.idx}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                  {runwayRoutesForStep.map((rwy: any) => {
                    const conflicts = runwayConflicts[rwy.id] || [];
                    const hasConflict = conflicts.length > 0;
                    // Check for closed NOTAM — match runway route to airfield_runways by name or headings
                    const matchingRwIds = new Set(
                      airfieldRunways
                        .filter((rw: any) => {
                          if (rw.name && rwy.name && rw.name === rwy.name) return true;
                          if (rwy.end_a_name && (rw.heading_a === rwy.end_a_name || rw.heading_b === rwy.end_a_name)) return true;
                          if (rwy.end_b_name && (rw.heading_a === rwy.end_b_name || rw.heading_b === rwy.end_b_name)) return true;
                          return false;
                        })
                        .map((rw: any) => rw.id)
                    );
                    const isClosedRunway = airfieldRunwayNotams.some(
                      (n: any) => matchingRwIds.has(n.runway_id) && n.notam_type === 'closed'
                    );
                    // Per-end takeoff state — green if this end has active clearance, red if reciprocal does
                    const RW_SID_WIN = 3 * 60 * 1000;
                    const rwActiveHdgs = new Set((activeTakeoffs || []).map((t: any) => t.runway).filter(Boolean));
                    const endAActive = !!(rwy.end_a_name && rwActiveHdgs.has(rwy.end_a_name));
                    const endBActive = !!(rwy.end_b_name && rwActiveHdgs.has(rwy.end_b_name));
                    const endATs = rwy.end_a_name ? recentTakeoffTimes[rwy.end_a_name] : undefined;
                    const endBTs = rwy.end_b_name ? recentTakeoffTimes[rwy.end_b_name] : undefined;
                    const endABlocked = !endAActive && !!endBTs && (rwNow - endBTs) < RW_SID_WIN;
                    const endBBlocked = !endBActive && !!endATs && (rwNow - endATs) < RW_SID_WIN;
                    const endASecsLeft = endABlocked ? Math.ceil((RW_SID_WIN - (rwNow - endBTs!)) / 1000) : 0;
                    const endBSecsLeft = endBBlocked ? Math.ceil((RW_SID_WIN - (rwNow - endATs!)) / 1000) : 0;
                    // Callsigns per end (from live activeTakeoffs first, then stored recent)
                    const endACallsign = rwy.end_a_name ? ((activeTakeoffs || []).find((t: any) => t.runway === rwy.end_a_name)?.callsign || recentTakeoffCallsigns[rwy.end_a_name] || '') : '';
                    const endBCallsign = rwy.end_b_name ? ((activeTakeoffs || []).find((t: any) => t.runway === rwy.end_b_name)?.callsign || recentTakeoffCallsigns[rwy.end_b_name] || '') : '';
                    // Cross-reference conflicts (takeoff_clearance type) with activeTakeoffs to detect which end has clearance even if runway name doesn't match rwActiveHdgs
                    const takeoffConflict = conflicts.find((c: any) => c.type === 'takeoff_clearance');
                    const conflictCS = takeoffConflict ? (takeoffConflict.call_sign || takeoffConflict.callsign || '') : '';
                    const conflictRwName = conflictCS ? ((activeTakeoffs || []).find((t: any) => t.callsign === conflictCS)?.runway || '') : '';
                    const endAConflictActive = !endAActive && !!conflictRwName && !!rwy.end_a_name && conflictRwName === rwy.end_a_name;
                    const endBConflictActive = !endBActive && !!conflictRwName && !!rwy.end_b_name && conflictRwName === rwy.end_b_name;
                    // Effective states incorporating conflict cross-reference
                    const endAEff = endAActive || endAConflictActive;
                    const endBEff = endBActive || endBConflictActive;
                    const endABlockedEff = !endAEff && (endABlocked || endBConflictActive);
                    const endBBlockedEff = !endBEff && (endBBlocked || endAConflictActive);
                    // Callsign causing the block (from opposite end)
                    const endACausingCallsign = endBConflictActive ? conflictCS : endBCallsign;
                    const endBCausingCallsign = endAConflictActive ? conflictCS : endACallsign;
                    const anyEndActive = endAEff || endBEff;
                    const anyBlocked = endABlockedEff || endBBlockedEff;
                    const borderColor = isClosedRunway ? '#dc2626' : anyEndActive ? '#22c55e' : anyBlocked ? '#dc2626' : hasConflict ? '#f59e0b' : '#475569';
                    const bgColor = isClosedRunway ? '#1f0000' : anyEndActive ? '#052e16' : anyBlocked ? '#1a0000' : hasConflict ? '#1a0000' : '#0f172a';
                    // Helper: bg/border for a specific end button
                    const endBtnBg = (isActive: boolean, isBlocked: boolean) =>
                      isClosedRunway ? '#3b0000' : isActive ? '#15803d' : isBlocked ? '#991b1b' : hasConflict ? '#374151' : '#1d4ed8';
                    const endBtnBorder = (isActive: boolean, isBlocked: boolean) =>
                      isClosedRunway ? '#7f1d1d' : isActive ? '#4ade80' : isBlocked ? '#ef4444' : hasConflict ? '#6b7280' : '#3b82f6';
                    const fmtTime = (secs: number) => `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;
                    return (
                      <div key={rwy.id} style={{ border: `2px solid ${borderColor}`, borderRadius: '8px', padding: '10px 12px', background: bgColor, position: 'relative', overflow: 'hidden' }}>
                        {isClosedRunway && (
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'repeating-linear-gradient(45deg, rgba(220,38,38,0.07) 0px, rgba(220,38,38,0.07) 8px, transparent 8px, transparent 16px)', pointerEvents: 'none', zIndex: 0 }} />
                        )}
                        <div style={{ position: 'relative', zIndex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isClosedRunway ? '#dc2626' : anyEndActive ? '#22c55e' : rwy.color || '#3b82f6', flexShrink: 0 }} />
                            <span style={{ color: isClosedRunway ? '#fca5a5' : '#e2e8f0', fontWeight: 'bold', fontSize: '13px' }}>{rwy.name}</span>
                            {isClosedRunway && (
                              <span style={{ fontSize: '11px', color: '#fca5a5', fontWeight: 'bold', background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: '4px', padding: '1px 7px', marginRight: 'auto', letterSpacing: '0.05em' }}>
                                {tr('ground.runwayClosedNotam')}
                              </span>
                            )}
                            {!isClosedRunway && anyEndActive && <span style={{ fontSize: '11px', color: '#86efac', fontWeight: 'bold', marginRight: 'auto' }}>{tr('ground.active')}</span>}
                            {!isClosedRunway && !anyEndActive && hasConflict && <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 'bold', marginRight: 'auto' }}>{tr('ground.conflict')}</span>}
                          </div>
                          {isClosedRunway && (
                            <div style={{ fontSize: '11px', color: '#fca5a5', background: '#3b0000', border: '1px solid #7f1d1d', borderRadius: '6px', padding: '6px 10px', marginBottom: '8px', fontWeight: 'bold', textAlign: 'center' }}>
                              {tr('ground.cannotTakeOffFrom')}
                            </div>
                          )}
                          {!isClosedRunway && hasConflict && (
                            <div style={{ fontSize: '10px', color: '#f87171', marginBottom: '8px', paddingRight: '4px' }}>
                              {conflicts.map((c: any, ci: number) => (
                                <span key={ci} style={{ display: 'inline-block', marginLeft: '6px' }}>
                                  {c.type === 'vehicle'
                                    ? `🚗 ${c.name || `רכב #${c.id}`} — נמצא על מסלול זה`
                                    : c.type === 'takeoff_clearance'
                                    ? `✈️ ${c.call_sign || c.callsign || `פמ #${c.id}`} — קיבל אישור המראה`
                                    : `✈️ ${c.call_sign || c.callsign || `פמ #${c.id}`} — מוסע למסלול זה`}
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {rwy.end_a_name ? (
                              <button
                                disabled={isClosedRunway}
                                onClick={() => { if (!isClosedRunway) { setSidRunwayName(rwy.end_a_name); setSidRunwayRouteId(rwy.id); } }}
                                style={{ flex: 1, padding: '8px 6px', background: endBtnBg(endAEff, endABlockedEff), color: isClosedRunway ? '#7f1d1d' : 'white', border: `2px solid ${endBtnBorder(endAEff, endABlockedEff)}`, borderRadius: '6px', cursor: isClosedRunway ? 'not-allowed' : 'pointer', opacity: isClosedRunway ? 0.55 : 1, textDecoration: isClosedRunway ? 'line-through' : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minHeight: '52px', justifyContent: 'center' }}>
                                <span style={{ fontSize: '16px', fontWeight: 'bold', lineHeight: 1 }}>{endAEff ? `✈ ${rwy.end_a_name}` : endABlockedEff ? `🔴 ${rwy.end_a_name}` : rwy.end_a_name}</span>
                                {endAEff && (endAConflictActive ? conflictCS : endACallsign) && <span style={{ fontSize: '10px', fontWeight: 'normal', opacity: 0.9, color: '#bbf7d0' }}>{endAConflictActive ? conflictCS : endACallsign}</span>}
                                {endABlockedEff && <span style={{ fontSize: '10px', fontWeight: 'normal', color: '#fca5a5', lineHeight: 1 }}>{endACausingCallsign && `${endACausingCallsign} · `}{fmtTime(endASecsLeft)}</span>}
                              </button>
                            ) : null}
                            {rwy.end_b_name ? (
                              <button
                                disabled={isClosedRunway}
                                onClick={() => { if (!isClosedRunway) { setSidRunwayName(rwy.end_b_name); setSidRunwayRouteId(rwy.id); } }}
                                style={{ flex: 1, padding: '8px 6px', background: endBtnBg(endBEff, endBBlockedEff), color: isClosedRunway ? '#7f1d1d' : 'white', border: `2px solid ${endBtnBorder(endBEff, endBBlockedEff)}`, borderRadius: '6px', cursor: isClosedRunway ? 'not-allowed' : 'pointer', opacity: isClosedRunway ? 0.55 : 1, textDecoration: isClosedRunway ? 'line-through' : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minHeight: '52px', justifyContent: 'center' }}>
                                <span style={{ fontSize: '16px', fontWeight: 'bold', lineHeight: 1 }}>{endBEff ? `✈ ${rwy.end_b_name}` : endBBlockedEff ? `🔴 ${rwy.end_b_name}` : rwy.end_b_name}</span>
                                {endBEff && (endBConflictActive ? conflictCS : endBCallsign) && <span style={{ fontSize: '10px', fontWeight: 'normal', opacity: 0.9, color: '#bbf7d0' }}>{endBConflictActive ? conflictCS : endBCallsign}</span>}
                                {endBBlockedEff && <span style={{ fontSize: '10px', fontWeight: 'normal', color: '#fca5a5', lineHeight: 1 }}>{endBCausingCallsign && `${endBCausingCallsign} · `}{fmtTime(endBSecsLeft)}</span>}
                              </button>
                            ) : null}
                            {!rwy.end_a_name && !rwy.end_b_name && (
                              <button
                                disabled={isClosedRunway}
                                onClick={() => { if (!isClosedRunway) { setSidRunwayName(rwy.name); setSidRunwayRouteId(rwy.id); } }}
                                style={{ flex: 1, padding: '10px', background: endBtnBg(endAEff || endBEff, endABlockedEff || endBBlockedEff), color: isClosedRunway ? '#7f1d1d' : 'white', border: `2px solid ${endBtnBorder(endAEff || endBEff, endABlockedEff || endBBlockedEff)}`, borderRadius: '6px', cursor: isClosedRunway ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: 'bold', opacity: isClosedRunway ? 0.55 : 1, textDecoration: isClosedRunway ? 'line-through' : 'none' }}>
                                {rwy.name}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setSidRunwayName('')}
                    style={{ flex: 1, padding: '8px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                    {tr('ground.noSpecificRunway')}
                  </button>
                  <button onClick={() => setSidModal(null)}
                    style={{ flex: 1, padding: '8px', background: '#0f172a', color: '#64748b', border: '1px solid #334155', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                    {tr('shared.cancel')}
                  </button>
                </div>
              </div>
            </div>
          );
        }

        if (sidSectorPick) {
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={closeSidModal}>
              <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', maxWidth: '340px', width: '90%', border: '1px solid #7c3aed', direction: 'rtl' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#c4b5fd', marginBottom: '4px' }}>↗ SID {sidSectorPick.label} — לאיזו עמדה?</div>
                <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '18px' }}>{tr('ground.formation')} <strong style={{ color: 'white' }}>{callSign}</strong></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                  {sidSectorPick.sector_ids.map(sectorId => {
                    const sec = allSectors.find((s: any) => s.id === sectorId);
                    return (
                      <button key={sectorId} onClick={() => confirmSidWithSector(sidSectorPick, sectorId)}
                        style={{ padding: '10px 16px', background: '#1d4ed8', color: 'white', border: '1px solid #3b82f6', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', textAlign: 'right' }}>
                        {sec?.name || `עמדה ${sectorId}`}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setSidSectorPick(null)}
                  style={{ width: '100%', padding: '8px', background: '#0f172a', color: '#64748b', border: '1px solid #334155', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>{tr('shared.back')}</button>
              </div>
            </div>
          );
        }

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={closeSidModal}>
            <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', maxWidth: '340px', width: '90%', border: '1px solid #334155', direction: 'rtl' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fca5a5', marginBottom: '4px' }}>{tr('ground.takeoffSelectSid')}</div>
              <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '18px' }}>
                {tr('ground.formation')} <strong style={{ color: 'white' }}>{callSign}</strong>
                {allAircraft && sidPartialSelected.length > 0 ? <span> {tr('ground.aircraft2')} {sidPartialSelected.join(',')}</span> : allAircraft ? <span> {tr('ground.wholeFormation')}</span> : <span> {tr('ground.aircraft')}{sidModal.idx}</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {sids.map(sid => (
                  <button key={sid.label} onClick={() => confirmSid(sid)}
                    style={{ padding: '10px 16px', background: sid.sector_ids.length > 0 ? '#1d4ed8' : '#1e3a5f', color: 'white', border: `1px solid ${sid.sector_ids.length > 0 ? '#3b82f6' : '#334155'}`, borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{sid.label}</span>
                    {sid.sector_ids.length === 1 && <span style={{ fontSize: '10px', color: '#93c5fd', fontWeight: 'normal' }}>{tr('ground.automaticTransfer')}</span>}
                    {sid.sector_ids.length > 1 && <span style={{ fontSize: '10px', color: '#c4b5fd', fontWeight: 'normal' }}>{sid.sector_ids.length} {tr('ground.workstations')}</span>}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={skipSid}
                  style={{ flex: 1, padding: '8px', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                  {tr('ground.takeOffWithoutA')}
                </button>
                <button onClick={closeSidModal}
                  style={{ flex: 1, padding: '8px', background: '#0f172a', color: '#64748b', border: '1px solid #334155', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                  {tr('shared.cancel')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Transfer pending dialog */}
      {transferPending && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setTransferPending(null)}>
          <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', maxWidth: '320px', width: '90%', border: '1px solid #334155', direction: 'rtl' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#e2e8f0', marginBottom: '8px' }}>{tr('ground.transferToSector')}</div>
            <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '20px' }}>
              {tr('ground.formation')} <strong style={{ color: 'white' }}>{transferPending.stripName}</strong>
              <br />מה להעביר?
            </div>
            <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
              <button onClick={() => { onTransfer(transferPending.stripId, transferPending.sectorId, transferPending.aircraftIdx); setTransferPending(null); }}
                style={{ padding: '10px 16px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                {tr('ground.aircraft4')}{transferPending.aircraftIdx} {tr('shared.of')} {transferPending.totalCount}
              </button>
              <button onClick={() => { onTransfer(transferPending.stripId, transferPending.sectorId); setTransferPending(null); }}
                style={{ padding: '10px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                {tr('ground.allFormations')}{transferPending.totalCount} {tr('ground.aircraft3')}
              </button>
              <button onClick={() => setTransferPending(null)}
                style={{ padding: '8px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                {tr('shared.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Split Formation Modal ─── */}
      {groundSplitModal && (() => {
        const sp = groundSplitModal.strip;
        const spCallSign = sp.callSign || sp.call_sign || '';
        const spCount = parseInt(sp.numberOfFormation ?? sp.number_of_formation ?? '1') || 1;
        const spIndices: number[] = Array.isArray(sp.aircraft_indices) ? sp.aircraft_indices : Array.from({ length: spCount }, (_, i) => i + 1);
        const canConfirm = groundSplitSelected.length > 0 && groundSplitSelected.length < spIndices.length;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setGroundSplitModal(null)}>
            <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', maxWidth: '360px', width: '90%', border: '1px solid #7c3aed', direction: 'rtl' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#c4b5fd', marginBottom: '4px' }}>{tr('shared.splitFormation2')} {spCallSign}</div>
              <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '14px' }}>{tr('shared.selectTheAircraftTo')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                {spIndices.map(idx => (
                  <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '8px 10px', borderRadius: '6px', background: groundSplitSelected.includes(idx) ? '#2e1065' : '#0f172a', border: `1px solid ${groundSplitSelected.includes(idx) ? '#7c3aed' : '#334155'}` }}>
                    <input type="checkbox" checked={groundSplitSelected.includes(idx)} onChange={ev => { setGroundSplitSelected(prev => ev.target.checked ? [...prev, idx] : prev.filter(i => i !== idx)); }} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>{spCallSign}{idx}</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{tr('shared.aircraft2')}{idx}</span>
                  </label>
                ))}
              </div>
              {!canConfirm && groundSplitSelected.length > 0 && (
                <div style={{ color: '#f87171', fontSize: '11px', marginBottom: '8px' }}>{tr('shared.selectAtLeastOne')}</div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => doSplitFormation(sp, groundSplitSelected)} disabled={!canConfirm}
                  style={{ flex: 2, padding: '10px', background: canConfirm ? '#7c3aed' : '#334155', color: 'white', border: 'none', borderRadius: '8px', cursor: canConfirm ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 'bold' }}>
                  {tr('shared.split')}{groundSplitSelected.length}/{spIndices.length})
                </button>
                <button onClick={() => setGroundSplitModal(null)} style={{ flex: 1, padding: '10px', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>{tr('shared.cancel')}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Merge Formation — Select Sibling Modal ─── */}
      {groundMergeModal && (() => {
        const mp = groundMergeModal.strip;
        const mpName = getFormationDisplayName(mp);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setGroundMergeModal(null)}>
            <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', maxWidth: '360px', width: '90%', border: '1px solid #1d4ed8', direction: 'rtl' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#93c5fd', marginBottom: '4px' }}>{tr('shared.mergeFormation2')} {mpName}</div>
              <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '14px' }}>{tr('shared.selectTheFormationTo')} {mpName}:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                {groundMergeModal.siblings.map(sib => (
                  <button key={sib.id} onClick={() => { setGroundMergeModal(null); setGroundMergeConfirm({ targetId: String(sib.id), sourceId: String(mp.id), targetName: getFormationDisplayName(sib), sourceName: mpName }); }}
                    style={{ padding: '10px 14px', background: '#0f172a', border: '1px solid #1d4ed8', borderRadius: '8px', color: '#e2e8f0', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', textAlign: 'right', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{getFormationDisplayName(sib)}</span>
                    <span style={{ fontSize: '11px', color: '#60a5fa' }}>{parseInt(sib.numberOfFormation ?? sib.number_of_formation ?? '1') || 1} {tr('shared.aircraft4')}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setGroundMergeModal(null)} style={{ width: '100%', padding: '9px', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>{tr('shared.cancel')}</button>
            </div>
          </div>
        );
      })()}

      {/* ─── Merge Confirm Dialog ─── */}
      {groundMergeConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setGroundMergeConfirm(null)}>
          <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', maxWidth: '340px', width: '90%', border: '1px solid #ef4444', direction: 'rtl' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#fca5a5', marginBottom: '8px' }}>{tr('shared.confirmMerge')}</div>
            <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '18px' }}>
              {tr('shared.merging')} <strong style={{ color: '#93c5fd' }}>{groundMergeConfirm.sourceName}</strong> {tr('shared.into')} <strong style={{ color: '#86efac' }}>{groundMergeConfirm.targetName}</strong>.<br />
              <span style={{ color: '#f87171', fontSize: '12px' }}>{tr('shared.theMergedStripWill')}</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => doMergeFormations(groundMergeConfirm.targetId, groundMergeConfirm.sourceId)}
                style={{ flex: 2, padding: '10px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>{tr('shared.merge')}</button>
              <button onClick={() => setGroundMergeConfirm(null)} style={{ flex: 1, padding: '10px', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>{tr('shared.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Strip Grid Card Layout (SGNode) ---

export default GroundView;
