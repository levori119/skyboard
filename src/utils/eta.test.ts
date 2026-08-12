import { describe, it, expect } from 'vitest';
import {
  haversineNm, cruiseSpeedKt, etaMinutesFor, computeTransferEta,
  pixelToGeo, stripSavedGeo, stripPinGeo, transferPointGeo, closestGeoOnPolygon,
  ROUTE_FACTOR, SPEED_FIGHTER_KT, SPEED_HELI_TRANSPORT_KT,
  type ImgBounds, type TransferPointMarker, type GeoPoint,
} from './eta';
import type { MapGeoAnchor } from './geo';

describe('haversineNm', () => {
  it('מחזיר 0 לאותה נקודה', () => {
    expect(haversineNm(32, 34, 32, 34)).toBe(0);
  });
  it('מעלה אחת של קו רוחב ≈ 60 מייל ימי', () => {
    expect(haversineNm(32, 34.8, 33, 34.8)).toBeCloseTo(60, 0);
  });
  it('סימטרי בשני הכיוונים', () => {
    expect(haversineNm(32, 34, 32.5, 35)).toBeCloseTo(haversineNm(32.5, 35, 32, 34), 9);
  });
  it('מעלה אחת של קו אורך מתקצרת עם קו הרוחב', () => {
    // בקו רוחב 32° -> cos(32°) ≈ 0.848 -> ~50.9 NM
    expect(haversineNm(32, 34, 32, 35)).toBeCloseTo(60 * Math.cos(32 * Math.PI / 180), 0);
  });
});

describe('cruiseSpeedKt', () => {
  it('מטוס קרב - 350 קשר', () => {
    for (const t of ['f15', 'f16', 'f35', 'jet'] as const) {
      expect(cruiseSpeedKt(t)).toBe(SPEED_FIGHTER_KT);
    }
  });
  it('מסוק - 120 קשר', () => {
    for (const t of ['yasur', 'apache', 'blackhawk', 'naval-blackhawk'] as const) {
      expect(cruiseSpeedKt(t)).toBe(SPEED_HELI_TRANSPORT_KT);
    }
  });
  it('תובלה - 120 קשר', () => {
    for (const t of ['c130', 'b707', 'gulfstream'] as const) {
      expect(cruiseSpeedKt(t)).toBe(SPEED_HELI_TRANSPORT_KT);
    }
  });
  it('כטמ"מ - 120 קשר', () => {
    expect(cruiseSpeedKt('uav')).toBe(SPEED_HELI_TRANSPORT_KT);
  });
  it('סוג מטוס מפורש גובר על טייסת (מסוק אזרחי בלי טייסת מוכרת)', () => {
    expect(cruiseSpeedKt('jet', 'מסוק אזרחי')).toBe(SPEED_HELI_TRANSPORT_KT);
    expect(cruiseSpeedKt('jet', 'תובלה')).toBe(SPEED_HELI_TRANSPORT_KT);
  });
  it('GA - 120 קשר', () => {
    expect(cruiseSpeedKt('jet', 'GA')).toBe(SPEED_HELI_TRANSPORT_KT);
  });
  it('מהירות ייעודית לכל סוג יצירה מהירה', () => {
    expect(cruiseSpeedKt('jet', 'אז"מ')).toBe(90);
    expect(cruiseSpeedKt('jet', 'מרסס')).toBe(80);
    expect(cruiseSpeedKt('jet', 'דאון')).toBe(50);
    expect(cruiseSpeedKt('jet', 'רחפן')).toBe(20);
    expect(cruiseSpeedKt('jet', 'טיסן')).toBe(20);
  });
  it('סוג מטוס ריק לא משנה את הסיווג לפי טייסת', () => {
    expect(cruiseSpeedKt('f16', '')).toBe(SPEED_FIGHTER_KT);
  });
});

