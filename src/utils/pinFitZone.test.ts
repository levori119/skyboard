import { describe, it, expect } from 'vitest';
import { pinFontForZone, pinFontInsideZone, PIN_FIT_MIN_PX, PIN_FIT_MAX_PX, PIN_FIT_INSIDE_MIN_PX } from './pinFitZone';

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

describe('pinFontInsideZone - הפין כולו בתוך האזור', () => {
  const box = (f: number, chars: number) => ({ w: chars * 0.62 * f, h: 2.8 * f });
  it('פין במרכז ריבוע - התווית נכנסת', () => {
    const f = pinFontInsideZone(sq(0, 0, 10, 10), { x: 5, y: 5 }, 1000, 1000, 1, 10)!;
    const b = box(f, 10);
    expect(b.w).toBeLessThanOrEqual(100);
    expect(b.h).toBeLessThanOrEqual(100);
  });
  it('פין ליד הקצה - קטן יותר מאשר במרכז', () => {
    const mid = pinFontInsideZone(sq(0, 0, 10, 10), { x: 5, y: 5 }, 1000, 1000, 1, 10)!;
    const edge = pinFontInsideZone(sq(0, 0, 10, 10), { x: 9, y: 5 }, 1000, 1000, 1, 10)!;
    expect(edge).toBeLessThan(mid);
    // חצי רוחב התווית לא עובר את המרחק לקצה (10 פיקסל) - מעל הרצפה
    if (edge > PIN_FIT_INSIDE_MIN_PX) expect(box(edge, 10).w / 2).toBeLessThanOrEqual(10);
  });
  it('אזור משופע וצר - לפי המרחב בפועל, לא לפי המלבן החוסם', () => {
    // מקבילית צרה ומשופעת: המלבן החוסם 20x20, אבל לרוחב יש רק 2%
    const slant = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 22, y: 20 }, { x: 20, y: 20 }];
    const inside = pinFontInsideZone(slant, { x: 11, y: 10 }, 1000, 1000, 1, 10)!;
    const byBox = pinFontForZone(slant, 1000, 1000, 1, 10)!;
    expect(inside).toBeLessThan(byBox);
  });
  it('נקודה מחוץ לאזור - נופל לחישוב לפי גודל האזור', () => {
    expect(pinFontInsideZone(sq(0, 0, 10, 10), { x: 50, y: 50 }, 1000, 1000, 1, 10)).toBe(pinFontForZone(sq(0, 0, 10, 10), 1000, 1000, 1, 10));
  });
});
