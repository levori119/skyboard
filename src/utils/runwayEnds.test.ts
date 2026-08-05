import { describe, it, expect } from 'vitest';
import { endUseState, oppositeEnd, runwayEndsInUse, setEndInUse, type EndsInUse } from './runwayEnds';

// שני קצוות של אותו מסלול פיזי הם **כיוונים מנוגדים**: המראה מ-15L ונחיתה
// ל-33R הן תנועות זו מול זו על אותו אספלט. לכן בכל רגע יש למסלול **כיוון אחד
// בשימוש**, והוא חוצה את שתי השורות (המראה ונחיתה) - לא רשימה חופשית בכל אחת.

const runways = [
  { id: 1, heading_a: '15L', heading_b: '33R' },
  { id: 2, heading_a: '18', heading_b: '36' },
];

const state = (takeoff: string[] = [], landing: string[] = []): EndsInUse => ({ takeoff, landing });

describe('oppositeEnd - הקצה הנגדי של אותו מסלול פיזי', () => {
  it('מחזיר את הקצה השני של המסלול', () => {
    expect(oppositeEnd(runways, '15L')).toBe('33R');
    expect(oppositeEnd(runways, '33R')).toBe('15L');
    expect(oppositeEnd(runways, '18')).toBe('36');
  });

  it('קצה שאינו מוכר - אין נגדי', () => {
    expect(oppositeEnd(runways, '27')).toBeNull();
  });

  it('מסלול בלי קצה שני - אין נגדי (ולא מחרוזת ריקה)', () => {
    expect(oppositeEnd([{ id: 3, heading_a: '09', heading_b: '' }], '09')).toBeNull();
  });
});

describe('runwayEndsInUse - כל הקצוות שבשימוש, בשתי השורות', () => {
  it('איחוד המראה ונחיתה בלי כפילויות', () => {
    expect(runwayEndsInUse(state(['15L'], ['15L', '18'])).sort()).toEqual(['15L', '18']);
  });
});

describe('setEndInUse - הפעלה, כיבוי, והחלפת כיוון', () => {
  it('הפעלה של קצה פנוי', () => {
    expect(setEndInUse(state(), 'takeoff', '15L', runways)).toEqual(state(['15L'], []));
  });

  it('לחיצה על קצה פעיל מכבה אותו', () => {
    expect(setEndInUse(state(['15L']), 'takeoff', '15L', runways)).toEqual(state([], []));
  });

  it('אותו כיוון בהמראה ובנחיתה - מותר, זה המצב הרגיל', () => {
    const after = setEndInUse(state(['15L']), 'landing', '15L', runways);
    expect(after).toEqual(state(['15L'], ['15L']));
  });

  it('הפעלת הקצה הנגדי מחליפה כיוון - הישן יורד, בשתי השורות', () => {
    const before = state(['15L'], ['15L']);
    expect(setEndInUse(before, 'takeoff', '33R', runways)).toEqual(state(['33R'], []));
  });

  it('החלפת כיוון מהנחיתה מורידה גם המראה מנוגדת', () => {
    const before = state(['15L'], []);
    expect(setEndInUse(before, 'landing', '33R', runways)).toEqual(state([], ['33R']));
  });

  it('מסלול אחר אינו מושפע מהחלפת כיוון', () => {
    const before = state(['15L', '18'], ['18']);
    const after = setEndInUse(before, 'takeoff', '33R', runways);
    expect(after.takeoff.sort()).toEqual(['18', '33R']);
    expect(after.landing).toEqual(['18']);
  });

  it('אינו משנה את המערכים המקוריים', () => {
    const before = state(['15L'], ['15L']);
    setEndInUse(before, 'takeoff', '33R', runways);
    expect(before).toEqual(state(['15L'], ['15L']));
  });
});

describe('endUseState - איך הכפתור נראה', () => {
  it('קצה בשימוש בשורה שלו - פעיל', () => {
    expect(endUseState(state(['15L']), 'takeoff', '15L', runways)).toBe('active');
  });

  it('הקצה הנגדי לקצה שבשימוש - מנוגד (כתום), בשתי השורות', () => {
    const s = state(['15L']);
    expect(endUseState(s, 'takeoff', '33R', runways)).toBe('opposed');
    expect(endUseState(s, 'landing', '33R', runways)).toBe('opposed');
  });

  it('קצה שבשימוש בשורה השנייה בלבד - כבוי בשורה הזו, לא מנוגד', () => {
    expect(endUseState(state(['15L']), 'landing', '15L', runways)).toBe('off');
  });

  it('מסלול שאינו בשימוש כלל - כבוי', () => {
    expect(endUseState(state(['15L']), 'takeoff', '18', runways)).toBe('off');
    expect(endUseState(state(['15L']), 'takeoff', '36', runways)).toBe('off');
  });
});
