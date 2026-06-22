import { describe, it, expect } from 'vitest';
import { sgDefaultCell, sgUpdate, sgSplit, sgRemove, sgGetAllCells } from './stripGrid';
import type { SGNode, SGCell, SGSplit } from '../types/stripGrid';

const cell = (id: string): SGCell => ({ id, type: 'cell', fieldKey: '', textAlign: 'center' });

describe('sgDefaultCell', () => {
  it('creates a cell with a generated id', () => {
    const c = sgDefaultCell();
    expect(c.type).toBe('cell');
    expect(c.id).toBeTruthy();
  });
});

describe('sgSplit', () => {
  it('splits a cell into a split with two children', () => {
    const root = cell('a');
    const out = sgSplit(root, 'a', 'h') as SGSplit;
    expect(out.type).toBe('split');
    expect(out.direction).toBe('h');
    expect(out.children).toHaveLength(2);
    expect(out.children[0].id).toBe('a');
    expect(out.sizes).toEqual([50, 50]);
  });
  it('recurses into nested splits', () => {
    const root: SGNode = { id: 's', type: 'split', direction: 'v', sizes: [50, 50], children: [cell('a'), cell('b')] };
    const out = sgSplit(root, 'b', 'h') as SGSplit;
    expect(out.children[1].type).toBe('split');
  });
});

describe('sgUpdate', () => {
  it('applies fn to the matching node only', () => {
    const root: SGNode = { id: 's', type: 'split', direction: 'h', sizes: [50, 50], children: [cell('a'), cell('b')] };
    const out = sgUpdate(root, 'b', (n) => ({ ...n, fieldKey: 'alt' })) as SGSplit;
    expect((out.children[1] as SGCell).fieldKey).toBe('alt');
    expect((out.children[0] as SGCell).fieldKey).toBe('');
  });
});

describe('sgRemove', () => {
  it('collapses split to single remaining cell', () => {
    const root: SGNode = { id: 's', type: 'split', direction: 'h', sizes: [50, 50], children: [cell('a'), cell('b')] };
    const out = sgRemove(root, 'b');
    expect(out.type).toBe('cell');
    expect(out.id).toBe('a');
  });
  it('keeps split with >=2 remaining children and renormalizes sizes', () => {
    const root: SGNode = { id: 's', type: 'split', direction: 'h', sizes: [33, 33, 34], children: [cell('a'), cell('b'), cell('c')] };
    const out = sgRemove(root, 'b') as SGSplit;
    expect(out.type).toBe('split');
    expect(out.children.map(c => c.id)).toEqual(['a', 'c']);
    expect(out.sizes.reduce((s, x) => s + x, 0)).toBeCloseTo(100, 4);
  });
});

describe('sgGetAllCells', () => {
  it('flattens all leaf cells', () => {
    const root: SGNode = { id: 's', type: 'split', direction: 'h', sizes: [50, 50], children: [
      cell('a'),
      { id: 's2', type: 'split', direction: 'v', sizes: [50, 50], children: [cell('b'), cell('c')] },
    ]};
    expect(sgGetAllCells(root).map(c => c.id).sort()).toEqual(['a', 'b', 'c']);
  });
});
