import { describe, it, expect } from 'vitest';
import { MAP_PAN_CURSOR, MAP_LAYER_TRANSITION, mapLayerTransform, shouldStartMapPan, panAfterDrag, measureCssZoom } from './mapPan';

describe('גרירת מפה - מתי מתחילים', () => {
  const mouse = { button: 0, pointerType: 'mouse', isPrimary: true };

  it('לחיצה ראשית על שטח ריק של המפה - מתחילה גרירה', () => {
    expect(shouldStartMapPan(mouse, { drawingMode: false })).toBe(true);
  });

  it('במוד ציור - לא נגררת (העט מצייר)', () => {
    expect(shouldStartMapPan(mouse, { drawingMode: true })).toBe(false);
  });

  it('לחצן ימני - לא נגררת (שמור לתפריט האזור)', () => {
    expect(shouldStartMapPan({ ...mouse, button: 2 }, { drawingMode: false })).toBe(false);
  });

  it('לחצן אמצעי - לא נגררת', () => {
    expect(shouldStartMapPan({ ...mouse, button: 1 }, { drawingMode: false })).toBe(false);
  });

  it('עט וגם מגע - נגררים (button 0 במגע ראשון)', () => {
    expect(shouldStartMapPan({ button: 0, pointerType: 'pen', isPrimary: true }, { drawingMode: false })).toBe(true);
    expect(shouldStartMapPan({ button: 0, pointerType: 'touch', isPrimary: true }, { drawingMode: false })).toBe(true);
  });

  it('אצבע שנייה (isPrimary=false) - לא מתחילה גרירה שנייה', () => {
    expect(shouldStartMapPan({ button: 0, pointerType: 'touch', isPrimary: false }, { drawingMode: false })).toBe(false);
  });
});

describe('גרירת מפה - חישוב המיקום', () => {
  it('המפה זזה בדיוק כמו המצביע (1:1), מהפאן שבתחילת הלחיצה', () => {
    expect(panAfterDrag({ x: 10, y: 20 }, { x: 100, y: 100 }, { x: 130, y: 90 })).toEqual({ x: 40, y: 10 });
  });

  it('בלי תזוזה - הפאן לא משתנה (לחיצה נקייה לא מזיזה מפה)', () => {
    expect(panAfterDrag({ x: -5, y: 7 }, { x: 50, y: 50 }, { x: 50, y: 50 })).toEqual({ x: -5, y: 7 });
  });

  it('הזזה שלילית עובדת גם היא', () => {
    expect(panAfterDrag({ x: 0, y: 0 }, { x: 200, y: 200 }, { x: 150, y: 120 })).toEqual({ x: -50, y: -80 });
  });

  it('זום המפה לא משפיע על הדלתא - translate קודם ל-scale', () => {
    // אותה תזוזת מצביע צריכה להזיז את המפה באותו מספר פיקסלי מסך בכל זום מפה
    const a = panAfterDrag({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 30, y: 30 });
    expect(a).toEqual({ x: 30, y: 30 });
  });

  it('סקייל גודל המסך (24" = 1.65) מחלק את הדלתא - אחרת המפה בורחת מהעט', () => {
    expect(panAfterDrag({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 165, y: 330 }, 1.65)).toEqual({ x: 100, y: 200 });
  });

  it('סקייל לא תקין נופל ל-1 ולא מאפס את הגרירה', () => {
    expect(panAfterDrag({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 }, 0)).toEqual({ x: 10, y: 10 });
  });
});

describe('מדידת סקייל המסך', () => {
  it('היחס בין הרוחב הנראה לרוחב הפריסה הוא הזום בפועל', () => {
    expect(measureCssZoom({ getBoundingClientRect: () => ({ width: 1650 }), offsetWidth: 1000 })).toBeCloseTo(1.65);
  });

  it('אלמנט שעדיין לא נפרס (רוחב 0) - נופל ל-1', () => {
    expect(measureCssZoom({ getBoundingClientRect: () => ({ width: 0 }), offsetWidth: 0 })).toBe(1);
  });

  it('יחס אבסורדי (אלמנט מוסתר/מוזר) - נופל ל-1 ולא משתק את הגרירה', () => {
    expect(measureCssZoom({ getBoundingClientRect: () => ({ width: 1 }), offsetWidth: 1000 })).toBe(1);
  });
});

describe('שכבות המפה', () => {
  it('אותו transform לכל השכבות - תמונה+יישויות, קנבס ציור, צורות', () => {
    expect(mapLayerTransform({ x: 12, y: -3 }, 1.25)).toBe('translate(12px, -3px) scale(1.25)');
  });

  it('המעבר החלק מוגדר במקום אחד - כדי שאפשר יהיה להחזירו אחרי גרירה', () => {
    expect(MAP_LAYER_TRANSITION).toContain('transform');
  });
});

describe('סמן המטרה', () => {
  it('סמן מותאם עם נקודת אחיזה במרכז ונפילה ל-crosshair', () => {
    expect(MAP_PAN_CURSOR).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(MAP_PAN_CURSOR).toMatch(/\) 16 16, crosshair$/);
  });

  it('ה-SVG מקודד - בלי תווים ששוברים את ה-CSS', () => {
    expect(MAP_PAN_CURSOR).not.toMatch(/[<>#]/);
  });
});
