import { describe, it, expect, beforeEach } from 'vitest';
import { __resetNetStatus, getNetSnapshot, markOnline, markReachable, noteFailure, FAILURE_THRESHOLD } from './netStatus';

// סיבת ה"מידע אינו מתעדכן": בלעדיה החיווי כתב "השרת מחזיר שגיאה" גם כשבקשות
// פשוט נתקעו ברשת (נמדד ב-2026-11-26: בקשה מ-20 נתקעה 21 שניות, השרת תקין)
describe('netStatus - degradedReason', () => {
  beforeEach(() => __resetNetStatus());

  it('תקין: אין סיבה', () => {
    markOnline(1000);
    expect(getNetSnapshot().degradedReason).toBeNull();
  });
  it('שגיאת שרת (5xx) = server', () => {
    markReachable(1000);
    expect(getNetSnapshot().degradedReason).toBe('server');
    expect(getNetSnapshot().online).toBe(true);
  });
  it('בקשה שנתקעה/נפלה ברשת מתחת לסף = network, והעמדה עדיין "מחוברת"', () => {
    noteFailure(1000, 1000);
    expect(getNetSnapshot().degradedReason).toBe('network');
    expect(getNetSnapshot().online).toBe(true);
    expect(FAILURE_THRESHOLD).toBeGreaterThan(1);
  });
  it('האירוע האחרון קובע, ותשובה טרייה מנקה', () => {
    noteFailure(1000, 1000);
    markReachable(2000);
    expect(getNetSnapshot().degradedReason).toBe('server');
    noteFailure(3000, 3000);
    expect(getNetSnapshot().degradedReason).toBe('network');
    markOnline(4000);
    expect(getNetSnapshot().degradedReason).toBeNull();
  });
});
