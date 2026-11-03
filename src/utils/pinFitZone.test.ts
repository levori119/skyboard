import { describe, it, expect } from 'vitest';
import { pinFontForZone, PIN_FIT_MIN_PX, PIN_FIT_MAX_PX } from './pinFitZone';

const sq = (x: number, y: number, w: number, h: number) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

describe('pinFontForZone - הכתב לפי גודל האזור על המסך', () => {
  it('אזור בינוני - כתב שנכנס ברוחב ובגובה', () => {
    // אזור 10% מתמונה של 1000px = 100px על המסך; תווית של 10 תווים
    const f = pinFontForZone(sq(0, 0, 10, 10), 1000, 1000, 1, 10)!;
    expect(f * 10 * 0.62).toBeLessThanOrEqual(100 * 0.6 + 0.5);
    expect(f * 2.8).toBeLessThanOrEqual(100 * 0.45 + 0.5);
  });
  it('אזור זעיר - לא קטן מהמינימום; ענק - לא גדול מהמקסימום', () => {
    expect(pinFontForZone(sq(0, 0, 1, 1), 1000, 1000, 1, 10)).toBe(PIN_FIT_MIN_PX);
    expect(pinFontForZone(sq(0, 0, 80, 80), 1000, 1000, 1, 10)).toBe(PIN_FIT_MAX_PX);
  });
  it('זום מגדיל את האזור על המסך ולכן את הכתב', () => {
    const a = pinFontForZone(sq(0, 0, 5, 5), 1000, 1000, 1, 10)!;
    const b = pinFontForZone(sq(0, 0, 5, 5), 1000, 1000, 2, 10)!;
    expect(b).toBeGreaterThan(a);
  });
  it('בלי אזור תקין - null (נשאר הגודל הרגיל)', () => {
    expect(pinFontForZone(null, 1000, 1000, 1, 10)).toBeNull();
    expect(pinFontForZone([{ x: 1, y: 1 }], 1000, 1000, 1, 10)).toBeNull();
    expect(pinFontForZone(sq(0, 0, 5, 5), 0, 0, 1, 10)).toBeNull();
  });
});
