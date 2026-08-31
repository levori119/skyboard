import { describe, it, expect } from 'vitest';
import { raiseWindow, windowZ, SEIZURE_WIN_Z_BASE } from './windowStack';

// הבאג שהכלל הזה פותר: הפקח פותח את חלון פרטי המרחב, לוחץ "אישורי עמדות" -
// והחלון נפתח **מתחת** לחלון שממנו לחץ, כלומר נראה כאילו לא קרה כלום.

describe('סדר הערימה של חלונות ההלאמה', () => {
  it('חלון שנפתח עולה לראש הערימה', () => {
    const order = raiseWindow(['details'], 'status');
    expect(windowZ(order, 'status')).toBeGreaterThan(windowZ(order, 'details'));
  });

  it('החלון שנגעו בו אחרון קדמי - גם כשהוא זה שהיה מאחור', () => {
    let order = raiseWindow(raiseWindow([], 'details'), 'status');
    expect(windowZ(order, 'status')).toBeGreaterThan(windowZ(order, 'details'));
    order = raiseWindow(order, 'details');
    expect(windowZ(order, 'details')).toBeGreaterThan(windowZ(order, 'status'));
  });

  it('חלון אינו מופיע פעמיים כשמעלים אותו שוב', () => {
    const order = raiseWindow(raiseWindow(raiseWindow([], 'map'), 'status'), 'map');
    expect(order).toEqual(['status', 'map']);
  });

  // בלי זה כל לחיצה על החלון הקדמי הייתה יוצרת רשימה חדשה ומרנדרת מחדש את
  // כל המסך - עשרות פעמים בדקה בזמן גרירה.
  it('העלאת החלון שכבר בראש מחזירה את אותה רשימה בדיוק', () => {
    const order = raiseWindow([], 'status');
    expect(raiseWindow(order, 'status')).toBe(order);
  });

  it('חלון שטרם נגעו בו יושב על הבסיס ומתחת לכל מי שכן', () => {
    const order = raiseWindow([], 'status');
    expect(windowZ(order, 'map')).toBe(SEIZURE_WIN_Z_BASE);
    expect(windowZ(order, 'status')).toBeGreaterThan(windowZ(order, 'map'));
  });

  // התקרה: ההתראה המתפרצת (10600) וטופס ההגדרה (10700) חוסמים בכוונה, ואסור
  // שערימה שגדלה תעבור אותם.
  it('הערימה נשארת הרחק מתחת להתראה המתפרצת', () => {
    let order: string[] = [];
    for (const k of ['details', 'status', 'map']) order = raiseWindow(order, k);
    expect(Math.max(...order.map(k => windowZ(order, k)))).toBeLessThan(10600);
  });
});
