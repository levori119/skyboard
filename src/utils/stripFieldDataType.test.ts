import { describe, it, expect } from 'vitest';
import type { StripControl } from '../types/stripControls';
import {
  fieldDataType, normalizeFieldInput, fieldNativeInputValue, fieldEditKind, dataTypeEnforcedIn,
} from './stripControls';

// סוג הנתון של שדה מותאם (CIV_STRIP_CONTROLS.md §2.4): מה מותר להקליד, ובאיזו
// צורה הערך נשמר. הצורה השמורה ממוינת, כך שהשוואת מחרוזות היא השוואת ערכים.

const ctl = (over: Partial<StripControl> = {}): StripControl => ({
  id: '1', key: 'k', type: 'field', scope: 'global', ...over,
});

const ok = (value: string) => ({ ok: true, value });
const bad = { ok: false };

describe('fieldDataType', () => {
  it('שדה ותיק בלי סוג = טקסט, כדי שימשיך להתנהג בדיוק כמו קודם', () => {
    expect(fieldDataType(ctl())).toBe('text');
  });

  it('מחזיר את הסוג שהוגדר', () => {
    expect(fieldDataType(ctl({ dataType: 'time' }))).toBe('time');
  });

  it('סוג לא מוכר נופל לטקסט ולא נשבר', () => {
    expect(fieldDataType(ctl({ dataType: 'banana' as never }))).toBe('text');
  });

  it('לפקד שאינו שדה אין סוג נתון - גם אם נשאר שם משינוי סוג', () => {
    expect(fieldDataType(ctl({ type: 'button', dataType: 'integer' }))).toBe('text');
  });
});

describe('normalizeFieldInput - טקסט', () => {
  it('כל ערך עובר כמות שהוא', () => {
    expect(normalizeFieldInput('text', ' CLR 7 ')).toEqual(ok(' CLR 7 '));
  });
});

describe('normalizeFieldInput - ריק', () => {
  it('ריק הוא תמיד ערך חוקי (ניקוי השדה), בכל סוג', () => {
    for (const t of ['integer', 'decimal', 'time', 'date', 'datetime'] as const) {
      expect(normalizeFieldInput(t, '')).toEqual(ok(''));
      expect(normalizeFieldInput(t, '   ')).toEqual(ok(''));
    }
  });
});

describe('normalizeFieldInput - מספר שלם', () => {
  it('ספרות עוברות, ואפסים מובילים וסימן + יורדים', () => {
    expect(normalizeFieldInput('integer', '42')).toEqual(ok('42'));
    expect(normalizeFieldInput('integer', ' 007 ')).toEqual(ok('7'));
    expect(normalizeFieldInput('integer', '+5')).toEqual(ok('5'));
    expect(normalizeFieldInput('integer', '-12')).toEqual(ok('-12'));
    expect(normalizeFieldInput('integer', '0')).toEqual(ok('0'));
    expect(normalizeFieldInput('integer', '-0')).toEqual(ok('0'));
  });

  it('דוחה שבר, אותיות ופסיק אלפים', () => {
    expect(normalizeFieldInput('integer', '1.5')).toEqual(bad);
    expect(normalizeFieldInput('integer', '12a')).toEqual(bad);
    expect(normalizeFieldInput('integer', '1,000')).toEqual(bad);
    expect(normalizeFieldInput('integer', '-')).toEqual(bad);
  });
});

describe('normalizeFieldInput - מספר עשרוני', () => {
  it('נקודה או פסיק עשרוני, ונרמול לנקודה', () => {
    expect(normalizeFieldInput('decimal', '3.5')).toEqual(ok('3.5'));
    expect(normalizeFieldInput('decimal', '3,5')).toEqual(ok('3.5'));
    expect(normalizeFieldInput('decimal', '.5')).toEqual(ok('0.5'));
    expect(normalizeFieldInput('decimal', '5.')).toEqual(ok('5'));
    expect(normalizeFieldInput('decimal', '007.25')).toEqual(ok('7.25'));
    expect(normalizeFieldInput('decimal', '-2.50')).toEqual(ok('-2.50'));
    expect(normalizeFieldInput('decimal', '12')).toEqual(ok('12'));
  });

  it('דוחה שתי נקודות ואותיות', () => {
    expect(normalizeFieldInput('decimal', '1.2.3')).toEqual(bad);
    expect(normalizeFieldInput('decimal', 'abc')).toEqual(bad);
    expect(normalizeFieldInput('decimal', '.')).toEqual(bad);
  });
});

