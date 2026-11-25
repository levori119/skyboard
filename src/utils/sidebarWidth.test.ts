import { describe, it, expect } from 'vitest';
import { effectiveSidebarWidth, sidebarBaseFromWidth, parseSidebarBase, SIDEBAR_BASE_DEFAULT, SIDEBAR_BASE_MIN, SIDEBAR_BASE_MAX, SIDEBAR_WIDTH_MAX } from './sidebarWidth';

describe('רוחב פאנל פ"מ עמדה', () => {
  it('ברירת מחדל - 240 כמו היום', () => {
    expect(effectiveSidebarWidth(SIDEBAR_BASE_DEFAULT, 1)).toBe(240);
  });
  it('הגדלת הגופן מרחיבה באותו יחס', () => {
    expect(effectiveSidebarWidth(240, 1.5)).toBe(360);
    expect(effectiveSidebarWidth(300, 1.2)).toBe(360);
  });
  it('תקרה ורצפה', () => {
    expect(effectiveSidebarWidth(520, 1.8)).toBe(SIDEBAR_WIDTH_MAX);
    expect(effectiveSidebarWidth(100, 0.8)).toBe(SIDEBAR_BASE_MIN);
  });
  it('ספליטר: הרוחב שנגרר מתורגם לבסיס לפי הגופן', () => {
    expect(sidebarBaseFromWidth(360, 1.5)).toBe(240);
    expect(sidebarBaseFromWidth(5000, 1)).toBe(SIDEBAR_BASE_MAX);
    expect(sidebarBaseFromWidth(50, 1)).toBe(SIDEBAR_BASE_MIN);
  });
  it('ערך שמור לא תקין - ברירת המחדל', () => {
    expect(parseSidebarBase(null)).toBe(240);
    expect(parseSidebarBase('abc')).toBe(240);
    expect(parseSidebarBase('300')).toBe(300);
  });
});
