import { describe, it, expect } from 'vitest';
import { PinchTracker } from './pinchTracker';

describe('PinchTracker', () => {
  it('אצבע אחת אינה צביטה - ההתנהגות הקיימת של המפה נשארת', () => {
    const t = new PinchTracker();
    expect(t.down(1, { x: 0, y: 0 }, 'map')).toEqual({ start: false });
    expect(t.move(1, { x: 10, y: 0 })).toBeNull();
    expect(t.isSwallowed(1)).toBe(false);
    expect(t.up(1)).toEqual({ end: false });
  });

  it('אצבע שנייה על אותה מפה מתחילה צביטה ומבטלת את הראשונה', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 }, 'map');
    expect(t.down(2, { x: 100, y: 0 }, 'map')).toEqual({ start: true, cancelId: 1 });
    expect(t.pinching).toBe(true);
    expect(t.isSwallowed(1)).toBe(true);
    expect(t.isSwallowed(2)).toBe(true);
  });

  it('פיסוק האצבעות = הגדלה, ונקודת האמצע זזה איתן', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 }, 'map');
    t.down(2, { x: 100, y: 0 }, 'map');
    const s = t.move(2, { x: 200, y: 0 });
    expect(s).toEqual({ scale: 2, prevMid: { x: 50, y: 0 }, mid: { x: 100, y: 0 } });
    // הצעד הבא נמדד מהקודם, לא מתחילת הצביטה
    const s2 = t.move(1, { x: 100, y: 0 });
    expect(s2?.scale).toBeCloseTo(0.5);
  });

  it('אצבעות שנפגשו בנקודה אחת - יחס 1 ולא Infinity', () => {
    const t = new PinchTracker();
    t.down(1, { x: 50, y: 50 }, 'map');
    t.down(2, { x: 50, y: 50 }, 'map');
    expect(t.move(2, { x: 60, y: 50 })?.scale).toBe(1);
  });

  it('הרמת אצבע מסיימת את הצביטה, והאצבע שנותרה נבלעת עד שהיא מורמת', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 }, 'map');
    t.down(2, { x: 100, y: 0 }, 'map');
    expect(t.up(2)).toEqual({ end: true });
    expect(t.pinching).toBe(false);
    expect(t.isSwallowed(1)).toBe(true);
    expect(t.move(1, { x: 30, y: 0 })).toBeNull();
    t.up(1);
    expect(t.isSwallowed(1)).toBe(false);
  });

  it('שתי אצבעות על שתי מפות שונות אינן צביטה', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 }, 'map1');
    expect(t.down(2, { x: 100, y: 0 }, 'map2')).toEqual({ start: false });
    expect(t.pinching).toBe(false);
  });

  it('אצבע שלישית באמצע צביטה אינה משבשת אותה', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 }, 'map');
    t.down(2, { x: 100, y: 0 }, 'map');
    expect(t.down(3, { x: 50, y: 50 }, 'map')).toEqual({ start: false });
    expect(t.move(3, { x: 60, y: 60 })).toBeNull();
    expect(t.move(2, { x: 200, y: 0 })?.scale).toBe(2);
  });

  it('אחרי צביטה שנגמרה, צביטה חדשה מתחילה נקי', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 }, 'map');
    t.down(2, { x: 100, y: 0 }, 'map');
    t.up(1); t.up(2);
    t.down(3, { x: 0, y: 0 }, 'map');
    expect(t.down(4, { x: 10, y: 0 }, 'map')).toEqual({ start: true, cancelId: 3 });
  });
});
