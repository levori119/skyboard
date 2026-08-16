import { describe, it, expect } from 'vitest';
import { MAP_LABEL_SCALE_MAP, TOOLBAR_SCALE_MAP, getMapLabelScale, getToolbarScale, readMapLabelScale, tbPx } from './scale';

describe('getToolbarScale', () => {
  it('15.6" הוא בסיס - בלי הגדלה (הכפתורים נשארים כפי שהם היום)', () => {
    expect(getToolbarScale('15')).toBe(1);
    expect(getToolbarScale('15.6')).toBe(1);
  });

  it('מסכים גדולים מקבלים הגדלה עולה - 16 < 18 < 24', () => {
    expect(getToolbarScale('16')).toBe(1.1);
    expect(getToolbarScale('18')).toBe(1.2);
    expect(getToolbarScale('24')).toBe(1.4);
    expect(getToolbarScale('16')).toBeLessThan(getToolbarScale('18'));
    expect(getToolbarScale('18')).toBeLessThan(getToolbarScale('24'));
  });

  it('ערך לא מוכר / חסר נופל חזרה ל-1 (לעולם לא שובר סרגל קיים)', () => {
    expect(getToolbarScale(null)).toBe(1);
    expect(getToolbarScale(undefined)).toBe(1);
    expect(getToolbarScale('')).toBe(1);
    expect(getToolbarScale('32')).toBe(1);
  });

  it('index.html כותב data-screen="15" ו-App.tsx כותב "15.6" - שניהם נתמכים', () => {
    for (const key of ['15', '15.6', '16', '18', '24']) {
      expect(TOOLBAR_SCALE_MAP[key]).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('tbPx', () => {
  it('מחזיר מחרוזת px מעוגלת - כדי שלא ייווצרו שברי פיקסל מטושטשים', () => {
    expect(tbPx(20, 1.4)).toBe('28px');
    expect(tbPx(9, 1.4)).toBe('13px');
    expect(tbPx(28, 1.4)).toBe('39px');
  });

  it('בסקייל 1 הערך לא משתנה בכלל', () => {
    expect(tbPx(28, 1)).toBe('28px');
    expect(tbPx(4, 1)).toBe('4px');
  });

  it('לעולם לא מחזיר 0 - כפתור בגודל 0 לא ניתן ללחיצה', () => {
    expect(tbPx(1, 1)).toBe('1px');
  });
});

describe('מכפיל תוויות מפה - כיווץ לפי גודל המסך', () => {
  // הזום הגלובלי מגדיל הכל אחיד; לתווית על המפה זה רע - היא גדלה עם המסך בעוד
  // שהצורה מתחתיה נשארת באותו יחס, ובמסך גדול היא מכסה את המפה.
  it('מסך בסיס - בלי שינוי', () => {
    expect(getMapLabelScale('15')).toBe(1);
    expect(getMapLabelScale('15.6')).toBe(1);
  });

  it('ככל שהמסך גדל התווית קטנה', () => {
    const sizes = ['15', '16', '18', '24'];
    const scales = sizes.map(s => getMapLabelScale(s));
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i], `${sizes[i]}" חייב להיות קטן מ-${sizes[i - 1]}"`).toBeLessThan(scales[i - 1]);
    }
  });

  it('הכיווץ חלקי - התווית לא קופאת בגודל פיזי ולא נעלמת', () => {
    for (const s of Object.keys(MAP_LABEL_SCALE_MAP)) {
      const label = getMapLabelScale(s);
      expect(label).toBeGreaterThan(0.5);
      expect(label).toBeLessThanOrEqual(1);
      // התווית עדיין גדלה עם המסך, רק פחות מהזום הגלובלי
      expect(label * getToolbarScale(s)).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('גודל לא מוכר לא שובר תצוגה קיימת', () => {
    expect(getMapLabelScale(null)).toBe(1);
    expect(getMapLabelScale('99')).toBe(1);
    expect(getMapLabelScale(undefined)).toBe(1);
  });

  it('בלי DOM (בדיקות/SSR) נופל ל-1 ולא זורק', () => {
    expect(typeof document).toBe('undefined');
    expect(readMapLabelScale()).toBe(1);
  });
});
