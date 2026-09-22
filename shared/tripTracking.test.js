// מעקב נסיעה חי - הלוגיקה הטהורה (TRIP_LIVE_TRACKING_SPEC.md).
//
// אותו מודול רץ בשרת (הערכת סטייה וחסימה), באפליקציית הנהג (התרעות מקומיות)
// ובמגדל (מיקום הרכב על המפה). באג כאן הוא התרעה שלא עולה ליד מסלול טיסה,
// או התרעת שווא שהפקח לומד להתעלם ממנה - ולכן הספים והגאומטריה מקובעים כאן.
import { describe, it, expect } from 'vitest';
import {
  anchorFrom, pctToLatLon, latLonToPct, metersToSegment, metersToPolyline,
  DISPLAY_STATE_LABEL, effectiveBlockingStatuses, isElementBlocking,
  nextDeviationStreak, isDeviating, roadControlElements, compactWaypoints, findHazards, cooldownOver, nextAlertState,
  nearOpenElements,
  RUNWAY_ALERT_M, TAXIWAY_ALERT_M, ELEMENT_ALERT_M, DEVIATION_M, DEVIATION_STREAK,
  ROUTE_CORRIDOR_M, MAX_ACCURACY_M, STALE_FIX_MS, ALERT_COOLDOWN_MS, isFixStale,
} from './tripTracking.js';
import { distanceMeters } from './driverLogic.js';
import { compactRouteWaypoints } from '../src/utils/trips.ts';

// עוגן אמיתי בערך: שדה בנגב. שתי פינות התמונה.
const ROW = {
  anchor1_x_img: 0, anchor1_y_img: 0, anchor1_lat: 31.300, anchor1_lon: 34.600,
  anchor2_x_img: 100, anchor2_y_img: 100, anchor2_lat: 31.200, anchor2_lon: 34.700,
};
const A = anchorFrom(ROW);

describe('הספים - הכרעות אורי 2026-09-13', () => {
  it('נהג: מסלול טיסה 150, הסעה 100, אלמנט 50', () => {
    expect(RUNWAY_ALERT_M).toBe(150);
    expect(TAXIWAY_ALERT_M).toBe(100);
    expect(ELEMENT_ALERT_M).toBe(50);
  });
  it('מגדל: סטייה 200 מ\', שתי קריאות רצופות', () => {
    expect(DEVIATION_M).toBe(200);
    expect(DEVIATION_STREAK).toBe(2);
  });
  it('ספים טכניים', () => {
    expect(ROUTE_CORRIDOR_M).toBe(40);
    expect(MAX_ACCURACY_M).toBe(100);
    expect(STALE_FIX_MS).toBe(60_000);
    expect(ALERT_COOLDOWN_MS).toBe(60_000);
  });
});

describe('anchorFrom - עוגן משורת מפה או שדה', () => {
  it('בונה עוגן משורה מלאה', () => {
    expect(A).toEqual({ x1: 0, y1: 0, lat1: 31.3, lon1: 34.6, x2: 100, y2: 100, lat2: 31.2, lon2: 34.7 });
  });
  it('שורה חסרה או ריקה - null', () => {
    expect(anchorFrom(null)).toBeNull();
    expect(anchorFrom({})).toBeNull();
    expect(anchorFrom({ ...ROW, anchor2_lat: null })).toBeNull();
  });
  // שתי נקודות עוגן זהות בציר - חלוקה באפס, ומיקום שגוי בשקט
  it('עוגן מנוון (שתי נקודות על אותו ציר) - null', () => {
    expect(anchorFrom({ ...ROW, anchor2_x_img: 0 })).toBeNull();
    expect(anchorFrom({ ...ROW, anchor2_lat: 31.3 })).toBeNull();
  });
  it('ערכים מה-DB כמחרוזות', () => {
    const a = anchorFrom({ ...ROW, anchor1_lat: '31.3', anchor2_x_img: '100' });
    expect(a.lat1).toBe(31.3);
    expect(a.x2).toBe(100);
  });
});

