import { describe, it, expect } from 'vitest';
import { swDefaultLeaf, swUpdate, swSplit, swRemove, swFindLeaf, swRemapIds } from './stripWindow';
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

describe('swRemapIds', () => {
  it('assigns fresh ids while preserving structure', () => {
    const root: SWNode = { id: 's', type: 'split', direction: 'h', sizes: [50, 50], children: [leaf('a'), leaf('b')] };
    const out = swRemapIds(root) as SWSplit;
    expect(out.id).not.toBe('s');
    expect(out.children).toHaveLength(2);
    expect(out.children[0].id).not.toBe('a');
  });
});
