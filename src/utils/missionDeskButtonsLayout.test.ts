import { describe, it, expect } from 'vitest';
import { mdSnapRect, mdFreeSpot, mdStatusKey, mdLayoutByStatus, mdNextStatusSort, mdClampRect } from './missionDesk';
import type { MDButton } from '../types/missionDesk';

const btn = (id: string, stateIdx: number, x = 0, y = 0): MDButton => ({
  id, x, y, text: id, activeStateIdx: stateIdx,
  states: [{ label: 'כבוי', color: '#64748B' }, { label: 'פעיל', color: '#16a34a' }],
});

describe('mdSnapRect - הצמדה לשורה/עמודה', () => {
  it('אין כפתורים אחרים - נשאר במקום', () => {
    expect(mdSnapRect({ x: 33, y: 44, w: 80, h: 40 }, [], false)).toEqual({ x: 33, y: 44, axis: null });
  });
  it('שורה קרובה יותר - מיישר top בלבד', () => {
    const r = mdSnapRect({ x: 300, y: 104, w: 80, h: 40 }, [{ x: 10, y: 100, w: 80, h: 40 }], false);
    expect(r).toEqual({ x: 300, y: 100, axis: 'row' });
  });
  it('עמודה קרובה יותר - מיישר קצה שמאלי ב-LTR', () => {
    const r = mdSnapRect({ x: 13, y: 300, w: 80, h: 40 }, [{ x: 10, y: 100, w: 80, h: 40 }], false);
    expect(r).toEqual({ x: 10, y: 300, axis: 'col' });
  });
  it('עמודה ב-RTL - מיישר קצה ימני גם כשהרוחב שונה', () => {
    const r = mdSnapRect({ x: 52, y: 300, w: 60, h: 40 }, [{ x: 10, y: 100, w: 100, h: 40 }], true);
    expect(r).toEqual({ x: 50, y: 300, axis: 'col' });
  });
  it('בוחר את הכפתור הקרוב ביותר בציר', () => {
    const r = mdSnapRect({ x: 500, y: 198, w: 80, h: 40 }, [{ x: 0, y: 0, w: 80, h: 40 }, { x: 0, y: 200, w: 80, h: 40 }], false);
    expect(r.y).toBe(200);
  });
});

describe('mdFreeSpot - בלי חפיפות', () => {
  const obstacle = { x: 100, y: 100, w: 80, h: 40 };
  it('מקום פנוי - לא זז', () => {
    expect(mdFreeSpot({ x: 300, y: 300, w: 80, h: 40 }, [obstacle], 800, 600)).toEqual({ x: 300, y: 300 });
  });
  it('lock row - נשאר באותה שורה', () => {
    const p = mdFreeSpot({ x: 110, y: 100, w: 80, h: 40 }, [obstacle], 800, 600, { lock: 'row' })!;
    expect(p.y).toBe(100);
    expect(p.x >= 186 || p.x + 80 <= 94).toBe(true);
  });
  it('lock col - נשאר באותה עמודה', () => {
    const p = mdFreeSpot({ x: 100, y: 110, w: 80, h: 40 }, [obstacle], 800, 600, { lock: 'col' })!;
    expect(p.x).toBe(100);
  });
});

describe('mdLayoutByStatus - סדר לפי סטטוס', () => {
  it('מפתח סטטוס = שם + צבע של המצב הפעיל', () => {
    expect(mdStatusKey(btn('a', 1))).toBe('פעיל|#16a34a');
    expect(mdStatusKey(btn('a', 0))).toBe('כבוי|#64748b');
  });
  it('קבוצה לכל סטטוס, כל קבוצה בשורה משלה, כבוי לפני פעיל', () => {
    const bs = [btn('on1', 1, 0, 0), btn('off1', 0, 10, 0), btn('on2', 1, 20, 0), btn('off2', 0, 30, 0)];
    const sizes = Object.fromEntries(bs.map(b => [b.id, { w: 80, h: 40 }]));
    const p = mdLayoutByStatus(bs, sizes, 800, false);
    expect(p.off1.y).toBe(p.off2.y);
    expect(p.on1.y).toBe(p.on2.y);
    expect(p.on1.y).toBeGreaterThan(p.off1.y);
    expect(p.off1.x).toBeLessThan(p.off2.x); // סדר הקריאה נשמר
  });
  it('RTL - מתחיל מימין', () => {
    const bs = [btn('a', 0)];
    const p = mdLayoutByStatus(bs, { a: { w: 80, h: 40 } }, 800, true, { pad: 8 });
    expect(p.a.x).toBe(800 - 8 - 80);
  });
  it('שובר שורה כשאין רוחב', () => {
    const bs = [btn('a', 0, 0), btn('b', 0, 10), btn('c', 0, 20)];
    const sizes = Object.fromEntries(bs.map(b => [b.id, { w: 100, h: 40 }]));
    const p = mdLayoutByStatus(bs, sizes, 230, false, { pad: 8, gap: 6 });
    expect(p.a.y).toBe(p.b.y);
    expect(p.c.y).toBeGreaterThan(p.a.y);
  });
  it('אין חפיפות בין קבוצות', () => {
    const bs = [btn('a', 0), btn('b', 1)];
    const p = mdLayoutByStatus(bs, { a: { w: 80, h: 50 }, b: { w: 80, h: 40 } }, 800, false, { gap: 6 });
    expect(p.b.y).toBeGreaterThanOrEqual(p.a.y + 50 + 6);
  });
});

describe('סדר לפי סטטוס - מחזור ומצב הפוך', () => {
  it('reverse - פעיל לפני כבוי', () => {
    const bs = [btn('off', 0), btn('on', 1)];
    const sizes = { off: { w: 80, h: 40 }, on: { w: 80, h: 40 } };
    const p = mdLayoutByStatus(bs, sizes, 800, false, { reverse: true });
    expect(p.on.y).toBeLessThan(p.off.y);
  });
  it('מחזור הכפתור: כבוי → רגיל → הפוך → כבוי', () => {
    expect(mdNextStatusSort(undefined)).toBe('asc');
    expect(mdNextStatusSort('asc')).toBe('desc');
    expect(mdNextStatusSort('desc')).toBeUndefined();
  });
});

describe('mdClampRect - כפתור שנשאר מחוץ ללוח אחרי הקטנה', () => {
  it('חורג מימין ומלמטה - מוחזר פנימה', () => {
    expect(mdClampRect({ x: 750, y: 580, w: 80, h: 40 }, 800, 600)).toEqual({ x: 720, y: 560, w: 80, h: 40 });
  });
  it('בתוך הלוח - לא זז', () => {
    expect(mdClampRect({ x: 10, y: 10, w: 80, h: 40 }, 800, 600)).toEqual({ x: 10, y: 10, w: 80, h: 40 });
  });
  it('רחב מהלוח - נצמד ל-0', () => {
    expect(mdClampRect({ x: 50, y: 0, w: 900, h: 40 }, 800, 600).x).toBe(0);
  });
});
