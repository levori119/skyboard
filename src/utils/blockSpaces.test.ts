import { describe, it, expect } from 'vitest';
import { splitSpaceSet, separatedBySpace, blockFitsSpace, separatedByGroup, structureSeparates } from './blockSpaces';

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
  it('פ"מ בלי מרחב לא מופרד מאף מרחב - הקונפליקט שלו חל על כל המרחבים', () => {
    expect(separatedByGroup({ block_space_id: 7 }, { block_space_id: null }, 'block_space_id')).toBe(false);
    expect(separatedByGroup({ block_space_id: '' }, { block_space_id: 9 }, 'block_space_id')).toBe(false);
    expect(separatedByGroup({ block_space_id: null }, { block_space_id: undefined }, 'block_space_id')).toBe(false);
  });
  it('שדה טקסט (ערכה) - לפי הערך אחרי trim', () => {
    expect(separatedByGroup({ erka: 'ערכה 2 ' }, { erka: 'ערכה 2' }, 'erka')).toBe(false);
    expect(separatedByGroup({ erka: 'ערכה 2' }, { erka: '' }, 'erka')).toBe(true);
  });
});

describe('structureSeparates - הפרדת מרחב/בלוק רק כשיש חלוקה', () => {
  it('בלי חלוקה - אין הפרדה: חפיפה בגובה היא קונפליקט', () => {
    expect(structureSeparates('none')).toBe(false);
    expect(structureSeparates(null)).toBe(false);
    expect(structureSeparates(undefined)).toBe(false);
  });
  it('חלוקה לפי מרחב / ערכה - ההפרדה חלה', () => {
    expect(structureSeparates('block_space_id')).toBe(true);
    expect(structureSeparates('erka')).toBe(true);
  });
});

describe('mustPickBlockTable - חובה לבחור טבלת בלוקים', () => {
  it('לפי מרחבים, כמה טבלאות ולא נבחרה - חובה', async () => {
    const { mustPickBlockTable } = await import('./blockSpaces');
    expect(mustPickBlockTable({ bySpaces: true, activeTableId: null, tableIds: [9, 10] })).toBe(true);
  });
  it('נבחרה טבלה / טבלה אחת / לא לפי מרחבים - לא', async () => {
    const { mustPickBlockTable } = await import('./blockSpaces');
    expect(mustPickBlockTable({ bySpaces: true, activeTableId: 9, tableIds: [9, 10] })).toBe(false);
    expect(mustPickBlockTable({ bySpaces: true, activeTableId: null, tableIds: [9, 9] })).toBe(false);
    expect(mustPickBlockTable({ bySpaces: false, activeTableId: null, tableIds: [9, 10] })).toBe(false);
  });
});