describe('המרת נ"צ ↔ אחוזי מפה', () => {
  it('פינות העוגן חוזרות לעצמן', () => {
    expect(pctToLatLon(0, 0, A)).toEqual({ lat: 31.3, lon: 34.6 });
    const p = latLonToPct(31.2, 34.7, A);
    expect(p.x).toBeCloseTo(100, 9);
    expect(p.y).toBeCloseTo(100, 9);
  });
  it('אמצע התמונה = אמצע הנ"צ', () => {
    const g = pctToLatLon(50, 50, A);
    expect(g.lat).toBeCloseTo(31.25, 9);
    expect(g.lon).toBeCloseTo(34.65, 9);
  });
  it('הלוך-חזור שומר את הנקודה', () => {
    const g = pctToLatLon(37.2, 81.9, A);
    const p = latLonToPct(g.lat, g.lon, A);
    expect(p.x).toBeCloseTo(37.2, 9);
    expect(p.y).toBeCloseTo(81.9, 9);
  });
  // Number(null) === 0: אלמנט בלי מיקום נחת בפינת המפה במקום להיות מדולג
  it('אחוזים חסרים (null / ריק) - null ולא פינת המפה', () => {
    expect(pctToLatLon(null, null, A)).toBeNull();
    expect(pctToLatLon('', 50, A)).toBeNull();
    expect(pctToLatLon(50, undefined, A)).toBeNull();
    expect(pctToLatLon(0, 0, A)).toEqual({ lat: 31.3, lon: 34.6 });
  });
  it('בלי עוגן - null ולא נקודה מומצאת', () => {
    expect(pctToLatLon(50, 50, null)).toBeNull();
    expect(latLonToPct(31.25, 34.65, null)).toBeNull();
  });
  // נקודה מחוץ לתמונה (הרכב יצא מגבולות המפה) היא עדיין מיקום אמיתי
  it('נ"צ מחוץ לתמונה מחזיר אחוזים מחוץ ל-0..100 ולא נחתך', () => {
    const p = latLonToPct(31.35, 34.55, A);
    expect(p.x).toBeLessThan(0);
    expect(p.y).toBeLessThan(0);
  });
});

describe('מרחק במטרים מקטע ומקו שבור', () => {
  const lat = 31.25;
  const a = { lat: 31.24, lon: 34.65 };
  const b = { lat: 31.26, lon: 34.65 };

  it('נקודה על המקטע - 0', () => {
    expect(metersToSegment({ lat, lon: 34.65 }, a, b)).toBeCloseTo(0, 3);
  });

  // מול haversine עצמאי: נקודה מזרחית לקו אורך, בניצב
  it('מרחק ניצב תואם haversine בדיוק של פחות ממטר', () => {
    const p = { lat, lon: 34.652 };
    const expected = distanceMeters(lat, 34.65, lat, 34.652);
    expect(expected).toBeGreaterThan(180);
    expect(Math.abs(metersToSegment(p, a, b) - expected)).toBeLessThan(1);
  });

  // מעבר לקצה המקטע המרחק הוא לנקודת הקצה ולא לקו האינסופי
  it('מעבר לקצה - המרחק לנקודת הקצה', () => {
    const p = { lat: 31.27, lon: 34.65 };
    const expected = distanceMeters(31.27, 34.65, b.lat, b.lon);
    expect(Math.abs(metersToSegment(p, a, b) - expected)).toBeLessThan(1);
  });

  it('מקטע באורך אפס - מרחק לנקודה', () => {
    const p = { lat, lon: 34.652 };
    expect(Math.abs(metersToSegment(p, a, a) - distanceMeters(lat, 34.652, a.lat, a.lon))).toBeLessThan(1);
  });

  it('קו שבור: המקטע הקרוב ביותר, עם האינדקס שלו', () => {
    const line = [{ lat: 31.24, lon: 34.64 }, { lat: 31.24, lon: 34.66 }, { lat: 31.26, lon: 34.66 }];
    const r = metersToPolyline({ lat: 31.25, lon: 34.6605 }, line);
    expect(r.index).toBe(1);
    expect(r.meters).toBeLessThan(60);
  });

  it('קו ריק או נקודה אחת', () => {
    expect(metersToPolyline({ lat, lon: 34.65 }, [])).toBeNull();
    expect(metersToPolyline({ lat, lon: 34.65 }, null)).toBeNull();
    const one = metersToPolyline({ lat, lon: 34.652 }, [{ lat, lon: 34.65 }]);
    expect(one.index).toBe(0);
    expect(Math.abs(one.meters - distanceMeters(lat, 34.652, lat, 34.65))).toBeLessThan(1);
  });

  it('נקודות לא תקינות בקו מדולגות', () => {
    const r = metersToPolyline({ lat, lon: 34.65 }, [{ lat: null, lon: 1 }, a, b]);
    expect(r.meters).toBeCloseTo(0, 3);
  });
});

