import { describe, it, expect } from 'vitest';
import { displayLeg, legChange, JOINING_LEG } from './joiningPoints';

// תפריט מצב המטוס מחליף את כפתור "שים בהקפה / הוצא מההקפה":
// עה"ר / בסיס / פיינל = בהקפה. "בנקודת הצטרפות" = ברירת המחדל, מחוץ להקפה.

describe('legChange - בחירה בתפריט המצב', () => {
  it('"בנקודת הצטרפות" למטוס בהקפה - מוציא מההקפה', () => {
    expect(legChange({ inPattern: true, hasRunway: true }, JOINING_LEG)).toEqual({ status: 'none', inPattern: false });
  });

  it('"בנקודת הצטרפות" למטוס שכבר בנקודה - רק הסטטוס', () => {
    expect(legChange({ inPattern: false, hasRunway: false }, JOINING_LEG)).toEqual({ status: 'none' });
  });

  it('עה"ר למטוס בנקודה עם מסלול - נכנס להקפה', () => {
    expect(legChange({ inPattern: false, hasRunway: true }, 'downwind')).toEqual({ status: 'downwind', inPattern: true });
  });

  it('בסיס למטוס שכבר בהקפה - רק הסטטוס', () => {
    expect(legChange({ inPattern: true, hasRunway: true }, 'base')).toEqual({ status: 'base' });
  });

  it('צלע הקפה בלי מסלול - חסום (null)', () => {
    expect(legChange({ inPattern: false, hasRunway: false }, 'final')).toBeNull();
  });

  it('נחת - לא נוגע בהקפה (הנחיתה מורידה את השורה)', () => {
    expect(legChange({ inPattern: false, hasRunway: false }, 'landed')).toEqual({ status: 'landed' });
  });
});

describe('displayLeg - מה התפריט מציג', () => {
  it('מטוס בנקודה בלי סטטוס = בנקודת הצטרפות', () => {
    expect(displayLeg('none', false)).toBe(JOINING_LEG);
  });

  it('מטוס בהקפה בלי צלע (רשומה ישנה) = עה"ר, לא "בנקודה"', () => {
    expect(displayLeg(null, true)).toBe('downwind');
  });

  it('צלע קיימת נשמרת', () => {
    expect(displayLeg('cleared_to_land', true)).toBe('final');
  });
});
