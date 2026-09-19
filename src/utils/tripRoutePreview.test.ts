import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTripRoutePreview, showTripRoutePreview, clearTripRoutePreview, toggleTripRoutePreview,
  subscribeTripRoutePreview, hasDrawableRoute, previewRoutePct, type TripRoutePreview,
} from './tripRoutePreview';
import type { RouteWaypoint } from './trips';

const wp = (xPct: number | null, yPct: number | null, lat: number | null = null, lon: number | null = null): RouteWaypoint =>
  ({ xPct, yPct, lat, lon, routeType: 'vehicle', isCrossing: false });
const P = (id: string): TripRoutePreview => ({ id, airfieldId: 1, label: id, waypoints: [wp(1, 1), wp(2, 2)] });

describe('הצג על מפה - נתיב אחד בכל רגע', () => {
  beforeEach(() => clearTripRoutePreview());

  it('לחיצה מציגה, לחיצה חוזרת על אותו נתיב מסתירה', () => {
    toggleTripRoutePreview(P('a'));
    expect(getTripRoutePreview()?.id).toBe('a');
    toggleTripRoutePreview(P('a'));
    expect(getTripRoutePreview()).toBeNull();
  });

  it('נתיב אחר מחליף את המוצג', () => {
    toggleTripRoutePreview(P('a'));
    toggleTripRoutePreview(P('b'));
    expect(getTripRoutePreview()?.id).toBe('b');
  });

  it('ניקוי עם מזהה אחר אינו מוחק את הנתיב המוצג', () => {
    showTripRoutePreview(P('a'));
    clearTripRoutePreview('b');
    expect(getTripRoutePreview()?.id).toBe('a');
    clearTripRoutePreview('a');
    expect(getTripRoutePreview()).toBeNull();
  });

  it('המנויים מקבלים הודעה על כל שינוי, ולא אחרי ביטול המינוי', () => {
    let n = 0;
    const off = subscribeTripRoutePreview(() => { n++; });
    showTripRoutePreview(P('a'));
    clearTripRoutePreview();
    off();
    showTripRoutePreview(P('b'));
    expect(n).toBe(2);
  });
});

describe('הנתיב באחוזי מפה', () => {
  const anchor = { x1: 0, y1: 0, lat1: 32, lon1: 35, x2: 100, y2: 100, lat2: 31, lon2: 36 };

  it('אחוזים שמורים גוברים', () => {
    expect(previewRoutePct([wp(10, 20), wp(30, 40)], null)).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }]);
  });

  it('בלי אחוזים - מהנ"צ דרך העוגן', () => {
    const pts = previewRoutePct([wp(null, null, 32, 35), wp(null, null, 31.5, 35.5)], anchor);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[1].x).toBeCloseTo(50);
    expect(pts[1].y).toBeCloseTo(50);
  });

  it('פחות משתי נקודות ממוקמות - אין קו', () => {
    expect(previewRoutePct([wp(10, 20), wp(null, null, 32, 35)], null)).toEqual([]);
    expect(hasDrawableRoute([wp(10, 20)])).toBe(false);
    expect(hasDrawableRoute([wp(10, 20), wp(null, null, 32, 35)])).toBe(true);
    expect(hasDrawableRoute(undefined)).toBe(false);
  });
});