describe('etaMinutesFor', () => {
  it('מרחק 0 -> 0 דקות', () => {
    expect(etaMinutesFor(0, SPEED_FIGHTER_KT)).toBe(0);
  });
  it('60 מייל בקרב (350 קשר, +10%) -> 11 דקות', () => {
    // 60 * 1.1 = 66 NM ; 66 / 350 * 60 = 11.31
    expect(etaMinutesFor(60, SPEED_FIGHTER_KT)).toBe(11);
  });
  it('60 מייל במסוק (120 קשר, +10%) -> 33 דקות', () => {
    expect(etaMinutesFor(60, SPEED_HELI_TRANSPORT_KT)).toBe(33);
  });
  it('מרחק זעיר מתעגל למינימום דקה אחת (לא 0)', () => {
    expect(etaMinutesFor(0.3, SPEED_FIGHTER_KT)).toBe(1);
  });
  it('מפעיל את תוספת 10% על הקו הישר', () => {
    const straight = 100 / SPEED_FIGHTER_KT * 60;
    expect(etaMinutesFor(100, SPEED_FIGHTER_KT)).toBe(Math.round(straight * ROUTE_FACTOR));
  });
  it('מרחק שלילי או מהירות לא חוקית -> 0', () => {
    expect(etaMinutesFor(-5, SPEED_FIGHTER_KT)).toBe(0);
    expect(etaMinutesFor(60, 0)).toBe(0);
    expect(etaMinutesFor(NaN, SPEED_FIGHTER_KT)).toBe(0);
  });
});

describe('computeTransferEta', () => {
  const from = { lat: 32, lon: 34.8 };
  const to = { lat: 33, lon: 34.8 }; // ~60 NM צפונה

  it('מחשב מרחק, מהירות וזמן לפ"מ קרב', () => {
    const eta = computeTransferEta(from, to, 'f16');
    expect(eta).not.toBeNull();
    expect(eta!.distanceNm).toBeCloseTo(60, 0);
    expect(eta!.speedKt).toBe(SPEED_FIGHTER_KT);
    expect(eta!.minutes).toBe(11);
  });

  it('אותו מרחק במסוק - זמן ארוך יותר', () => {
    expect(computeTransferEta(from, to, 'yasur')!.minutes).toBe(33);
  });

  it('מחזיר null כשאין נ"צ לפ"מ או לנקודת ההעברה (מפה לא מעוגנת)', () => {
    expect(computeTransferEta(null, to, 'f16')).toBeNull();
    expect(computeTransferEta(from, null, 'f16')).toBeNull();
    expect(computeTransferEta(null, null, 'f16')).toBeNull();
  });

  it('מחזיר null לנ"צ לא תקין', () => {
    expect(computeTransferEta({ lat: NaN, lon: 34 }, to, 'f16')).toBeNull();
    expect(computeTransferEta(from, { lat: 33, lon: Infinity }, 'f16')).toBeNull();
  });

  it('פ"מ שכבר על נקודת ההעברה -> 0 דקות (ולא null)', () => {
    const eta = computeTransferEta(from, from, 'f16');
    expect(eta).not.toBeNull();
    expect(eta!.minutes).toBe(0);
  });
});

// ─── מיקום על המפה → נ"צ ──────────────────────────────────────────────────────
// מפה מעוגנת: פינת התמונה השמאלית-עליונה = 32.5N/34.5E, הימנית-תחתונה = 31.5N/35.5E
const anchor: MapGeoAnchor = { x1: 0, y1: 0, lat1: 32.5, lon1: 34.5, x2: 100, y2: 100, lat2: 31.5, lon2: 35.5 };
const bounds: ImgBounds = { left: 200, top: 100, width: 800, height: 600 };

describe('pixelToGeo', () => {
  it('מרכז התמונה = אמצע העוגנים', () => {
    const g = pixelToGeo(bounds.left + 400, bounds.top + 300, bounds, anchor)!;
    expect(g.lat).toBeCloseTo(32, 6);
    expect(g.lon).toBeCloseTo(35, 6);
  });
  it('מתחשב ב-left/top של התמונה במכל (לא בקואורדינטת חלון גולמית)', () => {
    const g = pixelToGeo(bounds.left, bounds.top, bounds, anchor)!;
    expect(g.lat).toBeCloseTo(32.5, 6);
    expect(g.lon).toBeCloseTo(34.5, 6);
  });
  it('null בלי עוגן (מפה לא מעוגנת) או בלי גבולות תמונה', () => {
    expect(pixelToGeo(500, 300, bounds, null)).toBeNull();
    expect(pixelToGeo(500, 300, null, anchor)).toBeNull();
    expect(pixelToGeo(500, 300, { left: 0, top: 0, width: 0, height: 0 }, anchor)).toBeNull();
  });
});

