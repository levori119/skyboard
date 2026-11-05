import { describe, it, expect } from 'vitest';
import { isOnDesk, deskSpaceId, withDeskSpace, deskSpaceConflict } from './deskSpace';

const ME = 7;

describe('isOnDesk - הפ"מ בדסק של העמדה', () => {
  it('הקצאת דסק / על הלוח - כן; אחרת - לא', () => {
    expect(isOnDesk({ table_preset_ids: [3, 7] }, ME)).toBe(true);
    expect(isOnDesk({ table_preset_ids: [3] }, ME)).toBe(false);
    expect(isOnDesk({ table_preset_ids: [3] }, ME, true)).toBe(true);
    expect(isOnDesk({ table_spaces: { '7': 2 } }, ME)).toBe(true);
    expect(isOnDesk({ table_preset_ids: [7] }, null)).toBe(false);
  });
});

describe('withDeskSpace - מרחב הבלוקים כפי שהדסק רואה אותו', () => {
  it('בדסק - המרחב של הדסק, ובלעדיו בלי מרחב; של דסק אחר לא משפיע', () => {
    const s = { id: 's1', block_space_id: 9, table_preset_ids: [7, 3], table_spaces: { '3': 8 } };
    expect(withDeskSpace(s, ME).block_space_id).toBe(null);
    expect(withDeskSpace({ ...s, table_spaces: { '7': 10, '3': 8 } }, ME).block_space_id).toBe(10);
    expect(withDeskSpace({ ...s, table_spaces: { '7': 10, '3': 8 } }, 3).block_space_id).toBe(8);
    expect(deskSpaceId({ table_spaces: { '7': '10' } }, ME)).toBe(10);
  });

  it('לא בדסק - המרחב של הפ"מ, בלי שינוי', () => {
    const s = { id: 's1', block_space_id: 9, table_preset_ids: [3] };
    expect(withDeskSpace(s, ME)).toBe(s);
  });
});

describe('deskSpaceConflict - קונפליקט שהפרדה לפי מרחב הייתה מבטלת', () => {
  const strips = [
    { id: 'a', block_space_id: 7 }, { id: 'b', block_space_id: 9 }, { id: 'c', block_space_id: 7 }, { id: 'd', block_space_id: null },
  ];
  it('זוג בקונפליקט במרחבים שונים - כן; באותו מרחב / בלי מרחב - לא', () => {
    expect(deskSpaceConflict(strips, new Map([['a', ['b']]]))).toBe(true);
    expect(deskSpaceConflict(strips, new Map([['a', ['c']]]))).toBe(false);
    expect(deskSpaceConflict(strips, new Map([['a', ['d']]]))).toBe(false);
    expect(deskSpaceConflict(strips, new Map())).toBe(false);
  });
});
