import { describe, it, expect } from 'vitest';
import { closedRunwayEnds, endUseState, oppositeEnd, orderedRunwayGroups, runwayEndsInUse, setEndInUse, type EndsInUse } from './runwayEnds';

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

describe('orderedRunwayGroups - סדר תצוגה קנוני', () => {
  // הסדר הגיע מ-sort_order/id של ה-DB, ולכן שתי עמדות שמקושרות לאותם מסלולים
  // הציגו אותם בסדר שונה. הפקח משווה בין מסכים - סדר שונה הוא מלכודת.
  const RW = (heading_a: string, heading_b: string, id = 0) => ({ id, heading_a, heading_b });

  it('כל מסלול הוא קבוצה, ושני קצותיו צמודים', () => {
    const g = orderedRunwayGroups([RW('33L', '15R', 3), RW('09', '27', 1)]);
    expect(g.map(x => x.ends)).toEqual([['09', '27'], ['15R', '33L']]);
  });

  it('הסדר אינו תלוי בסדר שהגיע מה-DB', () => {
    const a = [RW('33L', '15R', 9), RW('09', '27', 1), RW('33R', '15L', 5), RW('18', '36', 7)];
    const b = [RW('18', '36', 2), RW('33R', '15L', 8), RW('09', '27', 4), RW('33L', '15R', 6)];
    expect(orderedRunwayGroups(a)).toEqual(orderedRunwayGroups(b));
  });

  it('בתוך המסלול - הקצה הנמוך ראשון', () => {
    expect(orderedRunwayGroups([RW('33L', '15R')])[0].ends).toEqual(['15R', '33L']);
    expect(orderedRunwayGroups([RW('09', '27')])[0].ends).toEqual(['09', '27']);
  });

  it('מסלולים מסודרים לפי הקצה הנמוך, ואז לפי הסיומת L < C < R', () => {
    const g = orderedRunwayGroups([RW('33L', '15R'), RW('09', '27'), RW('33R', '15L'), RW('18', '36')]);
    expect(g.map(x => x.ends[0])).toEqual(['09', '15L', '15R', '18']);
  });

  it('מסלול עם קצה אחד בלבד', () => {
    expect(orderedRunwayGroups([RW('12', '')])[0].ends).toEqual(['12']);
  });

  it('מסלול בלי קצוות אינו מופיע', () => {
    expect(orderedRunwayGroups([RW('', ''), RW('09', '27')])).toHaveLength(1);
  });

  it('קצה כפול בין מסלולים מופיע פעם אחת בלבד', () => {
    const g = orderedRunwayGroups([RW('09', '27', 1), RW('09', '27', 2)]);
    expect(g.flatMap(x => x.ends)).toEqual(['09', '27']);
  });

  it('רשימה שטוחה לתצוגה, ומזהה הקבוצה נשמר להפרדה ויזואלית', () => {
    const g = orderedRunwayGroups([RW('33R', '15L', 5), RW('09', '27', 1)]);
    expect(g).toHaveLength(2);
    expect(g[0].key).not.toBe(g[1].key);
    expect(g.flatMap(x => x.ends)).toEqual(['09', '27', '15L', '33R']);
  });

  it('סובלני לרווחים', () => {
    expect(orderedRunwayGroups([{ heading_a: ' 09 ', heading_b: '27 ' }])[0].ends).toEqual(['09', '27']);
  });
});

describe('closedRunwayEnds - קצוות של מסלול סגור ב-NOTAM', () => {
  const RW = (id: number, a: string, b: string) => ({ id, heading_a: a, heading_b: b });
  const CLOSED = (runway_id: number) => ({ runway_id, notam_type: 'closed' });

  it('סגירה מחזירה את שני הקצוות - המסלול סגור, לא כיוון אחד', () => {
    const closed = closedRunwayEnds([RW(1, '33', '15')], [CLOSED(1)]);
    expect([...closed].sort()).toEqual(['15', '33']);
  });

  it('בלי NOTAM סגירה - אין קצה סגור', () => {
    expect(closedRunwayEnds([RW(1, '33', '15')], []).size).toBe(0);
    expect(closedRunwayEnds([RW(1, '33', '15')], [{ runway_id: 1, notam_type: 'text' }]).size).toBe(0);
  });

  it('רק המסלול שנסגר, לא שכניו', () => {
    const closed = closedRunwayEnds([RW(1, '33', '15'), RW(2, '09', '27')], [CLOSED(2)]);
    expect([...closed].sort()).toEqual(['09', '27']);
  });

  it('כמה מסלולים סגורים', () => {
    const closed = closedRunwayEnds([RW(1, '33', '15'), RW(2, '09', '27')], [CLOSED(1), CLOSED(2)]);
    expect(closed.size).toBe(4);
  });

  it('NOTAM למסלול שאינו ברשימה אינו סוגר דבר', () => {
    expect(closedRunwayEnds([RW(1, '33', '15')], [CLOSED(99)]).size).toBe(0);
  });

  it('סובלני לרווחים ולקצה חסר', () => {
    const closed = closedRunwayEnds([{ id: 1, heading_a: ' 33 ', heading_b: '' }], [CLOSED(1)]);
    expect([...closed]).toEqual(['33']);
  });

  it('רשימות ריקות אינן מפילות', () => {
    expect(closedRunwayEnds([], []).size).toBe(0);
  });
});

describe('activePatterns מול מסלול סגור', () => {
  it('קצה סגור אינו נחשב פעיל, גם אם סומן בשימוש', () => {
    const active = ['33', '09'];
    const closed = closedRunwayEnds([{ id: 1, heading_a: '33', heading_b: '15' }], [{ runway_id: 1, notam_type: 'closed' }]);
    expect(active.filter(e => !closed.has(e))).toEqual(['09']);
  });
});
