import React, { useState, useRef, useEffect, useCallback } from 'react';
import { API_URL } from '../../config';
import { sc } from '../../utils/scale';
import { customConfirm } from '../shared/ConfirmModal';
import type { CrewMember, QGroup } from '../../types';
import { ClassicStripCard, ClassicPartnersAndPointsEditor, ClassicTransferHelpModal } from '../classic/ClassicViews';
import type { CivCol } from '../classic/ClassicViews';
import MapsManager from '../map/MapsManager';
import { QueryBuilder } from '../query/QueryBuilder';
import { SettingsModal, MaybeSettingsModal } from '../shared/Modals';
import { BlockVisualPainter } from '../blocks/BlockVisualPainter';
import { GroundMarkerSVG, renderGroundSvgIcon, getElemDisplayStateOpts, GROUND_SVG_ICON_KEYS, ALL_MAZAA_STATUSES, AIR_DEFENSE_STATUSES, YABA_AIR_DEFENSE_STATUSES } from '../ground/groundShared';
import { AidsManager, ClosuresManager, DefaultNamesManager, SerialsAdminTab, StripGridEditor, StripWindowAdmin, TableModesManager, WorkGroupsManager } from './managers';
import * as XLSX from 'xlsx';
import { getSession } from '../../utils/session';
import { CLASSIC_STRIP_FIELDS } from '../../types/stripGrid';
import { GROUND_POINT_MARKERS, toEmbedUrl } from '../ground/groundShared';
import { geoToImagePct, imagePctToGeo, buildGeoAnchor as getAnchorFromMapData } from '../../utils/geo';

export const ManagementPage = ({ onBack, crewMember, mode }: { onBack: () => void; crewMember?: CrewMember | null; mode?: 'admin' | 'team_lead' }) => {
  const isAdmin = crewMember?.is_admin ?? true;
  const isTeamLead = !isAdmin && (crewMember?.is_team_lead ?? false);
  const effectiveMode = mode ?? (isAdmin ? 'admin' : 'team_lead');
  type TabKey = 'maps' | 'sectors' | 'presets' | 'strips' | 'crew' | 'table_modes' | 'work_groups' | 'aids' | 'serials' | 'blocks' | 'bdh' | 'classic_strips' | 'airfields' | 'base_statuses' | 'aviation_bases' | 'value_lists' | 'contacts' | 'default_names' | 'strip_windows' | 'closures';
  const teamLeadTabs: TabKey[] = ['presets', 'sectors', 'maps', 'table_modes', 'work_groups', 'aids', 'blocks', 'bdh', 'classic_strips', 'strip_windows', 'airfields', 'base_statuses', 'aviation_bases', 'value_lists', 'contacts', 'default_names', 'closures'];
  const adminOnlyTabs: TabKey[] = ['strips', 'crew', 'serials'];
  const availableTabs = effectiveMode === 'admin' ? [...adminOnlyTabs, ...teamLeadTabs] as TabKey[] : teamLeadTabs as TabKey[];
  const [activeTab, setActiveTab] = useState<TabKey>(effectiveMode === 'admin' ? 'strips' : 'presets');
  const [csvImportResult, setCsvImportResult] = useState<{ imported: number; updated: number; skipped: number; errors: string[]; unresolvedAirfields?: string[]; detectedColumns?: string[]; airfieldDebug?: string[] } | null>(null);
  const [acImportResult, setAcImportResult] = useState<{ imported: number; skipped: number; errors: string[]; colMap?: string } | null>(null);
  const [acDiag, setAcDiag] = useState<{ cols: string[]; colCallsign?: string; colIdx?: string; colDatk?: string; colKipa?: string; colArmaments?: string; colSystems?: string; rowCount: number; mapped: any[] } | null>(null);
  const [globalStrips, setGlobalStrips] = useState<any[]>([]);
  const [stripsLoading, setStripsLoading] = useState(false);
  const [stripsSearch, setStripsSearch] = useState('');
  const [editingStripId, setEditingStripId] = useState<string | null>(null);
  const [editingStripForm, setEditingStripForm] = useState<any>({});
  const [showNewStripForm, setShowNewStripForm] = useState(false);
  const [newStripForm, setNewStripForm] = useState({ callSign: '', sq: '', numberOfFormation: '', alt: '', task: '', takeoff_time: '', koteret: '', mivtza: '', tzevet_shilta: '', ta_shilta: '' });

  const loadGlobalStrips = async () => {
    setStripsLoading(true);
    try {
      const res = await fetch(`${API_URL}/strips/global`);
      const data = await res.json();
      setGlobalStrips(Array.isArray(data) ? data : []);
    } catch { setGlobalStrips([]); }
    setStripsLoading(false);
  };

  const formatTakeoffForInput = (iso: string | null): string => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch { return ''; }
  };

  const formatTakeoffDisplay = (iso: string | null): string => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch { return '—'; }
  };
  const [sectors, setSectors] = useState<any[]>([]);
  const [maps, setMaps] = useState<{id: number; name: string}[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [tableModes, setTableModes] = useState<any[]>([]);
  const [adminSerials, setAdminSerials] = useState<any[]>([]);
  const [blockSpaces, setBlockSpaces] = useState<any[]>([]);
  const [blockTables, setBlockTables] = useState<any[]>([]);
  const [editingBlockTable, setEditingBlockTable] = useState<any | null>(null);
  const [blockTableForm, setBlockTableForm] = useState({ name: '', block_space_id: '' as string | number, note: '', category: '' });
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [blockSpaceForm, setBlockSpaceForm] = useState({ name: '' });
  const [editingBlockSpace, setEditingBlockSpace] = useState<any | null>(null);
  const [editingBlock, setEditingBlock] = useState<any | null>(null);
  const [blockForm, setBlockForm] = useState({ alt_from: '', alt_to: '', mission: '', color: '#3b82f6', workstations: [] as number[], platforms: [] as string[], note: '' });
  const [blockTableForBlock, setBlockTableForBlock] = useState<number | null>(null);

  // Crew member editing
  const [editingCrewMember, setEditingCrewMember] = useState<CrewMember | null>(null);
  const [crewMemberForm, setCrewMemberForm] = useState({ first_name: '', last_name: '', personal_id: '', is_admin: false, is_team_lead: false, approved_workstations: [] as number[] });
  
  // Sector editing
  const [editingSector, setEditingSector] = useState<any | null>(null);
  const [sectorForm, setSectorForm] = useState({ name: '', label_he: '', category: '', notes: '', conflict_alt_delta: 500 });
  
  // Preset editing
  const [editingPreset, setEditingPreset] = useState<any | null>(null);
  const [showNewPresetModal, setShowNewPresetModal] = useState(false);
  const [showClassicTransferHelp, setShowClassicTransferHelp] = useState(false);
  const [presetForm, setPresetForm] = useState({
    name: '',
    map_id: '',
    relevant_sectors: [] as number[],
    table_mode_id: '' as string | number,
    partial_load: 3 as number,
    full_load: 5 as number,
    conflict_alt_delta: 500 as number,
    conflict_alt_rules: [] as { maarav: string; delta: number }[],
    relevant_control_stations: [] as string[],
    filter_query: null as QGroup | null,
    block_table_ids: [] as number[],
    vertical_time_based: true as boolean,
    view_alt_min: '' as string | number,
    view_alt_max: '' as string | number,
    display_mode: 'complex' as string,
    classic_strip_table_id: '' as string | number,
    classic_strip_table_id_night: '' as string | number,
    classic_receive_points: [] as { sector_id: number; label: string }[],
    classic_transfer_points: [] as { sector_id: number; label: string }[],
    preset_type: 'normal' as string,
    classic_partner_preset_ids: [] as number[],
    classic_incoming_partner_preset_ids: [] as number[],
    classic_outgoing_partner_preset_ids: [] as number[],
    airfield_id: '' as string | number,
    show_serials: true as boolean,
    allow_view_switching: true as boolean,
    show_base_statuses: false as boolean,
    base_status_ids: [] as number[],
    preset_role: '' as string,
    parent_base_id: '' as string | number,
    can_update_pressure: false as boolean,
    show_dashboard: false as boolean,
    flight_zones_mode: false as boolean,
    fz_pin_display: 'strip' as string,
    suggest_alt_range: false as boolean,
    show_full_picture: false as boolean,
    blind_map_default: false as boolean,
    use_map_zones: false as boolean,
    can_update_mazaa: false as boolean,
    mazaa_update_base_id: '' as string | number,
    can_update_atis: false as boolean,
    can_update_notam: false as boolean,
    datk_show_minutes: '' as string | number,
    civilian_columns: [] as CivCol[],
    civilian_board_bg: '' as string,
    dual_map_mode: false as boolean,
    map2_id: '' as string | number,
    dual_map_layout: 'side-by-side' as string,
    dual_map_split: 50 as number,
  });
  const [presetFormInitial, setPresetFormInitial] = useState<string | null>(null);
  const presetIsDirty = presetFormInitial !== null && JSON.stringify(presetForm) !== presetFormInitial;

  // Preset links state
  const [editingPresetLinks, setEditingPresetLinks] = useState<any[]>([]);
  const [editingPresetMazaaRows, setEditingPresetMazaaRows] = useState<{id?: number; mazaa_status: string; partial_load: number; full_load: number}[]>([]);
  const [newMazaaRow, setNewMazaaRow] = useState<{mazaa_status: string; partial_load: number; full_load: number}>({ mazaa_status: '', partial_load: 3, full_load: 5 });
  const [newLinkForm, setNewLinkForm] = useState({ url: '', name: '', category: '', note: '' });
  const [showAddLinkForm, setShowAddLinkForm] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);
  const [editLinkForm, setEditLinkForm] = useState({ url: '', name: '', category: '', note: '' });

  const loadPresetLinks = async (presetId: number) => {
    const res = await fetch(`${API_URL}/preset-links/${presetId}`);
    if (res.ok) setEditingPresetLinks(await res.json());
  };

  useEffect(() => {
    if (!editingPreset?.id) { setEditingPresetMazaaRows([]); setNewMazaaRow({ mazaa_status: '', partial_load: 3, full_load: 5 }); return; }
    fetch(`${API_URL}/preset-mazaa-thresholds?preset_id=${editingPreset.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(rows => setEditingPresetMazaaRows(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [editingPreset?.id]);

  // Classic Strip Tables state
  const [classicTables, setClassicTables] = useState<any[]>([]);
  const [sgEditorTableId, setSgEditorTableId] = useState<number | null>(null);
  const [showNewModePicker, setShowNewModePicker] = useState(false);
  const [newCivilTableName, setNewCivilTableName] = useState('');
  const [adminAirfields, setAdminAirfields] = useState<any[]>([]);
  const [airfieldForm, setAirfieldForm] = useState({ name: '', base_id: '', custom_name: '', map_id: '', sids: [] as { label: string; sector_ids: number[] }[], stars: [] as string[], newSid: '', newSidLabel: '', newStar: '' });
  const [editingAirfield, setEditingAirfield] = useState<any | null>(null);
  const [showAirfieldForm, setShowAirfieldForm] = useState(false);
  const [airfieldPoints, setAirfieldPoints] = useState<any[]>([]);
  const [airfieldPointForm, setAirfieldPointForm] = useState({ name: '', color: '#3b82f6', marker: 'circle', density_warn: 3, point_type: '' });
  const [placingPointMode, setPlacingPointMode] = useState(false);
  const [editingPoint, setEditingPoint] = useState<{ id: number; name: string; color: string; marker: string; density_warn: number; point_type: string } | null>(null);
  const [adminLocNewName, setAdminLocNewName] = useState('');
  const [editingAdminLoc, setEditingAdminLoc] = useState<{ id: number; name: string } | null>(null);
  const [adminAirfieldMapData, setAdminAirfieldMapData] = useState<any>(null);
  const [placingAdminLocMode, setPlacingAdminLocMode] = useState(false);
  const [afAnchorMode, setAfAnchorMode] = useState(false);
  const [afAnchorStep, setAfAnchorStep] = useState<1|2>(1);
  const [afPendingAnchor1, setAfPendingAnchor1] = useState<{x:number;y:number}|null>(null);
  const [afPendingDmsLat1, setAfPendingDmsLat1] = useState({ deg: '', min: '', sec: '', dir: 'N' });
  const [afPendingDmsLon1, setAfPendingDmsLon1] = useState({ deg: '', min: '', sec: '', dir: 'E' });
  const [afPendingAnchor2, setAfPendingAnchor2] = useState<{x:number;y:number}|null>(null);
  const [afPendingDmsLat2, setAfPendingDmsLat2] = useState({ deg: '', min: '', sec: '', dir: 'N' });
  const [afPendingDmsLon2, setAfPendingDmsLon2] = useState({ deg: '', min: '', sec: '', dir: 'E' });
  const [afSavingAnchors, setAfSavingAnchors] = useState(false);
  const [adminMapImgBounds, setAdminMapImgBounds] = React.useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [adminMapZoom, setAdminMapZoom] = React.useState(1.0);
  const adminMapScrollRef = React.useRef<HTMLDivElement>(null);
  const adminMapInnerRef = React.useRef<HTMLDivElement>(null);
  const adminMapImgElRef = React.useRef<HTMLImageElement>(null);
  const computeAdminMapBounds = (imgEl: HTMLImageElement | null) => {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) { setAdminMapImgBounds(null); return; }
    const c = imgEl.parentElement; if (!c) { setAdminMapImgBounds(null); return; }
    const cr = c.getBoundingClientRect();
    const ir = imgEl.getBoundingClientRect();
    const z = adminMapZoom || 1;
    setAdminMapImgBounds({ left: (ir.left - cr.left) / z, top: (ir.top - cr.top) / z, width: ir.width / z, height: ir.height / z });
  };
  React.useEffect(() => {
    const img = adminMapImgElRef.current;
    if (img) setTimeout(() => computeAdminMapBounds(img), 30);
  }, [adminMapZoom]);
  React.useEffect(() => {
    const el = adminMapScrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setAdminMapZoom(z => Math.max(0.25, Math.min(5, e.deltaY < 0 ? +(z * 1.15).toFixed(3) : +(z / 1.15).toFixed(3))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);
  const adminPtPos = (x_pct: number, y_pct: number) => adminMapImgBounds
    ? { left: `${adminMapImgBounds.left + (x_pct / 100) * adminMapImgBounds.width}px`, top: `${adminMapImgBounds.top + (y_pct / 100) * adminMapImgBounds.height}px` }
    : { left: `${x_pct}%`, top: `${y_pct}%` };
  const [selectedAdminAirfieldId, setSelectedAdminAirfieldId] = useState<number | null>(null);
  const [adminSelMapSrc, setAdminSelMapSrc] = useState<string | null>(null);
  const [classicTableForm, setClassicTableForm] = useState({ name: '', description: '' });
  const [editingClassicTable, setEditingClassicTable] = useState<any | null>(null);
  const [stripWindowLayouts, setStripWindowLayouts] = useState<any[]>([]);
  const [editingStripWindow, setEditingStripWindow] = useState<any | null>(null);
  const [stripWindowNameDraft, setStripWindowNameDraft] = useState('');
  const [newStripWindowName, setNewStripWindowName] = useState('');
  const loadStripWindowLayouts = async () => {
    const r = await fetch(`${API_URL}/strip-window-layouts`);
    if (r.ok) setStripWindowLayouts(await r.json());
  };
  const [classicTableRows, setClassicTableRows] = useState<{ row_number: number; field_name: string; fields: { field_name: string }[]; separator: string; row_label: string; editable: boolean; text_color: string; bg_color: string; font_size: number; bold: boolean; italic: boolean; underline: boolean; text_align: string }[]>([
    { row_number: 1, field_name: 'callSign', fields: [], separator: ' / ', row_label: '', editable: false, text_color: '', bg_color: '', font_size: 12, bold: true, italic: false, underline: false, text_align: 'center' },
    { row_number: 2, field_name: 'alt', fields: [], separator: ' / ', row_label: '', editable: true, text_color: '', bg_color: '', font_size: 12, bold: false, italic: false, underline: false, text_align: 'center' },
    { row_number: 3, field_name: 'task', fields: [], separator: ' / ', row_label: '', editable: false, text_color: '', bg_color: '', font_size: 12, bold: false, italic: false, underline: false, text_align: 'center' },
  ]);

  // Aviation Bases admin state
  const [adminAviationBases, setAdminAviationBases] = useState<any[]>([]);
  const [aviationBaseForm, setAviationBaseForm] = useState({ name: '', code: '', coord_n_deg: '', coord_n_min: '', coord_n_sec: '', coord_e_deg: '', coord_e_min: '', coord_e_sec: '', sids: [] as string[], stars: [] as string[], newSid: '', newStar: '' });
  const [editingAviationBase, setEditingAviationBase] = useState<any | null>(null);
  const [showAviationBaseForm, setShowAviationBaseForm] = useState(false);
  // Airfield Routes admin state
  const [adminAirfieldRoutes, setAdminAirfieldRoutes] = useState<any[]>([]);
  const [airfieldRouteForm, setAirfieldRouteForm] = useState({ name: '', airfield_id: '', color: '#3b82f6', notes: '', category: 'general', is_runway: false, end_a_name: '', end_b_name: '' });
  // Airfield Taxiways admin state
  const [adminAirfieldTaxiways, setAdminAirfieldTaxiways] = useState<any[]>([]);
  const [twAdminNewName, setTwAdminNewName] = useState('');
  const [twAdminShowAdd, setTwAdminShowAdd] = useState(false);
  const [editingAirfieldRoute, setEditingAirfieldRoute] = useState<any | null>(null);
  const [showAirfieldRouteForm, setShowAirfieldRouteForm] = useState(false);
  const [drawingRouteId, setDrawingRouteId] = useState<number | null>(null);
  // Base vehicle routes state (per-airfield, map-based waypoints)
  const [bRoutes, setBRoutes] = useState<any[]>([]);
  const [editingRoute, setEditingRoute] = useState<any | null>(null);
  const [routeForm, setRouteForm] = useState({ name: '', color: '#f97316', route_type: 'vehicle' });
  const [drawingVehicleRouteId, setDrawingVehicleRouteId] = useState<number | null>(null);
  const [vehicleRouteDraftPoints, setVehicleRouteDraftPoints] = useState<{x: number; y: number; lat?: number; lon?: number}[]>([]);
  const [showVehicleRouteForm, setShowVehicleRouteForm] = useState(false);
  // Route links state
  const [adminRouteLinks, setAdminRouteLinks] = useState<any[]>([]);
  const [showAddRouteLinkForm, setShowAddRouteLinkForm] = useState(false);
  const [newRouteLinkForm, setNewRouteLinkForm] = useState({ presetIdA: '', routeIdA: '', presetIdB: '', routeIdB: '' });
  const [routeLinkPresetBRoutes, setRouteLinkPresetBRoutes] = useState<any[]>([]);
  const [routeDraftPoints, setRouteDraftPoints] = useState<{x: number; y: number}[]>([]);
  const [pendingNewRoute, setPendingNewRoute] = useState<{name:string;color:string;notes:string;category:string;is_runway:boolean;end_a_name:string;end_b_name:string}|null>(null);
  // Airfield element types (global list)
  const [airfieldElementTypes, setAirfieldElementTypes] = useState<any[]>([]);
  const [adminElementTypes, setAdminElementTypes] = useState<any[]>([]);
  const [elementTypeForm, setElementTypeForm] = useState({ name: '', color: '#f59e0b', icon: '🔧', can_change_status: false, allowed_statuses: [] as string[], open_icon: '', close_icon: '', can_have_route: false, status_icons: {} as Record<string,string> });
  const elementTypeFormRef = React.useRef({ name: '', color: '#f59e0b', icon: '🔧', can_change_status: false, allowed_statuses: [] as string[], open_icon: '', close_icon: '', can_have_route: false, status_icons: {} as Record<string,string> });
  elementTypeFormRef.current = elementTypeForm;
  const setElementTypeFormAndRef = React.useCallback((updater: ((prev: any) => any) | { [key: string]: any }) => {
    setElementTypeForm(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      elementTypeFormRef.current = next;
      return next;
    });
  }, []);
  const [etPreviewMode, setEtPreviewMode] = React.useState<'normal'|'blink'|'open'|'close'|'cycle'>('normal');
  const [etCyclePhase, setEtCyclePhase] = React.useState<'open'|'close'>('open');
  const [etCycleFading, setEtCycleFading] = React.useState(false);
  React.useEffect(() => {
    if (etPreviewMode !== 'cycle') return;
    const tick = () => {
      setEtCycleFading(true);
      setTimeout(() => {
        setEtCyclePhase(p => p === 'open' ? 'close' : 'open');
        setEtCycleFading(false);
      }, 350);
    };
    const id = setInterval(tick, 1800);
    return () => clearInterval(id);
  }, [etPreviewMode]);
  const [editingElementType, setEditingElementType] = useState<any | null>(null);
  const [showElementTypeSection, setShowElementTypeSection] = useState(false);
  const [customStatusInput, setCustomStatusInput] = useState('');
  const [openStatusIconPicker, setOpenStatusIconPicker] = useState<string|null>(null);
  // Airfield elements (per-airfield)
  const [airfieldElements, setAirfieldElements] = useState<any[]>([]);
  const [adminAirfieldElements, setAdminAirfieldElements] = useState<any[]>([]);
  const [elementForm, setElementForm] = useState({ name: '', element_type_id: '', status: 'תקין', note: '', category: '', relevant_routes: [] as number[], blocking_statuses: [] as string[], show_in_driver: false });
  const [editingElement, setEditingElement] = useState<any | null>(null);
  const [showElementForm, setShowElementForm] = useState(false);
  const [adminElemFocusField, setAdminElemFocusField] = useState<'name'|'category'|'type'|'status'|'note'|null>(null);
  const [adminCameraForm, setAdminCameraForm] = useState({ name: '', camera_url: '' });
  const [showAdminCameraForm, setShowAdminCameraForm] = useState(false);
  const [adminCameraPanel, setAdminCameraPanel] = useState<{ url: string; name: string } | null>(null);
  const [adminCameraDragPos, setAdminCameraDragPos] = useState({ x: 80, y: 80 });
  const [adminAFExpanded, setAdminAFExpanded] = useState<Set<string>>(new Set());
  const toggleAFSec = (k: string) => setAdminAFExpanded(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });
  const [showElementsSection, setShowElementsSection] = useState(false);
  const [adminMapLayers, setAdminMapLayers] = useState<Record<string,boolean>>({ routes: true, polygons: true, sectors: true, elements: true, points: true, cameras: true });
  const toggleAdminLayer = (k: string) => setAdminMapLayers(p => ({ ...p, [k]: !p[k] }));
  const routeDragRef = React.useRef<{ id: number; startSvgX: number; startSvgY: number; origPts: {x:number;y:number}[] } | null>(null);
  const [routeDragPreview, setRouteDragPreview] = useState<{ id: number; pts: {x:number;y:number}[] } | null>(null);
  const [placingElementMode, setPlacingElementMode] = useState(false);
  const [placingElementId, setPlacingElementId] = useState<number | null>(null);
  const [adminMapElPopup, setAdminMapElPopup] = useState<{ el: any; x: number; y: number } | null>(null);

  // Airfield Polygons / Sectors / Status Types admin state
  const [adminAirfieldPolygons, setAdminAirfieldPolygons] = useState<any[]>([]);
  const [adminAirfieldSectors, setAdminAirfieldSectors] = useState<any[]>([]);
  const [adminAirfieldStatusTypes, setAdminAirfieldStatusTypes] = useState<any[]>([]);
  const [adminAirfieldRunways, setAdminAirfieldRunways] = useState<any[]>([]);
  const [adminRunwayNotams, setAdminRunwayNotams] = useState<Record<number, any[]>>({});
  const [adminRunwayEditId, setAdminRunwayEditId] = useState<number | null>(null);
  const [adminRunwayForm, setAdminRunwayForm] = useState<{ name: string; heading_a: string; heading_b: string; heading_a_true: string; heading_b_true: string; length_ft: string; length_m: string; start_x_pct: string; start_y_pct: string; end_x_pct: string; end_y_pct: string; tora_a_m: string; tora_a_ft: string; toda_a_m: string; toda_a_ft: string; asda_a_m: string; asda_a_ft: string; lda_a_m: string; lda_a_ft: string; clearway_a_m: string; clearway_a_ft: string; tora_b_m: string; tora_b_ft: string; toda_b_m: string; toda_b_ft: string; asda_b_m: string; asda_b_ft: string; lda_b_m: string; lda_b_ft: string; clearway_b_m: string; clearway_b_ft: string } | null>(null);
  const [placingRunwayEndpoint, setPlacingRunwayEndpoint] = useState<'start' | 'end' | null>(null);
  const [adminRunwayNewNotam, setAdminRunwayNewNotam] = useState<{ runwayId: number; type: 'text' | 'shortening' | 'closed'; text: string; end: 'a' | 'b'; ft: string; m: string } | null>(null);
  const [adminRunwayGrf, setAdminRunwayGrf] = useState<Record<string, any>>({});
  const [adminRunwayGrfForm, setAdminRunwayGrfForm] = useState<{ runwayId: number; heading: string; rwycc_t: string; coverage_t: string; depth_t: string; contaminant_t: string; rwycc_m: string; coverage_m: string; depth_m: string; contaminant_m: string; rwycc_r: string; coverage_r: string; depth_r: string; contaminant_r: string; notes: string } | null>(null);
  const [airfieldActiveSubTab, setAirfieldActiveSubTab] = useState<'points'|'routes'|'elements'|'polygons'|'sectors'|'statustypes'>('points');
  // Polygon drawing state
  const [drawingPolygonId, setDrawingPolygonId] = useState<number|null>(null);
  const [polygonDraftPoints, setPolygonDraftPoints] = useState<{x:number;y:number}[]>([]);
  const [editingPolygon, setEditingPolygon] = useState<any|null>(null);
  const [polygonForm, setPolygonForm] = useState({ name: '', color: '#3b82f6', notes: '', parent_id: '' });
  const [showPolygonForm, setShowPolygonForm] = useState(false);
  // Sector drawing state (airfield sectors, different from transfer sectors)
  const [drawingSectorId, setDrawingSectorId] = useState<number|null>(null);
  const sectorDragStartRef = React.useRef<{x:number;y:number}|null>(null);
  const [sectorDraftRect, setSectorDraftRect] = useState<{x:number;y:number;w:number;h:number}|null>(null);
  // Global mousemove during sector rect drawing: auto-scroll + track mouse outside div
  React.useEffect(() => {
    if (!drawingSectorId) return;
    const EDGE = 60, SPEED = 10;
    const handler = (e: MouseEvent) => {
      const sc = adminMapScrollRef.current;
      if (sc) {
        const sr = sc.getBoundingClientRect();
        let dx = 0, dy = 0;
        if (e.clientX < sr.left + EDGE) dx = -SPEED * Math.max(0, (EDGE - (e.clientX - sr.left)) / EDGE);
        else if (e.clientX > sr.right - EDGE) dx = SPEED * Math.max(0, (EDGE - (sr.right - e.clientX)) / EDGE);
        if (e.clientY < sr.top + EDGE) dy = -SPEED * Math.max(0, (EDGE - (e.clientY - sr.top)) / EDGE);
        else if (e.clientY > sr.bottom - EDGE) dy = SPEED * Math.max(0, (EDGE - (sr.bottom - e.clientY)) / EDGE);
        if (dx || dy) { sc.scrollLeft += dx; sc.scrollTop += dy; }
      }
      if (!sectorDragStartRef.current || !adminMapInnerRef.current) return;
      const ir = adminMapInnerRef.current.getBoundingClientRect();
      const z = adminMapZoom || 1;
      const relX = (e.clientX - ir.left) / z; const relY = (e.clientY - ir.top) / z;
      const imb = adminMapImgBounds;
      let x2 = imb ? ((relX - imb.left) / imb.width) * 100 : (relX / (ir.width / z)) * 100;
      let y2 = imb ? ((relY - imb.top) / imb.height) * 100 : (relY / (ir.height / z)) * 100;
      x2 = Math.max(0, Math.min(100, x2)); y2 = Math.max(0, Math.min(100, y2));
      const ds = sectorDragStartRef.current;
      setSectorDraftRect({ x: Math.min(ds.x, x2), y: Math.min(ds.y, y2), w: Math.abs(x2 - ds.x), h: Math.abs(y2 - ds.y) });
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, [drawingSectorId, adminMapImgBounds, adminMapZoom]);
  const [editingAirfieldSector, setEditingAirfieldSector] = useState<any|null>(null);
  const [airfieldSectorForm, setAirfieldSectorForm] = useState({ name: '', notes: '' });
  const [showAirfieldSectorForm, setShowAirfieldSectorForm] = useState(false);
  // Status types state
  const [editingStatusType, setEditingStatusType] = useState<any|null>(null);
  const [statusTypeForm, setStatusTypeForm] = useState({ name: '', color: '#6b7280' });
  const [showStatusTypeForm, setShowStatusTypeForm] = useState(false);

  // Base Statuses admin state
  const [adminBaseStatuses, setAdminBaseStatuses] = useState<any[]>([]);
  const [editingBaseStatus, setEditingBaseStatus] = useState<any | null>(null);
  const [showBaseStatusForm, setShowBaseStatusForm] = useState(false);
  const [baseStatusForm, setBaseStatusForm] = useState({ name: '', code: '', relevant_to: 'כולם', air_defense_status: '', absorption_status: '', bird_status: '', airfield_id: '' as string | number });
  const loadAdminBaseStatuses = () => fetch(`${API_URL}/base-statuses`).then(r => r.ok ? r.json() : []).then(setAdminBaseStatuses).catch(() => {});

  // Contacts admin state — multi-preset
  const [adminContactsShown, setAdminContactsShown] = useState<number[]>([]);
  const [adminContactsData, setAdminContactsData] = useState<Record<number, any[]>>({});
  const [adminContactsPicker, setAdminContactsPicker] = useState<string>('');
  const [adminContactsSavingId, setAdminContactsSavingId] = useState<number | null>(null);
  const DEVICE_TYPES = ['', 'ארז', 'UHF', 'VHF', 'HF', 'סאט', 'רדיו', 'אינטרקום'];
  const loadAdminContacts = (presetId: number) => {
    fetch(`${API_URL}/workstation-contacts?preset_id=${presetId}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => setAdminContactsData(prev => ({ ...prev, [presetId]: data.map(c => ({ ...c, _key: c.id })) })))
      .catch(() => {});
  };
  const saveContactRow = async (presetId: number, row: any): Promise<any> => {
    setAdminContactsSavingId(row._key);
    try {
      const body = { mahut: row.mahut, oketz: row.oketz, frequency: row.frequency, note: row.note, sort_order: row.sort_order, device_type: row.device_type || '', priority: row.priority || 'ראשי' };
      if (row.id) {
        const r = await fetch(`${API_URL}/workstation-contacts/${row.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const updated = await r.json();
        setAdminContactsData(prev => ({ ...prev, [presetId]: (prev[presetId] || []).map(x => x._key === row._key ? { ...updated, _key: updated.id } : x) }));
        return updated;
      } else {
        const r = await fetch(`${API_URL}/workstation-contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset_id: presetId, ...body }) });
        const created = await r.json();
        setAdminContactsData(prev => ({ ...prev, [presetId]: (prev[presetId] || []).map(x => x._key === row._key ? { ...created, _key: created.id } : x) }));
        return created;
      }
    } finally { setAdminContactsSavingId(null); }
  };
  const deleteContactRow = async (presetId: number, row: any) => {
    if (row.id) await fetch(`${API_URL}/workstation-contacts/${row.id}`, { method: 'DELETE' });
    setAdminContactsData(prev => ({ ...prev, [presetId]: (prev[presetId] || []).filter(x => x._key !== row._key) }));
  };
  const updateContactLocal = (presetId: number, key: number, field: string, val: string) => {
    setAdminContactsData(prev => ({ ...prev, [presetId]: (prev[presetId] || []).map(r => r._key === key ? { ...r, [field]: val, _unsaved: true } : r) }));
  };

  // BDH state
  const [bdhDocs, setBdhDocs] = useState<any[]>([]);
  const [bdhForm, setBdhForm] = useState({ name: '', category: '', title: '' });
  const [editingBdh, setEditingBdh] = useState<any | null>(null);
  const [bdhItemsEdit, setBdhItemsEdit] = useState<{ id?: number; content: string; is_header?: boolean; _key: number }[]>([]);
  const [bdhDragOver, setBdhDragOver] = useState<number | null>(null);
  const bdhDragIdxRef = React.useRef<number | null>(null);
  const [bdhPresetAssignments, setBdhPresetAssignments] = useState<Record<number, number[]>>({});
  const [bdhAssignPresetId, setBdhAssignPresetId] = useState<number | null>(null);
  const [bdhSearchAdmin, setBdhSearchAdmin] = useState('');
  let _bdhKey = 0;
  const nextBdhKey = () => ++_bdhKey;

  const loadData = async () => {
    try {
      const [sectorsRes, mapsRes, presetsRes, crewRes, tableModesRes, serialsRes, blockSpacesRes, blockTablesRes, bdhRes] = await Promise.all([
        fetch(`${API_URL}/sectors`),
        fetch(`${API_URL}/maps`),
        fetch(`${API_URL}/workstation-presets`),
        fetch(`${API_URL}/crew-members`),
        fetch(`${API_URL}/table-modes`),
        fetch(`${API_URL}/serials`),
        fetch(`${API_URL}/block-spaces`),
        fetch(`${API_URL}/block-tables`),
        fetch(`${API_URL}/bdh`)
      ]);
      if (sectorsRes.ok) setSectors(await sectorsRes.json());
      if (mapsRes.ok) setMaps(await mapsRes.json());
      if (presetsRes.ok) setPresets(await presetsRes.json());
      if (crewRes.ok) setCrewMembers(await crewRes.json());
      if (tableModesRes.ok) setTableModes(await tableModesRes.json());
      if (serialsRes.ok) setAdminSerials(await serialsRes.json());
      if (blockSpacesRes.ok) setBlockSpaces(await blockSpacesRes.json());
      if (blockTablesRes.ok) setBlockTables(await blockTablesRes.json());
      if (bdhRes.ok) setBdhDocs(await bdhRes.json());
      fetch(`${API_URL}/classic-strip-tables`).then(r => r.ok ? r.json() : []).then(setClassicTables).catch(() => {});
      fetch(`${API_URL}/airfields`).then(r => r.ok ? r.json() : []).then(setAdminAirfields).catch(() => {});
      fetch(`${API_URL}/base-statuses`).then(r => r.ok ? r.json() : []).then(setAdminBaseStatuses).catch(() => {});
      fetch(`${API_URL}/aviation-bases`).then(r => r.ok ? r.json() : []).then(setAdminAviationBases).catch(() => {});
      fetch(`${API_URL}/airfield-routes`).then(r => r.ok ? r.json() : []).then(setAdminAirfieldRoutes).catch(() => {});
      fetch(`${API_URL}/airfield-element-types`).then(r => r.ok ? r.json() : []).then(setAdminElementTypes).catch(() => {});
      const assignRes = await fetch(`${API_URL}/bdh-preset-assignments`);
      if (assignRes.ok) setBdhPresetAssignments(await assignRes.json());
    } catch (err) {
      console.error('Failed to load:', err);
    }
  };

  // Crew member management
  const saveCrewMember = async () => {
    if (!crewMemberForm.first_name.trim() || !crewMemberForm.last_name.trim()) return;
    try {
      const method = editingCrewMember ? 'PUT' : 'POST';
      const url = editingCrewMember ? `${API_URL}/crew-members/${editingCrewMember.id}` : `${API_URL}/crew-members`;
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(crewMemberForm)
      });
      setEditingCrewMember(null);
      setCrewMemberForm({ first_name: '', last_name: '', personal_id: '', is_admin: false, is_team_lead: false, approved_workstations: [] });
      loadData();
    } catch (err) {
      console.error('Failed to save crew member:', err);
    }
  };

  const editCrewMember = (member: CrewMember) => {
    setEditingCrewMember(member);
    setCrewMemberForm({ 
      first_name: member.first_name || '', 
      last_name: member.last_name || '', 
      personal_id: member.personal_id || '',
      is_admin: member.is_admin,
      is_team_lead: member.is_team_lead || false,
      approved_workstations: member.approved_workstations || [],
    });
  };

  const deleteCrewMember = async (id: number) => {
    if (!await customConfirm('למחוק איש צוות זה? הפעולה תמחק גם את נתוני כתב היד שלו.')) return;
    try {
      await fetch(`${API_URL}/crew-members/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error('Failed to delete crew member:', err);
    }
  };
  
  const toggleWorkstationApproval = (presetId: number) => {
    setCrewMemberForm(f => ({
      ...f,
      approved_workstations: f.approved_workstations.includes(presetId)
        ? f.approved_workstations.filter(id => id !== presetId)
        : [...f.approved_workstations, presetId]
    }));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'strips') loadGlobalStrips();
  }, [activeTab]);

  // Sector management
  const saveSector = async () => {
    if (!sectorForm.name.trim()) return;
    try {
      const method = editingSector ? 'PUT' : 'POST';
      const url = editingSector ? `${API_URL}/sectors/${editingSector.id}` : `${API_URL}/sectors`;
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: sectorForm.name, 
          label_he: sectorForm.label_he || sectorForm.name,
          category: sectorForm.category,
          notes: sectorForm.notes,
          conflict_alt_delta: sectorForm.conflict_alt_delta
        })
      });
      setEditingSector(null);
      setSectorForm({ name: '', label_he: '', category: '', notes: '', conflict_alt_delta: 500 });
      loadData();
    } catch (err) {
      console.error('Failed to save sector:', err);
    }
  };

  const editSector = (sector: any) => {
    setEditingSector(sector);
    setSectorForm({
      name: sector.name,
      label_he: sector.label_he || '',
      category: sector.category || '',
      notes: sector.notes || '',
      conflict_alt_delta: sector.conflict_alt_delta ?? 500
    });
  };

  const deleteSector = async (id: number) => {
    if (!await customConfirm('למחוק נקודת העברה זו?')) return;
    try {
      await fetch(`${API_URL}/sectors/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error('Failed to delete sector:', err);
    }
  };

  // Preset management
  const [presetSaveSuccess, setPresetSaveSuccess] = useState(false);
  const savePreset = async () => {
    if (!presetForm.name.trim()) return;
    try {
      const method = editingPreset ? 'PUT' : 'POST';
      const url = editingPreset ? `${API_URL}/workstation-presets/${editingPreset.id}` : `${API_URL}/workstation-presets`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: presetForm.name,
          map_id: presetForm.map_id ? parseInt(presetForm.map_id as string) : null,
          relevant_sectors: presetForm.relevant_sectors,
          table_mode_id: presetForm.table_mode_id ? Number(presetForm.table_mode_id) : null,
          partial_load: presetForm.partial_load,
          full_load: presetForm.full_load,
          conflict_alt_delta: presetForm.conflict_alt_delta,
          conflict_alt_rules: presetForm.conflict_alt_rules || [],
          relevant_control_stations: presetForm.relevant_control_stations.length > 0 ? presetForm.relevant_control_stations : null,
          filter_query: presetForm.filter_query || null,
          block_table_ids: presetForm.block_table_ids,
          vertical_time_based: presetForm.vertical_time_based,
          view_alt_min: presetForm.view_alt_min !== '' ? Number(presetForm.view_alt_min) : null,
          view_alt_max: presetForm.view_alt_max !== '' ? Number(presetForm.view_alt_max) : null,
          display_mode: presetForm.preset_type === 'classic' ? 'classic' : (presetForm.display_mode || 'complex'),
          classic_strip_table_id: presetForm.classic_strip_table_id ? Number(presetForm.classic_strip_table_id) : null,
          classic_strip_table_id_night: presetForm.classic_strip_table_id_night ? Number(presetForm.classic_strip_table_id_night) : null,
          classic_receive_points: presetForm.classic_receive_points || [],
          classic_transfer_points: presetForm.classic_transfer_points || [],
          preset_type: presetForm.preset_type || 'normal',
          airfield_id: presetForm.airfield_id ? Number(presetForm.airfield_id) : null,
          classic_partner_preset_ids: presetForm.classic_partner_preset_ids || [],
          classic_incoming_partner_preset_ids: presetForm.classic_incoming_partner_preset_ids || [],
          classic_outgoing_partner_preset_ids: presetForm.classic_outgoing_partner_preset_ids || [],
          show_serials: presetForm.show_serials !== false,
          allow_view_switching: presetForm.allow_view_switching !== false,
          show_base_statuses: presetForm.show_base_statuses === true,
          base_status_ids: presetForm.base_status_ids || [],
          preset_role: presetForm.preset_role || null,
          parent_base_id: presetForm.parent_base_id || null,
          can_update_pressure: presetForm.can_update_pressure === true,
          show_dashboard: presetForm.show_dashboard === true,
          flight_zones_mode: presetForm.flight_zones_mode === true,
          fz_pin_display: (presetForm as any).fz_pin_display || 'strip',
          suggest_alt_range: presetForm.suggest_alt_range === true,
          show_full_picture: (presetForm as any).show_full_picture === true,
          blind_map_default: (presetForm as any).blind_map_default === true,
          strip_window_id: (presetForm as any).strip_window_id ? Number((presetForm as any).strip_window_id) : null,
          use_map_zones: presetForm.use_map_zones === true,
          can_update_mazaa: presetForm.can_update_mazaa === true,
          mazaa_update_base_id: (presetForm as any).mazaa_update_base_id ? Number((presetForm as any).mazaa_update_base_id) : null,
          can_update_atis: (presetForm as any).can_update_atis === true,
          can_update_notam: (presetForm as any).can_update_notam === true,
          datk_show_minutes: presetForm.datk_show_minutes !== '' ? Number(presetForm.datk_show_minutes) : null,
          civilian_columns: presetForm.civilian_columns || [],
          civilian_board_bg: presetForm.civilian_board_bg || '',
          dual_map_mode: presetForm.dual_map_mode === true,
          map2_id: presetForm.map2_id ? Number(presetForm.map2_id) : null,
          dual_map_layout: presetForm.dual_map_layout || 'side-by-side',
          dual_map_split: presetForm.dual_map_split ?? 50,
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(`שגיאה בשמירת עמדה: ${errData.error || res.status}`);
        return;
      }
      const saved = await res.json();
      await loadData();
      setPresetSaveSuccess(true);
      setTimeout(() => setPresetSaveSuccess(false), 2500);
      if (!editingPreset) {
        setShowNewPresetModal(false);
        setPresetForm({ name: '', map_id: '', relevant_sectors: [], table_mode_id: '', partial_load: 3, full_load: 5, conflict_alt_delta: 500, relevant_control_stations: [], filter_query: null, block_table_ids: [], vertical_time_based: true, view_alt_min: '', view_alt_max: '', display_mode: 'complex', classic_strip_table_id: '', classic_strip_table_id_night: '', classic_receive_points: [], classic_transfer_points: [], preset_type: 'normal', airfield_id: '', classic_partner_preset_ids: [], classic_incoming_partner_preset_ids: [], classic_outgoing_partner_preset_ids: [], show_serials: true, allow_view_switching: true, show_base_statuses: false, base_status_ids: [], preset_role: '', parent_base_id: '', can_update_pressure: false, show_dashboard: false, flight_zones_mode: false, fz_pin_display: 'strip', datk_show_minutes: '', can_update_mazaa: false, mazaa_update_base_id: '', can_update_atis: false, can_update_notam: false, use_map_zones: false, civilian_columns: [], civilian_board_bg: '', dual_map_mode: false, map2_id: '', dual_map_layout: 'side-by-side', dual_map_split: 50, suggest_alt_range: false, show_full_picture: false, blind_map_default: false, conflict_alt_rules: [] });
      } else if (saved) {
        editPreset(saved);
      }
    } catch (err) {
      console.error('Failed to save preset:', err);
      alert('שגיאה בחיבור לשרת');
    }
  };

  const editPreset = (preset: any) => {
    setEditingPreset(preset);
    const f = {
      name: preset.name,
      map_id: preset.map_id?.toString() || '',
      relevant_sectors: preset.relevant_sectors || [],
      table_mode_id: preset.table_mode_id || '',
      partial_load: preset.partial_load ?? 3,
      full_load: preset.full_load ?? 5,
      conflict_alt_delta: preset.conflict_alt_delta ?? 500,
      conflict_alt_rules: Array.isArray(preset.conflict_alt_rules) ? preset.conflict_alt_rules : [],
      relevant_control_stations: preset.relevant_control_stations || [],
      filter_query: preset.filter_query || null,
      block_table_ids: Array.isArray(preset.block_table_ids) ? preset.block_table_ids : [],
      vertical_time_based: preset.vertical_time_based !== false,
      view_alt_min: preset.view_alt_min ?? '',
      view_alt_max: preset.view_alt_max ?? '',
      display_mode: preset.display_mode || 'complex',
      classic_strip_table_id: preset.classic_strip_table_id || '',
      classic_strip_table_id_night: preset.classic_strip_table_id_night || '',
      classic_receive_points: preset.classic_receive_points || [],
      classic_transfer_points: preset.classic_transfer_points || [],
      preset_type: preset.preset_type || 'normal',
      airfield_id: preset.airfield_id?.toString() || '',
      classic_partner_preset_ids: Array.isArray(preset.classic_partner_preset_ids) ? preset.classic_partner_preset_ids.map(Number) : [],
      classic_incoming_partner_preset_ids: Array.isArray(preset.classic_incoming_partner_preset_ids) ? preset.classic_incoming_partner_preset_ids.map(Number) : (Array.isArray(preset.classic_partner_preset_ids) ? preset.classic_partner_preset_ids.map(Number) : []),
      classic_outgoing_partner_preset_ids: Array.isArray(preset.classic_outgoing_partner_preset_ids) ? preset.classic_outgoing_partner_preset_ids.map(Number) : (Array.isArray(preset.classic_partner_preset_ids) ? preset.classic_partner_preset_ids.map(Number) : []),
      show_serials: preset.show_serials !== false,
      allow_view_switching: preset.allow_view_switching !== false,
      show_base_statuses: preset.show_base_statuses === true,
      base_status_ids: Array.isArray(preset.base_status_ids) ? preset.base_status_ids.map(Number) : [],
      preset_role: preset.preset_role || '',
      parent_base_id: preset.parent_base_id?.toString() || '',
      can_update_pressure: preset.can_update_pressure === true,
      show_dashboard: preset.show_dashboard === true,
      flight_zones_mode: preset.flight_zones_mode === true,
      fz_pin_display: preset.fz_pin_display || 'strip',
      suggest_alt_range: preset.suggest_alt_range === true,
      show_full_picture: preset.show_full_picture === true,
      blind_map_default: preset.blind_map_default === true,
      strip_window_id: preset.strip_window_id || '',
      use_map_zones: preset.use_map_zones === true,
      can_update_mazaa: preset.can_update_mazaa === true,
      mazaa_update_base_id: preset.mazaa_update_base_id?.toString() || '',
      can_update_atis: preset.can_update_atis === true,
      can_update_notam: preset.can_update_notam === true,
      datk_show_minutes: preset.datk_show_minutes ?? '',
      civilian_columns: Array.isArray(preset.civilian_columns) ? preset.civilian_columns : [],
      civilian_board_bg: preset.civilian_board_bg || '',
      dual_map_mode: preset.dual_map_mode === true,
      map2_id: preset.map2_id?.toString() || '',
      dual_map_layout: preset.dual_map_layout || 'side-by-side',
      dual_map_split: preset.dual_map_split ?? 50,
    };
    setPresetForm(f);
    setPresetFormInitial(JSON.stringify(f));
    loadPresetLinks(preset.id);
    loadStripWindowLayouts();
    setShowAddLinkForm(false);
    setEditingLinkId(null);
    setNewLinkForm({ url: '', name: '', category: '', note: '' });
    setAdminRouteLinks([]);
    setShowAddRouteLinkForm(false);
    setNewRouteLinkForm({ presetIdA: '', routeIdA: '', presetIdB: '', routeIdB: '' });
    setRouteLinkPresetBRoutes([]);
  };

  const toggleSectorSelection = (sectorId: number) => {
    setPresetForm(p => ({
      ...p,
      relevant_sectors: p.relevant_sectors.includes(sectorId) 
        ? p.relevant_sectors.filter(id => id !== sectorId)
        : [...p.relevant_sectors, sectorId]
    }));
  };

  const duplicatePreset = async (preset: any) => {
    try {
      const res = await fetch(`${API_URL}/workstation-presets/${preset.id}/duplicate`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'שגיאה לא ידועה' }));
        alert(`שגיאה בשכפול: ${err.error || 'שגיאה לא ידועה'}`);
        return;
      }
      await loadData();
    } catch (err) {
      console.error('Failed to duplicate preset:', err);
      alert('שגיאה בחיבור לשרת');
    }
  };

  const deletePreset = async (id: number) => {
    if (!await customConfirm('למחוק עמדה זו?')) return;
    try {
      const res = await fetch(`${API_URL}/workstation-presets/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'שגיאה לא ידועה' }));
        alert(`שגיאה במחיקה: ${err.error || 'שגיאה לא ידועה'}`);
        return;
      }
      loadData();
    } catch (err) {
      console.error('Failed to delete preset:', err);
      alert('שגיאה בחיבור לשרת');
    }
  };

  const tabStyle = (active: boolean) => ({
    padding: '12px 24px',
    background: active ? '#3b82f6' : '#334155',
    color: 'white',
    border: 'none',
    borderRadius: '8px 8px 0 0',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: active ? 'bold' : 'normal' as const
  });

  const sideNavItemStyle = (active: boolean): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    padding: '8px 14px',
    background: active ? 'rgba(59,130,246,0.18)' : 'transparent',
    color: active ? '#93c5fd' : '#94a3b8',
    border: 'none',
    borderRight: `3px solid ${active ? '#3b82f6' : 'transparent'}`,
    cursor: 'pointer',
    fontSize: '13px',
    lineHeight: '1.4',
    fontWeight: active ? ('bold' as const) : ('normal' as const),
    textAlign: 'right' as const,
    direction: 'rtl' as const,
    transition: 'background 0.12s, color 0.12s',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white', direction: 'rtl' }}>
      <header style={{ background: '#1e293b', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '22px' }}>{effectiveMode === 'team_lead' ? 'ניהול עמדות' : 'ניהול מערכת'}</h1>
          {effectiveMode === 'team_lead' && <span style={{ background: '#06b6d4', color: '#0c4a6e', fontSize: '12px', fontWeight: 'bold', padding: '3px 10px', borderRadius: '12px' }}>{isAdmin ? 'מנהל | מצב ראש צוות' : 'ראש צוות'}</span>}
          {effectiveMode === 'admin' && crewMember && <span style={{ background: '#eab308', color: '#1e293b', fontSize: '12px', fontWeight: 'bold', padding: '3px 10px', borderRadius: '12px' }}>מנהל</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={onBack} style={{ background: '#475569', color: 'white', padding: '10px 25px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
            חזרה
          </button>
        </div>
      </header>

      {/* Admin sidebar + content layout */}
      <div style={{ padding: '10px 14px 14px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>

        {/* Navigation Sidebar — appears on RIGHT in RTL */}
        <div style={{ width: '220px', flexShrink: 0, background: '#1e293b', borderRadius: '12px', alignSelf: 'flex-start', position: 'sticky', top: '10px', maxHeight: 'calc(100vh - 90px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: '8px' }}>

          {/* Section: ניהול מבצעי (admin only) */}
          {effectiveMode === 'admin' && (
            <>
              <div style={{ padding: '10px 14px 6px', fontSize: '12px', color: '#f8fafc', fontWeight: 'bold', letterSpacing: '0.04em', borderRight: '3px solid #3b82f6', marginBottom: '2px', background: 'rgba(59,130,246,0.10)' }}>ניהול מבצעי</div>
              {availableTabs.includes('strips') && <button onClick={() => setActiveTab('strips')} style={sideNavItemStyle(activeTab === 'strips')}>✈ פממים</button>}
              {availableTabs.includes('crew') && <button onClick={() => setActiveTab('crew')} style={sideNavItemStyle(activeTab === 'crew')}>👥 אנשי צוות</button>}
              {availableTabs.includes('serials') && <button onClick={() => setActiveTab('serials')} style={sideNavItemStyle(activeTab === 'serials')}>📄 ספרורים</button>}
              <div style={{ height: '1px', background: '#334155', margin: '10px 0 0' }} />
            </>
          )}

          {/* Section: עמדות ותשתית */}
          <div style={{ padding: '12px 14px 4px', fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '0.04em', textAlign: 'center' }}>עמדות ותשתית</div>
          {availableTabs.includes('presets') && <button onClick={() => setActiveTab('presets')} style={sideNavItemStyle(activeTab === 'presets')}>🖥 עמדות</button>}
          {availableTabs.includes('sectors') && <button onClick={() => setActiveTab('sectors')} style={sideNavItemStyle(activeTab === 'sectors')}>📍 נקודות העברה</button>}
          {availableTabs.includes('maps') && <button onClick={() => setActiveTab('maps')} style={sideNavItemStyle(activeTab === 'maps')}>🗺 מפות</button>}
          {availableTabs.includes('work_groups') && <button onClick={() => setActiveTab('work_groups')} style={sideNavItemStyle(activeTab === 'work_groups')}>🔗 קבוצות עבודה</button>}
          <div style={{ height: '1px', background: '#334155', margin: '10px 0 0' }} />

          {/* Section: תצוגה */}
          <div style={{ padding: '12px 14px 4px', fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '0.04em', textAlign: 'center' }}>תצוגה</div>
          {availableTabs.includes('table_modes') && <button onClick={() => setActiveTab('table_modes')} style={sideNavItemStyle(activeTab === 'table_modes')}>📊 מודי טבלה</button>}
          {availableTabs.includes('classic_strips') && <button onClick={() => setActiveTab('classic_strips')} style={sideNavItemStyle(activeTab === 'classic_strips')}>📋 מבנה פ"מ</button>}
          {availableTabs.includes('strip_windows') && <button onClick={() => { setActiveTab('strip_windows'); loadStripWindowLayouts(); }} style={sideNavItemStyle(activeTab === 'strip_windows')}>🪟 חלון סטריפים</button>}
          <div style={{ height: '1px', background: '#334155', margin: '10px 0 0' }} />

          {/* Section: תפעול */}
          <div style={{ padding: '12px 14px 4px', fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '0.04em', textAlign: 'center' }}>תפעול</div>
          {availableTabs.includes('aids') && <button onClick={() => setActiveTab('aids')} style={sideNavItemStyle(activeTab === 'aids')}>🔧 עזרים לעמדה</button>}
          {availableTabs.includes('blocks') && <button onClick={() => setActiveTab('blocks')} style={sideNavItemStyle(activeTab === 'blocks')}>🧱 בלוקים</button>}
          {availableTabs.includes('bdh') && <button onClick={() => setActiveTab('bdh')} style={sideNavItemStyle(activeTab === 'bdh')}>☑ בד"ח</button>}
          {availableTabs.includes('contacts') && <button onClick={() => {
            setActiveTab('contacts');
            fetch(`${API_URL}/workstation-contacts/all`)
              .then(r => r.ok ? r.json() : [])
              .then((data: any[]) => {
                const grouped: Record<number, any[]> = {};
                data.forEach((c: any) => { if (!grouped[c.preset_id]) grouped[c.preset_id] = []; grouped[c.preset_id].push({ ...c, _key: c.id }); });
                const ids = Object.keys(grouped).map(Number);
                setAdminContactsShown(prev => { const existing = new Set(prev); ids.forEach(id => existing.add(id)); return Array.from(existing); });
                setAdminContactsData(prev => ({ ...prev, ...grouped }));
              }).catch(() => {});
          }} style={sideNavItemStyle(activeTab === 'contacts')}>📡 קשרים</button>}
          <div style={{ height: '1px', background: '#334155', margin: '10px 0 0' }} />

          {/* Section: בסיסים ונתונים */}
          <div style={{ padding: '12px 14px 4px', fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '0.04em', textAlign: 'center' }}>בסיסים ונתונים</div>
          {availableTabs.includes('airfields') && <button onClick={() => setActiveTab('airfields')} style={sideNavItemStyle(activeTab === 'airfields')}>🛬 שדות תעופה</button>}
          {availableTabs.includes('base_statuses') && <button onClick={() => setActiveTab('base_statuses')} style={sideNavItemStyle(activeTab === 'base_statuses')}>🏛 סטטוס בסיסים</button>}
          {availableTabs.includes('aviation_bases') && <button onClick={() => setActiveTab('aviation_bases')} style={sideNavItemStyle(activeTab === 'aviation_bases')}>✈️ בסיסים</button>}
          {availableTabs.includes('value_lists') && <button onClick={() => setActiveTab('value_lists')} style={sideNavItemStyle(activeTab === 'value_lists')}>⚙️ אלמנטים בבסיס</button>}
          {availableTabs.includes('default_names') && <button onClick={() => setActiveTab('default_names')} style={sideNavItemStyle(activeTab === 'default_names')}>🚀 חימושים/מערכות</button>}
          {availableTabs.includes('closures') && <button onClick={() => setActiveTab('closures')} style={sideNavItemStyle(activeTab === 'closures')}>🚫 סגירות</button>}

        </div>{/* end sidebar */}

        {/* Main Content Area */}
        <div style={{ flex: 1, background: '#1e293b', borderRadius: '12px', padding: '18px', minHeight: '500px', minWidth: 0 }}>
          
          {/* Presets Tab */}
          {activeTab === 'presets' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>הגדרת עמדות</h2>
                <button
                  onClick={() => { const df = { name: '', map_id: '', relevant_sectors: [] as number[], table_mode_id: '', partial_load: 3, full_load: 5, conflict_alt_delta: 500, relevant_control_stations: [] as string[], filter_query: null as QGroup | null, block_table_ids: [] as number[], vertical_time_based: true, view_alt_min: '', view_alt_max: '', display_mode: 'complex', classic_strip_table_id: '', classic_strip_table_id_night: '', classic_receive_points: [] as { sector_id: number; label: string }[], classic_transfer_points: [] as { sector_id: number; label: string }[], preset_type: 'normal', airfield_id: '', classic_partner_preset_ids: [] as number[], classic_incoming_partner_preset_ids: [] as number[], classic_outgoing_partner_preset_ids: [] as number[], show_serials: true, allow_view_switching: true, show_base_statuses: false, base_status_ids: [] as number[], preset_role: '', parent_base_id: '', can_update_pressure: false, show_dashboard: false, flight_zones_mode: false, fz_pin_display: 'strip', use_map_zones: false, datk_show_minutes: '' as string | number, can_update_mazaa: false, mazaa_update_base_id: '', can_update_atis: false, can_update_notam: false, civilian_columns: [] as CivCol[], civilian_board_bg: '', dual_map_mode: false, map2_id: '', dual_map_layout: 'side-by-side', dual_map_split: 50, suggest_alt_range: false, show_full_picture: false, blind_map_default: false, conflict_alt_rules: [] }; setEditingPreset(null); setShowNewPresetModal(true); setPresetForm(df); setPresetFormInitial(JSON.stringify(df)); }}
                  style={{ padding: '8px 20px', background: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                  + חדש
                </button>
              </div>
              
              {/* Preset Form — opens as modal for both new and edit */}
              {(!!editingPreset || showNewPresetModal) && <MaybeSettingsModal
                show={true}
                title={editingPreset ? `עריכת עמדה: ${editingPreset?.name || ''}` : 'עמדה חדשה'}
                onClose={() => { setEditingPreset(null); setShowNewPresetModal(false); setPresetFormInitial(null); setPresetForm({ name: '', map_id: '', relevant_sectors: [], table_mode_id: '', partial_load: 3, full_load: 5, conflict_alt_delta: 500, relevant_control_stations: [], filter_query: null, block_table_ids: [], vertical_time_based: true, view_alt_min: '', view_alt_max: '', display_mode: 'complex', classic_strip_table_id: '', classic_strip_table_id_night: '', classic_receive_points: [], classic_transfer_points: [], preset_type: 'normal', airfield_id: '', classic_partner_preset_ids: [], classic_incoming_partner_preset_ids: [], classic_outgoing_partner_preset_ids: [], show_serials: true, allow_view_switching: true, show_base_statuses: false, base_status_ids: [], preset_role: '', parent_base_id: '', can_update_pressure: false, show_dashboard: false, flight_zones_mode: false, fz_pin_display: 'strip', datk_show_minutes: '', can_update_mazaa: false, mazaa_update_base_id: '', can_update_atis: false, can_update_notam: false, use_map_zones: false, civilian_columns: [], civilian_board_bg: '', dual_map_mode: false, map2_id: '', dual_map_layout: 'side-by-side', dual_map_split: 50, suggest_alt_range: false, show_full_picture: false, blind_map_default: false, conflict_alt_rules: [] }); }}
                wide
              >
              <div style={{ borderRadius: '8px', padding: '0', marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#94a3b8' }}>
                  {editingPreset ? 'עריכת עמדה' : 'עמדה חדשה'}
                </h3>
                
                {/* Row 1: Name + Preset type */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>שם עמדה:</label>
                    <input
                      type="text"
                      value={presetForm.name}
                      onChange={(e) => setPresetForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="לדוגמה: מרחבי 305"
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>סוג עמדה:</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[{ val: 'normal', label: '🗺 רגיל' }, { val: 'classic', label: '📋 סטריפים' }, { val: 'ground', label: '🛬 שדה' }, { val: 'ground_mgmt', label: '🏗 ניהול קרקעי' }, { val: 'civilian', label: '✈ אזרחי' }].map(opt => (
                        <button key={opt.val} type="button" onClick={() => setPresetForm(p => ({ ...p, preset_type: opt.val }))}
                          style={{ flex: 1, padding: '10px 8px', borderRadius: '6px', border: `2px solid ${presetForm.preset_type === opt.val ? '#0ea5e9' : '#334155'}`, background: presetForm.preset_type === opt.val ? '#0c2a40' : '#1e293b', color: presetForm.preset_type === opt.val ? '#7dd3fc' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: presetForm.preset_type === opt.val ? 'bold' : 'normal' }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* strip_window_id selector — only for classic strip preset type */}
                {presetForm.preset_type === 'classic' ? (
                  <div style={{ marginTop: '12px', padding: '10px 14px', background: '#0f172a', borderRadius: '8px', border: (presetForm as any).strip_window_id ? '1px solid #7c3aed' : '1px solid #1e293b' }}>
                    <label style={{ display: 'block', marginBottom: '6px', color: (presetForm as any).strip_window_id ? '#c4b5fd' : '#94a3b8', fontSize: '13px', fontWeight: 'bold' }}>🪟 חלון סטריפים:</label>
                    <select
                      value={(presetForm as any).strip_window_id || ''}
                      onChange={e => setPresetForm(p => ({ ...p, strip_window_id: e.target.value || null }))}
                      style={{ background: '#1e293b', border: (presetForm as any).strip_window_id ? '1px solid #7c3aed' : '1px solid #334155', borderRadius: '6px', color: '#f1f5f9', padding: '7px 10px', fontSize: '13px', width: '100%' }}
                    >
                      <option value=''>— ללא חלון סטריפים —</option>
                      {stripWindowLayouts.map((lay: any) => (
                        <option key={lay.id} value={lay.id}>🪟 {lay.name}</option>
                      ))}
                    </select>
                    {(presetForm as any).strip_window_id && (
                      <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#a78bfa' }}>✅ עמדה זו תציג חלון סטריפים. נקודות העברה אינן רלוונטיות למצב זה.</p>
                    )}
                  </div>
                ) : null}

                {/* Row 2: Conditional based on preset type */}
                {(presetForm.preset_type === 'ground' || presetForm.preset_type === 'ground_mgmt') ? (
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>שדה תעופה:</label>
                    <select value={presetForm.airfield_id}
                      onChange={e => {
                        const afId = e.target.value;
                        const af = adminAirfields.find((a: any) => String(a.id) === afId);
                        setPresetForm(p => ({
                          ...p,
                          airfield_id: afId,
                          map_id: (af?.map_id && !p.map_id) ? String(af.map_id) : p.map_id,
                        }));
                      }}
                      style={{ width: '100%', padding: '10px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '14px', direction: 'rtl' }}>
                      <option value="">— ללא שדה —</option>
                      {adminAirfields.map((af: any) => <option key={af.id} value={af.id}>{af.name}</option>)}
                    </select>
                    {adminAirfields.length === 0 && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>צור שדה תעופה בלשונית "שדות תעופה"</p>}
                    {(() => {
                      const selAf = adminAirfields.find((a: any) => String(a.id) === String(presetForm.airfield_id));
                      if (!selAf) return null;
                      const afSids: string[] = Array.isArray(selAf.sids) ? selAf.sids.map((s: any) => typeof s === 'string' ? s : s.label || '') : [];
                      const afStars: string[] = Array.isArray(selAf.stars) ? selAf.stars : [];
                      return (
                        <div style={{ marginTop: '8px', background: '#0a1628', borderRadius: '6px', padding: '8px 10px', border: '1px solid #1e3a5f', direction: 'rtl' }}>
                          {selAf.map_id && <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#60a5fa' }}>🗺 מפה: {maps.find((m: any) => m.id === selAf.map_id)?.name || `מפה ${selAf.map_id}`}</p>}
                          {afSids.length > 0 && <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#86efac' }}>📤 SIDs: {afSids.join(', ')}</p>}
                          {afStars.length > 0 && <p style={{ margin: '0', fontSize: '11px', color: '#fcd34d' }}>📥 STARs: {afStars.join(', ')}</p>}
                          {selAf.map_id && (
                            <button type="button" onClick={() => setPresetForm(p => ({ ...p, map_id: String(selAf.map_id) }))}
                              style={{ marginTop: '6px', padding: '4px 10px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                              🗺 טען מפה מהשדה
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    {presetForm.preset_type === 'ground_mgmt' && (
                      <div style={{ marginTop: '12px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>מפה:</label>
                        <select value={presetForm.map_id}
                          onChange={e => setPresetForm(p => ({ ...p, map_id: e.target.value }))}
                          style={{ width: '100%', padding: '10px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '14px', direction: 'rtl' }}>
                          <option value="">— ללא מפה —</option>
                          {maps.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                    )}
                    {presetForm.preset_type !== 'ground_mgmt' && <div style={{ marginTop: '12px', padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                      <label style={{ display: 'block', marginBottom: '6px', color: '#7dd3fc', fontSize: '13px', fontWeight: 'bold' }}>⏰ הצגת מטוס ליד דת"ק לפני המראה:</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={presetForm.datk_show_minutes}
                          placeholder="ריק = כבוי"
                          onChange={e => setPresetForm(p => ({ ...p, datk_show_minutes: e.target.value }))}
                          style={{ width: '90px', padding: '7px 10px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '14px', textAlign: 'center' }}
                        />
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>דקות לפני המראה</span>
                      </div>
                      <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#64748b', lineHeight: '1.5' }}>
                        מטוס עם דת"ק שמספרו תואם שם נקודה בשדה יוצג אוטומטית ליד הנקודה כשמספר הדקות לפני המראה ≤ ערך זה.<br/>
                        ניתן לשנות ערך זה גם ישירות מעמדת המגרש.
                      </p>
                    </div>}
                  </div>
                ) : presetForm.preset_type === 'classic' ? (
                  <div style={{ marginBottom: '15px', padding: '14px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                    <label style={{ display: 'block', marginBottom: '10px', color: '#7dd3fc', fontSize: '14px', fontWeight: 'bold' }}>📋 הגדרת עמדת סטריפים</label>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '6px', color: '#fbbf24', fontSize: '13px' }}>☀️ תבנית יום:</label>
                        <select value={presetForm.classic_strip_table_id}
                          onChange={e => setPresetForm(p => ({ ...p, classic_strip_table_id: e.target.value }))}
                          style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl', width: '100%' }}>
                          <option value="">— ללא תבנית —</option>
                          {(classicTables || []).map((ct: any) => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '6px', color: '#818cf8', fontSize: '13px' }}>🌙 תבנית לילה:</label>
                        <select value={presetForm.classic_strip_table_id_night}
                          onChange={e => setPresetForm(p => ({ ...p, classic_strip_table_id_night: e.target.value }))}
                          style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl', width: '100%' }}>
                          <option value="">— כמו יום —</option>
                          {(classicTables || []).map((ct: any) => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>מפה:</label>
                    <select
                      value={presetForm.map_id}
                      onChange={(e) => setPresetForm(p => ({ ...p, map_id: e.target.value }))}
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px' }}
                    >
                      <option value="">בחר מפה</option>
                      {maps.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* תפקיד עמדה — מוצג לכל סוגי העמדות */}
                <div style={{ marginBottom: '15px', padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#7dd3fc', fontSize: '14px', fontWeight: 'bold' }}>🏷 תפקיד עמדה:</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[{ val: 'tower', label: '🗼 מגדל' }, { val: 'yaba', label: '📡 יב"א' }].map(opt => (
                      <button key={opt.val} type="button" onClick={() => setPresetForm(p => ({ ...p, preset_role: opt.val }))}
                        style={{ flex: '1 0 auto', padding: '9px 10px', borderRadius: '6px', border: `2px solid ${presetForm.preset_role === opt.val ? '#0ea5e9' : '#334155'}`, background: presetForm.preset_role === opt.val ? '#0c2a40' : '#1e293b', color: presetForm.preset_role === opt.val ? '#7dd3fc' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: presetForm.preset_role === opt.val ? 'bold' : 'normal' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#64748b' }}>מגדל: מציג SID בפ"מ | יב"א: מציג STAR בפ"מ</p>
                </div>

                {/* Parent base selection */}
                <div style={{ marginBottom: '15px', padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#7dd3fc', fontSize: '14px', fontWeight: 'bold' }}>🏛 בסיס אב:</label>
                  <select
                    value={presetForm.parent_base_id || ''}
                    onChange={e => setPresetForm(p => ({ ...p, parent_base_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl' }}
                  >
                    <option value="">— ללא בסיס —</option>
                    {adminAviationBases.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>
                    ))}
                  </select>
                  {adminAviationBases.length === 0 && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#f59e0b' }}>הגדר בסיסי תעופה בלשונית "✈️ בסיסים"</p>
                  )}
                  <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#64748b' }}>הבסיס שאליו שייכת העמדה — משמש לשיתוף לחץ אטמוספרי ופרמטרים נוספים</p>
                </div>

                {presetForm.preset_type === 'civilian' && (() => {
                  const civCols: CivCol[] = presetForm.civilian_columns || [];
                  const setCivCols = (cols: CivCol[]) => setPresetForm(p => ({ ...p, civilian_columns: cols }));
                  const DEFAULT_COLORS = ['#1a5fa8','#0d7a3e','#c8a800','#7b2d8b','#c0392b','#1a6b6b','#e67e22','#2c3e50'];
                  return (
                    <div style={{ marginTop: '18px', padding: '14px', background: '#0a1628', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                      <div style={{ color: '#7dd3fc', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>✈ עמודות לוח אזרחי</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#475569' }}>גרור כרטיסיות לשינוי סדר. לחץ על שם לעריכה. עד 3 עמודות.</p>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94a3b8', marginRight: 'auto', flexShrink: 0 }}>
                          צבע רקע:
                          <input type="color" value={presetForm.civilian_board_bg || '#07090c'}
                            onChange={e => setPresetForm(p => ({ ...p, civilian_board_bg: e.target.value }))}
                            style={{ width: '26px', height: '26px', padding: '1px', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
                          />
                        </label>
                      </div>

                      {/* Visual board preview with draggable columns */}
                      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', minHeight: '90px', alignItems: 'stretch', background: '#07090c', borderRadius: '8px', padding: '10px', border: '1px solid #1e293b' }}>
                        {civCols.map((col, ci) => (
                          <div
                            key={col.key}
                            draggable
                            onDragStart={e => { e.dataTransfer.setData('text/plain', String(ci)); }}
                            onDragOver={e => { e.preventDefault(); }}
                            onDrop={e => {
                              e.preventDefault();
                              const from = parseInt(e.dataTransfer.getData('text/plain'));
                              if (isNaN(from) || from === ci) return;
                              const next = [...civCols];
                              const [moved] = next.splice(from, 1);
                              next.splice(ci, 0, moved);
                              setCivCols(next);
                            }}
                            style={{ minWidth: '110px', flex: '0 0 auto', display: 'flex', flexDirection: 'column', borderRadius: '6px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.08)', cursor: 'grab', userSelect: 'none' }}
                          >
                            {/* Header bar — column color */}
                            <div style={{ background: col.color || '#94a3b8', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'space-between' }}>
                              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', cursor: 'grab' }}>⠿</span>
                              <input
                                value={col.label}
                                onChange={e => {
                                  const next = [...civCols];
                                  next[ci] = { ...next[ci], label: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, '_') || `col_${ci}` };
                                  setCivCols(next);
                                }}
                                onClick={e => e.stopPropagation()}
                                onDragStart={e => e.stopPropagation()}
                                placeholder="שם עמודה"
                                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', minWidth: 0, cursor: 'text' }}
                              />
                              <button type="button" onClick={() => setCivCols(civCols.filter((_, i) => i !== ci))}
                                style={{ background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '3px', color: '#ffaaaa', cursor: 'pointer', fontSize: '10px', padding: '1px 4px', lineHeight: 1 }}>✕</button>
                            </div>
                            {/* Body — strip placeholder lines */}
                            <div style={{ flex: 1, background: '#0d1b2a', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {[1,2].map(n => (
                                <div key={n} style={{ height: '18px', background: '#c8d8e4', borderRadius: '3px', opacity: 0.18 }} />
                              ))}
                            </div>
                            {/* Footer — color picker + sub-cols */}
                            <div style={{ background: '#0a1220', padding: '5px 6px', display: 'flex', alignItems: 'center', gap: '5px', borderTop: '1px solid #1e293b' }}>
                              <input type="color" value={col.color || '#94a3b8'}
                                onChange={e => {
                                  const next = [...civCols];
                                  next[ci] = { ...next[ci], color: e.target.value };
                                  setCivCols(next);
                                }}
                                onDragStart={e => e.stopPropagation()}
                                style={{ width: '22px', height: '22px', padding: '1px', border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent' }}
                              />
                              <input
                                value={(col.sub_cols || []).join(',')}
                                onChange={e => {
                                  const next = [...civCols];
                                  next[ci] = { ...next[ci], sub_cols: e.target.value ? e.target.value.split(',').map(s => s.trim()) : [] };
                                  setCivCols(next);
                                }}
                                onClick={e => e.stopPropagation()}
                                onDragStart={e => e.stopPropagation()}
                                placeholder="תת-עמ'"
                                title="תת-עמודות מופרדות בפסיק (לדוג': 01,02,03)"
                                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#64748b', fontSize: '10px', minWidth: 0, cursor: 'text' }}
                              />
                            </div>
                          </div>
                        ))}

                        {/* Add column button — appears as an empty slot */}
                        {civCols.length < 3 && (
                          <button type="button"
                            onClick={() => {
                              const nextColor = DEFAULT_COLORS[civCols.length % DEFAULT_COLORS.length];
                              setCivCols([...civCols, { key: `col_${Date.now()}`, label: '', sub_cols: [], color: nextColor }]);
                            }}
                            style={{ minWidth: '60px', flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', borderRadius: '6px', border: '2px dashed #1e3a5f', background: 'transparent', color: '#334155', cursor: 'pointer', fontSize: '22px', padding: '10px' }}>
                            <span>+</span>
                            <span style={{ fontSize: '10px', color: '#334155' }}>עמודה</span>
                          </button>
                        )}
                      </div>
                      <p style={{ margin: '6px 0 0 0', fontSize: '10px', color: '#334155' }}>
                        {civCols.length} עמודות • גרור לשינוי סדר • צבע בחלק התחתון • תת-עמ' (ביה"ש) מופרדות בפסיק
                      </p>
                    </div>
                  );
                })()}

                {presetForm.preset_type === 'normal' && <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>מצב תצוגה ברירת מחדל:</label>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: presetForm.table_mode_id ? '14px' : '0' }}>
                    <button
                      type="button"
                      onClick={() => setPresetForm(p => ({ ...p, table_mode_id: '' }))}
                      style={{
                        flex: 1, padding: '10px', border: presetForm.table_mode_id ? '2px solid #334155' : '2px solid #2563eb',
                        borderRadius: '8px', background: presetForm.table_mode_id ? '#1e293b' : '#1e3a5f',
                        color: presetForm.table_mode_id ? '#94a3b8' : 'white', cursor: 'pointer', fontSize: '14px', fontWeight: presetForm.table_mode_id ? 'normal' : 'bold'
                      }}
                    >🗺 מוד מפה</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!presetForm.table_mode_id && tableModes.length > 0) {
                          setPresetForm(p => ({ ...p, table_mode_id: tableModes[0].id }));
                        }
                      }}
                      style={{
                        flex: 1, padding: '10px', border: presetForm.table_mode_id ? '2px solid #2563eb' : '2px solid #334155',
                        borderRadius: '8px', background: presetForm.table_mode_id ? '#1e3a5f' : '#1e293b',
                        color: presetForm.table_mode_id ? 'white' : '#94a3b8', cursor: tableModes.length === 0 ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: presetForm.table_mode_id ? 'bold' : 'normal'
                      }}
                      title={tableModes.length === 0 ? 'צור מוד טבלה תחילה בלשונית "מודי טבלה"' : ''}
                    >📋 מוד טבלה</button>
                  </div>
                  {presetForm.table_mode_id !== '' && tableModes.length > 0 && (
                    <div>
                      <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '8px' }}>בחר טבלה:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {tableModes.map(tm => (
                          <button
                            key={tm.id}
                            type="button"
                            onClick={() => setPresetForm(p => ({ ...p, table_mode_id: tm.id }))}
                            style={{
                              textAlign: 'right', padding: '10px 14px', border: Number(presetForm.table_mode_id) === tm.id ? '2px solid #3b82f6' : '1px solid #334155',
                              borderRadius: '6px', background: Number(presetForm.table_mode_id) === tm.id ? '#1e3a8a' : '#1e293b',
                              color: 'white', cursor: 'pointer', fontSize: '13px', direction: 'rtl'
                            }}
                          >
                            <strong>{tm.name}</strong>
                            <span style={{ color: '#64748b', fontSize: '11px', marginRight: '10px' }}>
                              {(tm.columns || []).map((c: any) => c.label).join(' | ')}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {presetForm.table_mode_id !== '' && tableModes.length === 0 && (
                    <div style={{ color: '#f87171', fontSize: '13px', padding: '10px', background: '#1e293b', borderRadius: '6px' }}>
                      אין מודי טבלה מוגדרים. צור מוד טבלה בלשונית "מודי טבלה".
                    </div>
                  )}
                </div>}
                
                {/* Load thresholds */}
                <div style={{ marginTop: '15px', padding: '14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                  <label style={{ display: 'block', marginBottom: '10px', color: '#f59e0b', fontSize: '14px', fontWeight: 'bold' }}>⚡ מוד עומס</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', color: '#fbbf24', fontSize: '13px' }}>עומס חלקי (כתום) — מספר פ"ממים:</label>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={presetForm.partial_load}
                        onChange={e => setPresetForm(p => ({ ...p, partial_load: Math.max(1, parseInt(e.target.value) || 1) }))}
                        style={{ width: '100%', padding: '8px', border: '1px solid #f59e0b', borderRadius: '6px', background: '#0f172a', color: '#fbbf24', fontSize: '16px', fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', color: '#f87171', fontSize: '13px' }}>עומס מלא (אדום) — מספר פ"ממים:</label>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={presetForm.full_load}
                        onChange={e => setPresetForm(p => ({ ...p, full_load: Math.max(1, parseInt(e.target.value) || 1) }))}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ef4444', borderRadius: '6px', background: '#0f172a', color: '#f87171', fontSize: '16px', fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  <p style={{ margin: '8px 0 0 0', color: '#64748b', fontSize: '11px', direction: 'rtl' }}>
                    סופרים: פ"ממים באוויר בעמדה + פ"ממים שממריאים תוך 10 ד' + העברות נכנסות (באוויר או ממריאים תוך 10 ד')
                  </p>
                  <div style={{ marginTop: '12px', borderTop: '1px solid #334155', paddingTop: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#f472b6', fontSize: '13px', fontWeight: 'bold' }}>⚠️ קונפליקט גובה לפי מערך:</label>
                    {/* Per-מערך rules table */}
                    {(presetForm.conflict_alt_rules || []).map((rule, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center', direction: 'rtl' }}>
                        <input
                          list="conflict-maarav-options"
                          placeholder="מערך (לפי שם טייסת)"
                          value={rule.maarav}
                          onChange={e => setPresetForm(p => ({ ...p, conflict_alt_rules: (p.conflict_alt_rules || []).map((r, i) => i === idx ? { ...r, maarav: e.target.value } : r) }))}
                          style={{ flex: 2, padding: '7px 10px', border: '1px solid #ec4899', borderRadius: '6px', background: '#1e293b', color: '#f9a8d4', fontSize: '13px', direction: 'rtl', boxSizing: 'border-box' }}
                        />
                        <input
                          type="number"
                          min="0"
                          max="99000"
                          step="100"
                          value={rule.delta}
                          onChange={e => setPresetForm(p => ({ ...p, conflict_alt_rules: (p.conflict_alt_rules || []).map((r, i) => i === idx ? { ...r, delta: Math.max(0, parseInt(e.target.value) || 0) } : r) }))}
                          placeholder="רגליים"
                          style={{ flex: 1, padding: '7px 6px', border: '1px solid #ec4899', borderRadius: '6px', background: '#1e293b', color: '#f472b6', fontSize: '14px', fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box' }}
                        />
                        <button
                          type="button"
                          onClick={() => setPresetForm(p => ({ ...p, conflict_alt_rules: (p.conflict_alt_rules || []).filter((_, i) => i !== idx) }))}
                          style={{ padding: '7px 10px', background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: '6px', color: '#f87171', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}
                          title="מחק שורה"
                        >🗑</button>
                      </div>
                    ))}
                    <datalist id="conflict-maarav-options">
                      <option value="קרב" />
                      <option value="תובלה" />
                      <option value="מסוקים" />
                      <option value="כטמ&quot;מ" />
                      <option value="ים" />
                      <option value="אז&quot;מ" />
                    </datalist>
                    <button
                      type="button"
                      onClick={() => setPresetForm(p => ({ ...p, conflict_alt_rules: [...(p.conflict_alt_rules || []), { maarav: '', delta: 500 }] }))}
                      style={{ width: '100%', padding: '7px', background: '#1e293b', border: '1px dashed #ec4899', borderRadius: '6px', color: '#f472b6', cursor: 'pointer', fontSize: '13px', marginBottom: '10px' }}
                    >+ הוסף מערך</button>
                    {/* Fallback general threshold */}
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '12px' }}>סף כללי — למי שאין מערך תואם (רגליים):</label>
                      <input
                        type="number"
                        min="0"
                        max="99000"
                        step="100"
                        value={presetForm.conflict_alt_delta}
                        onChange={e => setPresetForm(p => ({ ...p, conflict_alt_delta: Math.max(0, parseInt(e.target.value) || 0) }))}
                        style={{ width: '100%', padding: '8px', border: '1px solid #475569', borderRadius: '6px', background: '#0f172a', color: '#94a3b8', fontSize: '15px', fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box' }}
                      />
                      <p style={{ margin: '4px 0 0 0', color: '#475569', fontSize: '11px', direction: 'rtl' }}>
                        ℹ️ מערך מזוהה לפי התאמת שם טייסת (sq). 0 = קונפליקט כבוי.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Relevant Control Stations */}
                <div style={{ marginTop: '14px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', color: '#38bdf8', fontSize: '13px' }}>📡 תאי שליטה רלוונטיים לעמדה:</label>
                  {(() => {
                    const allAdminStations = Array.from(new Set(adminSerials.map((s: any) => s.control_station))).sort() as string[];
                    if (allAdminStations.length === 0) {
                      return <p style={{ color: '#64748b', fontSize: '11px', margin: 0 }}>אין ספרורים במערכת — יש לייבא ספרורים בלשונית "ספרורים" תחילה.</p>;
                    }
                    return (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                          {allAdminStations.map(st => {
                            const isSelected = presetForm.relevant_control_stations.includes(st);
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => setPresetForm(p => ({
                                  ...p,
                                  relevant_control_stations: isSelected
                                    ? p.relevant_control_stations.filter(x => x !== st)
                                    : [...p.relevant_control_stations, st]
                                }))}
                                style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${isSelected ? '#38bdf8' : '#334155'}`, background: isSelected ? '#0369a1' : '#1e293b', color: isSelected ? 'white' : '#94a3b8', cursor: 'pointer', fontSize: '12px', fontWeight: isSelected ? 'bold' : 'normal' }}
                              >
                                {isSelected ? '✓ ' : ''}{st}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button type="button" onClick={() => setPresetForm(p => ({ ...p, relevant_control_stations: allAdminStations }))} style={{ fontSize: '11px', background: 'transparent', border: '1px solid #334155', color: '#94a3b8', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>בחר הכל</button>
                          <button type="button" onClick={() => setPresetForm(p => ({ ...p, relevant_control_stations: [] }))} style={{ fontSize: '11px', background: 'transparent', border: '1px solid #334155', color: '#94a3b8', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>נקה הכל</button>
                        </div>
                        <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '11px', direction: 'rtl' }}>
                          אם לא נבחר אף תא שליטה — יוצגו כל תאי השליטה. אם נבחרו — רק הנבחרים יוצגו בעמדה.
                        </p>
                      </>
                    );
                  })()}
                </div>

                {/* Show serials toggle */}
                {presetForm.preset_type !== 'ground_mgmt' && <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>📡 הצגת ספרורים בעמדה:</label>
                  <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                    {[{ val: true, label: '✅ כן — הצג כפתור ספרורים' }, { val: false, label: '🚫 לא — הסתר ספרורים' }].map(opt => (
                      <button key={String(opt.val)} type="button"
                        onClick={() => setPresetForm(p => ({ ...p, show_serials: opt.val }))}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${(presetForm.show_serials !== false) === opt.val ? '#0ea5e9' : '#334155'}`, background: (presetForm.show_serials !== false) === opt.val ? '#0c4a6e' : '#1e293b', color: (presetForm.show_serials !== false) === opt.val ? '#7dd3fc' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: (presetForm.show_serials !== false) === opt.val ? 'bold' : 'normal' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '11px', direction: 'rtl' }}>
                    קובע אם הכפתור 📡 ספרורים יוצג בכותרת העמדה (וגם עמודת הספרורים בטבלה).
                  </p>
                </div>}

                {/* Allow view switching toggle */}
                {presetForm.preset_type !== 'ground_mgmt' && <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>🔁 אפשר מעבר בין מפה ↔ טבלה:</label>
                  <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                    {[{ val: true, label: '✅ כן — תפריט תצוגה זמין' }, { val: false, label: '🔒 לא — נעל לתצוגה אחת' }].map(opt => (
                      <button key={String(opt.val)} type="button"
                        onClick={() => setPresetForm(p => ({ ...p, allow_view_switching: opt.val }))}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${(presetForm.allow_view_switching !== false) === opt.val ? '#0ea5e9' : '#334155'}`, background: (presetForm.allow_view_switching !== false) === opt.val ? '#0c4a6e' : '#1e293b', color: (presetForm.allow_view_switching !== false) === opt.val ? '#7dd3fc' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: (presetForm.allow_view_switching !== false) === opt.val ? 'bold' : 'normal' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '11px', direction: 'rtl' }}>
                    כשמכובה — תפריט "תצוגה" מוסתר ולא ניתן לעבור בין מפה לטבלה. בעמדת סטריפים זה מוסתר אוטומטית בכל מקרה.
                  </p>
                </div>}

                {/* Base statuses toggle */}
                <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>🏛 הצג סטטוס בסיסים בפאנל הצד:</label>
                  <div style={{ display: 'flex', gap: '8px', direction: 'rtl', marginBottom: '8px' }}>
                    {[{ val: true, label: '✅ כן — הצג' }, { val: false, label: '🔒 לא — הסתר' }].map(opt => (
                      <button key={String(opt.val)} type="button"
                        onClick={() => setPresetForm(p => ({ ...p, show_base_statuses: opt.val }))}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${presetForm.show_base_statuses === opt.val ? '#f59e0b' : '#334155'}`, background: presetForm.show_base_statuses === opt.val ? '#1c1107' : '#1e293b', color: presetForm.show_base_statuses === opt.val ? '#fcd34d' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: presetForm.show_base_statuses === opt.val ? 'bold' : 'normal' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {presetForm.show_base_statuses && (
                    <div style={{ direction: 'rtl' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>בחר בסיסים להצגה (ריק = כל הבסיסים):</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto', background: '#0f172a', borderRadius: '6px', padding: '8px', border: '1px solid #334155' }}>
                        {adminBaseStatuses.length === 0 ? (
                          <div style={{ fontSize: '11px', color: '#475569' }}>אין בסיסים מוגדרים — הוסף בלשונית "סטטוס בסיסים"</div>
                        ) : adminBaseStatuses.map((bs: any) => {
                          const checked = presetForm.base_status_ids.includes(Number(bs.id));
                          return (
                            <label key={bs.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '3px 4px', borderRadius: '4px', background: checked ? '#1c1107' : 'transparent' }}>
                              <input type="checkbox" checked={checked} onChange={() => setPresetForm(p => ({ ...p, base_status_ids: checked ? p.base_status_ids.filter(id => id !== Number(bs.id)) : [...p.base_status_ids, Number(bs.id)] }))} />
                              <span style={{ fontSize: '12px', color: checked ? '#fcd34d' : '#94a3b8' }}>{bs.name}{bs.code ? ` (${bs.code})` : ''}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Airfield Template — select airfield to auto-fill map + show SIDs/STARs */}
                {(presetForm.preset_type !== 'ground' && presetForm.preset_type !== 'ground_mgmt') && (
                <div style={{ marginTop: '15px', padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#7dd3fc', fontSize: '14px', fontWeight: 'bold' }}>✈️ שדה תעופה (תבנית):</label>
                  <select
                    value={presetForm.airfield_id || ''}
                    onChange={e => {
                      const afId = e.target.value;
                      const af = adminAirfields.find((a: any) => String(a.id) === afId);
                      setPresetForm(p => ({
                        ...p,
                        airfield_id: afId,
                        map_id: (af?.map_id && !p.map_id) ? String(af.map_id) : p.map_id,
                      }));
                    }}
                    style={{ width: '100%', padding: '8px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '13px', marginBottom: '8px', direction: 'rtl' }}
                  >
                    <option value="">— ללא שדה תעופה —</option>
                    {adminAirfields.map((af: any) => (
                      <option key={af.id} value={af.id}>{af.name}</option>
                    ))}
                  </select>
                  {(() => {
                    const selAf = adminAirfields.find((a: any) => String(a.id) === String(presetForm.airfield_id));
                    if (!selAf) return null;
                    const afSids: string[] = Array.isArray(selAf.sids) ? selAf.sids.map((s: any) => typeof s === 'string' ? s : s.label || '') : [];
                    const afStars: string[] = Array.isArray(selAf.stars) ? selAf.stars : [];
                    return (
                      <div style={{ background: '#0a1628', borderRadius: '6px', padding: '8px 10px', border: '1px solid #1e3a5f', direction: 'rtl' }}>
                        {selAf.map_id && <p style={{ margin: '0 0 6px 0', fontSize: '11px', color: '#60a5fa' }}>🗺 מפה: {maps.find((m: any) => m.id === selAf.map_id)?.name || `מפה ${selAf.map_id}`}</p>}
                        {afSids.length > 0 && <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#86efac' }}>📤 SIDs: {afSids.join(', ')}</p>}
                        {afStars.length > 0 && <p style={{ margin: '0', fontSize: '11px', color: '#fcd34d' }}>📥 STARs: {afStars.join(', ')}</p>}
                        {selAf.map_id && (
                          <button type="button" onClick={() => setPresetForm(p => ({ ...p, map_id: String(selAf.map_id) }))}
                            style={{ marginTop: '6px', padding: '4px 10px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                            🗺 טען מפה מהשדה
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {adminAirfields.length === 0 && <p style={{ margin: '0', fontSize: '11px', color: '#ef4444' }}>צור שדות תעופה בלשונית "שדות תעופה" בניהול מבצעי</p>}
                </div>
                )}

                {/* can_update_mazaa toggle */}
                <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>🛡 הרשאת עדכון מצב מז"א מרחבי:</label>
                  <div style={{ display: 'flex', gap: '8px', direction: 'rtl', alignItems: 'center' }}>
                    {([{ val: true, label: '✏️ מעדכן' }, { val: false, label: '👁 קריאה בלבד' }] as { val: boolean; label: string }[]).map(opt => (
                      <button key={String(opt.val)} type="button"
                        onClick={() => setPresetForm(p => ({ ...p, can_update_mazaa: opt.val }))}
                        style={{ padding: '5px 14px', borderRadius: '6px', border: `1px solid ${presetForm.can_update_mazaa === opt.val ? '#f59e0b' : '#334155'}`, background: presetForm.can_update_mazaa === opt.val ? '#1c1200' : '#1e293b', color: presetForm.can_update_mazaa === opt.val ? '#fbbf24' : '#94a3b8', cursor: 'pointer', fontSize: '12px', fontWeight: presetForm.can_update_mazaa === opt.val ? 'bold' : 'normal' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#64748b' }}>עמדות "מעדכן" יכולות לשנות את מצב מז"א המרחבי עבור כל קבוצת העבודה. עמדות מגדל לוקחות מצב מז"א מסטטוס הבסיס שלהן.</p>
                </div>

                {/* mazaa_update_base_id — only relevant for tower presets with can_update_mazaa */}
                {presetForm.can_update_mazaa && presetForm.preset_role === 'tower' && (
                  <div style={{ marginTop: '10px', padding: '10px 12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#fbbf24', fontSize: '13px', fontWeight: 'bold' }}>🛡 בסיס יעד לעדכון מז"א:</label>
                    <select
                      value={(presetForm as any).mazaa_update_base_id || ''}
                      onChange={e => setPresetForm(p => ({ ...p, mazaa_update_base_id: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl' }}
                    >
                      <option value="">— ראשון ב-base_status_ids (ברירת מחדל) —</option>
                      {adminBaseStatuses.map((bs: any) => (
                        <option key={bs.id} value={bs.id}>{bs.name}{bs.code ? ` (${bs.code})` : ''}</option>
                      ))}
                    </select>
                    <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#64748b' }}>בחר במפורש את הבסיס שאליו ישלח עדכון מז"א מהמגדל הזה. ברירת מחדל — הבסיס הראשון ברשימת הבסיסים של העמדה.</p>
                  </div>
                )}

                {/* can_update_atis / can_update_notam toggles — ground presets only */}
                {(presetForm.preset_type === 'ground' || presetForm.preset_type === 'ground_mgmt') && (
                  <div style={{ marginTop: '12px', padding: '12px', background: '#0a1628', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                    <div style={{ marginBottom: '10px', color: '#7dd3fc', fontSize: '13px', fontWeight: 'bold' }}>📡 הרשאות עדכון ATIS / NOTAM (עמדת שדה תעופה)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '12px' }}>📻 ATIS — מי יכול לעדכן:</label>
                        <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                          {([{ val: true, label: '✏️ מעדכן' }, { val: false, label: '👁 קריאה בלבד' }] as { val: boolean; label: string }[]).map(opt => (
                            <button key={String(opt.val)} type="button"
                              onClick={() => setPresetForm(p => ({ ...p, can_update_atis: opt.val }))}
                              style={{ padding: '4px 12px', borderRadius: '6px', border: `1px solid ${(presetForm as any).can_update_atis === opt.val ? '#38bdf8' : '#334155'}`, background: (presetForm as any).can_update_atis === opt.val ? '#0c2a40' : '#1e293b', color: (presetForm as any).can_update_atis === opt.val ? '#38bdf8' : '#94a3b8', cursor: 'pointer', fontSize: '12px', fontWeight: (presetForm as any).can_update_atis === opt.val ? 'bold' : 'normal' }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '12px' }}>⚠️ NOTAM — מי יכול לעדכן:</label>
                        <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                          {([{ val: true, label: '✏️ מעדכן' }, { val: false, label: '👁 קריאה בלבד' }] as { val: boolean; label: string }[]).map(opt => (
                            <button key={String(opt.val)} type="button"
                              onClick={() => setPresetForm(p => ({ ...p, can_update_notam: opt.val }))}
                              style={{ padding: '4px 12px', borderRadius: '6px', border: `1px solid ${(presetForm as any).can_update_notam === opt.val ? '#f59e0b' : '#334155'}`, background: (presetForm as any).can_update_notam === opt.val ? '#1c1107' : '#1e293b', color: (presetForm as any).can_update_notam === opt.val ? '#fbbf24' : '#94a3b8', cursor: 'pointer', fontSize: '12px', fontWeight: (presetForm as any).can_update_notam === opt.val ? 'bold' : 'normal' }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#64748b' }}>עמדות "מעדכן" יכולות לשנות ATIS / NOTAM בפאנל סטטוס הבסיסים. כל שאר העמדות יראו קריאה בלבד.</p>
                  </div>
                )}

                {/* מד עומס לפי מצב מז"א */}
                {editingPreset && (
                  <div style={{ marginTop: '15px', padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
                    <label style={{ display: 'block', marginBottom: '10px', color: '#fbbf24', fontSize: '14px', fontWeight: 'bold' }}>🛡 מד עומס לפי מצב מז"א:</label>
                    {editingPresetMazaaRows.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        {editingPresetMazaaRows.map(row => (
                          <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', direction: 'rtl' }}>
                            <span style={{ fontSize: '12px', color: ALL_MAZAA_STATUSES.find(s => s.label === row.mazaa_status)?.color || '#94a3b8', fontWeight: 'bold', minWidth: '130px' }}>{row.mazaa_status}</span>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>חלקי:</span>
                            <input type="number" value={row.partial_load} min={1} max={99}
                              onChange={e => { const v = Number(e.target.value); setEditingPresetMazaaRows(prev => prev.map(r => r.id === row.id ? { ...r, partial_load: v } : r)); }}
                              onBlur={e => { const v = Number(e.target.value); fetch(`${API_URL}/preset-mazaa-thresholds/${row.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partial_load: v, full_load: row.full_load }) }).catch(() => {}); }}
                              style={{ width: '50px', padding: '3px 6px', background: '#1e293b', border: '1px solid #475569', borderRadius: '4px', color: '#f59e0b', fontSize: '12px', textAlign: 'center' }} />
                            <span style={{ fontSize: '11px', color: '#64748b' }}>מלא:</span>
                            <input type="number" value={row.full_load} min={1} max={99}
                              onChange={e => { const v = Number(e.target.value); setEditingPresetMazaaRows(prev => prev.map(r => r.id === row.id ? { ...r, full_load: v } : r)); }}
                              onBlur={e => { const v = Number(e.target.value); fetch(`${API_URL}/preset-mazaa-thresholds/${row.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partial_load: row.partial_load, full_load: v }) }).catch(() => {}); }}
                              style={{ width: '50px', padding: '3px 6px', background: '#1e293b', border: '1px solid #475569', borderRadius: '4px', color: '#ef4444', fontSize: '12px', textAlign: 'center' }} />
                            <button onClick={async () => { await fetch(`${API_URL}/preset-mazaa-thresholds/${row.id}`, { method: 'DELETE' }); setEditingPresetMazaaRows(prev => prev.filter(r => r.id !== row.id)); }}
                              style={{ padding: '2px 8px', background: '#450a0a', border: '1px solid #dc2626', color: '#fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', direction: 'rtl', paddingTop: editingPresetMazaaRows.length > 0 ? '8px' : '0', borderTop: editingPresetMazaaRows.length > 0 ? '1px solid #334155' : 'none' }}>
                      <select value={newMazaaRow.mazaa_status} onChange={e => setNewMazaaRow(p => ({ ...p, mazaa_status: e.target.value }))}
                        style={{ padding: '4px 8px', background: '#1e293b', border: `1px solid ${newMazaaRow.mazaa_status ? (ALL_MAZAA_STATUSES.find(s => s.label === newMazaaRow.mazaa_status)?.color || '#475569') : '#475569'}`, borderRadius: '5px', color: newMazaaRow.mazaa_status ? (ALL_MAZAA_STATUSES.find(s => s.label === newMazaaRow.mazaa_status)?.color || '#e2e8f0') : '#94a3b8', fontSize: '12px', direction: 'rtl' }}>
                        <option value="">— בחר מצב מז"א —</option>
                        {(editingPreset?.preset_role === 'yaba' ? YABA_AIR_DEFENSE_STATUSES : AIR_DEFENSE_STATUSES).filter(s => !editingPresetMazaaRows.some(r => r.mazaa_status === s.label)).map(s => (
                          <option key={s.label} value={s.label}>{s.label}</option>
                        ))}
                      </select>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>חלקי:</span>
                      <input type="number" value={newMazaaRow.partial_load} min={1} max={99}
                        onChange={e => setNewMazaaRow(p => ({ ...p, partial_load: Number(e.target.value) }))}
                        style={{ width: '50px', padding: '3px 6px', background: '#1e293b', border: '1px solid #475569', borderRadius: '4px', color: '#f59e0b', fontSize: '12px', textAlign: 'center' }} />
                      <span style={{ fontSize: '11px', color: '#64748b' }}>מלא:</span>
                      <input type="number" value={newMazaaRow.full_load} min={1} max={99}
                        onChange={e => setNewMazaaRow(p => ({ ...p, full_load: Number(e.target.value) }))}
                        style={{ width: '50px', padding: '3px 6px', background: '#1e293b', border: '1px solid #475569', borderRadius: '4px', color: '#ef4444', fontSize: '12px', textAlign: 'center' }} />
                      <button onClick={async () => {
                        if (!newMazaaRow.mazaa_status || !editingPreset) return;
                        const res = await fetch(`${API_URL}/preset-mazaa-thresholds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset_id: editingPreset.id, mazaa_status: newMazaaRow.mazaa_status, partial_load: newMazaaRow.partial_load, full_load: newMazaaRow.full_load }) });
                        if (res.ok) { const saved = await res.json(); setEditingPresetMazaaRows(prev => [...prev, saved]); setNewMazaaRow({ mazaa_status: '', partial_load: 3, full_load: 5 }); }
                      }} disabled={!newMazaaRow.mazaa_status}
                        style={{ padding: '4px 12px', background: newMazaaRow.mazaa_status ? '#1c4532' : '#1e293b', border: `1px solid ${newMazaaRow.mazaa_status ? '#22c55e' : '#334155'}`, color: newMazaaRow.mazaa_status ? '#86efac' : '#64748b', borderRadius: '5px', cursor: newMazaaRow.mazaa_status ? 'pointer' : 'default', fontSize: '12px', fontWeight: 'bold' }}>+ הוסף</button>
                    </div>
                    <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#64748b' }}>כשמוגדרים ספים למצב מז"א — מד העומס ישתמש בספים אלה כשהמצב פעיל. ברירת-מחדל (ללא מז"א): חלקי={presetForm.partial_load}, מלא={presetForm.full_load}.</p>
                  </div>
                )}

                {presetForm.preset_type !== 'ground_mgmt' && <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>📊 דש בורד:</label>
                  <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                    {([{ val: true, label: '✅ מציג דש בורד' }, { val: false, label: '🚫 ללא דש בורד' }] as { val: boolean; label: string }[]).map(opt => (
                      <button key={String(opt.val)} type="button"
                        onClick={() => setPresetForm(p => ({ ...p, show_dashboard: opt.val }))}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${presetForm.show_dashboard === opt.val ? '#22c55e' : '#334155'}`, background: presetForm.show_dashboard === opt.val ? '#052e16' : '#1e293b', color: presetForm.show_dashboard === opt.val ? '#86efac' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: presetForm.show_dashboard === opt.val ? 'bold' : 'normal' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748b' }}>כשמופעל, כפתור 📊 דש בורד יופיע לכל מי שנכנס לעמדה זו (גם ללא הרשאת מנהל).</p>
                </div>}

                {/* Flight Zones Mode toggle */}
                {presetForm.map_id && (
                  <div style={{ marginTop: '15px', padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#7dd3fc', fontSize: '14px', fontWeight: 'bold' }}>✈️ מצב אזורי טיסה:</label>
                    <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                      {([{ val: true, label: '✅ פעיל — הקצאת פממים לאזורים' }, { val: false, label: '🚫 כבוי' }] as { val: boolean; label: string }[]).map(opt => (
                        <button key={String(opt.val)} type="button"
                          onClick={() => setPresetForm(p => ({ ...p, flight_zones_mode: opt.val }))}
                          style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${presetForm.flight_zones_mode === opt.val ? '#0ea5e9' : '#334155'}`, background: presetForm.flight_zones_mode === opt.val ? '#0c2a40' : '#1e293b', color: presetForm.flight_zones_mode === opt.val ? '#7dd3fc' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: presetForm.flight_zones_mode === opt.val ? 'bold' : 'normal' }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#64748b' }}>כשמופעל, לוח המפה מציג אזורים בלתי נראים — ניתן לגרור פממים ישירות אליהם. כל פ"מ מקבל אזור + טווח גובה + סטטוס.</p>
                  </div>
                )}

                {/* fz_pin_display toggle — only when flight_zones_mode is active */}
                {presetForm.flight_zones_mode && presetForm.map_id && (
                  <div style={{ marginTop: '10px', padding: '12px', background: '#0f1a2a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#7dd3fc', fontSize: '13px', fontWeight: 'bold' }}>🛩️ תצוגת פינים על מפה:</label>
                    <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                      {([{ val: 'strip', label: '📋 סטריפ (כרטיסייה)' }, { val: 'icon', label: '✈️ אייקון מטוס' }] as { val: string; label: string }[]).map(opt => (
                        <button key={opt.val} type="button"
                          onClick={() => setPresetForm(p => ({ ...p, fz_pin_display: opt.val }))}
                          style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${(presetForm as any).fz_pin_display === opt.val ? '#0ea5e9' : '#334155'}`, background: (presetForm as any).fz_pin_display === opt.val ? '#0c2a40' : '#1e293b', color: (presetForm as any).fz_pin_display === opt.val ? '#7dd3fc' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: (presetForm as any).fz_pin_display === opt.val ? 'bold' : 'normal' }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748b' }}>סטריפ — כרטיסייה עם אות זיהוי ומצב. אייקון — סמל מטוס/מסוק לפי סוג המטוס, ממורכז בנקודת הנחיתה.</p>
                  </div>
                )}

                {/* suggest_alt_range toggle */}
                {(presetForm.block_table_ids?.length > 0) && (
                  <div style={{ marginTop: '15px', padding: '12px', background: '#0f1a0f', borderRadius: '8px', border: '1px solid #14532d' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#86efac', fontSize: '14px', fontWeight: 'bold' }}>📐 הצעת טווח בלוק גבהים:</label>
                    <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                      {([{ val: true, label: '✅ פעיל — הצעה לפי מספר מטוסים' }, { val: false, label: '⬜ כבוי' }] as { val: boolean; label: string }[]).map(opt => (
                        <button key={String(opt.val)} type="button"
                          onClick={() => setPresetForm(p => ({ ...p, suggest_alt_range: opt.val }))}
                          style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${presetForm.suggest_alt_range === opt.val ? '#22c55e' : '#334155'}`, background: presetForm.suggest_alt_range === opt.val ? '#14532d' : '#1e293b', color: presetForm.suggest_alt_range === opt.val ? '#86efac' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: presetForm.suggest_alt_range === opt.val ? 'bold' : 'normal' }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#4ade80' }}>כשמופעל: לאחר הגדרת גובה לפ"מ עם 3+ מטוסים — המערכת מציעה טווח בלוק פנוי (+1000 רגל לכל זוג מטוסים מעבר לשניים). בלילה: הפרדה של 2000 רגל מפממים סמוכים.</p>
                  </div>
                )}

                {/* show_full_picture toggle */}
                {!!presetForm.table_mode_id && (
                  <div style={{ marginTop: '15px', padding: '12px', background: '#1a1a2e', borderRadius: '8px', border: '1px solid #7c3aed' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#c4b5fd', fontSize: '14px', fontWeight: 'bold' }}>🌐 כפתור "הצג לי את כל המכלול":</label>
                    <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                      {([{ val: true, label: '✅ פעיל — מופיע כפתור בכותרת העמדה' }, { val: false, label: '⬜ כבוי' }] as { val: boolean; label: string }[]).map(opt => (
                        <button key={String(opt.val)} type="button"
                          onClick={() => setPresetForm(p => ({ ...p, show_full_picture: opt.val }))}
                          style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${(presetForm as any).show_full_picture === opt.val ? '#7c3aed' : '#334155'}`, background: (presetForm as any).show_full_picture === opt.val ? '#2e1065' : '#1e293b', color: (presetForm as any).show_full_picture === opt.val ? '#c4b5fd' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: (presetForm as any).show_full_picture === opt.val ? 'bold' : 'normal' }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#a78bfa' }}>כשמופעל, מופיע בעמדה כפתור "🌐 כל המכלול" (במוד טבלה בלבד). לחיצה עליו מציגה את כל הפ"מ של כלל עמדות קבוצת העבודה.</p>
                  </div>
                )}

                {/* use_map_zones toggle */}
                <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>🧭 התחשב באזורים על מפה:</label>
                  <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                    {[{ val: true, label: '✅ פעיל' }, { val: false, label: '⬜ כבוי' }].map(opt => (
                      <button key={String(opt.val)} type="button"
                        onClick={() => setPresetForm(p => ({ ...p, use_map_zones: opt.val }))}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${(presetForm as any).use_map_zones === opt.val ? '#22c55e' : '#334155'}`, background: (presetForm as any).use_map_zones === opt.val ? '#14532d' : '#1e293b', color: (presetForm as any).use_map_zones === opt.val ? '#86efac' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: (presetForm as any).use_map_zones === opt.val ? 'bold' : 'normal' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#64748b' }}>כשמופעל, כל פ"מ שמונח על המפה מקבל אזור אוטומטי לפי מיקום הנחיתה. פין מקשר בין הסטריפ לנקודת ההנחה.</p>
                </div>

                {/* blind_map_default toggle */}
                {presetForm.map_id && (
                  <div style={{ marginTop: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>🙈 מפה עיוורת כברירת מחדל:</label>
                    <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                      {[{ val: true, label: '✅ פעיל' }, { val: false, label: '⬜ כבוי' }].map(opt => (
                        <button key={String(opt.val)} type="button"
                          onClick={() => setPresetForm(p => ({ ...p, blind_map_default: opt.val }))}
                          style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${(presetForm as any).blind_map_default === opt.val ? '#0d9488' : '#334155'}`, background: (presetForm as any).blind_map_default === opt.val ? '#0d3b38' : '#1e293b', color: (presetForm as any).blind_map_default === opt.val ? '#2dd4bf' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: (presetForm as any).blind_map_default === opt.val ? 'bold' : 'normal' }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#64748b' }}>כשמופעל, העמדה תיפתח במצב מפה עיוורת — רקע המפה מוסתר, ורק קווי המתאר של האזורים מוצגים.</p>
                  </div>
                )}

                {/* Dual Map Mode */}
                {(presetForm.preset_type === 'normal' || !presetForm.preset_type) && presetForm.map_id && (
                  <div style={{ marginTop: '15px', padding: '12px', background: '#0d1f35', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#7dd3fc', fontSize: '14px', fontWeight: 'bold' }}>🗺🗺 מצב שתי מפות:</label>
                    <div style={{ display: 'flex', gap: '8px', direction: 'rtl', marginBottom: '10px' }}>
                      {[{ val: true, label: '✅ פעיל' }, { val: false, label: '⬜ כבוי' }].map(opt => (
                        <button key={String(opt.val)} type="button"
                          onClick={() => setPresetForm(p => ({ ...p, dual_map_mode: opt.val }))}
                          style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${(presetForm as any).dual_map_mode === opt.val ? '#0ea5e9' : '#334155'}`, background: (presetForm as any).dual_map_mode === opt.val ? '#0c2a40' : '#1e293b', color: (presetForm as any).dual_map_mode === opt.val ? '#7dd3fc' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: (presetForm as any).dual_map_mode === opt.val ? 'bold' : 'normal' }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {(presetForm as any).dual_map_mode && (<>
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '13px' }}>מפה שנייה:</label>
                        <select value={(presetForm as any).map2_id} onChange={e => setPresetForm(p => ({ ...p, map2_id: e.target.value }))}
                          style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl' }}>
                          <option value="">— בחר מפה שנייה —</option>
                          {maps.filter(m => m.id !== Number(presetForm.map_id)).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '13px' }}>פריסה:</label>
                        <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                          {[{ val: 'side-by-side', label: '◫ זו לצד זו' }, { val: 'stacked', label: '⬓ זו מעל זו' }].map(opt => (
                            <button key={opt.val} type="button"
                              onClick={() => setPresetForm(p => ({ ...p, dual_map_layout: opt.val }))}
                              style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: `1px solid ${(presetForm as any).dual_map_layout === opt.val ? '#0ea5e9' : '#334155'}`, background: (presetForm as any).dual_map_layout === opt.val ? '#0c2a40' : '#1e293b', color: (presetForm as any).dual_map_layout === opt.val ? '#7dd3fc' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: (presetForm as any).dual_map_layout === opt.val ? 'bold' : 'normal' }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '13px' }}>חלוקה ראשונית — מפה ראשית: <strong style={{ color: '#7dd3fc' }}>{(presetForm as any).dual_map_split}%</strong></label>
                        <input type="range" min={20} max={80} step={5} value={(presetForm as any).dual_map_split}
                          onChange={e => setPresetForm(p => ({ ...p, dual_map_split: parseInt(e.target.value) }))}
                          style={{ width: '100%', accentColor: '#0ea5e9', height: 14 }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                          <span>20%</span><span>50%</span><span>80%</span>
                        </div>
                      </div>
                      <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#64748b' }}>ניתן לשנות את גודל החלוניות בזמן אמת על-ידי גרירת המחיצה ביניהן.</p>
                    </>)}
                  </div>
                )}

                <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>תצוגה וורטיקלית — ציר זמן:</label>
                  <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
                    {[{ val: true, label: '⏱ לפי זמן' }, { val: false, label: '📊 ללא זמן' }].map(opt => (
                      <button key={String(opt.val)} type="button"
                        onClick={() => setPresetForm(p => ({ ...p, vertical_time_based: opt.val }))}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${presetForm.vertical_time_based === opt.val ? '#6366f1' : '#334155'}`, background: presetForm.vertical_time_based === opt.val ? '#1e1b4b' : '#1e293b', color: presetForm.vertical_time_based === opt.val ? '#a5b4fc' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: presetForm.vertical_time_based === opt.val ? 'bold' : 'normal' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '11px', direction: 'rtl' }}>
                    {presetForm.vertical_time_based
                      ? 'כל פ"מ ממוקם על ציר הזמן לפי שעת ה מראה / זמ"מ'
                      : 'כל פ"מ מוצג ברוחב מלא — פממים חופפים מוצגים זה לצד זה'}
                  </p>
                </div>

                {/* Altitude range */}
                <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>טווח גובה מינימלי לתצוגת בלוקים (FL):</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', direction: 'rtl' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>מינימום (FL)</span>
                      <input type="number" placeholder="ריק = אוטומטי"
                        value={presetForm.view_alt_min}
                        onChange={e => setPresetForm(p => ({ ...p, view_alt_min: e.target.value }))}
                        style={{ width: '120px', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl' }}
                      />
                    </div>
                    <span style={{ color: '#64748b', fontSize: '16px', marginTop: '16px' }}>—</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>מקסימום (FL)</span>
                      <input type="number" placeholder="ריק = אוטומטי"
                        value={presetForm.view_alt_max}
                        onChange={e => setPresetForm(p => ({ ...p, view_alt_max: e.target.value }))}
                        style={{ width: '120px', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl' }}
                      />
                    </div>
                  </div>
                  <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '11px', direction: 'rtl' }}>
                    הטווח המינימלי שיוצג תמיד בתצוגת הבלוקים, גם אם אין פממים בגבהים אלו. לחיצות + / - לא יצמצמו מתחת לטווח זה.
                  </p>
                </div>

                {/* Classic / Complex display mode — only shown for normal (non-classic, non-ground) type */}
                {presetForm.preset_type !== 'classic' && presetForm.preset_type !== 'ground' && <div style={{ marginTop: '20px', padding: '14px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <label style={{ display: 'block', marginBottom: '10px', color: '#94a3b8', fontSize: '14px', fontWeight: 'bold' }}>🖥️ מצב תצוגת עמדה:</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    {[{ val: 'complex', label: 'מפה / טבלה' }, { val: 'classic', label: 'סטריפים קלאסי' }].map(opt => (
                      <button key={opt.val} onClick={() => setPresetForm(p => ({ ...p, display_mode: opt.val }))}
                        style={{ padding: '7px 18px', borderRadius: '6px', border: `1px solid ${presetForm.display_mode === opt.val ? '#6366f1' : '#334155'}`, background: presetForm.display_mode === opt.val ? '#1e1b4b' : '#1e293b', color: presetForm.display_mode === opt.val ? '#a5b4fc' : '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: presetForm.display_mode === opt.val ? 'bold' : 'normal' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {presetForm.display_mode === 'classic' && (
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', color: '#94a3b8', fontSize: '13px' }}>תבנית עיצוב סטריפ:</label>
                      <select value={presetForm.classic_strip_table_id}
                        onChange={e => setPresetForm(p => ({ ...p, classic_strip_table_id: e.target.value }))}
                        style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl', width: '100%' }}>
                        <option value="">— ללא תבנית —</option>
                        {classicTables.map((ct: any) => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                      </select>
                      {classicTables.length === 0 && <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#ef4444' }}>צור תבנית בלשונית "תצוגת סטריפים קלאסית"</p>}
                    </div>
                  )}
                </div>}

                {/* Classic partners & sector points editor — only for classic strips workstations */}
                {(presetForm.preset_type === 'classic' || presetForm.display_mode === 'classic') && (
                  <div style={{ marginTop: '20px', padding: '14px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                    <label style={{ display: 'block', marginBottom: '10px', color: '#93c5fd', fontSize: '14px', fontWeight: 'bold' }}>🔗 שותפות וקשרי סקטור (סטריפים קלאסי):</label>
                    <ClassicPartnersAndPointsEditor
                      presetForm={presetForm}
                      setPresetForm={setPresetForm}
                      presets={presets}
                      sectors={sectors}
                      editingPresetId={editingPreset?.id}
                      onShowHelp={() => {}}
                    />
                  </div>
                )}

                {presetForm.preset_type !== 'ground_mgmt' && blockTables.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>טבלאות בלוקים רלוונטיות לעמדה:</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {blockTables.map((bt: any) => {
                        const space = blockSpaces.find((bs: any) => bs.id === bt.block_space_id);
                        const isSelected = presetForm.block_table_ids.includes(bt.id);
                        return (
                          <button key={bt.id} type="button"
                            onClick={() => setPresetForm(p => ({ ...p, block_table_ids: isSelected ? p.block_table_ids.filter(id => id !== bt.id) : [...p.block_table_ids, bt.id] }))}
                            style={{ padding: '5px 12px', borderRadius: '6px', border: `1px solid ${isSelected ? '#8b5cf6' : '#334155'}`, background: isSelected ? '#5b21b6' : '#1e293b', color: isSelected ? 'white' : '#94a3b8', cursor: 'pointer', fontSize: '12px', fontWeight: isSelected ? 'bold' : 'normal' }}>
                            {isSelected ? '✓ ' : ''}{bt.name}{space ? ` (${space.name})` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!(presetForm as any).strip_window_id && <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>נקודות העברה (לחץ לבחירה):</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {sectors.map(sector => {
                      const isSelected = presetForm.relevant_sectors.includes(sector.id);
                      return (
                        <button
                          key={sector.id}
                          onClick={() => toggleSectorSelection(sector.id)}
                          style={{
                            padding: '8px 16px',
                            border: isSelected ? '2px solid #3b82f6' : '2px solid #475569',
                            borderRadius: '20px',
                            background: isSelected ? '#1e40af' : '#334155',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '13px',
                            transition: 'all 0.2s'
                          }}
                        >
                          {sector.label_he || sector.name}
                          {sector.category && <span style={{ color: '#94a3b8', marginRight: '6px' }}>({sector.category})</span>}
                        </button>
                      );
                    })}
                    {sectors.length === 0 && (
                      <span style={{ color: '#64748b', fontSize: '14px' }}>אין נקודות העברה מוגדרות. הוסף נקודות בלשונית "נקודות העברה".</span>
                    )}
                  </div>
                </div>}

                {/* Per-sector alt conditions — all non-Classic preset types */}
                {presetForm.preset_type !== 'classic' && presetForm.relevant_sectors.length > 0 && (
                  <div style={{ marginTop: '14px', padding: '10px 14px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                    <label style={{ display: 'block', marginBottom: '6px', color: '#fbbf24', fontSize: '13px', fontWeight: 'bold' }}>📐 תנאי גובה/זוגיות לנקודות העברה:</label>
                    <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#64748b', direction: 'rtl' }}>ניתן להגדיר גובה מינ'/מקס' וזוגיות לכל נקודת העברה — יוצגו בפאנל הנקודות בזמן תפעול.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {presetForm.relevant_sectors.map((sid: number) => {
                        const sec = sectors.find((s: any) => s.id === sid);
                        if (!sec) return null;
                        const xferPts: any[] = presetForm.classic_transfer_points || [];
                        const pt = xferPts.find((p: any) => Number(p.sector_id) === sid) || { sector_id: sid, alt_min: null, alt_max: null, parity: 'any' };
                        const updatePt = (patch: any) => {
                          const next = xferPts.filter((p: any) => Number(p.sector_id) !== sid);
                          const merged = { ...pt, ...patch };
                          const isEmpty = merged.alt_min == null && merged.alt_max == null && (!merged.parity || merged.parity === 'any');
                          setPresetForm(prev => ({ ...prev, classic_transfer_points: isEmpty ? next : [...next, merged] }));
                        };
                        return (
                          <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: '8px', direction: 'rtl', padding: '5px 8px', background: '#0a1628', borderRadius: '6px', border: '1px solid #1e3a5f', flexWrap: 'wrap' }}>
                            <span style={{ color: '#93c5fd', fontSize: '12px', fontWeight: 'bold', minWidth: '80px' }}>{sec.label_he || sec.name}</span>
                            <span style={{ color: '#64748b', fontSize: '11px' }}>גובה מינ':</span>
                            <input type="number" placeholder="—" value={pt.alt_min ?? ''}
                              onChange={e => updatePt({ alt_min: e.target.value !== '' ? Number(e.target.value) : null })}
                              style={{ width: '58px', padding: '3px 5px', background: '#0f172a', border: '1px solid #92400e', borderRadius: '4px', color: '#fbbf24', fontSize: '11px', textAlign: 'center' }} />
                            <span style={{ color: '#64748b', fontSize: '11px' }}>מקס':</span>
                            <input type="number" placeholder="—" value={pt.alt_max ?? ''}
                              onChange={e => updatePt({ alt_max: e.target.value !== '' ? Number(e.target.value) : null })}
                              style={{ width: '58px', padding: '3px 5px', background: '#0f172a', border: '1px solid #92400e', borderRadius: '4px', color: '#fbbf24', fontSize: '11px', textAlign: 'center' }} />
                            <span style={{ color: '#64748b', fontSize: '11px' }}>זוגיות:</span>
                            <select value={pt.parity || 'any'} onChange={e => updatePt({ parity: e.target.value })}
                              style={{ padding: '3px 5px', background: '#0f172a', border: '1px solid #92400e', borderRadius: '4px', color: '#fbbf24', fontSize: '11px' }}>
                              <option value="any">כולם</option>
                              <option value="even">זוגי</option>
                              <option value="odd">אי-זוגי</option>
                            </select>
                            {(pt.alt_min != null || pt.alt_max != null || (pt.parity && pt.parity !== 'any')) && (
                              <button type="button" onClick={() => updatePt({ alt_min: null, alt_max: null, parity: 'any' })}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: '0 2px' }}>✕</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Filter Query Builder */}
                <QueryBuilder
                  value={presetForm.filter_query}
                  onChange={q => setPresetForm(p => ({ ...p, filter_query: q }))}
                  label='שאילתת סינון פממים לעמדה'
                  presetNames={(presets || []).map((p: any) => p.name || p.preset_name).filter(Boolean)}
                />

                {/* Links Section — only when editing existing preset */}
                {editingPreset && (
                  <div style={{ marginTop: '20px', borderTop: '1px solid #334155', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <label style={{ color: '#a78bfa', fontSize: '14px', fontWeight: 'bold' }}>🔗 קישורים</label>
                      <button type="button" onClick={() => { setShowAddLinkForm(v => !v); setNewLinkForm({ url: '', name: '', category: '', note: '' }); }}
                        style={{ background: '#5b21b6', color: 'white', border: 'none', borderRadius: '5px', padding: '4px 14px', fontSize: '12px', cursor: 'pointer' }}>
                        {showAddLinkForm ? 'ביטול' : '+ קישור חדש'}
                      </button>
                    </div>
                    {showAddLinkForm && (
                      <div style={{ background: '#1e1b4b', border: '1px solid #4c1d95', borderRadius: '7px', padding: '12px', marginBottom: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>שם קישור:</label>
                            <input value={newLinkForm.name} onChange={e => setNewLinkForm(v => ({...v, name: e.target.value}))}
                              placeholder="שם..." style={{ width: '100%', padding: '6px 8px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '4px', fontSize: '13px', direction: 'rtl', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>קטגוריה:</label>
                            <input value={newLinkForm.category} onChange={e => setNewLinkForm(v => ({...v, category: e.target.value}))}
                              placeholder="קטגוריה..." style={{ width: '100%', padding: '6px 8px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '4px', fontSize: '13px', direction: 'rtl', boxSizing: 'border-box' }} />
                          </div>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                          <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>כתובת URL:</label>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input value={newLinkForm.url} onChange={e => setNewLinkForm(v => ({...v, url: e.target.value}))}
                              placeholder="https://..." style={{ flex: 1, padding: '6px 8px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '4px', fontSize: '13px', direction: 'ltr', boxSizing: 'border-box' }} />
                          </div>
                        </div>
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>הערה:</label>
                          <input value={newLinkForm.note} onChange={e => setNewLinkForm(v => ({...v, note: e.target.value}))}
                            placeholder="הערה..." style={{ width: '100%', padding: '6px 8px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '4px', fontSize: '13px', direction: 'rtl', boxSizing: 'border-box' }} />
                        </div>
                        <button type="button" disabled={!newLinkForm.name.trim() || !newLinkForm.url.trim()} onClick={async () => {
                          await fetch(`${API_URL}/preset-links/${editingPreset.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newLinkForm, sort_order: editingPresetLinks.length }) });
                          setNewLinkForm({ url: '', name: '', category: '', note: '' });
                          setShowAddLinkForm(false);
                          loadPresetLinks(editingPreset.id);
                        }} style={{ background: newLinkForm.name.trim() && newLinkForm.url.trim() ? '#5b21b6' : '#334155', color: 'white', border: 'none', borderRadius: '5px', padding: '6px 18px', fontSize: '13px', cursor: 'pointer' }}>הוסף קישור</button>
                      </div>
                    )}
                    {editingPresetLinks.length === 0 && !showAddLinkForm && (
                      <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', padding: '8px 0' }}>אין קישורים מוגדרים לעמדה זו</div>
                    )}
                    {editingPresetLinks.map((link: any) => (
                      <div key={link.id} style={{ background: '#0f172a', border: '1px solid #4c1d95', borderRadius: '6px', padding: '8px 10px', marginBottom: '5px', direction: 'rtl' }}>
                        {editingLinkId === link.id ? (
                          <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                              <input value={editLinkForm.name} onChange={e => setEditLinkForm(v => ({...v, name: e.target.value}))}
                                placeholder="שם" style={{ padding: '4px 7px', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box' }} />
                              <input value={editLinkForm.category} onChange={e => setEditLinkForm(v => ({...v, category: e.target.value}))}
                                placeholder="קטגוריה" style={{ padding: '4px 7px', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box' }} />
                            </div>
                            <input value={editLinkForm.url} onChange={e => setEditLinkForm(v => ({...v, url: e.target.value}))}
                              placeholder="URL" style={{ width: '100%', padding: '4px 7px', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px', direction: 'ltr', boxSizing: 'border-box', marginBottom: '6px' }} />
                            <input value={editLinkForm.note} onChange={e => setEditLinkForm(v => ({...v, note: e.target.value}))}
                              placeholder="הערה" style={{ width: '100%', padding: '4px 7px', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box', marginBottom: '6px' }} />
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button type="button" onClick={async () => {
                                await fetch(`${API_URL}/preset-links/${link.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editLinkForm) });
                                setEditingLinkId(null);
                                loadPresetLinks(editingPreset.id);
                              }} style={{ background: '#5b21b6', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 12px', fontSize: '11px', cursor: 'pointer' }}>שמור</button>
                              <button type="button" onClick={async () => {
                                if (!await customConfirm('למחוק קישור זה?')) return;
                                await fetch(`${API_URL}/preset-links/${link.id}`, { method: 'DELETE' });
                                loadPresetLinks(editingPreset.id);
                              }} style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '4px', padding: '3px 12px', fontSize: '11px', cursor: 'pointer' }}>מחק</button>
                              <button type="button" onClick={() => setEditingLinkId(null)} style={{ background: '#334155', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}>ביטול</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#a78bfa' }}>{link.name}</span>
                                {link.category && <span style={{ fontSize: '10px', color: '#64748b', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '1px 7px' }}>{link.category}</span>}
                              </div>
                              <div style={{ fontSize: '10px', color: '#6366f1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr', textAlign: 'right' }}>{link.url}</div>
                              {link.note && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{link.note}</div>}
                            </div>
                            <button type="button" onClick={() => { setEditingLinkId(link.id); setEditLinkForm({ url: link.url, name: link.name, category: link.category || '', note: link.note || '' }); }}
                              style={{ background: 'transparent', color: '#a78bfa', border: '1px solid #4c1d95', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>✎</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}


                <div style={{ display: 'flex', gap: '10px', marginTop: '20px', alignItems: 'center' }}>
                  <button
                    onClick={savePreset}
                    disabled={!presetIsDirty}
                    style={{ padding: '10px 25px', background: presetIsDirty ? '#059669' : '#1e3a2a', color: presetIsDirty ? 'white' : '#4ade80', border: `1px solid ${presetIsDirty ? '#059669' : '#166534'}`, borderRadius: '6px', cursor: presetIsDirty ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 'bold', opacity: presetIsDirty ? 1 : 0.5, transition: 'all 0.2s' }}
                  >
                    {editingPreset ? '💾 עדכון' : '✅ הוספה'}
                  </button>
                  {presetSaveSuccess && (
                    <span style={{ color: '#4ade80', fontSize: '14px', fontWeight: 'bold', animation: 'fadeIn 0.3s' }}>✓ נשמר בהצלחה</span>
                  )}
                  <button
                    onClick={() => { setEditingPreset(null); setShowNewPresetModal(false); setPresetFormInitial(null); setPresetForm({ name: '', map_id: '', relevant_sectors: [], table_mode_id: '', partial_load: 3, full_load: 5, conflict_alt_delta: 500, relevant_control_stations: [], filter_query: null, block_table_ids: [], vertical_time_based: true, view_alt_min: '', view_alt_max: '', display_mode: 'complex', classic_strip_table_id: '', classic_strip_table_id_night: '', classic_receive_points: [], classic_transfer_points: [], preset_type: 'normal', airfield_id: '', classic_partner_preset_ids: [], classic_incoming_partner_preset_ids: [], classic_outgoing_partner_preset_ids: [], show_serials: true, allow_view_switching: true, show_base_statuses: false, base_status_ids: [], preset_role: '', parent_base_id: '', can_update_pressure: false, show_dashboard: false, flight_zones_mode: false, fz_pin_display: 'strip', datk_show_minutes: '', can_update_mazaa: false, mazaa_update_base_id: '', can_update_atis: false, can_update_notam: false, use_map_zones: false, civilian_columns: [], civilian_board_bg: '', dual_map_mode: false, map2_id: '', dual_map_layout: 'side-by-side', dual_map_split: 50, suggest_alt_range: false, show_full_picture: false, blind_map_default: false, conflict_alt_rules: [] }); }}
                    style={{ padding: '10px 25px', background: '#475569', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
                  >
                    ביטול
                  </button>
                </div>
              </div>
              </MaybeSettingsModal>}
              
              {/* Presets List — grouped by role */}
              {presets.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
                  אין עמדות מוגדרות. הוסף עמדה חדשה למעלה.
                </div>
              ) : (
                <>
                  {[
                    { role: 'yaba',  label: '📡 עמדות יב"א',  color: '#fbbf24', border: '#92400e' },
                    { role: 'tower', label: '🗼 עמדות מגדל',  color: '#7dd3fc', border: '#1e3a5f' },
                    { role: null,    label: '⚙️ עמדות כלליות', color: '#94a3b8', border: '#1e293b' },
                  ].map(group => {
                    const groupPresets = presets.filter((p: any) =>
                      group.role === null
                        ? !p.preset_role || (p.preset_role !== 'yaba' && p.preset_role !== 'tower')
                        : p.preset_role === group.role
                    );
                    if (groupPresets.length === 0) return null;
                    return (
                      <div key={group.role ?? 'general'} style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: group.color, padding: '6px 10px', background: '#0a0f1a', borderRadius: '6px', borderRight: `3px solid ${group.color}`, marginBottom: '8px' }}>
                          {group.label}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {groupPresets.map((preset: any) => {
                            const relevantSectorNames = (preset.relevant_sectors || [])
                              .map((id: number) => sectors.find(s => s.id === id)?.label_he || sectors.find(s => s.id === id)?.name)
                              .filter(Boolean)
                              .join(', ');
                            return (
                              <div key={preset.id} style={{ background: '#0f172a', borderRadius: '8px', padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRight: `2px solid ${group.border}` }}>
                                <div>
                                  <strong style={{ fontSize: '16px' }}>{preset.name}</strong>
                                  <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
                                    מפה: {maps.find(m => m.id === preset.map_id)?.name || 'לא מוגדר'}
                                    {relevantSectorNames && ` | נקודות העברה: ${relevantSectorNames}`}
                                    {preset.table_mode_id && ` | טבלה: ${tableModes.find(tm => tm.id === preset.table_mode_id)?.name || '#' + preset.table_mode_id}`}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={() => editPreset(preset)} style={{ padding: '6px 15px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>עריכה</button>
                                  <button onClick={() => duplicatePreset(preset)} style={{ padding: '6px 15px', background: '#0f766e', color: '#99f6e4', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>⧉ שכפל</button>
                                  <button onClick={() => deletePreset(preset.id)} style={{ padding: '6px 15px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>מחיקה</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Sectors Tab */}
          {activeTab === 'sectors' && (
            <div>
              <h2 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>ניהול נקודות העברה</h2>
              
              {/* Sector Form */}
              <MaybeSettingsModal
                show={!!editingSector}
                title={`עריכת נקודת העברה: ${editingSector?.label_he || editingSector?.name || ''}`}
                onClose={() => { setEditingSector(null); setSectorForm({ name: '', label_he: '', category: '', notes: '', conflict_alt_delta: 500 }); }}
              >
              <div style={{ background: editingSector ? 'transparent' : '#0f172a', borderRadius: '8px', padding: editingSector ? '0' : '20px', marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#94a3b8' }}>
                  {editingSector ? 'עריכת נקודת העברה' : 'נקודת העברה חדשה'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>קוד:</label>
                    <input
                      type="text"
                      value={sectorForm.name}
                      onChange={(e) => setSectorForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="NORTH"
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>שם בעברית:</label>
                    <input
                      type="text"
                      value={sectorForm.label_he}
                      onChange={(e) => setSectorForm(f => ({ ...f, label_he: e.target.value }))}
                      placeholder="צפון"
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>קטגוריה:</label>
                    <input
                      type="text"
                      value={sectorForm.category}
                      onChange={(e) => setSectorForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="למשל: מרחב, גישה, מסלול..."
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>הערות (להעברת מידע בין עמדות):</label>
                  <textarea
                    value={sectorForm.notes}
                    onChange={(e) => setSectorForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="לדוגמה: זוגי צפוני, אי-זוגי דרומה..."
                    rows={3}
                    style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>
                <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: '#f472b6', fontSize: '14px' }}>⚠️ סף קונפליקט גובה (רגליים):</label>
                  <input
                    type="number"
                    min="0"
                    max="99000"
                    step="100"
                    value={sectorForm.conflict_alt_delta}
                    onChange={(e) => setSectorForm(f => ({ ...f, conflict_alt_delta: Math.max(0, parseInt(e.target.value) || 0) }))}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ec4899', borderRadius: '6px', background: '#1e293b', color: '#f472b6', fontSize: '16px', fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box' }}
                  />
                  <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '11px', direction: 'rtl' }}>
                    ערך ישיר ברגליים. לדוגמה: 1000 = ±1000 רגל. גבהים בפממים הם ב-100-רגל (200 = 20,000 רגל). 0 = כבוי.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                  <button
                    onClick={saveSector}
                    style={{ padding: '10px 25px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                  >
                    {editingSector ? 'עדכון' : 'הוספה'}
                  </button>
                  {editingSector && (
                    <button
                      onClick={() => { setEditingSector(null); setSectorForm({ name: '', label_he: '', category: '', notes: '', conflict_alt_delta: 500 }); }}
                      style={{ padding: '10px 25px', background: '#475569', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
                    >
                      ביטול
                    </button>
                  )}
                </div>
              </div>
              </MaybeSettingsModal>
              
              {/* Sectors List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sectors.map(sector => {
                  const sid = Number(sector.id);
                  const recvPresets = presets.filter((p: any) => (Array.isArray(p.classic_receive_points) ? p.classic_receive_points : []).some((pt: any) => Number(pt.sector_id) === sid));
                  const xferPresets = presets.filter((p: any) => (Array.isArray(p.classic_transfer_points) ? p.classic_transfer_points : []).some((pt: any) => Number(pt.sector_id) === sid));
                  const relPresets = presets.filter((p: any) => {
                    const rs = Array.isArray(p.relevant_sectors) ? p.relevant_sectors : [];
                    return rs.map(Number).includes(sid);
                  }).filter((p: any) => !recvPresets.some((rp: any) => rp.id === p.id) && !xferPresets.some((xp: any) => xp.id === p.id));
                  const hasAny = recvPresets.length > 0 || xferPresets.length > 0 || relPresets.length > 0;
                  return (
                  <div key={sector.id} style={{ background: '#0f172a', borderRadius: '8px', padding: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <strong style={{ fontSize: '16px' }}>{sector.label_he || sector.name}</strong>
                          <span style={{ color: '#64748b', fontSize: '14px' }}>({sector.name})</span>
                          {sector.category && (
                            <span style={{ background: '#7c3aed', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{sector.category}</span>
                          )}
                        </div>
                        {/* Workstations using this sector */}
                        {hasAny ? (
                          <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                            <span style={{ color: '#475569', fontSize: '11px' }}>עמדות:</span>
                            {recvPresets.map((p: any) => (
                              <span key={`recv-${p.id}`} title="נקודת קבלה (סטריפים קלאסי)" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', background: '#052e16', border: '1px solid #166534', borderRadius: '10px', fontSize: '11px', color: '#86efac' }}>
                                📥 {p.name}
                              </span>
                            ))}
                            {xferPresets.map((p: any) => (
                              <span key={`xfer-${p.id}`} title="נקודת העברה (סטריפים קלאסי)" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', background: '#422006', border: '1px solid #92400e', borderRadius: '10px', fontSize: '11px', color: '#fcd34d' }}>
                                📤 {p.name}
                              </span>
                            ))}
                            {relPresets.map((p: any) => (
                              <span key={`rel-${p.id}`} title="נקודת העברה רלוונטית (עמדת מפה/טבלה)" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', fontSize: '11px', color: '#94a3b8' }}>
                                📍 {p.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div style={{ marginTop: '6px' }}>
                            <span style={{ color: '#374151', fontSize: '11px', fontStyle: 'italic' }}>לא בשימוש באף עמדה</span>
                          </div>
                        )}
                        {sector.notes && (
                          <div style={{ marginTop: '8px', padding: '10px', background: '#1e293b', borderRadius: '6px', color: '#94a3b8', fontSize: '13px', borderRight: '3px solid #f59e0b' }}>
                            {sector.notes}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginRight: '15px' }}>
                        <button onClick={() => editSector(sector)} style={{ padding: '6px 15px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>עריכה</button>
                        <button onClick={() => deleteSector(sector.id)} style={{ padding: '6px 15px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>מחיקה</button>
                      </div>
                    </div>
                  </div>
                  );
                })}
                {sectors.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
                    אין נקודות העברה מוגדרות. הוסף נקודה חדשה למעלה.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Maps Tab */}
          {activeTab === 'maps' && (
            <MapsManager onClose={() => {}} onMapsUpdated={loadData} isEmbedded={true} />
          )}

          {/* Strips Tab */}
          {activeTab === 'strips' && (
            <div>
              {/* ── Strip List ── */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>רשימת פ"ממ ({globalStrips.length})</h2>
                  <button
                    onClick={() => { setShowNewStripForm(true); setEditingStripId(null); setNewStripForm({ callSign: '', sq: '', numberOfFormation: '', alt: '', task: '', takeoff_time: '', koteret: '', mivtza: '', tzevet_shilta: '', ta_shilta: '' }); }}
                    style={{ padding: '6px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                  >+ פמם חדש</button>
                  <button onClick={loadGlobalStrips} style={{ padding: '6px 12px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>⟳ רענן</button>
                  <button
                    onClick={async () => {
                      if (!await customConfirm('לעדכן את תאריך כל זמני ההמראה להיום (ולשמור את השעה)?')) return;
                      const res = await fetch(`${API_URL}/strips/update-takeoff-to-today`, { method: 'PUT' });
                      if (res.ok) {
                        const { updated } = await res.json();
                        await loadGlobalStrips();
                        alert(`✅ עודכנו ${updated} פ"ממ להיום`);
                      } else {
                        alert('שגיאה בעדכון זמנים');
                      }
                    }}
                    style={{ padding: '6px 14px', background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f6', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                  >📅 עדכן להיום</button>
                  <button
                    onClick={async () => {
                      if (!await customConfirm('לצור מטוסים לכל הפ"ממ לפי כמות המטוסים שלהם (כיפות ודת"קים אקראיים)?')) return;
                      const res = await fetch(`${API_URL}/strip-aircraft/ensure-all`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ randomize: true }),
                      });
                      if (res.ok) {
                        const { strips, aircraft } = await res.json();
                        alert(`✅ נוצרו ${aircraft} מטוסים ב-${strips} פ"ממ`);
                      } else {
                        alert('שגיאה ביצירת מטוסים');
                      }
                    }}
                    style={{ padding: '6px 14px', background: '#3b0764', color: '#d8b4fe', border: '1px solid #7c3aed', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                  >✈ מטוסים לכולם</button>
                  <input
                    value={stripsSearch}
                    onChange={e => setStripsSearch(e.target.value)}
                    placeholder="חיפוש לפי קריאה / טייסת / משימה..."
                    style={{ flex: 1, minWidth: '200px', padding: '6px 12px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', fontSize: '13px', direction: 'rtl' }}
                  />
                </div>

                {/* New strip form */}
                {showNewStripForm && (
                  <div style={{ background: '#0f172a', border: '1px solid #22c55e', borderRadius: '8px', padding: '16px', marginBottom: '14px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#22c55e', fontSize: '14px' }}>פמם חדש</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
                      {[
                        { label: 'קריאה *', key: 'callSign' },
                        { label: 'טייסת', key: 'sq' },
                        { label: "מ' מערך", key: 'numberOfFormation' },
                        { label: 'גובה', key: 'alt' },
                        { label: 'משימה', key: 'task' },
                        { label: 'כותרת', key: 'koteret' },
                        { label: 'מבצע', key: 'mivtza' },
                        { label: 'צוות שליטה', key: 'tzevet_shilta' },
                        { label: 'תא שליטה', key: 'ta_shilta' },
                      ].map(({ label, key }) => (
                        <div key={key}>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>{label}</div>
                          <input
                            value={(newStripForm as any)[key]}
                            onChange={e => setNewStripForm(prev => ({ ...prev, [key]: e.target.value }))}
                            style={{ width: '100%', padding: '5px 8px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '4px', fontSize: '13px', direction: 'rtl', boxSizing: 'border-box' }}
                          />
                        </div>
                      ))}
                      <div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>זמן המראה</div>
                        <input
                          type="datetime-local"
                          value={newStripForm.takeoff_time}
                          onChange={e => setNewStripForm(prev => ({ ...prev, takeoff_time: e.target.value }))}
                          style={{ width: '100%', padding: '5px 8px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button
                        onClick={async () => {
                          if (!newStripForm.callSign.trim()) { alert('קריאה חובה'); return; }
                          const takeoff_time = newStripForm.takeoff_time ? new Date(newStripForm.takeoff_time).toISOString() : null;
                          const res = await fetch(`${API_URL}/strips`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newStripForm, takeoff_time }) });
                          if (res.ok) { setShowNewStripForm(false); await loadGlobalStrips(); }
                          else alert('שגיאה ביצירת פמם');
                        }}
                        style={{ padding: '6px 18px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}
                      >שמור</button>
                      <button onClick={() => setShowNewStripForm(false)} style={{ padding: '6px 14px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}>ביטול</button>
                    </div>
                  </div>
                )}

              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #1e293b', margin: '0 0 24px' }} />

              <h2 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>טעינת פממים מקובץ</h2>
              
              <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                <p style={{ color: '#94a3b8', marginBottom: '15px', fontSize: '14px', lineHeight: '1.6' }}>
                  טען פממים מקובץ <strong style={{color:'#60a5fa'}}>Excel (.xlsx)</strong> או <strong style={{color:'#60a5fa'}}>CSV (.csv)</strong>.<br/>
                  <strong>או"ק הוא שדה חד-ערכי - אם קיים פמם עם אותה קריאה, הרשומה תידלג.</strong>
                </p>
                
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  id="csvFileInput"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const parseWeapons = (val: string) => {
                      if (!val || !val.trim()) return [];
                      return val.split(';').map(s => s.trim()).filter(Boolean).map(s => {
                        const parts = s.split(':');
                        return { type: (parts[0] || '').trim(), quantity: (parts[1] || '').trim() };
                      });
                    };
                    const parseTargets = (val: string) => {
                      if (!val || !val.trim()) return [];
                      return val.split(';').map(s => s.trim()).filter(Boolean).map(s => {
                        const parts = s.split(':');
                        return { name: (parts[0] || '').trim(), aim_point: (parts[1] || '').trim() };
                      });
                    };
                    const parseSystems = (val: string) => {
                      if (!val || !val.trim()) return [];
                      return val.split(';').map(s => s.trim()).filter(Boolean).map(s => ({ name: s }));
                    };

                    let rows: Record<string, string>[] = [];

                    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                      const buffer = await file.arrayBuffer();
                      const wb = XLSX.read(buffer, { type: 'array' });
                      const ws = wb.Sheets[wb.SheetNames[0]];
                      rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, string>[];
                    } else {
                      const text = await file.text();
                      const lines = text.split('\n').filter(line => line.trim());
                      if (lines.length < 2) { alert('הקובץ ריק או חסר נתונים'); return; }
                      const headers = lines[0].split(',').map(h => h.trim());
                      rows = lines.slice(1).map(line => {
                        const values = line.split(',').map(v => v.trim());
                        const row: Record<string, string> = {};
                        headers.forEach((h, i) => { row[h] = values[i] || ''; });
                        return row;
                      });
                    }

                    const normalizeKey = (k: string) => k.toLowerCase().replace(/[\s_\-]+/g, '');
                    const getField = (row: Record<string, string>, ...keys: string[]) => {
                      const rowKeys = Object.keys(row);
                      for (const k of keys) {
                        // Exact case-insensitive match first
                        const found = rowKeys.find(rk => rk.toLowerCase() === k.toLowerCase());
                        if (found && row[found] !== undefined && String(row[found]).trim() !== '') return String(row[found]).trim();
                        // Normalized match (ignores spaces, underscores, hyphens)
                        const normK = normalizeKey(k);
                        const foundNorm = rowKeys.find(rk => normalizeKey(rk) === normK);
                        if (foundNorm && row[foundNorm] !== undefined && String(row[foundNorm]).trim() !== '') return String(row[foundNorm]).trim();
                      }
                      return '';
                    };

                    const parseTakeoffDatetime = (dateStr: string, timeStr: string): string | null => {
                      if (!dateStr && !timeStr) return null;
                      let day = '', month = '', year = '', hh = '', mm = '';
                      const d = dateStr.trim();
                      if (d) {
                        if (/^\d{8}$/.test(d)) {
                          if (parseInt(d.slice(0, 4)) > 1900) { year = d.slice(0,4); month = d.slice(4,6); day = d.slice(6,8); }
                          else { day = d.slice(0,2); month = d.slice(2,4); year = d.slice(4,8); }
                        } else if (/^\d{6}$/.test(d)) {
                          day = d.slice(0,2); month = d.slice(2,4); year = '20' + d.slice(4,6);
                        } else {
                          const parts = d.split(/[\/\-\.]/);
                          if (parts.length === 3) {
                            if (parts[0].length === 4) { year = parts[0]; month = parts[1]; day = parts[2]; }
                            else { day = parts[0]; month = parts[1]; year = parts[2].length === 2 ? '20' + parts[2] : parts[2]; }
                          }
                        }
                      }
                      const t = timeStr.trim().replace(/:/g, '');
                      if (t.length >= 4) { hh = t.slice(0,2); mm = t.slice(2,4); }
                      else if (t.length === 3) { hh = '0' + t.slice(0,1); mm = t.slice(1,3); }
                      else if (t.length > 0) { hh = t.padStart(2,'0'); mm = '00'; }
                      if (!year || !month || !day) {
                        const now = new Date();
                        year = year || String(now.getFullYear());
                        month = month || String(now.getMonth() + 1).padStart(2,'0');
                        day = day || String(now.getDate()).padStart(2,'0');
                      }
                      if (!hh) { hh = '00'; mm = '00'; }
                      const dt = new Date(Number(year), Number(month) - 1, Number(day), Number(hh), Number(mm), 0);
                      return isNaN(dt.getTime()) ? null : dt.toISOString();
                    };

                    const detectedColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
                    const airfieldDebug: string[] = [];
                    rows.slice(0, 3).forEach(row => {
                      const ta = getField(row, 'שדה המראה', 'takeoff_airfield', 'TAKEOFF_AIRFIELD', 'takeoff airfield', 'שדההמראה');
                      const la = getField(row, 'שדה נחיתה', 'landing_airfield', 'LANDING_AIRFIELD', 'landing airfield', 'שדהנחיתה');
                      const cs = getField(row, 'callSign', 'call_sign', 'קריאה');
                      if (cs) airfieldDebug.push(`${cs}: המראה="${ta || '(ריק)'}" נחיתה="${la || '(ריק)'}"`);
                    });

                    const strips = rows
                      .filter(row => getField(row, 'callSign', 'call_sign', 'קריאה'))
                      .map(row => {
                        const dateVal = getField(row, 'DATE', 'date', 'תאריך');
                        const timeVal = getField(row, 'TAKEOFF TIME', 'takeoff_time', 'takeoff time', 'time', 'זמן המראה', 'המראה');
                        const takeoff_time = parseTakeoffDatetime(dateVal, timeVal);
                        const takeoffAirfieldName = getField(row, 'שדה המראה', 'takeoff_airfield', 'TAKEOFF_AIRFIELD', 'takeoff airfield', 'שדההמראה');
                        const landingAirfieldName = getField(row, 'שדה נחיתה', 'landing_airfield', 'LANDING_AIRFIELD', 'landing airfield', 'שדהנחיתה');
                        return {
                          callSign: getField(row, 'callSign', 'call_sign', 'קריאה'),
                          sq: getField(row, 'sq', 'SQ', 'סקוודרון', 'squadron', 'טייסת'),
                          numberOfFormation: getField(row, 'numberOfFormation', 'number_of_formation', 'NUMBEROFFORMATION', 'NUMBER OF FORMATION', 'numberofformation', 'מספר_מערך', 'מספר מערך', 'מ׳ מערך', 'מ\' מערך'),
                          alt: getField(row, 'alt', 'גובה'),
                          task: getField(row, 'task', 'משימה'),
                          weapons: parseWeapons(getField(row, 'weapons', 'חימושים')),
                          targets: parseTargets(getField(row, 'targets', 'מטרות')),
                          systems: parseSystems(getField(row, 'systems', 'מערכות')),
                          shkadia: getField(row, 'shkadia', 'שקדיה'),
                          erka: getField(row, 'erka', 'ערכה', 'ERKA'),
                          koteret: getField(row, 'koteret', 'כותרת', 'KOTERET'),
                          mivtza: getField(row, 'mivtza', 'מבצע', 'MIVTZA'),
                          parent_callsign: getField(row, 'parent_callsign', 'חלק מפ"מ', 'חלק מפמ', 'PARENT_CALLSIGN', 'parent callsign', 'חלק_מפמ'),
                          takeoff_airfield_name: takeoffAirfieldName || null,
                          landing_airfield_name: landingAirfieldName || null,
                          takeoff_time
                        };
                      });
                    
                    try {
                      const res = await fetch(`${API_URL}/strips/import`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ strips, creator_preset_id: getSession()?.presetId || null })
                      });
                      const result = await res.json();
                      setCsvImportResult({ ...result, detectedColumns, airfieldDebug });
                    } catch (err) {
                      console.error('Import error:', err);
                      alert('שגיאה בטעינת הקובץ');
                    }
                    e.target.value = '';
                  }}
                />
                
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => document.getElementById('csvFileInput')?.click()}
                    style={{ padding: '12px 30px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
                  >
                    בחר קובץ Excel / CSV
                  </button>
                  <button
                    onClick={() => {
                      const headers = ['callSign', 'sq', 'NUMBEROFFORMATION', 'alt', 'task', 'DATE', 'TAKEOFF TIME', 'חלק מפ"מ', 'weapons', 'targets', 'systems', 'shkadia', 'erka', 'koteret', 'mivtza', 'שדה המראה', 'שדה נחיתה'];
                      const example1 = ['BLUE01', '69', '2', 'FL350', 'CAP', '23/03/2026', '0630', '', 'AIM120:4; AIM9:2', 'TANGO1:IP_NORTH', 'LANTIRN; EW', '', '', '', ''];
                      const example2 = ['BLUE02', '69', '2', 'FL350', 'CAP', '23/03/2026', '0630', 'BLUE01', 'AIM120:4; AIM9:2', 'TANGO1:IP_NORTH', 'LANTIRN; EW', '', '', '', ''];
                      const example3 = ['HAWK23', '105', '1', 'FL280', 'ESCORT', '23/03/2026', '0800', '', '', '', 'FLIR', '', '', '', ''];
                      const wb = XLSX.utils.book_new();
                      const ws = XLSX.utils.aoa_to_sheet([headers, example1, example2, example3]);
                      ws['!cols'] = headers.map((h, i) => ({ wch: i === 7 ? 14 : Math.max(h.length + 2, 12) }));
                      XLSX.utils.book_append_sheet(wb, ws, 'מטוסים');
                      XLSX.writeFile(wb, 'תבנית_טעינת_מטוסים.xlsx');
                    }}
                    style={{ padding: '12px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                  >
                    📥 הורד תבנית Excel
                  </button>
                </div>
                
                {csvImportResult && (
                  <div style={{ marginTop: '20px', padding: '15px', background: '#1e293b', borderRadius: '8px' }}>
                    {csvImportResult.imported > 0 && (
                      <div style={{ color: '#22c55e', marginBottom: '8px', fontSize: '15px' }}>
                        נוספו חדשים: {csvImportResult.imported} פממים
                      </div>
                    )}
                    {csvImportResult.updated > 0 && (
                      <div style={{ color: '#60a5fa', marginBottom: '8px', fontSize: '15px' }}>
                        עודכנו: {csvImportResult.updated} פממים
                      </div>
                    )}
                    {csvImportResult.skipped > 0 && (
                      <div style={{ color: '#94a3b8', marginBottom: '8px', fontSize: '14px' }}>
                        ללא שינוי: {csvImportResult.skipped} פממים
                      </div>
                    )}
                    {csvImportResult.errors.length > 0 && (
                      <div style={{ color: '#dc2626', fontSize: '13px' }}>
                        שגיאות: {csvImportResult.errors.join(', ')}
                      </div>
                    )}
                    {csvImportResult.unresolvedAirfields && csvImportResult.unresolvedAirfields.length > 0 && (
                      <div style={{ color: '#f59e0b', fontSize: '13px', marginTop: '8px', padding: '8px 10px', background: '#1c1a0a', borderRadius: '5px', border: '1px solid #78350f' }}>
                        ⚠️ שדות תעופה לא מזוהים: <strong>{csvImportResult.unresolvedAirfields.join(', ')}</strong><br/>
                        <span style={{ fontSize: '11px', color: '#d97706' }}>וודא שהשם בקובץ זהה לשם הבסיס כפי שמוגדר בלשונית "✈️ בסיסים"</span>
                      </div>
                    )}
                    {csvImportResult.airfieldDebug && csvImportResult.airfieldDebug.length > 0 && (
                      <div style={{ marginTop: '10px', padding: '8px 10px', background: '#0d1117', borderRadius: '5px', border: '1px solid #334155', fontSize: '12px', color: '#94a3b8', direction: 'ltr', textAlign: 'left' }}>
                        <div style={{ color: '#64748b', marginBottom: '4px', fontWeight: 'bold', direction: 'rtl', textAlign: 'right' }}>🔍 אבחון שדות תעופה (3 שורות ראשונות):</div>
                        {csvImportResult.airfieldDebug.map((d, i) => <div key={i}>{d}</div>)}
                      </div>
                    )}
                    {csvImportResult.detectedColumns && csvImportResult.detectedColumns.length > 0 && (
                      <div style={{ marginTop: '8px', padding: '8px 10px', background: '#0d1117', borderRadius: '5px', border: '1px solid #1e293b', fontSize: '11px', color: '#475569', direction: 'ltr', textAlign: 'left' }}>
                        <span style={{ color: '#334155' }}>עמודות שנמצאו: </span>{csvImportResult.detectedColumns.join(' | ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#94a3b8' }}>פורמט הקובץ</h3>
                
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#94a3b8', lineHeight: '2' }}>
                  <div><strong style={{color:'white'}}>שורה 1:</strong> כותרות עמודות (חובה)</div>
                  <div><strong style={{color:'white'}}>עמודות חובה:</strong> <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px'}}>callSign</code></div>
                  <div><strong style={{color:'white'}}>עמודות אופציונליות:</strong></div>
                  <div style={{paddingRight:'16px'}}>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>sq</code> — טייסת (גם: <code style={{background:'#1e293b', padding:'1px 4px', borderRadius:'3px'}}>SQ</code>, <code style={{background:'#1e293b', padding:'1px 4px', borderRadius:'3px'}}>squadron</code>, <code style={{background:'#1e293b', padding:'1px 4px', borderRadius:'3px'}}>טייסת</code>)<br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>NUMBEROFFORMATION</code> — מספר מערך (גם: <code style={{background:'#1e293b', padding:'1px 4px', borderRadius:'3px'}}>numberOfFormation</code>, <code style={{background:'#1e293b', padding:'1px 4px', borderRadius:'3px'}}>number_of_formation</code>)<br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>alt</code> — גובה<br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>task</code> — משימה<br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>DATE</code> — תאריך המראה, פורמט: <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>DD/MM/YYYY</code> או <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>DDMMYYYY</code><br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>TAKEOFF TIME</code> — שעת המראה, פורמט: <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>HHMM</code> או <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>HH:MM</code><br/>
                    <code style={{background:'#16a34a', color:'white', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>חלק מפ"מ</code> — <strong style={{color:'#86efac'}}>או"ק הפ"מ המקורי שאליו שייך המטוס</strong> (ריק = מבנה עצמאי; גם: <code style={{background:'#1e293b', padding:'1px 4px', borderRadius:'3px'}}>parent_callsign</code>)<br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>weapons</code> — חימושים, פורמט: <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>סוג1:כמות1; סוג2:כמות2</code><br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>targets</code> — מטרות, פורמט: <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>שם מטרה:נ.מכוון; מטרה2:נ.מכוון2</code><br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>systems</code> — מערכות, פורמט: <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>מערכת1; מערכת2</code><br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>shkadia</code> — שקדיה (טקסט חופשי)<br/>
                    <code style={{background:'#0c4a6e', color:'#7dd3fc', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>שדה המראה</code> — שם שדה ההמראה (חייב להתאים לשם בסיס תעופה מוגדר במערכת; גם: <code style={{background:'#1e293b', padding:'1px 4px', borderRadius:'3px'}}>takeoff_airfield</code>)<br/>
                    <code style={{background:'#0c4a6e', color:'#7dd3fc', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>שדה נחיתה</code> — שם שדה הנחיתה (חייב להתאים לשם בסיס תעופה מוגדר במערכת; גם: <code style={{background:'#1e293b', padding:'1px 4px', borderRadius:'3px'}}>landing_airfield</code>)
                  </div>
                  <div style={{marginTop:'10px', padding:'10px 14px', background:'#0c2218', border:'1px solid #16a34a', borderRadius:'6px', fontSize:'12px', color:'#86efac', lineHeight:'1.7'}}>
                    <strong>💡 שימוש בעמודת "חלק מפ"מ":</strong><br/>
                    כדי לייבא מבנה שבו BLUE01 ו-BLUE02 שייכים לאותו פ"מ — מלא בשורת BLUE02 את הערך <code style={{background:'#1a3a28', padding:'1px 5px', borderRadius:'3px'}}>BLUE01</code> בעמודת "חלק מפ"מ".<br/>
                    מבנה שאינו שייך לאף פ"מ יסתר ריק.
                  </div>
                </div>

                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>דוגמה (CSV):</h4>
                <pre style={{ background: '#1e293b', padding: '15px', borderRadius: '6px', fontSize: '12px', overflow: 'auto', color: '#e2e8f0', direction: 'ltr', textAlign: 'left' }}>
{`callSign,sq,NUMBEROFFORMATION,alt,task,DATE,TAKEOFF TIME,חלק מפ"מ,weapons,targets,systems,shkadia
BLUE01,69,2,FL350,CAP,23/03/2026,0630,,AIM120:4; AIM9:2,TANGO1:IP_NORTH,LANTIRN; EW,
BLUE02,69,2,FL350,CAP,23/03/2026,0630,BLUE01,AIM120:4; AIM9:2,TANGO1:IP_NORTH,LANTIRN; EW,
HAWK23,105,1,FL280,ESCORT,23/03/2026,0800,,,, FLIR,
VIPER07,117,1,FL400,STRIKE,23/03/2026,0945,,GBU12:2; GBU31:1,BRIDGE_A:IP_SOUTH,,`}
                </pre>

                <h4 style={{ margin: '15px 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>דוגמה (Excel):</h4>
                <div style={{ background: '#1e293b', borderRadius: '6px', overflow: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px', direction: 'ltr', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#334155' }}>
                        {['callSign','sq','NUMBEROFFORMATION','alt','task','DATE','TAKEOFF TIME','weapons','targets','systems','shkadia'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', color: h === 'DATE' || h === 'TAKEOFF TIME' ? '#86efac' : '#60a5fa', borderBottom: '1px solid #475569', fontWeight: 'bold' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['BLUE01','69','1','FL350','CAP','23/03/2026','0630','AIM120:4; AIM9:2','TANGO1:IP_NORTH','LANTIRN; EW','מטוס 2'],
                        ['HAWK23','105','2','FL280','ESCORT','23/03/2026','0800','','','FLIR',''],
                        ['VIPER07','117','1','FL400','STRIKE','23/03/2026','0945','GBU12:2; GBU31:1','BRIDGE_A:IP_SOUTH','','מטוס 1'],
                      ].map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#0f172a' : '#162032' }}>
                          {row.map((cell, j) => (
                            <td key={j} style={{ padding: '5px 10px', color: j === 5 || j === 6 ? '#86efac' : '#e2e8f0', borderBottom: '1px solid #1e293b' }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Aircraft (strip_aircraft) Import ── */}
              <div style={{ marginTop: '32px', borderTop: '2px solid #334155', paddingTop: '24px' }}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#e2e8f0' }}>
                  ✈ טעינת מטוסים מקובץ
                </h2>
                <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
                  <p style={{ color: '#94a3b8', marginBottom: '12px', fontSize: '13px', lineHeight: '1.7' }}>
                    טען נתוני מטוסים (דת"ק וכיפה) לפממים קיימים.<br/>
                    <strong style={{ color: '#f59e0b' }}>הפממים חייבים להיות קיימים כבר במערכת לפני הטעינה.</strong><br/>
                    קישור לפ"מ נעשה לפי עמודת <code style={{ background: '#1e293b', padding: '1px 5px', borderRadius: '3px' }}>formation_callsign</code>.
                  </p>

                  <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#1e293b', borderRadius: '6px', fontSize: '12px', color: '#94a3b8', lineHeight: '2' }}>
                    <strong style={{ color: 'white' }}>עמודות:</strong><br/>
                    <code style={{ background: '#334155', padding: '1px 6px', borderRadius: '3px' }}>formation_callsign</code> — או"ק הפ"מ שאליו שייך המטוס (חובה)<br/>
                    <code style={{ background: '#334155', padding: '1px 6px', borderRadius: '3px' }}>idx</code> — מספר המטוס בתצורה: 1, 2, 3... (חובה)<br/>
                    <code style={{ background: '#334155', padding: '1px 6px', borderRadius: '3px' }}>datk</code> — דת"ק (מספר, אופציונלי)<br/>
                    <code style={{ background: '#334155', padding: '1px 6px', borderRadius: '3px' }}>kipa</code> — כיפה (טקסט, אופציונלי)<br/>
                    <code style={{ background: '#92400e', color: '#fcd34d', padding: '1px 6px', borderRadius: '3px' }}>armaments</code> — חימושים/תצורה, פורמט: <code style={{ background: '#1e293b', padding: '1px 5px', borderRadius: '3px' }}>שם:כמות; שם2:כמות2</code><br/>
                    <code style={{ background: '#0e3a4a', color: '#67e8f9', padding: '1px 6px', borderRadius: '3px' }}>systems</code> — מערכות, פורמט: <code style={{ background: '#1e293b', padding: '1px 5px', borderRadius: '3px' }}>שם:סטטוס; שם2:סטטוס2</code> (סטטוס: שמיש/חלקי/לא שמיש)
                  </div>

                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    id="acFileInput"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setAcImportResult(null);
                      setAcDiag(null);
                      let rows: Record<string, any>[] = [];
                      try {
                        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                          const buffer = await file.arrayBuffer();
                          const wb = XLSX.read(buffer, { type: 'array' });
                          const ws = wb.Sheets[wb.SheetNames[0]];
                          rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) as Record<string, any>[];
                        } else {
                          const text = await file.text();
                          const sep = text.includes('\t') ? '\t' : ',';
                          const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
                          if (lines.length < 2) { setAcDiag({ cols: [], rowCount: 0, mapped: [] }); return; }
                          const headers = lines[0].split(sep).map(h => h.trim().replace(/^\uFEFF/, ''));
                          rows = lines.slice(1).map(line => {
                            const vals = line.split(sep).map(v => v.trim());
                            const row: Record<string, string> = {};
                            headers.forEach((h, i) => { row[h] = vals[i] || ''; });
                            return row;
                          });
                        }
                      } catch (err) {
                        setAcDiag({ cols: [`שגיאה בקריאת הקובץ: ${err}`], rowCount: 0, mapped: [] });
                        e.target.value = '';
                        return;
                      }
                      const detectedCols = rows.length > 0 ? Object.keys(rows[0]) : [];
                      const norm = (k: string) => String(k).toLowerCase().replace(/[\s_\-"'״׳`]+/g, '');
                      const findCol = (rks: string[], ...keys: string[]): string | undefined => {
                        for (const k of keys) {
                          const exact = rks.find(rk => norm(rk) === norm(k));
                          if (exact) return exact;
                        }
                        for (const k of keys) {
                          const partial = rks.find(rk => norm(rk).includes(norm(k)) || norm(k).includes(norm(rk)));
                          if (partial) return partial;
                        }
                        return undefined;
                      };
                      const colCallsign  = findCol(detectedCols, 'formation_callsign', 'callsign', 'callSign', 'קריאה', 'אוק', 'פמ', 'formationcallsign', 'formation', 'call');
                      const colIdx       = findCol(detectedCols, 'idx', 'מספר', 'index', 'מטוס', 'num', 'מסמטוס');
                      const colDatk      = findCol(detectedCols, 'datk', 'דתק', 'דת');
                      const colKipa      = findCol(detectedCols, 'kipa', 'כיפה');
                      const colArmaments = findCol(detectedCols, 'armaments', 'חימושים', 'תצורה', 'weapons', 'armament');
                      const colSystems   = findCol(detectedCols, 'systems', 'מערכות', 'system');
                      const getF = (row: Record<string, any>, col: string | undefined) =>
                        col ? String(row[col] ?? '').trim() : '';
                      const parseArm = (val: string) => val ? val.split(';').map(s => s.trim()).filter(Boolean).map(s => {
                        const p = s.split(':'); return { name: p[0].trim(), quantity: parseInt(p[1]) || 1 };
                      }) : [];
                      const parseSys = (val: string) => val ? val.split(';').map(s => s.trim()).filter(Boolean).map(s => {
                        const p = s.split(':'); return { name: p[0].trim(), status: p[1]?.trim() || 'שמיש' };
                      }) : [];
                      const mapped = rows
                        .map(row => ({
                          formation_callsign: getF(row, colCallsign),
                          idx: getF(row, colIdx),
                          datk: getF(row, colDatk),
                          kipa: getF(row, colKipa),
                          armaments: parseArm(getF(row, colArmaments)),
                          systems: parseSys(getF(row, colSystems)),
                        }))
                        .filter(r => r.formation_callsign && r.idx);
                      setAcDiag({ cols: detectedCols, colCallsign, colIdx, colDatk, colKipa, colArmaments, colSystems, rowCount: rows.length, mapped });
                      e.target.value = '';
                    }}
                  />

                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      onClick={() => document.getElementById('acFileInput')?.click()}
                      style={{ padding: '12px 28px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold' }}
                    >✈ בחר קובץ CSV / Excel</button>
                    <button
                      onClick={() => {
                        const headers = ['formation_callsign', 'idx', 'datk', 'kipa', 'armaments', 'systems'];
                        const ex1 = ['ALPHA', '1', '101', 'אדום', 'AIM120:4; AIM9:2', 'LANTIRN:שמיש; EW:שמיש'];
                        const ex2 = ['ALPHA', '2', '102', 'כחול', 'AIM120:4; AIM9:2', 'LANTIRN:שמיש'];
                        const ex3 = ['ALPHA', '3', '103', 'ירוק', 'AIM120:2', 'EW:חלקי'];
                        const ex4 = ['BRAVO', '1', '201', '', 'GBU12:2', 'FLIR:שמיש'];
                        const ex5 = ['BRAVO', '2', '202', 'כחול', 'GBU12:2', ''];
                        const wb = XLSX.utils.book_new();
                        const ws = XLSX.utils.aoa_to_sheet([headers, ex1, ex2, ex3, ex4, ex5]);
                        ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 16) }));
                        XLSX.utils.book_append_sheet(wb, ws, 'מטוסים');
                        XLSX.writeFile(wb, 'תבנית_טעינת_מטוסים.xlsx');
                      }}
                      style={{ padding: '12px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                    >📥 הורד תבנית Excel</button>
                  </div>

                  {/* Diagnostics panel — shown after file is picked */}
                  {acDiag && !acImportResult && (
                    <div style={{ marginTop: '16px', padding: '14px', background: '#1e293b', borderRadius: '8px', fontSize: '12px' }}>
                      <div style={{ marginBottom: '10px', color: '#94a3b8' }}>
                        <strong style={{ color: '#e2e8f0' }}>עמודות שנמצאו בקובץ ({acDiag.cols.length}):</strong><br/>
                        <span style={{ fontFamily: 'monospace', color: '#60a5fa' }}>{acDiag.cols.join(' | ') || '—'}</span>
                      </div>
                      <div style={{ marginBottom: '10px', lineHeight: 2 }}>
                        <strong style={{ color: '#e2e8f0' }}>מיפוי שזוהה:</strong><br/>
                        <span style={{ color: acDiag.colCallsign ? '#22c55e' : '#f87171' }}>קריאה (חובה): {acDiag.colCallsign ? `"${acDiag.colCallsign}"` : '❌ לא נמצא'}</span><br/>
                        <span style={{ color: acDiag.colIdx ? '#22c55e' : '#f87171' }}>מספר מטוס (חובה): {acDiag.colIdx ? `"${acDiag.colIdx}"` : '❌ לא נמצא'}</span><br/>
                        <span style={{ color: acDiag.colDatk ? '#22c55e' : '#64748b' }}>דת"ק: {acDiag.colDatk ? `"${acDiag.colDatk}"` : 'לא נמצא'}</span><br/>
                        <span style={{ color: acDiag.colKipa ? '#22c55e' : '#64748b' }}>כיפה: {acDiag.colKipa ? `"${acDiag.colKipa}"` : 'לא נמצא'}</span><br/>
                        <span style={{ color: acDiag.colArmaments ? '#22c55e' : '#64748b' }}>חימושים/תצורה: {acDiag.colArmaments ? `"${acDiag.colArmaments}"` : 'לא נמצא'}</span><br/>
                        <span style={{ color: acDiag.colSystems ? '#22c55e' : '#64748b' }}>מערכות: {acDiag.colSystems ? `"${acDiag.colSystems}"` : 'לא נמצא'}</span>
                      </div>
                      <div style={{ marginBottom: '12px', color: acDiag.mapped.length > 0 ? '#22c55e' : '#f87171' }}>
                        שורות תקינות שזוהו: <strong>{acDiag.mapped.length}</strong> מתוך {acDiag.rowCount}
                      </div>
                      {acDiag.mapped.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ color: '#94a3b8', marginBottom: '5px' }}>תצוגה מקדימה (3 ראשונות):</div>
                          <table style={{ borderCollapse: 'collapse', fontSize: '11px', direction: 'ltr', width: '100%' }}>
                            <thead><tr style={{ background: '#334155' }}>
                              {['קריאה','מטוס','דת"ק','כיפה','חימושים','מערכות'].map(h => <th key={h} style={{ padding: '3px 8px', color: '#94a3b8', fontWeight: 'normal', whiteSpace: 'nowrap' }}>{h}</th>)}
                            </tr></thead>
                            <tbody>
                              {acDiag.mapped.slice(0, 3).map((r, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? '#0f172a' : '#162032' }}>
                                  <td style={{ padding: '3px 8px', color: '#f87171' }}>{r.formation_callsign}</td>
                                  <td style={{ padding: '3px 8px', color: '#f87171' }}>{r.idx}</td>
                                  <td style={{ padding: '3px 8px', color: '#e2e8f0' }}>{r.datk}</td>
                                  <td style={{ padding: '3px 8px', color: '#e2e8f0' }}>{r.kipa}</td>
                                  <td style={{ padding: '3px 8px', color: '#fcd34d', fontSize: '10px' }}>{r.armaments.map((a: any) => `${a.name}×${a.quantity}`).join(', ') || '—'}</td>
                                  <td style={{ padding: '3px 8px', color: '#67e8f9', fontSize: '10px' }}>{r.systems.map((s: any) => `${s.name}:${s.status}`).join(', ') || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {(!acDiag.colCallsign || !acDiag.colIdx) ? (
                        <div style={{ color: '#f87171', padding: '8px', background: '#2d0f0f', borderRadius: '5px' }}>
                          ❌ לא נמצאו עמודות חובה. שנה את שמות העמודות בקובץ ל: <strong>formation_callsign</strong> ו-<strong>idx</strong> (או: קריאה / מספר)
                        </div>
                      ) : acDiag.mapped.length === 0 ? (
                        <div style={{ color: '#f87171', padding: '8px', background: '#2d0f0f', borderRadius: '5px' }}>
                          ❌ אין שורות עם נתונים בעמודות שזוהו
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`${API_URL}/strip-aircraft/bulk-import`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ rows: acDiag.mapped }),
                              });
                              const result = await res.json();
                              const colMap = `קריאה→"${acDiag.colCallsign}" | מספר→"${acDiag.colIdx}"`;
                              setAcImportResult({ ...result, colMap });
                              setAcDiag(null);
                            } catch (err) {
                              setAcImportResult({ imported: 0, skipped: 0, errors: [`שגיאת רשת: ${err}`] });
                            }
                          }}
                          style={{ padding: '10px 24px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                        >✅ אשר ייבוא {acDiag.mapped.length} מטוסים</button>
                      )}
                    </div>
                  )}

                  {acImportResult && (
                    <div style={{ marginTop: '16px', padding: '14px', background: '#1e293b', borderRadius: '8px' }}>
                      {acImportResult.colMap && <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '10px', fontFamily: 'monospace' }}>מיפוי עמודות: {acImportResult.colMap}</div>}
                      {acImportResult.imported > 0 && <div style={{ color: '#22c55e', fontSize: '15px', marginBottom: '6px' }}>✅ נטענו: {acImportResult.imported} מטוסים</div>}
                      {acImportResult.skipped > 0 && <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>דולגו: {acImportResult.skipped}</div>}
                      {acImportResult.errors.length > 0 && (
                        <div style={{ color: '#f87171', fontSize: '12px' }}>
                          <strong>שגיאות ({acImportResult.errors.length}):</strong>
                          <ul style={{ margin: '4px 0 0 0', paddingRight: '18px' }}>
                            {acImportResult.errors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                            {acImportResult.errors.length > 10 && <li style={{ color: '#64748b' }}>...ועוד {acImportResult.errors.length - 10}</li>}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>דוגמה (CSV):</h4>
                <pre style={{ background: '#1e293b', padding: '14px', borderRadius: '6px', fontSize: '12px', overflow: 'auto', color: '#e2e8f0', direction: 'ltr', textAlign: 'left', margin: 0 }}>
{`formation_callsign,idx,datk,kipa
ALPHA,1,101,אדום
ALPHA,2,102,כחול
ALPHA,3,103,ירוק
ALPHA,4,104,צהוב
BRAVO,1,201,אדום
BRAVO,2,202,
CHARLIE,1,301,`}
                </pre>

                <h4 style={{ margin: '14px 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>מבנה הקובץ:</h4>
                <div style={{ background: '#1e293b', borderRadius: '6px', overflow: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', direction: 'ltr', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#334155' }}>
                        {['formation_callsign', 'idx', 'datk', 'kipa'].map(h => (
                          <th key={h} style={{ padding: '7px 12px', color: h === 'formation_callsign' || h === 'idx' ? '#f87171' : '#60a5fa', borderBottom: '1px solid #475569', fontWeight: 'bold' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['ALPHA','1','101','אדום'],
                        ['ALPHA','2','102','כחול'],
                        ['BRAVO','1','201',''],
                        ['BRAVO','2','202','כחול'],
                      ].map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#0f172a' : '#162032' }}>
                          {row.map((cell, j) => (
                            <td key={j} style={{ padding: '5px 12px', color: j < 2 ? '#f87171' : '#e2e8f0', borderBottom: '1px solid #1e293b' }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
                  🔴 אדום = שדה חובה &nbsp;|&nbsp; 🔵 כחול = שדה אופציונלי
                </p>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #1e293b', margin: '24px 0' }} />

              <h2 style={{ margin: '0 0 14px 0', fontSize: '18px' }}>רשימת פ"ממ ({globalStrips.length})</h2>
              {stripsLoading ? (
                <div style={{ color: '#94a3b8', padding: '20px', textAlign: 'center' }}>טוען...</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', direction: 'rtl' }}>
                    <thead>
                      <tr style={{ background: '#1e293b', color: '#94a3b8', textAlign: 'right' }}>
                        {['קריאה', "מ' מערך", 'טייסת', 'גובה', 'משימה', 'כותרת', 'זמן המראה', 'שדה המראה', 'שדה נחיתה', 'סטטוס', 'סטטוס אוירי', ''].map((h, i) => (
                          <th key={i} style={{ padding: '8px 10px', fontWeight: '600', borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {globalStrips.filter(s => !stripsSearch.trim() || ['callSign','sq','task','koteret'].some(f => (s[f]||'').toLowerCase().includes(stripsSearch.toLowerCase()))).map((s, idx) => {
                        const isEditing = editingStripId === s.id;
                        const rowBg = idx % 2 === 0 ? '#0f172a' : '#111827';
                        const takeoffBase = adminAviationBases.find((b: any) => b.id === s.takeoff_airfield_id);
                        const landingBase = adminAviationBases.find((b: any) => b.id === s.landing_airfield_id);
                        if (isEditing) {
                          return (
                            <tr key={s.id} style={{ background: '#1e3a5f' }}>
                              {['callSign', 'numberOfFormation', 'sq', 'alt', 'task', 'koteret'].map(field => (
                                <td key={field} style={{ padding: '6px 8px' }}>
                                  <input value={editingStripForm[field] ?? ''} onChange={e => setEditingStripForm((p: any) => ({ ...p, [field]: e.target.value }))} style={{ width: '100%', padding: '4px 6px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #3b82f6', borderRadius: '4px', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box', minWidth: '70px' }} />
                                </td>
                              ))}
                              <td style={{ padding: '6px 8px' }}>
                                <input type="datetime-local" value={editingStripForm.takeoff_time ?? ''} onChange={e => setEditingStripForm((p: any) => ({ ...p, takeoff_time: e.target.value }))} style={{ padding: '4px 6px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #3b82f6', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                              </td>
                              <td style={{ padding: '6px 8px', color: '#86efac', fontSize: '12px' }}>{takeoffBase?.name || '—'}</td>
                              <td style={{ padding: '6px 8px', color: '#93c5fd', fontSize: '12px' }}>{landingBase?.name || '—'}</td>
                              <td style={{ padding: '6px 8px', color: '#94a3b8', fontSize: '12px' }}>{s.status}</td>
                              <td style={{ padding: '6px 8px' }}>
                                <button onClick={() => setEditingStripForm((p: any) => ({ ...p, airborne: !p.airborne }))} style={{ padding: '4px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: editingStripForm.airborne ? '#1d4ed8' : '#334155', color: editingStripForm.airborne ? '#bfdbfe' : '#94a3b8' }}>{editingStripForm.airborne ? '✈ באוויר' : '⬛ קרקע'}</button>
                              </td>
                              <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                                <button onClick={async () => { await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callsign: editingStripForm.callSign, sq: editingStripForm.sq, number_of_formation: editingStripForm.numberOfFormation || null, alt: editingStripForm.alt, task: editingStripForm.task, koteret: editingStripForm.koteret, takeoff_time: editingStripForm.takeoff_time ? new Date(editingStripForm.takeoff_time).toISOString() : null, airborne: editingStripForm.airborne }) }); setEditingStripId(null); await loadGlobalStrips(); }} style={{ padding: '3px 12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginLeft: '4px' }}>✓ שמור</button>
                                <button onClick={() => setEditingStripId(null)} style={{ padding: '3px 10px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>ביטול</button>
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={s.id} style={{ background: rowBg }}>
                            <td style={{ padding: '7px 10px', color: '#e2e8f0', fontWeight: '600' }}>{s.callSign || '—'}</td>
                            <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{s.numberOfFormation || '—'}</td>
                            <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{s.sq || '—'}</td>
                            <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{s.alt || '—'}</td>
                            <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{s.task || '—'}</td>
                            <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{s.koteret || '—'}</td>
                            <td style={{ padding: '7px 10px', color: '#60a5fa', whiteSpace: 'nowrap' }}>{formatTakeoffDisplay(s.takeoff_time)}</td>
                            <td style={{ padding: '7px 10px', color: takeoffBase ? '#86efac' : '#475569', fontSize: '12px', whiteSpace: 'nowrap' }}>{takeoffBase?.name || '—'}</td>
                            <td style={{ padding: '7px 10px', color: landingBase ? '#93c5fd' : '#475569', fontSize: '12px', whiteSpace: 'nowrap' }}>{landingBase?.name || '—'}</td>
                            <td style={{ padding: '7px 10px', color: s.status === 'active' ? '#22c55e' : '#94a3b8', fontSize: '12px' }}>{s.status || '—'}</td>
                            <td style={{ padding: '7px 10px' }}>
                              <button onClick={async () => { const newVal = !s.airborne; await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airborne: newVal }) }); await loadGlobalStrips(); }} style={{ padding: '3px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: s.airborne ? '#1d4ed8' : '#1e293b', color: s.airborne ? '#bfdbfe' : '#64748b' }}>{s.airborne ? '✈ באוויר' : '⬛ קרקע'}</button>
                            </td>
                            <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                              <button onClick={async () => { const n = parseInt(s.numberOfFormation); if (!n || n < 1) return alert('לפמ"מ זה אין כמות מטוסים מוגדרת'); const res = await fetch(`${API_URL}/strip-aircraft/ensure/${s.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: n, randomize: true }) }); if (res.ok) { const rows = await res.json(); alert(`✅ נוצרו ${rows.length} מטוסים לפ"מ ${s.callSign}`); } else { alert('שגיאה ביצירת מטוסים'); } }} title={`צור ${s.numberOfFormation || '?'} מטוסים אוטומטית`} style={{ padding: '3px 10px', background: '#065f46', color: '#6ee7b7', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginLeft: '4px' }}>✈ מטוסים</button>
                              <button onClick={() => { setEditingStripId(s.id); setEditingStripForm({ callSign: s.callSign || '', numberOfFormation: s.numberOfFormation || '', sq: s.sq || '', alt: s.alt || '', task: s.task || '', koteret: s.koteret || '', takeoff_time: formatTakeoffForInput(s.takeoff_time), airborne: !!s.airborne }); setShowNewStripForm(false); }} style={{ padding: '3px 10px', background: '#1e40af', color: '#93c5fd', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginLeft: '4px' }}>עריכה</button>
                              <button onClick={async () => { if (!await customConfirm(`למחוק פמם "${s.callSign}"?`)) return; await fetch(`${API_URL}/strips/${s.id}`, { method: 'DELETE' }); await loadGlobalStrips(); }} style={{ padding: '3px 10px', background: '#450a0a', color: '#fca5a5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>מחק</button>
                            </td>
                          </tr>
                        );
                      })}
                      {globalStrips.filter(s => !stripsSearch.trim() || ['callSign','sq','task','koteret'].some(f => (s[f]||'').toLowerCase().includes(stripsSearch.toLowerCase()))).length === 0 && (
                        <tr><td colSpan={12} style={{ padding: '20px', textAlign: 'center', color: '#475569' }}>{stripsSearch ? 'לא נמצאו תוצאות' : 'אין פממים במערכת'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Crew Members Tab */}
          {activeTab === 'crew' && (
            <div>
              <h2 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>ניהול משתמשים</h2>
              
              {/* Crew Member Form */}
              <MaybeSettingsModal
                show={!!editingCrewMember}
                title={`עריכת משתמש: ${editingCrewMember ? editingCrewMember.first_name + ' ' + editingCrewMember.last_name : ''}`}
                onClose={() => { setEditingCrewMember(null); setCrewMemberForm({ first_name: '', last_name: '', personal_id: '', is_admin: false, is_team_lead: false, approved_workstations: [] }); }}
              >
              <div style={{ background: editingCrewMember ? 'transparent' : '#0f172a', borderRadius: '8px', padding: editingCrewMember ? '0' : '20px', marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#94a3b8' }}>
                  {editingCrewMember ? 'עריכת משתמש' : 'משתמש חדש'}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="שם פרטי"
                      value={crewMemberForm.first_name}
                      onChange={(e) => setCrewMemberForm(f => ({ ...f, first_name: e.target.value }))}
                      style={{ padding: '10px 14px', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', fontSize: '15px', width: '150px' }}
                    />
                    <input
                      type="text"
                      placeholder="שם משפחה"
                      value={crewMemberForm.last_name}
                      onChange={(e) => setCrewMemberForm(f => ({ ...f, last_name: e.target.value }))}
                      style={{ padding: '10px 14px', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', fontSize: '15px', width: '150px' }}
                    />
                    <input
                      type="text"
                      placeholder="מ.א"
                      value={crewMemberForm.personal_id}
                      onChange={(e) => setCrewMemberForm(f => ({ ...f, personal_id: e.target.value }))}
                      style={{ padding: '10px 14px', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', fontSize: '15px', width: '120px' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '2px' }}>תפקיד:</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', cursor: 'pointer' }}>
                        <input type="radio" name="crew-role" checked={!crewMemberForm.is_admin && !crewMemberForm.is_team_lead}
                          onChange={() => setCrewMemberForm(f => ({ ...f, is_admin: false, is_team_lead: false }))} />
                        משתמש רגיל
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#06b6d4', cursor: 'pointer' }}>
                        <input type="radio" name="crew-role" checked={!crewMemberForm.is_admin && crewMemberForm.is_team_lead}
                          onChange={() => setCrewMemberForm(f => ({ ...f, is_admin: false, is_team_lead: true }))} />
                        ראש צוות
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#eab308', cursor: 'pointer' }}>
                        <input type="radio" name="crew-role" checked={crewMemberForm.is_admin}
                          onChange={() => setCrewMemberForm(f => ({ ...f, is_admin: true, is_team_lead: false }))} />
                        מנהל מערכת
                      </label>
                    </div>
                  </div>
                  
                  {/* Approved Workstations Multi-Select */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>עמדות מאושרות:</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {presets.map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => toggleWorkstationApproval(preset.id)}
                          style={{
                            padding: '6px 12px',
                            background: crewMemberForm.approved_workstations.includes(preset.id) ? '#3b82f6' : '#334155',
                            color: 'white',
                            border: crewMemberForm.approved_workstations.includes(preset.id) ? '2px solid #60a5fa' : '1px solid #475569',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px'
                          }}
                        >
                          {preset.name}
                        </button>
                      ))}
                      {presets.length === 0 && <span style={{ color: '#64748b', fontSize: '13px' }}>אין עמדות מוגדרות</span>}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={saveCrewMember}
                      disabled={!crewMemberForm.first_name.trim() || !crewMemberForm.last_name.trim()}
                      style={{ padding: '10px 25px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', opacity: (crewMemberForm.first_name.trim() && crewMemberForm.last_name.trim()) ? 1 : 0.5 }}
                    >
                      {editingCrewMember ? 'עדכון' : 'הוספה'}
                    </button>
                    {editingCrewMember && (
                      <button
                        onClick={() => { setEditingCrewMember(null); setCrewMemberForm({ first_name: '', last_name: '', personal_id: '', is_admin: false, is_team_lead: false, approved_workstations: [] }); }}
                        style={{ padding: '10px 20px', background: '#475569', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
                      >
                        ביטול
                      </button>
                    )}
                  </div>
                </div>
              </div>
              </MaybeSettingsModal>
              
              {/* Crew Members List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {crewMembers.map(member => (
                  <div key={member.id} style={{ background: '#0f172a', borderRadius: '8px', padding: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{member.first_name} {member.last_name}</span>
                        {member.personal_id && <span style={{ fontSize: '12px', color: '#94a3b8' }}>מ.א: {member.personal_id}</span>}
                        {member.is_admin && (
                          <span style={{ fontSize: '12px', background: '#eab308', color: '#1e293b', padding: '2px 10px', borderRadius: '12px', fontWeight: 'bold' }}>מנהל</span>
                        )}
                        {!member.is_admin && member.is_team_lead && (
                          <span style={{ fontSize: '12px', background: '#06b6d4', color: '#0c4a6e', padding: '2px 10px', borderRadius: '12px', fontWeight: 'bold' }}>ראש צוות</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => editCrewMember(member)} style={{ padding: '6px 15px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>עריכה</button>
                        <button onClick={() => deleteCrewMember(member.id)} style={{ padding: '6px 15px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>מחיקה</button>
                      </div>
                    </div>
                    {member.approved_workstations && member.approved_workstations.length > 0 && (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        עמדות: {member.approved_workstations.map(wsId => {
                          const preset = presets.find(p => p.id === wsId);
                          return preset?.name || wsId;
                        }).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
                {crewMembers.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
                    אין משתמשים מוגדרים. הוסף משתמש חדש למעלה.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Table Modes Tab */}
          {activeTab === 'table_modes' && <TableModesManager />}
          {activeTab === 'work_groups' && <WorkGroupsManager presets={presets} />}
          {activeTab === 'aids' && <AidsManager presets={presets} />}
          {activeTab === 'serials' && <SerialsAdminTab initialUndoDurationMs={crewMember?.undo_duration_ms ?? null} />}

          {/* Blocks Tab */}
          {activeTab === 'blocks' && (() => {
            // Helper: pick color maximally different (by hue) from existing block colors
            const BLOCK_PALETTE = ['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f43f5e','#a855f7','#fb923c','#4ade80'];
            const hexToHue = (hex: string): number => {
              const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
              const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
              if (d === 0) return 0;
              let h = max===r ? (g-b)/d%6 : max===g ? (b-r)/d+2 : (r-g)/d+4;
              return ((h*60)+360)%360;
            };
            const pickDistinctColor = (existingBlocks: any[]): string => {
              if (!existingBlocks.length) return BLOCK_PALETTE[0];
              const usedHues = existingBlocks.map(b => hexToHue(b.color || '#3b82f6'));
              let best = BLOCK_PALETTE[0], bestDist = -1;
              for (const c of BLOCK_PALETTE) {
                const h = hexToHue(c);
                const d = Math.min(...usedHues.map(uh => Math.min(Math.abs(h-uh), 360-Math.abs(h-uh))));
                if (d > bestDist) { bestDist = d; best = c; }
              }
              return best;
            };
            const fmtDate = (ts: string|null|undefined) => {
              if (!ts) return null;
              const d = new Date(ts);
              return `${d.toLocaleDateString('he-IL')} ${d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}`;
            };
            // Group block tables by category
            const btCategories: string[] = [];
            blockTables.forEach((bt: any) => { const c = bt.category || ''; if (!btCategories.includes(c)) btCategories.push(c); });
            btCategories.sort((a,b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'he'));

            const emptyBlockForm = { alt_from: '', alt_to: '', mission: '', color: '#3b82f6', workstations: [] as number[], platforms: [] as string[], note: '' };
            return (
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
              {/* Left: Block Spaces */}
              <div style={{ width: '240px', flexShrink: 0 }}>
                <h2 style={{ margin: '0 0 14px 0', fontSize: '17px', color: '#e2e8f0' }}>מרחבי בלוקים</h2>
                <div style={{ background: '#0f172a', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '8px' }}>מרחב חדש</div>
                  <input value={blockSpaceForm.name} onChange={e => setBlockSpaceForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="שם המרחב (למשל: צפון)" style={{ width: '100%', padding: '7px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button onClick={async () => {
                      if (!blockSpaceForm.name.trim()) return;
                      await fetch(`${API_URL}/block-spaces`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: blockSpaceForm.name }) });
                      setBlockSpaceForm({ name: '' }); loadData();
                    }} style={{ flex: 1, background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '5px', padding: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>+ הוסף</button>
                  </div>
                </div>
                {/* Block space edit modal */}
                {editingBlockSpace && (
                  <SettingsModal title={`עריכת מרחב: ${editingBlockSpace.name}`} onClose={() => { setEditingBlockSpace(null); setBlockSpaceForm({ name: '' }); }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', color: '#94a3b8', fontSize: '13px' }}>שם המרחב:</label>
                        <input value={blockSpaceForm.name} onChange={e => setBlockSpaceForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="שם המרחב" style={{ width: '100%', padding: '9px 12px', background: '#1e293b', border: '1px solid #475569', borderRadius: '7px', color: 'white', fontSize: '14px', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={async () => {
                          if (!blockSpaceForm.name.trim()) return;
                          await fetch(`${API_URL}/block-spaces/${editingBlockSpace.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: blockSpaceForm.name }) });
                          setBlockSpaceForm({ name: '' }); setEditingBlockSpace(null); loadData();
                        }} style={{ flex: 1, background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '7px', padding: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>שמור</button>
                        <button onClick={() => { setEditingBlockSpace(null); setBlockSpaceForm({ name: '' }); }} style={{ background: '#475569', color: 'white', border: 'none', borderRadius: '7px', padding: '10px 16px', cursor: 'pointer', fontSize: '14px' }}>ביטול</button>
                      </div>
                    </div>
                  </SettingsModal>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {blockSpaces.map((bs: any) => (
                    <div key={bs.id} style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '6px', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#93c5fd', fontSize: '13px', fontWeight: 'bold' }}>{bs.name}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => { setEditingBlockSpace(bs); setBlockSpaceForm({ name: bs.name }); }} style={{ background: '#1e3a5f', color: '#93c5fd', border: 'none', borderRadius: '4px', padding: '3px 7px', cursor: 'pointer', fontSize: '11px' }}>✏️</button>
                        <button onClick={async () => { if (!await customConfirm('למחוק מרחב בלוקים זה?')) return; await fetch(`${API_URL}/block-spaces/${bs.id}`, { method: 'DELETE' }); loadData(); }} style={{ background: '#450a0a', color: '#fca5a5', border: 'none', borderRadius: '4px', padding: '3px 7px', cursor: 'pointer', fontSize: '11px' }}>🗑️</button>
                      </div>
                    </div>
                  ))}
                  {blockSpaces.length === 0 && <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '12px' }}>אין מרחבי בלוקים</div>}
                </div>
              </div>

              {/* Right: Block Tables */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: '0 0 14px 0', fontSize: '17px', color: '#e2e8f0' }}>טבלאות בלוקים</h2>
                {/* New Table Form */}
                <div style={{ background: '#0f172a', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '8px' }}>טבלה חדשה</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <input value={blockTableForm.name} onChange={e => setBlockTableForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="שם הטבלה" style={{ flex: 1, minWidth: '140px', padding: '7px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px' }} />
                    <input value={blockTableForm.category} onChange={e => setBlockTableForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="קטגוריה (אופציונלי)" style={{ flex: 1, minWidth: '120px', padding: '7px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px' }} />
                    <select value={blockTableForm.block_space_id} onChange={e => setBlockTableForm(f => ({ ...f, block_space_id: e.target.value }))}
                      style={{ padding: '7px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px' }}>
                      <option value="">בחר מרחב</option>
                      {blockSpaces.map((bs: any) => <option key={bs.id} value={bs.id}>{bs.name}</option>)}
                    </select>
                  </div>
                  <textarea value={blockTableForm.note} onChange={e => setBlockTableForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="הערה לטבלה (אופציונלי)" rows={2}
                    style={{ width: '100%', padding: '7px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '12px', resize: 'vertical', boxSizing: 'border-box', marginBottom: '8px' }} />
                  <button onClick={async () => {
                    if (!blockTableForm.name.trim()) return;
                    const payload = { name: blockTableForm.name, block_space_id: blockTableForm.block_space_id || null, note: blockTableForm.note || null, category: blockTableForm.category || null };
                    await fetch(`${API_URL}/block-tables`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    setBlockTableForm({ name: '', block_space_id: '', note: '', category: '' }); loadData();
                  }} style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', padding: '7px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>+ הוסף</button>
                </div>
                {/* Block table edit modal */}
                {editingBlockTable && (
                  <SettingsModal title={`עריכת טבלה: ${editingBlockTable.name}`} onClose={() => { setEditingBlockTable(null); setBlockTableForm({ name: '', block_space_id: '', note: '', category: '' }); }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '140px' }}>
                          <label style={{ display: 'block', marginBottom: '6px', color: '#94a3b8', fontSize: '13px' }}>שם הטבלה:</label>
                          <input value={blockTableForm.name} onChange={e => setBlockTableForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="שם הטבלה" style={{ width: '100%', padding: '9px 12px', background: '#1e293b', border: '1px solid #475569', borderRadius: '7px', color: 'white', fontSize: '14px', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: '120px' }}>
                          <label style={{ display: 'block', marginBottom: '6px', color: '#94a3b8', fontSize: '13px' }}>קטגוריה:</label>
                          <input value={blockTableForm.category} onChange={e => setBlockTableForm(f => ({ ...f, category: e.target.value }))}
                            placeholder="קטגוריה (אופציונלי)" style={{ width: '100%', padding: '9px 12px', background: '#1e293b', border: '1px solid #475569', borderRadius: '7px', color: 'white', fontSize: '14px', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', color: '#94a3b8', fontSize: '13px' }}>מרחב בלוקים:</label>
                        <select value={blockTableForm.block_space_id} onChange={e => setBlockTableForm(f => ({ ...f, block_space_id: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', background: '#1e293b', border: '1px solid #475569', borderRadius: '7px', color: 'white', fontSize: '14px' }}>
                          <option value="">בחר מרחב</option>
                          {blockSpaces.map((bs: any) => <option key={bs.id} value={bs.id}>{bs.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', color: '#94a3b8', fontSize: '13px' }}>הערה:</label>
                        <textarea value={blockTableForm.note} onChange={e => setBlockTableForm(f => ({ ...f, note: e.target.value }))}
                          placeholder="הערה לטבלה (אופציונלי)" rows={3}
                          style={{ width: '100%', padding: '9px 12px', background: '#1e293b', border: '1px solid #475569', borderRadius: '7px', color: 'white', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={async () => {
                          if (!blockTableForm.name.trim()) return;
                          const payload = { name: blockTableForm.name, block_space_id: blockTableForm.block_space_id || null, note: blockTableForm.note || null, category: blockTableForm.category || null };
                          await fetch(`${API_URL}/block-tables/${editingBlockTable.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                          setBlockTableForm({ name: '', block_space_id: '', note: '', category: '' }); setEditingBlockTable(null); loadData();
                        }} style={{ flex: 1, background: '#059669', color: 'white', border: 'none', borderRadius: '7px', padding: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>שמור שינויים</button>
                        <button onClick={() => { setEditingBlockTable(null); setBlockTableForm({ name: '', block_space_id: '', note: '', category: '' }); }} style={{ background: '#475569', color: 'white', border: 'none', borderRadius: '7px', padding: '10px 16px', cursor: 'pointer', fontSize: '14px' }}>ביטול</button>
                      </div>
                    </div>
                  </SettingsModal>
                )}

                {/* Block Tables grouped by category */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {btCategories.map(cat => {
                    const tablesInCat = blockTables.filter((bt: any) => (bt.category || '') === cat);
                    const catLabel = cat || 'ללא קטגוריה';
                    const isCollapsed = collapsedCategories.has(cat);
                    return (
                      <div key={cat || '__none__'}>
                        {/* Category header */}
                        <div onClick={() => setCollapsedCategories(prev => { const s = new Set(prev); s.has(cat) ? s.delete(cat) : s.add(cat); return s; })}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#0a1628', borderRadius: '6px', cursor: 'pointer', marginBottom: isCollapsed ? 0 : '8px', userSelect: 'none' }}>
                          <span style={{ color: '#64748b', fontSize: '13px' }}>{isCollapsed ? '▶' : '▼'}</span>
                          <span style={{ color: cat ? '#a5b4fc' : '#475569', fontWeight: 'bold', fontSize: '13px' }}>{catLabel}</span>
                          <span style={{ color: '#475569', fontSize: '11px' }}>({tablesInCat.length})</span>
                        </div>
                        {!isCollapsed && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '12px' }}>
                            {tablesInCat.map((bt: any) => {
                              const space = blockSpaces.find((bs: any) => bs.id === bt.block_space_id);
                              const btBlocks: any[] = [...(bt.blocks || [])].sort((a: any, b: any) => b.alt_from - a.alt_from);
                              return (
                                <div key={bt.id} id={`block-table-${bt.id}`} style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '8px', padding: '14px' }}>
                                  {/* Table header */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: '14px' }}>{bt.name}</span>
                                        {space && <span style={{ color: '#64748b', fontSize: '11px' }}>מרחב: {space.name}</span>}
                                        {bt.updated_at && <span style={{ color: '#334155', fontSize: '10px' }}>עודכן: {fmtDate(bt.updated_at)}</span>}
                                      </div>
                                      {bt.note && <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px', fontStyle: 'italic' }}>{bt.note}</div>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                      <button onClick={() => { setEditingBlockTable(bt); setBlockTableForm({ name: bt.name, block_space_id: bt.block_space_id || '', note: bt.note || '', category: bt.category || '' }); }} style={{ background: '#1e3a5f', color: '#93c5fd', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>✏️ ערוך</button>
                                      <button title="שכפל טבלה עם כל הבלוקים שלה" onClick={async () => { const res = await fetch(`${API_URL}/block-tables/${bt.id}/duplicate`, { method: 'POST' }); const newBt = await res.json(); await loadData(); setTimeout(() => { const el = document.getElementById(`block-table-${newBt.id}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid #4ade80'; el.style.outlineOffset = '2px'; setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 2000); } }, 300); }} style={{ background: '#1a3a1a', color: '#4ade80', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>⧉ שכפל</button>
                                      <button onClick={async () => { if (!await customConfirm('למחוק טבלה זו?')) return; await fetch(`${API_URL}/block-tables/${bt.id}`, { method: 'DELETE' }); loadData(); }} style={{ background: '#450a0a', color: '#fca5a5', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>🗑️ מחק</button>
                                    </div>
                                  </div>
                                  {/* Blocks side by side with visual painter */}
                                  <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                    <BlockVisualPainter btId={bt.id} existingBlocks={btBlocks} apiUrl={API_URL} onSaved={loadData} />
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                                      {btBlocks.map((blk: any) => {
                                        return (
                                          <div key={blk.id} style={{ background: '#0c1a2e', border: `2px solid ${blk.color || '#3b82f6'}`, borderRadius: '5px', padding: '8px 10px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: blk.color || '#3b82f6', flexShrink: 0 }} />
                                                <span style={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: '12px' }}>{blk.alt_from}–{blk.alt_to}</span>
                                                <span style={{ color: '#cbd5e1', fontSize: '12px', flex: 1 }}>{blk.mission || '—'}</span>
                                                {blk.workstations?.length > 0 && <span style={{ color: '#64748b', fontSize: '10px' }}>({blk.workstations.length} עמדות)</span>}
                                                {blk.updated_at && <span style={{ color: '#334155', fontSize: '9px', whiteSpace: 'nowrap' }}>{fmtDate(blk.updated_at)}</span>}
                                                <button onClick={() => { setEditingBlock(blk); setBlockForm({ alt_from: String(blk.alt_from), alt_to: String(blk.alt_to), mission: blk.mission || '', color: blk.color || '#3b82f6', workstations: Array.isArray(blk.workstations) ? blk.workstations : [], platforms: Array.isArray(blk.platforms) ? blk.platforms : [], note: blk.note || '' }); }} style={{ background: '#1e3a5f', color: '#93c5fd', border: 'none', borderRadius: '3px', padding: '3px 7px', cursor: 'pointer', fontSize: '10px' }}>✏️</button>
                                                <button title="שכפל בלוק" onClick={async () => { await fetch(`${API_URL}/blocks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_table_id: bt.id, alt_from: blk.alt_from, alt_to: blk.alt_to, mission: blk.mission, color: blk.color, workstations: blk.workstations, platforms: blk.platforms, note: blk.note }) }); loadData(); }} style={{ background: '#1a3a1a', color: '#4ade80', border: 'none', borderRadius: '3px', padding: '3px 7px', cursor: 'pointer', fontSize: '10px' }}>⧉</button>
                                                <button onClick={async () => { await fetch(`${API_URL}/blocks/${blk.id}`, { method: 'DELETE' }); loadData(); }} style={{ background: '#450a0a', color: '#fca5a5', border: 'none', borderRadius: '3px', padding: '3px 7px', cursor: 'pointer', fontSize: '10px' }}>🗑️</button>
                                              </div>
                                              {blk.note && <div style={{ color: '#64748b', fontSize: '10px', paddingRight: '20px', fontStyle: 'italic' }}>{blk.note}</div>}
                                            </div>
                                          </div>
                                        );
                                      })}
                                      {/* Add Block Form */}
                                      {blockTableForBlock === bt.id ? (
                                        <div style={{ background: '#0c1a2e', border: '1px dashed #334155', borderRadius: '5px', padding: '10px' }}>
                                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                              <label style={{ color: '#64748b', fontSize: '10px' }}>גובה מ-</label>
                                              <input type="number" value={blockForm.alt_from} onChange={e => setBlockForm(f => ({ ...f, alt_from: e.target.value }))} style={{ width: '70px', padding: '4px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px' }} />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                              <label style={{ color: '#64748b', fontSize: '10px' }}>גובה עד-</label>
                                              <input type="number" value={blockForm.alt_to} onChange={e => setBlockForm(f => ({ ...f, alt_to: e.target.value }))} style={{ width: '70px', padding: '4px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px' }} />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                              <label style={{ color: '#64748b', fontSize: '10px' }}>משימה</label>
                                              <input value={blockForm.mission} onChange={e => setBlockForm(f => ({ ...f, mission: e.target.value }))} style={{ width: '100%', padding: '4px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px' }} />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                              <label style={{ color: '#64748b', fontSize: '10px' }}>צבע</label>
                                              <input type="color" value={blockForm.color} onChange={e => setBlockForm(f => ({ ...f, color: e.target.value }))} style={{ width: '40px', height: '28px', padding: '2px', background: 'none', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }} />
                                            </div>
                                          </div>
                                          <div style={{ marginBottom: '6px' }}>
                                            <label style={{ color: '#64748b', fontSize: '10px', display: 'block', marginBottom: '4px' }}>הערה</label>
                                            <textarea value={blockForm.note} onChange={e => setBlockForm(f => ({ ...f, note: e.target.value }))} rows={2}
                                              style={{ width: '100%', padding: '4px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px', resize: 'vertical', boxSizing: 'border-box' }} />
                                          </div>
                                          <div style={{ marginBottom: '6px' }}>
                                            <label style={{ color: '#64748b', fontSize: '10px', display: 'block', marginBottom: '4px' }}>עמדות שייכות לבלוק</label>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                              {presets.map((p: any) => (
                                                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#1e293b', padding: '3px 7px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}>
                                                  <input type="checkbox" checked={blockForm.workstations.includes(p.id)} onChange={e => setBlockForm(f => ({ ...f, workstations: e.target.checked ? [...f.workstations, p.id] : f.workstations.filter(id => id !== p.id) })) } />
                                                  {p.name}
                                                </label>
                                              ))}
                                            </div>
                                          </div>
                                          <div style={{ marginBottom: '8px' }}>
                                            <label style={{ color: '#64748b', fontSize: '10px', display: 'block', marginBottom: '4px' }}>פלטפורמות (מופרד בפסיק)</label>
                                            <input value={(blockForm.platforms as string[]).join(',')} onChange={e => setBlockForm(f => ({ ...f, platforms: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} placeholder="למשל: F-16, F-35" style={{ width: '100%', padding: '4px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px' }} />
                                          </div>
                                          <div style={{ display: 'flex', gap: '6px' }}>
                                            <button onClick={async () => {
                                              if (!blockForm.alt_from || !blockForm.alt_to) return;
                                              await fetch(`${API_URL}/blocks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_table_id: bt.id, alt_from: Number(blockForm.alt_from), alt_to: Number(blockForm.alt_to), mission: blockForm.mission, color: blockForm.color, workstations: blockForm.workstations, platforms: blockForm.platforms, note: blockForm.note }) });
                                              setBlockForm({ ...emptyBlockForm }); setBlockTableForBlock(null); loadData();
                                            }} style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>+ הוסף בלוק</button>
                                            <button onClick={() => { setBlockTableForBlock(null); setBlockForm({ ...emptyBlockForm }); }} style={{ background: '#475569', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}>ביטול</button>
                                          </div>
                                        </div>
                                      ) : (
                                        <button onClick={() => { setBlockTableForBlock(bt.id); setBlockForm({ ...emptyBlockForm, color: pickDistinctColor(btBlocks) }); setEditingBlock(null); }} style={{ background: 'transparent', color: '#1d4ed8', border: '1px dashed #1d4ed8', borderRadius: '5px', padding: '6px', cursor: 'pointer', fontSize: '12px', width: '100%' }}>+ הוסף בלוק לטבלה</button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {blockTables.length === 0 && <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px' }}>אין טבלאות בלוקים — הוסף טבלה חדשה</div>}
                </div>
              </div>
            </div>
            );
          })()}
          {/* Block edit modal — rendered outside the IIFE so it appears above everything */}
          {/* BDH Management Tab */}
          {activeTab === 'bdh' && (() => {
            const filteredBdh = bdhDocs.filter(doc =>
              !bdhSearchAdmin || doc.name.toLowerCase().includes(bdhSearchAdmin) || doc.category.toLowerCase().includes(bdhSearchAdmin)
            );
            const categories = Array.from(new Set(bdhDocs.map((d: any) => d.category || 'כללי'))).sort() as string[];

            const openCreate = () => {
              setBdhForm({ name: '', category: '', title: '' });
              setBdhItemsEdit([{ content: '', _key: Date.now() }]);
              setEditingBdh({ _new: true });
            };

            const openEditBdh = (doc: any) => {
              setBdhForm({ name: doc.name, category: doc.category || '', title: doc.title || '' });
              setBdhItemsEdit((doc.items || []).map((item: any, idx: number) => ({ id: item.id, content: item.content, is_header: !!item.is_header, _key: item.id + idx })));
              setEditingBdh(doc);
            };

            const saveBdh = async () => {
              if (!bdhForm.name.trim()) return;
              if (editingBdh._new) {
                const res = await fetch(`${API_URL}/bdh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: bdhForm.name, category: bdhForm.category, title: bdhForm.title, created_by: crewMember?.id ?? null, items: bdhItemsEdit.map(i => ({ content: i.content, is_header: !!i.is_header })) }) });
                const newDoc = await res.json();
                setBdhDocs(prev => [...prev, { ...newDoc, items: bdhItemsEdit.map((it, idx) => ({ ...it, id: idx })) }]);
              } else {
                await fetch(`${API_URL}/bdh/${editingBdh.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: bdhForm.name, category: bdhForm.category, title: bdhForm.title, updated_by: crewMember?.id ?? null }) });
                const existingIds = new Set((editingBdh.items || []).map((i: any) => i.id));
                const editIds = new Set(bdhItemsEdit.filter(i => i.id).map(i => i.id));
                for (const ei of (editingBdh.items || [])) { if (!editIds.has(ei.id)) await fetch(`${API_URL}/bdh-items/${ei.id}`, { method: 'DELETE' }); }
                for (let idx = 0; idx < bdhItemsEdit.length; idx++) {
                  const item = bdhItemsEdit[idx];
                  if (item.id && existingIds.has(item.id)) await fetch(`${API_URL}/bdh-items/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: item.content, is_header: !!item.is_header, order_index: idx }) });
                  else await fetch(`${API_URL}/bdh/${editingBdh.id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: item.content, is_header: !!item.is_header, order_index: idx }) });
                }
              }
              await loadData();
              setEditingBdh(null);
            };

            const inputStyle = { width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl' as const, boxSizing: 'border-box' as const };
            const labelStyle = { display: 'block' as const, color: '#94a3b8', fontSize: '11px', marginBottom: '4px' };

            return (
              <div style={{ display: 'flex', gap: '20px', direction: 'rtl' }}>
                {/* List */}
                <div style={{ width: '240px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                    <input value={bdhSearchAdmin} onChange={e => setBdhSearchAdmin(e.target.value)} placeholder='חיפוש...' style={{ flex: 1, padding: '6px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl' }} />
                    <button onClick={openCreate} style={{ background: '#059669', color: 'white', border: 'none', borderRadius: '5px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}>+ חדש</button>
                  </div>
                  {categories.map(cat => (
                    <div key={cat} style={{ marginBottom: '10px' }}>
                      <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', paddingRight: '2px' }}>{cat || 'כללי'}</div>
                      {filteredBdh.filter((d: any) => (d.category || 'כללי') === cat).map((doc: any) => (
                        <div key={doc.id} onClick={() => openEditBdh(doc)}
                          style={{ padding: '7px 10px', background: editingBdh?.id === doc.id ? '#1e3a5f' : '#0f172a', border: `1px solid ${editingBdh?.id === doc.id ? '#3b82f6' : '#1e293b'}`, borderRadius: '5px', marginBottom: '3px', cursor: 'pointer' }}>
                          <div style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>{doc.name}</div>
                          <div style={{ color: '#64748b', fontSize: '10px' }}>{(doc.items || []).length} סעיפים</div>
                        </div>
                      ))}
                    </div>
                  ))}
                  {bdhDocs.length === 0 && <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '16px 0' }}>אין בד"ח עדיין</div>}
                </div>

                {/* Editor */}
                {editingBdh ? (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '140px' }}>
                        <label style={labelStyle}>שם הבד"ח *</label>
                        <input value={bdhForm.name} onChange={e => setBdhForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                      </div>
                      <div style={{ flex: 1, minWidth: '120px' }}>
                        <label style={labelStyle}>קטגוריה</label>
                        <input value={bdhForm.category} onChange={e => setBdhForm(f => ({ ...f, category: e.target.value }))} placeholder='לדוגמה: תרגילים, נהלים...' style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ marginBottom: '14px' }}>
                      <label style={labelStyle}>כותרת (מוצגת בראש הבד"ח)</label>
                      <input value={bdhForm.title} onChange={e => setBdhForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
                    </div>

                    {/* Items — compact table with drag-and-drop */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={labelStyle}>סעיפים וכותרות</label>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => setBdhItemsEdit(prev => [...prev, { content: '', is_header: true, _key: Date.now() + Math.random() }])}
                            style={{ background: '#1e3a5f', color: '#93c5fd', border: '1px solid #334155', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}>+ כותרת</button>
                          <button onClick={() => setBdhItemsEdit(prev => [...prev, { content: '', is_header: false, _key: Date.now() + Math.random() }])}
                            style={{ background: '#14432a', color: '#86efac', border: '1px solid #166534', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}>+ סעיף</button>
                        </div>
                      </div>
                      {bdhItemsEdit.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '18px 22px 1fr 44px 52px', gap: '0', background: '#0c1626', borderRadius: '4px 4px 0 0', borderBottom: '1px solid #334155', padding: '2px 4px' }}>
                          <span style={{ color: '#475569', fontSize: '9px', textAlign: 'center' }}>⠿</span>
                          <span style={{ color: '#475569', fontSize: '9px', textAlign: 'center' }}>#</span>
                          <span style={{ color: '#475569', fontSize: '9px' }}>תוכן</span>
                          <span style={{ color: '#475569', fontSize: '9px', textAlign: 'center' }}>פעולות</span>
                          <span style={{ color: '#475569', fontSize: '9px', textAlign: 'center' }}>עיצוב</span>
                        </div>
                      )}
                      <div style={{ border: bdhItemsEdit.length > 0 ? '1px solid #334155' : 'none', borderTop: 'none', borderRadius: '0 0 4px 4px', overflow: 'hidden' }}>
                        {bdhItemsEdit.map((item, idx) => (
                          <div
                            key={item._key}
                            draggable
                            onDragStart={() => { bdhDragIdxRef.current = idx; }}
                            onDragOver={e => { e.preventDefault(); setBdhDragOver(idx); }}
                            onDragLeave={() => setBdhDragOver(null)}
                            onDrop={e => {
                              e.preventDefault();
                              const from = bdhDragIdxRef.current;
                              if (from === null || from === idx) { bdhDragIdxRef.current = null; setBdhDragOver(null); return; }
                              setBdhItemsEdit(prev => {
                                const a = [...prev];
                                const [removed] = a.splice(from, 1);
                                a.splice(from < idx ? idx - 1 : idx, 0, removed);
                                return a;
                              });
                              bdhDragIdxRef.current = null;
                              setBdhDragOver(null);
                            }}
                            onDragEnd={() => { bdhDragIdxRef.current = null; setBdhDragOver(null); }}
                            style={{ display: 'grid', gridTemplateColumns: '18px 22px 1fr 44px 52px', gap: '0', alignItems: 'center', background: bdhDragOver === idx ? '#1e3a5f' : (item.is_header ? '#1a2e4a' : (idx % 2 === 0 ? '#0f172a' : '#0c1626')), borderBottom: idx < bdhItemsEdit.length - 1 ? '1px solid #1e293b' : 'none', minHeight: '28px', borderTop: bdhDragOver === idx ? '2px solid #3b82f6' : 'none', cursor: 'grab' }}
                          >
                            {/* Drag handle */}
                            <span style={{ color: '#334155', fontSize: '11px', textAlign: 'center', userSelect: 'none' }}>⠿</span>
                            {/* Type indicator + per-header add button */}
                            {item.is_header ? (
                              <button
                                onClick={() => {
                                  const newItem = { content: '', is_header: false, _key: Date.now() + Math.random() };
                                  setBdhItemsEdit(prev => { const a = [...prev]; a.splice(idx + 1, 0, newItem); return a; });
                                }}
                                title="הוסף סעיף תחת כותרת זו"
                                style={{ background: 'none', border: 'none', color: '#86efac', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', padding: '0', textAlign: 'center' }}>+</button>
                            ) : (
                              <span style={{ color: '#475569', fontSize: '9px', fontWeight: 'bold', textAlign: 'center' }}>{idx + 1}</span>
                            )}
                            {/* Content */}
                            <div
                              contentEditable suppressContentEditableWarning
                              onBlur={e => { const html = e.currentTarget.innerHTML; setBdhItemsEdit(prev => prev.map((it, i) => i === idx ? { ...it, content: html } : it)); }}
                              dangerouslySetInnerHTML={{ __html: item.content }}
                              style={{ padding: '4px 6px', color: item.is_header ? '#93c5fd' : 'white', fontWeight: item.is_header ? 'bold' : 'normal', fontSize: '12px', minHeight: '24px', outline: 'none', direction: 'rtl', lineHeight: '1.5', background: 'transparent', width: '100%', boxSizing: 'border-box' as const, cursor: 'text' }}
                            />
                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '1px', justifyContent: 'center', padding: '0 2px' }}>
                              <button onClick={() => setBdhItemsEdit(prev => prev.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: '1px 3px' }}>✕</button>
                            </div>
                            {/* Format buttons */}
                            <div style={{ display: 'flex', gap: '1px', justifyContent: 'center', padding: '0 2px' }}>
                              {!item.is_header && <>
                                <button onMouseDown={e => { e.preventDefault(); document.execCommand('bold'); }} title="B" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 'bold', fontSize: '10px', padding: '1px 3px' }}>B</button>
                                <button onMouseDown={e => { e.preventDefault(); document.execCommand('italic'); }} title="I" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontStyle: 'italic', fontSize: '10px', padding: '1px 3px' }}>I</button>
                                <button onMouseDown={e => { e.preventDefault(); document.execCommand('underline'); }} title="U" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', textDecoration: 'underline', fontSize: '10px', padding: '1px 3px' }}>U</button>
                              </>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {bdhItemsEdit.length === 0 && <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '10px 0' }}>לחץ "+ כותרת" או "+ סעיף" להוספת תוכן</div>}
                    </div>

                    {/* Preset assignment */}
                    <div style={{ marginBottom: '14px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '8px', fontWeight: 'bold' }}>שיוך לעמדות</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {presets.map((p: any) => {
                          const curIds = (bdhPresetAssignments[p.id] || []).map(Number);
                          const isLinked = editingBdh && !editingBdh._new && curIds.includes(Number(editingBdh.id));
                          return (
                            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: editingBdh._new ? 'not-allowed' : 'pointer', color: '#cbd5e1', fontSize: '11px', background: isLinked ? '#14432a' : '#1e293b', border: `1px solid ${isLinked ? '#166534' : '#334155'}`, borderRadius: '4px', padding: '3px 8px' }}>
                              <input type="checkbox" checked={!!isLinked} disabled={!!editingBdh._new}
                                onChange={async e => {
                                  if (editingBdh._new) return;
                                  const newIds = e.target.checked ? [...curIds, Number(editingBdh.id)] : curIds.filter((id: number) => id !== Number(editingBdh.id));
                                  await fetch(`${API_URL}/presets/${p.id}/bdh`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bdh_ids: newIds }) });
                                  setBdhPresetAssignments(prev => ({ ...prev, [p.id]: newIds }));
                                }}
                              />
                              {p.name}
                            </label>
                          );
                        })}
                      </div>
                      {editingBdh._new && <div style={{ color: '#475569', fontSize: '10px', marginTop: '6px' }}>שמור קודם — לאחר מכן ניתן לשייך לעמדות</div>}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={saveBdh} style={{ flex: 1, background: '#059669', color: 'white', border: 'none', borderRadius: '7px', padding: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>{editingBdh._new ? '✅ צור בד"ח' : '💾 שמור שינויים'}</button>
                      {!editingBdh._new && <button onClick={async () => { if (!await customConfirm('למחוק בד"ח זה?')) return; await fetch(`${API_URL}/bdh/${editingBdh.id}`, { method: 'DELETE' }); await loadData(); setEditingBdh(null); }} style={{ background: '#450a0a', color: '#fca5a5', border: 'none', borderRadius: '7px', padding: '10px 14px', cursor: 'pointer', fontSize: '13px' }}>🗑️</button>}
                      <button onClick={() => setEditingBdh(null)} style={{ background: '#334155', color: 'white', border: 'none', borderRadius: '7px', padding: '10px 14px', cursor: 'pointer', fontSize: '13px' }}>ביטול</button>
                    </div>
                    {!editingBdh._new && editingBdh.updated_at && (
                      <div style={{ marginTop: '8px', color: '#475569', fontSize: '10px' }}>
                        עדכון: {new Date(editingBdh.updated_at).toLocaleString('he-IL')}{editingBdh.updater_name ? ` ← ${editingBdh.updater_name}` : ''}
                        {editingBdh.creator_name && ` | נוצר: ${editingBdh.creator_name}`}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: '14px' }}>בחר בד"ח לעריכה או לחץ "+ חדש"</div>
                )}
              </div>
            );
          })()}

          {activeTab === 'classic_strips' && (() => {
            const ROW_ALIGN_OPTS = [{ val: 'center', label: 'מרכז' }, { val: 'right', label: 'ימין' }, { val: 'left', label: 'שמאל' }];
            const startNew = () => {
              setEditingClassicTable(null);
              setClassicTableForm({ name: '', description: '' });
              setClassicTableRows([
                { row_number: 1, field_name: 'callSign', fields: [], separator: ' / ', row_label: '', editable: false, text_color: '', bg_color: '', font_size: 12, bold: true, italic: false, underline: false, text_align: 'center' },
                { row_number: 2, field_name: 'alt', fields: [], separator: ' / ', row_label: '', editable: true, text_color: '', bg_color: '', font_size: 12, bold: false, italic: false, underline: false, text_align: 'center' },
                { row_number: 3, field_name: 'task', fields: [], separator: ' / ', row_label: '', editable: false, text_color: '', bg_color: '', font_size: 12, bold: false, italic: false, underline: false, text_align: 'center' },
              ]);
            };
            const startEdit = (ct: any) => {
              setEditingClassicTable(ct);
              setClassicTableForm({ name: ct.name, description: ct.description || '' });
              const baseRows = (ct.rows || []).sort((a: any, b: any) => a.row_number - b.row_number);
              setClassicTableRows([1, 2, 3].map(rn => {
                const r = baseRows.find((x: any) => x.row_number === rn) || {};
                return { row_number: rn, field_name: r.field_name || '', fields: Array.isArray(r.fields) ? r.fields : [], separator: r.separator || ' / ', row_label: r.row_label || '', editable: r.editable ?? false, text_color: r.text_color || '', bg_color: r.bg_color || '', font_size: r.font_size || 12, bold: r.bold ?? false, italic: r.italic ?? false, underline: r.underline ?? false, text_align: r.text_align || 'center' };
              }));
            };
            const saveTable = async () => {
              if (!classicTableForm.name.trim()) return;
              try {
                let tableId: number;
                if (editingClassicTable) {
                  await fetch(`${API_URL}/classic-strip-tables/${editingClassicTable.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: classicTableForm.name, description: classicTableForm.description }) });
                  tableId = editingClassicTable.id;
                } else {
                  const r = await fetch(`${API_URL}/classic-strip-tables`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: classicTableForm.name, description: classicTableForm.description }) });
                  const created = await r.json();
                  tableId = created.id;
                }
                await fetch(`${API_URL}/classic-strip-tables/${tableId}/rows`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: classicTableRows }) });
                const updatedTables = await fetch(`${API_URL}/classic-strip-tables`).then(r => r.ok ? r.json() : []);
                setClassicTables(updatedTables);
                if (editingClassicTable) {
                  const refreshed = updatedTables.find((t: any) => t.id === tableId);
                  if (refreshed) startEdit(refreshed);
                } else {
                  startNew();
                }
              } catch (e) { console.error(e); }
            };
            const deleteTable = async (id: number) => {
              if (!await customConfirm('למחוק תבנית זו?')) return;
              await fetch(`${API_URL}/classic-strip-tables/${id}`, { method: 'DELETE' });
              fetch(`${API_URL}/classic-strip-tables`).then(r => r.ok ? r.json() : []).then(setClassicTables);
              startNew();
            };
            const updateRow = (idx: number, changes: Partial<typeof classicTableRows[0]>) => setClassicTableRows(rows => rows.map((r, i) => i === idx ? { ...r, ...changes } : r));

            return (
              <div style={{ display: 'flex', gap: '16px', direction: 'rtl' }}>
                {/* Left: table list */}
                <div style={{ width: '200px', flexShrink: 0, position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#94a3b8' }}>תבניות ({classicTables.length})</span>
                    <button onClick={() => { setShowNewModePicker(true); setNewCivilTableName(''); }} style={{ padding: '4px 10px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>+ חדש</button>
                  </div>

                  {/* Mode picker popup */}
                  {showNewModePicker && (
                    <div onClick={() => setShowNewModePicker(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div onClick={e => e.stopPropagation()} style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: '12px', padding: '24px', width: '360px', direction: 'rtl', color: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#93c5fd', textAlign: 'center' }}>בחר סוג תבנית חדשה</div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          {/* 3 rows mode */}
                          <button onClick={() => { setShowNewModePicker(false); startNew(); }}
                            style={{ flex: 1, padding: '16px 8px', background: '#0f172a', border: '2px solid #334155', borderRadius: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#e2e8f0', transition: 'border-color 0.2s' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = '#3b82f6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#334155')}>
                            <span style={{ fontSize: '28px' }}>🗂</span>
                            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>3 שורות</span>
                            <span style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>תבנית סטריפ רגיל עם 3 שורות מוגדרות</span>
                          </button>
                          {/* Civil/grid mode */}
                          <div style={{ flex: 1, padding: '16px 8px', background: '#0f172a', border: '2px solid #334155', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#e2e8f0' }}>
                            <span style={{ fontSize: '28px' }}>📐</span>
                            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>מוד אזרחי</span>
                            <span style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>גריד חופשי עם עורך ויזואלי</span>
                            <input value={newCivilTableName} onChange={e => setNewCivilTableName(e.target.value)}
                              placeholder="שם התבנית..."
                              onKeyDown={async e => {
                                if (e.key === 'Enter' && newCivilTableName.trim()) {
                                  e.preventDefault();
                                  try {
                                    const r = await fetch(`${API_URL}/classic-strip-tables`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCivilTableName.trim(), mode: 'civil' }) });
                                    if (!r.ok) { alert('שגיאה ביצירת תבנית: ' + r.status); return; }
                                    const created = await r.json();
                                    const updated = await fetch(`${API_URL}/classic-strip-tables`).then(r2 => r2.ok ? r2.json() : []);
                                    setClassicTables(updated);
                                    setShowNewModePicker(false);
                                    if (created?.id) setSgEditorTableId(created.id);
                                  } catch (err) { alert('שגיאה: ' + String(err)); }
                                }
                              }}
                              style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box' as const }} />
                            <button disabled={!newCivilTableName.trim()}
                              onClick={async () => {
                                if (!newCivilTableName.trim()) return;
                                try {
                                  const r = await fetch(`${API_URL}/classic-strip-tables`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCivilTableName.trim(), mode: 'civil' }) });
                                  if (!r.ok) { alert('שגיאה ביצירת תבנית: ' + r.status); return; }
                                  const created = await r.json();
                                  const updated = await fetch(`${API_URL}/classic-strip-tables`).then(r2 => r2.ok ? r2.json() : []);
                                  setClassicTables(updated);
                                  setShowNewModePicker(false);
                                  if (created?.id) setSgEditorTableId(created.id);
                                } catch (err) { alert('שגיאה: ' + String(err)); }
                              }}
                              style={{ width: '100%', padding: '5px 8px', background: newCivilTableName.trim() ? '#1d4ed8' : '#1e293b', border: 'none', borderRadius: '6px', color: newCivilTableName.trim() ? 'white' : '#475569', cursor: newCivilTableName.trim() ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: 'bold' }}>צור ופתח עורך</button>
                          </div>
                        </div>
                        <button onClick={() => setShowNewModePicker(false)} style={{ alignSelf: 'center', padding: '4px 14px', background: 'transparent', border: '1px solid #334155', borderRadius: '6px', color: '#64748b', cursor: 'pointer', fontSize: '12px' }}>ביטול</button>
                      </div>
                    </div>
                  )}

                  {classicTables.map((ct: any) => {
                    const isCivil = ct.mode === 'civil';
                    const isSelected = editingClassicTable?.id === ct.id || sgEditorTableId === ct.id;
                    return (
                      <div key={ct.id} style={{ marginBottom: '4px', borderRadius: '6px', background: isSelected ? '#1e3a5f' : '#0f172a', border: `1px solid ${isSelected ? '#3b82f6' : '#1e293b'}`, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                        {/* Main clickable area */}
                        <div onClick={() => { if (isCivil) { setEditingClassicTable(null); setSgEditorTableId(ct.id); } else { startEdit(ct); setSgEditorTableId(null); } }}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', cursor: 'pointer', minWidth: 0 }}>
                          <span title={isCivil ? 'מוד אזרחי' : '3 שורות'} style={{ fontSize: '13px', flexShrink: 0 }}>{isCivil ? '📐' : '🗂'}</span>
                          <span style={{ flex: 1, color: isSelected ? '#93c5fd' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ct.name}</span>
                        </div>
                        {/* Rename button (civil only — 3-row form already has name field) */}
                        {isCivil && (
                          <button title="שנה שם" onClick={async e => {
                            e.stopPropagation();
                            const newName = window.prompt('שם חדש לתבנית:', ct.name);
                            if (!newName?.trim() || newName.trim() === ct.name) return;
                            const r = await fetch(`${API_URL}/classic-strip-tables/${ct.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }) });
                            if (r.status === 409) { alert('שם תבנית כבר קיים'); return; }
                            const updated = await fetch(`${API_URL}/classic-strip-tables`).then(r2 => r2.ok ? r2.json() : []);
                            setClassicTables(updated);
                          }} style={{ padding: '3px 5px', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}>✎</button>
                        )}
                        {/* Delete button */}
                        <button title="מחק תבנית" onClick={e => { e.stopPropagation(); deleteTable(ct.id); }}
                          style={{ padding: '3px 5px', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px', flexShrink: 0, marginLeft: '2px' }}>🗑</button>
                      </div>
                    );
                  })}
                  {classicTables.length === 0 && <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>אין תבניות</div>}

                  {sgEditorTableId && (() => { const tbl = classicTables.find(x => x.id === sgEditorTableId); return tbl ? (
                    <StripGridEditor tableId={tbl.id} tableName={tbl.name} apiUrl={API_URL} onClose={() => setSgEditorTableId(null)} onSaved={updated => { setClassicTables(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t)); setSgEditorTableId(null); }} />
                  ) : null; })()}
                </div>

                {/* Right: form */}
                <div style={{ flex: 1, background: '#0f172a', borderRadius: '8px', padding: '18px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#93c5fd', marginBottom: '14px' }}>
                    {editingClassicTable ? `עריכת תבנית: ${editingClassicTable.name}` : 'תבנית חדשה'}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>שם תבנית</label>
                        <input value={classicTableForm.name} onChange={e => setClassicTableForm(p => ({ ...p, name: e.target.value }))}
                          placeholder="לדוגמה: מרחב א׳" style={{ width: '100%', padding: '7px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>תיאור (אופציונלי)</label>
                        <input value={classicTableForm.description} onChange={e => setClassicTableForm(p => ({ ...p, description: e.target.value }))}
                          placeholder="הערה קצרה" style={{ width: '100%', padding: '7px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, width: '140px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textAlign: 'center' }}>תצוגה מקדימה</div>
                      <div style={{ transform: 'scale(0.9)', transformOrigin: 'top center' }}>
                        <ClassicStripCard
                          strip={{ callSign: 'F-16', sq: '101', alt: 'FL200', task: 'CAS', takeoff_time: '0800', notes: '' }}
                          rows={classicTableRows}
                          lightMode={false}
                        />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* 3 Row configs */}
                    {classicTableRows.map((row, idx) => {
                      const activeFields: { field_name: string; separator?: string; [k: string]: any }[] =
                        row.fields && row.fields.length > 0 ? row.fields : (row.field_name ? [{ field_name: row.field_name }] : []);
                      const setRowFields = (newFields: { field_name: string; separator?: string; [k: string]: any }[]) => {
                        updateRow(idx, { fields: newFields, field_name: newFields[0]?.field_name || '' });
                      };
                      return (
                      <div key={idx} style={{ background: '#1e293b', borderRadius: '7px', padding: '12px', border: '1px solid #334155' }}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#60a5fa', marginBottom: '8px' }}>שורה {row.row_number}</div>

                        {/* Fields list */}
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '5px' }}>שדות בשורה זו:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            {activeFields.map((f: any, fi: number) => (<React.Fragment key={fi}>
                              {fi > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', direction: 'rtl' }}>
                                  <div style={{ flex: 1, borderTop: '1px dashed #334155' }} />
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '2px 8px' }}>
                                    <span style={{ fontSize: '10px', color: '#64748b' }}>מפריד:</span>
                                    <input value={(activeFields[fi - 1] as any).separator ?? ' / '} onChange={e => { const updated = [...activeFields]; updated[fi - 1] = { ...updated[fi - 1], separator: e.target.value }; setRowFields(updated); }}
                                      style={{ width: '44px', padding: '1px 4px', background: '#0f172a', border: 'none', borderRadius: '4px', color: '#94a3b8', fontSize: '11px', textAlign: 'center', outline: 'none' }} />
                                  </div>
                                  <div style={{ flex: 1, borderTop: '1px dashed #334155' }} />
                                </div>
                              )}
                              <div style={{ background: '#0a1628', borderRadius: '5px', padding: '6px 8px', border: '1px solid #1e293b', marginBottom: fi < activeFields.length - 1 ? '0' : '4px' }}>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '5px' }}>
                                  <select value={f.field_name}
                                    onChange={e => { const updated = [...activeFields]; updated[fi] = { ...f, field_name: e.target.value }; setRowFields(updated); }}
                                    style={{ flex: 1, padding: '4px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl' }}>
                                    {CLASSIC_STRIP_FIELDS.map(f2 => <option key={f2.key} value={f2.key}>{f2.label}</option>)}
                                  </select>
                                  <button
                                    title={f.editable ? 'שדה זה ניתן לעריכה ע"י המשתמש (לחץ לביטול)' : 'הפוך שדה זה לניתן עריכה ע"י המשתמש'}
                                    onClick={() => { const updated = [...activeFields]; updated[fi] = { ...f, editable: !f.editable }; setRowFields(updated); }}
                                    style={{ padding: '3px 7px', border: `1px solid ${f.editable ? '#059669' : '#334155'}`, background: f.editable ? '#052e16' : '#0f172a', color: f.editable ? '#34d399' : '#475569', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✏</button>
                                  <button onClick={() => setRowFields(activeFields.filter((_: any, i: number) => i !== fi))}
                                    style={{ padding: '3px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>×</button>
                                </div>
                                {/* Per-field styling row */}
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                                    <span style={{ fontSize: '9px', color: '#64748b' }}>טקסט</span>
                                    <input type="color" value={f.text_color || '#e2e8f0'}
                                      onChange={e => { const updated = [...activeFields]; updated[fi] = { ...f, text_color: e.target.value }; setRowFields(updated); }}
                                      title="צבע טקסט שדה"
                                      style={{ width: '28px', height: '24px', padding: '1px', background: 'transparent', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }} />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                                    <span style={{ fontSize: '9px', color: '#64748b' }}>רקע</span>
                                    <input type="color" value={f.bg_color || '#1e293b'}
                                      onChange={e => { const updated = [...activeFields]; updated[fi] = { ...f, bg_color: e.target.value }; setRowFields(updated); }}
                                      title="צבע רקע שדה"
                                      style={{ width: '28px', height: '24px', padding: '1px', background: 'transparent', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }} />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                                    <span style={{ fontSize: '9px', color: '#64748b' }}>גודל</span>
                                    <input type="number" value={f.font_size || ''} placeholder="–"
                                      onChange={e => { const updated = [...activeFields]; updated[fi] = { ...f, font_size: e.target.value ? Number(e.target.value) : undefined }; setRowFields(updated); }}
                                      style={{ width: '40px', padding: '3px 4px', background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '11px', textAlign: 'center' }} />
                                  </div>
                                  {[{ key: 'bold', label: 'ב' }, { key: 'italic', label: 'נ' }, { key: 'underline', label: 'ק' }].map(t => (
                                    <button key={t.key}
                                      onClick={() => { const updated = [...activeFields]; updated[fi] = { ...f, [t.key]: !f[t.key] }; setRowFields(updated); }}
                                      style={{ padding: '3px 7px', borderRadius: '4px', border: `1px solid ${f[t.key] ? '#6366f1' : '#334155'}`, background: f[t.key] ? '#1e1b4b' : '#0f172a', color: f[t.key] ? '#a5b4fc' : '#64748b', cursor: 'pointer', fontSize: '11px', fontWeight: t.key === 'bold' ? 'bold' : 'normal', fontStyle: t.key === 'italic' ? 'italic' : 'normal', textDecoration: t.key === 'underline' ? 'underline' : 'none', marginTop: '10px' }}>
                                      {t.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </React.Fragment>))}
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                              <button onClick={() => setRowFields([...activeFields, { field_name: '', separator: ' / ' }])}
                                style={{ padding: '3px 10px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+ שדה</button>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>גודל</span>
                            <input type="number" value={row.font_size} onChange={e => updateRow(idx, { font_size: Number(e.target.value) })}
                              style={{ width: '55px', padding: '5px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px' }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>יישור</span>
                            <select value={row.text_align} onChange={e => updateRow(idx, { text_align: e.target.value })}
                              style={{ padding: '5px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl' }}>
                              {ROW_ALIGN_OPTS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                            </select>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>צבע טקסט</span>
                            <input type="color" value={row.text_color || '#e2e8f0'} onChange={e => updateRow(idx, { text_color: e.target.value })}
                              style={{ width: '36px', height: '30px', padding: '2px', background: 'transparent', border: '1px solid #334155', borderRadius: '5px', cursor: 'pointer' }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>צבע רקע</span>
                            <input type="color" value={row.bg_color || '#1e293b'} onChange={e => updateRow(idx, { bg_color: e.target.value })}
                              style={{ width: '36px', height: '30px', padding: '2px', background: 'transparent', border: '1px solid #334155', borderRadius: '5px', cursor: 'pointer' }} />
                          </div>
                          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            {[{ key: 'bold', label: 'ב' }, { key: 'italic', label: 'נ' }, { key: 'underline', label: 'ק' }, { key: 'editable', label: '✏️' }].map(t => (
                              <button key={t.key} onClick={() => updateRow(idx, { [t.key]: !row[t.key as keyof typeof row] })}
                                style={{ padding: '4px 8px', borderRadius: '4px', border: `1px solid ${row[t.key as keyof typeof row] ? '#6366f1' : '#334155'}`, background: row[t.key as keyof typeof row] ? '#1e1b4b' : '#0f172a', color: row[t.key as keyof typeof row] ? '#a5b4fc' : '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: t.key === 'bold' ? 'bold' : 'normal', fontStyle: t.key === 'italic' ? 'italic' : 'normal', textDecoration: t.key === 'underline' ? 'underline' : 'none' }}>
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      );
                    })}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <button onClick={saveTable}
                        style={{ padding: '8px 20px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                        {editingClassicTable ? 'עדכן' : 'שמור'}
                      </button>
                      {editingClassicTable && (
                        <button onClick={() => deleteTable(editingClassicTable.id)}
                          style={{ padding: '8px 16px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                          מחק
                        </button>
                      )}
                      <button onClick={startNew}
                        style={{ padding: '8px 14px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                        נקה
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {activeTab === 'blocks' && editingBlock && (
            <SettingsModal title={`עריכת בלוק: ${editingBlock.alt_from}–${editingBlock.alt_to} ${editingBlock.mission ? '(' + editingBlock.mission + ')' : ''}`} onClose={() => setEditingBlock(null)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ color: '#94a3b8', fontSize: '13px' }}>גובה מ-</label>
                    <input type="number" value={blockForm.alt_from} onChange={e => setBlockForm(f => ({ ...f, alt_from: e.target.value }))} style={{ width: '90px', padding: '8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '14px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ color: '#94a3b8', fontSize: '13px' }}>גובה עד-</label>
                    <input type="number" value={blockForm.alt_to} onChange={e => setBlockForm(f => ({ ...f, alt_to: e.target.value }))} style={{ width: '90px', padding: '8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '14px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '120px' }}>
                    <label style={{ color: '#94a3b8', fontSize: '13px' }}>משימה</label>
                    <input value={blockForm.mission} onChange={e => setBlockForm(f => ({ ...f, mission: e.target.value }))} style={{ width: '100%', padding: '8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '14px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ color: '#94a3b8', fontSize: '13px' }}>צבע</label>
                    <input type="color" value={blockForm.color} onChange={e => setBlockForm(f => ({ ...f, color: e.target.value }))} style={{ width: '48px', height: '36px', padding: '2px', background: 'none', border: '1px solid #475569', borderRadius: '6px', cursor: 'pointer' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', color: '#94a3b8', fontSize: '13px' }}>הערה</label>
                  <textarea value={blockForm.note} onChange={e => setBlockForm(f => ({ ...f, note: e.target.value }))} rows={3}
                    style={{ width: '100%', padding: '8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '13px' }}>עמדות שייכות לבלוק זה</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {presets.map((p: any) => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: blockForm.workstations.includes(p.id) ? '#1e3a5f' : '#1e293b', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: blockForm.workstations.includes(p.id) ? '#93c5fd' : '#cbd5e1', border: `1px solid ${blockForm.workstations.includes(p.id) ? '#3b82f6' : '#334155'}` }}>
                        <input type="checkbox" checked={blockForm.workstations.includes(p.id)} onChange={e => setBlockForm(f => ({ ...f, workstations: e.target.checked ? [...f.workstations, p.id] : f.workstations.filter((wid: any) => wid !== p.id) }))} style={{ accentColor: '#3b82f6' }} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', color: '#94a3b8', fontSize: '13px' }}>פלטפורמות (מופרדות בפסיק)</label>
                  <input value={(blockForm.platforms as string[]).join(',')} onChange={e => setBlockForm(f => ({ ...f, platforms: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} placeholder="למשל: F-16, F-35" style={{ width: '100%', padding: '8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                  <button onClick={async () => {
                    await fetch(`${API_URL}/blocks/${editingBlock.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alt_from: Number(blockForm.alt_from), alt_to: Number(blockForm.alt_to), mission: blockForm.mission, color: blockForm.color, workstations: blockForm.workstations, platforms: blockForm.platforms, note: blockForm.note }) });
                    setEditingBlock(null); loadData();
                  }} style={{ flex: 1, background: '#059669', color: 'white', border: 'none', borderRadius: '7px', padding: '11px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold' }}>שמור שינויים</button>
                  <button onClick={() => setEditingBlock(null)} style={{ background: '#475569', color: 'white', border: 'none', borderRadius: '7px', padding: '11px 18px', cursor: 'pointer', fontSize: '14px' }}>ביטול</button>
                </div>
              </div>
            </SettingsModal>
          )}


        {/* Airfields Tab */}
        {activeTab === 'airfields' && (() => {
          const loadAirfieldPolygons = async (airfieldId: number) => {
            const r = await fetch(`${API_URL}/airfield-polygons?airfield_id=${airfieldId}`);
            if (r.ok) setAdminAirfieldPolygons(await r.json());
            else setAdminAirfieldPolygons([]);
          };
          const loadAirfieldSectors = async (airfieldId: number) => {
            const r = await fetch(`${API_URL}/airfield-sectors?airfield_id=${airfieldId}`);
            if (r.ok) setAdminAirfieldSectors(await r.json());
            else setAdminAirfieldSectors([]);
          };
          const loadAirfieldStatusTypes = async (airfieldId: number) => {
            const r = await fetch(`${API_URL}/airfield-status-types?airfield_id=${airfieldId}`);
            if (r.ok) setAdminAirfieldStatusTypes(await r.json());
            else setAdminAirfieldStatusTypes([]);
          };
          const loadAirfieldElements = async (airfieldId: number) => {
            const r = await fetch(`${API_URL}/airfield-elements?airfield_id=${airfieldId}`);
            if (r.ok) setAdminAirfieldElements(await r.json());
            else setAdminAirfieldElements([]);
          };
          const loadAdminAirfieldTaxiways = async (airfieldId: number) => {
            const r = await fetch(`${API_URL}/airfield-taxiways?airfield_id=${airfieldId}`);
            setAdminAirfieldTaxiways(r.ok ? await r.json() : []);
          };
          const loadAirfieldRunways = async (airfieldId: number) => {
            const [rr, nr, gr] = await Promise.all([
              fetch(`${API_URL}/airfield-runways?airfield_id=${airfieldId}`),
              fetch(`${API_URL}/runway-notams?airfield_id=${airfieldId}`),
              fetch(`${API_URL}/runway-grf?airfield_id=${airfieldId}`)
            ]);
            const runways = rr.ok ? await rr.json() : [];
            const allNotams: any[] = nr.ok ? await nr.json() : [];
            const allGrf: any[] = gr.ok ? await gr.json() : [];
            setAdminAirfieldRunways(runways);
            const byRunway: Record<number, any[]> = {};
            for (const n of allNotams) { if (!byRunway[n.runway_id]) byRunway[n.runway_id] = []; byRunway[n.runway_id].push(n); }
            setAdminRunwayNotams(byRunway);
            const grfByKey: Record<string, any> = {};
            for (const g of allGrf) { grfByKey[`${g.runway_id}_${g.heading}`] = g; }
            setAdminRunwayGrf(grfByKey);
          };
          const loadAirfieldPoints = async (airfieldId: number) => {
            setAdminSelMapSrc(null);
            const [ptRes, afRes] = await Promise.all([
              fetch(`${API_URL}/airfields/${airfieldId}/points`),
              fetch(`${API_URL}/airfields/${airfieldId}`),
            ]);
            if (ptRes.ok) setAirfieldPoints(await ptRes.json());
            else setAirfieldPoints([]);
            if (afRes.ok) {
              const afData = await afRes.json();
              if (afData.map_id) {
                const mr = await fetch(`${API_URL}/maps/${afData.map_id}`);
                if (mr.ok) { const md = await mr.json(); setAdminSelMapSrc(md.image_data || null); setAdminAirfieldMapData(md); }
                else { setAdminAirfieldMapData(null); }
              } else { setAdminAirfieldMapData(null); }
            }
            await loadAirfieldElements(airfieldId);
            await loadAirfieldPolygons(airfieldId);
            await loadAirfieldSectors(airfieldId);
            await loadAirfieldStatusTypes(airfieldId);
            await loadAirfieldRunways(airfieldId);
            loadAdminAirfieldTaxiways(airfieldId);
            fetch(`${API_URL}/route-links?airfield_id=${airfieldId}`)
              .then(r => r.ok ? r.json() : []).then(setAdminRouteLinks).catch(() => {});
            fetch(`${API_URL}/base-routes?airfield_id=${airfieldId}`)
              .then(r => r.ok ? r.json() : []).then(setBRoutes).catch(() => {});
            setShowAddRouteLinkForm(false);
            setNewRouteLinkForm({ presetIdA: '', routeIdA: '', presetIdB: '', routeIdB: '' });
            setRouteLinkPresetBRoutes([]);
            setDrawingVehicleRouteId(null); setVehicleRouteDraftPoints([]);
          };
          const saveAirfield = async () => {
            if (!airfieldForm.name.trim()) return;
            const method = editingAirfield ? 'PUT' : 'POST';
            const url = editingAirfield ? `${API_URL}/airfields/${editingAirfield.id}` : `${API_URL}/airfields`;
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: airfieldForm.name, base_id: airfieldForm.base_id ? Number(airfieldForm.base_id) : null, custom_name: airfieldForm.custom_name.trim() || null, map_id: airfieldForm.map_id ? Number(airfieldForm.map_id) : null, sids: airfieldForm.sids, stars: airfieldForm.stars }) });
            if (res.status === 409) { alert((await res.json()).error || 'שם שדה תעופה כבר קיים'); return; }
            if (res.ok) {
              const savedAirfield = await res.json();
              setEditingAirfield(null); setAirfieldForm({ name: '', base_id: '', custom_name: '', map_id: '', sids: [], stars: [], newSid: '', newSidLabel: '', newStar: '' });
              const updated = await fetch(`${API_URL}/airfields`);
              if (updated.ok) setAdminAirfields(await updated.json());
              setSelectedAdminAirfieldId(savedAirfield.id);
              loadAirfieldPoints(savedAirfield.id);
            }
          };
          const deleteAirfield = async (id: number) => {
            if (!await customConfirm('למחוק שדה זה?')) return;
            await fetch(`${API_URL}/airfields/${id}`, { method: 'DELETE' });
            const updated = await fetch(`${API_URL}/airfields`);
            if (updated.ok) setAdminAirfields(await updated.json());
            if (selectedAdminAirfieldId === id) { setSelectedAdminAirfieldId(null); setAirfieldPoints([]); }
          };
          const duplicateAirfield = async (id: number) => {
            const res = await fetch(`${API_URL}/airfields/${id}/duplicate`, { method: 'POST' });
            if (!res.ok) { alert('שכפול נכשל'); return; }
            const dup = await res.json();
            const updatedList = await fetch(`${API_URL}/airfields`);
            if (updatedList.ok) setAdminAirfields(await updatedList.json());
            const rawSids = Array.isArray(dup.sids) ? dup.sids : (typeof dup.sids === 'string' ? JSON.parse(dup.sids || '[]') : []);
            const dupSids = rawSids.map((s: any) => { if (typeof s === 'string') return { label: s, sector_ids: [] }; const ids = Array.isArray(s.sector_ids) ? s.sector_ids.map(Number).filter(Boolean) : s.sector_id ? [Number(s.sector_id)] : []; return { label: s.label || '', sector_ids: ids }; });
            const dupStars = Array.isArray(dup.stars) ? dup.stars : (typeof dup.stars === 'string' ? JSON.parse(dup.stars || '[]') : []);
            setEditingAirfield(dup);
            setSelectedAdminAirfieldId(dup.id);
            setAirfieldForm({ name: dup.name, base_id: dup.base_id?.toString() || '', custom_name: dup.custom_name || '', map_id: dup.map_id?.toString() || '', sids: dupSids, stars: dupStars, newSid: '', newSidLabel: '', newStar: '' });
            setShowAirfieldForm(true);
            setShowElementsSection(true);
            loadAirfieldPoints(dup.id);
            loadAirfieldPolygons(dup.id);
            loadAirfieldElements(dup.id);
            loadAirfieldSectors(dup.id);
            loadAirfieldStatusTypes(dup.id);
            loadAirfieldRunways(dup.id);
            if (dup.map_id) loadMapById(dup.map_id.toString());
          };
          const addPointAt = async (x_pct: number, y_pct: number) => {
            if (!selectedAdminAirfieldId || !airfieldPointForm.name.trim()) return;
            try {
              const res = await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: airfieldPointForm.name, x_pct, y_pct, color: airfieldPointForm.color, marker: airfieldPointForm.marker, density_warn: airfieldPointForm.density_warn, point_type: airfieldPointForm.point_type || null }) });
              if (res.ok) {
                const saved = await res.json();
                setAirfieldPoints(prev => [...prev, saved]);
                setAirfieldPointForm(p => ({ ...p, name: '' }));
                setPlacingPointMode(false);
              } else {
                const errData = await res.json().catch(() => ({}));
                alert(`שגיאה בשמירת נקודה: ${errData.error || res.status}`);
              }
            } catch (e) {
              alert('שגיאת רשת — לא ניתן לשמור נקודה');
            }
          };
          const deletePoint = async (pointId: number) => {
            await fetch(`${API_URL}/airfield-points/${pointId}`, { method: 'DELETE' });
            if (selectedAdminAirfieldId) loadAirfieldPoints(selectedAdminAirfieldId);
          };
          const saveEditingPoint = async () => {
            if (!editingPoint || !editingPoint.name.trim()) return;
            const existing = airfieldPoints.find((p: any) => p.id === editingPoint.id);
            if (!existing) return;
            const payload = {
              name: editingPoint.name,
              x_pct: existing.x_pct,
              y_pct: existing.y_pct,
              point_type: editingPoint.point_type || null,
              display_order: existing.display_order ?? 0,
              color: editingPoint.color,
              marker: editingPoint.marker,
              density_warn: Number(editingPoint.density_warn) || 3,
            };
            try {
              const res = await fetch(`${API_URL}/airfield-points/${editingPoint.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              if (res.ok) {
                const updated = await res.json();
                setAirfieldPoints((prev: any[]) => prev.map((p: any) => p.id === updated.id ? updated : p));
                setEditingPoint(null);
              } else {
                const err = await res.json().catch(() => ({ error: 'שגיאה לא ידועה' }));
                alert('שמירת הנקודה נכשלה: ' + (err.error || res.status));
              }
            } catch (e) {
              alert('שגיאת רשת בשמירת הנקודה');
            }
          };
          const selAirfield = adminAirfields.find(af => af.id === selectedAdminAirfieldId);
          const selMapSrc = adminSelMapSrc;
          const loadMapById = async (mapId: string | number) => {
            if (!mapId) { setAdminSelMapSrc(null); return; }
            const mr = await fetch(`${API_URL}/maps/${mapId}`);
            if (mr.ok) { const md = await mr.json(); setAdminSelMapSrc(md.image_data || null); }
          };
          const hasMap = !!(airfieldForm.map_id || adminSelMapSrc);
          return (
            <div style={{ display: 'flex', flexDirection: 'row-reverse', gap: '16px', direction: 'ltr', alignItems: 'flex-start' }}>

              {/* RIGHT panel: list + editor controls */}
              <div style={{ width: '460px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>

                {/* Airfield selector */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <select
                    value={selectedAdminAirfieldId ?? ''}
                    onChange={e => {
                      const id = Number(e.target.value);
                      if (!id) { setShowAirfieldForm(false); setSelectedAdminAirfieldId(null); setEditingAirfield(null); return; }
                      const af = adminAirfields.find((a: any) => a.id === id);
                      if (!af) return;
                      const rawSids = Array.isArray(af.sids) ? af.sids : (typeof af.sids === 'string' ? JSON.parse(af.sids || '[]') : []);
                      const afSids = rawSids.map((s: any) => { if (typeof s === 'string') return { label: s, sector_ids: [] }; const ids = Array.isArray(s.sector_ids) ? s.sector_ids.map(Number).filter(Boolean) : s.sector_id ? [Number(s.sector_id)] : []; return { label: s.label || s.name || '', sector_ids: ids }; });
                      const afStars = Array.isArray(af.stars) ? af.stars : (typeof af.stars === 'string' ? JSON.parse(af.stars || '[]') : []);
                      setAirfieldForm({ name: af.name, base_id: af.base_id?.toString() || '', custom_name: af.custom_name || '', map_id: af.map_id?.toString() || '', sids: afSids, stars: afStars, newSid: '', newSidLabel: '', newStar: '' });
                      setSelectedAdminAirfieldId(af.id);
                      loadAirfieldPoints(af.id);
                      setShowAirfieldForm(true);
                      setShowElementsSection(true);
                      setAdminAFExpanded(new Set());
                      setEditingAirfield(af);
                      loadMapById(af.map_id?.toString() || '');
                    }}
                    style={{ flex: 1, padding: '6px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl' }}>
                    <option value="" style={{ background: '#1e293b', color: '#94a3b8' }}>— בחר שדה תעופה —</option>
                    {adminAirfields.map((af: any) => (
                      <option key={af.id} value={af.id} style={{ background: '#1e293b', color: 'white' }}>{af.name}</option>
                    ))}
                  </select>
                  <button onClick={() => { setShowAirfieldForm(true); setEditingAirfield(null); setAirfieldForm({ name: '', base_id: '', custom_name: '', map_id: '', sids: [], stars: [], newSid: '', newSidLabel: '', newStar: '' }); setAdminSelMapSrc(null); setSelectedAdminAirfieldId(null); setAirfieldPoints([]); setPlacingPointMode(false); setAdminAFExpanded(new Set()); }}
                    style={{ padding: '6px 10px', background: '#059669', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0 }}>+ חדש</button>
                  {selectedAdminAirfieldId && (<>
                    <button onClick={() => duplicateAirfield(selectedAdminAirfieldId)}
                      title="שכפל שדה תעופה"
                      style={{ padding: '6px 8px', background: '#1e3a5f', color: '#7dd3fc', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '10px', flexShrink: 0 }}>⎘ שכפל</button>
                    <button onClick={async () => { if (await customConfirm('למחוק את השדה?')) deleteAirfield(selectedAdminAirfieldId); }}
                      style={{ padding: '6px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '10px', flexShrink: 0 }}>מחק</button>
                  </>)}
                </div>


                {/* Editor form (shown when airfield selected/new) */}
                {showAirfieldForm && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                      {/* Free-text airfield name — always shown */}
                      <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>שם שדה התעופה:</label>
                      <input
                        value={airfieldForm.name}
                        onChange={e => setAirfieldForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="לדוגמה: נבטים"
                        style={{ width: '100%', padding: '7px 9px', background: '#0f172a', border: `1px solid ${airfieldForm.name.trim() ? '#3b82f6' : '#334155'}`, borderRadius: '6px', color: 'white', fontSize: '13px', boxSizing: 'border-box', direction: 'rtl', marginBottom: '10px' }}
                      />
                      {/* Optional: base + custom name */}
                      {adminAviationBases.length > 0 && <>
                        <label style={{ display: 'block', color: '#64748b', fontSize: '10px', marginBottom: '4px' }}>בסיס (אופציונלי — ימלא שם אוטומטית אם ריק):</label>
                        <select value={airfieldForm.base_id}
                          onChange={e => {
                            const bid = e.target.value;
                            const base = adminAviationBases.find((b: any) => String(b.id) === bid);
                            setAirfieldForm(p => {
                              const composed = base && p.custom_name.trim() ? `${base.name} - ${p.custom_name.trim()}` : '';
                              return { ...p, base_id: bid, name: p.name.trim() ? p.name : composed };
                            });
                          }}
                          style={{ width: '100%', padding: '7px 9px', background: '#0f172a', border: `1px solid ${airfieldForm.base_id ? '#475569' : '#1e293b'}`, borderRadius: '6px', color: airfieldForm.base_id ? '#cbd5e1' : '#475569', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box', marginBottom: '6px' }}>
                          <option value="">— ללא בסיס —</option>
                          {adminAviationBases.map((b: any) => <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>)}
                        </select>
                        <label style={{ display: 'block', color: '#64748b', fontSize: '10px', marginBottom: '4px' }}>שם נוסף:</label>
                        <input value={airfieldForm.custom_name}
                          onChange={e => {
                            const cn = e.target.value;
                            setAirfieldForm(p => {
                              const base = adminAviationBases.find((b: any) => String(b.id) === p.base_id);
                              const composed = base && cn.trim() ? `${base.name} - ${cn.trim()}` : '';
                              return { ...p, custom_name: cn, name: p.name.trim() ? p.name : composed };
                            });
                          }}
                          placeholder="לדוגמה: אווירי"
                          style={{ width: '100%', padding: '7px 9px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', color: 'white', fontSize: '12px', boxSizing: 'border-box', direction: 'rtl' }} />
                      </>}
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>מפה קרקעית:</label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <select value={airfieldForm.map_id}
                          onChange={async e => { setAirfieldForm(p => ({ ...p, map_id: e.target.value })); await loadMapById(e.target.value); }}
                          style={{ flex: 1, padding: '7px 8px', background: '#0f172a', border: `1px solid ${airfieldForm.map_id ? '#3b82f6' : '#334155'}`, borderRadius: '6px', color: 'white', fontSize: '11px', direction: 'rtl' }}>
                          <option value="">— ללא מפה —</option>
                          {maps.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', color: '#60a5fa' }}>
                          📎
                          <input type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={async e => {
                              const file = e.target.files?.[0]; if (!file) return;
                              const reader = new FileReader();
                              reader.onload = async ev => {
                                const imageData = ev.target?.result as string;
                                const selBase = adminAviationBases.find((b: any) => String(b.id) === String(airfieldForm.base_id));
                                const mapName = (selBase && airfieldForm.custom_name.trim() ? `${selBase.name} — ${airfieldForm.custom_name.trim()}` : airfieldForm.name.trim()) || file.name.replace(/\.[^.]+$/, '');
                                const res = await fetch(`${API_URL}/maps`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: mapName, image_data: imageData }) });
                                if (res.status === 409) { alert((await res.json()).error || 'שם מפה כבר קיים'); return; }
                                if (res.ok) { const newMap = await res.json(); const mapsRes = await fetch(`${API_URL}/maps`); if (mapsRes.ok) setMaps(await mapsRes.json()); setAirfieldForm(p => ({ ...p, map_id: String(newMap.id) })); setAdminSelMapSrc(imageData); }
                              };
                              reader.readAsDataURL(file);
                            }} />
                        </label>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(() => { const canSave = !!airfieldForm.name.trim(); return (
                      <button onClick={saveAirfield} disabled={!canSave}
                        style={{ flex: 1, padding: '7px', background: canSave ? '#1d4ed8' : '#1e293b', color: 'white', border: 'none', borderRadius: '6px', cursor: canSave ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: 'bold', opacity: canSave ? 1 : 0.5 }}>
                        {editingAirfield ? 'שמור' : 'צור'}
                      </button>); })()}
                      <button onClick={() => { setShowAirfieldForm(false); setEditingAirfield(null); setAirfieldForm({ name: '', base_id: '', custom_name: '', map_id: '', sids: [], stars: [], newSid: '', newSidLabel: '', newStar: '' }); setAdminSelMapSrc(null); setSelectedAdminAirfieldId(null); setAirfieldPoints([]); setPlacingPointMode(false); }}
                        style={{ padding: '7px 10px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>ביטול</button>
                    </div>

                    {/* SIDs management */}
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: adminAFExpanded.has('sids') ? '6px' : 0, cursor: 'pointer' }} onClick={() => toggleAFSec('sids')}>
                        <div style={{ color: '#7dd3fc', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>✈️ SIDs ({airfieldForm.sids.length})</div>
                        <span style={{ color: adminAFExpanded.has('sids') ? '#7dd3fc' : '#475569', fontSize: '11px', marginRight: '4px' }}>{adminAFExpanded.has('sids') ? '▲' : '▼'}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: adminAFExpanded.has('sids') ? '800px' : '0', overflow: 'hidden', transition: 'max-height 0.2s ease' }}>
                        {airfieldForm.sids.map((sid, i) => (
                          <div key={i} style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '6px', padding: '6px 8px', marginBottom: '2px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: sid.sector_ids.length > 0 ? '4px' : 0 }}>
                              <span style={{ flex: 1, color: '#93c5fd', fontSize: '12px', fontFamily: 'monospace', fontWeight: 'bold' }}>{sid.label}</span>
                              <button onClick={() => setAirfieldForm(p => ({ ...p, sids: p.sids.filter((_, j) => j !== i) }))}
                                style={{ padding: '1px 6px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '4px' }}>
                              {sid.sector_ids.map(secId => {
                                const sec = sectors.find((s: any) => s.id === secId);
                                return (
                                  <span key={secId} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '9px', color: '#60a5fa', background: '#1e3a5f', padding: '1px 5px', borderRadius: '3px' }}>
                                    → {sec?.name || secId}
                                    <button onClick={() => setAirfieldForm(p => ({ ...p, sids: p.sids.map((s, j) => j === i ? { ...s, sector_ids: s.sector_ids.filter(id => id !== secId) } : s) }))}
                                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '9px', padding: '0', lineHeight: 1 }}>✕</button>
                                  </span>
                                );
                              })}
                            </div>
                            <div style={{ display: 'flex', gap: '3px' }}>
                              <select defaultValue="" onChange={e => { const secId = Number(e.target.value); if (!secId) return; setAirfieldForm(p => ({ ...p, sids: p.sids.map((s, j) => j === i && !s.sector_ids.includes(secId) ? { ...s, sector_ids: [...s.sector_ids, secId] } : s) })); e.target.value = ''; }}
                                style={{ flex: 1, padding: '2px 5px', background: '#0a0f1a', border: '1px solid #334155', borderRadius: '3px', color: '#94a3b8', fontSize: '10px', direction: 'rtl' }}>
                                <option value="">+ הוסף עמדה...</option>
                                {sectors.filter((s: any) => !sid.sector_ids.includes(s.id)).map((s: any) => (
                                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                          <input value={airfieldForm.newSidLabel} onChange={e => setAirfieldForm(p => ({ ...p, newSidLabel: e.target.value }))}
                            placeholder="שם SID (לדוג׳ ALPHA)"
                            style={{ flex: 1, padding: '3px 6px', background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '11px', direction: 'rtl' }} />
                          <select value={airfieldForm.newSid} onChange={e => setAirfieldForm(p => ({ ...p, newSid: e.target.value }))}
                            style={{ flex: 1, padding: '3px 6px', background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '4px', color: airfieldForm.newSid ? 'white' : '#475569', fontSize: '11px', direction: 'rtl' }}>
                            <option value="">— עמדה (אופציונלי) —</option>
                            {sectors.map((s: any) => (
                              <option key={s.id} value={String(s.id)}>{s.name}</option>
                            ))}
                          </select>
                          <button onClick={() => {
                            const label = airfieldForm.newSidLabel.trim() || (airfieldForm.newSid ? sectors.find((s: any) => s.id === Number(airfieldForm.newSid))?.name : '');
                            if (!label) return;
                            const secId = airfieldForm.newSid ? Number(airfieldForm.newSid) : null;
                            setAirfieldForm(p => ({ ...p, sids: [...p.sids, { label, sector_ids: secId ? [secId] : [] }], newSid: '', newSidLabel: '' }));
                          }}
                            style={{ padding: '3px 8px', background: (airfieldForm.newSidLabel.trim() || airfieldForm.newSid) ? '#1d4ed8' : '#1e293b', color: 'white', border: 'none', borderRadius: '4px', cursor: (airfieldForm.newSidLabel.trim() || airfieldForm.newSid) ? 'pointer' : 'not-allowed', fontSize: '11px' }}>+</button>
                        </div>
                      </div>
                    </div>

                    {/* STARs management */}
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: adminAFExpanded.has('stars') ? '6px' : 0, cursor: 'pointer' }} onClick={() => toggleAFSec('stars')}>
                        <div style={{ color: '#86efac', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>🛬 STARs ({airfieldForm.stars.length})</div>
                        <span style={{ color: adminAFExpanded.has('stars') ? '#86efac' : '#475569', fontSize: '11px', marginRight: '4px' }}>{adminAFExpanded.has('stars') ? '▲' : '▼'}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: adminAFExpanded.has('stars') ? '800px' : '0', overflow: 'hidden', transition: 'max-height 0.2s ease' }}>
                        {airfieldForm.stars.map((star, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ flex: 1, color: '#86efac', fontSize: '12px', fontFamily: 'monospace' }}>{star}</span>
                            <button onClick={() => setAirfieldForm(p => ({ ...p, stars: p.stars.filter((_, j) => j !== i) }))}
                              style={{ padding: '1px 6px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                          <input value={airfieldForm.newStar} onChange={e => setAirfieldForm(p => ({ ...p, newStar: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter' && airfieldForm.newStar.trim()) { setAirfieldForm(p => ({ ...p, stars: [...p.stars, p.newStar.trim()], newStar: '' })); } }}
                            placeholder="שם STAR..." style={{ flex: 1, padding: '3px 6px', background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '4px', color: 'white', fontSize: '11px', fontFamily: 'monospace' }} />
                          <button onClick={() => { if (airfieldForm.newStar.trim()) setAirfieldForm(p => ({ ...p, stars: [...p.stars, p.newStar.trim()], newStar: '' })); }}
                            style={{ padding: '3px 8px', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+</button>
                        </div>
                      </div>
                    </div>

                    {/* Runways section */}
                    {(editingAirfield || selectedAdminAirfieldId) && (
                      <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: adminAFExpanded.has('runways') ? '6px' : 0, cursor: 'pointer' }} onClick={() => toggleAFSec('runways')}>
                          <div style={{ color: '#86efac', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>✈ מסלולים ({adminAirfieldRunways.length})</div>
                          {adminAFExpanded.has('runways') && adminRunwayForm === null && (
                            <button onClick={e => { e.stopPropagation(); setAdminRunwayForm({ name: '', heading_a: '', heading_b: '', heading_a_true: '', heading_b_true: '', length_ft: '', length_m: '', start_x_pct: '', start_y_pct: '', end_x_pct: '', end_y_pct: '', tora_a_m: '', tora_a_ft: '', toda_a_m: '', toda_a_ft: '', asda_a_m: '', asda_a_ft: '', lda_a_m: '', lda_a_ft: '', clearway_a_m: '', clearway_a_ft: '', tora_b_m: '', tora_b_ft: '', toda_b_m: '', toda_b_ft: '', asda_b_m: '', asda_b_ft: '', lda_b_m: '', lda_b_ft: '', clearway_b_m: '', clearway_b_ft: '' }); setAdminRunwayEditId(null); }}
                              style={{ padding: '2px 8px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>+ מסלול</button>
                          )}
                          <span style={{ color: adminAFExpanded.has('runways') ? '#86efac' : '#475569', fontSize: '11px', marginRight: '4px' }}>{adminAFExpanded.has('runways') ? '▲' : '▼'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: adminAFExpanded.has('runways') ? '3000px' : '0', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                          {/* Add/Edit runway form */}
                          {adminRunwayForm !== null && (
                            <div style={{ background: '#0f172a', padding: '8px', borderRadius: '6px', marginBottom: '4px', border: '1px solid #166534', direction: 'rtl' }}>
                              <div style={{ color: '#86efac', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px' }}>{adminRunwayEditId ? '✏ עריכת מסלול' : '✈ מסלול חדש'}</div>

                              {/* Overall runway name */}
                              <div style={{ marginBottom: '8px' }}>
                                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>שם מסלול (כולל שני הצדדים)</div>
                                <input value={adminRunwayForm.name} onChange={e => setAdminRunwayForm(p => p && ({ ...p, name: e.target.value }))} placeholder="27/09" style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: '#86efac', fontSize: '13px', direction: 'ltr', fontFamily: 'monospace', textAlign: 'center', fontWeight: 'bold', boxSizing: 'border-box' }} />
                              </div>

                              {/* Length row — shared */}
                              <div style={{ marginBottom: '8px' }}>
                                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>אורך מסלול</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                  <div style={{ position: 'relative' }}>
                                    <input value={adminRunwayForm.length_ft} onChange={e => { const v = e.target.value; setAdminRunwayForm(p => p && ({ ...p, length_ft: v, length_m: v ? String(Math.round(Number(v) * 0.3048)) : '' })); }} placeholder="ft" type="number" style={{ width: '100%', padding: '4px 26px 4px 6px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '11px', boxSizing: 'border-box' }} />
                                    <span style={{ position: 'absolute', left: '5px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: '#475569', pointerEvents: 'none' }}>ft</span>
                                  </div>
                                  <div style={{ position: 'relative' }}>
                                    <input value={adminRunwayForm.length_m} onChange={e => { const v = e.target.value; setAdminRunwayForm(p => p && ({ ...p, length_m: v, length_ft: v ? String(Math.round(Number(v) * 3.28084)) : '' })); }} placeholder="m" type="number" style={{ width: '100%', padding: '4px 26px 4px 6px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '11px', boxSizing: 'border-box' }} />
                                    <span style={{ position: 'absolute', left: '5px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: '#475569', pointerEvents: 'none' }}>m</span>
                                  </div>
                                </div>
                              </div>

                              {/* Side A */}
                              <div style={{ background: '#0a1e35', borderRadius: '5px', padding: '6px', marginBottom: '6px', border: '1px solid #1e3a5f' }}>
                                <div style={{ fontSize: '10px', color: '#60a5fa', fontWeight: 'bold', marginBottom: '5px' }}>צד א</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '5px' }}>
                                  <div>
                                    <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px' }}>שם</div>
                                    <input value={adminRunwayForm.heading_a} onChange={e => setAdminRunwayForm(p => p && ({ ...p, heading_a: e.target.value }))} placeholder="09" style={{ width: '100%', padding: '4px 6px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#60a5fa', fontSize: '12px', direction: 'ltr', fontFamily: 'monospace', textAlign: 'center', fontWeight: 'bold', boxSizing: 'border-box' }} />
                                  </div>
                                  <div style={{ position: 'relative' }}>
                                    <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px' }}>כיוון אמיתי (°)</div>
                                    <input value={adminRunwayForm.heading_a_true} onChange={e => setAdminRunwayForm(p => p && ({ ...p, heading_a_true: e.target.value }))} onBlur={e => { const v = e.target.value.trim(); if (v && !isNaN(Number(v))) setAdminRunwayForm(p => p && ({ ...p, heading_a_true: String(Number(v)).padStart(3, '0') })); }} placeholder="090" type="text" style={{ width: '100%', padding: '4px 22px 4px 6px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#93c5fd', fontSize: '11px', direction: 'ltr', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                                    <span style={{ position: 'absolute', left: '4px', bottom: '5px', fontSize: '9px', color: '#475569', pointerEvents: 'none' }}>°</span>
                                  </div>
                                </div>
                                {/* ICAO Declared Distances — Side A */}
                                <div style={{ marginBottom: '5px', background: '#071526', borderRadius: '4px', padding: '5px', border: '1px solid #92400e' }}>
                                  <div style={{ fontSize: '9px', color: '#fcd34d', fontWeight: 'bold', marginBottom: '4px' }}>📏 מרחקים מוצהרים ICAO</div>
                                  {(['tora','toda','asda','lda','clearway'] as const).map(k => (
                                    <div key={k} style={{ display: 'grid', gridTemplateColumns: '42px 1fr 1fr', gap: '3px', alignItems: 'center', marginBottom: '3px' }}>
                                      <div style={{ fontSize: '9px', color: '#94a3b8', fontFamily: 'monospace' }}>{k === 'clearway' ? 'CWY' : k.toUpperCase()}</div>
                                      <div style={{ position: 'relative' }}>
                                        <input value={(adminRunwayForm as any)[`${k}_a_m`]} onChange={e => { const v = e.target.value; setAdminRunwayForm(p => p && ({ ...p, [`${k}_a_m`]: v, [`${k}_a_ft`]: v ? String(Math.round(Number(v) * 3.28084)) : '' })); }} placeholder="m" type="number" style={{ width: '100%', padding: '3px 20px 3px 5px', background: '#1e293b', border: '1px solid #78350f', borderRadius: '3px', color: '#fde68a', fontSize: '10px', boxSizing: 'border-box' }} />
                                        <span style={{ position: 'absolute', left: '3px', top: '50%', transform: 'translateY(-50%)', fontSize: '8px', color: '#475569', pointerEvents: 'none' }}>m</span>
                                      </div>
                                      <div style={{ position: 'relative' }}>
                                        <input value={(adminRunwayForm as any)[`${k}_a_ft`]} onChange={e => { const v = e.target.value; setAdminRunwayForm(p => p && ({ ...p, [`${k}_a_ft`]: v, [`${k}_a_m`]: v ? String(Math.round(Number(v) * 0.3048)) : '' })); }} placeholder="ft" type="number" style={{ width: '100%', padding: '3px 20px 3px 5px', background: '#1e293b', border: '1px solid #78350f', borderRadius: '3px', color: '#fde68a', fontSize: '10px', boxSizing: 'border-box' }} />
                                        <span style={{ position: 'absolute', left: '3px', top: '50%', transform: 'translateY(-50%)', fontSize: '8px', color: '#475569', pointerEvents: 'none' }}>ft</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                  <div>
                                    <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px' }}>מיקום תחילת מסלול (A)</div>
                                    <button onClick={() => setPlacingRunwayEndpoint(placingRunwayEndpoint === 'start' ? null : 'start')} style={{ width: '100%', padding: '4px 6px', background: placingRunwayEndpoint === 'start' ? '#92400e' : (adminRunwayForm.start_x_pct ? '#14532d' : '#1e293b'), border: `1px solid ${placingRunwayEndpoint === 'start' ? '#f59e0b' : (adminRunwayForm.start_x_pct ? '#22c55e' : '#334155')}`, borderRadius: '4px', cursor: 'pointer', fontSize: '10px', color: placingRunwayEndpoint === 'start' ? '#fde68a' : (adminRunwayForm.start_x_pct ? '#86efac' : '#94a3b8'), textAlign: 'center' }}>
                                      {placingRunwayEndpoint === 'start' ? '📍 לחץ על המפה...' : adminRunwayForm.start_x_pct ? `✓ (${Number(adminRunwayForm.start_x_pct).toFixed(1)},${Number(adminRunwayForm.start_y_pct).toFixed(1)})` : '📍 סמן על מפה'}
                                    </button>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px' }}>מיקום סיום מסלול (A)</div>
                                    <button onClick={() => setPlacingRunwayEndpoint(placingRunwayEndpoint === 'end' ? null : 'end')} style={{ width: '100%', padding: '4px 6px', background: placingRunwayEndpoint === 'end' ? '#92400e' : (adminRunwayForm.end_x_pct ? '#14532d' : '#1e293b'), border: `1px solid ${placingRunwayEndpoint === 'end' ? '#f59e0b' : (adminRunwayForm.end_x_pct ? '#22c55e' : '#334155')}`, borderRadius: '4px', cursor: 'pointer', fontSize: '10px', color: placingRunwayEndpoint === 'end' ? '#fde68a' : (adminRunwayForm.end_x_pct ? '#86efac' : '#94a3b8'), textAlign: 'center' }}>
                                      {placingRunwayEndpoint === 'end' ? '📍 לחץ על המפה...' : adminRunwayForm.end_x_pct ? `✓ (${Number(adminRunwayForm.end_x_pct).toFixed(1)},${Number(adminRunwayForm.end_y_pct).toFixed(1)})` : '📍 סמן על מפה'}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Side B */}
                              <div style={{ background: '#1a0e2e', borderRadius: '5px', padding: '6px', marginBottom: '8px', border: '1px solid #3b1e5f' }}>
                                <div style={{ fontSize: '10px', color: '#c084fc', fontWeight: 'bold', marginBottom: '5px' }}>צד ב</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '5px' }}>
                                  <div>
                                    <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px' }}>שם</div>
                                    <input value={adminRunwayForm.heading_b} onChange={e => setAdminRunwayForm(p => p && ({ ...p, heading_b: e.target.value }))} placeholder="27" style={{ width: '100%', padding: '4px 6px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#c084fc', fontSize: '12px', direction: 'ltr', fontFamily: 'monospace', textAlign: 'center', fontWeight: 'bold', boxSizing: 'border-box' }} />
                                  </div>
                                  <div style={{ position: 'relative' }}>
                                    <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px' }}>כיוון אמיתי (°)</div>
                                    <input value={adminRunwayForm.heading_b_true} onChange={e => setAdminRunwayForm(p => p && ({ ...p, heading_b_true: e.target.value }))} onBlur={e => { const v = e.target.value.trim(); if (v && !isNaN(Number(v))) setAdminRunwayForm(p => p && ({ ...p, heading_b_true: String(Number(v)).padStart(3, '0') })); }} placeholder="270" type="text" style={{ width: '100%', padding: '4px 22px 4px 6px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#d8b4fe', fontSize: '11px', direction: 'ltr', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                                    <span style={{ position: 'absolute', left: '4px', bottom: '5px', fontSize: '9px', color: '#475569', pointerEvents: 'none' }}>°</span>
                                  </div>
                                </div>
                                {/* ICAO Declared Distances — Side B */}
                                <div style={{ marginBottom: '5px', background: '#130a20', borderRadius: '4px', padding: '5px', border: '1px solid #6d28d9' }}>
                                  <div style={{ fontSize: '9px', color: '#fcd34d', fontWeight: 'bold', marginBottom: '4px' }}>📏 מרחקים מוצהרים ICAO</div>
                                  {(['tora','toda','asda','lda','clearway'] as const).map(k => (
                                    <div key={k} style={{ display: 'grid', gridTemplateColumns: '42px 1fr 1fr', gap: '3px', alignItems: 'center', marginBottom: '3px' }}>
                                      <div style={{ fontSize: '9px', color: '#94a3b8', fontFamily: 'monospace' }}>{k === 'clearway' ? 'CWY' : k.toUpperCase()}</div>
                                      <div style={{ position: 'relative' }}>
                                        <input value={(adminRunwayForm as any)[`${k}_b_m`]} onChange={e => { const v = e.target.value; setAdminRunwayForm(p => p && ({ ...p, [`${k}_b_m`]: v, [`${k}_b_ft`]: v ? String(Math.round(Number(v) * 3.28084)) : '' })); }} placeholder="m" type="number" style={{ width: '100%', padding: '3px 20px 3px 5px', background: '#1e293b', border: '1px solid #4c1d95', borderRadius: '3px', color: '#e9d5ff', fontSize: '10px', boxSizing: 'border-box' }} />
                                        <span style={{ position: 'absolute', left: '3px', top: '50%', transform: 'translateY(-50%)', fontSize: '8px', color: '#475569', pointerEvents: 'none' }}>m</span>
                                      </div>
                                      <div style={{ position: 'relative' }}>
                                        <input value={(adminRunwayForm as any)[`${k}_b_ft`]} onChange={e => { const v = e.target.value; setAdminRunwayForm(p => p && ({ ...p, [`${k}_b_ft`]: v, [`${k}_b_m`]: v ? String(Math.round(Number(v) * 0.3048)) : '' })); }} placeholder="ft" type="number" style={{ width: '100%', padding: '3px 20px 3px 5px', background: '#1e293b', border: '1px solid #4c1d95', borderRadius: '3px', color: '#e9d5ff', fontSize: '10px', boxSizing: 'border-box' }} />
                                        <span style={{ position: 'absolute', left: '3px', top: '50%', transform: 'translateY(-50%)', fontSize: '8px', color: '#475569', pointerEvents: 'none' }}>ft</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ fontSize: '9px', color: '#475569', marginTop: '4px' }}>מיקום: ההפך מצד א (מוגדר אוטומטית על המפה)</div>
                              </div>

                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button onClick={() => { setAdminRunwayForm(null); setAdminRunwayEditId(null); setPlacingRunwayEndpoint(null); }} style={{ padding: '4px 10px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>ביטול</button>
                                <button onClick={async () => {
                                  const form = adminRunwayForm;
                                  if (!form) return;
                                  const afId = selectedAdminAirfieldId || (editingAirfield as any)?.id;
                                  const body = {
                                    airfield_id: afId,
                                    name: form.name,
                                    heading_a: form.heading_a,
                                    heading_b: form.heading_b,
                                    heading_a_true: form.heading_a_true ? Number(form.heading_a_true) : null,
                                    heading_b_true: form.heading_b_true ? Number(form.heading_b_true) : null,
                                    length_ft: form.length_ft ? Number(form.length_ft) : null,
                                    length_m: form.length_m ? Number(form.length_m) : null,
                                    start_x_pct: form.start_x_pct ? Number(form.start_x_pct) : null,
                                    start_y_pct: form.start_y_pct ? Number(form.start_y_pct) : null,
                                    end_x_pct: form.end_x_pct ? Number(form.end_x_pct) : null,
                                    end_y_pct: form.end_y_pct ? Number(form.end_y_pct) : null,
                                    tora_m: form.tora_a_m ? Number(form.tora_a_m) : null,
                                    toda_m: form.toda_a_m ? Number(form.toda_a_m) : null,
                                    asda_m: form.asda_a_m ? Number(form.asda_a_m) : null,
                                    lda_m: form.lda_a_m ? Number(form.lda_a_m) : null,
                                    clearway_m: form.clearway_a_m ? Number(form.clearway_a_m) : null,
                                    tora_b_m: form.tora_b_m ? Number(form.tora_b_m) : null,
                                    toda_b_m: form.toda_b_m ? Number(form.toda_b_m) : null,
                                    asda_b_m: form.asda_b_m ? Number(form.asda_b_m) : null,
                                    lda_b_m: form.lda_b_m ? Number(form.lda_b_m) : null,
                                    clearway_b_m: form.clearway_b_m ? Number(form.clearway_b_m) : null,
                                  };
                                  if (adminRunwayEditId) await fetch(`${API_URL}/airfield-runways/${adminRunwayEditId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                                  else await fetch(`${API_URL}/airfield-runways`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                                  setAdminRunwayForm(null); setAdminRunwayEditId(null); setPlacingRunwayEndpoint(null);
                                  if (afId) loadAirfieldRunways(afId);
                                }} style={{ padding: '4px 12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>שמור</button>
                              </div>
                            </div>
                          )}
                          {/* Runway list */}
                          {adminAirfieldRunways.map((rw: any) => {
                            return (
                              <div key={rw.id} style={{ background: '#0f2744', border: '1px solid #1e3a5f', borderRadius: '6px', padding: '6px 8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', direction: 'rtl' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#86efac' }}>{rw.name || '—'}</div>
                                    <div style={{ fontSize: '10px', color: '#93c5fd' }}>
                                      {rw.true_bearing ? <span style={{ marginLeft: '6px', fontFamily: 'monospace' }}>{rw.true_bearing}°</span> : ''}
                                      {rw.length_ft ? <span style={{ color: '#cbd5e1' }}>{' '}{Number(rw.length_ft).toLocaleString()} ft{rw.length_m ? ` / ${Number(rw.length_m).toLocaleString()} m` : ''}</span> : null}
                                    </div>
                                  </div>
                                  <button onClick={() => { const ha = rw.heading_a_true != null ? String(rw.heading_a_true).padStart(3,'0') : ''; const hb = rw.heading_b_true != null ? String(rw.heading_b_true).padStart(3,'0') : ''; setAdminRunwayForm({ name: rw.name || '', heading_a: rw.heading_a || '', heading_b: rw.heading_b || '', heading_a_true: ha, heading_b_true: hb, length_ft: rw.length_ft?.toString() || '', length_m: rw.length_m?.toString() || '', start_x_pct: rw.start_x_pct?.toString() || '', start_y_pct: rw.start_y_pct?.toString() || '', end_x_pct: rw.end_x_pct?.toString() || '', end_y_pct: rw.end_y_pct?.toString() || '', tora_a_m: rw.tora_m?.toString() || '', tora_a_ft: rw.tora_m ? String(Math.round(rw.tora_m * 3.28084)) : '', toda_a_m: rw.toda_m?.toString() || '', toda_a_ft: rw.toda_m ? String(Math.round(rw.toda_m * 3.28084)) : '', asda_a_m: rw.asda_m?.toString() || '', asda_a_ft: rw.asda_m ? String(Math.round(rw.asda_m * 3.28084)) : '', lda_a_m: rw.lda_m?.toString() || '', lda_a_ft: rw.lda_m ? String(Math.round(rw.lda_m * 3.28084)) : '', clearway_a_m: rw.clearway_m?.toString() || '', clearway_a_ft: rw.clearway_m ? String(Math.round(rw.clearway_m * 3.28084)) : '', tora_b_m: rw.tora_b_m?.toString() || '', tora_b_ft: rw.tora_b_m ? String(Math.round(rw.tora_b_m * 3.28084)) : '', toda_b_m: rw.toda_b_m?.toString() || '', toda_b_ft: rw.toda_b_m ? String(Math.round(rw.toda_b_m * 3.28084)) : '', asda_b_m: rw.asda_b_m?.toString() || '', asda_b_ft: rw.asda_b_m ? String(Math.round(rw.asda_b_m * 3.28084)) : '', lda_b_m: rw.lda_b_m?.toString() || '', lda_b_ft: rw.lda_b_m ? String(Math.round(rw.lda_b_m * 3.28084)) : '', clearway_b_m: rw.clearway_b_m?.toString() || '', clearway_b_ft: rw.clearway_b_m ? String(Math.round(rw.clearway_b_m * 3.28084)) : '' }); setAdminRunwayEditId(rw.id); setPlacingRunwayEndpoint(null); }} style={{ padding: '2px 6px', background: 'transparent', border: '1px solid #1e3a5f', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: '#93c5fd' }}>✏</button>
                                  <button onClick={async () => { if (!window.confirm('למחוק מסלול זה?')) return; await fetch(`${API_URL}/airfield-runways/${rw.id}`, { method: 'DELETE' }); const afId = selectedAdminAirfieldId || (editingAirfield as any)?.id; if (afId) loadAirfieldRunways(afId); }} style={{ padding: '2px 6px', background: 'transparent', border: '1px solid #7f1d1d', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: '#fca5a5' }}>✕</button>
                                </div>
                                {/* Declared Distances display — per side */}
                                {(rw.tora_m || rw.toda_m || rw.asda_m || rw.lda_m || rw.clearway_m || rw.tora_b_m || rw.toda_b_m || rw.asda_b_m || rw.lda_b_m || rw.clearway_b_m) && (() => {
                                  const distKeys = [
                                    { k_a: 'tora_m', k_b: 'tora_b_m', label: 'TORA' },
                                    { k_a: 'toda_m', k_b: 'toda_b_m', label: 'TODA' },
                                    { k_a: 'asda_m', k_b: 'asda_b_m', label: 'ASDA' },
                                    { k_a: 'lda_m', k_b: 'lda_b_m', label: 'LDA' },
                                    { k_a: 'clearway_m', k_b: 'clearway_b_m', label: 'CWY' },
                                  ];
                                  const hasA = distKeys.some((x: any) => rw[x.k_a]);
                                  const hasB = distKeys.some((x: any) => rw[x.k_b]);
                                  return (
                                    <div style={{ marginTop: '6px', borderTop: '1px solid #92400e', paddingTop: '5px', direction: 'rtl' }}>
                                      <div style={{ fontSize: '9px', color: '#fcd34d', fontWeight: 'bold', marginBottom: '4px' }}>📏 מרחקים מוצהרים ICAO</div>
                                      <div style={{ display: 'grid', gridTemplateColumns: hasA && hasB ? '1fr 1fr' : '1fr', gap: '6px' }}>
                                        {hasA && (
                                          <div>
                                            <div style={{ fontSize: '8px', color: '#60a5fa', fontWeight: 'bold', marginBottom: '3px' }}>צד א ({rw.heading_a || 'A'})</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                              {distKeys.filter((x: any) => rw[x.k_a]).map(({ k_a, label }: any) => (
                                                <div key={k_a} style={{ textAlign: 'center', background: '#071526', borderRadius: '3px', padding: '2px 5px', border: '1px solid #1e4a6e', minWidth: '40px' }}>
                                                  <div style={{ fontSize: '8px', color: '#64748b' }}>{label}</div>
                                                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#86efac', fontFamily: 'monospace' }}>{Number(rw[k_a]).toLocaleString()}</div>
                                                  <div style={{ fontSize: '8px', color: '#475569', fontFamily: 'monospace' }}>{Math.round(Number(rw[k_a]) * 3.28084).toLocaleString()} ft</div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {hasB && (
                                          <div>
                                            <div style={{ fontSize: '8px', color: '#c084fc', fontWeight: 'bold', marginBottom: '3px' }}>צד ב ({rw.heading_b || 'B'})</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                              {distKeys.filter((x: any) => rw[x.k_b]).map(({ k_b, label }: any) => (
                                                <div key={k_b} style={{ textAlign: 'center', background: '#130a20', borderRadius: '3px', padding: '2px 5px', border: '1px solid #4c1d95', minWidth: '40px' }}>
                                                  <div style={{ fontSize: '8px', color: '#64748b' }}>{label}</div>
                                                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#e9d5ff', fontFamily: 'monospace' }}>{Number(rw[k_b]).toLocaleString()}</div>
                                                  <div style={{ fontSize: '8px', color: '#475569', fontFamily: 'monospace' }}>{Math.round(Number(rw[k_b]) * 3.28084).toLocaleString()} ft</div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Cameras section */}
                    {(editingAirfield || selectedAdminAirfieldId) && (
                      <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: adminAFExpanded.has('cameras') ? '6px' : 0, cursor: 'pointer' }} onClick={() => toggleAFSec('cameras')}>
                          <div style={{ color: '#67e8f9', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>📷 מצלמות ({adminAirfieldElements.filter(e => e.category === 'camera').length})</div>
                          <button onClick={e => { e.stopPropagation(); toggleAdminLayer('cameras'); }} title={adminMapLayers.cameras ? 'הסתר שכבה במפה' : 'הצג שכבה במפה'} style={{ padding: '1px 5px', background: 'transparent', border: `1px solid ${adminMapLayers.cameras ? '#67e8f9' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: adminMapLayers.cameras ? '#67e8f9' : '#475569', marginLeft: '4px', flexShrink: 0 }}>{adminMapLayers.cameras ? '✓' : '○'}</button>
                          {adminAFExpanded.has('cameras') && !showAdminCameraForm && (
                            <button onClick={e => { e.stopPropagation(); setAdminCameraForm({ name: '', camera_url: '' }); setShowAdminCameraForm(true); }}
                              style={{ padding: '2px 8px', background: '#0e7490', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>+ מצלמה</button>
                          )}
                          <span style={{ color: adminAFExpanded.has('cameras') ? '#67e8f9' : '#475569', fontSize: '11px', marginRight: '4px' }}>{adminAFExpanded.has('cameras') ? '▲' : '▼'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: adminAFExpanded.has('cameras') ? '2000px' : '0', overflow: 'hidden', transition: 'max-height 0.2s ease' }}>
                          {showAdminCameraForm && (
                            <div style={{ background: '#0f172a', padding: '8px', borderRadius: '6px', marginBottom: '4px', border: '1px solid #155e75' }}>
                              <input type="text" placeholder="שם המצלמה" value={adminCameraForm.name}
                                onChange={e => setAdminCameraForm(p => ({ ...p, name: e.target.value }))}
                                style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box', marginBottom: '5px' }} />
                              <input type="text" placeholder="כתובת URL של המצלמה" value={adminCameraForm.camera_url}
                                onChange={e => setAdminCameraForm(p => ({ ...p, camera_url: e.target.value }))}
                                style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '11px', direction: 'ltr', boxSizing: 'border-box', marginBottom: '5px' }} />
                              <div style={{ display: 'flex', gap: '5px' }}>
                                <button onClick={async () => {
                                  if (!adminCameraForm.name.trim()) return;
                                  await fetch(`${API_URL}/airfield-elements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airfield_id: Number(selectedAdminAirfieldId), name: adminCameraForm.name.trim(), category: 'camera', status: 'תקין', camera_url: adminCameraForm.camera_url.trim() || null }) });
                                  setShowAdminCameraForm(false);
                                  setAdminCameraForm({ name: '', camera_url: '' });
                                  loadAirfieldElements(selectedAdminAirfieldId!);
                                }} style={{ flex: 1, padding: '4px', background: '#0e7490', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✓ שמור</button>
                                <button onClick={() => { setShowAdminCameraForm(false); setAdminCameraForm({ name: '', camera_url: '' }); }}
                                  style={{ padding: '4px 8px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>ביטול</button>
                              </div>
                            </div>
                          )}
                          {adminAirfieldElements.filter(e => e.category === 'camera').length === 0 && !showAdminCameraForm
                            ? <div style={{ color: '#475569', fontSize: '11px', textAlign: 'center', padding: '6px 0' }}>אין מצלמות</div>
                            : adminAirfieldElements.filter(e => e.category === 'camera').map(cam => (
                              <div key={cam.id} style={{ background: '#0f172a', borderRadius: '4px', border: `1px solid ${placingElementId === cam.id ? '#67e8f9' : '#155e75'}`, padding: '5px 7px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                  <span style={{ fontSize: '14px', flexShrink: 0 }}>📷</span>
                                  <span style={{ flex: 1, fontSize: '11px', color: '#e2e8f0', fontWeight: 'bold' }}>{cam.name}</span>
                                  {cam.x_pct != null && <span title="ממוקם על המפה" style={{ fontSize: '9px', color: '#22d3ee' }}>📍</span>}
                                  <button onClick={() => { setPlacingElementMode(true); setPlacingElementId(cam.id); }}
                                    title={cam.x_pct != null ? 'עדכן מיקום על המפה' : 'פרוס על המפה'}
                                    style={{ padding: '1px 5px', background: cam.x_pct != null ? '#1e3a5f' : '#164e63', color: cam.x_pct != null ? '#93c5fd' : '#67e8f9', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>
                                    {cam.x_pct != null ? '📍 עדכן' : '📍 פרוס'}
                                  </button>
                                  {cam.x_pct != null && (
                                    <button onClick={async () => { await fetch(`${API_URL}/airfield-elements/${cam.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ element_type_id: cam.element_type_id, name: cam.name, status: cam.status, note: cam.note, category: cam.category, x_pct: null, y_pct: null, camera_url: cam.camera_url }) }); setAdminAirfieldElements(prev => prev.map(e => e.id === cam.id ? { ...e, x_pct: null, y_pct: null } : e)); }}
                                      style={{ padding: '1px 5px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>הסר</button>
                                  )}
                                  <button onClick={async () => { if (!await customConfirm('למחוק את המצלמה?')) return; await fetch(`${API_URL}/airfield-elements/${cam.id}`, { method: 'DELETE' }); loadAirfieldElements(selectedAdminAirfieldId!); }}
                                    style={{ padding: '1px 5px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>✕</button>
                                </div>
                                <input type="text" placeholder="כתובת URL" value={cam.camera_url || ''}
                                  onChange={e => setAdminAirfieldElements(prev => prev.map(el => el.id === cam.id ? { ...el, camera_url: e.target.value } : el))}
                                  onBlur={async e => { await fetch(`${API_URL}/airfield-elements/${cam.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ element_type_id: cam.element_type_id, name: cam.name, status: cam.status, note: cam.note, category: 'camera', x_pct: cam.x_pct, y_pct: cam.y_pct, camera_url: e.target.value.trim() || null }) }); }}
                                  style={{ width: '100%', padding: '3px 6px', background: '#0c1a2e', border: '1px solid #155e75', borderRadius: '4px', color: '#67e8f9', fontSize: '10px', direction: 'ltr', boxSizing: 'border-box' }} />
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    )}

                    {/* Airfield Elements */}
                    {(editingAirfield || selectedAdminAirfieldId) && (
                      <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: adminAFExpanded.has('elements') ? '6px' : 0, cursor: 'pointer' }} onClick={() => toggleAFSec('elements')}>
                          <div style={{ color: '#f9a8d4', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>🔧 אלמנטים בשדה ({adminAirfieldElements.length})</div>
                          <button onClick={e => { e.stopPropagation(); toggleAdminLayer('elements'); }} title={adminMapLayers.elements ? 'הסתר שכבה במפה' : 'הצג שכבה במפה'} style={{ padding: '1px 5px', background: 'transparent', border: `1px solid ${adminMapLayers.elements ? '#f9a8d4' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: adminMapLayers.elements ? '#f9a8d4' : '#475569', marginLeft: '4px', flexShrink: 0 }}>{adminMapLayers.elements ? '✓' : '○'}</button>
                          {adminAFExpanded.has('elements') && !showElementForm && <button onClick={e => { e.stopPropagation(); setEditingElement(null); setElementForm({ name: '', element_type_id: '', status: 'תקין', note: '', category: '', relevant_routes: [], blocking_statuses: [], show_in_driver: false }); setShowElementForm(true); }} style={{ padding: '2px 8px', background: '#ec4899', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>+ הוסף</button>}
                          <span style={{ color: adminAFExpanded.has('elements') ? '#f9a8d4' : '#475569', fontSize: '11px', marginRight: '4px' }}>{adminAFExpanded.has('elements') ? '▲' : '▼'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: adminAFExpanded.has('elements') ? '2000px' : '0', overflow: 'hidden', transition: 'max-height 0.2s ease' }}>
                          {(() => {
                            const statusColors: Record<string, string> = { 'תקין': '#22c55e', 'שמיש': '#22c55e', 'לא תקין': '#ef4444', 'תקול': '#ef4444', 'חלקי': '#f97316' };
                            const catMap: Record<string, any[]> = {};
                            for (const el of adminAirfieldElements) {
                              const cat = el.category && el.category.trim() ? el.category.trim() : 'כללי';
                              if (!catMap[cat]) catMap[cat] = [];
                              catMap[cat].push(el);
                            }
                            const cats = Object.keys(catMap).sort();
                            const renderEl = (el: any) => {
                              const sColor = statusColors[el.status] || '#94a3b8';
                              const elDState = el.display_state || 'normal';
                              const elDStateOpts = getElemDisplayStateOpts(el.type_icon || '');
                              const elDStateColor = elDStateOpts.find(o => o.key === elDState)?.color || '#3b82f6';
                              const STATUS_CYCLE = ['תקין', 'שמיש', 'חלקי', 'לא תקין', 'תקול'];
                              const STATUS_COLOR_ADM: Record<string,string> = { 'תקין': '#22c55e', 'שמיש': '#22c55e', 'חלקי': '#f97316', 'לא תקין': '#ef4444', 'תקול': '#ef4444' };
                              const adminSaveEl = async (patch: Record<string,unknown>) => {
                                const body = { element_type_id: el.element_type_id, name: el.name, status: el.status, note: el.note, category: el.category || '', x_pct: el.x_pct, y_pct: el.y_pct, display_state: el.display_state, blink_rate: el.blink_rate, rotation: el.rotation || 0, ...patch };
                                await fetch(`${API_URL}/airfield-elements/${el.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                                setAdminAirfieldElements(prev => prev.map(e => e.id === el.id ? { ...e, ...patch } : e));
                              };
                              return (
                                <div key={el.id} style={{ background: '#0f172a', borderRadius: '4px', border: `1px solid ${placingElementId === el.id ? '#ec4899' : '#1e3a5f'}`, padding: '4px 6px' }}>
                                  {/* Header row: icon + name + status badge */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', flexShrink: 0, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}>
                                      {typeof el.type_icon === 'string' && el.type_icon.startsWith('MAP:')
                                        ? renderGroundSvgIcon(el.type_icon, 16, undefined, elDState)
                                        : <span style={{ fontSize: '12px' }}>{el.type_icon || (el.category === 'camera' ? '📷' : '🔧')}</span>}
                                    </span>
                                    <span style={{ flex: 1, fontSize: '11px', color: '#e2e8f0', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.name}</span>
                                    {/* Status cycle badge */}
                                    <button onClick={async () => {
                                      const cur = STATUS_CYCLE.indexOf(el.status);
                                      const next = STATUS_CYCLE[(cur + 1) % STATUS_CYCLE.length];
                                      await adminSaveEl({ status: next });
                                    }} title="לחץ למעבר למצב הבא" style={{ fontSize: '9px', background: (STATUS_COLOR_ADM[el.status] || '#94a3b8') + '22', color: STATUS_COLOR_ADM[el.status] || '#94a3b8', border: `1px solid ${STATUS_COLOR_ADM[el.status] || '#94a3b8'}`, borderRadius: '3px', padding: '0 5px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                      {el.status || '?'}
                                    </button>
                                  </div>
                                  {el.type_name && <div style={{ fontSize: '9px', color: el.type_color || '#f59e0b', marginTop: '1px' }}>{el.type_name}</div>}
                                  {el.note && <div style={{ fontSize: '9px', color: '#64748b', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.note}</div>}
                                  {/* Display state quick buttons */}
                                  <div style={{ display: 'flex', gap: '2px', marginTop: '4px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '8px', color: '#475569', alignSelf: 'center', marginLeft: '2px' }}>מצב:</span>
                                    {elDStateOpts.map(opt => (
                                      <button key={opt.key} onClick={async () => { await adminSaveEl({ display_state: opt.key }); }}
                                        style={{ padding: '1px 5px', background: elDState === opt.key ? opt.color + '33' : 'transparent', border: `1px solid ${elDState === opt.key ? opt.color : '#1e3a5f'}`, borderRadius: '3px', color: elDState === opt.key ? opt.color : '#475569', cursor: 'pointer', fontSize: '8px', fontWeight: elDState === opt.key ? 'bold' : 'normal' }}>
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                  {/* Rotation + blink rate (shown when blinking) */}
                                  <div style={{ display: 'flex', gap: '3px', marginTop: '3px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '8px', color: '#475569' }}>🔄</span>
                                    {[0, 45, 90, 135, 180, 270].map(deg => (
                                      <button key={deg} onClick={async () => { await adminSaveEl({ rotation: deg }); }}
                                        style={{ padding: '1px 4px', background: (el.rotation || 0) === deg ? '#6366f133' : 'transparent', border: `1px solid ${(el.rotation || 0) === deg ? '#6366f1' : '#1e3a5f'}`, borderRadius: '3px', color: (el.rotation || 0) === deg ? '#818cf8' : '#475569', cursor: 'pointer', fontSize: '8px', fontWeight: (el.rotation || 0) === deg ? 'bold' : 'normal' }}>
                                        {deg}°
                                      </button>
                                    ))}
                                  </div>
                                  {/* Action buttons */}
                                  <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                                    <button onClick={() => { setPlacingElementMode(true); setPlacingElementId(el.id); }} style={{ flex: 1, padding: '2px', background: el.x_pct != null ? '#1e3a5f' : '#4c1d95', color: el.x_pct != null ? '#93c5fd' : '#c4b5fd', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>{el.x_pct != null ? '📍 עדכן מיקום' : '📍 פרוס'}</button>
                                    {el.x_pct != null && <button onClick={async () => { await adminSaveEl({ x_pct: null, y_pct: null }); }} style={{ padding: '2px 5px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>הסר מיקום</button>}
                                    <button
                                      title={el.show_in_driver ? 'מוצג לנהג חיוני — לחץ להסרה' : 'לחץ להצגה בתפריט נהג חיוני'}
                                      onClick={async () => { await adminSaveEl({ show_in_driver: !el.show_in_driver }); }}
                                      style={{ padding: '2px 5px', background: el.show_in_driver ? '#14532d' : 'transparent', color: el.show_in_driver ? '#4ade80' : '#475569', border: `1px solid ${el.show_in_driver ? '#16a34a' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '9px', fontWeight: el.show_in_driver ? 'bold' : 'normal' }}>
                                      {el.show_in_driver ? '🚗✓' : '🚗'}
                                    </button>
                                    <button onClick={() => { setElementForm({ name: el.name, element_type_id: String(el.element_type_id || ''), status: el.status, note: el.note || '', category: el.category || '', relevant_routes: Array.isArray(el.relevant_routes) ? el.relevant_routes : [], blocking_statuses: Array.isArray(el.blocking_statuses) ? el.blocking_statuses : [], show_in_driver: el.show_in_driver || false }); setEditingElement(el); setShowElementForm(true); }} style={{ padding: '2px 5px', background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f6', borderRadius: '3px', cursor: 'pointer', fontSize: '9px', fontWeight: 'bold' }}>ערוך</button>
                                    <button onClick={async () => { if (!await customConfirm('למחוק?')) return; await fetch(`${API_URL}/airfield-elements/${el.id}`, { method: 'DELETE' }); loadAirfieldElements(selectedAdminAirfieldId!); }} style={{ padding: '2px 5px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>✕</button>
                                  </div>
                                </div>
                              );
                            };
                            if (cats.length <= 1) return adminAirfieldElements.map(renderEl);
                            return cats.map(cat => (
                              <div key={cat}>
                                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#be185d', background: '#2d0a1e', padding: '2px 6px', borderRadius: '3px', marginBottom: '3px', direction: 'rtl' }}>{cat}</div>
                                {catMap[cat].map(renderEl)}
                              </div>
                            ));
                          })()}
                          {showElementForm && (() => {
                            const ELEM_STATUS_OPTIONS = [
                              { val: 'תקין', color: '#22c55e', bg: '#14532d' },
                              { val: 'שמיש', color: '#86efac', bg: '#166534' },
                              { val: 'חלקי', color: '#fb923c', bg: '#431407' },
                              { val: 'לא תקין', color: '#f87171', bg: '#7f1d1d' },
                              { val: 'תקול', color: '#fca5a5', bg: '#450a0a' },
                            ];
                            const selType = adminElementTypes.find(et => String(et.id) === elementForm.element_type_id);
                            const selStatus = ELEM_STATUS_OPTIONS.find(s => s.val === elementForm.status) || ELEM_STATUS_OPTIONS[0];
                            const doSave = async () => {
                              if (!elementForm.name.trim()) { setAdminElemFocusField('name'); return; }
                              const body = { element_type_id: elementForm.element_type_id ? Number(elementForm.element_type_id) : null, name: elementForm.name, status: elementForm.status, note: elementForm.note, category: elementForm.category, relevant_routes: elementForm.relevant_routes, blocking_statuses: elementForm.blocking_statuses, show_in_driver: elementForm.show_in_driver };
                              if (editingElement) {
                                await fetch(`${API_URL}/airfield-elements/${editingElement.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, x_pct: editingElement.x_pct, y_pct: editingElement.y_pct }) });
                              } else {
                                await fetch(`${API_URL}/airfield-elements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, airfield_id: selectedAdminAirfieldId }) });
                              }
                              setShowElementForm(false); setEditingElement(null); setElementForm({ name: '', element_type_id: '', status: 'תקין', note: '', category: '', relevant_routes: [], blocking_statuses: [], show_in_driver: false }); setAdminElemFocusField(null);
                              loadAirfieldElements(selectedAdminAirfieldId!);
                            };
                            return (
                              <div style={{ background: '#0c1a2e', borderRadius: '8px', border: '2px solid #ec4899', overflow: 'hidden', direction: 'rtl' }}>
                                {/* Header */}
                                <div style={{ background: '#831843', padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                                  <span style={{ fontSize: '14px' }}>{selType?.icon || '🔧'}</span>
                                  <span style={{ flex: 1, fontSize: '12px', fontWeight: 'bold', color: '#fce7f3' }}>
                                    {editingElement ? `עריכה: ${editingElement.name}` : 'אלמנט חדש'}
                                  </span>
                                  <button onClick={() => { setShowElementForm(false); setEditingElement(null); setElementForm({ name: '', element_type_id: '', status: 'תקין', note: '', category: '', relevant_routes: [], blocking_statuses: [], show_in_driver: false }); setAdminElemFocusField(null); }}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f9a8d4', fontSize: '14px', lineHeight: 1, padding: '0 2px' }}>✕</button>
                                </div>

                                {/* Fields */}
                                <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>

                                  {/* Name */}
                                  <div style={{ borderRadius: '5px', border: `1px solid ${adminElemFocusField === 'name' ? '#ec4899' : '#1e3a5f'}`, overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', background: '#0f172a', cursor: 'pointer' }}
                                      onClick={() => setAdminElemFocusField(adminElemFocusField === 'name' ? null : 'name')}>
                                      <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>✏ שם</span>
                                      <span style={{ flex: 1, fontSize: '12px', fontWeight: 'bold', color: elementForm.name ? '#e2e8f0' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {elementForm.name || 'לחץ לעריכה...'}
                                      </span>
                                      <span style={{ fontSize: '9px', color: '#475569' }}>{adminElemFocusField === 'name' ? '▲' : '▼'}</span>
                                    </div>
                                    {adminElemFocusField === 'name' && (
                                      <div style={{ padding: '6px 8px', background: '#1e293b', borderTop: '1px solid #1e3a5f' }}>
                                        <input autoFocus value={elementForm.name}
                                          onChange={e => setElementForm(p => ({ ...p, name: e.target.value }))}
                                          onKeyDown={e => { if (e.key === 'Enter') setAdminElemFocusField(null); if (e.key === 'Escape') setAdminElemFocusField(null); }}
                                          placeholder="שם האלמנט"
                                          style={{ width: '100%', padding: '5px 8px', background: '#0f172a', border: '1px solid #ec4899', borderRadius: '4px', color: 'white', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box' }} />
                                      </div>
                                    )}
                                  </div>

                                  {/* Category */}
                                  <div style={{ borderRadius: '5px', border: `1px solid ${adminElemFocusField === 'category' ? '#a855f7' : '#1e3a5f'}`, overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', background: '#0f172a', cursor: 'pointer' }}
                                      onClick={() => setAdminElemFocusField(adminElemFocusField === 'category' ? null : 'category')}>
                                      <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>🏷 קטגוריה</span>
                                      <span style={{ flex: 1, fontSize: '12px', color: elementForm.category ? '#c4b5fd' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {elementForm.category || 'כללי'}
                                      </span>
                                      <span style={{ fontSize: '9px', color: '#475569' }}>{adminElemFocusField === 'category' ? '▲' : '▼'}</span>
                                    </div>
                                    {adminElemFocusField === 'category' && (
                                      <div style={{ padding: '6px 8px', background: '#1e293b', borderTop: '1px solid #1e3a5f' }}>
                                        <input autoFocus value={elementForm.category}
                                          onChange={e => setElementForm(p => ({ ...p, category: e.target.value }))}
                                          onKeyDown={e => { if (e.key === 'Enter') setAdminElemFocusField(null); if (e.key === 'Escape') setAdminElemFocusField(null); }}
                                          placeholder="לדוגמה: תאורה, דלק, כביש"
                                          list="admin-elem-cat-list"
                                          style={{ width: '100%', padding: '5px 8px', background: '#0f172a', border: '1px solid #a855f7', borderRadius: '4px', color: 'white', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box' }} />
                                        <datalist id="admin-elem-cat-list">
                                          {Array.from(new Set(adminAirfieldElements.map((e: any) => e.category).filter(Boolean))).map(c => <option key={c} value={c} />)}
                                        </datalist>
                                      </div>
                                    )}
                                  </div>

                                  {/* Type */}
                                  <div style={{ borderRadius: '5px', border: `1px solid ${adminElemFocusField === 'type' ? '#f59e0b' : '#1e3a5f'}`, overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', background: '#0f172a', cursor: 'pointer' }}
                                      onClick={() => setAdminElemFocusField(adminElemFocusField === 'type' ? null : 'type')}>
                                      <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>🔧 סוג</span>
                                      {selType ? (
                                        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                                          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: selType.color || '#f59e0b', flexShrink: 0, display: 'inline-block' }} />
                                          <span style={{ fontSize: '12px', color: '#fbbf24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selType.icon} {selType.name}</span>
                                        </span>
                                      ) : (
                                        <span style={{ flex: 1, fontSize: '12px', color: '#475569' }}>ללא סוג</span>
                                      )}
                                      <span style={{ fontSize: '9px', color: '#475569' }}>{adminElemFocusField === 'type' ? '▲' : '▼'}</span>
                                    </div>
                                    {adminElemFocusField === 'type' && (
                                      <div style={{ padding: '6px 8px', background: '#1e293b', borderTop: '1px solid #1e3a5f', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        <button onClick={() => setElementForm(p => ({ ...p, element_type_id: '' }))}
                                          style={{ padding: '4px 8px', background: elementForm.element_type_id === '' ? '#292524' : 'transparent', border: `1px solid ${elementForm.element_type_id === '' ? '#f59e0b' : '#334155'}`, borderRadius: '4px', color: '#94a3b8', fontSize: '11px', cursor: 'pointer', textAlign: 'right', direction: 'rtl' }}>
                                          ללא סוג
                                        </button>
                                        {adminElementTypes.map(et => (
                                          <button key={et.id} onClick={() => { setElementForm(p => ({ ...p, element_type_id: String(et.id) })); setAdminElemFocusField(null); }}
                                            style={{ padding: '4px 8px', background: String(et.id) === elementForm.element_type_id ? '#1c1917' : 'transparent', border: `1px solid ${String(et.id) === elementForm.element_type_id ? et.color || '#f59e0b' : '#334155'}`, borderRadius: '4px', color: et.color || '#f59e0b', fontSize: '11px', cursor: 'pointer', textAlign: 'right', direction: 'rtl', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            {typeof et.icon === 'string' && et.icon.startsWith('MAP:')
                                              ? <span style={{ display: 'flex', alignItems: 'center', width: '14px', height: '14px', flexShrink: 0 }}>{renderGroundSvgIcon(et.icon, 12)}</span>
                                              : <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: et.color || '#f59e0b', flexShrink: 0, display: 'inline-block' }} />}
                                            {typeof et.icon === 'string' && !et.icon.startsWith('MAP:') ? `${et.icon} ` : ''}{et.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Status — always visible as quick-pick buttons */}
                                  <div style={{ borderRadius: '5px', border: `1px solid ${selStatus.color}44`, background: '#0f172a', padding: '5px 8px' }}>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '5px' }}>🔵 סטטוס</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                      {ELEM_STATUS_OPTIONS.map(s => (
                                        <button key={s.val} onClick={() => setElementForm(p => ({ ...p, status: s.val }))}
                                          style={{ padding: '3px 9px', borderRadius: '4px', border: `2px solid ${elementForm.status === s.val ? s.color : 'transparent'}`, background: elementForm.status === s.val ? s.bg : '#1e293b', color: s.color, fontSize: '11px', fontWeight: elementForm.status === s.val ? 'bold' : 'normal', cursor: 'pointer', transition: 'all 0.15s' }}>
                                          {s.val}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Note */}
                                  <div style={{ borderRadius: '5px', border: `1px solid ${adminElemFocusField === 'note' ? '#64748b' : '#1e3a5f'}`, overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', background: '#0f172a', cursor: 'pointer' }}
                                      onClick={() => setAdminElemFocusField(adminElemFocusField === 'note' ? null : 'note')}>
                                      <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>📝 הערה</span>
                                      <span style={{ flex: 1, fontSize: '11px', color: elementForm.note ? '#94a3b8' : '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {elementForm.note || 'אין הערה'}
                                      </span>
                                      <span style={{ fontSize: '9px', color: '#475569' }}>{adminElemFocusField === 'note' ? '▲' : '▼'}</span>
                                    </div>
                                    {adminElemFocusField === 'note' && (
                                      <div style={{ padding: '6px 8px', background: '#1e293b', borderTop: '1px solid #1e3a5f' }}>
                                        <textarea autoFocus value={elementForm.note}
                                          onChange={e => setElementForm(p => ({ ...p, note: e.target.value }))}
                                          onKeyDown={e => { if (e.key === 'Escape') setAdminElemFocusField(null); }}
                                          placeholder="הערה (אופציונלי)"
                                          rows={2}
                                          style={{ width: '100%', padding: '5px 8px', background: '#0f172a', border: '1px solid #475569', borderRadius: '4px', color: 'white', fontSize: '12px', direction: 'rtl', resize: 'none', boxSizing: 'border-box' }} />
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Op-check: relevant routes + blocking statuses */}
                                <div style={{ padding: '6px 8px', borderTop: '1px solid #1e3a5f' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', cursor: 'pointer' }}
                                    onClick={() => setAdminElemFocusField((adminElemFocusField as any) === 'opcheck' ? null : 'opcheck' as any)}>
                                    <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 'bold' }}>⚠ בדיקת תפעול</span>
                                    {(elementForm.relevant_routes.length > 0 || elementForm.blocking_statuses.length > 0) && (
                                      <span style={{ fontSize: '9px', background: '#78350f', color: '#fde68a', borderRadius: '3px', padding: '1px 4px' }}>
                                        {elementForm.relevant_routes.length} מסלול{elementForm.relevant_routes.length !== 1 ? 'ות' : ''} · {elementForm.blocking_statuses.length} סטטוס{elementForm.blocking_statuses.length !== 1 ? 'ים' : ''}
                                      </span>
                                    )}
                                    <span style={{ fontSize: '9px', color: '#475569', marginRight: 'auto' }}>{(adminElemFocusField as any) === 'opcheck' ? '▲' : '▼'}</span>
                                  </div>
                                  {(adminElemFocusField as any) === 'opcheck' && (
                                    <div style={{ background: '#1a1000', borderRadius: '5px', border: '1px solid #78350f', padding: '7px 8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {/* Relevant routes */}
                                      <div>
                                        <div style={{ fontSize: '10px', color: '#fbbf24', marginBottom: '4px', fontWeight: 'bold' }}>🛣 מסלולים רלוונטיים (הרכב עובר בהם)</div>
                                        {adminAirfieldRoutes.filter((r: any) => Number(r.airfield_id) === Number(selectedAdminAirfieldId)).length === 0
                                          ? <div style={{ fontSize: '10px', color: '#475569' }}>אין מסלולים מוגדרים בשדה זה</div>
                                          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {adminAirfieldRoutes.filter((r: any) => Number(r.airfield_id) === Number(selectedAdminAirfieldId)).map((r: any) => {
                                              const isOn = elementForm.relevant_routes.includes(r.id);
                                              return (
                                                <button key={r.id} onClick={() => setElementForm(p => ({ ...p, relevant_routes: isOn ? p.relevant_routes.filter(id => id !== r.id) : [...p.relevant_routes, r.id] }))}
                                                  style={{ padding: '2px 8px', background: isOn ? '#78350f' : '#1e293b', color: isOn ? '#fde68a' : '#64748b', border: `1px solid ${isOn ? '#f59e0b' : '#334155'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: isOn ? 'bold' : 'normal' }}>
                                                  {isOn ? '✓ ' : ''}{r.name}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        }
                                      </div>
                                      {/* Blocking statuses */}
                                      <div>
                                        <div style={{ fontSize: '10px', color: '#fbbf24', marginBottom: '4px', fontWeight: 'bold' }}>🚫 סטטוסים מפריעים (מציתים התראה)</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                          {(() => {
                                            const allowedStatuses: string[] = (adminElementTypes.find((et: any) => String(et.id) === elementForm.element_type_id) as any)?.allowed_statuses || [];
                                            const statOpts = allowedStatuses.length > 0 ? allowedStatuses : ['תקין', 'שמיש', 'חלקי', 'לא תקין', 'תקול', 'סגור'];
                                            return statOpts.map((s: string) => {
                                              const isOn = elementForm.blocking_statuses.includes(s);
                                              const COLOR: Record<string, string> = { 'תקין': '#22c55e', 'שמיש': '#86efac', 'חלקי': '#fb923c', 'לא תקין': '#f87171', 'תקול': '#fca5a5', 'סגור': '#94a3b8' };
                                              return (
                                                <button key={s} onClick={() => setElementForm(p => ({ ...p, blocking_statuses: isOn ? p.blocking_statuses.filter(x => x !== s) : [...p.blocking_statuses, s] }))}
                                                  style={{ padding: '2px 8px', background: isOn ? '#450a0a' : '#1e293b', color: isOn ? (COLOR[s] || '#fca5a5') : '#64748b', border: `1px solid ${isOn ? (COLOR[s] || '#ef4444') : '#334155'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: isOn ? 'bold' : 'normal' }}>
                                                  {isOn ? '✓ ' : ''}{s}
                                                </button>
                                              );
                                            });
                                          })()}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Show in driver toggle */}
                                <div style={{ padding: '6px 8px', borderTop: '1px solid #1e3a5f' }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', direction: 'rtl' }}>
                                    <input type="checkbox" checked={elementForm.show_in_driver}
                                      onChange={e => setElementForm(p => ({ ...p, show_in_driver: e.target.checked }))}
                                      style={{ width: '15px', height: '15px', accentColor: '#22c55e', cursor: 'pointer', flexShrink: 0 }} />
                                    <span style={{ fontSize: '12px', color: elementForm.show_in_driver ? '#4ade80' : '#94a3b8', fontWeight: elementForm.show_in_driver ? 'bold' : 'normal' }}>
                                      🚗 הצג לנהג חיוני
                                    </span>
                                    {elementForm.show_in_driver && (
                                      <span style={{ fontSize: '10px', color: '#16a34a', background: '#14532d', padding: '1px 6px', borderRadius: '8px', border: '1px solid #16a34a' }}>פעיל</span>
                                    )}
                                  </label>
                                </div>

                                {/* Save/Cancel */}
                                <div style={{ display: 'flex', gap: '6px', padding: '6px 8px', borderTop: '1px solid #1e3a5f' }}>
                                  <button onClick={doSave}
                                    style={{ flex: 1, padding: '6px', background: elementForm.name.trim() ? '#be185d' : '#374151', color: elementForm.name.trim() ? 'white' : '#6b7280', border: 'none', borderRadius: '5px', cursor: elementForm.name.trim() ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: 'bold' }}>
                                    ✓ שמור
                                  </button>
                                  <button onClick={() => { setShowElementForm(false); setEditingElement(null); setElementForm({ name: '', element_type_id: '', status: 'תקין', note: '', category: '', relevant_routes: [], blocking_statuses: [], show_in_driver: false }); setAdminElemFocusField(null); }}
                                    style={{ padding: '6px 12px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>
                                    ביטול
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                          {!showElementForm && adminAirfieldElements.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '10px 0', color: '#64748b', fontSize: '11px' }}>
                              אין אלמנטים עדיין — לחץ <span style={{ color: '#ec4899', fontWeight: 'bold' }}>+ הוסף</span> להוספה
                            </div>
                          )}
                          {placingElementMode && placingElementId && (
                            <div style={{ background: '#1a0a2e', border: '1px solid #ec4899', borderRadius: '4px', padding: '5px 7px', fontSize: '10px', color: '#f9a8d4' }}>
                              📍 לחץ על המפה לקביעת מיקום — ESC לביטול
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Point form */}
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '6px', paddingBottom: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: adminAFExpanded.has('points') ? '4px' : 0 }} onClick={() => toggleAFSec('points')}>
                      <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 'bold' }}>📍 נקודות ({airfieldPoints.filter((p: any) => p.point_type !== 'admin_loc').length})</div>
                      {(() => {
                        const anchor = getAnchorFromMapData(adminAirfieldMapData);
                        const missing = anchor && airfieldPoints.filter((p: any) => p.x_pct != null && (p.lat == null || p.lng == null));
                        if (!missing || !missing.length) return null;
                        return (
                          <button onClick={async (e) => {
                            e.stopPropagation();
                            const a = getAnchorFromMapData(adminAirfieldMapData)!;
                            for (const pt of missing as any[]) {
                              const geo = imagePctToGeo(pt.x_pct, pt.y_pct, a);
                              await fetch(`${API_URL}/airfield-points/${pt.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: pt.name, x_pct: pt.x_pct, y_pct: pt.y_pct, display_order: pt.display_order ?? 0, color: pt.color || '#3b82f6', marker: pt.marker || 'circle', density_warn: pt.density_warn ?? 3, point_type: pt.point_type || null, lat: geo.lat, lng: geo.lon }) });
                            }
                            if (selectedAdminAirfieldId) {
                              const pts = await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`).then(r => r.json());
                              setAirfieldPoints(pts);
                            }
                          }} title={`עגן נ"צ GPS ל-${(missing as any[]).length} נקודות`}
                            style={{ padding: '1px 6px', background: '#064e3b', color: '#34d399', border: '1px solid #065f46', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', marginLeft: '4px', flexShrink: 0 }}>🔁 עגן נ"צ</button>
                        );
                      })()}
                      <button onClick={e => { e.stopPropagation(); toggleAdminLayer('points'); }} title={adminMapLayers.points ? 'הסתר שכבה במפה' : 'הצג שכבה במפה'} style={{ padding: '1px 5px', background: 'transparent', border: `1px solid ${adminMapLayers.points ? '#60a5fa' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: adminMapLayers.points ? '#60a5fa' : '#475569', marginLeft: '4px', flexShrink: 0 }}>{adminMapLayers.points ? '✓' : '○'}</button>
                      <span style={{ color: adminAFExpanded.has('points') ? '#60a5fa' : '#475569', fontSize: '11px' }}>{adminAFExpanded.has('points') ? '▲' : '▼'}</span>
                    </div>
                    {adminAFExpanded.has('points') && hasMap && (
                      <>
                        <div style={{ borderTop: '1px solid #33415544', paddingTop: '8px' }}>
                          <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>נקודה חדשה:</div>
                          <input value={airfieldPointForm.name} onChange={e => setAirfieldPointForm(p => ({ ...p, name: e.target.value }))} placeholder="שם הנקודה"
                            style={{ width: '100%', padding: '6px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box', marginBottom: '6px' }} />
                          <select value={airfieldPointForm.point_type} onChange={e => setAirfieldPointForm(p => ({ ...p, point_type: e.target.value }))}
                            style={{ width: '100%', padding: '5px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', color: airfieldPointForm.point_type ? 'white' : '#64748b', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box', marginBottom: '6px' }}>
                            <option value=''>קטגוריה (אופציונלי)</option>
                            <option value='alignment'>נקודת התיישורת</option>
                            <option value='katsam'>קצ"מ</option>
                            <option value='datk'>דת"ק</option>
                            <option value='waiting'>המתנה</option>
                            <option value='general'>כללי</option>
                            <option value='admin_loc'>🏢 מקום מנהלתי</option>
                          </select>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                            <label style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>⚠️ התראת עומס (מטוסים):</label>
                            <input type="number" min={1} max={20} value={airfieldPointForm.density_warn}
                              onChange={e => setAirfieldPointForm(p => ({ ...p, density_warn: Math.max(1, Number(e.target.value)) }))}
                              style={{ width: '52px', padding: '4px 6px', background: '#0f172a', border: '1px solid #f59e0b', borderRadius: '4px', color: '#fbbf24', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }} />
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                            <div>
                              <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '2px' }}>צבע</div>
                              <input type="color" value={airfieldPointForm.color} onChange={e => setAirfieldPointForm(p => ({ ...p, color: e.target.value }))}
                                style={{ width: '32px', height: '26px', padding: '1px', background: 'transparent', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '2px' }}>סמל</div>
                              <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                                {GROUND_POINT_MARKERS.map(m => (
                                  <button key={m.key} onClick={() => setAirfieldPointForm(p => ({ ...p, marker: m.key }))} title={m.label}
                                    style={{ padding: '2px 3px', borderRadius: '3px', border: `2px solid ${airfieldPointForm.marker === m.key ? airfieldPointForm.color : '#334155'}`, background: airfieldPointForm.marker === m.key ? '#1e293b' : '#0f172a', cursor: 'pointer' }}>
                                    <GroundMarkerSVG marker={m.key} color={airfieldPointForm.marker === m.key ? airfieldPointForm.color : '#64748b'} size={13} />
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          {selectedAdminAirfieldId
                            ? <button onClick={() => { if (!airfieldPointForm.name.trim()) return; setPlacingPointMode(true); }} disabled={!airfieldPointForm.name.trim()}
                                style={{ width: '100%', padding: '6px', background: placingPointMode ? '#92400e' : (airfieldPointForm.name.trim() ? '#1d4ed8' : '#1e293b'), color: 'white', border: 'none', borderRadius: '5px', cursor: airfieldPointForm.name.trim() ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: 'bold', opacity: airfieldPointForm.name.trim() ? 1 : 0.5 }}>
                                {placingPointMode ? '📍 לחץ על המפה...' : '📍 הנח על מפה'}
                              </button>
                            : <div style={{ color: '#f59e0b', fontSize: '11px', textAlign: 'center' }}>שמור תחילה</div>
                          }
                          {placingPointMode && <div style={{ marginTop: '3px', color: '#fbbf24', fontSize: '10px', textAlign: 'center' }}>ESC לביטול</div>}
                        </div>

                        {/* Points list */}
                        <div>
                          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>נקודות ({airfieldPoints.length}):</div>
                          {airfieldPoints.length === 0
                            ? <p style={{ color: '#475569', fontSize: '11px', textAlign: 'center', margin: 0 }}>אין נקודות</p>
                            : airfieldPoints.map(pt => {
                              const isEditing = editingPoint?.id === pt.id;
                              return (
                                <div key={pt.id} style={{ marginBottom: '4px', borderRadius: '6px', border: `1px solid ${isEditing ? '#3b82f6' : (pt.color || '#1e293b') + '44'}`, overflow: 'hidden' }}>
                                  {/* Row header */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 7px', background: '#0f172a' }}>
                                    <GroundMarkerSVG marker={pt.marker || 'circle'} color={pt.color || '#3b82f6'} size={12} />
                                    <span style={{ color: '#e2e8f0', fontSize: '11px', flex: 1 }}>{pt.name}</span>
                                    {pt.point_type && <span style={{ fontSize: '9px', color: '#a5b4fc', background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: '3px', padding: '1px 4px', whiteSpace: 'nowrap', flexShrink: 0 }}>{{ alignment: 'התיישורת', katsam: 'קצ"מ', datk: 'דת"ק', waiting: 'המתנה', general: 'כללי', admin_loc: '🏢 ב"מ' }[pt.point_type as string] ?? pt.point_type}</span>}
                                    <span title="סף התראת עומס" style={{ fontSize: '9px', color: '#f59e0b', background: '#1c1400', border: '1px solid #78350f', borderRadius: '3px', padding: '1px 4px', whiteSpace: 'nowrap', flexShrink: 0 }}>⚠️ {pt.density_warn ?? 3}</span>
                                    <button
                                      title={pt.show_in_driver ? 'מוצג לנהג חיוני — לחץ להסרה' : 'לחץ להצגה בתפריט נהג חיוני'}
                                      onClick={async () => {
                                        await fetch(`${API_URL}/airfield-points/${pt.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: pt.name, point_type: pt.point_type || null, color: pt.color || '#3b82f6', marker: pt.marker || 'circle', density_warn: pt.density_warn ?? 3, x_pct: pt.x_pct, y_pct: pt.y_pct, lat: pt.lat, lng: pt.lng, show_in_driver: !pt.show_in_driver }) });
                                        const pts = await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`).then(r => r.json());
                                        setAirfieldPoints(pts);
                                      }}
                                      style={{ padding: '1px 5px', background: pt.show_in_driver ? '#14532d' : 'transparent', color: pt.show_in_driver ? '#4ade80' : '#475569', border: `1px solid ${pt.show_in_driver ? '#16a34a' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontWeight: pt.show_in_driver ? 'bold' : 'normal', flexShrink: 0 }}>
                                      {pt.show_in_driver ? '🚗✓' : '🚗'}
                                    </button>
                                    <button
                                      onClick={() => setEditingPoint(isEditing ? null : { id: pt.id, name: pt.name, color: pt.color || '#3b82f6', marker: pt.marker || 'circle', density_warn: pt.density_warn ?? 3, point_type: pt.point_type || '' })}
                                      style={{ padding: '1px 6px', background: isEditing ? '#1e3a5f' : '#1e293b', color: isEditing ? '#93c5fd' : '#94a3b8', border: `1px solid ${isEditing ? '#3b82f6' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>
                                      {isEditing ? '▲' : '✏️'}
                                    </button>
                                    <button onClick={() => deletePoint(pt.id)} style={{ padding: '1px 5px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>מחק</button>
                                  </div>
                                  {/* Inline edit form */}
                                  {isEditing && editingPoint && (
                                    <div style={{ padding: '8px', background: '#0a1628', borderTop: '1px solid #1e3a5f', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      <input
                                        value={editingPoint.name}
                                        onChange={e => setEditingPoint(p => p ? { ...p, name: e.target.value } : p)}
                                        placeholder="שם הנקודה"
                                        style={{ width: '100%', padding: '5px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box' }}
                                      />
                                      <select value={editingPoint.point_type} onChange={e => setEditingPoint(p => p ? { ...p, point_type: e.target.value } : p)}
                                        style={{ width: '100%', padding: '4px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: editingPoint.point_type ? 'white' : '#64748b', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box' }}>
                                        <option value=''>קטגוריה (אופציונלי)</option>
                                        <option value='alignment'>נקודת התיישורת</option>
                                        <option value='katsam'>קצ"מ</option>
                                        <option value='datk'>דת"ק</option>
                                        <option value='waiting'>המתנה</option>
                                        <option value='general'>כללי</option>
                                        <option value='admin_loc'>🏢 מקום מנהלתי</option>
                                      </select>
                                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        <label style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>⚠️ עומס:</label>
                                        <input type="number" min={1} max={20} value={editingPoint.density_warn}
                                          onChange={e => setEditingPoint(p => p ? { ...p, density_warn: Math.max(1, Number(e.target.value)) } : p)}
                                          style={{ width: '50px', padding: '4px 6px', background: '#0f172a', border: '1px solid #f59e0b', borderRadius: '4px', color: '#fbbf24', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }} />
                                        <div style={{ flex: 1 }} />
                                        <label style={{ fontSize: '10px', color: '#94a3b8' }}>צבע:</label>
                                        <input type="color" value={editingPoint.color}
                                          onChange={e => setEditingPoint(p => p ? { ...p, color: e.target.value } : p)}
                                          style={{ width: '28px', height: '22px', padding: '1px', background: 'transparent', border: '1px solid #334155', borderRadius: '3px', cursor: 'pointer' }} />
                                      </div>
                                      <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                                        {GROUND_POINT_MARKERS.map(m => (
                                          <button key={m.key} onClick={() => setEditingPoint(p => p ? { ...p, marker: m.key } : p)} title={m.label}
                                            style={{ padding: '2px 3px', borderRadius: '3px', border: `2px solid ${editingPoint.marker === m.key ? editingPoint.color : '#334155'}`, background: editingPoint.marker === m.key ? '#1e293b' : '#0f172a', cursor: 'pointer' }}>
                                            <GroundMarkerSVG marker={m.key} color={editingPoint.marker === m.key ? editingPoint.color : '#64748b'} size={12} />
                                          </button>
                                        ))}
                                      </div>
                                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                        <button onClick={() => setEditingPoint(null)}
                                          style={{ padding: '4px 10px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>ביטול</button>
                                        <button onClick={saveEditingPoint} disabled={!editingPoint.name.trim()}
                                          style={{ padding: '4px 12px', background: editingPoint.name.trim() ? '#1d4ed8' : '#1e293b', color: 'white', border: 'none', borderRadius: '4px', cursor: editingPoint.name.trim() ? 'pointer' : 'not-allowed', fontSize: '11px', fontWeight: 'bold', opacity: editingPoint.name.trim() ? 1 : 0.5 }}>שמור</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          }
                        </div>
                      </>
                    )}

                    {adminAFExpanded.has('points') && !hasMap && (
                      <div style={{ color: '#f59e0b', fontSize: '11px', background: '#1c1400', border: '1px solid #78350f', borderRadius: '5px', padding: '8px 10px' }}>
                        ⚠️ בחר מפה קרקעית להנחלת נקודות
                      </div>
                    )}

                    {/* ── Admin Locations (נקודות מנהלתיות) ── */}
                    {selectedAdminAirfieldId && (
                      <div style={{ borderTop: '1px solid #334155', paddingTop: '6px', paddingBottom: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: adminAFExpanded.has('admin_locs') ? '4px' : 0, cursor: 'pointer' }} onClick={() => toggleAFSec('admin_locs')}>
                          <div style={{ color: '#34d399', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>🏢 נקודות מנהלתיות ({airfieldPoints.filter((p: any) => p.point_type === 'admin_loc').length})</div>
                          <span style={{ color: adminAFExpanded.has('admin_locs') ? '#34d399' : '#475569', fontSize: '11px', marginRight: '4px' }}>{adminAFExpanded.has('admin_locs') ? '▲' : '▼'}</span>
                        </div>

                        {adminAFExpanded.has('admin_locs') && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {/* Add form */}
                            <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                              <input
                                value={adminLocNewName}
                                onChange={e => { setAdminLocNewName(e.target.value); if (placingAdminLocMode) setPlacingAdminLocMode(false); }}
                                onKeyDown={async e => {
                                  if (e.key === 'Enter' && adminLocNewName.trim() && selectedAdminAirfieldId) {
                                    if (hasMap) { setPlacingAdminLocMode(true); return; }
                                    await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: adminLocNewName.trim(), x_pct: 50, y_pct: 50, color: '#34d399', marker: 'circle', density_warn: 99, point_type: 'admin_loc' }) });
                                    const pts = await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`).then(r => r.json());
                                    setAirfieldPoints(pts); setAdminLocNewName('');
                                  }
                                }}
                                placeholder="שם מקום + Enter"
                                style={{ flex: 1, padding: '5px 8px', background: '#0f172a', border: `1px solid ${placingAdminLocMode ? '#34d399' : '#34d399'}`, borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl', outline: 'none' }}
                              />
                              {hasMap
                                ? <button
                                    onClick={() => { if (!adminLocNewName.trim()) return; setPlacingAdminLocMode(v => !v); }}
                                    style={{ padding: '5px 8px', background: placingAdminLocMode ? '#065f46' : '#0f172a', color: placingAdminLocMode ? '#34d399' : '#64748b', border: `1px solid ${placingAdminLocMode ? '#34d399' : '#334155'}`, borderRadius: '5px', cursor: adminLocNewName.trim() ? 'pointer' : 'not-allowed', fontSize: '11px', opacity: adminLocNewName.trim() ? 1 : 0.5, whiteSpace: 'nowrap' }}>
                                    {placingAdminLocMode ? '📍 לחץ מפה...' : '🗺️ הנח'}
                                  </button>
                                : <button
                                    onClick={async () => {
                                      if (!adminLocNewName.trim() || !selectedAdminAirfieldId) return;
                                      await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: adminLocNewName.trim(), x_pct: 50, y_pct: 50, color: '#34d399', marker: 'circle', density_warn: 99, point_type: 'admin_loc' }) });
                                      const pts = await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`).then(r => r.json());
                                      setAirfieldPoints(pts); setAdminLocNewName('');
                                    }}
                                    style={{ padding: '5px 10px', background: '#065f46', color: '#6ee7b7', border: '1px solid #34d399', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{'+ הוסף'}</button>
                              }
                            </div>
                            {/* List */}
                            {airfieldPoints.filter((p: any) => p.point_type === 'admin_loc').length === 0
                              ? <div style={{ color: '#475569', fontSize: '11px', padding: '6px 0' }}>אין נקודות מנהלתיות עדיין</div>
                              : airfieldPoints.filter((p: any) => p.point_type === 'admin_loc').map((pt: any) => {
                                const isEdit = editingAdminLoc?.id === pt.id;
                                return (
                                  <div key={pt.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: '#0f172a', border: `1px solid ${isEdit ? '#34d399' : '#1e293b'}`, borderRadius: '5px', padding: '4px 7px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <span style={{ fontSize: '14px' }}>🏢</span>
                                      {isEdit
                                        ? <input
                                            autoFocus
                                            value={editingAdminLoc!.name}
                                            onChange={e => setEditingAdminLoc(p => p ? { ...p, name: e.target.value } : p)}
                                            onKeyDown={async e => {
                                              if (e.key === 'Enter') {
                                                await fetch(`${API_URL}/airfield-points/${pt.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editingAdminLoc!.name, point_type: 'admin_loc', color: pt.color || '#34d399', marker: pt.marker || 'circle', density_warn: pt.density_warn ?? 99, x_pct: pt.x_pct, y_pct: pt.y_pct, lat: pt.lat, lng: pt.lng }) });
                                                const pts = await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`).then(r => r.json());
                                                setAirfieldPoints(pts); setEditingAdminLoc(null);
                                              } else if (e.key === 'Escape') setEditingAdminLoc(null);
                                            }}
                                            style={{ flex: 1, padding: '2px 6px', background: '#1e293b', border: '1px solid #34d399', borderRadius: '4px', color: 'white', fontSize: '12px', direction: 'rtl', outline: 'none' }}
                                          />
                                        : <span style={{ flex: 1, color: '#e2e8f0', fontSize: '12px' }}>{pt.name}</span>
                                      }
                                      {hasMap && (
                                        <button
                                          title="עקור מיקום על מפה"
                                          onClick={() => { setAdminLocNewName(pt.name); setPlacingAdminLocMode(true); }}
                                          style={{ padding: '1px 5px', background: 'transparent', border: '1px solid #334155', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: '#34d399' }}>🗺️</button>
                                      )}
                                      <button
                                        title={pt.show_in_driver ? 'מוצג לנהג חיוני — לחץ להסרה' : 'לחץ להצגה בתפריט נהג חיוני'}
                                        onClick={async () => {
                                          await fetch(`${API_URL}/airfield-points/${pt.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: pt.name, point_type: pt.point_type, color: pt.color || '#34d399', marker: pt.marker || 'circle', density_warn: pt.density_warn ?? 99, x_pct: pt.x_pct, y_pct: pt.y_pct, lat: pt.lat, lng: pt.lng, show_in_driver: !pt.show_in_driver }) });
                                          const pts = await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`).then(r => r.json());
                                          setAirfieldPoints(pts);
                                        }}
                                        style={{ padding: '1px 5px', background: pt.show_in_driver ? '#14532d' : 'transparent', color: pt.show_in_driver ? '#4ade80' : '#475569', border: `1px solid ${pt.show_in_driver ? '#16a34a' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontWeight: pt.show_in_driver ? 'bold' : 'normal' }}>
                                        {pt.show_in_driver ? '🚗✓' : '🚗'}
                                      </button>
                                      <button onClick={() => isEdit ? setEditingAdminLoc(null) : setEditingAdminLoc({ id: pt.id, name: pt.name })}
                                        style={{ padding: '1px 6px', background: 'transparent', border: `1px solid ${isEdit ? '#34d399' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: isEdit ? '#34d399' : '#94a3b8' }}>
                                        {isEdit ? '✓' : '✏️'}
                                      </button>
                                      {isEdit && (
                                        <button onClick={async () => {
                                          await fetch(`${API_URL}/airfield-points/${pt.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editingAdminLoc!.name, point_type: 'admin_loc', color: pt.color || '#34d399', marker: pt.marker || 'circle', density_warn: pt.density_warn ?? 99, x_pct: pt.x_pct, y_pct: pt.y_pct, lat: pt.lat, lng: pt.lng }) });
                                          const pts = await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`).then(r => r.json());
                                          setAirfieldPoints(pts); setEditingAdminLoc(null);
                                        }} style={{ padding: '1px 6px', background: '#065f46', border: '1px solid #34d399', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: '#6ee7b7', fontWeight: 'bold' }}>שמור</button>
                                      )}
                                      <button onClick={async () => {
                                        if (!confirm(`למחוק את "${pt.name}"?`)) return;
                                        await fetch(`${API_URL}/airfield-points/${pt.id}`, { method: 'DELETE' });
                                        const pts = await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`).then(r => r.json());
                                        setAirfieldPoints(pts);
                                      }} style={{ padding: '1px 6px', background: 'transparent', border: '1px solid #334155', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: '#ef4444' }}>✕</button>
                                    </div>
                                    {/* GPS coords row */}
                                    {(pt.lat != null && pt.lng != null)
                                      ? <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingRight: '22px' }}>
                                          <span style={{ color: '#34d399', fontSize: '8px' }}>📡</span>
                                          <span style={{ color: '#6ee7b7', fontSize: '8px', fontFamily: 'monospace' }}>{Number(pt.lat).toFixed(5)}, {Number(pt.lng).toFixed(5)}</span>
                                        </div>
                                      : pt.x_pct != null && <div style={{ color: '#475569', fontSize: '8px', paddingRight: '22px' }}>📍 ({Math.round(pt.x_pct)}%, {Math.round(pt.y_pct)}%) — אין GPS</div>
                                    }
                                  </div>
                                );
                              })
                            }
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Airfield Status Types ── */}
                    {selectedAdminAirfieldId && (
                      <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: adminAFExpanded.has('statustypes') ? '6px' : 0, cursor: 'pointer' }} onClick={() => toggleAFSec('statustypes')}>
                          <div style={{ color: '#fb923c', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>🏷️ סוגי סטטוס מבצעי</div>
                          {adminAFExpanded.has('statustypes') && <button onClick={e => { e.stopPropagation(); setEditingStatusType(null); setStatusTypeForm({ name: '', color: '#6b7280' }); setShowStatusTypeForm(true); }}
                            style={{ padding: '2px 8px', background: '#c2410c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>+ הוסף</button>}
                          <span style={{ color: adminAFExpanded.has('statustypes') ? '#fb923c' : '#475569', fontSize: '11px', marginRight: '4px' }}>{adminAFExpanded.has('statustypes') ? '▲' : '▼'}</span>
                        </div>
                        {adminAFExpanded.has('statustypes') && (<>
                        {showStatusTypeForm && (
                          <div style={{ background: '#0f172a', borderRadius: '6px', border: '1px solid #c2410c', padding: '8px', marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <input value={statusTypeForm.name} onChange={e => setStatusTypeForm(p => ({ ...p, name: e.target.value }))} placeholder="שם סטטוס (לדוג׳: שמיש, סגור, שיפוצים)"
                              style={{ padding: '5px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <label style={{ fontSize: '10px', color: '#64748b' }}>צבע:</label>
                              <input type="color" value={statusTypeForm.color} onChange={e => setStatusTypeForm(p => ({ ...p, color: e.target.value }))}
                                style={{ width: '32px', height: '24px', border: 'none', background: 'transparent', cursor: 'pointer' }} />
                              <span style={{ width: '16px', height: '16px', borderRadius: '4px', background: statusTypeForm.color, display: 'inline-block', border: '1px solid #475569' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '5px' }}>
                              <button onClick={async () => {
                                if (!statusTypeForm.name.trim()) return;
                                const url = editingStatusType ? `${API_URL}/airfield-status-types/${editingStatusType.id}` : `${API_URL}/airfield-status-types`;
                                const method = editingStatusType ? 'PUT' : 'POST';
                                const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airfield_id: selectedAdminAirfieldId, name: statusTypeForm.name, color: statusTypeForm.color }) });
                                if (res.ok) { setShowStatusTypeForm(false); setEditingStatusType(null); setStatusTypeForm({ name: '', color: '#6b7280' }); loadAirfieldStatusTypes(selectedAdminAirfieldId!); }
                              }} style={{ flex: 1, padding: '4px', background: '#c2410c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>שמור</button>
                              <button onClick={() => { setShowStatusTypeForm(false); setEditingStatusType(null); }} style={{ padding: '4px 10px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>ביטול</button>
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {adminAirfieldStatusTypes.length === 0
                            ? <div style={{ color: '#475569', fontSize: '11px', textAlign: 'center', padding: '6px' }}>אין סטטוסים — הוסף ראשון</div>
                            : adminAirfieldStatusTypes.map(st => (
                              <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0f172a', borderRadius: '4px', padding: '4px 7px', border: `1px solid ${st.color}44` }}>
                                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: st.color, flexShrink: 0 }} />
                                <span style={{ flex: 1, color: '#e2e8f0', fontSize: '11px' }}>{st.name}</span>
                                <button onClick={() => { setEditingStatusType(st); setStatusTypeForm({ name: st.name, color: st.color }); setShowStatusTypeForm(true); }}
                                  style={{ padding: '1px 6px', background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f6', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>✏️</button>
                                <button onClick={async () => { if (!await customConfirm('למחוק?')) return; await fetch(`${API_URL}/airfield-status-types/${st.id}`, { method: 'DELETE' }); loadAirfieldStatusTypes(selectedAdminAirfieldId!); }}
                                  style={{ padding: '1px 6px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>✕</button>
                              </div>
                            ))
                          }
                        </div>
                        </>)}
                      </div>
                    )}

                    {/* ── Airfield Polygons (runways, aprons, etc) ── */}
                    {selectedAdminAirfieldId && (
                      <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: adminAFExpanded.has('polygons') ? '6px' : 0, cursor: 'pointer' }} onClick={() => toggleAFSec('polygons')}>
                          <div style={{ color: '#a78bfa', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>🔷 אזורים ומסלולים (פוליגונים)</div>
                          <button onClick={e => { e.stopPropagation(); toggleAdminLayer('polygons'); }} title={adminMapLayers.polygons ? 'הסתר שכבה במפה' : 'הצג שכבה במפה'} style={{ padding: '1px 5px', background: 'transparent', border: `1px solid ${adminMapLayers.polygons ? '#a78bfa' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: adminMapLayers.polygons ? '#a78bfa' : '#475569', marginLeft: '4px', flexShrink: 0 }}>{adminMapLayers.polygons ? '✓' : '○'}</button>
                          {adminAFExpanded.has('polygons') && <button onClick={e => { e.stopPropagation(); setEditingPolygon(null); setPolygonForm({ name: '', color: '#a78bfa', notes: '', parent_id: '' }); setShowPolygonForm(true); }}
                            style={{ padding: '2px 8px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>+ הוסף</button>}
                          <span style={{ color: adminAFExpanded.has('polygons') ? '#a78bfa' : '#475569', fontSize: '11px', marginRight: '4px' }}>{adminAFExpanded.has('polygons') ? '▲' : '▼'}</span>
                        </div>
                        {adminAFExpanded.has('polygons') && (<>
                        {showPolygonForm && (
                          <div style={{ background: '#0f172a', borderRadius: '6px', border: '1px solid #7c3aed', padding: '8px', marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <input value={polygonForm.name} onChange={e => setPolygonForm(p => ({ ...p, name: e.target.value }))} placeholder="שם האזור (לדוג׳: מסלול 28R)"
                              style={{ padding: '5px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl' }} />
                            <textarea value={polygonForm.notes} onChange={e => setPolygonForm(p => ({ ...p, notes: e.target.value }))} placeholder="הערה (אופציונלי)" rows={2}
                              style={{ padding: '5px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '11px', direction: 'rtl', resize: 'none' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <label style={{ fontSize: '10px', color: '#64748b' }}>צבע:</label>
                              <input type="color" value={polygonForm.color} onChange={e => setPolygonForm(p => ({ ...p, color: e.target.value }))}
                                style={{ width: '32px', height: '24px', border: 'none', background: 'transparent', cursor: 'pointer' }} />
                            </div>
                            <select value={polygonForm.parent_id} onChange={e => setPolygonForm(p => ({ ...p, parent_id: e.target.value }))}
                              style={{ padding: '5px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '11px', direction: 'rtl' }}>
                              <option value="">— פוליגון ראשי (ללא הורה) —</option>
                              {adminAirfieldPolygons.filter(p => !p.parent_id).map(p => (
                                <option key={p.id} value={p.id}>{p.name} (תת-פוליגון)</option>
                              ))}
                            </select>
                            <div style={{ display: 'flex', gap: '5px' }}>
                              {hasMap && (
                                <button onClick={async () => {
                                  if (!polygonForm.name.trim()) return;
                                  const res = await fetch(`${API_URL}/airfield-polygons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airfield_id: selectedAdminAirfieldId, name: polygonForm.name, color: polygonForm.color, notes: polygonForm.notes, parent_id: polygonForm.parent_id ? Number(polygonForm.parent_id) : null, polygon: [] }) });
                                  if (res.ok) {
                                    const created = await res.json();
                                    setShowPolygonForm(false); setPolygonForm({ name: '', color: '#a78bfa', notes: '', parent_id: '' });
                                    await loadAirfieldPolygons(selectedAdminAirfieldId!);
                                    setDrawingPolygonId(created.id); setPolygonDraftPoints([]);
                                  }
                                }} style={{ flex: 1, padding: '4px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✏️ צייר על מפה</button>
                              )}
                              <button onClick={async () => {
                                if (!polygonForm.name.trim()) return;
                                const url = editingPolygon ? `${API_URL}/airfield-polygons/${editingPolygon.id}` : `${API_URL}/airfield-polygons`;
                                const method = editingPolygon ? 'PUT' : 'POST';
                                const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airfield_id: selectedAdminAirfieldId, name: polygonForm.name, color: polygonForm.color, notes: polygonForm.notes, parent_id: polygonForm.parent_id ? Number(polygonForm.parent_id) : null, polygon: editingPolygon?.polygon || [] }) });
                                if (res.ok) { setShowPolygonForm(false); setEditingPolygon(null); loadAirfieldPolygons(selectedAdminAirfieldId!); }
                              }} style={{ padding: '4px 10px', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>שמור</button>
                              <button onClick={() => { setShowPolygonForm(false); setEditingPolygon(null); }} style={{ padding: '4px 8px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>ביטול</button>
                            </div>
                          </div>
                        )}
                        {drawingPolygonId && (
                          <div style={{ background: '#2d1657', border: '1px solid #7c3aed', borderRadius: '5px', padding: '5px 8px', marginBottom: '5px', fontSize: '11px', color: '#c4b5fd' }}>
                            ✏️ ציור פוליגון — {polygonDraftPoints.length} נקודות — לחץ לחיצה כפולה לסיום — ESC לביטול
                            {polygonDraftPoints.length >= 3 && (
                              <button onClick={async () => {
                                await fetch(`${API_URL}/airfield-polygons/${drawingPolygonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: adminAirfieldPolygons.find(p => p.id === drawingPolygonId)?.name, color: adminAirfieldPolygons.find(p => p.id === drawingPolygonId)?.color || '#a78bfa', polygon: polygonDraftPoints }) });
                                setDrawingPolygonId(null); setPolygonDraftPoints([]);
                                loadAirfieldPolygons(selectedAdminAirfieldId!);
                              }} style={{ marginRight: '8px', padding: '2px 8px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>✓ שמור</button>
                            )}
                            <button onClick={() => { setDrawingPolygonId(null); setPolygonDraftPoints([]); }} style={{ marginRight: '4px', padding: '2px 8px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>ביטול</button>
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {adminAirfieldPolygons.length === 0
                            ? <div style={{ color: '#475569', fontSize: '11px', textAlign: 'center', padding: '6px' }}>אין פוליגונים עדיין</div>
                            : adminAirfieldPolygons.map(pg => (
                              <div key={pg.id} style={{ background: '#0f172a', borderRadius: '4px', border: `1px solid ${pg.color}55`, padding: '4px 7px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <span style={{ width: '10px', height: '10px', background: pg.color + '66', border: `2px solid ${pg.color}`, borderRadius: '2px', flexShrink: 0 }} />
                                  <span style={{ flex: 1, color: '#e2e8f0', fontSize: '11px', fontWeight: 'bold' }}>{pg.parent_id ? '  └ ' : ''}{pg.name}</span>
                                  <span style={{ fontSize: '9px', color: '#64748b' }}>{(pg.polygon || []).length} נק׳</span>
                                </div>
                                {pg.notes && <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pg.notes}</div>}
                                <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                                  <button onClick={() => { setDrawingPolygonId(pg.id); setPolygonDraftPoints(Array.isArray(pg.polygon) ? [...pg.polygon] : []); }}
                                    style={{ flex: 1, padding: '2px', background: '#4c1d95', color: '#c4b5fd', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>✏️ צייר</button>
                                  <button onClick={() => { setEditingPolygon(pg); setPolygonForm({ name: pg.name, color: pg.color || '#a78bfa', notes: pg.notes || '', parent_id: pg.parent_id ? String(pg.parent_id) : '' }); setShowPolygonForm(true); }}
                                    style={{ padding: '2px 5px', background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f6', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>ערוך</button>
                                  <button onClick={async () => { if (!await customConfirm('למחוק?')) return; await fetch(`${API_URL}/airfield-polygons/${pg.id}`, { method: 'DELETE' }); loadAirfieldPolygons(selectedAdminAirfieldId!); }}
                                    style={{ padding: '2px 5px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>✕</button>
                                </div>
                              </div>
                            ))
                          }
                        </div>
                        </>)}
                      </div>
                    )}

                    {/* ── Airfield Sectors (rectangular zoom areas) ── */}
                    {selectedAdminAirfieldId && (
                      <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: adminAFExpanded.has('sectors') ? '6px' : 0, cursor: 'pointer' }} onClick={() => toggleAFSec('sectors')}>
                          <div style={{ color: '#34d399', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>⬛ סקטורי מפה (אזורי זום)</div>
                          <button onClick={e => { e.stopPropagation(); toggleAdminLayer('sectors'); }} title={adminMapLayers.sectors ? 'הסתר שכבה במפה' : 'הצג שכבה במפה'} style={{ padding: '1px 5px', background: 'transparent', border: `1px solid ${adminMapLayers.sectors ? '#34d399' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: adminMapLayers.sectors ? '#34d399' : '#475569', marginLeft: '4px', flexShrink: 0 }}>{adminMapLayers.sectors ? '✓' : '○'}</button>
                          {adminAFExpanded.has('sectors') && <button onClick={e => { e.stopPropagation(); setEditingAirfieldSector(null); setAirfieldSectorForm({ name: '', notes: '' }); setShowAirfieldSectorForm(true); }}
                            style={{ padding: '2px 8px', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>+ הוסף</button>}
                          <span style={{ color: adminAFExpanded.has('sectors') ? '#34d399' : '#475569', fontSize: '11px', marginRight: '4px' }}>{adminAFExpanded.has('sectors') ? '▲' : '▼'}</span>
                        </div>
                        {adminAFExpanded.has('sectors') && (<>
                        {showAirfieldSectorForm && (
                          <div style={{ background: '#0f172a', borderRadius: '6px', border: '1px solid #059669', padding: '8px', marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <input value={airfieldSectorForm.name} onChange={e => setAirfieldSectorForm(p => ({ ...p, name: e.target.value }))} placeholder="שם הסקטור (לדוג׳: צפון מערבי)"
                              style={{ padding: '5px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl' }} />
                            <textarea value={airfieldSectorForm.notes} onChange={e => setAirfieldSectorForm(p => ({ ...p, notes: e.target.value }))} placeholder="הערה (אופציונלי)" rows={2}
                              style={{ padding: '5px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '11px', direction: 'rtl', resize: 'none' }} />
                            {hasMap && <div style={{ fontSize: '10px', color: '#34d399', background: '#064e3b', border: '1px solid #059669', borderRadius: '4px', padding: '4px 8px' }}>💡 אחרי שמירה — גרור ריבוע על המפה לקביעת גבולות הסקטור</div>}
                            <div style={{ display: 'flex', gap: '5px' }}>
                              <button onClick={async () => {
                                if (!airfieldSectorForm.name.trim()) return;
                                const url = editingAirfieldSector ? `${API_URL}/airfield-sectors/${editingAirfieldSector.id}` : `${API_URL}/airfield-sectors`;
                                const method = editingAirfieldSector ? 'PUT' : 'POST';
                                const defaultRect = { x: 10, y: 10, w: 30, h: 20 };
                                const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airfield_id: selectedAdminAirfieldId, name: airfieldSectorForm.name, notes: airfieldSectorForm.notes, rect: editingAirfieldSector?.rect || defaultRect }) });
                                if (res.ok) {
                                  const saved = await res.json();
                                  setShowAirfieldSectorForm(false); setEditingAirfieldSector(null); setAirfieldSectorForm({ name: '', notes: '' });
                                  await loadAirfieldSectors(selectedAdminAirfieldId!);
                                  if (hasMap) { setDrawingSectorId(saved.id); sectorDragStartRef.current = null; }
                                }
                              }} style={{ flex: 1, padding: '4px', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>שמור</button>
                              <button onClick={() => { setShowAirfieldSectorForm(false); setEditingAirfieldSector(null); }} style={{ padding: '4px 10px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>ביטול</button>
                            </div>
                          </div>
                        )}
                        {drawingSectorId && (
                          <div style={{ background: '#064e3b', border: '1px solid #059669', borderRadius: '5px', padding: '5px 8px', marginBottom: '5px', fontSize: '11px', color: '#6ee7b7' }}>
                            ⬛ גרור על המפה לציור הסקטור — ESC לביטול
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {adminAirfieldSectors.length === 0
                            ? <div style={{ color: '#475569', fontSize: '11px', textAlign: 'center', padding: '6px' }}>אין סקטורים עדיין</div>
                            : adminAirfieldSectors.map(sec => (
                              <div key={sec.id} style={{ background: '#0f172a', borderRadius: '4px', border: '1px solid #05966955', padding: '4px 7px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <span style={{ fontSize: '11px' }}>⬛</span>
                                  <span style={{ flex: 1, color: '#e2e8f0', fontSize: '11px', fontWeight: 'bold' }}>{sec.name}</span>
                                  <span style={{ fontSize: '9px', color: '#64748b' }}>{sec.rect ? `${Math.round(sec.rect.w)}×${Math.round(sec.rect.h)}%` : '—'}</span>
                                </div>
                                {sec.notes && <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>{sec.notes}</div>}
                                <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                                  <button onClick={() => { setDrawingSectorId(sec.id); sectorDragStartRef.current = null; }}
                                    style={{ flex: 1, padding: '2px', background: '#064e3b', color: '#6ee7b7', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>⬛ שרטט מחדש</button>
                                  <button onClick={() => { setEditingAirfieldSector(sec); setAirfieldSectorForm({ name: sec.name, notes: sec.notes || '' }); setShowAirfieldSectorForm(true); }}
                                    style={{ padding: '2px 5px', background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f6', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>ערוך</button>
                                  <button onClick={async () => { if (!await customConfirm('למחוק?')) return; await fetch(`${API_URL}/airfield-sectors/${sec.id}`, { method: 'DELETE' }); loadAirfieldSectors(selectedAdminAirfieldId!); }}
                                    style={{ padding: '2px 5px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>✕</button>
                                </div>
                              </div>
                            ))
                          }
                        </div>
                        </>)}
                      </div>
                    )}

                    {/* Airfield Routes — shown under selected airfield */}
                    {selectedAdminAirfieldId && (
                      <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: adminAFExpanded.has('routes') ? '6px' : 0, cursor: 'pointer' }} onClick={() => toggleAFSec('routes')}>
                          <div style={{ color: '#7dd3fc', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>🛤️ מסלולי הסעה</div>
                          <button onClick={e => { e.stopPropagation(); toggleAdminLayer('routes'); }} title={adminMapLayers.routes ? 'הסתר שכבה במפה' : 'הצג שכבה במפה'} style={{ padding: '1px 5px', background: 'transparent', border: `1px solid ${adminMapLayers.routes ? '#7dd3fc' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: adminMapLayers.routes ? '#7dd3fc' : '#475569', marginLeft: '4px', flexShrink: 0 }}>{adminMapLayers.routes ? '✓' : '○'}</button>
                          {adminAFExpanded.has('routes') && <button onClick={e => { e.stopPropagation(); setEditingAirfieldRoute(null); setAirfieldRouteForm({ name: '', airfield_id: String(selectedAdminAirfieldId), color: '#3b82f6', notes: '', category: 'general', is_runway: false, end_a_name: '', end_b_name: '' }); setShowAirfieldRouteForm(true); }}
                            style={{ padding: '2px 8px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>+ מסלול</button>}
                          <span style={{ color: adminAFExpanded.has('routes') ? '#7dd3fc' : '#475569', fontSize: '11px', marginRight: '4px' }}>{adminAFExpanded.has('routes') ? '▲' : '▼'}</span>
                        </div>
                        {adminAFExpanded.has('routes') && (<>
                        {showAirfieldRouteForm && (
                          <div style={{ background: '#0f172a', padding: '8px', borderRadius: '6px', marginBottom: '6px', border: '1px solid #1e3a5f' }}>
                            <input type="text" placeholder="שם מסלול" value={airfieldRouteForm.name}
                              onChange={e => setAirfieldRouteForm(p => ({ ...p, name: e.target.value }))}
                              style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box', marginBottom: '5px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                              <label style={{ fontSize: '10px', color: '#64748b', flexShrink: 0 }}>צבע:</label>
                              <input type="color" value={airfieldRouteForm.color}
                                onChange={e => setAirfieldRouteForm(p => ({ ...p, color: e.target.value }))}
                                style={{ width: '32px', height: '22px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }} />
                              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: airfieldRouteForm.color, flexShrink: 0 }} />
                            </div>
                            <textarea placeholder="הערות (אופציונלי)" value={airfieldRouteForm.notes}
                              onChange={e => setAirfieldRouteForm(p => ({ ...p, notes: e.target.value }))}
                              rows={2}
                              style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '11px', direction: 'rtl', boxSizing: 'border-box', resize: 'none', marginBottom: '5px' }} />
                            <select value={airfieldRouteForm.category}
                              onChange={e => setAirfieldRouteForm(p => ({ ...p, category: e.target.value }))}
                              style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '11px', direction: 'rtl', marginBottom: '5px' }}>
                              <option value="general">כללי</option>
                              <option value="aircraft">מטוסים</option>
                              <option value="vehicle">כלי רכב</option>
                            </select>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', cursor: 'pointer' }}>
                              <input type="checkbox" checked={airfieldRouteForm.is_runway} onChange={e => setAirfieldRouteForm(p => ({ ...p, is_runway: e.target.checked }))} style={{ width: '14px', height: '14px', cursor: 'pointer' }} />
                              <span style={{ fontSize: '11px', color: airfieldRouteForm.is_runway ? '#fcd34d' : '#94a3b8' }}>🛫 מסלול המראה</span>
                            </label>
                            {airfieldRouteForm.is_runway && (
                              <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                <input type="text" placeholder='קצה א׳ (לדוג׳ "27")' value={airfieldRouteForm.end_a_name}
                                  onChange={e => setAirfieldRouteForm(p => ({ ...p, end_a_name: e.target.value }))}
                                  style={{ flex: 1, padding: '4px 7px', background: '#1e293b', border: '1px solid #b45309', borderRadius: '5px', color: '#fcd34d', fontSize: '12px', direction: 'rtl' }} />
                                <input type="text" placeholder='קצה ב׳ (לדוג׳ "09")' value={airfieldRouteForm.end_b_name}
                                  onChange={e => setAirfieldRouteForm(p => ({ ...p, end_b_name: e.target.value }))}
                                  style={{ flex: 1, padding: '4px 7px', background: '#1e293b', border: '1px solid #b45309', borderRadius: '5px', color: '#fcd34d', fontSize: '12px', direction: 'rtl' }} />
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: '5px' }}>
                              {!editingAirfieldRoute && hasMap ? (
                                <button onClick={() => {
                                  if (!airfieldRouteForm.name.trim()) return;
                                  setPendingNewRoute({ name: airfieldRouteForm.name, color: airfieldRouteForm.color, notes: airfieldRouteForm.notes, category: airfieldRouteForm.category, is_runway: airfieldRouteForm.is_runway, end_a_name: airfieldRouteForm.end_a_name, end_b_name: airfieldRouteForm.end_b_name });
                                  setDrawingRouteId(-1);
                                  setRouteDraftPoints([]);
                                  setShowAirfieldRouteForm(false);
                                }} style={{ flex: 1, padding: '4px', background: '#d97706', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✏️ ציור</button>
                              ) : (
                                <button onClick={async () => {
                                  if (!airfieldRouteForm.name.trim()) return;
                                  const url = editingAirfieldRoute ? `${API_URL}/airfield-routes/${editingAirfieldRoute.id}` : `${API_URL}/airfield-routes`;
                                  const method = editingAirfieldRoute ? 'PUT' : 'POST';
                                  const existingPath = editingAirfieldRoute
                                    ? (adminAirfieldRoutes.find((x: any) => x.id === editingAirfieldRoute.id)?.route_path || [])
                                    : [];
                                  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: airfieldRouteForm.name, airfield_id: Number(selectedAdminAirfieldId), color: airfieldRouteForm.color, notes: airfieldRouteForm.notes, route_category: airfieldRouteForm.category, route_path: existingPath, is_runway: airfieldRouteForm.is_runway, end_a_name: airfieldRouteForm.end_a_name || null, end_b_name: airfieldRouteForm.end_b_name || null }) });
                                  if (res.ok) {
                                    setShowAirfieldRouteForm(false); setEditingAirfieldRoute(null); setAirfieldRouteForm({ name: '', airfield_id: String(selectedAdminAirfieldId), color: '#3b82f6', notes: '', category: 'general', is_runway: false, end_a_name: '', end_b_name: '' });
                                    fetch(`${API_URL}/airfield-routes`).then(r => r.ok ? r.json() : []).then(setAdminAirfieldRoutes).catch(() => {});
                                  }
                                }} style={{ flex: 1, padding: '4px', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>שמור</button>
                              )}
                              <button onClick={() => { setShowAirfieldRouteForm(false); setEditingAirfieldRoute(null); setAirfieldRouteForm({ name: '', airfield_id: String(selectedAdminAirfieldId), color: '#3b82f6', notes: '', category: 'general', is_runway: false, end_a_name: '', end_b_name: '' }); }}
                                style={{ padding: '4px 8px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>ביטול</button>
                            </div>
                          </div>
                        )}
                        {/* Drawing mode indicator */}
                        {drawingRouteId && (
                          <div style={{ background: '#1c1400', border: '1px solid #fbbf24', borderRadius: '5px', padding: '6px 8px', marginBottom: '5px', fontSize: '10px', color: '#fcd34d' }}>
                            ✏️ מצב ציור — לחץ על המפה להוספת נקודות
                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                              <button onClick={async () => {
                                if (routeDraftPoints.length < 2) { alert('יש לסמן לפחות 2 נקודות'); return; }
                                if (drawingRouteId === -1 && pendingNewRoute) {
                                  await fetch(`${API_URL}/airfield-routes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: pendingNewRoute.name, airfield_id: Number(selectedAdminAirfieldId), color: pendingNewRoute.color, notes: pendingNewRoute.notes, route_category: pendingNewRoute.category || 'general', route_path: routeDraftPoints, is_runway: pendingNewRoute.is_runway || false, end_a_name: pendingNewRoute.end_a_name || null, end_b_name: pendingNewRoute.end_b_name || null }) });
                                  setPendingNewRoute(null);
                                } else {
                                  const route = adminAirfieldRoutes.find((r: any) => r.id === drawingRouteId);
                                  if (!route) return;
                                  await fetch(`${API_URL}/airfield-routes/${drawingRouteId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: route.name, color: route.color || '#3b82f6', notes: route.notes || '', route_path: routeDraftPoints }) });
                                }
                                fetch(`${API_URL}/airfield-routes`).then(r => r.ok ? r.json() : []).then(setAdminAirfieldRoutes).catch(() => {});
                                setDrawingRouteId(null); setRouteDraftPoints([]);
                              }} style={{ flex: 1, padding: '3px', background: '#059669', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>✓ שמור ({routeDraftPoints.length})</button>
                              <button onClick={() => setRouteDraftPoints(prev => prev.slice(0, -1))} disabled={routeDraftPoints.length === 0} style={{ padding: '3px 6px', background: '#1e3a5f', color: '#93c5fd', border: 'none', borderRadius: '3px', cursor: routeDraftPoints.length === 0 ? 'not-allowed' : 'pointer', fontSize: '10px', opacity: routeDraftPoints.length === 0 ? 0.4 : 1 }}>⌫</button>
                              <button onClick={() => setRouteDraftPoints([])} style={{ padding: '3px 6px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>נקה</button>
                              <button onClick={() => { setDrawingRouteId(null); setRouteDraftPoints([]); }} style={{ padding: '3px 6px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>ביטול</button>
                            </div>
                          </div>
                        )}
                        {adminAirfieldRoutes.filter((r: any) => Number(r.airfield_id) === Number(selectedAdminAirfieldId)).length === 0
                          ? <div style={{ color: '#475569', fontSize: '11px', textAlign: 'center', padding: '6px 0' }}>אין מסלולים</div>
                          : adminAirfieldRoutes.filter((r: any) => Number(r.airfield_id) === Number(selectedAdminAirfieldId)).map((r: any) => {
                            const routePath = Array.isArray(r.route_path) ? r.route_path : (typeof r.route_path === 'string' ? JSON.parse(r.route_path) : []);
                            return (
                              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 7px', background: drawingRouteId === r.id ? '#1c1400' : '#0f172a', borderRadius: '4px', marginBottom: '3px', border: `1px solid ${drawingRouteId === r.id ? '#fbbf24' : '#1e293b'}` }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.color || '#3b82f6', flexShrink: 0 }} />
                                <span title={(r.route_category || 'general') === 'vehicle' ? 'מסלול הסעה לרכבים' : r.is_runway ? 'מסלול המראה' : 'מסלול הסעה למטוסים'} style={{ fontSize: '10px', flexShrink: 0 }}>{(r.route_category || 'general') === 'vehicle' ? '🚗' : r.is_runway ? '🛫' : '✈'}</span>
                                <span style={{ flex: 1, color: r.is_runway ? '#fcd34d' : '#e2e8f0', fontSize: '11px' }}>{r.name}{r.is_runway && (r.end_a_name || r.end_b_name) ? ` (${[r.end_a_name, r.end_b_name].filter(Boolean).join('/')})` : ''}</span>
                                {routePath.length > 0 && <span style={{ fontSize: '9px', color: '#64748b' }}>({routePath.length}נק)</span>}
                                {r.notes && <span title={r.notes} style={{ fontSize: '10px', color: '#fbbf24', cursor: 'default' }}>📝</span>}
                                {hasMap && <button onClick={() => { setDrawingRouteId(r.id); setRouteDraftPoints(routePath); }}
                                  style={{ padding: '1px 5px', background: drawingRouteId === r.id ? '#92400e' : '#1e293b', color: drawingRouteId === r.id ? '#fcd34d' : '#94a3b8', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>✏️</button>}
                                {routePath.length > 0 && <button title="נקה את כל נקודות המסלול" onClick={async () => { if (!await customConfirm('לנקות את כל נקודות המסלול?')) return; await fetch(`${API_URL}/airfield-routes/${r.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: r.name, color: r.color || '#3b82f6', notes: r.notes || '', route_path: [], route_category: r.route_category || 'general', is_runway: r.is_runway || false, end_a_name: r.end_a_name || null, end_b_name: r.end_b_name || null }) }); fetch(`${API_URL}/airfield-routes`).then(res => res.ok ? res.json() : []).then(setAdminAirfieldRoutes).catch(() => {}); }}
                                  style={{ padding: '1px 5px', background: '#451a03', color: '#fb923c', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>🗑</button>}
                                <button onClick={() => { setEditingAirfieldRoute(r); setAirfieldRouteForm({ name: r.name, airfield_id: String(selectedAdminAirfieldId), color: r.color || '#3b82f6', notes: r.notes || '', category: r.route_category || 'general', is_runway: r.is_runway || false, end_a_name: r.end_a_name || '', end_b_name: r.end_b_name || '' }); setShowAirfieldRouteForm(true); }}
                                  style={{ padding: '1px 5px', background: '#1e3a5f', color: '#93c5fd', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>✎</button>
                                <button onClick={async () => { if (!await customConfirm('למחוק?')) return; await fetch(`${API_URL}/airfield-routes/${r.id}`, { method: 'DELETE' }); fetch(`${API_URL}/airfield-routes`).then(res => res.ok ? res.json() : []).then(setAdminAirfieldRoutes).catch(() => {}); }}
                                  style={{ padding: '1px 5px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                              </div>
                            );
                          })
                        }

                        {/* Route Links section */}
                        {selectedAdminAirfieldId && (() => {
                          const myRoutes = adminAirfieldRoutes.filter((r: any) => Number(r.airfield_id) === Number(selectedAdminAirfieldId));
                          const allOtherPresets = presets.filter((p: any) => true);
                          const presetsWithAirfield = presets.filter((p: any) => p.airfield_id && Number(p.airfield_id) === Number(selectedAdminAirfieldId));
                          const selectedPresetB = allOtherPresets.find((p: any) => p.id === Number(newRouteLinkForm.presetIdB));
                          const canSave = newRouteLinkForm.presetIdA && newRouteLinkForm.routeIdA && newRouteLinkForm.presetIdB && newRouteLinkForm.routeIdB;
                          return (
                            <div style={{ marginTop: '10px', padding: '10px', background: '#0a1628', borderRadius: '7px', border: '1px solid #1e3a5f' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ color: '#7dd3fc', fontSize: '12px', fontWeight: 'bold' }}>🔗 קישורי מסלולים</span>
                                {!showAddRouteLinkForm && (
                                  <button onClick={() => setShowAddRouteLinkForm(true)}
                                    style={{ background: '#1e3a5f', color: '#7dd3fc', border: '1px solid #2563eb', borderRadius: '4px', padding: '2px 9px', fontSize: '11px', cursor: 'pointer' }}>+ קישור</button>
                                )}
                              </div>
                              {adminRouteLinks.length === 0 && !showAddRouteLinkForm && (
                                <div style={{ color: '#475569', fontSize: '11px', textAlign: 'center', padding: '4px 0' }}>אין קישורי מסלולים</div>
                              )}
                              {adminRouteLinks.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: showAddRouteLinkForm ? '8px' : '0' }}>
                                  {adminRouteLinks.map((lnk: any) => (
                                    <div key={lnk.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0f172a', borderRadius: '5px', padding: '5px 8px' }}>
                                      <span style={{ flex: 1, fontSize: '11px', color: '#e2e8f0', direction: 'rtl' }}>
                                        <span style={{ color: '#94a3b8', fontSize: '10px' }}>{lnk.preset_name_a} / </span>
                                        <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{lnk.route_name_a}</span>
                                        <span style={{ color: '#475569', margin: '0 5px' }}>→</span>
                                        <span style={{ color: '#94a3b8', fontSize: '10px' }}>{lnk.preset_name_b} / </span>
                                        <span style={{ color: '#86efac', fontWeight: 'bold' }}>{lnk.route_name_b}</span>
                                      </span>
                                      <button onClick={async () => {
                                        await fetch(`${API_URL}/route-links/${lnk.id}`, { method: 'DELETE' });
                                        const updated = await fetch(`${API_URL}/route-links?airfield_id=${selectedAdminAirfieldId}`).then(r => r.ok ? r.json() : []);
                                        setAdminRouteLinks(updated);
                                      }} style={{ background: 'transparent', color: '#ef4444', border: '1px solid #7f1d1d', borderRadius: '3px', padding: '1px 6px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {showAddRouteLinkForm && (
                                <div style={{ background: '#0f172a', borderRadius: '6px', padding: '10px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                  <div>
                                    <label style={{ color: '#94a3b8', fontSize: '11px', display: 'block', marginBottom: '3px' }}>עמדה א (שדה זה):</label>
                                    <select value={newRouteLinkForm.presetIdA}
                                      onChange={e => setNewRouteLinkForm(p => ({ ...p, presetIdA: e.target.value, routeIdA: '' }))}
                                      style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px', direction: 'rtl' }}>
                                      <option value="">— בחר עמדה —</option>
                                      {presetsWithAirfield.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{ color: '#94a3b8', fontSize: '11px', display: 'block', marginBottom: '3px' }}>מסלול א:</label>
                                    <select value={newRouteLinkForm.routeIdA}
                                      onChange={e => setNewRouteLinkForm(p => ({ ...p, routeIdA: e.target.value }))}
                                      style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px', direction: 'rtl' }}>
                                      <option value="">— בחר מסלול —</option>
                                      {myRoutes.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{ color: '#94a3b8', fontSize: '11px', display: 'block', marginBottom: '3px' }}>עמדה ב:</label>
                                    <select value={newRouteLinkForm.presetIdB}
                                      onChange={e => {
                                        const pid = e.target.value;
                                        setNewRouteLinkForm(p => ({ ...p, presetIdB: pid, routeIdB: '' }));
                                        if (pid) {
                                          const bp = presets.find((p: any) => p.id === Number(pid));
                                          if (bp?.airfield_id) {
                                            setRouteLinkPresetBRoutes(adminAirfieldRoutes.filter((r: any) => Number(r.airfield_id) === Number(bp.airfield_id)));
                                          } else { setRouteLinkPresetBRoutes([]); }
                                        } else { setRouteLinkPresetBRoutes([]); }
                                      }}
                                      style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px', direction: 'rtl' }}>
                                      <option value="">— בחר עמדה —</option>
                                      {allOtherPresets.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                  </div>
                                  {newRouteLinkForm.presetIdB && (
                                    <div>
                                      <label style={{ color: '#94a3b8', fontSize: '11px', display: 'block', marginBottom: '3px' }}>
                                        מסלול ב{selectedPresetB ? ` (${selectedPresetB.name})` : ''}:
                                      </label>
                                      {routeLinkPresetBRoutes.length === 0
                                        ? <div style={{ color: '#ef4444', fontSize: '11px' }}>לעמדה זו אין שדה תעופה עם מסלולים.</div>
                                        : (
                                          <select value={newRouteLinkForm.routeIdB}
                                            onChange={e => setNewRouteLinkForm(p => ({ ...p, routeIdB: e.target.value }))}
                                            style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px', direction: 'rtl' }}>
                                            <option value="">— בחר מסלול —</option>
                                            {routeLinkPresetBRoutes.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                          </select>
                                        )}
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button disabled={!canSave}
                                      onClick={async () => {
                                        try {
                                          await fetch(`${API_URL}/route-links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset_id_a: Number(newRouteLinkForm.presetIdA), route_id_a: Number(newRouteLinkForm.routeIdA), preset_id_b: Number(newRouteLinkForm.presetIdB), route_id_b: Number(newRouteLinkForm.routeIdB) }) });
                                          const updated = await fetch(`${API_URL}/route-links?airfield_id=${selectedAdminAirfieldId}`).then(r => r.ok ? r.json() : []);
                                          setAdminRouteLinks(updated);
                                          setShowAddRouteLinkForm(false);
                                          setNewRouteLinkForm({ presetIdA: '', routeIdA: '', presetIdB: '', routeIdB: '' });
                                          setRouteLinkPresetBRoutes([]);
                                        } catch {}
                                      }}
                                      style={{ padding: '5px 14px', background: canSave ? '#059669' : '#1e3a2a', color: 'white', border: 'none', borderRadius: '4px', cursor: canSave ? 'pointer' : 'not-allowed', fontSize: '12px', opacity: canSave ? 1 : 0.5 }}>
                                      שמור קישור
                                    </button>
                                    <button onClick={() => { setShowAddRouteLinkForm(false); setNewRouteLinkForm({ presetIdA: '', routeIdA: '', presetIdB: '', routeIdB: '' }); setRouteLinkPresetBRoutes([]); }}
                                      style={{ padding: '5px 10px', background: '#475569', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                                      ביטול
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        </>)}
                      </div>
                    )}

                    {/* Vehicle routes — per-airfield driving routes */}
                    {selectedAdminAirfieldId && (
                      <div style={{ borderTop: '1px solid #334155', paddingTop: '6px', paddingBottom: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: adminAFExpanded.has('vehicle_routes') ? '6px' : 0 }} onClick={() => toggleAFSec('vehicle_routes')}>
                          <div style={{ color: '#fb923c', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>🚗 נתיבי נסיעה ({bRoutes.length})</div>
                          {adminAFExpanded.has('vehicle_routes') && !showVehicleRouteForm && !drawingVehicleRouteId && (
                            <button onClick={e => { e.stopPropagation(); setEditingRoute(null); setRouteForm({ name: '', color: '#f97316', route_type: 'vehicle' }); setShowVehicleRouteForm(true); }}
                              style={{ padding: '2px 8px', background: '#c2410c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', marginLeft: '4px' }}>+ נתיב</button>
                          )}
                          {adminAFExpanded.has('vehicle_routes') && !drawingVehicleRouteId && (() => {
                            const anchor = getAnchorFromMapData(adminAirfieldMapData);
                            const needsGeo = anchor && bRoutes.some((vr: any) => Array.isArray(vr.waypoints) && vr.waypoints.length > 0 && !vr.waypoints.every((p: any) => p.lat != null));
                            if (!needsGeo) return null;
                            return (
                              <button onClick={async (e) => {
                                e.stopPropagation();
                                const a = getAnchorFromMapData(adminAirfieldMapData)!;
                                const toAnchor = bRoutes.filter((vr: any) => Array.isArray(vr.waypoints) && vr.waypoints.length > 0 && !vr.waypoints.every((p: any) => p.lat != null));
                                for (const vr of toAnchor) {
                                  const newWps = vr.waypoints.map((p: any) => (p.lat != null && p.lon != null) ? p : { ...p, ...imagePctToGeo(p.x, p.y, a) });
                                  await fetch(`${API_URL}/base-routes/${vr.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: vr.name, color: vr.color, waypoints: newWps, notes: vr.notes || '' }) });
                                }
                                fetch(`${API_URL}/base-routes?airfield_id=${selectedAdminAirfieldId}`).then(r => r.ok ? r.json() : []).then(setBRoutes);
                              }} title={`עגן נ"צ GPS ל-${bRoutes.filter((vr: any) => Array.isArray(vr.waypoints) && vr.waypoints.length > 0 && !vr.waypoints.every((p: any) => p.lat != null)).length} נתיבים`}
                                style={{ padding: '2px 7px', background: '#064e3b', color: '#34d399', border: '1px solid #065f46', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', marginLeft: '4px' }}>🔁 עגן נ"צ</button>
                            );
                          })()}
                          <span style={{ color: adminAFExpanded.has('vehicle_routes') ? '#fb923c' : '#475569', fontSize: '11px', marginRight: '4px' }}>{adminAFExpanded.has('vehicle_routes') ? '▲' : '▼'}</span>
                        </div>
                        {adminAFExpanded.has('vehicle_routes') && (<>
                          {showVehicleRouteForm && (
                            <div style={{ background: '#0f172a', padding: '8px', borderRadius: '6px', marginBottom: '6px', border: '1px solid #7c2d12' }}>
                              <input type="text" placeholder="שם הנתיב" value={routeForm.name}
                                onChange={e => setRouteForm(p => ({ ...p, name: e.target.value }))}
                                style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #7c2d12', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box', marginBottom: '5px' }} />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <label style={{ fontSize: '10px', color: '#64748b', flexShrink: 0 }}>צבע:</label>
                                <input type="color" value={routeForm.color}
                                  onChange={e => setRouteForm(p => ({ ...p, color: e.target.value }))}
                                  style={{ width: '32px', height: '22px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }} />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <label style={{ fontSize: '10px', color: '#64748b', flexShrink: 0 }}>סוג מסלול:</label>
                                <select value={routeForm.route_type} onChange={e => setRouteForm(p => ({ ...p, route_type: e.target.value }))}
                                  style={{ flex: 1, padding: '3px 6px', background: '#1e293b', border: '1px solid #7c2d12', borderRadius: '4px', color: 'white', fontSize: '11px' }}>
                                  <option value="vehicle">🚗 כביש רכב</option>
                                  <option value="taxiway">✈️ מסלול הסעה</option>
                                  <option value="runway">🛬 מסלול טיסה</option>
                                </select>
                              </div>
                              <div style={{ display: 'flex', gap: '5px' }}>
                                {hasMap ? (
                                  <button onClick={() => {
                                    if (!routeForm.name.trim()) { alert('חובה שם נתיב'); return; }
                                    setDrawingVehicleRouteId(editingRoute ? editingRoute.id : -1);
                                    const existing = editingRoute && Array.isArray(editingRoute.waypoints) ? editingRoute.waypoints.filter((p: any) => p.x != null) : [];
                                    setVehicleRouteDraftPoints(existing);
                                    setShowVehicleRouteForm(false);
                                  }} style={{ flex: 1, padding: '4px', background: '#d97706', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✏️ ציור על המפה</button>
                                ) : (
                                  <div style={{ flex: 1, color: '#ef4444', fontSize: '11px', textAlign: 'center', padding: '3px 0' }}>אין מפה לשדה זה</div>
                                )}
                                <button onClick={() => { setShowVehicleRouteForm(false); setEditingRoute(null); }}
                                  style={{ padding: '4px 8px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>ביטול</button>
                              </div>
                            </div>
                          )}
                          {drawingVehicleRouteId && (
                            <div style={{ background: '#1c0a00', border: '1px solid #f97316', borderRadius: '6px', padding: '6px 8px', marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ color: '#fb923c', fontSize: '11px', fontWeight: 'bold' }}>✏️ מצב ציור — {vehicleRouteDraftPoints.length} נקודות — לחץ על המפה להוספת נ"צ</div>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button onClick={async () => {
                                  if (vehicleRouteDraftPoints.length < 1) { alert('יש לסמן לפחות נקודה אחת'); return; }
                                  const url = drawingVehicleRouteId === -1 ? `${API_URL}/base-routes` : `${API_URL}/base-routes/${drawingVehicleRouteId}`;
                                  const method = drawingVehicleRouteId === -1 ? 'POST' : 'PUT';
                                  const body: any = { name: routeForm.name, color: routeForm.color, waypoints: vehicleRouteDraftPoints, notes: '', route_type: routeForm.route_type || 'vehicle' };
                                  if (drawingVehicleRouteId === -1) body.airfield_id = selectedAdminAirfieldId;
                                  await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                                  setDrawingVehicleRouteId(null); setVehicleRouteDraftPoints([]); setEditingRoute(null); setRouteForm({ name: '', color: '#f97316', route_type: 'vehicle' });
                                  fetch(`${API_URL}/base-routes?airfield_id=${selectedAdminAirfieldId}`).then(r => r.ok ? r.json() : []).then(setBRoutes);
                                }} style={{ flex: 1, padding: '3px', background: '#059669', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>✓ שמור ({vehicleRouteDraftPoints.length})</button>
                                <button onClick={() => setVehicleRouteDraftPoints(prev => prev.slice(0, -1))} disabled={vehicleRouteDraftPoints.length === 0}
                                  style={{ padding: '3px 6px', background: '#1e3a5f', color: '#93c5fd', border: 'none', borderRadius: '3px', cursor: vehicleRouteDraftPoints.length === 0 ? 'not-allowed' : 'pointer', fontSize: '10px', opacity: vehicleRouteDraftPoints.length === 0 ? 0.4 : 1 }}>⌫</button>
                                <button onClick={() => { setDrawingVehicleRouteId(null); setVehicleRouteDraftPoints([]); setShowVehicleRouteForm(false); setEditingRoute(null); }}
                                  style={{ padding: '3px 6px', background: '#450a0a', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                              </div>
                            </div>
                          )}
                          {bRoutes.map((vr: any) => (
                            <div key={vr.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 7px', background: drawingVehicleRouteId === vr.id ? '#1c0a00' : '#0f172a', borderRadius: '4px', marginBottom: '3px', border: `1px solid ${drawingVehicleRouteId === vr.id ? '#f97316' : '#1e293b'}` }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: vr.color || '#f97316', flexShrink: 0 }} />
                              <span style={{ flex: 1, fontSize: '11px', color: '#e2e8f0', direction: 'rtl', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vr.name}</span>
                              {vr.route_type === 'taxiway' && <span title="מסלול הסעה" style={{ fontSize: '9px', background: '#1d4ed8', color: '#bfdbfe', borderRadius: '3px', padding: '0 4px' }}>הסעה</span>}
                              {vr.route_type === 'runway' && <span title="מסלול טיסה" style={{ fontSize: '9px', background: '#7c3aed', color: '#ddd6fe', borderRadius: '3px', padding: '0 4px' }}>טיסה</span>}
                              <span style={{ fontSize: '10px', color: '#64748b' }}>{Array.isArray(vr.waypoints) ? vr.waypoints.length : 0} נק׳</span>
                              {(() => { const wps = Array.isArray(vr.waypoints) ? vr.waypoints : []; const hasGeo = wps.length > 0 && wps.every((p: any) => p.lat != null && p.lon != null); const partialGeo = !hasGeo && wps.some((p: any) => p.lat != null); return hasGeo ? <span title="כל הנקודות מעוגנות לנ&quot;צ GPS" style={{ fontSize: '10px', color: '#4ade80' }}>⚓</span> : partialGeo ? <span title="חלק מהנקודות מעוגנות לנ&quot;צ" style={{ fontSize: '10px', color: '#fbbf24' }}>⚓</span> : wps.length > 0 ? <span title="ללא נ&quot;צ GPS — המפה לא מכויילת" style={{ fontSize: '10px', color: '#475569' }}>—</span> : null; })()}
                              {!drawingVehicleRouteId && (<>
                                <button onClick={e => { e.stopPropagation(); setEditingRoute(vr); setRouteForm({ name: vr.name, color: vr.color || '#f97316', route_type: vr.route_type || 'vehicle' }); setShowVehicleRouteForm(true); }}
                                  style={{ padding: '1px 5px', background: '#1e3a5f', color: '#7dd3fc', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>✏️</button>
                                <button onClick={async () => { if (!await customConfirm('למחוק נתיב זה?')) return; await fetch(`${API_URL}/base-routes/${vr.id}`, { method: 'DELETE' }); setBRoutes(prev => prev.filter((r: any) => r.id !== vr.id)); }}
                                  style={{ padding: '1px 5px', background: '#450a0a', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>🗑</button>
                              </>)}
                            </div>
                          ))}
                          {bRoutes.length === 0 && !showVehicleRouteForm && !drawingVehicleRouteId && (
                            <div style={{ color: '#475569', fontSize: '11px', textAlign: 'center', padding: '6px 0' }}>אין נתיבי נסיעה. לחץ "+ נתיב" להוספה.</div>
                          )}
                        </>)}
                      </div>
                    )}

                    {/* Taxiways definition */}
                    {selectedAdminAirfieldId && (
                      <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: adminAFExpanded.has('taxiways') ? '6px' : 0, cursor: 'pointer' }} onClick={() => toggleAFSec('taxiways')}>
                          <div style={{ color: '#fbbf24', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>🛤 TAXIWAYS ({adminAirfieldTaxiways.length})</div>
                          {adminAFExpanded.has('taxiways') && !twAdminShowAdd && (
                            <button onClick={e => { e.stopPropagation(); setTwAdminNewName(''); setTwAdminShowAdd(true); }}
                              style={{ padding: '2px 8px', background: '#78350f', color: '#fcd34d', border: '1px solid #fbbf2466', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', marginLeft: '4px' }}>+ הוסף</button>
                          )}
                          <span style={{ color: adminAFExpanded.has('taxiways') ? '#fbbf24' : '#475569', fontSize: '11px', marginRight: '4px' }}>{adminAFExpanded.has('taxiways') ? '▲' : '▼'}</span>
                        </div>
                        {adminAFExpanded.has('taxiways') && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {twAdminShowAdd && (
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '4px' }}>
                                <input autoFocus type="text" value={twAdminNewName}
                                  onChange={e => setTwAdminNewName(e.target.value)}
                                  onKeyDown={async e => {
                                    if (e.key === 'Enter' && twAdminNewName.trim()) {
                                      const r = await fetch(`${API_URL}/airfield-taxiways`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airfield_id: selectedAdminAirfieldId, name: twAdminNewName.trim() }) });
                                      if (r.ok) { const tw = await r.json(); setAdminAirfieldTaxiways(prev => [...prev, tw]); setTwAdminNewName(''); setTwAdminShowAdd(false); }
                                    } else if (e.key === 'Escape') { setTwAdminShowAdd(false); setTwAdminNewName(''); }
                                  }}
                                  placeholder="שם נתיב (A, B1, Alpha...)"
                                  style={{ flex: 1, padding: '4px 7px', background: '#1e293b', border: '1px solid #fbbf24', borderRadius: '5px', color: '#fcd34d', fontSize: '12px', direction: 'rtl' }}
                                />
                                <button onClick={async () => {
                                  if (!twAdminNewName.trim()) return;
                                  const r = await fetch(`${API_URL}/airfield-taxiways`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airfield_id: selectedAdminAirfieldId, name: twAdminNewName.trim() }) });
                                  if (r.ok) { const tw = await r.json(); setAdminAirfieldTaxiways(prev => [...prev, tw]); setTwAdminNewName(''); setTwAdminShowAdd(false); }
                                }} style={{ padding: '4px 8px', background: '#92400e', color: '#fcd34d', border: '1px solid #fbbf24', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✔</button>
                                <button onClick={() => { setTwAdminShowAdd(false); setTwAdminNewName(''); }}
                                  style={{ padding: '4px 8px', background: 'transparent', color: '#64748b', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>✕</button>
                              </div>
                            )}
                            {adminAirfieldTaxiways.length === 0 && (
                              <div style={{ fontSize: '11px', color: '#475569', textAlign: 'center', padding: '8px 0', direction: 'rtl' }}>אין TAXIWAYS מוגדרים — לחץ "+ הוסף" להוספה</div>
                            )}
                            {adminAirfieldTaxiways.map((tw: any) => (
                              <div key={tw.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 6px', background: '#0f172a', borderRadius: '5px', border: '1px solid #1e293b' }}>
                                <span style={{ flex: 1, fontSize: '12px', color: '#fcd34d', fontFamily: 'monospace', fontWeight: 'bold', direction: 'rtl' }}>{tw.name}</span>
                                <button onClick={async () => {
                                  if (!window.confirm(`למחוק את הנתיב "${tw.name}"?`)) return;
                                  await fetch(`${API_URL}/airfield-taxiways/${tw.id}`, { method: 'DELETE' });
                                  setAdminAirfieldTaxiways(prev => prev.filter((t: any) => t.id !== tw.id));
                                }} style={{ padding: '2px 6px', background: 'transparent', color: '#ef4444', border: '1px solid #7f1d1d', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', flexShrink: 0 }}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* MAP area (large, fills remaining space) */}
              {hasMap && showAirfieldForm && (
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 110px)', overflow: 'hidden', position: 'sticky', top: '70px' }}>
                  {/* Zoom toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#0f172a', borderBottom: '1px solid #1e3a5f', flexShrink: 0 }}>
                    <button onClick={() => setAdminMapZoom(z => Math.max(0.25, +(z / 1.25).toFixed(3)))} style={{ width: '22px', height: '22px', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', lineHeight: 1 }}>−</button>
                    <button onClick={() => setAdminMapZoom(1.0)} style={{ padding: '0 7px', height: '22px', background: '#1e293b', color: '#93c5fd', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', minWidth: '44px' }}>{Math.round(adminMapZoom * 100)}%</button>
                    <button onClick={() => setAdminMapZoom(z => Math.min(5, +(z * 1.25).toFixed(3)))} style={{ width: '22px', height: '22px', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', lineHeight: 1 }}>+</button>
                    <span style={{ fontSize: '10px', color: '#475569', marginRight: '4px' }}>Ctrl+גלגל לזום</span>
                    <div style={{ marginRight: 'auto' }} />
                    {adminAirfieldMapData && (() => {
                      const afIsCalibrated = !!(adminAirfieldMapData?.anchor1_lat != null && adminAirfieldMapData?.anchor2_lat != null);
                      const afDmsToDecimal = (dms: {deg:string;min:string;sec:string;dir:string}) => {
                        const d = Math.abs(parseFloat(dms.deg)||0), m = parseFloat(dms.min)||0, s = parseFloat(dms.sec)||0;
                        const dec = d + m/60 + s/3600;
                        return (dms.dir==='S'||dms.dir==='W') ? -dec : dec;
                      };
                      const afDecimalToDms = (decimal: number, isLat: boolean) => {
                        const abs = Math.abs(decimal), deg = Math.floor(abs), minFull = (abs-deg)*60, min = Math.floor(minFull), sec = (minFull-min)*60;
                        const dir = isLat ? (decimal>=0?'N':'S') : (decimal>=0?'E':'W');
                        return { deg: String(deg), min: String(min), sec: sec.toFixed(1), dir };
                      };
                      const saveAfAnchors = async () => {
                        if (!afPendingAnchor1 || !afPendingAnchor2 || !adminAirfieldMapData?.id) return;
                        const lat1=afDmsToDecimal(afPendingDmsLat1), lon1=afDmsToDecimal(afPendingDmsLon1);
                        const lat2=afDmsToDecimal(afPendingDmsLat2), lon2=afDmsToDecimal(afPendingDmsLon2);
                        if (isNaN(lat1)||isNaN(lon1)||isNaN(lat2)||isNaN(lon2)) { alert('יש להזין נ"צ תקינים'); return; }
                        setAfSavingAnchors(true);
                        try {
                          const res = await fetch(`${API_URL}/maps/${adminAirfieldMapData.id}/anchors`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ anchor1_x_img:afPendingAnchor1.x, anchor1_y_img:afPendingAnchor1.y, anchor1_lat:lat1, anchor1_lon:lon1, anchor2_x_img:afPendingAnchor2.x, anchor2_y_img:afPendingAnchor2.y, anchor2_lat:lat2, anchor2_lon:lon2 }) });
                          if (res.ok) { const upd=await res.json(); setAdminAirfieldMapData((p:any)=>({...p,...upd})); setAfAnchorMode(false); setAfPendingAnchor1(null); setAfPendingAnchor2(null); setAfAnchorStep(1); }
                        } catch {}
                        setAfSavingAnchors(false);
                      };
                      return (
                        <>
                          {!afAnchorMode ? (
                            <button onClick={() => {
                              setAfAnchorMode(true); setAfAnchorStep(1); setAfPendingAnchor1(null); setAfPendingAnchor2(null);
                              setAfPendingDmsLat1(adminAirfieldMapData?.anchor1_lat!=null ? afDecimalToDms(adminAirfieldMapData.anchor1_lat,true) : {deg:'',min:'',sec:'',dir:'N'});
                              setAfPendingDmsLon1(adminAirfieldMapData?.anchor1_lon!=null ? afDecimalToDms(adminAirfieldMapData.anchor1_lon,false) : {deg:'',min:'',sec:'',dir:'E'});
                              setAfPendingDmsLat2(adminAirfieldMapData?.anchor2_lat!=null ? afDecimalToDms(adminAirfieldMapData.anchor2_lat,true) : {deg:'',min:'',sec:'',dir:'N'});
                              setAfPendingDmsLon2(adminAirfieldMapData?.anchor2_lon!=null ? afDecimalToDms(adminAirfieldMapData.anchor2_lon,false) : {deg:'',min:'',sec:'',dir:'E'});
                            }} style={{ background: afIsCalibrated ? '#1d4ed8' : '#92400e', color:'white', border:'none', borderRadius:'5px', padding:'3px 10px', cursor:'pointer', fontSize:'11px', flexShrink:0 }}>
                              {afIsCalibrated ? '🔧 עיגון גיאו' : '📐 הגדר עיגון גיאו'}
                            </button>
                          ) : (
                            <span style={{ fontSize:'10px', color:'#fbbf24', fontWeight:'bold' }}>📐 מצב עיגון — לחץ על המפה</span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  {/* Anchor DMS panel — shown below toolbar when afAnchorMode is active */}
                  {afAnchorMode && adminAirfieldMapData && (() => {
                    const afDmsToDecimal = (dms: {deg:string;min:string;sec:string;dir:string}) => {
                      const d=Math.abs(parseFloat(dms.deg)||0), m=parseFloat(dms.min)||0, s=parseFloat(dms.sec)||0;
                      const dec=d+m/60+s/3600; return (dms.dir==='S'||dms.dir==='W')?-dec:dec;
                    };
                    const saveAfAnchors = async () => {
                      if (!afPendingAnchor1||!afPendingAnchor2||!adminAirfieldMapData?.id) return;
                      const lat1=afDmsToDecimal(afPendingDmsLat1), lon1=afDmsToDecimal(afPendingDmsLon1);
                      const lat2=afDmsToDecimal(afPendingDmsLat2), lon2=afDmsToDecimal(afPendingDmsLon2);
                      if (isNaN(lat1)||isNaN(lon1)||isNaN(lat2)||isNaN(lon2)) { alert('יש להזין נ"צ תקינים'); return; }
                      setAfSavingAnchors(true);
                      try {
                        const res=await fetch(`${API_URL}/maps/${adminAirfieldMapData.id}/anchors`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({anchor1_x_img:afPendingAnchor1.x,anchor1_y_img:afPendingAnchor1.y,anchor1_lat:lat1,anchor1_lon:lon1,anchor2_x_img:afPendingAnchor2.x,anchor2_y_img:afPendingAnchor2.y,anchor2_lat:lat2,anchor2_lon:lon2})});
                        if (res.ok) { const upd=await res.json(); setAdminAirfieldMapData((p:any)=>({...p,...upd})); setAfAnchorMode(false); setAfPendingAnchor1(null); setAfPendingAnchor2(null); setAfAnchorStep(1); }
                      } catch {}
                      setAfSavingAnchors(false);
                    };
                    return (
                      <div style={{ background:'#0a1628', borderBottom:'1px solid #1e3a5f', padding:'8px 10px', display:'flex', flexDirection:'column', gap:'6px', flexShrink:0 }}>
                        <div style={{ color:'#7dd3fc', fontSize:'11px', fontWeight:'bold', marginBottom:'2px' }}>📐 כיול גיאוגרפי — לחץ על נקודה מוכרת במפה לכל עוגן</div>
                        {([1,2] as const).map(step => {
                          const isActive = afAnchorStep === step;
                          const lat = step===1 ? afPendingDmsLat1 : afPendingDmsLat2;
                          const lon = step===1 ? afPendingDmsLon1 : afPendingDmsLon2;
                          const setLat = step===1 ? setAfPendingDmsLat1 : setAfPendingDmsLat2;
                          const setLon = step===1 ? setAfPendingDmsLon1 : setAfPendingDmsLon2;
                          const hasPin = step===1 ? !!afPendingAnchor1 : !!afPendingAnchor2;
                          const inStyle = { padding:'3px 4px', borderRadius:'4px', border:`1px solid ${isActive?'#3b82f6':'#475569'}`, background:isActive?'#172554':'#1e293b', color:'white', fontSize:'11px', textAlign:'center' as const };
                          const selStyle = { padding:'3px 4px', borderRadius:'4px', border:`1px solid ${isActive?'#3b82f6':'#475569'}`, background:isActive?'#172554':'#0f172a', color:'#67e8f9', fontSize:'11px', fontWeight:'bold' as const, cursor:'pointer' };
                          return (
                            <div key={step} onClick={() => setAfAnchorStep(step)}
                              style={{ border:`1px solid ${isActive?'#3b82f6':'#334155'}`, borderRadius:'6px', padding:'6px 8px', background:isActive?'#0f1f3d':'#0f172a', cursor:'pointer', display:'flex', flexDirection:'column', gap:'5px' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:'5px', marginBottom:'2px' }}>
                                <span style={{ fontSize:'11px', fontWeight:'bold', color:isActive?'#60a5fa':'#64748b' }}>{isActive?'▶ ':''}עוגן {step} (A{step})</span>
                                {hasPin && <span style={{ fontSize:'10px', color:'#34d399' }}>📍</span>}
                                {isActive && <span style={{ fontSize:'10px', color:'#fbbf24', marginRight:'auto' }}>← לחץ על המפה</span>}
                              </div>
                              <div style={{ display:'flex', gap:'3px', alignItems:'center', direction:'ltr' }}>
                                <select value={lat.dir} onClick={e=>e.stopPropagation()} onChange={e=>{setAfAnchorStep(step);setLat(p=>({...p,dir:e.target.value}));}} style={selStyle}>
                                  <option value="N">N</option><option value="S">S</option>
                                </select>
                                <input type="number" min="0" max="90" value={lat.deg} onClick={e=>e.stopPropagation()} onChange={e=>{setAfAnchorStep(step);setLat(p=>({...p,deg:e.target.value}));}} placeholder="°" style={{...inStyle,width:'40px'}} />
                                <span style={{color:'#475569',fontSize:'10px'}}>°</span>
                                <input type="number" min="0" max="59" value={lat.min} onClick={e=>e.stopPropagation()} onChange={e=>{setAfAnchorStep(step);setLat(p=>({...p,min:e.target.value}));}} placeholder="'" style={{...inStyle,width:'34px'}} />
                                <span style={{color:'#475569',fontSize:'10px'}}>'</span>
                                <input type="number" min="0" max="59.99" step="0.1" value={lat.sec} onClick={e=>e.stopPropagation()} onChange={e=>{setAfAnchorStep(step);setLat(p=>({...p,sec:e.target.value}));}} placeholder="''" style={{...inStyle,width:'42px'}} />
                                <span style={{color:'#475569',fontSize:'10px'}}>''</span>
                              </div>
                              <div style={{ display:'flex', gap:'3px', alignItems:'center', direction:'ltr' }}>
                                <select value={lon.dir} onClick={e=>e.stopPropagation()} onChange={e=>{setAfAnchorStep(step);setLon(p=>({...p,dir:e.target.value}));}} style={selStyle}>
                                  <option value="E">E</option><option value="W">W</option>
                                </select>
                                <input type="number" min="0" max="180" value={lon.deg} onClick={e=>e.stopPropagation()} onChange={e=>{setAfAnchorStep(step);setLon(p=>({...p,deg:e.target.value}));}} placeholder="°" style={{...inStyle,width:'40px'}} />
                                <span style={{color:'#475569',fontSize:'10px'}}>°</span>
                                <input type="number" min="0" max="59" value={lon.min} onClick={e=>e.stopPropagation()} onChange={e=>{setAfAnchorStep(step);setLon(p=>({...p,min:e.target.value}));}} placeholder="'" style={{...inStyle,width:'34px'}} />
                                <span style={{color:'#475569',fontSize:'10px'}}>'</span>
                                <input type="number" min="0" max="59.99" step="0.1" value={lon.sec} onClick={e=>e.stopPropagation()} onChange={e=>{setAfAnchorStep(step);setLon(p=>({...p,sec:e.target.value}));}} placeholder="''" style={{...inStyle,width:'42px'}} />
                                <span style={{color:'#475569',fontSize:'10px'}}>''</span>
                              </div>
                            </div>
                          );
                        })}
                        <div style={{ display:'flex', gap:'6px' }}>
                          {afAnchorStep===1 && afPendingAnchor1 && (
                            <button onClick={()=>setAfAnchorStep(2)} style={{ flex:1, background:'#1d4ed8', color:'white', border:'none', borderRadius:'4px', padding:'5px', cursor:'pointer', fontSize:'12px' }}>עבור לעוגן 2 ▶</button>
                          )}
                          {afPendingAnchor1 && afPendingAnchor2 && (
                            <button onClick={saveAfAnchors} disabled={afSavingAnchors} style={{ flex:1, background:'#059669', color:'white', border:'none', borderRadius:'4px', padding:'5px', cursor:'pointer', fontSize:'12px' }}>
                              {afSavingAnchors ? '...' : '💾 שמור עיגון'}
                            </button>
                          )}
                          <button onClick={()=>{setAfAnchorMode(false);setAfPendingAnchor1(null);setAfPendingAnchor2(null);setAfAnchorStep(1);}}
                            style={{ background:'#475569', color:'white', border:'none', borderRadius:'4px', padding:'5px 10px', cursor:'pointer', fontSize:'12px' }}>ביטול</button>
                        </div>
                      </div>
                    );
                  })()}
                  <div ref={adminMapScrollRef} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  <div
                    ref={adminMapInnerRef}
                    style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: `2px solid ${drawingPolygonId ? '#7c3aed' : drawingSectorId ? '#059669' : drawingRouteId ? '#f59e0b' : drawingVehicleRouteId ? '#f97316' : placingPointMode ? '#fbbf24' : placingAdminLocMode ? '#34d399' : afAnchorMode ? '#f97316' : placingElementMode ? '#ec4899' : placingRunwayEndpoint ? '#22c55e' : '#3b82f6'}`, cursor: (placingPointMode || placingAdminLocMode || afAnchorMode || drawingRouteId || drawingVehicleRouteId || placingElementMode || drawingPolygonId || drawingSectorId || placingRunwayEndpoint) ? 'crosshair' : 'default', zoom: adminMapZoom, transformOrigin: '0 0' }}
                    tabIndex={0} onKeyDown={e => { if (e.key === 'Escape') { setPlacingPointMode(false); setPlacingAdminLocMode(false); setAfAnchorMode(false); setAfPendingAnchor1(null); setAfPendingAnchor2(null); setAfAnchorStep(1); setDrawingRouteId(null); setRouteDraftPoints([]); setDrawingVehicleRouteId(null); setVehicleRouteDraftPoints([]); setPlacingElementMode(false); setPlacingElementId(null); setDrawingPolygonId(null); setPolygonDraftPoints([]); setDrawingSectorId(null); sectorDragStartRef.current = null; setSectorDraftRect(null); setPlacingRunwayEndpoint(null); } }}
                    onDoubleClick={async e => {
                      if (!drawingPolygonId) return;
                      e.preventDefault();
                      if (polygonDraftPoints.length >= 3) {
                        const pg = adminAirfieldPolygons.find(p => p.id === drawingPolygonId);
                        if (pg) await fetch(`${API_URL}/airfield-polygons/${drawingPolygonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: pg.name, color: pg.color || '#a78bfa', notes: pg.notes || '', polygon: polygonDraftPoints }) });
                        setDrawingPolygonId(null); setPolygonDraftPoints([]);
                        loadAirfieldPolygons(selectedAdminAirfieldId!);
                      }
                    }}
                    onMouseDown={e => {
                      if (!drawingSectorId) return;
                      e.preventDefault();
                      const container = e.currentTarget as HTMLElement;
                      const cr = container.getBoundingClientRect();
                      const z = adminMapZoom || 1;
                      const relX = (e.clientX - cr.left) / z; const relY = (e.clientY - cr.top) / z;
                      let x: number, y: number;
                      if (adminMapImgBounds) { x = ((relX - adminMapImgBounds.left) / adminMapImgBounds.width) * 100; y = ((relY - adminMapImgBounds.top) / adminMapImgBounds.height) * 100; }
                      else { x = (relX / container.clientWidth) * 100; y = (relY / container.clientHeight) * 100; }
                      const clampedX = Math.max(0, Math.min(100, x)); const clampedY = Math.max(0, Math.min(100, y));
                      sectorDragStartRef.current = { x: clampedX, y: clampedY };
                      setSectorDraftRect({ x: clampedX, y: clampedY, w: 0, h: 0 });
                    }}
                    onMouseMove={e => {
                      const container = e.currentTarget as HTMLElement;
                      const cr = container.getBoundingClientRect();
                      const z = adminMapZoom || 1;
                      const relX = (e.clientX - cr.left) / z; const relY = (e.clientY - cr.top) / z;
                      let svgX: number, svgY: number;
                      if (adminMapImgBounds) { svgX = ((relX - adminMapImgBounds.left) / adminMapImgBounds.width) * 100; svgY = ((relY - adminMapImgBounds.top) / adminMapImgBounds.height) * 100; }
                      else { svgX = (relX / container.clientWidth) * 100; svgY = (relY / container.clientHeight) * 100; }
                      svgX = Math.max(0, Math.min(100, svgX)); svgY = Math.max(0, Math.min(100, svgY));
                      if (routeDragRef.current) {
                        const dx = svgX - routeDragRef.current.startSvgX;
                        const dy = svgY - routeDragRef.current.startSvgY;
                        const newPts = routeDragRef.current.origPts.map((p: {x:number;y:number}) => ({ x: Math.max(0, Math.min(100, p.x + dx)), y: Math.max(0, Math.min(100, p.y + dy)) }));
                        setRouteDragPreview({ id: routeDragRef.current.id, pts: newPts });
                        return;
                      }
                      if (!drawingSectorId || !sectorDragStartRef.current) return;
                      const ds = sectorDragStartRef.current;
                      setSectorDraftRect({ x: Math.min(ds.x, svgX), y: Math.min(ds.y, svgY), w: Math.abs(svgX - ds.x), h: Math.abs(svgY - ds.y) });
                    }}
                    onMouseUp={async e => {
                      if (routeDragRef.current) {
                        const drag = routeDragRef.current;
                        routeDragRef.current = null;
                        if (routeDragPreview && routeDragPreview.pts.length >= 2) {
                          const route = adminAirfieldRoutes.find((r: any) => r.id === drag.id);
                          if (route) {
                            await fetch(`${API_URL}/airfield-routes/${drag.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: route.name, color: route.color, notes: route.notes || '', route_path: routeDragPreview.pts, route_category: route.route_category || 'general', is_runway: route.is_runway || false, end_a_name: route.end_a_name || null, end_b_name: route.end_b_name || null }) });
                            setAdminAirfieldRoutes((prev: any[]) => prev.map((r: any) => r.id === drag.id ? { ...r, route_path: routeDragPreview.pts } : r));
                          }
                        }
                        setRouteDragPreview(null);
                        return;
                      }
                      const ds = sectorDragStartRef.current;
                      if (!drawingSectorId || !ds) return;
                      const container = e.currentTarget as HTMLElement;
                      const cr = container.getBoundingClientRect();
                      const z = adminMapZoom || 1;
                      const relX = (e.clientX - cr.left) / z; const relY = (e.clientY - cr.top) / z;
                      let x2: number, y2: number;
                      if (adminMapImgBounds) { x2 = ((relX - adminMapImgBounds.left) / adminMapImgBounds.width) * 100; y2 = ((relY - adminMapImgBounds.top) / adminMapImgBounds.height) * 100; }
                      else { x2 = (relX / container.clientWidth) * 100; y2 = (relY / container.clientHeight) * 100; }
                      x2 = Math.max(0, Math.min(100, x2)); y2 = Math.max(0, Math.min(100, y2));
                      const rx = Math.min(ds.x, x2), ry = Math.min(ds.y, y2);
                      const rw = Math.abs(x2 - ds.x), rh = Math.abs(y2 - ds.y);
                      sectorDragStartRef.current = null;
                      setSectorDraftRect(null);
                      if (rw > 1 && rh > 1) {
                        const sec = adminAirfieldSectors.find(s => s.id === drawingSectorId);
                        const secName = sec?.name || '';
                        const secNotes = sec?.notes || '';
                        await fetch(`${API_URL}/airfield-sectors/${drawingSectorId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: secName, notes: secNotes, rect: { x: rx, y: ry, w: rw, h: rh } }) });
                        await loadAirfieldSectors(selectedAdminAirfieldId!);
                      }
                      setDrawingSectorId(null);
                    }}
                    onMouseLeave={() => { if (routeDragRef.current) { routeDragRef.current = null; setRouteDragPreview(null); } }}
                    onClick={async e => {
                      const el = e.currentTarget as HTMLElement;
                      const rect = el.getBoundingClientRect();
                      const z = adminMapZoom || 1;
                      const relX = (e.clientX - rect.left - el.clientLeft) / z;
                      const relY = (e.clientY - rect.top - el.clientTop) / z;
                      let x_pct: number, y_pct: number;
                      if (adminMapImgBounds && adminMapImgBounds.width > 0 && adminMapImgBounds.height > 0) {
                        x_pct = Math.round(((relX - adminMapImgBounds.left) / adminMapImgBounds.width) * 100);
                        y_pct = Math.round(((relY - adminMapImgBounds.top) / adminMapImgBounds.height) * 100);
                      } else if (el.clientWidth > 0 && el.clientHeight > 0) {
                        x_pct = Math.round((relX / el.clientWidth) * 100);
                        y_pct = Math.round((relY / el.clientHeight) * 100);
                      } else {
                        x_pct = 50; y_pct = 50;
                      }
                      x_pct = Math.max(0, Math.min(100, isFinite(x_pct) ? x_pct : 50));
                      y_pct = Math.max(0, Math.min(100, isFinite(y_pct) ? y_pct : 50));
                      setAdminMapElPopup(null);
                      if (drawingPolygonId) {
                        setPolygonDraftPoints(prev => [...prev, { x: x_pct, y: y_pct }]);
                      } else if (drawingRouteId) {
                        setRouteDraftPoints(prev => [...prev, { x: x_pct, y: y_pct }]);
                      } else if (drawingVehicleRouteId) {
                        const vrAnchor = getAnchorFromMapData(adminAirfieldMapData);
                        const vrGeo = vrAnchor ? imagePctToGeo(x_pct, y_pct, vrAnchor) : null;
                        setVehicleRouteDraftPoints(prev => [...prev, { x: x_pct, y: y_pct, ...(vrGeo ? { lat: vrGeo.lat, lon: vrGeo.lon } : {}) }]);
                      } else if (placingElementMode && placingElementId) {
                        const el = adminAirfieldElements.find((e: any) => e.id === placingElementId);
                        if (el) {
                          await fetch(`${API_URL}/airfield-elements/${placingElementId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ element_type_id: el.element_type_id, name: el.name, status: el.status, note: el.note, category: el.category || '', x_pct, y_pct }) });
                          loadAirfieldElements(selectedAdminAirfieldId!);
                        }
                        setPlacingElementMode(false); setPlacingElementId(null);
                      } else if (placingAdminLocMode) {
                        if (adminLocNewName.trim() && selectedAdminAirfieldId) {
                          let lat: number | null = null; let lng: number | null = null;
                          const anchor = getAnchorFromMapData(adminAirfieldMapData);
                          if (anchor) { const geo = imagePctToGeo(x_pct, y_pct, anchor); lat = geo.lat; lng = geo.lon; }
                          const res = await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: adminLocNewName.trim(), x_pct, y_pct, color: '#34d399', marker: 'circle', density_warn: 99, point_type: 'admin_loc', lat, lng }) });
                          if (res.ok) {
                            const pts = await fetch(`${API_URL}/airfields/${selectedAdminAirfieldId}/points`).then(r => r.json());
                            setAirfieldPoints(pts); setAdminLocNewName(''); setPlacingAdminLocMode(false);
                          }
                        }
                      } else if (afAnchorMode) {
                        if (afAnchorStep === 1) { setAfPendingAnchor1({ x: x_pct, y: y_pct }); setAfAnchorStep(2); }
                        else { setAfPendingAnchor2({ x: x_pct, y: y_pct }); }
                      } else if (placingPointMode) {
                        addPointAt(x_pct, y_pct);
                      } else if (placingRunwayEndpoint) {
                        if (placingRunwayEndpoint === 'start') {
                          setAdminRunwayForm(p => p ? { ...p, start_x_pct: x_pct.toFixed(2), start_y_pct: y_pct.toFixed(2) } : null);
                        } else {
                          setAdminRunwayForm(p => p ? { ...p, end_x_pct: x_pct.toFixed(2), end_y_pct: y_pct.toFixed(2) } : null);
                        }
                        setPlacingRunwayEndpoint(null);
                      }
                    }}
                  >
                    {adminSelMapSrc ? (
                      <img ref={adminMapImgElRef} src={adminSelMapSrc} alt="airfield map" onLoad={e => { (adminMapImgElRef as React.MutableRefObject<HTMLImageElement|null>).current = e.currentTarget; computeAdminMapBounds(e.currentTarget); }}
                        style={{ width: '100%', objectFit: 'contain', display: 'block' }} />
                    ) : null}

                    {/* Route polygons SVG overlay */}
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
                      style={{ position: 'absolute', top: adminMapImgBounds ? adminMapImgBounds.top : 0, left: adminMapImgBounds ? adminMapImgBounds.left : 0, width: adminMapImgBounds ? adminMapImgBounds.width : '100%', height: adminMapImgBounds ? adminMapImgBounds.height : '100%', pointerEvents: (drawingRouteId || placingPointMode || placingElementMode || drawingPolygonId || drawingSectorId) ? 'none' : 'all', zIndex: 2 }}>
                      {adminMapLayers.routes && adminAirfieldRoutes.filter((r: any) => Number(r.airfield_id) === Number(selectedAdminAirfieldId)).map((r: any) => {
                        const rawPts: {x:number;y:number}[] = Array.isArray(r.route_path) ? r.route_path : (typeof r.route_path === 'string' ? JSON.parse(r.route_path) : []);
                        if (rawPts.length < 2) return null;
                        const isDraggingThis = routeDragPreview?.id === r.id;
                        const pts = isDraggingThis ? routeDragPreview!.pts : rawPts;
                        const col = r.color || '#3b82f6';
                        const isVehicle = (r.route_category || 'general') === 'vehicle';
                        const labelPts = [pts[0], pts[pts.length - 1]];
                        const canDrag = !drawingRouteId && !placingPointMode && !placingElementMode && !drawingPolygonId && !drawingSectorId;
                        return (
                          <g key={r.id}
                            style={{ cursor: canDrag ? (isDraggingThis ? 'grabbing' : 'grab') : 'default', pointerEvents: canDrag ? 'all' : 'none' }}
                            onMouseDown={canDrag ? (e => {
                              e.stopPropagation();
                              e.preventDefault();
                              const container = adminMapInnerRef.current as HTMLElement | null;
                              if (!container) return;
                              const cr = container.getBoundingClientRect();
                              const z = adminMapZoom || 1;
                              const relX = (e.clientX - cr.left) / z;
                              const relY = (e.clientY - cr.top) / z;
                              let startSvgX: number, startSvgY: number;
                              if (adminMapImgBounds) { startSvgX = ((relX - adminMapImgBounds.left) / adminMapImgBounds.width) * 100; startSvgY = ((relY - adminMapImgBounds.top) / adminMapImgBounds.height) * 100; }
                              else { startSvgX = (relX / container.clientWidth) * 100; startSvgY = (relY / container.clientHeight) * 100; }
                              routeDragRef.current = { id: r.id, startSvgX, startSvgY, origPts: rawPts };
                            }) : undefined}>
                            {/* invisible thick hit area for easier grabbing */}
                            <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="transparent" strokeWidth="3" />
                            {isVehicle
                              ? <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={isDraggingThis ? '#fff' : col} strokeWidth="0.55" strokeDasharray="1.8,1.1" strokeLinecap="round" opacity={isDraggingThis ? 0.7 : 1} />
                              : <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={isDraggingThis ? '#fff' : col} strokeWidth="0.4" opacity={isDraggingThis ? 0.7 : 1} />
                            }
                            {labelPts.map((lp, li) => (
                              <g key={li}>
                                <circle cx={lp.x} cy={lp.y} r="1.6" fill={col} opacity="0.9" />
                                <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="0.9" fontWeight="bold" style={{ userSelect: 'none' }}>{r.name}</text>
                              </g>
                            ))}
                          </g>
                        );
                      })}
                      {/* Draft route while drawing (aircraft routes) */}
                      {drawingRouteId && routeDraftPoints.length >= 2 && (() => {
                        const drawingRoute = adminAirfieldRoutes.find((r: any) => r.id === drawingRouteId);
                        const col = drawingRoute?.color || '#f59e0b';
                        return (
                          <g>
                            <polyline points={routeDraftPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={col} strokeWidth="0.6" strokeDasharray="2,1" />
                            {routeDraftPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1" fill={col} />)}
                          </g>
                        );
                      })()}
                      {/* Vehicle route draft while drawing */}
                      {drawingVehicleRouteId && vehicleRouteDraftPoints.length >= 1 && (
                        <g>
                          {vehicleRouteDraftPoints.length >= 2 && <polyline points={vehicleRouteDraftPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#f97316" strokeWidth="0.8" strokeDasharray="2,1.5" />}
                          {vehicleRouteDraftPoints.map((p, i) => (
                            <g key={i}>
                              <circle cx={p.x} cy={p.y} r="1.3" fill="#f97316" stroke="white" strokeWidth="0.3" />
                              <text x={p.x + 1.5} y={p.y - 1} fontSize="2.5" fill="#f97316" fontWeight="bold" style={{ userSelect: 'none' }}>{i + 1}</text>
                            </g>
                          ))}
                        </g>
                      )}
                      {/* Saved vehicle routes overlay */}
                      {!drawingVehicleRouteId && bRoutes.filter((vr: any) => Array.isArray(vr.waypoints) && vr.waypoints.length >= 1).map((vr: any) => {
                        const pts: {x:number;y:number}[] = vr.waypoints.filter((p: any) => p.x != null);
                        const col = vr.color || '#f97316';
                        return (
                          <g key={`vr-saved-${vr.id}`}>
                            {pts.length >= 2 && <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={col} strokeWidth="0.7" />}
                            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="0.9" fill={col} stroke="white" strokeWidth="0.25" />)}
                            {pts.length >= 1 && <text x={pts[0].x + 1.2} y={pts[0].y - 1.5} fontSize="2.5" fill={col} fontWeight="bold" style={{ userSelect: 'none' }}>🚗 {vr.name}</text>}
                          </g>
                        );
                      })}
                    </svg>

                    {/* Elements overlay in admin map */}
                    {adminAirfieldElements.filter(el => el.x_pct != null && (el.category === 'camera' ? adminMapLayers.cameras : adminMapLayers.elements)).map(el => {
                      const pos = adminMapImgBounds
                        ? { left: `${adminMapImgBounds.left + (el.x_pct / 100) * adminMapImgBounds.width}px`, top: `${adminMapImgBounds.top + (el.y_pct / 100) * adminMapImgBounds.height}px` }
                        : { left: `${el.x_pct}%`, top: `${el.y_pct}%` };
                      const statusColors: Record<string, string> = { 'תקין': '#22c55e', 'שמיש': '#22c55e', 'לא תקין': '#ef4444', 'תקול': '#ef4444', 'חלקי': '#f97316' };
                      const isTakul = el.status === 'תקול'; const isShamish = el.status === 'שמיש';
                      const isCamera = el.category === 'camera' && el.camera_url;
                      return (
                        <div key={el.id}
                          style={{ position: 'absolute', left: pos.left, top: pos.top, transform: 'translate(-50%,-50%)', pointerEvents: 'all', zIndex: adminMapElPopup?.el?.id === el.id ? 20 : 8, textAlign: 'center', cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); if (isCamera) { setAdminCameraPanel({ url: el.camera_url, name: el.name }); setAdminCameraDragPos({ x: 80, y: 80 }); } else { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setAdminMapElPopup(prev => prev?.el?.id === el.id ? null : { el, x: e.clientX, y: e.clientY }); } }}
                          title={isCamera ? `📷 ${el.name} — לחץ לצפייה` : `${el.name} — לחץ לעריכה`}>
                          <div style={{ width: '22px', height: '22px', borderRadius: typeof el.type_icon === 'string' && el.type_icon.startsWith('MAP:') ? '4px' : '50%', background: isTakul ? '#ef4444' : typeof el.type_icon === 'string' && el.type_icon.startsWith('MAP:') ? 'transparent' : (el.type_color || '#f59e0b'), border: isShamish ? '3px solid #22c55e' : `2px solid ${statusColors[el.status] || '#94a3b8'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', margin: '0 auto' }}>
                            {!isTakul && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}>{typeof el.type_icon === 'string' && el.type_icon.startsWith('MAP:') ? renderGroundSvgIcon(el.type_icon, 18) : (el.type_icon || (el.category === 'camera' ? '📷' : '🔧'))}</span>}
                          </div>
                          <div style={{ background: '#000000cc', color: el.type_color || '#f59e0b', fontSize: '7px', fontWeight: 'bold', padding: '1px 3px', borderRadius: '2px', whiteSpace: 'nowrap', marginTop: '1px' }}>{el.name}</div>
                        </div>
                      );
                    })}
                    {/* Admin map element popup — appears when clicking a placed element */}
                    {adminMapElPopup && (() => {
                      const popEl = adminMapElPopup.el;
                      const pos = adminMapImgBounds
                        ? { left: `${adminMapImgBounds.left + (popEl.x_pct / 100) * adminMapImgBounds.width}px`, top: `${adminMapImgBounds.top + (popEl.y_pct / 100) * adminMapImgBounds.height + 18}px` }
                        : { left: `${popEl.x_pct}%`, top: `${popEl.y_pct}%` };
                      return (
                        <div style={{ position: 'absolute', left: pos.left, top: pos.top, transform: 'translateX(-50%)', zIndex: 30, background: '#0f172a', border: '1px solid #3b82f6', borderRadius: '8px', padding: '8px 10px', boxShadow: '0 4px 20px rgba(0,0,0,0.7)', direction: 'rtl', minWidth: '140px', pointerEvents: 'all' }}
                          onClick={e => e.stopPropagation()}>
                          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#93c5fd', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{popEl.name}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <button onClick={() => {
                              setElementForm({ name: popEl.name, element_type_id: String(popEl.element_type_id || ''), status: popEl.status, note: popEl.note || '', category: popEl.category || '', relevant_routes: Array.isArray(popEl.relevant_routes) ? popEl.relevant_routes : [], blocking_statuses: Array.isArray(popEl.blocking_statuses) ? popEl.blocking_statuses : [], show_in_driver: popEl.show_in_driver || false });
                              setEditingElement(popEl);
                              setShowElementForm(true);
                              if (!adminAFExpanded.has('elements')) toggleAFSec('elements');
                              setAdminMapElPopup(null);
                            }} style={{ padding: '4px 8px', background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f6', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', textAlign: 'right' }}>✏️ ערוך</button>
                            <button onClick={async () => {
                              await fetch(`${API_URL}/airfield-elements/${popEl.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ element_type_id: popEl.element_type_id, name: popEl.name, status: popEl.status, note: popEl.note, category: popEl.category || '', x_pct: null, y_pct: null }) });
                              loadAirfieldElements(selectedAdminAirfieldId!);
                              setAdminMapElPopup(null);
                            }} style={{ padding: '4px 8px', background: '#1e293b', color: '#f87171', border: '1px solid #ef4444', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', textAlign: 'right' }}>🗑 הסר מיקום</button>
                            <button onClick={() => {
                              setPlacingElementMode(true);
                              setPlacingElementId(popEl.id);
                              setAdminMapElPopup(null);
                            }} style={{ padding: '4px 8px', background: '#1e293b', color: '#f9a8d4', border: '1px solid #ec4899', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', textAlign: 'right' }}>📍 שנה מיקום</button>
                          </div>
                        </div>
                      );
                    })()}
                    {placingElementMode && placingElementId && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(236,72,153,0.05)', pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10px', zIndex: 5 }}>
                        <div style={{ background: '#000000dd', color: '#f9a8d4', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #ec4899' }}>
                          📍 {adminAirfieldElements.find(e => e.id === placingElementId)?.name || 'אלמנט'} — לחץ על המפה — ESC לביטול
                        </div>
                      </div>
                    )}
                    {placingRunwayEndpoint && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(34,197,94,0.06)', pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10px', zIndex: 3 }}>
                        <div style={{ background: '#000000dd', color: '#22c55e', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #22c55e' }}>✈ לחץ על המפה לסימון {placingRunwayEndpoint === 'start' ? 'תחילת מסלול (A)' : 'סיום מסלול (A)'} — ESC לביטול</div>
                      </div>
                    )}
                    {placingPointMode && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(251,191,36,0.06)', pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10px', zIndex: 3 }}>
                        <div style={{ background: '#000000dd', color: '#fbbf24', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #fbbf24' }}>📍 לחץ על המפה — ESC לביטול</div>
                      </div>
                    )}
                    {placingAdminLocMode && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(52,211,153,0.06)', pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10px', zIndex: 3 }}>
                        <div style={{ background: '#000000dd', color: '#34d399', padding: '4px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #34d399' }}>🏢 הנח נקודה מנהלתית: <strong>{adminLocNewName}</strong> — ESC לביטול</div>
                      </div>
                    )}
                    {afAnchorMode && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(249,115,22,0.06)', pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10px', zIndex: 3 }}>
                        <div style={{ background: '#000000dd', color: '#fb923c', padding: '4px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #fb923c' }}>📐 עוגן {afAnchorStep} — לחץ על נקודה מוכרת במפה — ESC לביטול</div>
                      </div>
                    )}
                    {drawingRouteId && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(245,158,11,0.04)', pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10px', zIndex: 3 }}>
                        <div style={{ background: '#000000dd', color: '#f59e0b', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #f59e0b' }}>✏️ ציור מסלול — {routeDraftPoints.length} נקודות — ESC לביטול</div>
                      </div>
                    )}
                    {drawingVehicleRouteId && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(249,115,22,0.04)', pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10px', zIndex: 3 }}>
                        <div style={{ background: '#000000dd', color: '#f97316', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #f97316' }}>🚗 ציור נתיב נסיעה — {vehicleRouteDraftPoints.length} נקודות — לחץ על המפה — ESC לביטול</div>
                      </div>
                    )}
                    {/* Polygon + sector SVG overlay */}
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
                      style={{ position: 'absolute', top: adminMapImgBounds ? adminMapImgBounds.top : 0, left: adminMapImgBounds ? adminMapImgBounds.left : 0, width: adminMapImgBounds ? adminMapImgBounds.width : '100%', height: adminMapImgBounds ? adminMapImgBounds.height : '100%', pointerEvents: 'none', zIndex: 4 }}>
                      {/* Runway lines overlay */}
                      {adminAirfieldRunways.filter((rw: any) => rw.start_x_pct != null && rw.end_x_pct != null).map((rw: any) => {
                        const isEditing = adminRunwayEditId === rw.id;
                        const sx = Number(rw.start_x_pct), sy = Number(rw.start_y_pct);
                        const ex = Number(rw.end_x_pct), ey = Number(rw.end_y_pct);
                        const mx = (sx + ex) / 2, my = (sy + ey) / 2;
                        return (
                          <g key={`rw-${rw.id}`}>
                            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={isEditing ? '#f59e0b' : '#22c55e'} strokeWidth="1.2" strokeLinecap="round" />
                            <circle cx={sx} cy={sy} r="1.2" fill="#60a5fa" stroke="white" strokeWidth="0.3" />
                            <circle cx={ex} cy={ey} r="1.2" fill="#c084fc" stroke="white" strokeWidth="0.3" />
                            <text x={mx} y={my - 1.5} textAnchor="middle" fontSize="2" fill={isEditing ? '#fde68a' : '#86efac'} fontWeight="bold" style={{ userSelect: 'none' }}>{rw.name || ''}</text>
                          </g>
                        );
                      })}
                      {/* Draft runway endpoints while editing form */}
                      {adminRunwayForm && (() => {
                        const sx = adminRunwayForm.start_x_pct ? Number(adminRunwayForm.start_x_pct) : null;
                        const sy = adminRunwayForm.start_y_pct ? Number(adminRunwayForm.start_y_pct) : null;
                        const ex = adminRunwayForm.end_x_pct ? Number(adminRunwayForm.end_x_pct) : null;
                        const ey = adminRunwayForm.end_y_pct ? Number(adminRunwayForm.end_y_pct) : null;
                        return (
                          <g>
                            {sx != null && sy != null && <circle cx={sx} cy={sy} r="1.8" fill="#60a5fa" stroke="white" strokeWidth="0.4" opacity="0.9" />}
                            {ex != null && ey != null && <circle cx={ex} cy={ey} r="1.8" fill="#c084fc" stroke="white" strokeWidth="0.4" opacity="0.9" />}
                            {sx != null && sy != null && ex != null && ey != null && <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="2,1.5" strokeLinecap="round" />}
                          </g>
                        );
                      })()}
                      {/* Anchor crosshairs */}
                      {afAnchorMode && afPendingAnchor1 && (() => { const sz=1.4; const {x,y}=afPendingAnchor1; return (
                        <g>
                          <line x1={x-3*sz} y1={y} x2={x+3*sz} y2={y} stroke="white" strokeWidth={0.7*sz} />
                          <line x1={x} y1={y-3*sz} x2={x} y2={y+3*sz} stroke="white" strokeWidth={0.7*sz} />
                          <line x1={x-2.5*sz} y1={y} x2={x+2.5*sz} y2={y} stroke="#ef4444" strokeWidth={0.4*sz} />
                          <line x1={x} y1={y-2.5*sz} x2={x} y2={y+2.5*sz} stroke="#ef4444" strokeWidth={0.4*sz} />
                          <circle cx={x} cy={y} r={0.6*sz} fill="#ef4444" />
                          <text x={x+2} y={y-2} fontSize="2.2" fill="#ef4444" fontWeight="bold">A1</text>
                        </g>
                      ); })()}
                      {afAnchorMode && afPendingAnchor2 && (() => { const sz=1.4; const {x,y}=afPendingAnchor2; return (
                        <g>
                          <line x1={x-3*sz} y1={y} x2={x+3*sz} y2={y} stroke="white" strokeWidth={0.7*sz} />
                          <line x1={x} y1={y-3*sz} x2={x} y2={y+3*sz} stroke="white" strokeWidth={0.7*sz} />
                          <line x1={x-2.5*sz} y1={y} x2={x+2.5*sz} y2={y} stroke="#3b82f6" strokeWidth={0.4*sz} />
                          <line x1={x} y1={y-2.5*sz} x2={x} y2={y+2.5*sz} stroke="#3b82f6" strokeWidth={0.4*sz} />
                          <circle cx={x} cy={y} r={0.6*sz} fill="#3b82f6" />
                          <text x={x+2} y={y-2} fontSize="2.2" fill="#3b82f6" fontWeight="bold">A2</text>
                        </g>
                      ); })()}
                      {/* Saved polygons */}
                      {adminMapLayers.polygons && adminAirfieldPolygons.map(pg => {
                        const pts: {x:number;y:number}[] = Array.isArray(pg.polygon) ? pg.polygon : [];
                        if (pts.length < 3) return null;
                        const col = pg.color || '#a78bfa';
                        const cx = pts.reduce((s,p) => s+p.x, 0)/pts.length;
                        const cy = pts.reduce((s,p) => s+p.y, 0)/pts.length;
                        return (
                          <g key={pg.id}>
                            <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill={col+'33'} stroke={col} strokeWidth="0.4" />
                            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill={col} fontSize="1.4" fontWeight="bold" style={{ userSelect: 'none' }}>{pg.name}</text>
                          </g>
                        );
                      })}
                      {/* Draft polygon while drawing */}
                      {drawingPolygonId && polygonDraftPoints.length >= 2 && (() => {
                        const pg = adminAirfieldPolygons.find(p => p.id === drawingPolygonId);
                        const col = pg?.color || '#a78bfa';
                        return (
                          <g>
                            <polygon points={polygonDraftPoints.map(p => `${p.x},${p.y}`).join(' ')} fill={col+'22'} stroke={col} strokeWidth="0.5" strokeDasharray="2,1" />
                            {polygonDraftPoints.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r="0.8" fill={col} />)}
                          </g>
                        );
                      })()}
                      {/* Saved sectors */}
                      {adminMapLayers.sectors && adminAirfieldSectors.map(sec => {
                        if (!sec.rect) return null;
                        const { x, y, w, h } = sec.rect;
                        return (
                          <g key={sec.id}>
                            <rect x={x} y={y} width={w} height={h} fill="#34d39922" stroke="#34d399" strokeWidth="0.4" strokeDasharray="2,1" />
                            <text x={x+w/2} y={y+h/2} textAnchor="middle" dominantBaseline="middle" fill="#34d399" fontSize="1.6" fontWeight="bold" style={{ userSelect: 'none' }}>{sec.name}</text>
                          </g>
                        );
                      })}
                      {/* Draft sector while drawing */}
                      {drawingSectorId && sectorDraftRect && sectorDraftRect.w > 0 && (
                        <rect x={sectorDraftRect.x} y={sectorDraftRect.y} width={sectorDraftRect.w} height={sectorDraftRect.h} fill="#34d39922" stroke="#34d399" strokeWidth="0.6" strokeDasharray="2,1" />
                      )}
                    </svg>

                    {/* Polygon drawing mode overlay */}
                    {drawingPolygonId && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(124,58,237,0.04)', pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10px', zIndex: 5 }}>
                        <div style={{ background: '#000000dd', color: '#c4b5fd', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #7c3aed' }}>✏️ ציור פוליגון — {polygonDraftPoints.length} נקודות — לחץ פעמיים לסיום — ESC לביטול</div>
                      </div>
                    )}
                    {/* Sector drawing mode overlay */}
                    {drawingSectorId && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,150,105,0.04)', pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10px', zIndex: 5 }}>
                        <div style={{ background: '#000000dd', color: '#6ee7b7', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #059669' }}>⬛ גרור על המפה לציור הסקטור — ESC לביטול</div>
                      </div>
                    )}

                    {adminMapLayers.points && airfieldPoints.filter((p: any) => p.point_type !== 'admin_loc').map(pt => {
                      const apos = adminPtPos(pt.x_pct, pt.y_pct);
                      return (
                        <div key={pt.id} style={{ position: 'absolute', left: apos.left, top: apos.top, transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 5 }}>
                          <GroundMarkerSVG marker={pt.marker || 'circle'} color={pt.color || '#3b82f6'} size={20} />
                          <div style={{ background: '#000000cc', color: pt.color || '#3b82f6', fontSize: '8px', fontWeight: 'bold', padding: '1px 4px', borderRadius: '3px', whiteSpace: 'nowrap', textAlign: 'center', marginTop: '1px' }}>{pt.name}</div>
                        </div>
                      );
                    })}
                    {/* Admin location markers — always visible */}
                    {airfieldPoints.filter((p: any) => p.point_type === 'admin_loc' && p.x_pct != null).map((pt: any) => {
                      const apos = adminPtPos(pt.x_pct, pt.y_pct);
                      const hasGps = pt.lat != null && pt.lng != null;
                      return (
                        <div key={`admin_loc_${pt.id}`} style={{ position: 'absolute', left: apos.left, top: apos.top, transform: 'translate(-50%,-100%)', pointerEvents: 'none', zIndex: 6 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ background: hasGps ? '#065f46' : '#1e293b', border: `2px solid ${hasGps ? '#34d399' : '#64748b'}`, borderRadius: '6px', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '3px', boxShadow: '0 2px 6px #00000066' }}>
                              <span style={{ fontSize: '10px' }}>🏢</span>
                              <span style={{ color: '#e2e8f0', fontSize: '8px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{pt.name}</span>
                              {hasGps && <span style={{ color: '#34d399', fontSize: '7px' }}>📡</span>}
                            </div>
                            <div style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `5px solid ${hasGps ? '#34d399' : '#64748b'}` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              )}

            </div>
          );
        })()}

        {activeTab === 'base_statuses' && (() => {
          const RELEVANT_TO_OPTIONS = ['כולם', 'קרב/תובלה', 'מסוקים/כטמ"מ'];
          const saveBaseStatus = async () => {
            if (!baseStatusForm.name.trim()) { alert('חובה להזין שם בסיס'); return; }
            const url = editingBaseStatus ? `${API_URL}/base-statuses/${editingBaseStatus.id}` : `${API_URL}/base-statuses`;
            const method = editingBaseStatus ? 'PUT' : 'POST';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(baseStatusForm) });
            if (!res.ok) { alert('שגיאה בשמירה'); return; }
            setEditingBaseStatus(null); setShowBaseStatusForm(false);
            setBaseStatusForm({ name: '', code: '', relevant_to: 'כולם', air_defense_status: '', absorption_status: '', bird_status: '', airfield_id: '' });
            loadAdminBaseStatuses();
          };
          const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
              const text = ev.target?.result as string;
              const lines = text.split('\n').filter(l => l.trim());
              if (lines.length < 2) { alert('הקובץ ריק או לא תקין'); return; }
              const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
              const idx = (name: string) => header.findIndex(h => h === name);
              const nameIdx = idx('name') >= 0 ? idx('name') : idx('שם בסיס');
              const codeIdx = idx('code') >= 0 ? idx('code') : idx('קוד בסיס');
              const relIdx = idx('relevant_to') >= 0 ? idx('relevant_to') : idx('רלוונטי ל');
              const adIdx = idx('air_defense_status') >= 0 ? idx('air_defense_status') : idx('מצב מז"א');
              const absIdx = idx('absorption_status') >= 0 ? idx('absorption_status') : idx('מצב ספיגה');
              const birdIdx = idx('bird_status') >= 0 ? idx('bird_status') : idx('סטטוס ציפורי');
              let count = 0;
              for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
                const name = nameIdx >= 0 ? cols[nameIdx] : '';
                if (!name) continue;
                await fetch(`${API_URL}/base-statuses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, code: codeIdx >= 0 ? cols[codeIdx] : '', relevant_to: relIdx >= 0 ? cols[relIdx] : 'כולם', air_defense_status: adIdx >= 0 ? cols[adIdx] : '', absorption_status: absIdx >= 0 ? cols[absIdx] : '', bird_status: birdIdx >= 0 ? cols[birdIdx] : '' }) }).catch(() => {});
                count++;
              }
              alert(`יובאו ${count} בסיסים`); loadAdminBaseStatuses();
            };
            reader.readAsText(file);
            e.target.value = '';
          };
          return (
            <div style={{ direction: 'rtl' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>סטטוס בסיסים</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label style={{ padding: '8px 16px', background: '#064e3b', color: '#6ee7b7', border: '1px solid #065f46', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    📥 ייבוא CSV/Excel
                    <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleExcelImport} />
                  </label>
                  <button onClick={() => { setEditingBaseStatus(null); setBaseStatusForm({ name: '', code: '', relevant_to: 'כולם', air_defense_status: '', absorption_status: '', bird_status: '', airfield_id: '' }); setShowBaseStatusForm(true); }} style={{ padding: '8px 20px', background: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>+ חדש</button>
                </div>
              </div>

              {showBaseStatusForm && (
                <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '18px', marginBottom: '20px', direction: 'rtl' }}>
                  <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', color: '#fcd34d' }}>{editingBaseStatus ? '✎ עריכת בסיס' : '+ בסיס חדש'}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>בסיס *</label>
                      {adminAviationBases.length > 0 ? (
                        <select
                          value={baseStatusForm.name}
                          onChange={e => {
                            const sel = adminAviationBases.find((b: any) => b.name === e.target.value);
                            setBaseStatusForm(p => ({ ...p, name: sel ? sel.name : e.target.value, code: sel?.code || p.code }));
                          }}
                          style={{ width: '100%', padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: baseStatusForm.name ? 'white' : '#64748b', fontSize: '13px', direction: 'rtl' }}
                        >
                          <option value="">— בחר בסיס —</option>
                          {adminAviationBases.map((b: any) => (
                            <option key={b.id} value={b.name}>{b.name}{b.code ? ` (${b.code})` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <input value={baseStatusForm.name} onChange={e => setBaseStatusForm(p => ({ ...p, name: e.target.value }))} placeholder="הזן שם בסיס" style={{ width: '100%', padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', boxSizing: 'border-box', direction: 'rtl' }} />
                      )}
                      {adminAviationBases.length === 0 && <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px' }}>⚠️ הגדר בסיסי תעופה בלשונית "✈️ בסיסים" כדי לבחור מרשימה</div>}
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>רלוונטי ל</label>
                      <select value={baseStatusForm.relevant_to} onChange={e => setBaseStatusForm(p => ({ ...p, relevant_to: e.target.value }))} style={{ width: '100%', padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px' }}>
                        {RELEVANT_TO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>מצב מז"א</label>
                      <select value={baseStatusForm.air_defense_status} onChange={e => setBaseStatusForm(p => ({ ...p, air_defense_status: e.target.value }))} style={{ width: '100%', padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: ALL_MAZAA_STATUSES.find(s => s.label === baseStatusForm.air_defense_status)?.color || '#94a3b8', fontSize: '13px', direction: 'rtl' }}>
                        <option value="">— בחר מצב מז"א —</option>
                        <optgroup label="מגדל">
                          {AIR_DEFENSE_STATUSES.map(s => <option key={s.label} value={s.label} style={{ color: s.color }}>{s.label}</option>)}
                        </optgroup>
                        <optgroup label='יב"א'>
                          {YABA_AIR_DEFENSE_STATUSES.map(s => <option key={s.label} value={s.label} style={{ color: s.color }}>{s.label}</option>)}
                        </optgroup>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>מצב ספיגה</label>
                      <input value={baseStatusForm.absorption_status} onChange={e => setBaseStatusForm(p => ({ ...p, absorption_status: e.target.value }))} style={{ width: '100%', padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>סטטוס ציפורי</label>
                      <input value={baseStatusForm.bird_status} onChange={e => setBaseStatusForm(p => ({ ...p, bird_status: e.target.value }))} style={{ width: '100%', padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>✈️ שדה תעופה מקושר (לריכוז NOTAM + ATIS אוטומטי)</label>
                      <select value={String(baseStatusForm.airfield_id || '')} onChange={e => setBaseStatusForm(p => ({ ...p, airfield_id: e.target.value }))}
                        style={{ width: '100%', padding: '6px 10px', background: '#1e293b', border: `1px solid ${baseStatusForm.airfield_id ? '#38bdf8' : '#334155'}`, borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl' }}>
                        <option value="">— ללא שדה מקושר —</option>
                        {adminAirfields.map((af: any) => <option key={af.id} value={af.id}>{af.name}</option>)}
                      </select>
                      {baseStatusForm.airfield_id && <p style={{ margin: '3px 0 0 0', fontSize: '10px', color: '#38bdf8' }}>✅ פאנל סטטוס בסיסים יציג NOTAM + ATIS בזמן אמת מהשדה</p>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowBaseStatusForm(false); setEditingBaseStatus(null); }} style={{ padding: '7px 18px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>ביטול</button>
                    <button onClick={saveBaseStatus} style={{ padding: '7px 18px', background: '#d97706', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>💾 שמור</button>
                  </div>
                </div>
              )}

              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                💡 ייבוא CSV: עמודות — name, code, relevant_to, air_defense_status, absorption_status, bird_status (או בעברית: שם בסיס, קוד בסיס, רלוונטי ל, מצב מז"א, מצב ספיגה, סטטוס ציפורי)
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {adminBaseStatuses.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#475569', padding: '40px', fontSize: '14px' }}>אין בסיסים — לחץ + חדש להוספה</div>
                ) : adminBaseStatuses.map((bs: any) => (
                  <div key={bs.id} style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ flex: 1, direction: 'rtl' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 'bold', color: '#fcd34d', fontSize: '14px' }}>{bs.name}</span>
                        {bs.code && <span style={{ fontSize: '11px', background: '#292300', color: '#fbbf24', borderRadius: '4px', padding: '1px 7px', fontFamily: 'monospace' }}>{bs.code}</span>}
                        {bs.relevant_to && bs.relevant_to !== 'כולם' && <span style={{ fontSize: '10px', color: '#94a3b8', background: '#1e293b', borderRadius: '4px', padding: '1px 6px' }}>✈ {bs.relevant_to}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: '#94a3b8' }}>
                        {bs.air_defense_status && <span><span style={{ color: '#64748b' }}>מז"א: </span><span style={{ color: ALL_MAZAA_STATUSES.find(s => s.label === bs.air_defense_status)?.color || '#e2e8f0', fontWeight: 'bold' }}>{bs.air_defense_status}</span></span>}
                        {bs.absorption_status && <span><span style={{ color: '#64748b' }}>ספיגה: </span><span style={{ color: '#e2e8f0' }}>{bs.absorption_status}</span></span>}
                        {bs.bird_status && <span><span style={{ color: '#64748b' }}>ציפורי: </span><span style={{ color: '#e2e8f0' }}>{bs.bird_status}</span></span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button onClick={() => { setEditingBaseStatus(bs); setBaseStatusForm({ name: bs.name, code: bs.code || '', relevant_to: bs.relevant_to || 'כולם', air_defense_status: bs.air_defense_status || '', absorption_status: bs.absorption_status || '', bird_status: bs.bird_status || '', airfield_id: bs.airfield_id || '' }); setShowBaseStatusForm(true); }} style={{ padding: '5px 12px', background: '#1e3a5f', color: '#93c5fd', border: '1px solid #2563eb', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>✎ עריכה</button>
                      <button onClick={async () => { if (!await customConfirm(`למחוק את "${bs.name}"?`)) return; await fetch(`${API_URL}/base-statuses/${bs.id}`, { method: 'DELETE' }); loadAdminBaseStatuses(); }} style={{ padding: '5px 12px', background: '#450a0a', color: '#fca5a5', border: '1px solid #dc2626', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>🗑 מחק</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {activeTab === 'aviation_bases' && (() => {
          const dmsToDecimal = (deg: string, min: string, sec: string): number | null => {
            if (!deg && !min && !sec) return null;
            const d = parseFloat(deg) || 0, m = parseFloat(min) || 0, s = parseFloat(sec) || 0;
            return d + m / 60 + s / 3600;
          };
          const decimalToDMS = (dec: number | null): { deg: string; min: string; sec: string } => {
            if (dec == null || isNaN(Number(dec))) return { deg: '', min: '', sec: '' };
            const abs = Math.abs(Number(dec));
            const deg = Math.floor(abs);
            const minFull = (abs - deg) * 60;
            const min = Math.floor(minFull);
            const sec = Math.round((minFull - min) * 60);
            return { deg: String(deg), min: String(min).padStart(2, '0'), sec: String(sec).padStart(2, '0') };
          };
          const formatDMSDisplay = (dec: number | null, dir: string): string => {
            if (dec == null || isNaN(Number(dec))) return '—';
            const { deg, min, sec } = decimalToDMS(dec);
            return `${deg}°${min}′${sec}″${dir}`;
          };
          const emptyForm = { name: '', code: '', coord_n_deg: '', coord_n_min: '', coord_n_sec: '', coord_e_deg: '', coord_e_min: '', coord_e_sec: '', sids: [] as string[], stars: [] as string[], newSid: '', newStar: '' };
          const saveAviationBase = async () => {
            if (!aviationBaseForm.name.trim()) { alert('חובה להזין שם בסיס'); return; }
            const url = editingAviationBase ? `${API_URL}/aviation-bases/${editingAviationBase.id}` : `${API_URL}/aviation-bases`;
            const method = editingAviationBase ? 'PUT' : 'POST';
            const body = {
              name: aviationBaseForm.name.trim(),
              code: aviationBaseForm.code.trim() || null,
              coord_n: dmsToDecimal(aviationBaseForm.coord_n_deg, aviationBaseForm.coord_n_min, aviationBaseForm.coord_n_sec),
              coord_e: dmsToDecimal(aviationBaseForm.coord_e_deg, aviationBaseForm.coord_e_min, aviationBaseForm.coord_e_sec),
              sids: aviationBaseForm.sids,
              stars: aviationBaseForm.stars,
            };
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) { alert('שגיאה בשמירה'); return; }
            setEditingAviationBase(null); setShowAviationBaseForm(false);
            setAviationBaseForm(emptyForm);
            fetch(`${API_URL}/aviation-bases`).then(r => r.ok ? r.json() : []).then(setAdminAviationBases).catch(() => {});
          };
          return (
            <div style={{ padding: '20px', direction: 'rtl', maxWidth: '900px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', color: '#7dd3fc' }}>✈️ בסיסי תעופה</h2>
                <button onClick={() => { setEditingAviationBase(null); setAviationBaseForm(emptyForm); setShowAviationBaseForm(true); }}
                  style={{ padding: '7px 16px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                  + בסיס חדש
                </button>
              </div>

              {showAviationBaseForm && (
                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #334155' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#94a3b8' }}>{editingAviationBase ? 'עריכת בסיס' : 'בסיס חדש'}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '8px', marginBottom: '8px' }}>
                    <input type="text" placeholder="שם הבסיס *" value={aviationBaseForm.name}
                      onChange={e => setAviationBaseForm(p => ({ ...p, name: e.target.value }))}
                      style={{ padding: '7px 10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl' }} />
                    <input type="text" placeholder="קוד (ICAO)" value={aviationBaseForm.code}
                      onChange={e => setAviationBaseForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                      style={{ padding: '7px 10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'ltr', textAlign: 'center', fontFamily: 'monospace' }} />
                  </div>
                  {/* DMS coordinate inputs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: 'bold', marginBottom: '4px' }}>נ"צ N (קו רוחב)</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'ltr' }}>
                        <input type="number" min={0} max={90} placeholder="מעלות" value={aviationBaseForm.coord_n_deg}
                          onChange={e => setAviationBaseForm(p => ({ ...p, coord_n_deg: e.target.value }))}
                          style={{ width: '62px', padding: '6px 6px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', textAlign: 'center', fontFamily: 'monospace' }} />
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>°</span>
                        <input type="number" min={0} max={59} placeholder="דקות" value={aviationBaseForm.coord_n_min}
                          onChange={e => setAviationBaseForm(p => ({ ...p, coord_n_min: e.target.value }))}
                          style={{ width: '54px', padding: '6px 6px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', textAlign: 'center', fontFamily: 'monospace' }} />
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>′</span>
                        <input type="number" min={0} max={59} placeholder="שניות" value={aviationBaseForm.coord_n_sec}
                          onChange={e => setAviationBaseForm(p => ({ ...p, coord_n_sec: e.target.value }))}
                          style={{ width: '54px', padding: '6px 6px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', textAlign: 'center', fontFamily: 'monospace' }} />
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>″N</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: 'bold', marginBottom: '4px' }}>נ"צ E (קו אורך)</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'ltr' }}>
                        <input type="number" min={0} max={180} placeholder="מעלות" value={aviationBaseForm.coord_e_deg}
                          onChange={e => setAviationBaseForm(p => ({ ...p, coord_e_deg: e.target.value }))}
                          style={{ width: '62px', padding: '6px 6px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', textAlign: 'center', fontFamily: 'monospace' }} />
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>°</span>
                        <input type="number" min={0} max={59} placeholder="דקות" value={aviationBaseForm.coord_e_min}
                          onChange={e => setAviationBaseForm(p => ({ ...p, coord_e_min: e.target.value }))}
                          style={{ width: '54px', padding: '6px 6px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', textAlign: 'center', fontFamily: 'monospace' }} />
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>′</span>
                        <input type="number" min={0} max={59} placeholder="שניות" value={aviationBaseForm.coord_e_sec}
                          onChange={e => setAviationBaseForm(p => ({ ...p, coord_e_sec: e.target.value }))}
                          style={{ width: '54px', padding: '6px 6px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', textAlign: 'center', fontFamily: 'monospace' }} />
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>″E</span>
                      </div>
                    </div>
                  </div>
                  {/* SIDs list */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#7dd3fc', fontWeight: 'bold', marginBottom: '6px' }}>SID (נהלי יציאה)</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px', minHeight: '28px' }}>
                        {aviationBaseForm.sids.map((s, i) => (
                          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', background: '#1e3a5f', borderRadius: '12px', fontSize: '12px', color: '#93c5fd', fontFamily: 'monospace' }}>
                            {s}
                            <button onClick={() => setAviationBaseForm(p => ({ ...p, sids: p.sids.filter((_, j) => j !== i) }))}
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px', lineHeight: 1, padding: '0 2px' }}>×</button>
                          </span>
                        ))}
                        {aviationBaseForm.sids.length === 0 && <span style={{ fontSize: '11px', color: '#475569' }}>אין SIDs</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <input type="text" placeholder="הוסף SID" value={aviationBaseForm.newSid}
                          onChange={e => setAviationBaseForm(p => ({ ...p, newSid: e.target.value.toUpperCase() }))}
                          onKeyDown={e => { if (e.key === 'Enter' && aviationBaseForm.newSid.trim()) { setAviationBaseForm(p => ({ ...p, sids: [...p.sids, p.newSid.trim()], newSid: '' })); } }}
                          style={{ flex: 1, padding: '5px 8px', background: '#0f172a', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '12px', fontFamily: 'monospace', direction: 'ltr' }} />
                        <button onClick={() => { if (aviationBaseForm.newSid.trim()) setAviationBaseForm(p => ({ ...p, sids: [...p.sids, p.newSid.trim()], newSid: '' })); }}
                          style={{ padding: '5px 10px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>+</button>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 'bold', marginBottom: '6px' }}>STAR (נהלי כניסה)</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px', minHeight: '28px' }}>
                        {aviationBaseForm.stars.map((s, i) => (
                          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', background: '#292524', borderRadius: '12px', fontSize: '12px', color: '#fcd34d', fontFamily: 'monospace' }}>
                            {s}
                            <button onClick={() => setAviationBaseForm(p => ({ ...p, stars: p.stars.filter((_, j) => j !== i) }))}
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px', lineHeight: 1, padding: '0 2px' }}>×</button>
                          </span>
                        ))}
                        {aviationBaseForm.stars.length === 0 && <span style={{ fontSize: '11px', color: '#475569' }}>אין STARs</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <input type="text" placeholder="הוסף STAR" value={aviationBaseForm.newStar}
                          onChange={e => setAviationBaseForm(p => ({ ...p, newStar: e.target.value.toUpperCase() }))}
                          onKeyDown={e => { if (e.key === 'Enter' && aviationBaseForm.newStar.trim()) { setAviationBaseForm(p => ({ ...p, stars: [...p.stars, p.newStar.trim()], newStar: '' })); } }}
                          style={{ flex: 1, padding: '5px 8px', background: '#0f172a', border: '1px solid #475569', borderRadius: '5px', color: 'white', fontSize: '12px', fontFamily: 'monospace', direction: 'ltr' }} />
                        <button onClick={() => { if (aviationBaseForm.newStar.trim()) setAviationBaseForm(p => ({ ...p, stars: [...p.stars, p.newStar.trim()], newStar: '' })); }}
                          style={{ padding: '5px 10px', background: '#d97706', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>+</button>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={saveAviationBase}
                      style={{ padding: '7px 18px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>שמור</button>
                    <button onClick={() => { setShowAviationBaseForm(false); setEditingAviationBase(null); setAviationBaseForm(emptyForm); }}
                      style={{ padding: '7px 14px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>ביטול</button>
                  </div>
                </div>
              )}

              <div style={{ background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr 80px', gap: '8px', padding: '8px 12px', background: '#1e3a5f', fontSize: '11px', color: '#7dd3fc', fontWeight: 'bold' }}>
                  <span>שם הבסיס</span><span style={{ textAlign: 'center' }}>קוד</span><span style={{ textAlign: 'center' }}>נ"צ N</span><span style={{ textAlign: 'center' }}>נ"צ E</span><span></span>
                </div>
                {adminAviationBases.length === 0
                  ? <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px' }}>אין בסיסים מוגדרים. לחץ "+ בסיס חדש" כדי להוסיף.</div>
                  : adminAviationBases.map((b: any) => (
                    <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr 80px', gap: '8px', padding: '8px 12px', borderTop: '1px solid #1e293b', alignItems: 'center' }}>
                      <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: '500' }}>{b.name}</span>
                      <span style={{ color: '#93c5fd', fontSize: '12px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 'bold' }}>{b.code || '—'}</span>
                      <span style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', fontFamily: 'monospace', direction: 'ltr' }}>{formatDMSDisplay(b.coord_n, 'N')}</span>
                      <span style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', fontFamily: 'monospace', direction: 'ltr' }}>{formatDMSDisplay(b.coord_e, 'E')}</span>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                        <button onClick={() => {
                          const nDMS = decimalToDMS(b.coord_n != null ? Number(b.coord_n) : null);
                          const eDMS = decimalToDMS(b.coord_e != null ? Number(b.coord_e) : null);
                          setEditingAviationBase(b);
                          setAviationBaseForm({ name: b.name, code: b.code || '', coord_n_deg: nDMS.deg, coord_n_min: nDMS.min, coord_n_sec: nDMS.sec, coord_e_deg: eDMS.deg, coord_e_min: eDMS.min, coord_e_sec: eDMS.sec, sids: Array.isArray(b.sids) ? b.sids : [], stars: Array.isArray(b.stars) ? b.stars : [], newSid: '', newStar: '' });
                          setShowAviationBaseForm(true);
                        }} style={{ padding: '3px 8px', background: '#1e3a5f', color: '#93c5fd', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>עריכה</button>
                        <button onClick={async () => { if (!await customConfirm(`למחוק את הבסיס "${b.name}"?`)) return; await fetch(`${API_URL}/aviation-bases/${b.id}`, { method: 'DELETE' }); fetch(`${API_URL}/aviation-bases`).then(r => r.ok ? r.json() : []).then(setAdminAviationBases).catch(() => {}); }}
                          style={{ padding: '3px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>מחק</button>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          );
        })()}

        {activeTab === 'value_lists' && (() => {
          const ELEM_EMOJIS = [
            { icon: '🌐', label: 'רשת' },
            { icon: '🔌', label: 'כבל' },
            { icon: '🚒', label: 'כבאית' },
            { icon: '🔧', label: 'כללי' },
            { icon: '💡', label: 'חשמל' },
            { icon: '⛽', label: 'דלק' },
            { icon: '💧', label: 'מים' },
            { icon: '🛡️', label: 'ביטחון' },
          ];
          const ET_STATUS_OPTS = ['דולק', 'כבוי', 'מנצנץ', 'נוסע', 'עומד', 'פתוח', 'סגור'];
          const IconPicker = () => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '4px' }}>אמוג׳י:</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {ELEM_EMOJIS.map(({ icon, label }) => (
                    <button type="button" key={icon} title={label} onClick={() => setElementTypeFormAndRef(p => ({ ...p, icon }))}
                      style={{ width: '32px', height: '32px', fontSize: '16px', background: elementTypeForm.icon === icon ? '#4c1d95' : '#0f172a', border: `2px solid ${elementTypeForm.icon === icon ? '#7c3aed' : '#334155'}`, borderRadius: '6px', cursor: 'pointer', padding: 0 }}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '4px' }}>אייקוני מפה:</div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {GROUND_SVG_ICON_KEYS.map(({ key, label }) => (
                    <button type="button" key={key} title={label} onClick={() => setElementTypeFormAndRef(p => ({ ...p, icon: key }))}
                      style={{ width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: elementTypeForm.icon === key ? '#1e3a5f' : '#0f172a', border: `2px solid ${elementTypeForm.icon === key ? '#3b82f6' : '#334155'}`, borderRadius: '7px', cursor: 'pointer', padding: '3px' }}>
                      {renderGroundSvgIcon(key, 28)}
                    </button>
                  ))}
                </div>
              </div>
              {/* Live animated preview */}
              {elementTypeForm.icon && (() => {
                const isSvgPrev = typeof elementTypeForm.icon === 'string' && elementTypeForm.icon.startsWith('MAP:');
                const hasBothIcons = !!(elementTypeForm.open_icon && elementTypeForm.close_icon);
                const prevModes: { key: typeof etPreviewMode; label: string; color: string; hidden?: boolean }[] = [
                  { key: 'normal', label: 'רגיל',    color: '#94a3b8' },
                  { key: 'blink',  label: 'מנצנץ',   color: '#f59e0b' },
                  { key: 'open',   label: 'פתוח',    color: '#22c55e' },
                  { key: 'close',  label: 'סגור',    color: '#ef4444' },
                  { key: 'cycle',  label: '⟳ מחזורי', color: '#a78bfa', hidden: !hasBothIcons },
                ];
                const cycleIcon = etCyclePhase === 'open' ? (elementTypeForm.open_icon || elementTypeForm.icon) : (elementTypeForm.close_icon || elementTypeForm.icon);
                const activeIconForMode = etPreviewMode === 'cycle' ? cycleIcon
                  : etPreviewMode === 'open' ? (elementTypeForm.open_icon || elementTypeForm.icon)
                  : etPreviewMode === 'close' ? (elementTypeForm.close_icon || elementTypeForm.icon)
                  : elementTypeForm.icon;
                const borderForMode: Record<typeof etPreviewMode, string> = {
                  normal: '#334155', blink: '#f59e0b', open: '#22c55e', close: '#ef4444', cycle: etCyclePhase === 'open' ? '#22c55e' : '#ef4444'
                };
                return (
                  <div style={{ padding: '10px 12px', background: '#0a1628', borderRadius: '8px', border: '1px solid #1e3a5f', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>👁 תצוגה מקדימה — בחר מצב:</div>
                    {/* Mode selector */}
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      {prevModes.filter(m => !m.hidden).map(m => (
                        <button type="button" key={m.key} onClick={() => { setEtPreviewMode(m.key); if (m.key === 'cycle') { setEtCyclePhase('open'); setEtCycleFading(false); } }}
                          style={{ padding: '4px 12px', background: etPreviewMode === m.key ? m.color + '33' : 'transparent', border: `1px solid ${etPreviewMode === m.key ? m.color : '#334155'}`, borderRadius: '6px', color: etPreviewMode === m.key ? m.color : '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: etPreviewMode === m.key ? 'bold' : 'normal', transition: 'all 0.15s' }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                    {/* Large preview */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', borderRadius: '10px', margin: '0 auto', border: `2px solid ${borderForMode[etPreviewMode]}`, boxShadow: `0 0 12px ${borderForMode[etPreviewMode]}66`, transition: 'border-color 0.4s, box-shadow 0.4s' }}>
                          <div style={{ opacity: etPreviewMode === 'cycle' ? (etCycleFading ? 0 : 1) : 1, transform: etPreviewMode === 'cycle' ? (etCycleFading ? 'scale(0.7)' : 'scale(1)') : 'scale(1)', transition: etPreviewMode === 'cycle' ? 'opacity 0.35s ease, transform 0.35s ease' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isSvgPrev
                              ? renderGroundSvgIcon(activeIconForMode, 52, etPreviewMode === 'blink' ? 'מנצנץ' : undefined)
                              : <span style={{ fontSize: '42px', animation: etPreviewMode === 'blink' ? 'af-elem-blink 0.8s step-end infinite' : 'none' }}>{elementTypeForm.icon}</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: '10px', color: borderForMode[etPreviewMode], marginTop: '5px', fontWeight: 'bold', transition: 'color 0.4s' }}>
                          {etPreviewMode === 'normal' ? 'מצב רגיל' : etPreviewMode === 'blink' ? '⚡ מנצנץ' : etPreviewMode === 'open' ? '✓ פתוח' : etPreviewMode === 'close' ? '✕ סגור' : etCyclePhase === 'open' ? '⟳ פתוח ↔ סגור' : '⟳ סגור ↔ פתוח'}
                        </div>
                      </div>
                    </div>
                    {/* Open / Close icon pickers inline in preview */}
                    {(etPreviewMode === 'open' || etPreviewMode === 'close') && isSvgPrev && (
                      <div style={{ borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
                        <div style={{ fontSize: '10px', color: etPreviewMode === 'open' ? '#22c55e' : '#ef4444', marginBottom: '5px', fontWeight: 'bold' }}>
                          {etPreviewMode === 'open' ? '✓ בחר אייקון מצב פתוח:' : '✕ בחר אייקון מצב סגור:'}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          <button type="button" title="ברירת מחדל (אייקון ראשי)" onClick={() => setElementTypeFormAndRef(p => ({ ...p, [etPreviewMode === 'open' ? 'open_icon' : 'close_icon']: '' }))}
                            style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: !(etPreviewMode === 'open' ? elementTypeForm.open_icon : elementTypeForm.close_icon) ? (etPreviewMode === 'open' ? '#14532d' : '#7f1d1d') : '#0f172a', border: `2px solid ${!(etPreviewMode === 'open' ? elementTypeForm.open_icon : elementTypeForm.close_icon) ? (etPreviewMode === 'open' ? '#22c55e' : '#ef4444') : '#334155'}`, borderRadius: '5px', cursor: 'pointer', fontSize: '12px', color: '#94a3b8' }}>—</button>
                          {GROUND_SVG_ICON_KEYS.map(({ key, label }) => {
                            const currentVal = etPreviewMode === 'open' ? elementTypeForm.open_icon : elementTypeForm.close_icon;
                            const borderC = etPreviewMode === 'open' ? '#22c55e' : '#ef4444';
                            const bgC = etPreviewMode === 'open' ? '#14532d' : '#7f1d1d';
                            return (
                              <button type="button" key={key} title={label} onClick={() => setElementTypeFormAndRef(p => ({ ...p, [etPreviewMode === 'open' ? 'open_icon' : 'close_icon']: key }))}
                                style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: currentVal === key ? bgC : '#0f172a', border: `2px solid ${currentVal === key ? borderC : '#334155'}`, borderRadius: '5px', cursor: 'pointer', padding: '2px' }}>
                                {renderGroundSvgIcon(key, 22)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {etPreviewMode === 'blink' && (
                      <div style={{ borderTop: '1px solid #1e293b', paddingTop: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>ההבהוב מוגדר ע"י אנימציית CSS של האייקון</div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
          const CanChangeStatusSection = () => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
                <input type="checkbox" checked={elementTypeForm.can_change_status} onChange={e => setElementTypeFormAndRef(p => ({ ...p, can_change_status: e.target.checked, allowed_statuses: e.target.checked ? p.allowed_statuses : [] }))}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#3b82f6' }} />
                <span style={{ fontSize: '13px', color: '#e2e8f0', cursor: 'pointer' }} onClick={() => setElementTypeFormAndRef(p => ({ ...p, can_change_status: !p.can_change_status }))}>ניתן לשינוי סטטוס בלחיצה בעמדה</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
                <input type="checkbox" checked={elementTypeForm.can_have_route} onChange={e => setElementTypeFormAndRef(p => ({ ...p, can_have_route: e.target.checked }))}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#22c55e' }} />
                <span style={{ fontSize: '13px', color: '#e2e8f0', cursor: 'pointer' }} onClick={() => setElementTypeFormAndRef(p => ({ ...p, can_have_route: !p.can_have_route }))}>🛣 ניתן להגדרת מסלול ואנימציה</span>
              </div>
              {elementTypeForm.can_change_status && (
                <div style={{ padding: '10px', background: '#0f172a', borderRadius: '6px', border: '1px solid #1d4ed8' }}>
                  {/* Quick preset status buttons */}
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>בחר מרשימה מהירה:</div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {ET_STATUS_OPTS.map(s => {
                      const isOn = elementTypeForm.allowed_statuses.includes(s);
                      const scol: Record<string, string> = { 'דולק': '#22c55e', 'כבוי': '#64748b', 'מנצנץ': '#f59e0b', 'נוסע': '#3b82f6', 'עומד': '#a855f7', 'פתוח': '#22c55e', 'סגור': '#ef4444' };
                      return (
                        <button type="button" key={s} onClick={() => setElementTypeFormAndRef((p: any) => ({ ...p, allowed_statuses: isOn ? p.allowed_statuses.filter((x: any) => x !== s) : [...p.allowed_statuses, s] }))}
                          style={{ padding: '4px 10px', background: isOn ? (scol[s] || '#888') + '22' : 'transparent', border: `1px solid ${isOn ? (scol[s] || '#888') : '#334155'}`, borderRadius: '6px', color: isOn ? (scol[s] || '#e2e8f0') : '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: isOn ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: scol[s] || '#888', display: 'inline-block', opacity: isOn ? 1 : 0.35 }} />
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  {/* Custom status add */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', borderTop: '1px solid #1e3a5f', paddingTop: '8px', marginBottom: '8px' }}>
                    <input
                      value={customStatusInput}
                      onChange={e => setCustomStatusInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { const v = customStatusInput.trim(); if (v && !elementTypeForm.allowed_statuses.includes(v)) { setElementTypeFormAndRef((p: any) => ({ ...p, allowed_statuses: [...p.allowed_statuses, v] })); setCustomStatusInput(''); } } }}
                      placeholder="הוסף סטטוס ידני..."
                      style={{ flex: 1, padding: '5px 8px', background: '#0a1628', border: '1px solid #334155', borderRadius: '5px', color: '#e2e8f0', fontSize: '12px', direction: 'rtl' }}
                    />
                    <button type="button"
                      onClick={() => { const v = customStatusInput.trim(); if (v && !elementTypeForm.allowed_statuses.includes(v)) { setElementTypeFormAndRef((p: any) => ({ ...p, allowed_statuses: [...p.allowed_statuses, v] })); setCustomStatusInput(''); } }}
                      style={{ padding: '5px 12px', background: '#1d4ed8', border: 'none', borderRadius: '5px', color: 'white', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}>+ הוסף</button>
                  </div>
                  {/* Active statuses with per-status icon picker */}
                  {elementTypeForm.allowed_statuses.length > 0 && (
                    <div style={{ borderTop: '1px solid #1e3a5f', paddingTop: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#60a5fa', marginBottom: '6px', fontWeight: 'bold' }}>סטטוסים פעילים — בחר אייקון:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {elementTypeForm.allowed_statuses.map((s: string) => {
                          const scol2: Record<string, string> = { 'דולק': '#22c55e', 'כבוי': '#64748b', 'מנצנץ': '#f59e0b', 'נוסע': '#3b82f6', 'עומד': '#a855f7', 'פתוח': '#22c55e', 'סגור': '#ef4444' };
                          const curIcon = elementTypeForm.status_icons[s] || '';
                          const isPickerOpen = openStatusIconPicker === s;
                          return (
                            <div key={s} style={{ background: '#0a1628', borderRadius: '6px', border: `1px solid ${isPickerOpen ? '#3b82f6' : '#1e3a5f'}`, overflow: 'hidden' }}>
                              {/* Status row */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: scol2[s] || '#60a5fa', flexShrink: 0 }} />
                                <span style={{ fontSize: '12px', color: scol2[s] || '#94a3b8', fontWeight: 'bold', flex: 1 }}>{s}</span>
                                {/* Icon picker toggle */}
                                <button type="button"
                                  onClick={() => setOpenStatusIconPicker(isPickerOpen ? null : s)}
                                  title="בחר אייקון"
                                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: isPickerOpen ? '#1e3a5f' : '#0f172a', border: `1px solid ${isPickerOpen ? '#3b82f6' : '#334155'}`, borderRadius: '4px', cursor: 'pointer', color: '#93c5fd', fontSize: '11px', minWidth: '48px', justifyContent: 'center' }}>
                                  {curIcon ? (
                                    curIcon.startsWith('MAP:')
                                      ? <span style={{ display: 'flex', alignItems: 'center' }}>{renderGroundSvgIcon(curIcon, 15)}</span>
                                      : <span style={{ fontSize: '14px' }}>{curIcon}</span>
                                  ) : <span style={{ color: '#475569', fontSize: '10px' }}>ללא</span>}
                                  <span style={{ fontSize: '9px', color: '#64748b' }}>{isPickerOpen ? '▲' : '▼'}</span>
                                </button>
                                {/* Remove status */}
                                <button type="button"
                                  onClick={() => { setElementTypeFormAndRef((p: any) => { const si = { ...p.status_icons }; delete si[s]; return { ...p, allowed_statuses: p.allowed_statuses.filter((x: any) => x !== s), status_icons: si }; }); if (openStatusIconPicker === s) setOpenStatusIconPicker(null); }}
                                  style={{ width: '20px', height: '20px', background: '#7f1d1d44', border: '1px solid #ef444455', borderRadius: '4px', color: '#fca5a5', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                              </div>
                              {/* Inline icon picker grid */}
                              {isPickerOpen && (
                                <div style={{ borderTop: '1px solid #1e3a5f', padding: '8px', background: '#060f1e' }}>
                                  <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '5px' }}>בחר אייקון מפה:</div>
                                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    <button type="button" title="ללא אייקון"
                                      onClick={() => { setElementTypeFormAndRef((p: any) => { const si = { ...p.status_icons }; delete si[s]; return { ...p, status_icons: si }; }); setOpenStatusIconPicker(null); }}
                                      style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: !curIcon ? '#0c2a4a' : '#0f172a', border: `1px solid ${!curIcon ? '#3b82f6' : '#334155'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#64748b' }}>—</button>
                                    {GROUND_SVG_ICON_KEYS.map(({ key, label }) => (
                                      <button type="button" key={key} title={label}
                                        onClick={() => { setElementTypeFormAndRef((p: any) => ({ ...p, status_icons: { ...p.status_icons, [s]: key } })); setOpenStatusIconPicker(null); }}
                                        style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: curIcon === key ? '#1e3a5f' : '#0f172a', border: `2px solid ${curIcon === key ? '#3b82f6' : '#334155'}`, borderRadius: '4px', cursor: 'pointer', padding: '3px' }}>
                                        {renderGroundSvgIcon(key, 22)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {(elementTypeForm.allowed_statuses.includes('פתוח') || elementTypeForm.allowed_statuses.includes('סגור')) && (
                    <div style={{ marginTop: '8px', padding: '6px 8px', background: '#0a1628', borderRadius: '6px', border: '1px dashed #1e3a5f' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>💡 לאייקון פתוח/סגור ניתן גם להשתמש בתצוגה המקדימה למטה</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
          return (
            <div style={{ padding: '20px', direction: 'rtl', maxWidth: '700px' }}>
              <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#c4b5fd' }}>⚙️ אלמנטים בבסיס</h2>

              {/* Element Types list */}
              <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid #7c3aed', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: '#1e1040', borderBottom: '1px solid #7c3aed', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#c4b5fd', fontSize: '15px', fontWeight: 'bold' }}>⚙️ סוגי אלמנט — {adminElementTypes.length}</span>
                  <span style={{ color: '#64748b', fontSize: '12px' }}>משמשים לסיווג אלמנטים בשדות תעופה</span>
                </div>
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {adminElementTypes.length === 0 && (
                    <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>אין סוגים עדיין — הוסף למטה</div>
                  )}
                  {adminElementTypes.map(et => {
                    const isSvgEt = typeof et.icon === 'string' && et.icon.startsWith('MAP:');
                    const aStatuses: string[] = Array.isArray(et.allowed_statuses) ? et.allowed_statuses : (typeof et.allowed_statuses === 'string' ? (() => { try { return JSON.parse(et.allowed_statuses); } catch { return []; } })() : []);
                    return (
                      <div key={et.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#0a1628', borderRadius: '6px', border: '1px solid #1e3a5f' }}>
                        <div style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isSvgEt ? renderGroundSvgIcon(et.icon, 26) : <span style={{ fontSize: '20px' }}>{et.icon}</span>}
                        </div>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: et.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: '14px', color: '#e2e8f0', fontWeight: 500 }}>{et.name}</span>
                        {et.can_change_status && (
                          <span style={{ fontSize: '10px', background: '#1d4ed833', color: '#60a5fa', border: '1px solid #3b82f655', borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap' }}>
                            🔄 {aStatuses.length > 0 ? aStatuses.join('/') : 'כל הסטטוסים'}
                          </span>
                        )}
                        {et.can_have_route && (
                          <span style={{ fontSize: '10px', background: '#14532d33', color: '#86efac', border: '1px solid #22c55e55', borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap' }}>🛣 מסלול</span>
                        )}
                        <button type="button" onClick={() => { const sicons = typeof et.status_icons === 'object' && !Array.isArray(et.status_icons) ? (et.status_icons || {}) : (typeof et.status_icons === 'string' ? (() => { try { return JSON.parse(et.status_icons); } catch { return {}; } })() : {}); setElementTypeFormAndRef({ name: et.name, color: et.color, icon: et.icon, can_change_status: !!et.can_change_status, allowed_statuses: aStatuses, open_icon: et.open_icon || '', close_icon: et.close_icon || '', can_have_route: !!et.can_have_route, status_icons: sicons }); setEditingElementType(et); }} style={{ padding: '3px 10px', background: '#1e3a5f', color: '#93c5fd', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✏ ערוך</button>
                        <button onClick={async () => { if (!await customConfirm('למחוק סוג זה?')) return; await fetch(`${API_URL}/airfield-element-types/${et.id}`, { method: 'DELETE' }); fetch(`${API_URL}/airfield-element-types`).then(r => r.ok ? r.json() : []).then(setAdminElementTypes).catch(() => {}); }} style={{ padding: '3px 10px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✕ מחק</button>
                      </div>
                    );
                  })}

                  {editingElementType ? (
                    <div style={{ padding: '14px', background: '#1e1040', borderRadius: '8px', border: '2px solid #7c3aed', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                      <div style={{ color: '#c4b5fd', fontSize: '13px', fontWeight: 'bold' }}>עריכת סוג: {editingElementType.name}</div>
                      <input value={elementTypeForm.name} onChange={e => setElementTypeFormAndRef(p => ({ ...p, name: e.target.value }))} placeholder="שם הסוג"
                        style={{ padding: '7px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl' }} />
                      <div>
                        <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '6px' }}>בחר אייקון:</div>
                        {IconPicker()}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>צבע:</span>
                        <input type="color" value={elementTypeForm.color} onChange={e => setElementTypeFormAndRef(p => ({ ...p, color: e.target.value }))}
                          style={{ width: '40px', height: '30px', padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }} />
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: elementTypeForm.color, border: '1px solid #334155' }} />
                      </div>
                      {CanChangeStatusSection()}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" onClick={async () => { const form = elementTypeFormRef.current; await fetch(`${API_URL}/airfield-element-types/${editingElementType.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); fetch(`${API_URL}/airfield-element-types`).then(r => r.ok ? r.json() : []).then(setAdminElementTypes).catch(() => {}); setEditingElementType(null); setElementTypeFormAndRef({ name: '', color: '#f59e0b', icon: '🔧', can_change_status: false, allowed_statuses: [], open_icon: '', close_icon: '', can_have_route: false, status_icons: {} }); }}
                          style={{ flex: 1, padding: '8px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>שמור</button>
                        <button type="button" onClick={() => { setEditingElementType(null); setElementTypeFormAndRef({ name: '', color: '#f59e0b', icon: '🔧', can_change_status: false, allowed_statuses: [], open_icon: '', close_icon: '', can_have_route: false, status_icons: {} }); }}
                          style={{ padding: '8px 16px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>ביטול</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '14px', background: '#0a1628', borderRadius: '8px', border: '1px dashed #334155', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 'bold' }}>+ הוסף סוג חדש</div>
                      <input value={elementTypeForm.name} onChange={e => setElementTypeFormAndRef(p => ({ ...p, name: e.target.value }))} placeholder="שם הסוג (לדוגמה: כבאית, מחסום...)"
                        style={{ padding: '7px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl' }} />
                      <div>
                        <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '6px' }}>בחר אייקון:</div>
                        {IconPicker()}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>צבע:</span>
                        <input type="color" value={elementTypeForm.color} onChange={e => setElementTypeFormAndRef(p => ({ ...p, color: e.target.value }))}
                          style={{ width: '40px', height: '30px', padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }} />
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: elementTypeForm.color, border: '1px solid #334155' }} />
                      </div>
                      {CanChangeStatusSection()}
                      <button type="button" onClick={async () => { const form = elementTypeFormRef.current; if (!form.name.trim()) return; await fetch(`${API_URL}/airfield-element-types`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); fetch(`${API_URL}/airfield-element-types`).then(r => r.ok ? r.json() : []).then(setAdminElementTypes).catch(() => {}); setElementTypeFormAndRef({ name: '', color: '#f59e0b', icon: '🔧', can_change_status: false, allowed_statuses: [], open_icon: '', close_icon: '', can_have_route: false, status_icons: {} }); }}
                        disabled={!elementTypeForm.name.trim()}
                        style={{ padding: '8px', background: elementTypeForm.name.trim() ? '#059669' : '#1e293b', color: 'white', border: 'none', borderRadius: '6px', cursor: elementTypeForm.name.trim() ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 'bold', opacity: elementTypeForm.name.trim() ? 1 : 0.5 }}>+ הוסף סוג</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {activeTab === 'contacts' && (() => {
          const tdS: React.CSSProperties = { padding: '3px 5px', borderBottom: '1px solid #1e293b', verticalAlign: 'middle' };
          const inpS: React.CSSProperties = { width: '100%', padding: '3px 5px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '3px', color: 'white', fontSize: '12px', direction: 'rtl', boxSizing: 'border-box', outline: 'none' };
          const inpFocusStyle = '1px solid #3b82f6';
          const availableToAdd = presets.filter((p: any) => !adminContactsShown.includes(Number(p.id)));
          return (
            <div style={{ padding: '20px', direction: 'rtl', maxWidth: '1000px' }}>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#38bdf8' }}>📡 ניהול קשרים לעמדות</h2>
              <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '16px' }}>
                הגדרת קשרי ברירת מחדל לכל עמדה. עריכה נשמרת אוטומטית בצאת מהשדה. בעליית עמדה מבצעית הקשרים נטענים לsession — עדכונים אישיים אינם נשמרים.
              </p>

              {/* Add workstation row */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
                <select
                  value={adminContactsPicker}
                  onChange={e => setAdminContactsPicker(e.target.value)}
                  style={{ padding: '7px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl', minWidth: '200px' }}
                >
                  <option value="">— בחר עמדה להוסיף —</option>
                  {availableToAdd.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                  disabled={!adminContactsPicker}
                  onClick={() => {
                    const id = Number(adminContactsPicker);
                    if (!id) return;
                    setAdminContactsShown(prev => [...prev, id]);
                    if (!adminContactsData[id]) loadAdminContacts(id);
                    setAdminContactsPicker('');
                  }}
                  style={{ padding: '7px 18px', background: adminContactsPicker ? '#0369a1' : '#1e293b', color: adminContactsPicker ? 'white' : '#475569', border: 'none', borderRadius: '6px', cursor: adminContactsPicker ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 'bold' }}
                >+ הוסף עמדה</button>
                {adminContactsShown.length === 0 && availableToAdd.length === 0 && (
                  <span style={{ color: '#64748b', fontSize: '12px' }}>כל העמדות מוצגות</span>
                )}
              </div>

              {/* Per-preset sections */}
              {adminContactsShown.map(presetId => {
                const preset = presets.find((p: any) => Number(p.id) === presetId);
                const rows = adminContactsData[presetId];
                return (
                  <div key={presetId} style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '10px', marginBottom: '18px', overflow: 'hidden' }}>
                    {/* Preset header */}
                    <div style={{ background: '#1e3a5f', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '14px' }}>🖥 {preset?.name || `עמדה ${presetId}`}</span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {adminContactsSavingId !== null && (adminContactsData[presetId] || []).some((r: any) => r._key === adminContactsSavingId) && (
                          <span style={{ color: '#38bdf8', fontSize: '11px' }}>שומר...</span>
                        )}
                        <button
                          onClick={() => setAdminContactsShown(prev => prev.filter(id => id !== presetId))}
                          style={{ padding: '2px 8px', background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                        >הסתר ✕</button>
                      </div>
                    </div>

                    {/* Contacts table */}
                    {rows === undefined ? (
                      <div style={{ padding: '16px', color: '#475569', fontSize: '12px', textAlign: 'center' }}>טוען...</div>
                    ) : (
                      <>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: '#0c1824', color: '#64748b' }}>
                              <th style={{ ...tdS, width: '80px', textAlign: 'center' }}>ראשי/משני</th>
                              <th style={{ ...tdS, width: '13%', textAlign: 'right' }}>סוג מכשיר</th>
                              <th style={{ ...tdS, width: '17%', textAlign: 'right' }}>תדר/עורק</th>
                              <th style={{ ...tdS, width: '20%', textAlign: 'right' }}>מהות</th>
                              <th style={{ ...tdS, width: '12%', textAlign: 'right' }}>{'או"ק'}</th>
                              <th style={{ ...tdS, textAlign: 'right' }}>הערה</th>
                              <th style={{ ...tdS, width: '36px', textAlign: 'center' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row: any) => (
                              <tr key={row._key} style={{ background: row._unsaved ? '#0c1f33' : 'transparent' }}>
                                <td style={{ ...tdS, textAlign: 'center' }}>
                                  <button
                                    onClick={() => { updateContactLocal(presetId, row._key, 'priority', row.priority === 'משני' ? 'ראשי' : 'משני'); setTimeout(() => saveContactRow(presetId, { ...row, priority: row.priority === 'משני' ? 'ראשי' : 'משני' }), 0); }}
                                    style={{ padding: '2px 8px', background: row.priority === 'משני' ? '#1e293b' : '#0c4a6e', color: row.priority === 'משני' ? '#64748b' : '#38bdf8', border: `1px solid ${row.priority === 'משני' ? '#334155' : '#0369a1'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                  >{row.priority === 'משני' ? 'משני' : 'ראשי'}</button>
                                </td>
                                <td style={tdS}>
                                  <select
                                    value={row.device_type || ''}
                                    onChange={e => updateContactLocal(presetId, row._key, 'device_type', e.target.value)}
                                    onBlur={() => saveContactRow(presetId, row)}
                                    style={{ ...inpS, color: row.device_type ? '#7dd3fc' : '#475569' }}
                                  >
                                    {DEVICE_TYPES.map(dt => <option key={dt} value={dt}>{dt || '— בחר —'}</option>)}
                                  </select>
                                </td>
                                <td style={tdS}>
                                  <input
                                    value={row.frequency || ''}
                                    onChange={e => updateContactLocal(presetId, row._key, 'frequency', e.target.value)}
                                    onBlur={() => saveContactRow(presetId, row)}
                                    onFocus={e => (e.target.style.border = inpFocusStyle)}
                                    style={{ ...inpS, color: '#38bdf8', fontWeight: 'bold' }}
                                    placeholder="123.45"
                                  />
                                </td>
                                <td style={tdS}>
                                  <input
                                    value={row.mahut || ''}
                                    onChange={e => updateContactLocal(presetId, row._key, 'mahut', e.target.value)}
                                    onBlur={() => saveContactRow(presetId, row)}
                                    onFocus={e => (e.target.style.border = inpFocusStyle)}
                                    style={inpS}
                                    placeholder="מהות הקשר"
                                  />
                                </td>
                                <td style={tdS}>
                                  <input
                                    value={row.oketz || ''}
                                    onChange={e => updateContactLocal(presetId, row._key, 'oketz', e.target.value)}
                                    onBlur={() => saveContactRow(presetId, row)}
                                    onFocus={e => (e.target.style.border = inpFocusStyle)}
                                    style={inpS}
                                    placeholder={'או"ק'}
                                  />
                                </td>
                                <td style={tdS}>
                                  <input
                                    value={row.note || ''}
                                    onChange={e => updateContactLocal(presetId, row._key, 'note', e.target.value)}
                                    onBlur={() => saveContactRow(presetId, row)}
                                    onFocus={e => (e.target.style.border = inpFocusStyle)}
                                    style={{ ...inpS, color: '#94a3b8' }}
                                    placeholder="הערה"
                                  />
                                </td>
                                <td style={{ ...tdS, textAlign: 'center' }}>
                                  <button
                                    onClick={() => deleteContactRow(presetId, row)}
                                    style={{ padding: '2px 6px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}
                                  >✕</button>
                                </td>
                              </tr>
                            ))}
                            {rows.length === 0 && (
                              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#334155', padding: '14px', fontSize: '12px' }}>אין קשרים — לחץ "+ הוסף קשר" למטה</td></tr>
                            )}
                          </tbody>
                        </table>
                        <div style={{ padding: '8px 10px', borderTop: '1px solid #1e293b', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button
                            onClick={() => {
                              const newRow = { mahut: '', oketz: '', frequency: '', note: '', device_type: '', priority: 'ראשי', sort_order: rows.length, _key: Date.now(), _unsaved: true };
                              setAdminContactsData(prev => ({ ...prev, [presetId]: [...(prev[presetId] || []), newRow] }));
                              setTimeout(() => saveContactRow(presetId, newRow), 0);
                            }}
                            style={{ padding: '4px 14px', background: 'transparent', color: '#38bdf8', border: '1px dashed #1e40af', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}
                          >+ הוסף קשר</button>
                          <button
                            onClick={async () => {
                              const currentRows = adminContactsData[presetId] || [];
                              for (const row of currentRows) {
                                await saveContactRow(presetId, { ...row, _unsaved: true });
                              }
                            }}
                            style={{ padding: '4px 14px', background: '#0369a1', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                          >💾 שמור</button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {adminContactsShown.length === 0 && (
                <div style={{ textAlign: 'center', color: '#334155', fontSize: '13px', padding: '40px' }}>
                  בחר עמדה מהרשימה למעלה ולחץ "הוסף עמדה"
                </div>
              )}
            </div>
          );
        })()}

        {activeTab === 'default_names' && <DefaultNamesManager />}

        {activeTab === 'strip_windows' && <StripWindowAdmin apiUrl={API_URL} />}

        {activeTab === 'closures' && <ClosuresManager />}




        </div>
      </div>
      {showClassicTransferHelp && <ClassicTransferHelpModal lightMode={false} onClose={() => setShowClassicTransferHelp(false)} />}

      {/* Admin camera panel — draggable floating window */}
      {adminCameraPanel && (
        <div style={{ position: 'fixed', left: adminCameraDragPos.x, top: adminCameraDragPos.y, width: 420, height: 280, zIndex: 9999, background: '#000', border: '2px solid #3b82f6', borderRadius: '10px', boxShadow: '0 8px 40px rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div
            onMouseDown={e => {
              const startX = e.clientX - adminCameraDragPos.x, startY = e.clientY - adminCameraDragPos.y;
              const onMove = (ev: MouseEvent) => setAdminCameraDragPos({ x: ev.clientX - startX, y: ev.clientY - startY });
              const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
            style={{ cursor: 'grab', padding: '6px 10px', background: '#0f172a', borderBottom: '1px solid #1e3a5f', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none' }}>
            <span style={{ fontSize: '14px' }}>📷</span>
            <span style={{ color: '#7dd3fc', fontWeight: 'bold', fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminCameraPanel.name}</span>
            <button onClick={() => setAdminCameraPanel(null)} style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>✕</button>
          </div>
          <iframe src={toEmbedUrl(adminCameraPanel.url)} style={{ flex: 1, border: 'none', width: '100%' }} allow="camera; microphone; autoplay" allowFullScreen title="camera" />
        </div>
      )}

    </div>
  );
};


export default ManagementPage;
