import { describe, it, expect, beforeEach } from 'vitest';
import { airPictureStore, pictureFresh } from './store';
import { STALE_AFTER_SEC } from './track';

// ── תמונה "טרייה" למנועים (מעקב הקפה, חריגה מאזור) ─────────────────────────
// דווח מהשטח (2026-09-15): דרקון 3 נחת ולא סומן נחת. הוא היה המטוס האחרון
// בשמיים; אחרי שנעלם התמונה התרוקנה, המאגר החזיר 304 (ה-ETag על התוכן בלבד),
// ו-`t` של הדגימה האחרונה לא התקדם. אחרי 6 שניות המנועים ראו "תמונה ישנה"
// וקפאו - וספירת 30 השניות של הנחיתה לא הושלמה לעולם.
describe('pictureFresh - טריות לפי אישור אחרון מהמאגר, לא לפי זמן הדגימה', () => {
  beforeEach(() => airPictureStore.reset());

  it('דגימה חדשה - טרייה, ואחרי הסף בלי שום תשובה - לא', () => {
    airPictureStore.setSnapshot(1000, 1, [], 50_000);
    expect(pictureFresh(airPictureStore.getSnapshot(), airPictureStore.lastConfirmedAt(), 50_000 + 2000)).toBe(true);
    expect(pictureFresh(airPictureStore.getSnapshot(), airPictureStore.lastConfirmedAt(), 50_000 + (STALE_AFTER_SEC + 1) * 1000)).toBe(false);
  });

  it('304 (לא השתנה) מאשר שהתמונה עדיין נכונה - טרייה, בלי לשנות את הדגימה', () => {
    airPictureStore.setSnapshot(1000, 1, [], 50_000);
    const before = airPictureStore.getSnapshot();
    airPictureStore.confirm(80_000);
    expect(airPictureStore.getSnapshot()).toBe(before);          // אין רינדור, אין שינוי t/receivedAt
    expect(pictureFresh(airPictureStore.getSnapshot(), airPictureStore.lastConfirmedAt(), 82_000)).toBe(true);
  });

  it('לא חיה (נפל / סביבה שגויה) - לא טרייה גם אם אושרה לאחרונה', () => {
    airPictureStore.setSnapshot(1000, 1, [], 50_000);
    airPictureStore.setStatus('down', 'x');
    expect(pictureFresh(airPictureStore.getSnapshot(), airPictureStore.lastConfirmedAt(), 50_500)).toBe(false);
  });

  it('טרם התקבלה דגימה - לא טרייה', () => {
    expect(pictureFresh(airPictureStore.getSnapshot(), airPictureStore.lastConfirmedAt(), 1000)).toBe(false);
  });
});
