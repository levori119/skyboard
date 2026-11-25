// שכבת האובייקטים על מפת העמדה. יושבת **בתוך** שכבת ה-transform של המפה,
// ולכן זזה ומתקרבת יחד איתה. ראה MAP_OBJECTS_SPEC.md.
//
// pointerEvents: none על כל השכבה - האובייקטים הם רקע מפה, ואסור שיחסמו
// לחיצה על אזור, גרירת פ"מ או פאן של המפה.

import React from 'react';
import { MapObjectGlyph } from './MapObjectGlyph';
import type { MapObject } from '../../utils/mapObjects';

export const MapObjectsLayer = ({ objects, bounds, zoom, light, zIndex = 1 }: {
  objects: MapObject[];
  /** תיבת תמונת המפה בתוך שכבת ה-transform (mapImgBounds) */
  bounds: { left: number; top: number; width: number; height: number } | null;
  zoom: number;
  light: boolean;
  zIndex?: number;
}) => {
  if (!bounds || objects.length === 0 || bounds.width <= 0 || bounds.height <= 0) return null;
  return (
    <svg data-map-objects-layer=""
      style={{ position: 'absolute', top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height, pointerEvents: 'none', zIndex, overflow: 'visible' }}>
      {objects.map((o, i) => (
        <MapObjectGlyph key={o.id ?? `i${i}`} o={o} W={bounds.width} H={bounds.height} zoom={zoom} light={light} />
      ))}
    </svg>
  );
};

export default MapObjectsLayer;
