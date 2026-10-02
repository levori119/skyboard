import { describe, it, expect } from 'vitest';
import { flipTargets, ghostPatterns, keptKeys, pendingGroups, toDecision } from './patternFlip';

// PATTERN_FLIP_SPEC.md §4
const P33 = { id: 8, runway_ident: '33' };
const P15L = { id: 5, runway_ident: '15' };
const P15R = { id: 6, runway_ident: '15' };
const P26 = { id: 7, runway_ident: '26' };
const RWYS = [{ heading_a: '15', heading_b: '33' }, { heading_a: '08', heading_b: '26' }];
const ac = (idx: number, pattern_id: number | null, pattern_orphan: string | null = null) =>
  ({ strip_id: 10, aircraft_idx: idx, pattern_id, pattern_orphan });

describe('pendingGroups - ההתראה המרוכזת', () => {
  it('מקבץ את הממתינים לפי ההקפה הישנה, ומתעלם מכל השאר', () => {
    const g = pendingGroups([ac(1, 8, 'pending'), ac(2, 8, 'pending'), ac(3, 8, 'kept'), ac(4, 8), ac(5, 7, 'pending')],
      [P33, P26]);
    expect(g.map(x => [x.pattern.id, x.aircraft.map(a => a.aircraft_idx)])).toEqual([[8, [1, 2]], [7, [5]]]);
  });

  it('#1 אין ממתינים - אין התראה', () => {
    expect(pendingGroups([ac(1, 8)], [P33])).toEqual([]);
  });
});

describe('keptKeys - מהבהבים עד הנחיתה', () => {
  it('רק מי שהוכרע להמשיך', () => {
    expect([...keptKeys([ac(1, 8, 'kept'), ac(2, 8, 'pending'), ac(3, 8)])]).toEqual(['10|1']);
  });
});

describe('ghostPatterns - ההקפה הישנה מעומעמת', () => {
  it('הקפה כבויה עם מטוס ממתין/ממשיך מוצגת; פעילה או ריקה - לא', () => {
    const all = [P33, P15L, P26];
    expect(ghostPatterns([ac(1, 8, 'kept'), ac(2, 7)], all, [P15L]).map(p => p.id)).toEqual([8]);
    // #6 האחרון נחת (השורה נמחקה) - ההקפה המעומעמת נעלמת
    expect(ghostPatterns([], all, [P15L])).toEqual([]);
    // הקפה שכבר מוצגת אינה מצוירת פעמיים
    expect(ghostPatterns([ac(1, 15, 'kept')], all, [P15L])).toEqual([]);
  });
});

describe('flipTargets - יעדי ההעברה', () => {
  it('#11 הקצה הנגדי קודם, כל הקפה שלו יעד נפרד', () => {
    expect(flipTargets('33', [P26, P15L, P15R], RWYS).map(p => p.id)).toEqual([5, 6, 7]);
  });

  it('#10 אין הקפה פעילה - אין יעד', () => {
    expect(flipTargets('33', [], RWYS)).toEqual([]);
  });

  it('אין קצה נגדי ידוע - הסדר נשמר', () => {
    expect(flipTargets('99', [P26, P15L], RWYS).map(p => p.id)).toEqual([7, 5]);
  });
});

describe('toDecision', () => {
  it('keep / move', () => {
    expect(toDecision(ac(1, 8), 'keep')).toEqual({ strip_id: 10, aircraft_idx: 1, action: 'keep' });
    expect(toDecision(ac(1, 8), 5)).toEqual({ strip_id: 10, aircraft_idx: 1, action: 'move', pattern_id: 5 });
  });
});
