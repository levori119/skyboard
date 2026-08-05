import { describe, it, expect } from 'vitest';
import { matchEndName, matchEndSlot } from './linkedRunways.js';

// מסלול פיזי אחד מוגדר בשני שדות בשמות שונים, והקישור מצהיר שהם אותו דבר.
// מרגע שקושרו - סגירה, תאורות והמסלולים שבשימוש חייבים להיות זהים בשני הצדדים.
//
// המלכודת: גם **שמות הקצוות** שונים ('15L' מול '15'), וגם הסדר עשוי להיות הפוך
// (בשדה אחד heading_a='18', בשני heading_a='36'). התאמה לפי מיקום בלבד הייתה
// סוגרת את הקצה ההפוך.

const A = { heading_a: '15L', heading_b: '33R' };
const B = { heading_a: '33', heading_b: '15' };   // הפוך בסדר, ובלי אות הצד

describe('matchEndName - איזה קצה אצל השכן מקביל לקצה שלי', () => {
  it('לפי המספר, לא לפי הסדר', () => {
    expect(matchEndName(A, B, '15L')).toBe('15');
    expect(matchEndName(A, B, '33R')).toBe('33');
  });

  it('אותם שמות בדיוק', () => {
    expect(matchEndName(A, A, '15L')).toBe('15L');
  });

  it('אות צד שונה (L/R/C) אינה מונעת התאמה', () => {
    expect(matchEndName({ heading_a: '15L', heading_b: '33R' }, { heading_a: '15R', heading_b: '33L' }, '15L')).toBe('15R');
  });

  it('בלי מספר משותף - נופל למיקום (a<->a, b<->b)', () => {
    const x = { heading_a: 'צפון', heading_b: 'דרום' };
    const y = { heading_a: 'ALPHA', heading_b: 'BRAVO' };
    expect(matchEndName(x, y, 'צפון')).toBe('ALPHA');
    expect(matchEndName(x, y, 'דרום')).toBe('BRAVO');
  });

  it('קצה שאינו של המסלול הזה - null', () => {
    expect(matchEndName(A, B, '27')).toBeNull();
  });

  it('לשכן אין קצה מקביל - null ולא ניחוש', () => {
    expect(matchEndName(A, { heading_a: '15', heading_b: '' }, '33R')).toBeNull();
  });

  it('רווחים ורישיות אינם משנים', () => {
    expect(matchEndName({ heading_a: ' 15l ', heading_b: '33R' }, B, '15L')).toBe('15');
  });
});

// NOTAM של קיצור מסלול נשמר לפי **מיקום** הקצה ('a'/'b') ולא לפי שמו, ולכן
// העתקה כמו-שהיא לשדה שבו הסדר הפוך הייתה מקצרת את הקצה הלא נכון.
describe('matchEndSlot - מיקום הקצה המקביל אצל השכן', () => {
  it('סדר הפוך אצל השכן - המיקום מתהפך', () => {
    expect(matchEndSlot(A, B, 'a')).toBe('b'); // 15L אצלי הוא heading_b אצלו
    expect(matchEndSlot(A, B, 'b')).toBe('a');
  });

  it('אותו סדר - אותו מיקום', () => {
    expect(matchEndSlot(A, { heading_a: '15', heading_b: '33' }, 'a')).toBe('a');
  });

  it('בלי התאמה - null (עדיף בלי קיצור מאשר קיצור בקצה ההפוך)', () => {
    expect(matchEndSlot(A, { heading_a: '09', heading_b: '27' }, 'a')).toBeNull();
  });

  it('מיקום לא חוקי - null', () => {
    expect(matchEndSlot(A, B, 'x')).toBeNull();
    expect(matchEndSlot(A, B, null)).toBeNull();
  });
});

