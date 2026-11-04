import { describe, it, expect } from 'vitest';
import { splitSpaceSet, separatedBySpace, blockFitsSpace, separatedByGroup } from './blockSpaces';

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

describe('separatedByGroup - אין קונפליקט בין עמודות התצוגה האנכית', () => {
  it('בלי קיבוץ - לא מפריד', () => {
    expect(separatedByGroup({ block_space_id: 7 }, { block_space_id: 9 }, 'none')).toBe(false);
    expect(separatedByGroup({ block_space_id: 7 }, { block_space_id: 9 }, null)).toBe(false);
  });
  it('מרחבים שונים - מפריד; אותו מרחב - לא', () => {
    expect(separatedByGroup({ block_space_id: 7 }, { block_space_id: 9 }, 'block_space_id')).toBe(true);
    expect(separatedByGroup({ block_space_id: 7 }, { block_space_id: '7' }, 'block_space_id')).toBe(false);
  });
  it('"ללא מרחב" היא עמודה משלה - מופרדת מכל מרחב, ושני פ"מים בלי מרחב באותה עמודה', () => {
    expect(separatedByGroup({ block_space_id: 7 }, { block_space_id: null }, 'block_space_id')).toBe(true);
    expect(separatedByGroup({ block_space_id: null }, { block_space_id: undefined }, 'block_space_id')).toBe(false);
  });
  it('שדה טקסט (ערכה) - לפי הערך אחרי trim', () => {
    expect(separatedByGroup({ erka: 'ערכה 2 ' }, { erka: 'ערכה 2' }, 'erka')).toBe(false);
    expect(separatedByGroup({ erka: 'ערכה 2' }, { erka: '' }, 'erka')).toBe(true);
  });
});
