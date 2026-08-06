import { describe, it, expect } from 'vitest';
import {
  altToDisplay, buildBlocks, findStepOverlaps, nearestBlock, blockOf,
  conflictBlocks, isAltInPoint, formationsInBlocks, allAircraftInPattern,
  formationAircraft,
  type JoiningPoint, type AltStep,
} from './joiningPoints';

// נקודת הצטרפות נפרסת לטבלת בלוקי גבהים. הגובה נשמר **ברגל** (4000) ומוצג
// **במאות** (040), כמו על הסדק. ההפרש בין בלוקים אינו קבוע: אפשר 1000 רגל
// בחלק אחד של הטווח ו-500 בחלק אחר.

const point = (over: Partial<JoiningPoint> = {}): JoiningPoint => ({
  id: 1, name: 'STAR X', alt_min_ft: 4000, alt_max_ft: 10000,
  default_step_ft: 1000, steps: [], ...over,
});

const step = (from_ft: number, to_ft: number, step_ft: number): AltStep => ({ from_ft, to_ft, step_ft });

describe('altToDisplay - גובה ברגל לתצוגה תלת-ספרתית במאות', () => {
  it('4000 רגל מוצג 040', () => expect(altToDisplay(4000)).toBe('040'));
  it('10000 רגל מוצג 100', () => expect(altToDisplay(10000)).toBe('100'));
  it('500 רגל מוצג 005', () => expect(altToDisplay(500)).toBe('005'));
  it('גובה תלת-ספרתי ומעלה אינו נחתך', () => expect(altToDisplay(100000)).toBe('1000'));
});

describe('buildBlocks - בניית שורות הטבלה', () => {
  it('הפרש אחיד: 040 עד 100 כל 1000 רגל, מלמעלה למטה', () => {
    expect(buildBlocks(point())).toEqual([10000, 9000, 8000, 7000, 6000, 5000, 4000]);
  });

  it('הפרש שונה לפי טווח: 1000 מ-4000 עד 7000, 500 מ-7000 עד 10000', () => {
    const p = point({ steps: [step(4000, 7000, 1000), step(7000, 10000, 500)] });
    expect(buildBlocks(p)).toEqual([
      10000, 9500, 9000, 8500, 8000, 7500,
      7000, 6000, 5000, 4000,
    ]);
  });

  it('טווח שאינו מכוסה נופל להפרש ברירת המחדל', () => {
    const p = point({ default_step_ft: 2000, steps: [step(8000, 10000, 500)] });
    expect(buildBlocks(p)).toEqual([10000, 9500, 9000, 8500, 8000, 6000, 4000]);
  });

  it('טווח הפוך (מ > עד) מנורמל ולא מפיל', () => {
    expect(buildBlocks(point({ alt_min_ft: 10000, alt_max_ft: 4000 }))).toEqual(
      [10000, 9000, 8000, 7000, 6000, 5000, 4000],
    );
  });

  it('טווח אפסי מחזיר בלוק אחד', () => {
    expect(buildBlocks(point({ alt_min_ft: 5000, alt_max_ft: 5000 }))).toEqual([5000]);
  });

  it('הפרש 0 או שלילי אינו יוצר לולאה אינסופית', () => {
    expect(buildBlocks(point({ default_step_ft: 0 }))).toEqual([10000, 4000]);
  });

  it('אין כפילויות גם כשגבול הטווח נופל בדיוק על בלוק', () => {
    const p = point({ steps: [step(4000, 7000, 1000), step(7000, 10000, 1000)] });
    expect(new Set(buildBlocks(p)).size).toBe(buildBlocks(p).length);
  });
});

describe('findStepOverlaps - חפיפת טווחי הפרשים נחסמת', () => {
  it('טווחים צמודים אינם חופפים', () => {
    expect(findStepOverlaps([step(4000, 7000, 1000), step(7000, 10000, 500)])).toEqual([]);
  });

  it('חפיפה אמיתית מדווחת עם שני האינדקסים', () => {
    expect(findStepOverlaps([step(4000, 8000, 1000), step(7000, 10000, 500)])).toEqual([[0, 1]]);
  });

  it('סדר ההגדרה אינו משנה', () => {
    expect(findStepOverlaps([step(7000, 10000, 500), step(4000, 8000, 1000)])).toEqual([[0, 1]]);
  });
});

describe('blockOf / nearestBlock - שיוך גובה לבלוק', () => {
  const blocks = [10000, 9000, 8000, 7000, 6000, 5000, 4000];

  it('גובה שיושב בדיוק על בלוק', () => expect(blockOf(blocks, 7000)).toBe(7000));
  it('גובה שאינו על בלוק אינו משויך', () => expect(blockOf(blocks, 7500)).toBeNull());
  it('nearestBlock מצמיד לבלוק הקרוב', () => expect(nearestBlock(blocks, 7400)).toBe(7000));
  it('nearestBlock בתיקו מצמיד למעלה', () => expect(nearestBlock(blocks, 7500)).toBe(8000));
  it('nearestBlock מחוץ לטווח מצמיד לקצה', () => {
    expect(nearestBlock(blocks, 100)).toBe(4000);
    expect(nearestBlock(blocks, 99000)).toBe(10000);
  });
  it('רשימת בלוקים ריקה', () => expect(nearestBlock([], 5000)).toBeNull());
});

describe('isAltInPoint - הטופס מציע רק גבהים מהטווח', () => {
  it('גובה בתוך הטווח', () => expect(isAltInPoint(point(), 6000)).toBe(true));
  it('גובה מתחת לטווח', () => expect(isAltInPoint(point(), 3000)).toBe(false));
  it('גובה מעל הטווח', () => expect(isAltInPoint(point(), 11000)).toBe(false));
  it('גבולות הטווח כלולים', () => {
    expect(isAltInPoint(point(), 4000)).toBe(true);
    expect(isAltInPoint(point(), 10000)).toBe(true);
  });
});

