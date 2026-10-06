import { describe, it, expect } from 'vitest';
import { flyoutShownOn, toggleFlyout } from './mapToolFlyout';

describe('פאנלים של כלים משותפים בסרגל המפה', () => {
  it('בלי בעלים - מוצג בכל סרגל (התנהגות קודמת)', () => {
    expect(flyoutShownOn({}, 'closures', 'a')).toBe(true);
    expect(flyoutShownOn({}, 'closures', 'b')).toBe(true);
  });

  it('פתיחה במפה א - מוצג רק בסרגל של א', () => {
    const r = toggleFlyout(false, {}, 'pinOnMap', 'a');
    expect(r.open).toBe(true);
    expect(flyoutShownOn(r.owners, 'pinOnMap', 'a')).toBe(true);
    expect(flyoutShownOn(r.owners, 'pinOnMap', 'b')).toBe(false);
  });

  it('לחיצה שנייה באותה מפה סוגרת', () => {
    const r = toggleFlyout(true, { pinOnMap: 'a' }, 'pinOnMap', 'a');
    expect(r.open).toBe(false);
  });

  it('לחיצה במפה ב כשהפאנל פתוח ב-א - עובר ל-ב ונשאר פתוח', () => {
    const r = toggleFlyout(true, { airPicture: 'a' }, 'airPicture', 'b');
    expect(r.open).toBe(true);
    expect(flyoutShownOn(r.owners, 'airPicture', 'b')).toBe(true);
    expect(flyoutShownOn(r.owners, 'airPicture', 'a')).toBe(false);
  });

  it('הבעלים של פאנל אחד לא מזיזים פאנל אחר', () => {
    const r = toggleFlyout(false, { closures: 'a' }, 'pinType', 'b');
    expect(flyoutShownOn(r.owners, 'closures', 'a')).toBe(true);
    expect(flyoutShownOn(r.owners, 'closures', 'b')).toBe(false);
  });
});