describe('אלמנט סוגר את הדרך - כלל אחד', () => {
  it('תווית המצב התפעולי', () => {
    expect(DISPLAY_STATE_LABEL).toMatchObject({ close: 'סגור', stop: 'עצור', blink: 'מנצנץ', off: 'כבוי', go: 'עבור', open: 'פתוח' });
  });

  it('blocking_statuses מפורש גובר', () => {
    expect(effectiveBlockingStatuses({ blocking_statuses: ['עצור'], category: 'מחסומים' })).toEqual(['עצור']);
  });

  // אותן ברירות מחדל כמו /api/live-runway-conflicts
  it('ריק - ברירת המחדל לקטגוריה', () => {
    expect(effectiveBlockingStatuses({ category: 'מחסומים' })).toEqual(['סגור']);
    expect(effectiveBlockingStatuses({ category: 'רמזורים' })).toEqual(['מנצנץ']);
    expect(effectiveBlockingStatuses({ category: 'STOP BAR' })).toEqual(['מנצנץ']);
  });

  it('ריק ואין ברירת מחדל - הסטטוס המותר הראשון', () => {
    expect(effectiveBlockingStatuses({ category: 'אחר', type_allowed_statuses: ['סגור', 'פתוח'] })).toEqual(['סגור']);
  });

  it('JSON כמחרוזת מה-DB', () => {
    expect(effectiveBlockingStatuses({ blocking_statuses: '["עצור"]' })).toEqual(['עצור']);
  });

  it('מחסום סגור חוסם, פתוח לא', () => {
    expect(isElementBlocking({ category: 'מחסומים', display_state: 'close', status: 'שמיש' })).toBe(true);
    expect(isElementBlocking({ category: 'מחסומים', display_state: 'open', status: 'שמיש' })).toBe(false);
  });

  it('רמזור אדום (stop) חוסם כשזה הסטטוס החוסם', () => {
    const light = { blocking_statuses: ['עצור'], display_state: 'stop', status: 'שמיש' };
    expect(isElementBlocking(light)).toBe(true);
    expect(isElementBlocking({ ...light, display_state: 'go' })).toBe(false);
  });

  // מחסום שבור אינו יכול להיסגר - כמו חלון הניווט במגדל
  it('אלמנט "לא שמיש" אינו חוסם גם במצב חוסם', () => {
    expect(isElementBlocking({ category: 'מחסומים', display_state: 'close', status: 'לא שמיש' })).toBe(false);
  });

  it('גם סטטוס הכשירות נבדק מול הרשימה', () => {
    expect(isElementBlocking({ blocking_statuses: ['סגור'], display_state: 'normal', status: 'סגור' })).toBe(true);
  });

  it('אין רשימה ואין ברירת מחדל - אינו חוסם', () => {
    expect(isElementBlocking({ category: 'כללי', display_state: 'close' })).toBe(false);
  });
});

