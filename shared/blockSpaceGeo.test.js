import { describe, it, expect } from 'vitest';
import { polygonCentroid, spaceCenter, nearestSpace, farthestSpace, distanceToPolygonNm } from './blockSpaceGeo.js';

// מה שנבדק: מרכז מרחב הבלוקים מהאזורים שלו, והמרחב שמרכזו הכי קרוב למטרה.
const square = (lat, lon, d = 0.1) => [
  { lat, lon }, { lat, lon: lon + d }, { lat: lat + d, lon: lon + d }, { lat: lat + d, lon },
];

describe('polygonCentroid', () => {
  it('ריבוע - המרכז באמצע', () => {
    const c = polygonCentroid(square(32, 34));
    expect(c.lat).toBeCloseTo(32.05, 6);
    expect(c.lon).toBeCloseTo(34.05, 6);
  });
  it('ריק / מנוון - null או ממוצע', () => {
    expect(polygonCentroid([])).toBe(null);
    expect(polygonCentroid([{ lat: 1, lon: 1 }, { lat: 3, lon: 3 }])).toMatchObject({ lat: 2, lon: 2, area: 0 });
  });
});

describe('spaceCenter', () => {
  it('אזור גדול מושך את המרכז יותר מאזור קטן', () => {
    const c = spaceCenter([square(32, 34, 1), square(30, 34, 0.01)]);
    expect(c.lat).toBeGreaterThan(32.4);
  });
  it('בלי אזורים עם נ"צ - null', () => {
    expect(spaceCenter([[], null])).toBe(null);
  });
});

describe('nearestSpace', () => {
  const spaces = [
    { id: 1, center_lat: 31.0, center_lon: 34.5 },
    { id: 2, center_lat: 32.5, center_lon: 35.0 },
    { id: 3, center_lat: null, center_lon: null }, // לא קושר לאזורים - לא מתמודד
  ];
  it('בוחר את המרכז הקרוב למטרה', () => {
    expect(nearestSpace({ lat: 32.3, lon: 34.9 }, spaces).id).toBe(2);
    expect(nearestSpace({ lat: 30.8, lon: 34.4 }, spaces).id).toBe(1);
  });
  it('בלי מטרה או בלי מרחב עם מרכז - null', () => {
    expect(nearestSpace(null, spaces)).toBe(null);
    expect(nearestSpace({ lat: 31, lon: 34 }, [spaces[2]])).toBe(null);
  });
});

describe('מרחק לפוליגון - קדמי מול אחורי', () => {
  // המטרות במזרח. הגזרה הקדמית ארוכה וצרה לאורך הגבול ומרכזה רחוק במערב-צפון;
  // האחורית קומפקטית ומרכזה דווקא קרוב יותר למטרה - אבל היא רחוקה ממנה בפועל
  const front = { id: 'front', polygons: [[{ lat: 31.40, lon: 34.30 }, { lat: 31.45, lon: 34.30 }, { lat: 32.40, lon: 33.40 }, { lat: 32.35, lon: 33.40 }]] };
  const rear = { id: 'rear', polygons: [[{ lat: 31.20, lon: 33.90 }, { lat: 31.30, lon: 33.90 }, { lat: 31.30, lon: 34.00 }, { lat: 31.20, lon: 34.00 }]] };
  Object.assign(front, { center_lat: 31.90, center_lon: 33.85 });
  Object.assign(rear, { center_lat: 31.25, center_lon: 33.95 });
  const target = { lat: 31.42, lon: 34.50 };
  it('הקצה הקרוב קובע, לא המרכז', () => {
    expect(nearestSpace(target, [rear, front]).id).toBe('front');
  });
  it('מטרה בתוך הפוליגון - מרחק 0', () => {
    expect(distanceToPolygonNm({ lat: 31.25, lon: 33.95 }, rear.polygons[0])).toBe(0);
  });
  it('בלי פוליגון - נופל למרכז', () => {
    expect(nearestSpace(target, [{ id: 'c1', center_lat: 31.4, center_lon: 34.4 }, { id: 'c2', center_lat: 32.4, center_lon: 33.4 }]).id).toBe('c1');
  });
  it('farthestSpace - הגזרה הרחוקה מהנקודה', () => {
    expect(farthestSpace(target, [rear, front, { id: 'far', polygons: [[{ lat: 32.8, lon: 33.0 }, { lat: 32.9, lon: 33.0 }, { lat: 32.9, lon: 33.1 }]] }]).id).toBe('far');
    expect(farthestSpace(null, [rear])).toBe(null);
  });
});
