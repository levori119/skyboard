import { describe, it, expect } from 'vitest';
import { mergePrefs, DEFAULT_PREFS, airPictureLogicActive, stationLogicWhenOff } from './prefs';

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

// ── לוגיקות תמונ"א: כשמוצגת / כשלא מוצגת (2026-09-15) ────────────────────────
describe('airPictureLogicActive - האם הלוגיקות של התמונ"א רצות', () => {
  const p = (over: Partial<typeof DEFAULT_PREFS>) => mergePrefs(null, over);

  it('ברירת מחדל: מוצגת - רצות; לא מוצגת - לפי העמדה, ובעמדה ברירת המחדל "כן"', () => {
    expect(DEFAULT_PREFS.logicWhenOn).toBe(true);
    expect(DEFAULT_PREFS.logicWhenOff).toBeNull();
    expect(airPictureLogicActive(p({ on: true }), true)).toBe(true);
    expect(airPictureLogicActive(p({ on: false }), true)).toBe(true);
  });

  it('מוצגת: המתג "כשמוצגת" בלבד קובע', () => {
    expect(airPictureLogicActive(p({ on: true, logicWhenOn: false }), true)).toBe(false);
    expect(airPictureLogicActive(p({ on: true, logicWhenOn: true, logicWhenOff: false }), false)).toBe(true);
  });

  it('לא מוצגת: הפקח גובר על העמדה, ובלי בחירה - העמדה', () => {
    expect(airPictureLogicActive(p({ on: false }), false)).toBe(false);
    expect(airPictureLogicActive(p({ on: false, logicWhenOff: false }), true)).toBe(false);
    expect(airPictureLogicActive(p({ on: false, logicWhenOff: true }), false)).toBe(true);
    expect(airPictureLogicActive(p({ on: false, logicWhenOn: false }), true)).toBe(true);
  });

  it('ניקוי: לא-בוליאני - "כשמוצגת" דלוק, "כשלא מוצגת" לפי העמדה', () => {
    const x = mergePrefs(null, { logicWhenOn: 'x' as never, logicWhenOff: 'y' as never });
    expect(x.logicWhenOn).toBe(true);
    expect(x.logicWhenOff).toBeNull();
  });
});

describe('stationLogicWhenOff - הגדרת העמדה בניהול', () => {
  it('לא הוגדר (עמדה ותיקה) - כן', () => {
    expect(stationLogicWhenOff(null)).toBe(true);
    expect(stationLogicWhenOff({})).toBe(true);
    expect(stationLogicWhenOff({ alerts: true })).toBe(true);
  });
  it('כובה במפורש - לא', () => {
    expect(stationLogicWhenOff({ airLogicWhenOff: false })).toBe(false);
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


// בחירת הנתונים ליד הסמל (או"ק / גובה / מהירות).
describe('שדות התווית', () => {
  it('ברירת המחדל - שלושתם דלוקים', () => {
    expect(mergePrefs(null, null).fields).toEqual({ cs: true, alt: true, spd: true });
  });

  it('העדפה שנשמרה לפני התוספת אינה מוחקת תוויות', () => {
    // סשן ישן אינו מכיל `fields` כלל
    expect(mergePrefs(null, { scale: 1.2 } as any).fields).toEqual({ cs: true, alt: true, spd: true });
  });

  it('כיבוי מפורש שורד - ורק השדה שכובה', () => {
    const p = mergePrefs(null, { fields: { spd: false } } as any);
    expect(p.fields).toEqual({ cs: true, alt: true, spd: false });
  });

  it('ברירת המחדל של העמדה נחלשת מהסשן, כמו כל שאר ההעדפות', () => {
    const p = mergePrefs({ fields: { cs: false, alt: true, spd: true } }, { fields: { cs: true, alt: true, spd: true } });
    expect(p.fields.cs).toBe(true);
  });
});
