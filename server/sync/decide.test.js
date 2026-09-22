// "האחרון מנצח" - ההכרעה עצמה, כיחידה טהורה.
//
// זו שורת ההחלטה שקובעת מה יהיה על המסך של כל העמדות אחרי נתק, ולכן היא
// נבדקת בנפרד מכל השאר: תיקו, חותמת חסרה והפרש שעונים הם בדיוק המקומות שבהם
// מדיניות כזו נשברת בשקט.
import { describe, it, expect } from 'vitest';
import { decideByTime } from './apply.js';

const T = (iso) => new Date(iso).toISOString();
const BASE = '2026-09-22T10:00:00.000Z';
const LATER = '2026-09-22T10:05:00.000Z';

describe('decideByTime', () => {
  it('העמדה עדכנה מאוחר יותר - הגרסה שלה', () => {
    expect(decideByTime(T(LATER), T(BASE))).toBe('mine');
  });

  it('המרכז עודכן מאוחר יותר - הגרסה שלו', () => {
    expect(decideByTime(T(BASE), T(LATER))).toBe('theirs');
  });

  it('תיקו נחשב לטובת העמדה - זה מה שהמפעיל ראה לאחרונה', () => {
    expect(decideByTime(T(BASE), T(BASE))).toBe('mine');
  });

  it('בלי חותמת אין הכרעה אוטומטית - ורק אז עולה לבקר', () => {
    expect(decideByTime(null, T(BASE))).toBeNull();
    expect(decideByTime(T(BASE), null)).toBeNull();
    expect(decideByTime('לא תאריך', T(BASE))).toBeNull();
  });

  it('שעון עמדה שמפגר בשעה - בלי תיקון הוא מפסיד תמיד', () => {
    const stationClock = '2026-09-22T09:04:00.000Z'; // בפועל 10:04, אבל השעון מפגר
    expect(decideByTime(stationClock, T(BASE))).toBe('theirs');
    // עם התיקון (+שעה) העמדה מנצחת, כי באמת עדכנה אחרי המרכז
    expect(decideByTime(stationClock, T(BASE), 3600_000)).toBe('mine');
  });

  it('שעון עמדה שמקדים בשעה - בלי תיקון הוא מנצח תמיד', () => {
    const stationClock = '2026-09-22T11:00:00.000Z'; // בפועל 10:00
    expect(decideByTime(stationClock, T(LATER))).toBe('mine');
    // עם התיקון (-שעה) המרכז מנצח, כי הוא באמת עודכן אחרי
    expect(decideByTime(stationClock, T(LATER), -3600_000)).toBe('theirs');
  });

  it('מקבל גם אובייקט Date (כך `updated_at` חוזר מ-pg)', () => {
    expect(decideByTime(new Date(LATER), new Date(BASE))).toBe('mine');
  });
});
