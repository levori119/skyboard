import { describe, it, expect } from 'vitest';
import { firstExecTarget, firstExecIndex, autoAssignableSpaces, recommendBlockSpaceId } from './blockSpaceAuto';

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
