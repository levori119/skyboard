import { describe, it, expect } from 'vitest';
import type { StripControl } from '../types/stripControls';
import {
  controlZero, normalizeControlValue, resolveControlValue, readControlValue,
  nextButtonValue, toggleFlagValue, toggleMultiValue, controlDisplayText,
  controlValueMatches, resolveControlStyle, isHandwritingValue,
  collectLayoutControls, catalogByKey, resolveControlRef, globalControls,
  controlFieldKey, parseCommaList,
} from './stripControls';
import type { SGNode } from '../types/stripGrid';

const ctl = (over: Partial<StripControl> = {}): StripControl =>
  ({ id: 'c1', key: 'status', type: 'button', scope: 'window', ...over });

// ─── §3 ב"מ וכלל "אין NULL" ─────────────────────────────────────────────────

describe('controlZero', () => {
  it('אפס-הסוג לכל סוג פקד', () => {
    expect(controlZero('button')).toBe('');
    expect(controlZero('field')).toBe('');
    expect(controlZero('select')).toBe('');
    expect(controlZero('flag')).toBe(false);
    expect(controlZero('multiselect')).toEqual([]);
  });
});

describe('resolveControlValue', () => {
  it('מקרה 1: ערך שמור מנצח', () => {
    expect(resolveControlValue(ctl({ defaultValue: 'CLR' }), 'TXI')).toBe('TXI');
  });

  it('מקרה 2: אין ערך שמור - ב"מ', () => {
    expect(resolveControlValue(ctl({ defaultValue: 'CLR' }), undefined)).toBe('CLR');
  });

  it('מקרה 3: אין ערך ואין ב"מ - אפס-הסוג', () => {
    expect(resolveControlValue(ctl(), undefined)).toBe('');
    expect(resolveControlValue(ctl({ type: 'flag' }), undefined)).toBe(false);
    expect(resolveControlValue(ctl({ type: 'multiselect' }), undefined)).toEqual([]);
  });

  it('מקרה 6: דגל בלי ב"מ הוא תמיד FALSE, לעולם לא null', () => {
    expect(resolveControlValue(ctl({ type: 'flag' }), null)).toBe(false);
    expect(resolveControlValue(ctl({ type: 'flag', defaultValue: true }), null)).toBe(true);
  });

  // ההבחנה הקריטית: "נוקה במפורש" אינו "לא נקבע מעולם"
  it('ערך שנוקה במפורש אינו נופל חזרה לב"מ', () => {
    expect(resolveControlValue(ctl({ type: 'flag', defaultValue: true }), false)).toBe(false);
    expect(resolveControlValue(ctl({ type: 'select', defaultValue: 'CLR' }), '')).toBe('');
    expect(resolveControlValue(ctl({ type: 'multiselect', defaultValue: ['A'] }), [])).toEqual([]);
  });

  it('מנרמל ערך היסטורי שנשמר בסוג אחר', () => {
    expect(resolveControlValue(ctl({ type: 'flag' }), 'true')).toBe(true);
    expect(resolveControlValue(ctl({ type: 'flag' }), 1)).toBe(true);
    expect(resolveControlValue(ctl({ type: 'multiselect' }), 'A, B')).toEqual(['A', 'B']);
    expect(resolveControlValue(ctl({ type: 'button' }), 7)).toBe('7');
  });
});

describe('normalizeControlValue', () => {
  it('דגל: רק ערכי אמת מוכרים הם TRUE', () => {
    expect(normalizeControlValue('flag', false)).toBe(false);
    expect(normalizeControlValue('flag', '')).toBe(false);
    expect(normalizeControlValue('flag', 'false')).toBe(false);
    expect(normalizeControlValue('flag', '1')).toBe(true);
  });

  it('תפריט מרובה: מסנן ערכים ריקים', () => {
    expect(normalizeControlValue('multiselect', ['A', '', 'B'])).toEqual(['A', 'B']);
    expect(normalizeControlValue('multiselect', '')).toEqual([]);
  });
});

// ─── §4 היקף ────────────────────────────────────────────────────────────────

describe('readControlValue', () => {
  const strip = { id: 1, custom_fields: { status: 'GLB' } };
  const windowValues = { status: 'WIN' };

  it('פקד גלובלי קורא מהפ"מ', () => {
    expect(readControlValue(ctl({ scope: 'global' }), strip, windowValues)).toBe('GLB');
  });

  it('פקד פנימי קורא מערכי החלון', () => {
    expect(readControlValue(ctl({ scope: 'window' }), strip, windowValues)).toBe('WIN');
  });

  it('מקרה 4: פקד פנימי בלוח אחר מתאפס לב"מ', () => {
    expect(readControlValue(ctl({ scope: 'window', defaultValue: 'CLR' }), strip, {})).toBe('CLR');
  });

  it('פ"מ בלי custom_fields אינו מפיל את הקריאה', () => {
    expect(readControlValue(ctl({ scope: 'global', defaultValue: 'CLR' }), {}, undefined)).toBe('CLR');
  });
});

