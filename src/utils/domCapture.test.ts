// צילום DOM (html-to-image) - אילו אלמנטים לא נכנסים לצילום, ולמה.
// כל אחד מהם הפיל בשחזור את הצילום כולו ("צילום המסך נכשל"):
//   iframe מאותו מקור (חלון הצצה לעמדה) - הספרייה משכפלת עמדה שלמה, נתקעת ~200 ש' ונכשלת
//   canvas מזוהם (תוכן ממקור זר) - toDataURL זורק SecurityError
import { describe, it, expect } from 'vitest';
import { isUncapturable, captureRatios } from './domCapture';

const el = (tagName: string, attrs: Record<string, string> = {}) => ({
  nodeType: 1,
  tagName,
  hasAttribute: (n: string) => n in attrs,
});

describe('isUncapturable', () => {
  it('data-nosnapshot - לא נכנס (טופס התחקיר, הודעת הצילום)', () => {
    expect(isUncapturable(el('DIV', { 'data-nosnapshot': '' }))).toBe(true);
  });

  it('iframe / video / object / embed - לא נכנסים', () => {
    for (const t of ['IFRAME', 'VIDEO', 'OBJECT', 'EMBED']) expect(isUncapturable(el(t))).toBe(true);
  });

  it('canvas מזוהם - לא נכנס; canvas תקין - נכנס', () => {
    expect(isUncapturable(el('CANVAS'), () => true)).toBe(true);
    expect(isUncapturable(el('CANVAS'), () => false)).toBe(false);
  });

  it('אלמנט רגיל וצומת טקסט - נכנסים', () => {
    expect(isUncapturable(el('DIV'))).toBe(false);
    expect(isUncapturable({ nodeType: 3 })).toBe(false);
  });
});

describe('captureRatios', () => {
  it('ניסיון חוזר ברזולוציה נמוכה יותר, בלי כפילויות', () => {
    expect(captureRatios(2)).toEqual([2, 1]);
    expect(captureRatios(1)).toEqual([1, 0.5]);
    expect(captureRatios(0.5)).toEqual([0.5]);
  });
});
