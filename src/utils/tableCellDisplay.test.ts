import { describe, it, expect } from 'vitest';
import {
  normalizeCellValue, resolveCellDecor, cellDecorStyle, resolveCellIcon, parseIconRef,
  hasSecondLine, columnDisplayMode, BUILTIN_DISPLAY_ICONS, CELL_SHAPES, newDecorRule,
} from './tableCellDisplay';

describe('normalizeCellValue - ערך ריק בטבלה', () => {
  it('הסנטינלים של "אין ערך" נחשבים ריק', () => {
    expect(normalizeCellValue('—')).toBe('');
    expect(normalizeCellValue('–')).toBe('');
    expect(normalizeCellValue('-')).toBe('');
    expect(normalizeCellValue(null)).toBe('');
    expect(normalizeCellValue(undefined)).toBe('');
  });
  it('ערך אמיתי נשמר ומקוצץ', () => {
    expect(normalizeCellValue('  F-16 ')).toBe('F-16');
    expect(normalizeCellValue(119)).toBe('119');
  });
});

describe('resolveCellDecor - הכלל הראשון שמתאים מנצח', () => {
  const rules = [
    { id: 'a', match: '119', shape: 'circle' as const, color: '#ef4444' },
    { id: 'b', match: '*', shape: 'box' as const, color: '#22c55e' },
  ];
  it('ערך מפורש תופס לפני "כל ערך"', () => {
    expect(resolveCellDecor(rules, '119')?.id).toBe('a');
  });
  it('"*" תופס כל ערך שאינו ריק', () => {
    expect(resolveCellDecor(rules, '253')?.id).toBe('b');
  });
  it('ערך ריק (כולל סנטינל —) לא מקבל כלל "*"', () => {
    expect(resolveCellDecor(rules, '—')).toBeNull();
    expect(resolveCellDecor(rules, '')).toBeNull();
  });
  it('התאמה לא רגישה לרישיות ולרווחים', () => {
    const r = [{ id: 'x', match: 'f-16', shape: 'box' as const, color: '#000' }];
    expect(resolveCellDecor(r, ' F-16 ')?.id).toBe('x');
  });
  it('בלי כללים - אין עיצוב', () => {
    expect(resolveCellDecor(undefined, '119')).toBeNull();
    expect(resolveCellDecor([], '119')).toBeNull();
  });
  it('כלל ללא צורה וללא שינוי גופן אינו עושה דבר ולכן מדולג', () => {
    const r = [
      { id: 'empty', match: '*', shape: 'none' as const, color: '#000' },
      { id: 'real', match: '*', shape: 'box' as const, color: '#000' },
    ];
    expect(resolveCellDecor(r, 'X')?.id).toBe('real');
  });
});

describe('cellDecorStyle - צורה → CSS', () => {
  it('משבצת: מסגרת בצבע שנבחר בלי עיגול פינות', () => {
    const s = cellDecorStyle({ id: '1', match: '*', shape: 'box', color: '#ef4444' });
    expect(String(s.border)).toContain('#ef4444');
    expect(s.borderRadius).toBe(0);
  });
  it('עיגול: פינות מעוגלות לגמרי', () => {
    const s = cellDecorStyle({ id: '1', match: '*', shape: 'circle', color: '#ef4444' });
    expect(s.borderRadius).toBe('999px');
  });
  it('קו תחתון: רק גבול תחתון', () => {
    const s = cellDecorStyle({ id: '1', match: '*', shape: 'underline', color: '#ef4444' });
    expect(String(s.borderBottom)).toContain('#ef4444');
    expect(s.border).toBeUndefined();
  });
  it('מסגרת כפולה', () => {
    const s = cellDecorStyle({ id: '1', match: '*', shape: 'double', color: '#ef4444' });
    expect(String(s.border)).toContain('double');
  });
  it('רקע מלא: רקע בצבע וטקסט קריא', () => {
    const s = cellDecorStyle({ id: '1', match: '*', shape: 'fill', color: '#ef4444' });
    expect(s.background).toBe('#ef4444');
    expect(s.color).toBeTruthy();
  });
  it('מודגש והגדלה', () => {
    const s = cellDecorStyle({ id: '1', match: '*', shape: 'none', color: '#000', bold: true, scale: 1.5 });
    expect(s.fontWeight).toBe('bold');
    expect(s.fontSize).toBe('1.5em');
  });
  it('צבע טקסט נפרד גובר', () => {
    const s = cellDecorStyle({ id: '1', match: '*', shape: 'box', color: '#000', textColor: '#ff0000' });
    expect(s.color).toBe('#ff0000');
  });
  it('כל הצורות המוצעות בעורך מטופלות', () => {
    for (const shape of CELL_SHAPES) {
      expect(() => cellDecorStyle({ id: '1', match: '*', shape, color: '#000' })).not.toThrow();
    }
  });
});

