// מעקב נסיעה חי במגדל - השכבה על המפה, המנוי המשותף וההתרעות (TRIP_LIVE_TRACKING_SPEC.md §6).
//
// אין jsdom: השכבה נבדקת ברינדור סטטי עם נתונים אמיתיים בצורת /api/trips/live
// (היא רכיב מציג - הנתונים מגיעים מבחוץ), המנוי נבדק כפונקציה, והחיווט בקוד.
// ⚠ renderToStaticMarkup בורח מגרשיים - בודקים נוכחות, לא היעדר מחרוזת עם גרשיים.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LiveTrip } from '../../utils/liveTrips';
import type { MapGeoAnchor } from '../../utils/geo';

const registry = vi.hoisted(() => ({ register: vi.fn(), unregister: vi.fn() }));
vi.mock('../../hooks/usePollingRegistry', () => ({ pollingRegistry: registry, usePolling: vi.fn() }));

const { TripLiveVehicles, detailText } = await import('./TripLiveVehicles');
const { subscribeLiveTrips, __liveTripsSubscriberCount } = await import('../../hooks/useLiveTrips');

// אותו עוגן של בדיקות השרת: x 0..100 ↔ lon 34.60..34.70, y 0..100 ↔ lat 31.30..31.20
const ANCHOR: MapGeoAnchor = { x1: 0, y1: 0, lat1: 31.3, lon1: 34.6, x2: 100, y2: 100, lat2: 31.2, lon2: 34.7 };
const POINTS = [{ id: 20, x_pct: 40, y_pct: 50, name: 'שער ראשי' }];
const ptPos = (x: number, y: number) => ({ left: `${x}%`, top: `${y}%` });

const trip = (over: Partial<LiveTrip> = {}): LiveTrip => ({
  id: 7, status: 'approved', driver_started_at: '2026-09-13T10:00:00Z', ended_at: null,
  from_point_id: 20, vehicle_name: 'מיניבוס',
  route: [
    { lat: 31.25, lon: 34.64, xPct: 40, yPct: 50, routeType: 'vehicle', isCrossing: false },
    { lat: 31.25, lon: 34.66, xPct: 60, yPct: 50, routeType: 'vehicle', isCrossing: false },
  ],
  has_route: true, has_anchor: true,
  position: { lat: 31.25, lng: 34.65, accuracy_m: 8, heading: 90, speed_kmh: 32, fix_at: '2026-09-13T10:05:00Z' },
  stale: false, deviation_m: 4, deviating: false, blocking_element: null,
  ...over,
} as LiveTrip);

/** מיקום הרכב מתוך ה-HTML, כמספרים. ההמרה מנ"צ מחזירה 49.99999999999645 ולא 50 -
 *  נכון מתמטית (הפרש של ננומטרים), ולכן משווים בסבילות ולא כמחרוזת. */
const markerPos = (html: string, id: number) => {
  const m = new RegExp(`live-vehicle-${id}[^>]*left:([\\d.]+)%;top:([\\d.]+)%`).exec(html);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};
const polylinePoints = (html: string, id: number) => {
  const m = new RegExp(`live-route-${id}"[^>]*points="([^"]+)"`).exec(html);
  return m ? m[1].split(' ').map(p => p.split(',').map(Number)) : null;
};

const render = (trips: LiveTrip[], anchor: MapGeoAnchor | null = ANCHOR) =>
  renderToStaticMarkup(<TripLiveVehicles trips={trips} anchor={anchor} points={POINTS} ptPos={ptPos} imgBounds={null} />);