describe('formationsInBlocks - איזה פ"מ יושב באיזה בלוק', () => {
  const blocks = [10000, 9000, 8000, 7000];

  it('פ"מ משויך לבלוק לפי strips.alt (במאות רגל)', () => {
    const map = formationsInBlocks(blocks, [{ strip_id: 1, alt: '090' }]);
    expect(map.get(9000)?.map(s => s.strip_id)).toEqual([1]);
  });

  it('גובה שאינו נופל על בלוק אינו מוצג בטבלה', () => {
    const map = formationsInBlocks(blocks, [{ strip_id: 1, alt: '095' }]);
    expect([...map.values()].flat()).toEqual([]);
  });

  it('גובה ריק או לא מספרי אינו מפיל', () => {
    const map = formationsInBlocks(blocks, [
      { strip_id: 1, alt: '' }, { strip_id: 2, alt: null }, { strip_id: 3, alt: 'abc' },
    ]);
    expect([...map.values()].flat()).toEqual([]);
  });

  it('שני פ"ממים באותו בלוק - שניהם מוחזרים', () => {
    const map = formationsInBlocks(blocks, [{ strip_id: 1, alt: '070' }, { strip_id: 2, alt: '070' }]);
    expect(map.get(7000)?.length).toBe(2);
  });
});

describe('conflictBlocks - שני פ"ממים באותו בלוק', () => {
  const blocks = [10000, 9000, 8000, 7000];

  it('בלוק עם שני פ"ממים הוא קונפליקט', () => {
    const map = formationsInBlocks(blocks, [{ strip_id: 1, alt: '070' }, { strip_id: 2, alt: '070' }]);
    expect([...conflictBlocks(map)]).toEqual([7000]);
  });

  it('בלוק עם פ"מ אחד אינו קונפליקט', () => {
    const map = formationsInBlocks(blocks, [{ strip_id: 1, alt: '070' }]);
    expect([...conflictBlocks(map)]).toEqual([]);
  });

  it('קונפליקט שאושר כמתואם יורד מהאדום', () => {
    const map = formationsInBlocks(blocks, [
      { strip_id: 1, alt: '070', is_coordinated: true },
      { strip_id: 2, alt: '070', is_coordinated: true },
    ]);
    expect([...conflictBlocks(map)]).toEqual([]);
  });

  it('אישור של אחד מהשניים בלבד - עדיין קונפליקט', () => {
    const map = formationsInBlocks(blocks, [
      { strip_id: 1, alt: '070', is_coordinated: true },
      { strip_id: 2, alt: '070' },
    ]);
    expect([...conflictBlocks(map)]).toEqual([7000]);
  });
});

describe('formationAircraft - פריסת המטוסים תחת ה-+', () => {
  it('כשיש שורות strip_aircraft - הן מוחזרות כמו שהן', () => {
    const rows = [{ id: 9, idx: 1, datk: 3, kipa: '7' }];
    expect(formationAircraft(rows, 4)).toBe(rows);
  });

  it('פ"מ בלי שורות נפרס לפי מספר המטוסים במבנה', () => {
    expect(formationAircraft([], 4).map(a => a.idx)).toEqual([1, 2, 3, 4]);
  });

  it('undefined במקום מערך אינו מפיל', () => {
    expect(formationAircraft(undefined, 2).map(a => a.idx)).toEqual([1, 2]);
  });

  it('מספר מטוסים כמחרוזת (כפי שמגיע מה-DB)', () => {
    expect(formationAircraft([], '3').map(a => a.idx)).toEqual([1, 2, 3]);
  });

  it('בלי מספר מטוסים - רשימה ריקה, לא קריסה', () => {
    expect(formationAircraft([], null)).toEqual([]);
    expect(formationAircraft([], '')).toEqual([]);
    expect(formationAircraft([], 'abc')).toEqual([]);
  });

  it('ערך שגוי אינו פורס רשימה אינסופית', () => {
    expect(formationAircraft([], 9999).length).toBe(16);
    expect(formationAircraft([], -5)).toEqual([]);
  });

  it('שורה נגזרת מגיעה בלי דת"ק ובלי סטטוס', () => {
    expect(formationAircraft([], 1)[0]).toEqual({ idx: 1, datk: null, kipa: null, flight_status: 'none' });
  });
});

describe('allAircraftInPattern - הפ"מ נעלם כשכל מטוסיו בהקפה', () => {
  it('כל המטוסים בהקפה', () => {
    expect(allAircraftInPattern(2, [
      { aircraft_idx: 1, in_pattern: true }, { aircraft_idx: 2, in_pattern: true },
    ])).toBe(true);
  });

  it('מטוס אחד עדיין בטבלה', () => {
    expect(allAircraftInPattern(2, [
      { aircraft_idx: 1, in_pattern: true }, { aircraft_idx: 2, in_pattern: false },
    ])).toBe(false);
  });

  it('מטוס בלי שורת מצב כלל נחשב לא בהקפה', () => {
    expect(allAircraftInPattern(4, [{ aircraft_idx: 1, in_pattern: true }])).toBe(false);
  });

  it('פ"מ בלי מטוסים אינו נעלם', () => {
    expect(allAircraftInPattern(0, [])).toBe(false);
  });

  it('שורת מצב של מטוס שכבר אינו במבנה אינה מזייפת "כולם בהקפה"', () => {
    expect(allAircraftInPattern(2, [
      { aircraft_idx: 1, in_pattern: true }, { aircraft_idx: 7, in_pattern: true },
    ])).toBe(false);
  });
});