describe('סטייה מהנתיב - שתי קריאות רצופות', () => {
  it('קריאה אחת מעל 200 - מונה 1, עוד לא סטייה', () => {
    const s = nextDeviationStreak(0, 250, 10);
    expect(s).toBe(1);
    expect(isDeviating(s)).toBe(false);
  });
  it('שתי קריאות רצופות - סטייה', () => {
    expect(isDeviating(nextDeviationStreak(nextDeviationStreak(0, 250, 10), 260, 10))).toBe(true);
  });
  it('חזרה לנתיב מאפסת', () => {
    expect(nextDeviationStreak(5, 30, 10)).toBe(0);
  });
  it('בדיוק 200 אינו סטייה', () => {
    expect(nextDeviationStreak(1, 200, 10)).toBe(0);
  });
  // קפיצת GPS עם דיוק גרוע לא מקדמת ולא מאפסת
  it('קריאה בדיוק גרוע מ-100 מ\' אינה נספרת - המונה נשאר', () => {
    expect(nextDeviationStreak(1, 900, 150)).toBe(1);
    expect(nextDeviationStreak(1, 10, 150)).toBe(1);
  });
  it('בלי מרחק (אין נתיב) - אין סטייה לעולם', () => {
    expect(nextDeviationStreak(3, null, 10)).toBe(0);
  });
});

// זה קרה בשדה: הרמזורים והמחסומים עמדו 200 מ' ויותר מהנתיב שאושר, ואחרי
// שהפרוזדור סינן אותם הנהג קיבל מפה בלי אף אלמנט - ובנסיעה בלי נתיב שמור, בלי
// אלמנטים בכלל. אלמנטי השליטה בתנועה מוצגים תמיד, והנתיב רק מסמן מי עליו.
describe('roadControlElements - רמזורים, מחסומים ו-STOP BAR בשדה', () => {
  const route = [{ lat: 31.25, lon: 34.64 }, { lat: 31.25, lon: 34.66 }];
  const at = (lat, lon) => latLonToPct(lat, lon, A);
  const el = (id, category, lat, lon, extra = {}) => {
    const p = at(lat, lon);
    return { id, name: `א${id}`, category, x_pct: p.x, y_pct: p.y, ...extra };
  };
  const near = el(1, 'מחסומים', 31.2502, 34.65);
  const far = el(2, 'רמזורים', 31.26, 34.65);          // ~1.1 ק"מ
  const stopBar = el(3, 'STOP BAR', 31.2501, 34.645);
  const cam = el(4, 'camera', 31.25, 34.65);
  const vehicle = el(5, 'כלי רכב', 31.25, 34.65);
  const office = el(6, 'מקטם מנהלתי', 31.25, 34.65); // אין לו מצב שסוגר דרך
  const typed = el(7, 'שער', 31.2502, 34.651, { type_allowed_statuses: ['פתוח', 'סגור'] });

  it('כל אלמנט שיכול לסגור דרך - גם רחוק מהנתיב', () => {
    const r = roadControlElements([near, far, stopBar, typed], route, A);
    expect(r.map(e => e.id)).toEqual([1, 2, 3, 7]);
  });

  it('on_route מסמן רק את מי שבתוך הפרוזדור, עם המרחק', () => {
    const r = Object.fromEntries(roadControlElements([near, far], route, A).map(e => [e.id, e]));
    expect(r[1].on_route).toBe(true);
    expect(r[1].route_distance_m).toBeLessThan(ROUTE_CORRIDOR_M);
    expect(r[2].on_route).toBe(false);
    expect(r[2].route_distance_m).toBeGreaterThan(1000);
    expect(r[1].lat).toBeCloseTo(31.2502, 6);
  });

  it('מצלמות, כלי רכב ואלמנט בלי מצב סוגר - לא', () => {
    expect(roadControlElements([cam, vehicle, office], route, A)).toEqual([]);
  });

  // D2: נסיעה בלי נתיב שמור - האלמנטים עדיין על המפה
  it('בלי נתיב - כולם, בלי on_route ובלי מרחק', () => {
    const r = roadControlElements([near, far], [], A);
    expect(r.map(e => [e.id, e.on_route, e.route_distance_m])).toEqual([[1, false, null], [2, false, null]]);
  });

  it('בלי עוגן - אין, ואלמנט בלי מיקום מדולג', () => {
    expect(roadControlElements([near], route, null)).toEqual([]);
    expect(roadControlElements([{ id: 9, category: 'מחסומים', x_pct: null, y_pct: null }], route, A)).toEqual([]);
  });
});