// ─── §2.1 כפתור מחזורי ──────────────────────────────────────────────────────

describe('nextButtonValue', () => {
  const b = ctl({ values: ['CLR', 'TXI', 'LUW'] });

  it('מתקדם ברשימה ומתגלגל בסוף', () => {
    expect(nextButtonValue(b, 'CLR')).toBe('TXI');
    expect(nextButtonValue(b, 'TXI')).toBe('LUW');
    expect(nextButtonValue(b, 'LUW')).toBe('CLR');
  });

  it('מקרה 5: ערך שאינו ברשימה קופץ לערך הראשון', () => {
    expect(nextButtonValue(b, 'שרד-מרשימה-ישנה')).toBe('CLR');
    expect(nextButtonValue(b, '')).toBe('CLR');
  });

  it('רשימה בת ערך אחד היא כפתור סטטי', () => {
    expect(nextButtonValue(ctl({ values: ['ONLY'] }), 'ONLY')).toBe('ONLY');
  });

  it('רשימה ריקה אינה משנה דבר', () => {
    expect(nextButtonValue(ctl({ values: [] }), 'X')).toBe('X');
  });
});

// ─── §2 דגל ותפריט מרובה ────────────────────────────────────────────────────

describe('toggleFlagValue', () => {
  it('הופך TRUE↔FALSE', () => {
    expect(toggleFlagValue(true)).toBe(false);
    expect(toggleFlagValue(false)).toBe(true);
  });
});

describe('toggleMultiValue', () => {
  const m = ctl({ type: 'multiselect', values: ['A', 'B', 'C'] });

  it('מוסיף ומסיר', () => {
    expect(toggleMultiValue(m, [], 'B')).toEqual(['B']);
    expect(toggleMultiValue(m, ['A', 'B'], 'B')).toEqual(['A']);
  });

  it('שומר על סדר ההגדרה ולא על סדר הלחיצות', () => {
    expect(toggleMultiValue(m, ['C'], 'A')).toEqual(['A', 'C']);
  });

  it('ערך ריק מנקה את כל הבחירות', () => {
    expect(toggleMultiValue(m, ['A', 'B'], '')).toEqual([]);
  });

  it('ערך שאינו ברשימה נשמר בסוף ולא נעלם', () => {
    expect(toggleMultiValue(m, ['A'], 'ישן')).toEqual(['A', 'ישן']);
  });
});

// ─── §5 עיצוב מותנה ─────────────────────────────────────────────────────────

describe('controlValueMatches', () => {
  it('ריק ולא-ריק', () => {
    expect(controlValueMatches('button', '', '')).toBe(true);
    expect(controlValueMatches('button', 'TXI', '')).toBe(false);
    expect(controlValueMatches('button', 'TXI', '*')).toBe(true);
    expect(controlValueMatches('button', '', '*')).toBe(false);
  });

  it('התאמת ערך אינה תלוית רישיות ורווחים', () => {
    expect(controlValueMatches('button', 'txi', ' TXI ')).toBe(true);
  });

  it('דגל', () => {
    expect(controlValueMatches('flag', true, 'true')).toBe(true);
    expect(controlValueMatches('flag', false, 'false')).toBe(true);
    expect(controlValueMatches('flag', false, 'true')).toBe(false);
    expect(controlValueMatches('flag', true, '*')).toBe(true);
  });

  it('תפריט מרובה מתאים בהכלה', () => {
    expect(controlValueMatches('multiselect', ['A', 'B'], 'B')).toBe(true);
    expect(controlValueMatches('multiselect', ['A'], 'B')).toBe(false);
    expect(controlValueMatches('multiselect', [], '')).toBe(true);
    expect(controlValueMatches('multiselect', ['A'], '*')).toBe(true);
  });
});

describe('resolveControlStyle', () => {
  const c = ctl({
    styles: [
      { id: 's1', match: 'TXI', bg: '#111' },
      { id: 's2', match: '*',   bg: '#222' },
    ],
  });

  it('הכלל הראשון שמתאים מנצח', () => {
    expect(resolveControlStyle(c, 'TXI')?.bg).toBe('#111');
    expect(resolveControlStyle(c, 'CLR')?.bg).toBe('#222');
  });

  it('אין התאמה - אין עיצוב', () => {
    expect(resolveControlStyle(c, '')).toBeNull();
    expect(resolveControlStyle(ctl(), 'TXI')).toBeNull();
  });
});

// ─── §2.2 כתב יד ────────────────────────────────────────────────────────────

describe('isHandwritingValue', () => {
  it('מזהה דיו לפי data URI', () => {
    expect(isHandwritingValue('data:image/png;base64,AAA')).toBe(true);
    expect(isHandwritingValue('TXI')).toBe(false);
    expect(isHandwritingValue(true)).toBe(false);
  });
});

