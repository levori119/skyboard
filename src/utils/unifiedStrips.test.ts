import { describe, it, expect } from 'vitest';
import {
  stripInUnifiedView,
  filterUnifiedStrips,
  sanitizeCombined,
  unifyStrips,
  type CombinedPosition,
} from './unifiedStrips';
import type { QGroup, QLeaf } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────
const leaf = (field: string, compare: any, value: string): QLeaf =>
  ({ id: 'l', type: 'leaf', field, compare, value });

const group = (children: any[], operator: 'all' | 'any' | 'none' = 'all'): QGroup =>
  ({ id: 'g', type: 'group', operator, children });

// filter: only strips of squadron 101
const sq101 = group([leaf('sq', 'eq', '101')]);
// filter: only strips of squadron 107
const sq107 = group([leaf('sq', 'eq', '107')]);

const stripSq = (sq: string, extra: Record<string, any> = {}) => ({ sq, ...extra });

describe('stripInUnifiedView — my own filter', () => {
  it('includes strips matching my effective filter', () => {
    expect(stripInUnifiedView(stripSq('101'), sq101, {}, [])).toBe(true);
  });
  it('excludes strips not matching my filter when no combined positions', () => {
    expect(stripInUnifiedView(stripSq('107'), sq101, {}, [])).toBe(false);
  });
  it('null / empty filter means "all strips" (mirrors myStrips semantics)', () => {
    expect(stripInUnifiedView(stripSq('999'), null, {}, [])).toBe(true);
    expect(stripInUnifiedView(stripSq('999'), group([]), {}, [])).toBe(true);
  });
});

describe('stripInUnifiedView — combined positions (union)', () => {
  it('includes a strip matching a combined position filter even if it does not match mine', () => {
    const combined: CombinedPosition[] = [{ presetId: 7, filter: sq107, ctx: { presetId: 7 } }];
    expect(stripInUnifiedView(stripSq('107'), sq101, {}, combined)).toBe(true);
  });
  it('still excludes a strip matching neither mine nor any combined position', () => {
    const combined: CombinedPosition[] = [{ presetId: 7, filter: sq107, ctx: { presetId: 7 } }];
    expect(stripInUnifiedView(stripSq('250'), sq101, {}, combined)).toBe(false);
  });
  it('unions across multiple combined positions', () => {
    const combined: CombinedPosition[] = [
      { presetId: 7, filter: sq107, ctx: { presetId: 7 } },
      { presetId: 8, filter: group([leaf('sq', 'eq', '69')]), ctx: { presetId: 8 } },
    ];
    expect(stripInUnifiedView(stripSq('69'), sq101, {}, combined)).toBe(true);
    expect(stripInUnifiedView(stripSq('107'), sq101, {}, combined)).toBe(true);
    expect(stripInUnifiedView(stripSq('101'), sq101, {}, combined)).toBe(true);
    expect(stripInUnifiedView(stripSq('5'), sq101, {}, combined)).toBe(false);
  });
});

describe('stripInUnifiedView — combined position with NO filter falls back to preset ownership', () => {
  it('includes only strips explicitly owned by that preset (not all strips)', () => {
    const combined: CombinedPosition[] = [{ presetId: 7, filter: null }];
    // owned by preset 7 → included
    expect(stripInUnifiedView(stripSq('250', { workstation_preset_id: 7 }), sq101, {}, combined)).toBe(true);
    // not owned by preset 7 and not matching mine → excluded (must NOT flood with all strips)
    expect(stripInUnifiedView(stripSq('250', { workstation_preset_id: 99 }), sq101, {}, combined)).toBe(false);
  });
  it('matches preset id regardless of string/number type', () => {
    const combined: CombinedPosition[] = [{ presetId: '7', filter: null }];
    expect(stripInUnifiedView(stripSq('250', { workstation_preset_id: 7 }), sq101, {}, combined)).toBe(true);
  });
});

describe('filterUnifiedStrips — list filter + dedupe-safe', () => {
  it('returns the union of mine + combined, preserving order, no duplicates', () => {
    const strips = [
      stripSq('101', { id: 1 }),
      stripSq('107', { id: 2 }),
      stripSq('250', { id: 3 }),
      stripSq('69', { id: 4, workstation_preset_id: 8 }),
    ];
    const combined: CombinedPosition[] = [
      { presetId: 7, filter: sq107, ctx: { presetId: 7 } },
      { presetId: 8, filter: null },
    ];
    const out = filterUnifiedStrips(strips, sq101, {}, combined);
    expect(out.map(s => s.id)).toEqual([1, 2, 4]);
  });
});