describe('stripSavedGeo / stripPinGeo', () => {
  it('מעדיף נ"צ שמור בפ"מ', () => {
    expect(stripSavedGeo({ map_lat: 32.1, map_lon: 34.9 })).toEqual({ lat: 32.1, lon: 34.9 });
  });
  it('null לפ"מ שאינו על המפה', () => {
    expect(stripSavedGeo({ map_lat: null, map_lon: null })).toBeNull();
    expect(stripSavedGeo(null)).toBeNull();
    expect(stripPinGeo({}, bounds, anchor)).toBeNull();
  });
  it('גוזר נ"צ מהפין כשאין נ"צ שמור', () => {
    const g = stripPinGeo({ map_pin_x: bounds.left + 400, map_pin_y: bounds.top + 300 }, bounds, anchor)!;
    expect(g.lat).toBeCloseTo(32, 6);
    expect(g.lon).toBeCloseTo(35, 6);
  });
});

describe('transferPointGeo', () => {
  const pins: TransferPointMarker[] = [
    { sectorId: 7, x: bounds.left + 200, y: bounds.top + 150, subLabel: undefined, lat: null, lon: null },
    { sectorId: 9, x: bounds.left + 600, y: bounds.top + 450, subLabel: 'צפון', lat: 31.8, lon: 35.2 },
    { sectorId: 9, x: bounds.left + 100, y: bounds.top + 100, subLabel: 'דרום', lat: 31.6, lon: 34.7 },
  ];

  it('מעדיף את הנ"צ השמור בנקודה', () => {
    expect(transferPointGeo(pins, 9, 'צפון', bounds, anchor)).toEqual({ lat: 31.8, lon: 35.2 });
  });
  it('בוחר את תת-הנקודה הנכונה', () => {
    expect(transferPointGeo(pins, 9, 'דרום', bounds, anchor)).toEqual({ lat: 31.6, lon: 34.7 });
  });
  it('בלי תת-נקודה - הנקודה הראשונה של הסקטור', () => {
    expect(transferPointGeo(pins, 9, undefined, bounds, anchor)).toEqual({ lat: 31.8, lon: 35.2 });
  });
  it('תת-נקודה שלא נמצאה - נופל לנקודת הסקטור', () => {
    expect(transferPointGeo(pins, 9, 'לא קיים', bounds, anchor)).toEqual({ lat: 31.8, lon: 35.2 });
  });
  it('בלי נ"צ שמור - גוזר מהמיקום על המפה', () => {
    const g = transferPointGeo(pins, 7, undefined, bounds, anchor)!;
    expect(g.lat).toBeCloseTo(32.25, 6);   // 25% מגובה התמונה
    expect(g.lon).toBeCloseTo(34.75, 6);   // 25% מרוחב התמונה
  });
  it('ערך ≤1.5 מתפרש כשבר של המכל ולא כפיקסלים', () => {
    const frac: TransferPointMarker[] = [{ sectorId: 3, x: 0.25, y: 0.25 }];
    const g = transferPointGeo(frac, 3, undefined, bounds, anchor)!;
    expect(g.lat).toBeCloseTo(32.25, 6);
    expect(g.lon).toBeCloseTo(34.75, 6);
  });
  it('null כשאין נקודה לסקטור', () => {
    expect(transferPointGeo(pins, 42, undefined, bounds, anchor)).toBeNull();
    expect(transferPointGeo([], 7, undefined, bounds, anchor)).toBeNull();
  });
  it('נקודה בלי נ"צ על מפה לא מעוגנת -> null (ולא זמן שגוי)', () => {
    expect(transferPointGeo(pins, 7, undefined, bounds, null)).toBeNull();
  });
});

