import { describe, it, expect } from 'vitest';
import { firstExecTarget, firstExecIndex, autoAssignableSpaces, recommendBlockSpaceId, autoSpaceFor, targetsAnchor, firstExecKey } from './blockSpaceAuto';

// מה שנבדק: המטרה הקובעת (ראשונה לביצוע / שורה עליונה) והמרחב המומלץ לפ"מ.
const NORTH = 'N3230.0000/E03500.0000'; // 32.5, 35.0
const SOUTH = 'N3100.0000/E03430.0000'; // 31.0, 34.5
const spaces = [
  { id: 1, center_lat: 31.0, center_lon: 34.5 },
  { id: 2, center_lat: 32.5, center_lon: 35.0 },
];

describe('firstExecTarget', () => {
  it('בלי סימון - השורה העליונה עם נ"צ תקין', () => {
    expect(firstExecTarget([{ coord: '' }, { coord: SOUTH }, { coord: NORTH }])).toMatchObject({ lat: 31, lon: 34.5 });
  });
  it('שורה מסומנת "ראשונה לביצוע" גוברת על הסדר', () => {
    expect(firstExecTarget([{ coord: SOUTH }, { coord: NORTH, first_exec: true }])).toMatchObject({ lat: 32.5 });
  });
  it('שורה מסומנת בלי נ"צ תקין - לא קובעת', () => {
    expect(firstExecTarget([{ coord: SOUTH }, { coord: 'x', first_exec: true }])).toMatchObject({ lat: 31 });
  });
  it('אין נ"צ בכלל - null', () => {
    expect(firstExecTarget([])).toBe(null);
    expect(firstExecTarget(null)).toBe(null);
  });
});

describe('recommendBlockSpaceId', () => {
  it('מטרות במרחבים שונים - לפי הראשונה לביצוע', () => {
    expect(recommendBlockSpaceId([{ coord: SOUTH }, { coord: NORTH }], spaces)).toBe(1);
    expect(recommendBlockSpaceId([{ coord: SOUTH }, { coord: NORTH, first_exec: true }], spaces)).toBe(2);
  });
  it('בלי מטרה - אין המלצה', () => {
    expect(recommendBlockSpaceId([], spaces)).toBe(null);
  });
});

describe('firstExecIndex', () => {
  it('מסומנת גוברת, אחרת העליונה עם נ"צ, אחרת -1', () => {
    expect(firstExecIndex([{ coord: SOUTH }, { coord: NORTH, first_exec: true }])).toBe(1);
    expect(firstExecIndex([{ coord: '' }, { coord: SOUTH }])).toBe(1);
    expect(firstExecIndex([{ coord: 'x' }])).toBe(-1);
  });
});

describe('autoAssignableSpaces - טופס העזר', () => {
  const all = [...spaces, { id: 3, center_lat: null, center_lon: null }];
  it('הטופס לא נערך (null) - כל המרחבים שיש להם מיקום', () => {
    expect(autoAssignableSpaces(all, null).map(s => s.id)).toEqual([1, 2]);
    expect(autoAssignableSpaces(all, undefined).map(s => s.id)).toEqual([1, 2]);
  });
  it('רק המרחבים שסומנו', () => {
    expect(autoAssignableSpaces(all, [2, 3]).map(s => s.id)).toEqual([2]);
  });
  it('רשימה ריקה - אין מרחב מותר', () => {
    expect(autoAssignableSpaces(all, [])).toEqual([]);
  });
  it('המטרה במרחב שאינו מותר - הפ"מ הולך למותר הקרוב ביותר', () => {
    expect(recommendBlockSpaceId([{ coord: SOUTH }], autoAssignableSpaces(all, [2]))).toBe(2);
  });
});

describe('autoSpaceFor - פ"מ בלי מטרות לגזרה האחורית הרחוקה', () => {
  const sq = (lat: number, lon: number) => [[{ lat, lon }, { lat, lon: lon + 0.1 }, { lat: lat + 0.1, lon: lon + 0.1 }, { lat: lat + 0.1, lon }]];
  const spaces = [
    { id: 1, center_lat: 31.45, center_lon: 34.35, polygons: sq(31.4, 34.3) },   // קדמי
    { id: 2, center_lat: 31.45, center_lon: 33.65, polygons: sq(31.4, 33.6) },   // אחורי רחוק
  ];
  const anchor = targetsAnchor([[{ coord: 'N3125.0000/E03430.0000' }], [], [{ coord: 'N3126.0000/E03432.0000' }]]);
  it('מרכז המטרות - רק מפ"מים עם מטרה', () => {
    expect(anchor!.lat).toBeCloseTo(31.425, 3);
    expect(targetsAnchor([[], null])).toBeNull();
  });
  it('עם מטרה - הקרוב; בלי מטרה - הרחוק ממרכז המטרות; בלי מטרות בכלל - null', () => {
    expect(autoSpaceFor([{ coord: 'N3125.0000/E03430.0000' }], spaces, anchor)).toBe(1);
    expect(autoSpaceFor([], spaces, anchor)).toBe(2);
    expect(autoSpaceFor([], spaces, null)).toBeNull();
  });
  it('firstExecKey - משתנה כשהמטרה הקובעת משתנה', () => {
    expect(firstExecKey([{ coord: 'N3125.0000/E03430.0000' }])).not.toBe(firstExecKey([{ coord: 'N3126.0000/E03430.0000' }]));
    expect(firstExecKey([])).toBe('');
  });
});
