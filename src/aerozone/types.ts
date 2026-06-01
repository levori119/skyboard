export type AirportType = 'military' | 'civil' | 'mixed';
export type PolygonType = 'runway' | 'taxiway' | 'apron' | 'area' | 'segment';
export type OperationalStatus = 'operational' | 'partial' | 'closed' | 'maintenance';
export type GRFStatus = 'dry' | 'slippery' | 'wet';
export type VisibilityCategory = 'good' | 'reduced' | 'low';

export interface AZAirport {
  id: number;
  name: string;
  icao_code: string;
  type: AirportType;
  is_active: boolean;
  created_at: string;
}

export interface AZMap {
  id: number;
  airport_id: number;
  name: string;
  file_name: string;
  is_active: boolean;
  created_at: string;
}

export interface AZPolygon {
  id: number;
  airport_id: number;
  map_id: number | null;
  parent_id: number | null;
  name: string;
  name_he: string | null;
  type: PolygonType;
  color: string;
  note: string | null;
  coordinates: [number, number][]; // [[lat, lng], ...]
  sort_order: number;
}

export interface AZPolygonStatus {
  polygon_id: number;
  operational: OperationalStatus;
  grf: GRFStatus;
  rvr: number | null;
  visibility_category: VisibilityCategory;
  note: string | null;
  updated_at: string | null;
}

export interface AZStatusLog {
  id: number;
  polygon_id: number;
  polygon_name: string;
  operational: OperationalStatus;
  grf: GRFStatus;
  rvr: number | null;
  note: string | null;
  created_at: string;
}

export const OPERATIONAL_LABELS: Record<OperationalStatus, string> = {
  operational: 'שמיש',
  partial: 'שמיש חלקי',
  closed: 'סגור',
  maintenance: 'שיפוצים',
};

export const OPERATIONAL_COLORS: Record<OperationalStatus, string> = {
  operational: '#22c55e',
  partial: '#f59e0b',
  closed: '#ef4444',
  maintenance: '#f97316',
};

export const GRF_LABELS: Record<GRFStatus, string> = {
  dry: 'יבש',
  slippery: 'חלק',
  wet: 'רטוב',
};

export const GRF_COLORS: Record<GRFStatus, string> = {
  dry: '#64748b',
  slippery: '#60a5fa',
  wet: '#2563eb',
};

export const POLYGON_TYPE_LABELS: Record<PolygonType, string> = {
  runway: 'מסלול',
  taxiway: 'מסלול הסעה',
  apron: 'רחבה',
  area: 'אזור',
  segment: 'מקטע',
};

export const VISIBILITY_LABELS: Record<VisibilityCategory, string> = {
  good: 'טובה',
  reduced: 'מופחתת',
  low: 'נמוכה',
};

export const API_URL = (typeof window !== 'undefined' && (window as any).__AZ_API_URL__) || 'http://localhost:3001/api/az';
