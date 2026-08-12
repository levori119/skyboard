import { describe, it, expect } from 'vitest';
import {
  isFrac, fracToPx, pxToFrac, shapeFromDrag, strokeLineWidth, DRAW_PALETTE,
  type PenStroke,
} from './mapDrawing';

const SIZE = { width: 800, height: 400 };

describe('mapDrawing - עיגון לציור המפה (שברים 0..1)', () => {
  it('pxToFrac ממיר פיקסלים לשבר של גודל הקנבס', () => {
    expect(pxToFrac({ x: 400, y: 100 }, SIZE)).toEqual({ x: 0.5, y: 0.25 });
  });

  it('קנבס בגודל 0 לא מייצר NaN', () => {
    expect(pxToFrac({ x: 40, y: 10 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('fracToPx הוא ההופכי של pxToFrac', () => {
    const p = { x: 123, y: 77 };
    expect(fracToPx(pxToFrac(p, SIZE), SIZE)).toEqual(p);
  });

  it('הציור נשאר מעוגן כשגודל הקנבס משתנה (חצי מפה = חצי מפה)', () => {
    const frac = pxToFrac({ x: 400, y: 200 }, SIZE);
    expect(fracToPx(frac, { width: 1600, height: 800 })).toEqual({ x: 800, y: 400 });
  });

  it('ערך legacy בפיקסלים (>1.5) נשאר כפי שהוא', () => {
    expect(isFrac(0.5)).toBe(true);
    expect(isFrac(1.5)).toBe(true);
    expect(isFrac(12)).toBe(false);
    expect(fracToPx({ x: 12, y: 30 }, SIZE)).toEqual({ x: 12, y: 30 });
  });
});

describe('mapDrawing - עובי קו', () => {
  const base: PenStroke = { id: 'a', points: [], color: '#fff', size: 3, eraser: false };
  it('עט מצייר בעובי שנבחר', () => {
    expect(strokeLineWidth(base)).toBe(3);
  });
  it('מחק רחב פי 10 מהעט - אחרת מחיקה בעט דקה מדי לתפעול', () => {
    expect(strokeLineWidth({ ...base, eraser: true })).toBe(30);
  });
});

describe('mapDrawing - יצירת צורה מגרירה', () => {
  const opts = { id: 's1', type: 'rect' as const, color: '#ef4444', filled: false, strokeWidth: 2 };

  it('גרירה זעירה (רעד עט) אינה יוצרת צורה', () => {
    expect(shapeFromDrag({ x: 10, y: 10 }, { x: 13, y: 12 }, 800, 400, opts)).toBeNull();
  });

  it('גרירה נשמרת כשברים של משטח הציור', () => {
    const s = shapeFromDrag({ x: 200, y: 100 }, { x: 600, y: 300 }, 800, 400, opts);
    expect(s).toMatchObject({ id: 's1', type: 'rect', x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });

  it('גרירה הפוכה (מלמטה-ימין למעלה-שמאל) מנורמלת', () => {
    const s = shapeFromDrag({ x: 600, y: 300 }, { x: 200, y: 100 }, 800, 400, opts);
    expect(s).toMatchObject({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });

  it('צורה דקה מקבלת מינימום 10px כדי שתישאר ניתנת לתפיסה', () => {
    const s = shapeFromDrag({ x: 100, y: 100 }, { x: 300, y: 102 }, 800, 400, opts);
    expect(s!.h).toBeCloseTo(10 / 400);
  });
});

describe('mapDrawing - פלטה', () => {
  it('הפלטה מכילה צבעים ייחודיים בלבד', () => {
    expect(new Set(DRAW_PALETTE).size).toBe(DRAW_PALETTE.length);
  });
});
