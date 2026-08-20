import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FitText, { fitFontSize } from './FitText';

// ההודעה בלוח ההודעות חרגה מהכפתור ומהחלון (בקשת הפקח: "שלא יחרוג מגודל
// החלון, אם צריך להקטין פונט בהתאם"). כאן נבדק **האלגוריתם** שבוחר את הגודל -
// המדידה עצמה תלוית DOM ואינה זמינה בסביבת הבדיקות (אין jsdom).

describe('fitFontSize - הגודל הגדול ביותר שנכנס', () => {
  /** דמה מונוטוני: כל גודל עד `limit` (כולל) נכנס. */
  const upTo = (limit: number) => (size: number) => size <= limit;

  it('בוחר את הגדול ביותר שנכנס, לא את הראשון', () => {
    expect(fitFontSize(upTo(9), 6, 12)).toBe(9);
    expect(fitFontSize(upTo(6), 6, 12)).toBe(6);
  });

  it('הכל נכנס - נשארים בגודל המבוקש ולא מקטינים סתם', () => {
    expect(fitFontSize(() => true, 6, 12)).toBe(12);
  });

  it('גם הרצפה אינה נכנסת - הרצפה גוברת, כי טקסט 3px אינו טקסט', () => {
    expect(fitFontSize(() => false, 6, 12)).toBe(6);
  });

  it('מספר המדידות לוגריתמי - כל מדידה היא reflow', () => {
    let calls = 0;
    fitFontSize(s => { calls++; return upTo(9)(s); }, 6, 12);
    expect(calls).toBeLessThanOrEqual(4);
  });

  it('טווח מנוון (min מעל max) לא נתקע ולא מחזיר אפס', () => {
    expect(fitFontSize(() => true, 20, 12)).toBe(12);
    expect(fitFontSize(() => false, 0, 0)).toBe(1);
  });
});

describe('FitText - הקופסה חוסמת את החריגה גם לפני שהמדידה רצה', () => {
  const markup = renderToStaticMarkup(<FitText max={12} min={7}>מרחב 305 סגור בגלל תקלת חשמל</FitText>);

  it('הטקסט מוצג במלואו - מקטינים, לא מסתירים', () => {
    expect(markup).toContain('מרחב 305 סגור בגלל תקלת חשמל');
  });

  it('overflow חסום - הודעה ארוכה נעצרת בגבול הכפתור ולא נשפכת על המפה', () => {
    expect(markup).toContain('overflow:hidden');
  });

  it('מתחיל מהגודל המבוקש - הרנדר הראשון אינו קטן ואז קופץ', () => {
    expect(markup).toContain('font-size:12px');
  });

  it('מילה ארוכה נשברת - אחרת אין גודל פונט שיכניס אותה לרוחב', () => {
    expect(markup).toContain('word-break:break-word');
  });
});
