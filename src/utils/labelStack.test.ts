import { describe, it, expect } from 'vitest';
import { stackLabels, sideLanes } from './labelStack';

// מה שנבדק: תוויות פ"מים בתצוגת הבלוקים לא עולות אחת על השנייה
const H = 22, GAP = 2;
const noOverlap = (ys: number[]) => {
  const s = [...ys].sort((a, b) => a - b);
  for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(H + GAP - 1e-9);
};

describe('stackLabels', () => {
  it('שלוש תוויות צפופות (1000 רגל ביניהן) - כולן נפרדות, בסדר הגובה', () => {
    const ys = stackLabels([{ x: 0, y: 100 }, { x: 0, y: 110 }, { x: 0, y: 120 }], 60, H, GAP);
    noOverlap(ys);
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    // הקבוצה נשארת סביב המקום המקורי שלה
    expect((ys[0] + ys[1] + ys[2]) / 3).toBeCloseTo(110, 6);
  });

  it('תוויות רחוקות זו מזו - לא זזות', () => {
    expect(stackLabels([{ x: 0, y: 100 }, { x: 0, y: 200 }], 60, H, GAP)).toEqual([100, 200]);
  });

  it('בלי חפיפה בזמן (x) - לא נדחפות גם באותו גובה', () => {
    expect(stackLabels([{ x: 0, y: 100 }, { x: 100, y: 100 }], 60, H, GAP)).toEqual([100, 100]);
  });

  it('דחיפה שיוצרת חפיפה חדשה עם שכנה - נפתרת גם היא', () => {
    const ys = stackLabels([{ x: 0, y: 100 }, { x: 0, y: 105 }, { x: 0, y: 128 }, { x: 0, y: 300 }], 60, H, GAP);
    noOverlap(ys);
    expect(ys[3]).toBe(300);
  });

  it('לא יוצאות מגבולות התרשים', () => {
    const ys = stackLabels([{ x: 0, y: 5 }, { x: 0, y: 8 }, { x: 0, y: 10 }], 60, H, GAP, { min: 11, max: 400 });
    noOverlap(ys);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(11);
  });
});

describe('sideLanes - תווית קרובה בגובה זזה הצידה, והגובה שלה נשאר מדויק', () => {
  it('שלוש תוויות ב-1000 רגל זו מזו - כל אחת בנתיב משלה', () => {
    const lanes = sideLanes([{ x: 0, y: 100 }, { x: 0, y: 110 }, { x: 0, y: 120 }], 60, 22, 2);
    expect(new Set(lanes).size).toBe(3);
  });
  it('רחוקות בגובה - אותו נתיב (0)', () => {
    expect(sideLanes([{ x: 0, y: 100 }, { x: 0, y: 200 }], 60, 22, 2)).toEqual([0, 0]);
  });
  it('לא חופפות בזמן - אותו נתיב', () => {
    expect(sideLanes([{ x: 0, y: 100 }, { x: 100, y: 100 }], 60, 22, 2)).toEqual([0, 0]);
  });
  it('נתיב מתפנה חוזר לשימוש: שתיים צמודות ושלישית רחוקה מהן', () => {
    expect(sideLanes([{ x: 0, y: 100 }, { x: 0, y: 110 }, { x: 0, y: 300 }], 60, 22, 2)).toEqual([0, 1, 0]);
  });
});
