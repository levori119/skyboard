import { describe, it, expect } from 'vitest';
import {
  normalizeCellValue, resolveCellDecor, cellDecorStyle, resolveCellIcon, parseIconRef,
  hasSecondLine, columnDisplayMode, BUILTIN_DISPLAY_ICONS, CELL_SHAPES, newDecorRule,
  parseCellTime, timeFromNowMs,
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

// ── עיצוב מותנה לפי זמן מעכשיו ────────────────────────────────────────
// "מעכשיו" = זמן התא פחות עכשיו (חתום): חיובי = בעתיד, שלילי = כבר עבר.
// כל הבדיקות עם now מוזרק - שעה מקומית קבועה, כדי שלא יהיו תלויות בשעון.
describe('parseCellTime - פענוח זמן מתא', () => {
  const now = new Date(2026, 10, 7, 14, 0, 0).getTime(); // 07/11/2026 14:00:00 מקומי
  it('HH:MM - היום, בשעה מקומית', () => {
    expect(parseCellTime('14:30', now)).toBe(new Date(2026, 10, 7, 14, 30).getTime());
    expect(parseCellTime('9:05', now)).toBe(new Date(2026, 10, 7, 9, 5).getTime());
  });
  it('HH:MM:SS', () => {
    expect(parseCellTime('14:00:45', now)).toBe(new Date(2026, 10, 7, 14, 0, 45).getTime());
  });
  it('מעבר חצות: 00:10 בשעה 23:50 הוא מחר, ו-23:50 בשעה 00:10 הוא אתמול', () => {
    const late = new Date(2026, 10, 7, 23, 50).getTime();
    expect(parseCellTime('00:10', late)).toBe(new Date(2026, 10, 8, 0, 10).getTime());
    const early = new Date(2026, 10, 8, 0, 10).getTime();
    expect(parseCellTime('23:50', early)).toBe(new Date(2026, 10, 7, 23, 50).getTime());
  });
  it('HH:MM עם Z - שעה ב-UTC', () => {
    const utcNow = Date.UTC(2026, 10, 7, 12, 0);
    expect(parseCellTime('12:30Z', utcNow)).toBe(Date.UTC(2026, 10, 7, 12, 30));
  });
  it('YYYY-MM-DD HH:MM - שעה מקומית', () => {
    expect(parseCellTime('2026-11-08 06:15', now)).toBe(new Date(2026, 10, 8, 6, 15).getTime());
  });
  it('YYYY-MM-DD - תחילת היום המקומי (לא UTC)', () => {
    expect(parseCellTime('2026-11-09', now)).toBe(new Date(2026, 10, 9, 0, 0).getTime());
  });
  it('ISO מלא עם אזור זמן', () => {
    expect(parseCellTime('2026-11-07T12:30:00Z', now)).toBe(Date.UTC(2026, 10, 7, 12, 30));
    expect(parseCellTime('2026-11-07T14:30:00+02:00', now)).toBe(Date.UTC(2026, 10, 7, 12, 30));
  });
  it('ISO בלי אזור זמן - מקומי', () => {
    expect(parseCellTime('2026-11-07T14:30', now)).toBe(new Date(2026, 10, 7, 14, 30).getTime());
  });
  it('ערך שאינו זמן / ריק / שעה לא חוקית - null', () => {
    for (const v of ['', '—', 'F-16', '119', '1430', '25:00', '14:60', '2026-13-01', '2026-02-30', null, undefined]) {
      expect(parseCellTime(v as any, now)).toBeNull();
    }
  });
});

describe('resolveCellDecor - כלל "זמן מעכשיו"', () => {
  const now = new Date(2026, 10, 7, 14, 0, 0).getTime();
  const rule = (cmp: 'gt' | 'lt', amount: number, unit: 's' | 'm' | 'h', id = 'r') =>
    ({ id, match: '*', cond: 'timeFromNow' as const, cmp, amount, unit, shape: 'box' as const, color: '#ef4444' });

  it('"פחות מ-10 דקות": בעוד 5 דקות - מתאים, בעוד 20 - לא', () => {
    expect(resolveCellDecor([rule('lt', 10, 'm')], '14:05', now)?.id).toBe('r');
    expect(resolveCellDecor([rule('lt', 10, 'm')], '14:20', now)).toBeNull();
  });
  it('"פחות מ" כולל זמן שכבר עבר (הפרש שלילי) - למשל המראה שאיחרה', () => {
    expect(resolveCellDecor([rule('lt', 10, 'm')], '13:30', now)?.id).toBe('r');
  });
  it('"יותר מ-1 שעה": בעוד שעתיים - מתאים, בעוד חצי שעה ובעבר - לא', () => {
    expect(resolveCellDecor([rule('gt', 1, 'h')], '16:00', now)?.id).toBe('r');
    expect(resolveCellDecor([rule('gt', 1, 'h')], '14:30', now)).toBeNull();
    expect(resolveCellDecor([rule('gt', 1, 'h')], '12:00', now)).toBeNull();
  });
  it('כמות שלילית = לפני: "פחות מ -30 דקות" = עבר לפני יותר מחצי שעה', () => {
    expect(resolveCellDecor([rule('lt', -30, 'm')], '13:00', now)?.id).toBe('r');
    expect(resolveCellDecor([rule('lt', -30, 'm')], '13:45', now)).toBeNull();
  });
  it('שניות', () => {
    expect(resolveCellDecor([rule('lt', 90, 's')], '14:01:00', now)?.id).toBe('r');
    expect(resolveCellDecor([rule('lt', 30, 's')], '14:01:00', now)).toBeNull();
  });
  it('הגבול עצמו אינו מתאים (השוואה חדה)', () => {
    expect(resolveCellDecor([rule('lt', 10, 'm')], '14:10', now)).toBeNull();
    expect(resolveCellDecor([rule('gt', 10, 'm')], '14:10', now)).toBeNull();
  });
  it('אותו כלל משתנה עם הזמן בלי שינוי בנתון', () => {
    const r = [rule('lt', 10, 'm')];
    expect(resolveCellDecor(r, '14:30', now)).toBeNull();
    expect(resolveCellDecor(r, '14:30', now + 25 * 60_000)?.id).toBe('r');
  });
  it('ערך שאינו זמן או תא ריק - הכלל לא מתאים, והכלל הבא נבדק', () => {
    const r = [rule('lt', 10, 'm', 'time'), { id: 'any', match: '*', shape: 'box' as const, color: '#000' }];
    expect(resolveCellDecor(r, 'F-16', now)?.id).toBe('any');
    expect(resolveCellDecor([rule('lt', 10, 'm')], '—', now)).toBeNull();
  });
  it('כמות חסרה / לא מספר - הכלל לא מתאים', () => {
    expect(resolveCellDecor([{ ...rule('lt', 10, 'm'), amount: undefined as any }], '14:05', now)).toBeNull();
    expect(resolveCellDecor([{ ...rule('lt', 10, 'm'), amount: NaN }], '14:05', now)).toBeNull();
  });
  it('כלל ישן בלי cond מתנהג כהתאמת ערך, גם כשהערך נראה כמו שעה', () => {
    expect(resolveCellDecor([{ id: 'v', match: '14:05', shape: 'box', color: '#000' }], '14:05', now)?.id).toBe('v');
  });
  it('timeFromNowMs - הפרש חתום במילישניות', () => {
    expect(timeFromNowMs('14:05', now)).toBe(5 * 60_000);
    expect(timeFromNowMs('13:55', now)).toBe(-5 * 60_000);
    expect(timeFromNowMs('abc', now)).toBeNull();
  });
});
