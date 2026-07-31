import { describe, it, expect } from 'vitest';
import { TOOLBAR_SCALE_MAP, getToolbarScale, tbPx } from './scale';

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
