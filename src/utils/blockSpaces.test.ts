import { describe, it, expect } from 'vitest';
import { splitSpaceSet, separatedBySpace, blockFitsSpace } from './blockSpaces';

const tables = [
  { id: 1, split_space_ids: [10, 11] },
  { id: 2, split_space_ids: ['12'] },
  { id: 3 },
];

describe('splitSpaceSet', () => {
  it('איחוד המרחבים של כל הטבלאות, או רק של הנבחרות', () => {
    expect([...splitSpaceSet(tables)].sort()).toEqual([10, 11, 12]);
    expect([...splitSpaceSet(tables, [1])].sort()).toEqual([10, 11]);
    expect(splitSpaceSet(tables, [3]).size).toBe(0);
    expect(splitSpaceSet(null as any).size).toBe(0);
  });
});

describe('separatedBySpace - אין קונפליקט בין מרחבים שונים', () => {
  const split = new Set([10, 11]);
  it('מרחבים שונים שבחלוקה - מופרדים', () => {
    expect(separatedBySpace({ block_space_id: 10 }, { block_space_id: '11' }, split)).toBe(true);
  });
  it('אותו מרחב, מרחב חסר, או מרחב שאינו בחלוקה - לא מופרדים', () => {
    expect(separatedBySpace({ block_space_id: 10 }, { block_space_id: 10 }, split)).toBe(false);
    expect(separatedBySpace({ block_space_id: 10 }, { block_space_id: null }, split)).toBe(false);
    expect(separatedBySpace({ block_space_id: 10 }, { block_space_id: 99 }, split)).toBe(false);
    expect(separatedBySpace({ block_space_id: 10 }, { block_space_id: 11 }, new Set())).toBe(false);
  });
});

describe('blockFitsSpace', () => {
  it('בלוק בלי מרחב או פ"מ בלי מרחב - מתאים; אחרת רק אותו מרחב', () => {
    expect(blockFitsSpace({ space_id: null }, 10)).toBe(true);
    expect(blockFitsSpace({ space_id: 10 }, null)).toBe(true);
    expect(blockFitsSpace({ space_id: 10 }, '10')).toBe(true);
    expect(blockFitsSpace({ space_id: 10 }, 11)).toBe(false);
  });
});
