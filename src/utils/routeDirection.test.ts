import { describe, it, expect } from 'vitest';
import { normalizeRouteDirection, nextRouteDirection, routeDirectionGlyph, routeDirectionArrows } from './routeDirection';

describe('כיוון נסיעה בנתיב - תצוגה בעורך', () => {
  it('ערך חסר או זר = דו-כיווני', () => {
    expect(normalizeRouteDirection(undefined)).toBe('both');
    expect(normalizeRouteDirection(null)).toBe('both');
    expect(normalizeRouteDirection('x')).toBe('both');
  });

  it('הכפתור מחזר: דו-כיווני -> קדימה -> אחורה -> דו-כיווני', () => {
    expect(nextRouteDirection(undefined)).toBe('forward');
    expect(nextRouteDirection('forward')).toBe('backward');
    expect(nextRouteDirection('backward')).toBe('both');
  });

  it('סמל לכל מצב', () => {
    expect(routeDirectionGlyph('both')).toBe('⇄');
    expect(routeDirectionGlyph('forward')).toBe('→');
    expect(routeDirectionGlyph('backward')).toBe('←');
  });

  it('דו-כיווני - בלי חצים על המפה', () => {
    expect(routeDirectionArrows([{ x: 0, y: 0 }, { x: 10, y: 0 }], 'both')).toEqual([]);
  });

  it('חץ באמצע כל קטע, בכיוון הנסיעה', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const fwd = routeDirectionArrows(pts, 'forward');
    expect(fwd).toHaveLength(2);
    expect(fwd[0]).toMatchObject({ x: 5, y: 0, angle: 0 });
    expect(fwd[1].angle).toBeCloseTo(90);
    const back = routeDirectionArrows(pts, 'backward');
    expect(Math.abs(back[0].angle)).toBeCloseTo(180);
    expect(back[1].angle).toBeCloseTo(-90);
  });

  it('קטע באורך אפס מדולג', () => {
    expect(routeDirectionArrows([{ x: 1, y: 1 }, { x: 1, y: 1 }], 'forward')).toEqual([]);
  });
});