describe('findHazards - מה קרוב לנהג עכשיו', () => {
  const pos = { lat: 31.25, lon: 34.65, accuracy: 8 };
  const runwayNear = { id: 11, name: '26L', line: [{ lat: 31.2512, lon: 34.64 }, { lat: 31.2512, lon: 34.66 }] }; // ~133 מ'
  const runwayFar = { id: 12, name: '08R', line: [{ lat: 31.2530, lon: 34.64 }, { lat: 31.2530, lon: 34.66 }] }; // ~333 מ'
  const taxiNear = { id: 21, name: 'A', line: [{ lat: 31.2508, lon: 34.64 }, { lat: 31.2508, lon: 34.66 }] }; // ~89 מ'
  const closedBarrier = { id: 31, name: 'מחסום צפוני', category: 'מחסומים', display_state: 'close', status: 'שמיש', lat: 31.2503, lon: 34.65 }; // ~33 מ'
  const openBarrier = { ...closedBarrier, id: 32, name: 'מחסום פתוח', display_state: 'open' };

  it('מסלול טיסה בתוך 150 מ\' - התרעה; מעבר - לא', () => {
    const h = findHazards(pos, { runways: [runwayNear, runwayFar], taxiways: [], elements: [] });
    expect(h.map(x => x.key)).toEqual(['runway:11']);
    expect(h[0].kind).toBe('runway');
    expect(h[0].meters).toBeLessThan(RUNWAY_ALERT_M);
  });

  it('מסלול הסעה בתוך 100 מ\'', () => {
    const h = findHazards(pos, { runways: [], taxiways: [taxiNear], elements: [] });
    expect(h.map(x => x.key)).toEqual(['taxiway:21']);
  });

  // הכרעת אורי: רק כשהאלמנט סוגר את הדרך
  it('אלמנט סוגר בתוך 50 מ\' - התרעה; אותו אלמנט פתוח - לא', () => {
    const h = findHazards(pos, { runways: [], taxiways: [], elements: [closedBarrier, openBarrier] });
    expect(h.map(x => x.key)).toEqual(['element:31']);
  });

  it('כמה סכנות - הקרובה ראשונה', () => {
    const h = findHazards(pos, { runways: [runwayNear], taxiways: [taxiNear], elements: [closedBarrier] });
    expect(h.map(x => x.kind)).toEqual(['element', 'taxiway', 'runway']);
  });

  it('דיוק גרוע - אין התרעות', () => {
    expect(findHazards({ ...pos, accuracy: 150 }, { runways: [runwayNear], taxiways: [], elements: [] })).toEqual([]);
  });

  it('בלי מיקום או בלי נתונים - ריק', () => {
    expect(findHazards(null, { runways: [runwayNear] })).toEqual([]);
    expect(findHazards(pos, {})).toEqual([]);
  });
});

describe('השתקה והתיישנות', () => {
  const NOW = 1_000_000;
  it('התרעה ראשונה - מותרת', () => {
    expect(cooldownOver('runway:1', {}, NOW)).toBe(true);
  });
  it('בתוך 60 ש\' - מושתקת; אחרי - שוב מותרת', () => {
    expect(cooldownOver('runway:1', { 'runway:1': NOW - 30_000 }, NOW)).toBe(false);
    expect(cooldownOver('runway:1', { 'runway:1': NOW - 61_000 }, NOW)).toBe(true);
  });
  it('קריאה בת יותר מ-60 ש\' - אות אבד', () => {
    expect(isFixStale(new Date(NOW - 61_000).toISOString(), NOW)).toBe(true);
    expect(isFixStale(new Date(NOW - 5_000).toISOString(), NOW)).toBe(false);
    expect(isFixStale(null, NOW)).toBe(true);
  });
});

