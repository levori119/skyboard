import { describe, it, expect } from 'vitest';
import { compareAirborneThenTakeoff, takeoffMs } from './stripOrder';

const s = (callSign: string, airborne: boolean, takeoff_time: string | null) => ({ callSign, airborne, takeoff_time });
const order = (arr: any[]) => [...arr].sort(compareAirborneThenTakeoff).map(x => x.callSign);

describe('סדר רשימת פ"מ רגילה', () => {
  it('מי שבאוויר לפני מי שעל הקרקע, גם אם המראתו מאוחרת יותר', () => {
    const list = [s('גד', false, '2026-08-02T09:00:00Z'), s('אלף', true, '2026-08-02T12:00:00Z')];
    expect(order(list)).toEqual(['אלף', 'גד']);
  });

  it('בתוך מי שבאוויר - לפי זמן המראה מהמוקדם למאוחר', () => {
    const list = [s('ב', true, '2026-08-02T11:00:00Z'), s('א', true, '2026-08-02T08:30:00Z'), s('ג', true, '2026-08-02T15:45:00Z')];
    expect(order(list)).toEqual(['א', 'ב', 'ג']);
  });

  it('בתוך מי שעל הקרקע - לפי זמן המראה המתוכנן מהמוקדם למאוחר', () => {
    const list = [s('ב', false, '2026-08-02T11:00:00Z'), s('א', false, '2026-08-02T08:30:00Z'), s('ג', false, '2026-08-02T15:45:00Z')];
    expect(order(list)).toEqual(['א', 'ב', 'ג']);
  });

  it('שתי הקבוצות יחד: כל האוויריים ממוינים, ואז כל הקרקעיים ממוינים', () => {
    const list = [
      s('קרקע-מאוחר', false, '2026-08-02T18:00:00Z'),
      s('אוויר-מאוחר', true, '2026-08-02T13:00:00Z'),
      s('קרקע-מוקדם', false, '2026-08-02T07:00:00Z'),
      s('אוויר-מוקדם', true, '2026-08-02T06:00:00Z'),
    ];
    expect(order(list)).toEqual(['אוויר-מוקדם', 'אוויר-מאוחר', 'קרקע-מוקדם', 'קרקע-מאוחר']);
  });

  it('פ"מ בלי זמן המראה נדחף לסוף הקבוצה שלו', () => {
    const list = [s('ללא-זמן', false, null), s('עם-זמן', false, '2026-08-02T09:00:00Z'), s('אוויר', true, null)];
    expect(order(list)).toEqual(['אוויר', 'עם-זמן', 'ללא-זמן']);
  });

  it('זמן לא תקין נחשב כחסר', () => {
    expect(takeoffMs({ takeoff_time: 'not-a-date' })).toBe(Infinity);
    expect(takeoffMs({ takeoff_time: null })).toBe(Infinity);
    expect(takeoffMs({ takeoff_time: '2026-08-02T09:00:00Z' })).toBe(new Date('2026-08-02T09:00:00Z').getTime());
  });
});