describe('normalizeFieldInput - שעה', () => {
  it('HH:MM, וגם הקלדה מהירה בלוח הספרות', () => {
    expect(normalizeFieldInput('time', '14:30')).toEqual(ok('14:30'));
    expect(normalizeFieldInput('time', '7:05')).toEqual(ok('07:05'));
    expect(normalizeFieldInput('time', '1430')).toEqual(ok('14:30'));
    expect(normalizeFieldInput('time', '730')).toEqual(ok('07:30'));
    expect(normalizeFieldInput('time', '14.30')).toEqual(ok('14:30'));
    expect(normalizeFieldInput('time', '9')).toEqual(ok('09:00'));
    expect(normalizeFieldInput('time', '00:00')).toEqual(ok('00:00'));
    expect(normalizeFieldInput('time', '23:59:41')).toEqual(ok('23:59'));
  });

  it('דוחה שעה או דקה מחוץ לטווח, ודקה חד-ספרתית', () => {
    expect(normalizeFieldInput('time', '24:00')).toEqual(bad);
    expect(normalizeFieldInput('time', '12:60')).toEqual(bad);
    expect(normalizeFieldInput('time', '2575')).toEqual(bad);
    expect(normalizeFieldInput('time', '7:5')).toEqual(bad);
    expect(normalizeFieldInput('time', '12345')).toEqual(bad);
    expect(normalizeFieldInput('time', 'noon')).toEqual(bad);
  });
});

describe('normalizeFieldInput - תאריך', () => {
  it('ISO, וגם יום/חודש/שנה כפי שכותבים בארץ', () => {
    expect(normalizeFieldInput('date', '2026-11-07')).toEqual(ok('2026-11-07'));
    expect(normalizeFieldInput('date', '7/11/2026')).toEqual(ok('2026-11-07'));
    expect(normalizeFieldInput('date', '07.11.2026')).toEqual(ok('2026-11-07'));
    expect(normalizeFieldInput('date', '7.11.26')).toEqual(ok('2026-11-07'));
    expect(normalizeFieldInput('date', '29/02/2028')).toEqual(ok('2028-02-29'));
  });

  it('דוחה תאריך שאינו קיים בלוח השנה', () => {
    expect(normalizeFieldInput('date', '31/11/2026')).toEqual(bad);
    expect(normalizeFieldInput('date', '29/02/2026')).toEqual(bad);
    expect(normalizeFieldInput('date', '2026-13-01')).toEqual(bad);
    expect(normalizeFieldInput('date', '2026-11')).toEqual(bad);
    expect(normalizeFieldInput('date', 'tomorrow')).toEqual(bad);
  });
});

describe('normalizeFieldInput - תאריך ושעה', () => {
  it('מה שבורר הדפדפן מחזיר, וגם הקלדה חופשית', () => {
    expect(normalizeFieldInput('datetime', '2026-11-07T14:30')).toEqual(ok('2026-11-07 14:30'));
    expect(normalizeFieldInput('datetime', '2026-11-07 14:30')).toEqual(ok('2026-11-07 14:30'));
    expect(normalizeFieldInput('datetime', '7/11/2026 0730')).toEqual(ok('2026-11-07 07:30'));
  });

  it('דוחה כשחסר אחד החלקים או שאחד מהם שגוי', () => {
    expect(normalizeFieldInput('datetime', '2026-11-07')).toEqual(bad);
    expect(normalizeFieldInput('datetime', '14:30')).toEqual(bad);
    expect(normalizeFieldInput('datetime', '2026-11-31 14:30')).toEqual(bad);
    expect(normalizeFieldInput('datetime', '2026-11-07 25:00')).toEqual(bad);
  });
});

describe('fieldNativeInputValue', () => {
  it('ערך שמור → הצורה שקלט הדפדפן מקבל', () => {
    expect(fieldNativeInputValue('datetime', '2026-11-07 14:30')).toBe('2026-11-07T14:30');
    expect(fieldNativeInputValue('date', '2026-11-07')).toBe('2026-11-07');
    expect(fieldNativeInputValue('time', '07:30')).toBe('07:30');
  });

  it('ערך ישן שאינו בצורה החוקית נפתח ריק במקום לשבור את הקלט', () => {
    expect(fieldNativeInputValue('date', 'אתמול')).toBe('');
    expect(fieldNativeInputValue('datetime', '')).toBe('');
  });
});

describe('fieldEditKind - מה נפתח בלחיצה על השדה', () => {
  it('טקסט: עריכה במקום, כמו היום', () => {
    expect(fieldEditKind('text', true)).toBe('text');
  });

  it('מספרים ושעה: לוח הספרות, כשהוא זמין בעמדה', () => {
    expect(fieldEditKind('integer', true)).toBe('numpad');
    expect(fieldEditKind('decimal', true)).toBe('numpad');
    expect(fieldEditKind('time', true)).toBe('numpad');
  });

  it('בלי לוח ספרות (מחוץ לעמדה) - קלט מספרי במקום, לא כפתור מת', () => {
    expect(fieldEditKind('integer', false)).toBe('inline');
    expect(fieldEditKind('time', false)).toBe('inline');
  });

  it('תאריך: בורר הדפדפן', () => {
    expect(fieldEditKind('date', true)).toBe('date');
    expect(fieldEditKind('datetime', false)).toBe('datetime');
  });
});

describe('dataTypeEnforcedIn', () => {
  it('כתב יד נשמר כציור ולכן הסוג לא נאכף בו', () => {
    expect(dataTypeEnforcedIn('handwriting')).toBe(false);
  });

  it('מקלדת וגם-וגם - נאכף בהקלדה', () => {
    expect(dataTypeEnforcedIn('keyboard')).toBe(true);
    expect(dataTypeEnforcedIn('both')).toBe(true);
    expect(dataTypeEnforcedIn(undefined)).toBe(true);
  });
});