describe('resolveCellIcon - ערך → אייקון', () => {
  const col = { display: 'icon' as const, iconMap: { 'F-16': 'builtin:f16', '119': 'img:7', '*': 'builtin:jet' } };
  it('מיפוי מפורש לא רגיש לרישיות', () => {
    expect(resolveCellIcon(col, 'f-16')).toBe('builtin:f16');
    expect(resolveCellIcon(col, '119')).toBe('img:7');
  });
  it('"*" הוא אייקון ברירת מחדל לכל ערך שאינו ריק', () => {
    expect(resolveCellIcon(col, 'C-130')).toBe('builtin:jet');
  });
  it('ערך ריק - בלי אייקון', () => {
    expect(resolveCellIcon(col, '—')).toBeNull();
  });
  it('תצוגת טקסט - אף פעם לא אייקון, גם אם יש מיפוי', () => {
    expect(resolveCellIcon({ ...col, display: 'text' }, 'F-16')).toBeNull();
    expect(resolveCellIcon({ iconMap: col.iconMap }, 'F-16')).toBeNull();
  });
  it('ערך ללא מיפוי וללא ברירת מחדל - בלי אייקון (נופל לטקסט)', () => {
    expect(resolveCellIcon({ display: 'iconText', iconMap: { A: 'builtin:f15' } }, 'B')).toBeNull();
  });
});

describe('parseIconRef', () => {
  it('אייקון מובנה', () => {
    expect(parseIconRef('builtin:f15')).toEqual({ kind: 'builtin', id: 'f15' });
  });
  it('תמונה מטבלת האייקונים', () => {
    expect(parseIconRef('img:12')).toEqual({ kind: 'image', id: '12' });
  });
  it('הפניה פגומה', () => {
    expect(parseIconRef('')).toBeNull();
    expect(parseIconRef('xyz')).toBeNull();
    expect(parseIconRef('builtin:nope')).toBeNull();
  });
  it('כל האייקונים המובנים ניתנים לפענוח', () => {
    for (const b of BUILTIN_DISPLAY_ICONS) expect(parseIconRef(`builtin:${b.id}`)?.kind).toBe('builtin');
  });
});

describe('שורה שנייה ומצב תצוגה', () => {
  it('שורה שנייה קיימת רק כשנבחר לה שדה', () => {
    expect(hasSecondLine({ key: 'callSign' })).toBe(false);
    expect(hasSecondLine({ key: 'callSign', second: { key: '' } })).toBe(false);
    expect(hasSecondLine({ key: 'callSign', second: { key: 'sq' } })).toBe(true);
  });
  it('עמודת טבלת בן לא מקבלת שורה שנייה', () => {
    expect(hasSecondLine({ key: 'table:aim', isTable: true, second: { key: 'sq' } })).toBe(false);
  });
  it('ברירת המחדל של התצוגה היא טקסט', () => {
    expect(columnDisplayMode({})).toBe('text');
    expect(columnDisplayMode({ display: 'bogus' as any })).toBe('text');
    expect(columnDisplayMode({ display: 'iconText' })).toBe('iconText');
  });
  it('כלל עיצוב חדש - מזהה ייחודי, כל ערך, משבצת', () => {
    const a = newDecorRule(); const b = newDecorRule();
    expect(a.id).not.toBe(b.id);
    expect(a.match).toBe('*');
    expect(a.shape).toBe('box');
  });
});