describe('controlDisplayText', () => {
  it('תפריט מרובה מוצג מופרד בפסיק', () => {
    expect(controlDisplayText(ctl({ type: 'multiselect' }), ['A', 'B'])).toBe('A, B');
  });

  it('דגל מציג את התווית, ובלעדיה סימון מצב', () => {
    expect(controlDisplayText(ctl({ type: 'flag', label: 'דחוף' }), true)).toBe('דחוף');
    expect(controlDisplayText(ctl({ type: 'flag' }), true)).toBe('✓');
    expect(controlDisplayText(ctl({ type: 'flag' }), false)).toBe('–');
  });

  it('כתב יד אינו מוצג כטקסט גולמי', () => {
    expect(controlDisplayText(ctl({ type: 'field' }), 'data:image/png;base64,AAA')).toBe('');
  });
});

// ─── §6 איסוף פקדים מעץ הפריסה, ו-§8.2 התנגשות מפתחות ──────────────────────

describe('collectLayoutControls', () => {
  const layout: SGNode = {
    id: 'root', type: 'split', direction: 'h', sizes: [50, 50],
    children: [
      { id: 'a', type: 'cell', fieldKey: '', controls: [{ id: 'x', fieldKey: 'k1' }] },
      {
        id: 'b', type: 'split', direction: 'v', sizes: [50, 50],
        children: [
          { id: 'c', type: 'cell', fieldKey: 'callSign' },
          { id: 'd', type: 'cell', fieldKey: '', controls: [{ id: 'y', fieldKey: 'k2' }] },
        ],
      },
    ],
  };

  it('אוסף הפניות מכל עומק בעץ', () => {
    expect(collectLayoutControls(layout).map(r => r.fieldKey)).toEqual(['k1', 'k2']);
  });

  it('עץ ריק או חסר אינו מפיל', () => {
    expect(collectLayoutControls(null)).toEqual([]);
  });
});

// ─── קטלוג: ההגדרה במקום אחד, ההצבה מפנה אליה ───────────────────────────────

describe('resolveControlRef', () => {
  const byKey = catalogByKey([ctl({ id: '7', key: 'status', label: 'סטטוס', values: ['CLR'] })]);

  it('ההגדרה מגיעה מהקטלוג', () => {
    const c = resolveControlRef({ id: 'p1', fieldKey: 'status' }, byKey);
    expect(c?.label).toBe('סטטוס');
    expect(c?.values).toEqual(['CLR']);
  });

  it('העיצוב המקומי של ההצבה גובר על הקטלוג', () => {
    const c = resolveControlRef({ id: 'p1', fieldKey: 'status', flex: 3, fontSize: 16, bold: true }, byKey);
    expect(c?.flex).toBe(3);
    expect(c?.fontSize).toBe(16);
    expect(c?.bold).toBe(true);
  });

  // שדה שנמחק מהקטלוג: לא מציירים פקד ריק שאיש אינו יודע מה הוא
  it('הפניה לשדה שאינו בקטלוג מחזירה null', () => {
    expect(resolveControlRef({ id: 'p1', fieldKey: 'gone' }, byKey)).toBeNull();
    expect(resolveControlRef({ id: 'p1', fieldKey: '' }, {})).toBeNull();
  });
});

describe('globalControls', () => {
  it('רק שדות גלובליים - הפנימיים חסרי משמעות מחוץ ללוח שלהם', () => {
    const out = globalControls([
      ctl({ key: 'g', scope: 'global' }),
      ctl({ key: 'w', scope: 'window' }),
    ]);
    expect(out.map(f => f.key)).toEqual(['g']);
  });

  it('קטלוג ריק או חסר אינו מפיל', () => {
    expect(globalControls(null)).toEqual([]);
  });
});

// ─── רשימת ערכים בעורך ──────────────────────────────────────────────────────

describe('parseCommaList', () => {
  it('מפרק רשימה ומנקה רווחים', () => {
    expect(parseCommaList('CLR, TXI ,LUW')).toEqual(['CLR', 'TXI', 'LUW']);
  });

  it('מסנן ריקים - ולכן פסיק בסוף **נעלם** בפירוק', () => {
    // זה בדיוק מה ששבר את ההקלדה: קלט מבוקר שמציג את הפירוק היה מוחק את
    // הפסיק ברגע שנכתב. לכן `CommaListInput` מחזיק את הטקסט הגולמי בהקלדה.
    expect(parseCommaList('CLR,')).toEqual(['CLR']);
    expect(parseCommaList('CLR, ')).toEqual(['CLR']);
    expect(parseCommaList(',,')).toEqual([]);
  });

  it('ריק וקלט חסר מחזירים רשימה ריקה', () => {
    expect(parseCommaList('')).toEqual([]);
    expect(parseCommaList(undefined as unknown as string)).toEqual([]);
  });
});

describe('controlFieldKey', () => {
  it('פקד גלובלי נחשף לשאילתות בקידומת', () => {
    expect(controlFieldKey('status')).toBe('ctl__status');
  });
});
