// Runtime ground/airfield types (extracted from App.tsx — frontend-parsed shapes)

export type GroundStatusKey = 'none' | 'taxi' | 'lineup' | 'takeoff';

export type AircraftPos = {
  idx: number;
  point_id: number | null;
  status: GroundStatusKey;
};

export interface GroundAircraftRow { id?: number; idx: number; datk: number | null; kipa: string | null; }

export interface MapZone {
  id: number; map_id: number; name: string; color: string;
  polygon: { x: number; y: number }[];
  polygon_geo?: { lat: number; lon: number }[];
  parent_zone_id?: number | null; enabled?: boolean;
}

export interface ZoneAltRange { id: number; zone_id: number; name: string; alt_min: number | null; alt_max: number | null; sort_order: number; }

export interface StripZoneAssignment {
  id: number; strip_id: number; zone_id: number | null; altitude_range_id: number | null;
  status: string; note: string; coordination_note: string; is_coordinated: boolean;
  zone_name: string | null; zone_color: string | null; alt_range_name: string | null;
  alt_min: number | null; alt_max: number | null; pos_x: number | null; pos_y: number | null;
  requested_zone_ids?: number[]; map_id?: number | null;
  extra_zones?: { id: number; zone_id: number; zone_name: string | null; zone_color: string | null }[];
}

export type VectorLine = { id: string; points: { x: number; y: number }[]; color: string; width: number; };
export type VectorData = { lines: VectorLine[]; bgColor: string; };