describe('הרכב על המפה', () => {
  it('T1: במיקום ה-GPS - lat/lon מומרים לאחוזי המפה', () => {
    const html = render([trip()]);
    // lon 34.65 → x 50%, lat 31.25 → y 50%
    expect(html).toContain('data-testid="live-vehicle-7"');
    const p = markerPos(html, 7);
    expect(p!.x).toBeCloseTo(50, 6);
    expect(p!.y).toBeCloseTo(50, 6);
  });

  it('T1: שם הרכב, והמהירות בתיאור הצף (התווית של רכב תקין קומפקטית)', () => {
    const html = render([trip()]);
    expect(html).toContain('מיניבוס');
    expect(html).toMatch(/title="[^"]*32/);
  });

  // רכב מתריע אסור שיוסתר מאחורי רכב תקין כשהתוויות חופפות
  it('שכבה לפי חומרה - חסימה מעל סטייה מעל אות אבד מעל ממתין מעל תקין', async () => {
    const { TONE_Z } = await import('./TripLiveVehicles');
    expect(TONE_Z.blocked).toBeGreaterThan(TONE_Z.deviating);
    expect(TONE_Z.deviating).toBeGreaterThan(TONE_Z.stale);
    expect(TONE_Z.stale).toBeGreaterThan(TONE_Z.waiting);
    expect(TONE_Z.waiting).toBeGreaterThan(TONE_Z.normal);
  });

  it('T1: הכיוון מסובב את החץ', () => {
    expect(render([trip()])).toContain('rotate(90deg)');
  });

  it('T1: הנתיב שאושר מצויר', () => {
    const html = render([trip()]);
    expect(html).toContain('data-testid="live-route-7"');
    expect(html).toContain('points="40,50 60,50"');
  });

  it('T5: סוטה - גוון אדום ומרחק', () => {
    const html = render([trip({ deviating: true, deviation_m: 312 })]);
    expect(html).toContain('data-tone="deviating"');
    expect(html).toContain('312');
  });

  it('T7: מול אלמנט סוגר - גוון כתום, שם האלמנט ומצבו', () => {
    const html = render([trip({ blocking_element: { id: 31, name: 'מחסום צפוני', display_state: 'close', state_label: 'סגור', distance_m: 22 } })]);
    expect(html).toContain('data-tone="blocked"');
    expect(html).toContain('מחסום צפוני');
    expect(html).toContain('סגור');
  });

  it('T3: אות אבד', () => {
    const html = render([trip({ stale: true })]);
    expect(html).toContain('data-tone="stale"');
    expect(html).toContain('אות אבד');
  });

  it('T2: הופעלה ועוד אין מיקום - בנקודת המוצא, "ממתין למיקום"', () => {
    const html = render([trip({ position: null, stale: true })]);
    expect(html).toContain('data-tone="waiting"');
    expect(markerPos(html, 7)).toEqual({ x: 40, y: 50 });
    expect(html).toContain('ממתין למיקום');
  });

  it('T9: בלי נתיב שמור - אין קו, והמסך אומר שסטייה לא תזוהה', () => {
    const html = render([trip({ has_route: false, route: [] })]);
    expect(html.includes('live-route-7')).toBe(false);
    expect(html).toContain('אין נתיב שמור');
  });

  it('T10: מפה לא מעוגנת - בנקודת המוצא, עם הסבר', () => {
    const html = render([trip()], null);
    expect(markerPos(html, 7)).toEqual({ x: 40, y: 50 });
    expect(html).toContain('המפה אינה מעוגנת');
    expect(html.includes('live-routes')).toBe(false);
  });

  it('נקודה בנתיב בלי אחוזים - מחושבת מהנ"צ דרך העוגן', () => {
    const html = render([trip({
      route: [
        { lat: 31.25, lon: 34.64, xPct: null, yPct: null, routeType: 'vehicle', isCrossing: false },
        { lat: 31.25, lon: 34.66, xPct: null, yPct: null, routeType: 'vehicle', isCrossing: false },
      ],
    })]);
    const pts = polylinePoints(html, 7)!;
    expect(pts).toHaveLength(2);
    expect(pts[0][0]).toBeCloseTo(40, 6);
    expect(pts[0][1]).toBeCloseTo(50, 6);
    expect(pts[1][0]).toBeCloseTo(60, 6);
  });

  it('אין נסיעות פעילות - לא מרנדר דבר', () => {
    expect(render([])).toBe('');
  });
});

