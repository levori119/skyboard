// הצהרות טיפוסים ל-shared/mapObjects.js - ראה ההסבר בראש המימוש.

export type MapObjectShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hexagon' | 'cross';

/** אובייקט על מפה אחרי נרמול. x/y/size באחוזים - ראה המימוש. */
export interface MapObject {
  id?: number;
  map_id?: number;
  name: string;
  shape: MapObjectShape;
  x: number;
  y: number;
  size: number;
  color: string;
  filled: boolean;
  show_label: boolean;
  sort_order: number;
}

export declare const MAP_OBJECT_SHAPES: MapObjectShape[];
export declare const MAP_OBJECT_SIZE_MIN: number;
export declare const MAP_OBJECT_SIZE_MAX: number;
export declare const MAP_OBJECT_SIZE_DEFAULT: number;
export declare const MAP_OBJECT_DEFAULT_COLOR: string;
export declare const MAP_OBJECT_NAME_MAX: number;

export declare function isValidMapObjectColor(c: unknown): boolean;
export declare function isMapObjectShape(s: unknown): s is MapObjectShape;
export declare function normalizeMapObject(raw: unknown): MapObject;
export declare function normalizeMapObjectPatch(raw: unknown, current: unknown): MapObject;
export declare function mapObjectPath(shape: MapObjectShape | string, r: number): string;
