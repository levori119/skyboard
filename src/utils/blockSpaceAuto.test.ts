import { describe, it, expect } from 'vitest';
import { firstExecTarget, recommendBlockSpaceId } from './blockSpaceAuto';

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
