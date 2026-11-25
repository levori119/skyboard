// אובייקטים על מפה - הצד של הלקוח. הנרמול והגאומטריה של הצורות יושבים
// ב-shared/mapObjects.js (אותו קוד רץ גם בשרת), וכאן רק מה שהציור צריך:
// המרה מאחוזים לפיקסלים של שכבת הציור. ראה MAP_OBJECTS_SPEC.md.

import type { MapObject } from '../../shared/mapObjects';

export {
  MAP_OBJECT_SHAPES, MAP_OBJECT_SIZE_MIN, MAP_OBJECT_SIZE_MAX, MAP_OBJECT_SIZE_DEFAULT,
  MAP_OBJECT_DEFAULT_COLOR, MAP_OBJECT_NAME_MAX,
  isValidMapObjectColor, isMapObjectShape, normalizeMapObject, normalizeMapObjectPatch, mapObjectPath,
} from '../../shared/mapObjects';
export type { MapObject, MapObjectShape } from '../../shared/mapObjects';

/** מפתח i18n של שם הצורה (map.objShape_<shape>). */
export const mapObjectShapeKey = (shape: string) => `map.objShape_${shape}`;

/**
 * מיקום האובייקט בפיקסלים של שכבה שמכסה בדיוק את תמונת המפה (רוחב W, גובה H).
 *
 * הגודל נגזר מ**הרוחב** בלבד, גם לציר האנכי - אחרת עיגול על מפה לא-ריבועית
 * היה נמתח לאליפסה (בדיוק הבעיה של viewBox 0..100 עם preserveAspectRatio=none).
 */
export function mapObjectPixels(o: Pick<MapObject, 'x' | 'y' | 'size'>, W: number, H: number) {
  return {
    cx: (o.x / 100) * W,
    cy: (o.y / 100) * H,
    r: Math.max(0.5, ((o.size / 100) * W) / 2),
  };
}

/** סדר הציור: sort_order ואז id - אובייקט שנוצר אחרון מצויר מעל. */
export function sortMapObjects<T extends Pick<MapObject, 'sort_order' | 'id'>>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.sort_order - b.sort_order) || ((a.id ?? 0) - (b.id ?? 0)));
}
