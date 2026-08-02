import { describe, it, expect } from 'vitest';
import { parseParentRect, sectorFocusView, FULL_MAP_VIEW, MAX_SECTOR_ZOOM } from './sectorFocus';

describe('parseParentRect — תחום הסקטור על מפת האב', () => {
  it('אובייקט תקין עובר כמו שהוא', () => {
    expect(parseParentRect({ x1: 10, y1: 20, x2: 50, y2: 60 })).toEqual({ x1: 10, y1: 20, x2: 50, y2: 60 });
  });

  it('מחרוזת JSON (שורות ותיקות) מפוענחת', () => {
    expect(parseParentRect('{"x1":0,"y1":0,"x2":25,"y2":50}')).toEqual({ x1: 0, y1: 0, x2: 25, y2: 50 });
  });

  it('גרירה הפוכה (מימין לשמאל) ממוינת - x1<x2, y1<y2', () => {
    expect(parseParentRect({ x1: 80, y1: 90, x2: 20, y2: 30 })).toEqual({ x1: 20, y1: 30, x2: 80, y2: 90 });
  });

  it('ערכים חסרים / לא-מספריים / null - לא תחום', () => {
    expect(parseParentRect(null)).toBeNull();
    expect(parseParentRect({ x1: 1, y1: 2 })).toBeNull();
    expect(parseParentRect({ x1: 'a', y1: 2, x2: 3, y2: 4 })).toBeNull();
    expect(parseParentRect('לא JSON')).toBeNull();
  });
});

describe('sectorFocusView — מיקוד המפה על תחום הסקטור', () => {
  // פאנל 800x600 שהתמונה ממלאת בדיוק (בלי letterbox)
  const ib = { left: 0, top: 0, width: 800, height: 600 };

  it('סקטור ברבע העליון-שמאלי - זום פי 2 והמרכז שלו עובר למרכז הפאנל', () => {
    const v = sectorFocusView({ x1: 0, y1: 0, x2: 50, y2: 50 }, ib);
    expect(v.zoom).toBe(2);
    // מרכז הסקטור (200,150) → מרכז הפאנל (400,300):  pan = (400-200)*2, (300-150)*2
    expect(v.pan).toEqual({ x: 400, y: 300 });
  });

  it('סקטור במרכז המפה - אין פאן (המרכזים כבר חופפים)', () => {
    const v = sectorFocusView({ x1: 25, y1: 25, x2: 75, y2: 75 }, ib);
    expect(v.pan).toEqual({ x: 0, y: 0 });
    expect(v.zoom).toBe(2);
  });

  it('הזום נקבע לפי הצלע הצרה - הסקטור כולו נכנס למסך', () => {
    // רצועה רחבה ונמוכה: 100% רוחב, 25% גובה → רוחב מגביל לפי 1, גובה לפי 4 → נבחר 1
    const v = sectorFocusView({ x1: 0, y1: 0, x2: 100, y2: 25 }, ib);
    expect(v.zoom).toBe(1);
  });

  it('סקטור קטן מאוד - הזום נחסם בתקרת סרגל המפה', () => {
    const v = sectorFocusView({ x1: 40, y1: 40, x2: 45, y2: 45 }, ib);
    expect(v.zoom).toBe(MAX_SECTOR_ZOOM);
  });

  it('מפה עם letterbox - גודל הפאנל נגזר נכון מ-imgBounds', () => {
    // תמונה 400x600 ממורכזת בפאנל 800x600 → left=200
    const lb = { left: 200, top: 0, width: 400, height: 600 };
    const v = sectorFocusView({ x1: 0, y1: 0, x2: 100, y2: 100 }, lb);
    // התמונה כולה: המרכז שלה (400,300) הוא כבר מרכז הפאנל → בלי פאן
    expect(v.pan).toEqual({ x: 0, y: 0 });
    // רוחב 400 מול 800, גובה 600 מול 600 → הגובה מגביל, זום 1
    expect(v.zoom).toBe(1);
  });

  it('בלי imgBounds או תחום מנוון - נופל לתצוגה המלאה ולא לחלוקה באפס', () => {
    expect(sectorFocusView({ x1: 0, y1: 0, x2: 50, y2: 50 }, null)).toEqual(FULL_MAP_VIEW);
    expect(sectorFocusView({ x1: 10, y1: 10, x2: 10, y2: 40 }, ib)).toEqual(FULL_MAP_VIEW);
  });
});
