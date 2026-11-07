import { describe, it, expect } from 'vitest';
import { zoneArrivalPhase, arrivalAckAfterStatus, zoneCornerPoint, enrouteStackIndex } from './zoneArrival';

describe('zoneArrivalPhase', () => {
  const base = { hasZone: true, airborne: true, status: 'בדרך לאזור', ack: true };

  it('לפני המראה - רגיל', () => {
    expect(zoneArrivalPhase({ ...base, airborne: false })).toBe('normal');
  });
  it('המריא ובדרך - קטן בפינה (גם בסטטוס planned)', () => {
    expect(zoneArrivalPhase(base)).toBe('enroute');
    expect(zoneArrivalPhase({ ...base, status: 'planned' })).toBe('enroute');
  });
  it('תמונ"א זיהתה באזור ולא אושר - מהבהב, גם בלי סימון "מאוויר"', () => {
    expect(zoneArrivalPhase({ ...base, status: 'באזור', ack: false })).toBe('arrived');
    expect(zoneArrivalPhase({ ...base, airborne: false, status: 'באזור', ack: false })).toBe('arrived');
  });
  it('אושר "באזור" - רגיל; שרת ישן בלי העמודה - רגיל', () => {
    expect(zoneArrivalPhase({ ...base, status: 'באזור', ack: true })).toBe('normal');
    expect(zoneArrivalPhase({ ...base, status: 'באזור', ack: undefined })).toBe('normal');
  });
  it('עוזב אזור - רגיל; בלי אזור - רגיל', () => {
    expect(zoneArrivalPhase({ ...base, status: 'עוזב אזור' })).toBe('normal');
    expect(zoneArrivalPhase({ ...base, hasZone: false, status: 'באזור', ack: false })).toBe('normal');
  });
});

describe('arrivalAckAfterStatus', () => {
  it('רק "באזור" אוטומטי ממתין לאישור', () => {
    expect(arrivalAckAfterStatus('באזור', true)).toBe(false);
    expect(arrivalAckAfterStatus('באזור', false)).toBe(true);
    expect(arrivalAckAfterStatus('עוזב אזור', true)).toBe(true);
    expect(arrivalAckAfterStatus('בדרך לאזור', true)).toBe(true);
  });
});

describe('zoneCornerPoint', () => {
  const sq = [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }];
  it('עברית - הפינה העליונה הימנית, מוזזת פנימה', () => {
    const p = zoneCornerPoint(sq, true)!;
    expect(p.x).toBeLessThan(30); expect(p.x).toBeGreaterThan(25);
    expect(p.y).toBeGreaterThan(10); expect(p.y).toBeLessThan(15);
  });
  it('אנגלית - הפינה העליונה השמאלית', () => {
    const p = zoneCornerPoint(sq, false)!;
    expect(p.x).toBeGreaterThan(10); expect(p.x).toBeLessThan(15);
  });
  it('פוליגון לא תקין - null', () => {
    expect(zoneCornerPoint([{ x: 1, y: 1 }], true)).toBeNull();
  });
});

describe('enrouteStackIndex', () => {
  it('ממספר פר אזור לפי סדר', () => {
    const m = enrouteStackIndex([{ stripId: 1, zoneId: 5 }, { stripId: 2, zoneId: 6 }, { stripId: 3, zoneId: 5 }]);
    expect(m.get(1)).toBe(0); expect(m.get(2)).toBe(0); expect(m.get(3)).toBe(1);
  });
});
