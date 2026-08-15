import { describe, it, expect } from 'vitest';
import { swDefaultLeaf, swUpdate, swSplit, swRemove, swFindLeaf, swRemapIds, swResolveStripTable } from './stripWindow';
import type { SWNode, SWLeaf, SWSplit } from './stripWindow';

const leaf = (id: string): SWLeaf =>
  ({ id, type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' });

describe('swDefaultLeaf', () => {
  it('creates a leaf with generated id', () => {
    const l = swDefaultLeaf();
    expect(l.type).toBe('leaf');
    expect(l.id).toBeTruthy();
  });
});

describe('swSplit', () => {
  it('splits a leaf into a split with two children', () => {
    const out = swSplit(leaf('a'), 'a', 'v') as SWSplit;
    expect(out.type).toBe('split');
    expect(out.children).toHaveLength(2);
    expect(out.children[0].id).toBe('a');
  });
});

describe('swUpdate', () => {
  it('updates only the matching leaf', () => {
    const root: SWNode = { id: 's', type: 'split', direction: 'h', sizes: [50, 50], children: [leaf('a'), leaf('b')] };
    const out = swUpdate(root, 'a', (n) => ({ ...n, label: 'WP1' })) as SWSplit;
    expect((out.children[0] as SWLeaf).label).toBe('WP1');
    expect((out.children[1] as SWLeaf).label).toBe('');
  });
});

describe('swRemove', () => {
  it('collapses to single remaining leaf', () => {
    const root: SWNode = { id: 's', type: 'split', direction: 'h', sizes: [50, 50], children: [leaf('a'), leaf('b')] };
    const out = swRemove(root, 'b');
    expect(out.type).toBe('leaf');
    expect(out.id).toBe('a');
  });
  it('renormalizes sizes when keeping multiple', () => {
    const root: SWNode = { id: 's', type: 'split', direction: 'h', sizes: [33, 33, 34], children: [leaf('a'), leaf('b'), leaf('c')] };
    const out = swRemove(root, 'b') as SWSplit;
    expect(out.children.map(c => c.id)).toEqual(['a', 'c']);
    expect(out.sizes.reduce((s, x) => s + x, 0)).toBeCloseTo(100, 4);
  });
});

describe('swFindLeaf', () => {
  it('finds a nested leaf by id', () => {
    const root: SWNode = { id: 's', type: 'split', direction: 'h', sizes: [50, 50], children: [
      leaf('a'),
      { id: 's2', type: 'split', direction: 'v', sizes: [50, 50], children: [leaf('b'), leaf('c')] },
    ]};
    expect(swFindLeaf(root, 'c')?.id).toBe('c');
    expect(swFindLeaf(root, 'zzz')).toBeNull();
  });
});

describe('swResolveStripTable', () => {
  const civ = { id: 7, name: 'אזרחי - מסוף' };
  const wing = { id: 9, name: 'כנף' };
  const tables = [civ, wing];
  const presetTable = { id: 1, name: 'תצוגת העמדה' };

  it('falls back to the workstation table when the cell chose nothing', () => {
    expect(swResolveStripTable(leaf('a'), tables, presetTable)).toBe(presetTable);
  });

  it('returns the table the cell chose', () => {
    expect(swResolveStripTable({ ...leaf('a'), strip_table_id: 7 }, tables, presetTable)).toBe(civ);
  });

  it('two cells in the same window resolve to different displays', () => {
    const a = swResolveStripTable({ ...leaf('a'), strip_table_id: 7 }, tables, presetTable);
    const b = swResolveStripTable({ ...leaf('b'), strip_table_id: 9 }, tables, presetTable);
    expect(a).toBe(civ);
    expect(b).toBe(wing);
  });

  // תצוגה שנמחקה בניהול לא מרוקנת את התא - הוא חוזר לתצוגת העמדה
  it('falls back when the chosen display no longer exists', () => {
    expect(swResolveStripTable({ ...leaf('a'), strip_table_id: 404 }, tables, presetTable)).toBe(presetTable);
  });

  it('returns null when neither the cell nor the workstation has a display', () => {
    expect(swResolveStripTable(leaf('a'), tables, null)).toBeNull();
    expect(swResolveStripTable({ ...leaf('a'), strip_table_id: 404 }, tables, undefined)).toBeNull();
  });

  // ה-id מגיע מ-JSONB ולעתים כמחרוזת - השוואה סלחנית, אחרת התא נראה "בלי בחירה"
  it('matches a numeric id stored as a string', () => {
    expect(swResolveStripTable({ ...leaf('a'), strip_table_id: '7' as unknown as number }, tables, presetTable)).toBe(civ);
  });
});

describe('swRemapIds', () => {
  it('assigns fresh ids while preserving structure', () => {
    const root: SWNode = { id: 's', type: 'split', direction: 'h', sizes: [50, 50], children: [leaf('a'), leaf('b')] };
    const out = swRemapIds(root) as SWSplit;
    expect(out.id).not.toBe('s');
    expect(out.children).toHaveLength(2);
    expect(out.children[0].id).not.toBe('a');
  });
});
