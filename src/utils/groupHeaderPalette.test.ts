import { describe, it, expect } from 'vitest';
import { GROUP_HEADER_COLORS, groupHeaderStyle, isGroupHeaderColor } from './groupHeaderPalette';

// מה שנבדק: בחירת צבע לכותרת הקיבוץ - ברירת המחדל לא משתנה, וכל צבע קריא בכל תמה.
describe('groupHeaderStyle', () => {
  it('ברירת המחדל (סגול) - הצבעים שהיו לפני הבחירה', () => {
    expect(groupHeaderStyle('violet', 'dark')).toMatchObject({ solid: '#6d28d9', bg: '#1e1b4b' });
    expect(groupHeaderStyle('violet', 'ocean')).toMatchObject({ solid: '#0ea5e9', bg: '#0369a1' });
    expect(groupHeaderStyle('violet', 'light')).toMatchObject({ solid: '#7c3aed', bg: '#ede9fe' });
  });
  it('כל צבע בכל תמה - טקסט שונה מהרקע', () => {
    for (const c of GROUP_HEADER_COLORS) for (const m of ['dark', 'light', 'ocean']) {
      const s = groupHeaderStyle(c, m);
      expect(s.fg).not.toBe(s.bg);
    }
  });
  it('אדום לא בפלטה (שמור לקונפליקט)', () => {
    expect(isGroupHeaderColor('red')).toBe(false);
    expect(isGroupHeaderColor('amber')).toBe(true);
  });
});
