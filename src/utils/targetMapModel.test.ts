import { describe, it, expect } from 'vitest';
import { buildTargetMapModel, makeProjection } from './targetMapModel';

// מה שנבדק: מיקום הפ"מ (מרכז המרחב קודם למיקום במפה), סימון הראשונה לביצוע, וההטלה.
const NORTH = 'N3130.0000/E03430.0000'; // 31.5, 34.5
const SOUTH = 'N3115.0000/E03420.0000'; // 31.25, 34.333
const spaces = [{ id: 1, name: 'צפון', center_lat: 31.6, center_lon: 34.6, polygons: [[{ lat: 31.5, lon: 34.5 }, { lat: 31.7, lon: 34.5 }, { lat: 31.7, lon: 34.7 }]] }];
const label = (s: any) => s.callsign;

describe('buildTargetMapModel', () => {
  it('פ"מ במרחב - ממוקם במרכז המרחב, והראשונה לביצוע מסומנת', () => {
    const m = buildTargetMapModel([{ id: 's1', callsign: 'ברק', block_space_id: 1, map_lat: 30, map_lon: 30,
      targets: [{ coord: NORTH }, { coord: SOUTH, first_exec: true }] }], spaces, label);
    expect(m.strips[0].pos).toEqual({ lat: 31.6, lon: 34.6 });
    expect(m.strips[0].targets.map(t => t.first)).toEqual([false, true]);
  });
  it('בלי מרחב - המיקום במפה; בלי שניהם - בלי מיקום', () => {
    const m = buildTargetMapModel([
      { id: 's1', callsign: 'א', map_lat: 31.4, map_lon: 34.4, targets: [{ coord: NORTH }] },
      { id: 's2', callsign: 'ב', targets: [{ coord: SOUTH }] },
    ], [], label);
    expect(m.strips[0].pos).toEqual({ lat: 31.4, lon: 34.4 });
    expect(m.strips[1].pos).toBe(null);
  });
  it('פ"מ בלי מטרות ובלי מיקום לא מוצג; נ"צ לא תקין מדולג', () => {
    const m = buildTargetMapModel([{ id: 's1', callsign: 'א', targets: [{ coord: 'x' }] }], [], label);
    expect(m.strips).toEqual([]);
    expect(m.bounds).toBe(null);
  });
  it('הגבולות כוללים מטרות, פ"מים ופוליגוני המרחבים', () => {
    const m = buildTargetMapModel([{ id: 's1', callsign: 'א', targets: [{ coord: SOUTH }] }], spaces, label);
    expect(m.bounds!.minLat).toBeCloseTo(31.25, 6);
    expect(m.bounds!.maxLat).toBeCloseTo(31.7, 6);
  });
});

describe('makeProjection', () => {
  it('צפון למעלה, מזרח ימינה, ומרכז הגבולות במרכז המסגרת', () => {
    const p = makeProjection({ minLat: 31, maxLat: 32, minLon: 34, maxLon: 35 }, 400, 300);
    expect(p({ lat: 31.5, lon: 34.5 })).toEqual({ x: 200, y: 150 });
    expect(p({ lat: 32, lon: 34.5 }).y).toBeLessThan(150);
    expect(p({ lat: 31.5, lon: 35 }).x).toBeGreaterThan(200);
  });
  it('הכל נכנס למסגרת עם שוליים', () => {
    const p = makeProjection({ minLat: 31, maxLat: 32, minLon: 34, maxLon: 35 }, 400, 300, 20);
    for (const c of [{ lat: 31, lon: 34 }, { lat: 32, lon: 35 }]) {
      const q = p(c);
      expect(q.x).toBeGreaterThanOrEqual(19.9); expect(q.x).toBeLessThanOrEqual(380.1);
      expect(q.y).toBeGreaterThanOrEqual(19.9); expect(q.y).toBeLessThanOrEqual(280.1);
    }
  });
});
