import { describe, it, expect } from 'vitest';
import { pointInPolygon, distToSegment, zoneAtPoint, zoneAtPointOrEdge } from './zoneHit';

// ריבוע 20..40 באחוזי תמונת מפה
const SQUARE = [{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }, { x: 20, y: 40 }];
// ריבוע שני, נפרד
const FAR = [{ x: 70, y: 70 }, { x: 90, y: 70 }, { x: 90, y: 90 }, { x: 70, y: 90 }];

const zones = [{ id: 1, polygon: SQUARE }, { id: 2, polygon: FAR }];

describe('pointInPolygon', () => {
  it('נקודה במרכז - בפנים', () => expect(pointInPolygon(30, 30, SQUARE)).toBe(true));
  it('נקודה מחוץ לריבוע - בחוץ', () => expect(pointInPolygon(50, 30, SQUARE)).toBe(false));
  it('נקודה מעל הריבוע - בחוץ', () => expect(pointInPolygon(30, 10, SQUARE)).toBe(false));
});

describe('distToSegment', () => {
  it('נקודה על הקטע - מרחק 0', () => expect(distToSegment(30, 20, 20, 20, 40, 20)).toBeCloseTo(0));
  it('אנך לאמצע הקטע', () => expect(distToSegment(30, 23, 20, 20, 40, 20)).toBeCloseTo(3));
  it('מעבר לקצה - נמדד מהקצה ולא מהישר האינסופי', () => {
    expect(distToSegment(45, 20, 20, 20, 40, 20)).toBeCloseTo(5);
  });
  it('קטע מנוון (נקודה) - מרחק אוקלידי רגיל', () => {
    expect(distToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });
});

describe('zoneAtPoint', () => {
  it('מחזיר את האזור שהנקודה בתוכו', () => expect(zoneAtPoint(30, 30, zones)?.id).toBe(1));
  it('מחזיר את האזור השני לפי המיקום', () => expect(zoneAtPoint(80, 80, zones)?.id).toBe(2));
  it('null כשהנקודה מחוץ לכל האזורים', () => expect(zoneAtPoint(55, 55, zones)).toBeNull());
  it('מתעלם מפוליגון עם פחות מ-3 נקודות', () => {
    expect(zoneAtPoint(30, 30, [{ id: 9, polygon: [{ x: 20, y: 20 }, { x: 40, y: 40 }] }])).toBeNull();
  });
});

describe('zoneAtPointOrEdge — לחיצה על הקו נחשבת לאזור', () => {
  it('פנים הפוליגון עדיין עובד', () => expect(zoneAtPointOrEdge(30, 30, zones)?.id).toBe(1));
  it('בדיוק על הקו', () => expect(zoneAtPointOrEdge(30, 20, zones)?.id).toBe(1));
  it('ממש מחוץ לקו, בתוך הסובלנות', () => expect(zoneAtPointOrEdge(30, 19.5, zones)?.id).toBe(1));
  it('מחוץ לסובלנות - null', () => expect(zoneAtPointOrEdge(30, 17, zones)).toBeNull());
  it('סובלנות מותאמת מרחיבה את הטווח', () => expect(zoneAtPointOrEdge(30, 17, zones, 4)?.id).toBe(1));
  it('פנים גובר על קו של אזור אחר בטווח', () => {
    // נקודה בתוך A, ובמרחק קטן מהקו של B הצמוד לו
    const a = { id: 1, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };
    const b = { id: 2, polygon: [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }] };
    expect(zoneAtPointOrEdge(9.5, 5, [b, a])?.id).toBe(1);
  });
  it('בוחר את הקו הקרוב ביותר כשיש שניים בטווח', () => {
    const a = { id: 1, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };
    const b = { id: 2, polygon: [{ x: 13, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 13, y: 10 }] };
    expect(zoneAtPointOrEdge(11, 5, [a, b], 3)?.id).toBe(1);
    expect(zoneAtPointOrEdge(12, 5, [a, b], 3)?.id).toBe(2);
  });
});
