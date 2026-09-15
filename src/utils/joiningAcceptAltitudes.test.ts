import { describe, it, expect } from 'vitest';
import {
  acceptAltitudeLimit, altitudeGroups, distributeAltitudes, occupiedBlocks, toggleAcceptAltitude,
  type BlockEntry, type JoiningPointStripRow,
} from './joiningPoints';

// קבלת פ"מ לנקודת הצטרפות: לפני הקבלה בוחרים גבהים (אחד או יותר) ומשייכים
// לכל מספר במבנה את הגובה שלו. גובה אחד = כל המבנה. לא יותר גבהים ממטוסים.

describe('acceptAltitudeLimit - כמה גבהים מותר לבחור', () => {
  it('בודד - גובה אחד, זוג - שניים, רביעייה - ארבעה', () => {
    expect(acceptAltitudeLimit(1)).toBe(1);
    expect(acceptAltitudeLimit('2')).toBe(2);
    expect(acceptAltitudeLimit(4)).toBe(4);
  });

  it('פ"מ בלי מספר מטוסים ידוע - גובה אחד', () => {
    expect(acceptAltitudeLimit(null)).toBe(1);
    expect(acceptAltitudeLimit('')).toBe(1);
    expect(acceptAltitudeLimit(0)).toBe(1);
  });

  it('חסם 16 מול ערך שגוי', () => {
    expect(acceptAltitudeLimit(99)).toBe(16);
  });
});

describe('toggleAcceptAltitude - בחירת גבהים בטופס', () => {
  it('הוספה והסרה', () => {
    expect(toggleAcceptAltitude([], 7000, 2)).toEqual([7000]);
    expect(toggleAcceptAltitude([7000], 8000, 2)).toEqual([7000, 8000]);
    expect(toggleAcceptAltitude([7000, 8000], 7000, 2)).toEqual([8000]);
  });

  it('בודד - בחירה אחרת מחליפה את הקודמת (כמו רדיו)', () => {
    expect(toggleAcceptAltitude([7000], 5000, 1)).toEqual([5000]);
  });

  it('במבנה שהגיע לתקרה - גובה נוסף אינו נכנס', () => {
    expect(toggleAcceptAltitude([7000, 8000], 9000, 2)).toEqual([7000, 8000]);
  });
});

describe('distributeAltitudes - שיוך ברירת המחדל', () => {
  it('גובה אחד - כל המבנה אליו', () => {
    expect(distributeAltitudes([1, 2, 3, 4], [7000])).toEqual({ 1: 7000, 2: 7000, 3: 7000, 4: 7000 });
  });

  it('גובה לכל מטוס - המוביל (#1) בנמוך, וכלפי מעלה לפי הסדר', () => {
    expect(distributeAltitudes([1, 2], [8000, 7000])).toEqual({ 1: 7000, 2: 8000 });
  });

  it('רביעייה בשני גבהים - 1,2 בנמוך ו-3,4 בגבוה (כמו על הסדק)', () => {
    expect(distributeAltitudes([1, 2, 3, 4], [9000, 6000])).toEqual({ 1: 6000, 2: 6000, 3: 9000, 4: 9000 });
  });

  it('שלישייה בשני גבהים - כל גובה שנבחר מקבל לפחות מטוס אחד', () => {
    const m = distributeAltitudes([1, 2, 3], [5000, 6000]);
    expect(new Set(Object.values(m))).toEqual(new Set([5000, 6000]));
    expect(m[1]).toBe(5000);
  });

  it('בלי גבהים - שיוך ריק', () => {
    expect(distributeAltitudes([1, 2], [])).toEqual({});
  });
});

describe('altitudeGroups - הקבוצות שנשלחות לשרת', () => {
  it('גובה אחד - קבוצה אחת עם כל המבנה', () => {
    expect(altitudeGroups({ 1: 7000, 2: 7000 })).toEqual([{ ft: 7000, indices: [1, 2] }]);
  });

  it('קבוצת המוביל ראשונה - היא גובה הפ"מ', () => {
    expect(altitudeGroups({ 1: 9000, 2: 6000, 3: 9000, 4: 6000 })).toEqual([
      { ft: 9000, indices: [1, 3] },
      { ft: 6000, indices: [2, 4] },
    ]);
  });

  it('גובה שנשאר בלי מטוסים אינו נשלח', () => {
    expect(altitudeGroups({})).toEqual([]);
  });
});

describe('occupiedBlocks - גבהים תפוסים', () => {
  const row = (id: string): JoiningPointStripRow => ({ strip_id: id, alt: '070' });
  const map = new Map<number, BlockEntry[]>([
    [7000, [{ strip: row('a'), indices: [], partial: false }]],
    [8000, []],
    [9000, [{ strip: row('b'), indices: [1], partial: true }, { strip: row('b'), indices: [2], partial: true }]],
  ]);

  it('בלוק עם פ"מ אחר - תפוס; בלוק ריק - פנוי', () => {
    const occ = occupiedBlocks(map);
    expect([...occ.keys()].sort()).toEqual([7000, 9000]);
    expect(occ.has(8000)).toBe(false);
  });

  it('פ"מ שמופיע פעמיים באותו בלוק נספר פעם אחת', () => {
    expect(occupiedBlocks(map).get(9000)!.map(r => r.strip_id)).toEqual(['b']);
  });

  it('הפ"מ שמתקבל אינו תופס את הגובה של עצמו', () => {
    expect(occupiedBlocks(map, 'a').has(7000)).toBe(false);
  });
});
