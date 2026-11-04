// טיפוסים ל-shared/blockSpaceGeo.js (חלוקה למרחבי בלוקים לפי מיקום המטרה)
export type GeoPt = { lat: number; lon: number };
export function polygonCentroid(points: unknown): (GeoPt & { area: number }) | null;
export function spaceCenter(polygons: unknown): GeoPt | null;
export function distanceNm(a: GeoPt, b: GeoPt): number;
export function nearestSpace<T extends { center_lat?: number | null; center_lon?: number | null }>(
  target: GeoPt | null | undefined, spaces: T[]): T | null;
