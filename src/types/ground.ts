// Runtime ground/airfield types (extracted from App.tsx — frontend-parsed shapes)

export type GroundStatusKey = 'none' | 'taxi' | 'lineup' | 'takeoff';

export type AircraftPos = {
  idx: number;
  point_id: number | null;
  status: GroundStatusKey;
};

export interface GroundAircraftRow {
  id?: number; idx: number; datk: number | null; kipa: string | null;
  /** איפה המטוס בהקפה: עה"ר / בסיס / פיינל / נחת (ראה נקודות הצטרפות). */
  flight_status?: string | null;
  /** דיווח ירוקים - **דגל** ולא שלב: נכון בכל צלע, ואינו מוחק את הצלע. */
  greens?: boolean | null;
  /** תקלה במטוס - הדגל שמאדים אותו בתצוגה (ראה src/utils/faults.ts). */
  has_fault?: boolean | null;
  /** מהות התקלה - מתפריט `fault_types` שמנוהל במסך ניהול מערכת. */
  fault_type?: string | null;
  /** פירוט התקלה - טקסט חופשי. */
  fault_details?: string | null;
}

export interface MapZone {
  id: number; map_id: number; name: string; color: string;
  polygon: { x: number; y: number }[];
  polygon_geo?: { lat: number; lon: number }[];
  parent_zone_id?: number | null; enabled?: boolean;
  /** Operational state (set live in CTRL): which altitude blocks are permitted; [] = all. */
  active_alt_range_ids?: number[];
  /** Operational state (set live in CTRL): free-text limitation shown next to the zone name. */
  limitation_note?: string;
}

export interface ZoneAltRange { id: number; zone_id: number; name: string; alt_min: number | null; alt_max: number | null; sort_order: number; }

export interface StripZoneAssignment {
  id: number; strip_id: number; zone_id: number | null; altitude_range_id: number | null;
  altitude_range_ids?: number[]; // בלוקי גובה רלוונטיים (בחירה מרובה); altitude_range_id = הראשון
  status: string; note: string; coordination_note: string; is_coordinated: boolean;
  zone_name: string | null; zone_color: string | null; alt_range_name: string | null;
  alt_min: number | null; alt_max: number | null; pos_x: number | null; pos_y: number | null;
  requested_zone_ids?: number[]; map_id?: number | null;
  extra_zones?: { id: number; zone_id: number; zone_name: string | null; zone_color: string | null }[];
  group_polygon?: [number, number][] | null; // פוליגון-איחוד מותאם ידנית (עריכת נקודות); null = איחוד אוטומטי
}

export type VectorLine = { id: string; points: { x: number; y: number }[]; color: string; width: number; };
export type VectorData = { lines: VectorLine[]; bgColor: string; };
