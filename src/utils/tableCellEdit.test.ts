import { describe, it, expect, vi } from 'vitest';
import {
  cellEditKeyAction, insertNewline, editableCellUnderline, handleCellEditKeyDown,
  defaultEditableCols, tableCellScroll,
} from './tableCellEdit';

describe('cellEditKeyAction', () => {
  it('ENTER רגיל = שמירה ויציאה, בשדה חד-שורתי וברב-שורתי כאחד', () => {
    expect(cellEditKeyAction({ key: 'Enter' }, false)).toBe('save');
    expect(cellEditKeyAction({ key: 'Enter' }, true)).toBe('save');
  });

  it('ALT+ENTER יורד שורה רק בשדה רב-שורתי', () => {
    expect(cellEditKeyAction({ key: 'Enter', altKey: true }, true)).toBe('newline');
    expect(cellEditKeyAction({ key: 'Enter', altKey: true }, false)).toBe('ignore');
  });

  it('SHIFT+ENTER מתנהג כמו ALT+ENTER', () => {
    expect(cellEditKeyAction({ key: 'Enter', shiftKey: true }, true)).toBe('newline');
    expect(cellEditKeyAction({ key: 'Enter', shiftKey: true }, false)).toBe('ignore');
  });

  it('כל מקש אחר אינו מטופל', () => {
    expect(cellEditKeyAction({ key: 'a' }, true)).toBe('ignore');
    expect(cellEditKeyAction({ key: 'Escape' }, true)).toBe('ignore');
  });
});

describe('insertNewline', () => {
  it('מכניס ירידת שורה במקום הסמן', () => {
    expect(insertNewline('אבג', 2, 2)).toEqual({ value: 'אב\nג', caret: 3 });
  });

  it('מחליף טקסט מסומן', () => {
    expect(insertNewline('abcd', 1, 3)).toEqual({ value: 'a\nd', caret: 2 });
  });
});

describe('editableCellUnderline', () => {
  it('קו תחתון כשהתא פתוח לעריכה, ושום דבר כשלא', () => {
    expect(editableCellUnderline('#475569')).toEqual({ borderBottom: '1px dashed #475569' });
    expect(editableCellUnderline('#475569', false)).toEqual({});
  });
});

describe('handleCellEditKeyDown', () => {
  const fakeEvent = (key: string, mods: { altKey?: boolean }, el: any) => ({
    key, ...mods, preventDefault: vi.fn(), currentTarget: el,
  }) as any;

  it('ENTER מוציא את הפוקוס (וה-onBlur הקיים שומר)', () => {
    const el = { blur: vi.fn(), value: 'x', selectionStart: 1, selectionEnd: 1 };
    const e = fakeEvent('Enter', {}, el);
    handleCellEditKeyDown(e, true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(el.blur).toHaveBeenCalled();
    expect(el.value).toBe('x');
  });

  it('ALT+ENTER כותב \n לשדה בלי לצאת ממנו', () => {
    const el = { blur: vi.fn(), value: 'אב', selectionStart: 2, selectionEnd: 2 };
    const e = fakeEvent('Enter', { altKey: true }, el);
    handleCellEditKeyDown(e, true);
    expect(el.value).toBe('אב\n');
    expect(el.selectionStart).toBe(3);
    expect(el.blur).not.toHaveBeenCalled();
  });

  it('ALT+ENTER בשדה חד-שורתי אינו מוסיף שורה ואינו שומר', () => {
    const el = { blur: vi.fn(), value: 'אב', selectionStart: 2, selectionEnd: 2 };
    const e = fakeEvent('Enter', { altKey: true }, el);
    handleCellEditKeyDown(e, false);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(el.value).toBe('אב');
    expect(el.blur).not.toHaveBeenCalled();
  });

  it('מקש אחר עובר כרגיל', () => {
    const el = { blur: vi.fn(), value: 'a', selectionStart: 1, selectionEnd: 1 };
    const e = fakeEvent('a', {}, el);
    handleCellEditKeyDown(e, true);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(el.blur).not.toHaveBeenCalled();
  });
});

describe('defaultEditableCols', () => {
  const COLS = [
    { key: 'callSign', field: 'callSign', editable: 'none' },
    { key: 'alt', field: 'alt', editable: 'keyboard' },
    { key: 'sector', field: 'sector', editable: 'dropdown' },
    { key: 'notes', field: 'notes', editable: 'handwriting' },
    { key: 'table:aim_points', editable: 'keyboard', isTable: true },
    { key: '', field: '', editable: 'keyboard' },
  ];

  it('כל עמודה שהוגדרה בר-עריכה פתוחה לכתיבה כברירת מחדל', () => {
    const set = defaultEditableCols(COLS);
    expect(set.has('alt')).toBe(true);
    expect(set.has('sector')).toBe(true);
    expect(set.has('notes')).toBe(true);
  });

  it('עמודה שאינה בת-עריכה, טבלת בן ועמודה בלי מפתח - נשארות בחוץ', () => {
    const set = defaultEditableCols(COLS);
    expect(set.has('callSign')).toBe(false);
    expect(set.has('table:aim_points')).toBe(false);
    expect(set.has('')).toBe(false);
    expect(set.size).toBe(3);
  });

  it('מוד בלי עמודות אינו מפיל', () => {
    expect(defaultEditableCols(null).size).toBe(0);
    expect(defaultEditableCols(undefined).size).toBe(0);
    expect(defaultEditableCols([]).size).toBe(0);
  });
});

describe('tableCellScroll', () => {
  it('תקרה של שלוש שורות וגלילה בתוך התא', () => {
    const st = tableCellScroll();
    expect(st.maxHeight).toBe('3.90em');
    expect(st.overflowY).toBe('auto');
    expect(st.lineHeight).toBe(1.3);
  });

  it('מספר שורות אחר מזיז את התקרה בלבד', () => {
    expect(tableCellScroll(1).maxHeight).toBe('1.30em');
    expect(tableCellScroll(5).maxHeight).toBe('6.50em');
  });
});