// רמזור שנהיה ירוק כשהנהג עומד מולו: ההתרעה נעלמה מהמסך בשקט, והנהג נשאר לנחש
// אם מותר לו לנסוע. "נפתח" הוא אירוע בפני עצמו (בקשת אורי, 2026-09-22).
describe('nearOpenElements - אלמנטים קרובים שאינם סוגרים', () => {
  const at = (lat, lon) => ({ lat, lon });
  const EL = (id, blocking) => ({
    id, name: `רמזור ${id}`, lat: 31.25, lon: 34.65, category: 'רמזורים',
    display_state: blocking ? 'close' : 'open', blocking_statuses: ['סגור'],
  });

  it('אלמנט פתוח בטווח - מוחזר', () => {
    const r = nearOpenElements(at(31.25, 34.65), { elements: [EL(1, false)] });
    expect(r.map(h => h.key)).toEqual(['element:1']);
  });

  it('אלמנט סוגר אינו "פתוח" - הוא סכנה, ומקומו ב-findHazards', () => {
    expect(nearOpenElements(at(31.25, 34.65), { elements: [EL(1, true)] })).toEqual([]);
  });

  it('אלמנט פתוח רחוק מהטווח - לא מוחזר', () => {
    const far = { ...EL(1, false), lat: 31.28 };
    expect(nearOpenElements(at(31.25, 34.65), { elements: [far] })).toEqual([]);
  });

  it('דיוק גרוע - אין כלום, כמו בהתרעות', () => {
    expect(nearOpenElements({ lat: 31.25, lon: 34.65, accuracy: 300 }, { elements: [EL(1, false)] })).toEqual([]);
  });
});

describe('nextAlertState - "נפתח": האלמנט שהתריע כבר לא סוגר והנהג עדיין מולו', () => {
  const H = key => ({ key, kind: key.split(':')[0], id: 1, name: 'רמזור', meters: 10 });
  const T0 = 1_000_000;
  const EMPTY = { inside: [], lastAt: {} };

  it('סגור -> פתוח והנהג עדיין קרוב: התרעת "נפתח"', () => {
    const s1 = nextAlertState([H('element:1')], EMPTY, T0).state;
    const r = nextAlertState([], s1, T0 + 5_000, [H('element:1')]);
    expect(r.toClear.map(h => h.key)).toEqual(['element:1']);
  });

  it('הנהג פשוט נסע משם - אין "נפתח"', () => {
    const s1 = nextAlertState([H('element:1')], EMPTY, T0).state;
    const r = nextAlertState([], s1, T0 + 5_000, []);
    expect(r.toClear).toEqual([]);
  });

  it('אלמנט שלא התריע ונפתח - אין "נפתח" (לא היה על מה להרגיע)', () => {
    const r = nextAlertState([], EMPTY, T0, [H('element:1')]);
    expect(r.toClear).toEqual([]);
  });

  it('"נפתח" אינו חוזר כל עוד הוא פתוח', () => {
    const s1 = nextAlertState([H('element:1')], EMPTY, T0).state;
    const s2 = nextAlertState([], s1, T0 + 5_000, [H('element:1')]).state;
    expect(nextAlertState([], s2, T0 + 10_000, [H('element:1')]).toClear).toEqual([]);
  });

  it('האדים שוב מיד אחרי שנפתח - מתריע, בלי להמתין להשתקה', () => {
    const s1 = nextAlertState([H('element:1')], EMPTY, T0).state;
    const s2 = nextAlertState([], s1, T0 + 5_000, [H('element:1')]).state;
    const r = nextAlertState([H('element:1')], s2, T0 + 8_000);
    expect(r.toAlert.map(h => h.key)).toEqual(['element:1']);
  });

  it('בלי הפרמטר החדש - ההתנהגות הישנה, בלי toClear', () => {
    const s1 = nextAlertState([H('element:1')], EMPTY, T0).state;
    const r = nextAlertState([], s1, T0 + 5_000);
    expect(r.toClear).toEqual([]);
    expect(r.toAlert).toEqual([]);
  });
});

