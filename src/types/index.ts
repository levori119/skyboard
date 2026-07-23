// ─── Aircraft Icon Type ───────────────────────────────────────────────────────
export type AircraftIconType =
  | 'f15'
  | 'f16'
  | 'f35'
  | 'b707'
  | 'gulfstream'
  | 'c130'
  | 'yasur'
  | 'apache'
  | 'blackhawk'
  | 'naval-blackhawk'
  | 'uav'
  | 'jet';

// ─── Crew & Session ───────────────────────────────────────────────────────────
export interface CrewMember {
  id: number;
  name: string;
  first_name?: string;
  last_name?: string;
  personal_id?: string;
  is_admin: boolean;
  is_team_lead?: boolean;
  approved_workstations?: number[];
  auth_source?: 'mirage';
  undo_duration_ms?: number | null;
  ground_datk_filter?: number | null;
  ground_status_filter?: string[] | null;
  ground_filter_mode?: 'AND' | 'OR' | null;
  classic_panel_orders?: Record<string, any> | null;
}

export interface WorkstationSession {
  workstationId: string;
  workstationName: string;
  relevantSectors: {
    id: number;
    name: string;
    label_he: string;
    category?: string;
    notes?: string;
    conflict_alt_delta?: number;
  }[];
  mapId?: number;
  presetId?: number;
  authToken: string;
  crewMember?: CrewMember;
  sectorId?: number | string | null;
  env?: number; // סביבת העבודה שנבחרה בכניסה (1-10 טסות, 11-50 תרגול)
}

// ─── Query Builder Types ──────────────────────────────────────────────────────
export type QOperator = 'all' | 'any' | 'none';
export type QCompare =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'gt'
  | 'lt'
  | 'empty'
  | 'not_empty';

export interface QLeaf {
  id: string;
  type: 'leaf';
  field: string;
  compare: QCompare;
  value: string;
}

export interface QGroup {
  id: string;
  type: 'group';
  operator: QOperator;
  children: QNode[];
}

export type QNode = QGroup | QLeaf;

// ─── Geo / Map ────────────────────────────────────────────────────────────────
export interface MapGeoAnchor {
  x1: number; y1: number; lat1: number; lon1: number;
  x2: number; y2: number; lat2: number; lon2: number;
}

export interface MapZone {
  id: number;
  map_id: number;
  name: string;
  color: string;
  polygon: string;
  polygon_geo?: string;
  enabled?: boolean;
  parent_zone_id?: number | null;
}

export interface ZoneAltRange {
  id: number;
  zone_id: number;
  name: string;
  alt_min: number | null;
  alt_max: number | null;
  sort_order: number;
}

export interface StripZoneAssignment {
  id: number;
  strip_id: number;
  zone_id: number | null;
  altitude_range_id: number | null;
  status: string;
  note: string;
  coordination_note: string;
  is_coordinated: boolean;
  zone_name: string | null;
  zone_color: string | null;
  alt_range_name: string | null;
  alt_min: number | null;
  alt_max: number | null;
  pos_x: number | null;
  pos_y: number | null;
  requested_zone_ids?: number[];
  map_id?: number | null;
  extra_zones?: { id: number; zone_id: number; zone_name: string | null; zone_color: string | null }[];
}

// ─── Ground / Aircraft ────────────────────────────────────────────────────────
export interface AircraftPos {
  idx: number;
  x: number;
  y: number;
  point_id?: number | null;
  status?: string;
}

export interface GroundAircraftRow {
  id: number;
  strip_id: number;
  idx: number;
  datk: number | null;
  kipa: string;
}

// ─── Strip ────────────────────────────────────────────────────────────────────
export interface Strip {
  id: number;
  callsign: string;
  sq?: string;
  alt?: string;
  task?: string;
  status?: string;
  sector_id?: number | null;
  workstation_preset_id?: number | null;
  notes?: string;
  weapons?: unknown[];
  targets?: unknown[];
  systems?: unknown[];
  shkadia?: string;
  custom_fields?: Record<string, unknown>;
  takeoff_time?: string | null;
  airborne?: boolean;
  squadron?: string;
  number_of_formation?: string;
  in_table?: boolean;
  erka?: string;
  koteret?: string;
  mivtza?: string;
  on_map?: boolean;
  x?: number;
  y?: number;
  block_space_id?: number | null;
  block_deviation?: boolean;
  parent_strip_id?: number | null;
  aircraft_indices?: number[] | null;
  original_formation_count?: number | null;
  formation_notes?: string;
  parent_callsign?: string;
  ground_status?: string;
  aircraft_positions?: AircraftPos[];
  creator_preset_id?: number | null;
  creator_crew_name?: string;
  [key: string]: unknown;
}

// ─── Transfer ─────────────────────────────────────────────────────────────────
export interface Transfer {
  id: string;
  strip_id: number;
  from_sector_id?: number | null;
  to_sector_id?: number | null;
  from_preset_id?: number | null;
  to_preset_id?: number | null;
  status: string;
  target_x?: number;
  target_y?: number;
  sub_sector_label?: string;
  note?: string;
  eta_minutes?: number | null;
  created_at?: string;
  updated_at?: string;
  strip?: Strip;
}