describe('closestGeoOnPolygon', () => {
  // ריבוע: קווי רוחב 31.9-32.1, קווי אורך 34.9-35.1
  const square: GeoPoint[] = [
    { lat: 32.1, lon: 34.9 }, { lat: 32.1, lon: 35.1 },
    { lat: 31.9, lon: 35.1 }, { lat: 31.9, lon: 34.9 },
  ];

  it('יעד ממזרח - הנקודה הקרובה היא על הצלע המזרחית, באותו קו רוחב', () => {
    const p = closestGeoOnPolygon(square, { lat: 32.0, lon: 35.5 })!;
    expect(p.lon).toBeCloseTo(35.1, 3);
    expect(p.lat).toBeCloseTo(32.0, 3);
  });

  it('יעד מצפון - הנקודה הקרובה על הצלע הצפונית', () => {
    const p = closestGeoOnPolygon(square, { lat: 32.6, lon: 35.0 })!;
    expect(p.lat).toBeCloseTo(32.1, 3);
    expect(p.lon).toBeCloseTo(35.0, 3);
  });

  it('יעד באלכסון - הנקודה הקרובה היא הפינה', () => {
    const p = closestGeoOnPolygon(square, { lat: 32.6, lon: 35.6 })!;
    expect(p.lat).toBeCloseTo(32.1, 3);
    expect(p.lon).toBeCloseTo(35.1, 3);
  });

  it('יעד בתוך האזור - מרחק 0 (הפ"מ כבר שם)', () => {
    const target = { lat: 32.0, lon: 35.0 };
    expect(closestGeoOnPolygon(square, target)).toEqual(target);
  });

  it('מודד לצלע ולא רק לקודקודים', () => {
    // יעד ממש ממערב לאמצע הצלע המערבית: הקודקודים רחוקים יותר מהצלע
    const p = closestGeoOnPolygon(square, { lat: 32.0, lon: 34.5 })!;
    const toEdge = haversineNm(32.0, 34.5, p.lat, p.lon);
    const toCorner = haversineNm(32.0, 34.5, 32.1, 34.9);
    expect(toEdge).toBeLessThan(toCorner);
    expect(p.lat).toBeCloseTo(32.0, 3);
  });

  it('פוליגון ריק או לא תקין -> null', () => {
    expect(closestGeoOnPolygon([], { lat: 32, lon: 35 })).toBeNull();
    expect(closestGeoOnPolygon([{ lat: NaN, lon: 35 }], { lat: 32, lon: 35 })).toBeNull();
  });

  it('קודקוד בודד -> הקודקוד עצמו', () => {
    expect(closestGeoOnPolygon([{ lat: 32.1, lon: 34.9 }], { lat: 32, lon: 35 }))
      .toEqual({ lat: 32.1, lon: 34.9 });
  });

  it('הטווח מהאזור קצר מהטווח ממרכזו', () => {
    const dest = { lat: 32.0, lon: 35.5 };
    const edge = closestGeoOnPolygon(square, dest)!;
    const fromEdge = haversineNm(edge.lat, edge.lon, dest.lat, dest.lon);
    const fromCenter = haversineNm(32.0, 35.0, dest.lat, dest.lon);
    expect(fromEdge).toBeLessThan(fromCenter);
    expect(fromEdge).toBeCloseTo(20.4, 0);   // 0.4° אורך ב-32°N
  });
});

// שרשור מלא: פ"מ על מפה מעוגנת -> נקודת העברה -> דקות
describe('חישוב מקצה לקצה על מפה מעוגנת', () => {
  it('פ"מ במרכז המפה לנקודה בפינה — טווח וזמן סבירים', () => {
    const strip = stripSavedGeo({ map_lat: 32, map_lon: 35 })!;
    const dest = transferPointGeo(
      [{ sectorId: 5, x: bounds.left, y: bounds.top }], 5, undefined, bounds, anchor,
    )!;
    const eta = computeTransferEta(strip, dest, 'f16')!;
    // ~30 מייל צפונה + ~25 מייל מערבה => ~40 NM
    expect(eta.distanceNm).toBeGreaterThan(35);
    expect(eta.distanceNm).toBeLessThan(45);
    expect(eta.minutes).toBe(etaMinutesFor(eta.distanceNm, SPEED_FIGHTER_KT));
    expect(eta.minutes).toBeGreaterThan(5);
    expect(eta.minutes).toBeLessThan(10);
  });
});