// נתיב שהמגדל אישר **לאורך** מסלול הסעה היה מתריע כל דקה לכל אורך הנסיעה.
// הכלל: התרעה ב**כניסה** לאזור. בתוכו - שקט. יציאה וכניסה חוזרת - שוב, בכפוף להשתקה.
describe('nextAlertState - התרעה בכניסה לאזור, לא כל עוד בתוכו', () => {
  const H = key => ({ key, kind: key.split(':')[0], id: 1, name: 'x', meters: 10 });
  const T0 = 1_000_000;
  const EMPTY = { inside: [], lastAt: {} };

  it('כניסה לאזור - התרעה', () => {
    const r = nextAlertState([H('taxiway:1')], EMPTY, T0);
    expect(r.toAlert.map(h => h.key)).toEqual(['taxiway:1']);
    expect(r.state.inside).toEqual(['taxiway:1']);
  });

  it('נשאר בתוך האזור - אין התרעה נוספת, גם אחרי יותר מ-60 שניות', () => {
    const s1 = nextAlertState([H('taxiway:1')], EMPTY, T0).state;
    const r = nextAlertState([H('taxiway:1')], s1, T0 + 5 * 60_000);
    expect(r.toAlert).toEqual([]);
  });

  it('יצא וחזר אחרי ההשתקה - מתריע שוב', () => {
    const s1 = nextAlertState([H('taxiway:1')], EMPTY, T0).state;
    const s2 = nextAlertState([], s1, T0 + 10_000).state;
    const r = nextAlertState([H('taxiway:1')], s2, T0 + 70_000);
    expect(r.toAlert.map(h => h.key)).toEqual(['taxiway:1']);
  });

  it('יצא וחזר בתוך ההשתקה - שקט, אבל נרשם שהוא בפנים', () => {
    const s1 = nextAlertState([H('taxiway:1')], EMPTY, T0).state;
    const s2 = nextAlertState([], s1, T0 + 5_000).state;
    const r = nextAlertState([H('taxiway:1')], s2, T0 + 20_000);
    expect(r.toAlert).toEqual([]);
    expect(r.state.inside).toEqual(['taxiway:1']);
  });

  // רמזור שהאדים כשהרכב כבר 30 מ' ממנו: הוא לא היה סכנה קודם, ולכן זו כניסה
  it('אלמנט שהפך לסוגר כשהרכב כבר קרוב - מתריע', () => {
    const s1 = nextAlertState([H('taxiway:1')], EMPTY, T0).state;
    const r = nextAlertState([H('taxiway:1'), H('element:7')], s1, T0 + 5_000);
    expect(r.toAlert.map(h => h.key)).toEqual(['element:7']);
  });

  it('מצב ריק או חסר - מתנהג כהתחלה', () => {
    expect(nextAlertState([H('runway:2')], undefined, T0).toAlert).toHaveLength(1);
  });
});

// הלקוח שומר את הנתיב באישור (compactRouteWaypoints), והשרת משלים נתיב לנסיעה
// ישנה (compactWaypoints). צורה שונה = נתיב שהשרת השלים נקרא אחרת מנתיב שהפקח שמר.
describe('compactWaypoints - אותה צורה כמו בלקוח', () => {
  const samples = [
    [{ lat: 31.25, lon: 34.65, xPct: 50, yPct: 50, routeType: 'taxiway', isCrossing: true, instruction: 'פנה', nodeId: 'n7' }],
    [{ instruction: 'x' }, { lat: 31.2, lon: 34.6 }],
    [{ x: 40, y: 50 }],
    [{ lat: 31.2, lng: 34.6 }],
    [{ lat: 31.2, lon: 34.6, isStop: true, stopName: 'תחנה' }, { lat: 31.3, lon: 34.6, isStop: false }],
    [{ lat: '31.2', lon: '34.6', routeType: '', isCrossing: 'true' }],
    [{ lat: null, lon: 34.6, xPct: 10, yPct: '' }],
    null,
    'x',
  ];
  it.each(samples.map((x, i) => [i, x]))('דוגמה %i', (_i, raw) => {
    expect(compactWaypoints(raw)).toEqual(compactRouteWaypoints(raw));
  });
});
