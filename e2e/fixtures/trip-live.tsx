import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/i18n';
import TripLiveLayer from '../../src/components/ground/TripLiveVehicles';
import TripAlertsLayer from '../../src/components/ground/TripAlertsLayer';
import type { LiveTrip } from '../../src/utils/liveTrips';
import type { MapGeoAnchor } from '../../src/utils/geo';

/**
 * מתקן בדיקה למעקב נסיעה חי **במגדל** (TRIP_LIVE_TRACKING_SPEC.md §6 T1-T12).
 *
 * הרכיבים האמיתיים - שכבת הרכבים על המפה וערימת ההתרעות - עם ההוקים האמיתיים
 * שלהם (useLiveTrips, useAirfieldTrips, מנוע ה-polling). רק הרשת מדומה: fetch
 * מחזיר את מה ש-`window.__setLive` קבע, בצורה המדויקת של GET /api/trips/live.
 * כך נבדק בדפדפן אמיתי מה שרינדור סטטי לא יכול: שהסקר רץ, שהשכבה וההתרעות
 * מתעדכנות יחד מאותו מנוי, ושהתרעה שנסגרה חוזרת כשהרכב סוטה שוב.
 */
document.documentElement.style.setProperty('--s', '1');

// עוגן: x 0..100 ↔ lon 34.60..34.70, y 0..100 ↔ lat 31.30..31.20
const ANCHOR: MapGeoAnchor = { x1: 0, y1: 0, lat1: 31.3, lon1: 34.6, x2: 100, y2: 100, lat2: 31.2, lon2: 34.7 };
const BOUNDS = { left: 20, top: 20, width: 520, height: 390 };
const POINTS = [{ id: 20, x_pct: 40, y_pct: 50, name: 'שער ראשי' }, { id: 21, x_pct: 60, y_pct: 50, name: 'מסוף מטען' }];
const ROUTE = [
  { lat: 31.25, lon: 34.64, xPct: 40, yPct: 50, routeType: 'vehicle', isCrossing: false },
  { lat: 31.25, lon: 34.66, xPct: 60, yPct: 50, routeType: 'vehicle', isCrossing: false },
];

const trip = (over: Partial<LiveTrip>): LiveTrip => ({
  id: 0, status: 'approved', driver_started_at: new Date().toISOString(), ended_at: null,
  from_point_id: 20, vehicle_name: '', route: ROUTE, has_route: true, has_anchor: true,
  from_point_name: 'שער ראשי', to_point_name: 'מסוף מטען', from_text: '', to_text: '',
  position: { lat: 31.25, lng: 34.65, accuracy_m: 8, heading: 90, speed_kmh: 30, fix_at: new Date().toISOString() },
  stale: false, deviation_m: 3, deviating: false, blocking_element: null,
  ...over,
} as LiveTrip);

export const SCENARIO: LiveTrip[] = [
  trip({ id: 1, vehicle_name: 'מיניבוס' }),
  trip({ id: 2, vehicle_name: 'משאית דלק', position: { lat: 31.2528, lng: 34.645, accuracy_m: 8, heading: 180, speed_kmh: 25, fix_at: new Date().toISOString() }, deviation_m: 312, deviating: true }),
  trip({ id: 3, vehicle_name: 'אמבולנס', position: { lat: 31.25, lng: 34.655, accuracy_m: 6, heading: 90, speed_kmh: 12, fix_at: new Date().toISOString() },
    blocking_element: { id: 31, name: 'מחסום צפוני', display_state: 'close', state_label: 'סגור', distance_m: 22 } }),
  trip({ id: 4, vehicle_name: 'גורר', position: null, stale: true, deviation_m: null }),
];

let current: LiveTrip[] = SCENARIO;
(window as unknown as { __setLive: (rows: LiveTrip[]) => void }).__setLive = rows => { current = rows; };
(window as unknown as { __scenario: LiveTrip[] }).__scenario = SCENARIO;
(window as unknown as { __opened: number[] }).__opened = [];

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/api/trips/live')) return json(current);
  if (url.includes('/api/trips')) return json([]);
  if (url.includes('/api/')) return json({});
  return realFetch(input, init);
}) as typeof fetch;

const ptPos = (x: number, y: number) => ({ left: `${BOUNDS.left + (x / 100) * BOUNDS.width}px`, top: `${BOUNDS.top + (y / 100) * BOUNDS.height}px` });

function Fixture() {
  return (
    <div id="map-area" style={{ position: 'relative', width: 560, height: 430, background: '#0b1220', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', ...{ left: BOUNDS.left, top: BOUNDS.top, width: BOUNDS.width, height: BOUNDS.height },
        background: 'repeating-linear-gradient(0deg,#1e293b 0 1px,transparent 1px 39px),repeating-linear-gradient(90deg,#1e293b 0 1px,transparent 1px 52px),#111827',
      }} />
      <TripLiveLayer
        airfieldId={1} anchor={ANCHOR} points={POINTS} ptPos={ptPos} imgBounds={BOUNDS}
        onOpenTrip={id => (window as unknown as { __opened: number[] }).__opened.push(id)}
      />
      <TripAlertsLayer airfieldId={1} themeMode="dark" onOpenTrip={id => (window as unknown as { __opened: number[] }).__opened.push(id)} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
