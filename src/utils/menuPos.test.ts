import { describe, it, expect } from 'vitest';
import { anchorMenuPos } from './menuPos';

// 15.6" = 1.00 · 16" = 1.05 · 18" = 1.22 · 24" = 1.65 (public/boot.js)
const SCREENS = [1, 1.05, 1.22, 1.65];
const VW = 1920, VH = 1080;

describe('anchorMenuPos', () => {
  it('ב-15.6" (--s=1) המיקום נשאר בדיוק על נקודת הלחיצה - בלי רגרסיה', () => {
    const { left, top } = anchorMenuPos(500, 300, 200, 380, { s: 1, vw: VW, vh: VH });
    expect({ left, top }).toEqual({ left: 500, top: 300 });
  });

  it('maxH הוא הגובה שנשאר עד קצה המסך - פופאפ שגדל מהצפוי לא גולש החוצה', () => {
    for (const s of SCREENS) {
      const { top, maxH } = anchorMenuPos(400, 400, 200, 380, { s, vw: VW, vh: VH });
      expect((top + maxH) * s).toBeLessThanOrEqual(VH);
      expect(maxH).toBeGreaterThan(0);
    }
  });

  it('הפופאפ צמוד לאלמנט בכל גודל מסך - left*s חוזר לנקודת הלחיצה', () => {
    for (const s of SCREENS) {
      // נקודה שרחוקה מהקצוות בכל סקייל, כדי לבודד את ההצמדה מהחסימה לגבולות
      const { left, top } = anchorMenuPos(500, 300, 200, 200, { s, vw: VW, vh: VH });
      expect(left * s).toBeCloseTo(500, 5);
      expect(top * s).toBeCloseTo(300, 5);
    }
  });

  it('בלי החלוקה ב---s הפופאפ היה בורח - ב-24" לחיצה ב-900 נפתחה ב-1485px', () => {
    const { left } = anchorMenuPos(900, 600, 200, 380, { s: 1.65, vw: VW, vh: VH });
    expect(left).toBeLessThan(900);           // 900 גולמי היה מוצג ב-1485
    expect(left * 1.65).toBeCloseTo(900, 5);
  });

  it('לחיצה בקצה ימני/תחתון - הפופאפ נשאר כולו בתוך המסך בכל סקייל', () => {
    for (const s of SCREENS) {
      const menuW = 200, menuH = 380;
      const { left, top } = anchorMenuPos(VW - 5, VH - 5, menuW, menuH, { s, vw: VW, vh: VH });
      expect((left + menuW) * s).toBeLessThanOrEqual(VW);
      expect((top + menuH) * s).toBeLessThanOrEqual(VH);
    }
  });

  it('לעולם לא נצמד לקצה השמאלי/עליון מעבר למרווח המינימלי', () => {
    const { left, top } = anchorMenuPos(-500, -500, 200, 380, { s: 1.65, vw: VW, vh: VH });
    expect(left).toBe(4);
    expect(top).toBe(4);
  });

  it('פופאפ גדול מהמסך נצמד לפינה ולא יוצא ממנה', () => {
    const { left, top } = anchorMenuPos(800, 800, 5000, 5000, { s: 1.65, vw: VW, vh: VH });
    expect(left).toBe(4);
    expect(top).toBe(4);
  });

  it('אפשר לשנות את המרווח מהקצה', () => {
    const { left } = anchorMenuPos(VW, 10, 200, 100, { s: 1, vw: VW, vh: VH, gap: 12 });
    expect(left).toBe(VW - 200 - 12);
  });
});
