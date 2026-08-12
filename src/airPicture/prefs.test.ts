import { describe, it, expect } from 'vitest';
import { mergePrefs, DEFAULT_PREFS } from './prefs';

describe('mergePrefs - שלוש שכבות, מהחלשה לחזקה', () => {
  it('בלי כלום - ברירת המחדל של הקוד', () => {
    expect(mergePrefs(null, null)).toEqual(DEFAULT_PREFS);
  });

  it('ברירת המחדל של העמדה גוברת על הקוד', () => {
    expect(mergePrefs({ opacity: 0.8 }, null).opacity).toBe(0.8);
  });

  it('הסשן של הפקח גובר על ברירת המחדל של העמדה', () => {
    expect(mergePrefs({ opacity: 0.8 }, { opacity: 0.2 }).opacity).toBe(0.2);
  });

  it('בהירות ברירת המחדל נמוכה - התמונ"א משנית לפ"מים', () => {
    expect(DEFAULT_PREFS.opacity).toBeLessThan(0.6);
  });
});

describe('mergePrefs - ניקוי ערכים', () => {
  it('בהירות וגודל נחתכים לטווח', () => {
    const p = mergePrefs(null, { opacity: 9, scale: 0.01 });
    expect(p.opacity).toBe(1);
    expect(p.scale).toBe(0.6);
  });

  it('ערך לא מספרי נופל לברירת המחדל ולא ל-NaN', () => {
    const p = mergePrefs(null, { scale: 'הרבה' as unknown as number });
    expect(p.scale).toBe(DEFAULT_PREFS.scale);
  });

  it('סיווג לא מוכר נזרק, המוכרים נשארים', () => {
    const p = mergePrefs(null, { classes: ['friend', 'זבל'] as never });
    expect(p.classes).toEqual(['friend']);
  });

  it('רשימת סיווגים ריקה **נשמרת** - הפקח כיבה הכול בכוונה', () => {
    expect(mergePrefs(null, { classes: [] }).classes).toEqual([]);
  });

  it('טווח גובה: ריק/undefined = בלי חסם', () => {
    expect(mergePrefs(null, { altMin: '' as unknown as number }).altMin).toBeNull();
    expect(mergePrefs(null, { altMax: 25000 }).altMax).toBe(25000);
  });

  it('on=false נשמר, ולא נבלע ע"י ברירת המחדל', () => {
    expect(mergePrefs({ on: true }, { on: false }).on).toBe(false);
  });

  it('labels=false נשמר', () => {
    expect(mergePrefs(null, { labels: false }).labels).toBe(false);
  });

  it('קונפיג פגום לגמרי לא מפיל - חוזרים לברירת מחדל שפויה', () => {
    const p = mergePrefs({ classes: 'לא מערך' as never }, null);
    expect(p.classes).toEqual(DEFAULT_PREFS.classes);
  });
});
