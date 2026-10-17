import { describe, it, expect } from 'vitest';
import { pinchGeometry, pinchZoomPan, toLocal, localStep, type Pt, type ZoomPanView } from './pinchZoom';

/** איפה נקודת תוכן p מוצגת ב-translate(pan) scale(zoom) עם origin. */
const screenOf = (p: Pt, v: ZoomPanView, o: Pt): Pt => ({
  x: o.x + v.pan.x + v.zoom * (p.x - o.x),
  y: o.y + v.pan.y + v.zoom * (p.y - o.y),
});
/** הפעולה ההפוכה - איזו נקודת תוכן יושבת מתחת לנקודת מסך. */
const contentAt = (s: Pt, v: ZoomPanView, o: Pt): Pt => ({
  x: o.x + (s.x - o.x - v.pan.x) / v.zoom,
  y: o.y + (s.y - o.y - v.pan.y) / v.zoom,
});

describe('pinchGeometry', () => {
  it('מחזיר מרחק ונקודת אמצע', () => {
    const g = pinchGeometry({ x: 0, y: 0 }, { x: 30, y: 40 });
    expect(g.dist).toBe(50);
    expect(g.mid).toEqual({ x: 15, y: 20 });
  });
});

describe('pinchZoomPan', () => {
  const origin = { x: 200, y: 150 };

  it('הנקודה שבין האצבעות נשארת מתחתיהן בהגדלה', () => {
    const view = { zoom: 1.5, pan: { x: 30, y: -20 } };
    const prevMid = { x: 320, y: 90 };
    const held = contentAt(prevMid, view, origin);
    const next = pinchZoomPan(view, { scale: 1.4, prevMid, mid: prevMid }, origin, 0.2, 8);
    expect(next.zoom).toBeCloseTo(2.1);
    const s = screenOf(held, next, origin);
    expect(s.x).toBeCloseTo(prevMid.x);
    expect(s.y).toBeCloseTo(prevMid.y);
  });

  it('הזזת שתי האצבעות יחד גוררת את המפה איתן, בלי זום', () => {
    const view = { zoom: 2, pan: { x: 0, y: 0 } };
    const next = pinchZoomPan(view, { scale: 1, prevMid: { x: 100, y: 100 }, mid: { x: 140, y: 75 } }, origin, 0.2, 8);
    expect(next.zoom).toBe(2);
    expect(next.pan.x).toBeCloseTo(40);
    expect(next.pan.y).toBeCloseTo(-25);
  });

  it('צביטה + הזזה: הנקודה עוברת עם האצבעות למקום החדש', () => {
    const view = { zoom: 1, pan: { x: 10, y: 10 } };
    const prevMid = { x: 50, y: 60 }, mid = { x: 90, y: 20 };
    const held = contentAt(prevMid, view, origin);
    const next = pinchZoomPan(view, { scale: 0.6, prevMid, mid }, origin, 0.2, 8);
    const s = screenOf(held, next, origin);
    expect(s.x).toBeCloseTo(mid.x);
    expect(s.y).toBeCloseTo(mid.y);
  });

  it('הזום נחסם לטווח - והנקודה עדיין נשארת מתחת לאצבעות', () => {
    const view = { zoom: 7, pan: { x: 0, y: 0 } };
    const prevMid = { x: 260, y: 120 };
    const held = contentAt(prevMid, view, origin);
    const next = pinchZoomPan(view, { scale: 3, prevMid, mid: prevMid }, origin, 0.2, 8);
    expect(next.zoom).toBe(8);
    const s = screenOf(held, next, origin);
    expect(s.x).toBeCloseTo(prevMid.x);
    expect(s.y).toBeCloseTo(prevMid.y);
  });

  it('יחס לא תקין (0 / NaN) לא מאפס את הזום', () => {
    const view = { zoom: 2, pan: { x: 5, y: 5 } };
    const p = { x: 100, y: 100 };
    expect(pinchZoomPan(view, { scale: 0, prevMid: p, mid: p }, origin, 0.2, 8).zoom).toBe(2);
    expect(pinchZoomPan(view, { scale: NaN, prevMid: p, mid: p }, origin, 0.2, 8).zoom).toBe(2);
  });
});

describe('toLocal / localStep', () => {
  it('מחלק ב---s: נקודת מסך בעמדת 24" חוזרת ליחידות הפריסה', () => {
    expect(toLocal({ x: 265, y: 182.5 }, { left: 100, top: 100 }, 1.65)).toEqual({ x: 100, y: 50 });
  });
  it('localStep ממיר את שתי נקודות האמצע ושומר את היחס', () => {
    const s = localStep({ scale: 1.2, prevMid: { x: 120, y: 140 }, mid: { x: 140, y: 160 } }, { left: 100, top: 100 }, 2);
    expect(s).toEqual({ scale: 1.2, prevMid: { x: 10, y: 20 }, mid: { x: 20, y: 30 } });
  });
});