// ── decision 4: a position's full set = query ∪ explicit assignment ∪ pending-in ──
describe('combined position — explicit desk assignment (table_preset_ids)', () => {
  it('includes a strip assigned to the combined position even if it matches no filter', () => {
    const combined: CombinedPosition[] = [{ presetId: 7, filter: sq107, ctx: { presetId: 7 } }];
    const strip = stripSq('250', { table_preset_ids: [7], status: 'active' });
    expect(stripInUnifiedView(strip, sq101, {}, combined)).toBe(true);
  });
  it('does NOT include an assigned strip that is cancelled/rejected (unless it matches a filter)', () => {
    const combined: CombinedPosition[] = [{ presetId: 7, filter: sq107, ctx: { presetId: 7 } }];
    expect(stripInUnifiedView(stripSq('250', { table_preset_ids: [7], status: 'cancelled' }), sq101, {}, combined)).toBe(false);
    expect(stripInUnifiedView(stripSq('250', { table_preset_ids: [7], status: 'rejected' }), sq101, {}, combined)).toBe(false);
  });
  it('matches assignment regardless of string/number id type', () => {
    const combined: CombinedPosition[] = [{ presetId: '7', filter: null }];
    expect(stripInUnifiedView(stripSq('250', { table_preset_ids: ['7'] }), sq101, {}, combined)).toBe(true);
  });
});

describe('pending_transfer ownership (mine and combined)', () => {
  it('includes a pending strip incoming to a combined position (owned by it + matches its filter)', () => {
    const combined: CombinedPosition[] = [{ presetId: 7, filter: sq107, ctx: { presetId: 7 } }];
    const strip = stripSq('107', { status: 'pending_transfer', workstation_preset_id: 7 });
    expect(stripInUnifiedView(strip, sq101, {}, combined)).toBe(true);
  });
  it('excludes a pending strip NOT owned by any of my/combined positions even if it matches a filter', () => {
    const combined: CombinedPosition[] = [{ presetId: 7, filter: sq107, ctx: { presetId: 7 } }];
    // sq107 matches the combined filter, but it is pending to preset 99 → not actually incoming to us
    const strip = stripSq('107', { status: 'pending_transfer', workstation_preset_id: 99 });
    expect(stripInUnifiedView(strip, sq101, {}, combined)).toBe(false);
  });
  it('includes a pending strip incoming to ME (owned by my preset, matches my filter)', () => {
    const strip = stripSq('101', { status: 'pending_transfer', workstation_preset_id: 5 });
    expect(stripInUnifiedView(strip, sq101, { presetId: 5 }, [])).toBe(true);
  });
  it('excludes a pending strip that matches my filter but is owned by another preset', () => {
    const strip = stripSq('101', { status: 'pending_transfer', workstation_preset_id: 999 });
    expect(stripInUnifiedView(strip, sq101, { presetId: 5 }, [])).toBe(false);
  });
});

// A split formation is just two independent strips — position-unify does NOT merge them.
describe('split formation pieces stay independent (no formation merge)', () => {
  it('includes both split pieces if each belongs to a unified position', () => {
    const combined: CombinedPosition[] = [{ presetId: 8, filter: sq107, ctx: { presetId: 8 } }];
    const piece1 = stripSq('101', { id: 1 });                       // mine
    const piece2 = stripSq('107', { id: 2, parent_strip_id: 1 });   // split sibling, matches pos 8
    expect(stripInUnifiedView(piece1, sq101, { presetId: 1 }, combined)).toBe(true);
    expect(stripInUnifiedView(piece2, sq101, { presetId: 1 }, combined)).toBe(true);
  });
});

describe('sanitizeCombined — drop self + duplicate positions (cycle/dup guard)', () => {
  it('removes the operator own preset and de-dups repeated positions', () => {
    const combined: CombinedPosition[] = [
      { presetId: 7, filter: null },
      { presetId: 7, filter: null },
      { presetId: 5, filter: null },
    ];
    expect(sanitizeCombined(combined, 7).map(p => p.presetId)).toEqual([5]);
  });
  it('keeps order of the first occurrence', () => {
    const combined: CombinedPosition[] = [
      { presetId: 5, filter: null },
      { presetId: 8, filter: null },
      { presetId: 5, filter: null },
    ];
    expect(sanitizeCombined(combined, 1).map(p => p.presetId)).toEqual([5, 8]);
  });
});

describe('unifyStrips — end-to-end: sanitize + union (no formation merge)', () => {
  it('unions mine + combined, drops self position; split pieces stay separate', () => {
    const strips = [
      stripSq('101', { id: 1 }),
      stripSq('107', { id: 2, parent_strip_id: 1 }), // split sibling — independent strip
      stripSq('250', { id: 3, table_preset_ids: [8], status: 'active' }),
      stripSq('5', { id: 4 }),
    ];
    const combined: CombinedPosition[] = [
      { presetId: 1, filter: null },                  // self → dropped
      { presetId: 8, filter: sq107, ctx: { presetId: 8 } },
    ];
    const out = unifyStrips(strips, sq101, { presetId: 1 }, combined);
    // id1 (mine), id2 (matches pos 8), id3 (assigned to 8) → in; id4 (sq5) → out. No dedup.
    expect(out.map(s => s.id)).toEqual([1, 2, 3]);
  });
});