describe('subscribeLiveTrips - סקר אחד לשני צרכנים', () => {
  beforeEach(() => { registry.register.mockClear(); registry.unregister.mockClear(); });

  it('המנוי הראשון רושם את הסקר, השני לא רושם שוב', () => {
    const off1 = subscribeLiveTrips(901, () => {});
    const off2 = subscribeLiveTrips(901, () => {});
    expect(registry.register).toHaveBeenCalledTimes(1);
    expect(__liveTripsSubscriberCount(901)).toBe(2);
    off1(); off2();
  });

  // זה הכשל שהמנוי בא למנוע: register באותו מפתח **מחליף**, ועזיבה של רכיב
  // אחד הייתה עוצרת את העדכונים לשני - רכב שנראה עומד בזמן שהוא נוסע
  it('עזיבת מנוי אחד לא עוצרת את הסקר; רק האחרון מסיר', () => {
    const off1 = subscribeLiveTrips(902, () => {});
    const off2 = subscribeLiveTrips(902, () => {});
    off1();
    expect(registry.unregister).not.toHaveBeenCalled();
    off2();
    expect(registry.unregister).toHaveBeenCalledTimes(1);
    expect(registry.unregister).toHaveBeenCalledWith('trips-live-902');
  });

  it('שדות שונים - סקר נפרד לכל אחד', () => {
    const a = subscribeLiveTrips(903, () => {});
    const b = subscribeLiveTrips(904, () => {});
    expect(registry.register).toHaveBeenCalledTimes(2);
    a(); b();
  });
});

describe('החיווט במגדל', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  const GROUND = read('src/components/views/GroundView.tsx');
  const ALERTS = read('src/components/ground/TripAlertsLayer.tsx');
  const UPCOMING = read('src/components/ground/TripMapVehicles.tsx');

  it('השכבה מורכבת במפה, עם העוגן וגבולות התמונה', () => {
    expect(GROUND).toContain('<TripLiveLayer airfieldId={airfield?.id ?? null} anchor={geoAnchor}');
    expect(GROUND).toContain('imgBounds={imgBounds}');
  });

  // אותו רכב פעמיים: פעם תקוע בשער ופעם בשטח
  it('נסיעה שהופעלה אינה מוצגת גם בשכבת הנסיעות הקרובות', () => {
    expect(UPCOMING).toContain('if (t.driver_started_at && !t.ended_at) return null;');
  });

  it('ההתרעות צורכות את אותו מנוי ואת הנגזרת המשותפת', () => {
    expect(ALERTS).toContain('useLiveTrips(airfieldId)');
    expect(ALERTS).toContain('liveTripAlerts(liveTrips)');
  });

  it('התרעה שנסגרה חוזרת באירוע הבא', () => {
    expect(ALERTS).toContain('pruneDismissedLive(d, active)');
  });

  it('סכנה פיזית בראש הערימה', () => {
    expect(ALERTS).toContain('[...liveAlerts, ...out]');
  });
});

// "תמשיך לשדר גם כשהיא ברקע" - דפדפן לא משדר GPS ברקע, ולכן המגדל אומר *למה*
// הרכב נעלם: "האפליקציה ברקע" שולח את הפקח להתקשר לנהג, "אות אבד" - לחפש תקלה.
describe('האפליקציה ברקע אצל הנהג', () => {
  const bg = { app_background: true, app_background_at: new Date(2026, 8, 19, 14, 5).toISOString() };

  it('אות אבד בזמן שהאפליקציה ברקע - אומר את שניהם, עם השעה', () => {
    const txt = detailText(trip({ stale: true, ...bg }), 'stale', true);
    expect(txt).toContain('ברקע');
    expect(txt).toContain('14:05');
  });

  it('עוד לא אות אבד, אבל ברקע - כבר מסומן', () => {
    expect(detailText(trip(bg), 'normal', true)).toContain('ברקע');
  });

  it('בחזית - הטקסט הרגיל', () => {
    expect(detailText(trip({ stale: true }), 'stale', true)).not.toContain('ברקע');
    expect(detailText(trip(), 'normal', true)).not.toContain('ברקע');
  });
});
