import { describe, it, expect } from 'vitest';
import { spreadFracs } from './PatternAircraftLayer';

// שני מטוסים שנגררו לאותה הקפה נחתו על אותו שבר (מרכז צלע ה"עם הרוח") ואחד
// הסתיר את השני - כלומר בדיוק המידע שהפקח צריך לראות נעלם. הפיזור משאיר אותם
// **צמודים** (זו אותה הקפה) אבל נפרדים, ובלי לגלוש מהצלע.

const asc = (a: number[]) => a.every((v, i) => i === 0 || v > a[i - 1]);

describe('spreadFracs - מטוסים על אותה הקפה לא יושבים זה על זה', () => {
  it('מטוס בודד נשאר בדיוק על השבר שנבחר', () => {
    expect(spreadFracs(1, 0.5, 0.13)).toEqual([0.5]);
    expect(spreadFracs(1, 0.2, 0.13)).toEqual([0.2]);
  });

  it('שניים מתפזרים סימטרית סביב השבר', () => {
    const [a, b] = spreadFracs(2, 0.5, 0.13);
    expect(a).toBeCloseTo(0.435, 5);
    expect(b).toBeCloseTo(0.565, 5);
    expect((a + b) / 2).toBeCloseTo(0.5, 5);
  });

  it('אף שניים אינם על אותו מקום', () => {
    for (const n of [2, 3, 4, 8]) {
      const out = spreadFracs(n, 0.5, 0.13);
      expect(new Set(out).size).toBe(n);
      expect(asc(out)).toBe(true);
    }
  });

  it('הם נשארים צמודים - המרווח אינו גדל עם המספר', () => {
    const out = spreadFracs(4, 0.5, 0.13);
    expect(out[1] - out[0]).toBeCloseTo(0.13, 5);
    expect(out[3] - out[2]).toBeCloseTo(0.13, 5);
  });

  it('הרבה מטוסים - המרווח מתכווץ כדי שכולם יישארו על הצלע', () => {
    const out = spreadFracs(12, 0.5, 0.13);
    expect(out.length).toBe(12);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0.03);
    expect(Math.max(...out)).toBeLessThanOrEqual(0.97);
    expect(out[1] - out[0]).toBeLessThan(0.13);
  });

  it('שבר בסיס בקצה הצלע - אף מטוס לא גולש מחוצה לה', () => {
    for (const base of [0, 1, 0.02, 0.99]) {
      const out = spreadFracs(5, base, 0.13);
      expect(Math.min(...out)).toBeGreaterThanOrEqual(0.03);
      expect(Math.max(...out)).toBeLessThanOrEqual(0.97);
    }
  });

  it('0 מטוסים אינו מפיל', () => {
    expect(spreadFracs(0, 0.5, 0.13)).toEqual([0.5]);
  });
});
