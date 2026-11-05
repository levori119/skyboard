// טיפוסים ל-shared/blockSpaceGeo.js (חלוקה למרחבי בלוקים לפי מיקום המטרה)
export type GeoPt = { lat: number; lon: number };
export function polygonCentroid(points: unknown): (GeoPt & { area: number }) | null;
export function spaceCenter(polygons: unknown): GeoPt | null;
export function distanceNm(a: GeoPt, b: GeoPt): number;
export type SpaceGeo = { center_lat?: number | null; center_lon?: number | null; polygons?: GeoPt[][] | null };
export function distanceToPolygonNm(pt: GeoPt, polygon: unknown): number;
export function distanceToSpaceNm(target: GeoPt | null | undefined, space: SpaceGeo): number;
export function nearestSpace<T extends SpaceGeo>(target: GeoPt | null | undefined, spaces: T[]): T | null;
export function farthestSpace<T extends SpaceGeo>(point: GeoPt | null | undefined, spaces: T[]): T | null;
