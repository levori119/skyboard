import { describe, it, expect } from 'vitest';
import {
  numericStripId, formationRootId, isSameFormation, insertAfter, splitPinPosition, type Pt,
} from './formationSplit';

// ריבוע 20..80 באחוזי מפה
const SQUARE: Pt[] = [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }];
// רצועה צרה אנכית - כדי לבדוק אזור שרוב הכיוונים נופלים מחוצה לו
const STRIP_ZONE: Pt[] = [{ x: 48, y: 10 }, { x: 52, y: 10 }, { x: 52, y: 90 }, { x: 48, y: 90 }];

const inSquare = (p: Pt) => p.x > 20 && p.x < 80 && p.y > 20 && p.y < 80;

describe('numericStripId', () => {
  it("מקבל 's12' ו-12 כאותו פ\"מ", () => {
    expect(numericStripId('s12')).toBe(12);
    expect(numericStripId(12)).toBe(12);
  });
  it('ריק / לא מספר → null', () => {
    expect(numericStripId(null)).toBeNull();
    expect(numericStripId(undefined)).toBeNull();
    expect(numericStripId('abc')).toBeNull();
  });
});

describe('formationRootId', () => {
  it('פ"מ שלא פוצל - השורש הוא הוא עצמו', () => {
    expect(formationRootId({ id: 's10', parent_strip_id: null })).toBe(10);
  });
  it('פ"מ מפוצל - השורש הוא parent_strip_id', () => {
    expect(formationRootId({ id: 's11', parent_strip_id: 10 })).toBe(10);
  });
  it('אחרי הפיצול גם המקור מצביע על עצמו כשורש', () => {
    expect(formationRootId({ id: 's10', parent_strip_id: 10 })).toBe(10);
  });
});

describe('isSameFormation', () => {
  const src = { id: 's10', parent_strip_id: 10 };
  const part = { id: 's11', parent_strip_id: 10 };
  const other = { id: 's20', parent_strip_id: null };

  it('שני חלקים של אותו מבנה - אחים', () => {
    expect(isSameFormation(src, part)).toBe(true);
    expect(isSameFormation(part, src)).toBe(true);
  });
  it('שני חלקים שפוצלו מהמקור - אחים גם בלי המקור', () => {
    expect(isSameFormation({ id: 's11', parent_strip_id: 10 }, { id: 's12', parent_strip_id: 10 })).toBe(true);
  });
  it('פ"מ זר - לא אח', () => {
    expect(isSameFormation(src, other)).toBe(false);
    expect(isSameFormation(part, other)).toBe(false);
  });
  it('פ"מ מול עצמו - לא אח (שאחרת יסתיר את הקונפליקטים של עצמו)', () => {
    expect(isSameFormation(src, src)).toBe(false);
    expect(isSameFormation({ id: 's10' }, { id: 10 })).toBe(false);
  });
  it('שני פ"ממים שלא פוצלו מעולם - לא אחים', () => {
    expect(isSameFormation({ id: 's7' }, { id: 's8' })).toBe(false);
  });
  it('חסר מידע - לא אחים', () => {
    expect(isSameFormation(null, part)).toBe(false);
    expect(isSameFormation({}, {})).toBe(false);
  });
});

describe('insertAfter', () => {
  it('נכנס מיד אחרי הפ"מ שממנו פוצל', () => {
    expect(insertAfter(['a', 'b', 'c'], 'b', 'new')).toEqual(['a', 'b', 'new', 'c']);
  });
  it('המקור אחרון - החלק אחריו בסוף', () => {
    expect(insertAfter(['a', 'b'], 'b', 'new')).toEqual(['a', 'b', 'new']);
  });
  it('המקור אינו ברשימה - החלק נדחף לסוף', () => {
    expect(insertAfter(['a', 'b'], 'zz', 'new')).toEqual(['a', 'b', 'new']);
  });
  it('החלק כבר ברשימה (סנכרון הסדר הקדים) - מועבר למקומו הנכון', () => {
    expect(insertAfter(['a', 'b', 'c', 'new'], 'b', 'new')).toEqual(['a', 'b', 'new', 'c']);
  });
  it('אינו משכפל את המקור', () => {
    expect(insertAfter(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
  });
});

describe('splitPinPosition', () => {
  it('לא נוחת על המקור - יש הפרדה', () => {
    const p = splitPinPosition({ x: 50, y: 50 }, SQUARE, [{ x: 50, y: 50 }]);
    expect(Math.hypot(p.x - 50, p.y - 50)).toBeGreaterThanOrEqual(3);
  });

  it('נשאר בתוך האזור גם כשהמקור צמוד לגבול', () => {
    // מקור בקצה הימני של הריבוע: הכיוון הראשון (ימינה) יוצא מהאזור
    const p = splitPinPosition({ x: 78, y: 50 }, SQUARE, []);
    expect(inSquare(p)).toBe(true);
  });

  it('אזור צר - הפתרון עדיין בתוך האזור ולא לצדו', () => {
    const p = splitPinPosition({ x: 50, y: 50 }, STRIP_ZONE, [{ x: 50, y: 50 }]);
    expect(p.x).toBeGreaterThan(48);
    expect(p.x).toBeLessThan(52);
    expect(Math.hypot(p.x - 50, p.y - 50)).toBeGreaterThanOrEqual(3);
  });

  it('מתרחק מפ"ממים שכבר יושבים באזור', () => {
    const taken = [{ x: 50, y: 50 }, { x: 54, y: 50 }, { x: 46, y: 50 }, { x: 50, y: 54 }];
    const p = splitPinPosition({ x: 50, y: 50 }, SQUARE, taken);
    taken.forEach(t => expect(Math.hypot(p.x - t.x, p.y - t.y)).toBeGreaterThanOrEqual(3));
    expect(inSquare(p)).toBe(true);
  });

  it('בלי פוליגון (אזור בלי מתאר) - רק נמנע מחפיפה', () => {
    const p = splitPinPosition({ x: 50, y: 50 }, null, [{ x: 50, y: 50 }]);
    expect(Math.hypot(p.x - 50, p.y - 50)).toBeGreaterThanOrEqual(3);
  });

  it('לא חורג משולי המפה', () => {
    const p = splitPinPosition({ x: 99, y: 99 }, null, []);
    expect(p.x).toBeLessThanOrEqual(98);
    expect(p.y).toBeLessThanOrEqual(98);
    expect(p.x).toBeGreaterThanOrEqual(2);
    expect(p.y).toBeGreaterThanOrEqual(2);
  });

  it('אזור צר מהטבעת הראשונה - נשאר על המקור, לא נזרק מחוץ לאזור', () => {
    const tiny: Pt[] = [{ x: 49.5, y: 49.5 }, { x: 50.5, y: 49.5 }, { x: 50.5, y: 50.5 }, { x: 49.5, y: 50.5 }];
    const p = splitPinPosition({ x: 50, y: 50 }, tiny, [{ x: 50, y: 50 }]);
    expect(p).toEqual({ x: 50, y: 50 });
  });

  it('דטרמיניסטי - אותה קלט נותנת אותה תוצאה', () => {
    const a = splitPinPosition({ x: 50, y: 50 }, SQUARE, [{ x: 50, y: 50 }]);
    const b = splitPinPosition({ x: 50, y: 50 }, SQUARE, [{ x: 50, y: 50 }]);
    expect(a).toEqual(b);
  });
});
