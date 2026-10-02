import { describe, it, expect } from 'vitest';
import { orphanTransitions } from './patternOrphans.js';

// מטריצת המקרים: PATTERN_FLIP_SPEC.md §3
describe('orphanTransitions - מטוסים בהקפה שכבתה', () => {
  const row = (id, runway_ident, pattern_orphan = null, flight_status = 'none') =>
    ({ id, runway_ident, pattern_orphan, flight_status });

  it('הקפה כבויה + אין סימון → ממתין להכרעה', () => {
    expect(orphanTransitions([row(1, '33')], ['15'])).toEqual({ toPending: [1], toClear: [] });
  });

  it('כבר ממתין / ממשיך - לא נוגעים (ההכרעה לא נדרסת)', () => {
    expect(orphanTransitions([row(1, '33', 'pending'), row(2, '33', 'kept')], ['15']))
      .toEqual({ toPending: [], toClear: [] });
  });

  it('ההקפה הופעלה שוב → הסימון מתנקה', () => {
    expect(orphanTransitions([row(1, '33', 'pending'), row(2, '33', 'kept')], ['33']))
      .toEqual({ toPending: [], toClear: [1, 2] });
  });

  it('הקפה פעילה בלי סימון - כלום', () => {
    expect(orphanTransitions([row(1, '33')], ['33'])).toEqual({ toPending: [], toClear: [] });
  });

  it('מטוס שנחת אינו מסומן', () => {
    expect(orphanTransitions([row(1, '33', null, 'landed')], [])).toEqual({ toPending: [], toClear: [] });
  });

  it('השוואה סובלנית לרווחים ולאותיות, אבל על הקצה המלא', () => {
    expect(orphanTransitions([row(1, ' 33l ')], ['33L']).toPending).toEqual([]);
    expect(orphanTransitions([row(1, '33L')], ['33']).toPending).toEqual([1]);
  });

  it('אין שום קצה בשימוש - כל ההקפות כבויות', () => {
    expect(orphanTransitions([row(1, '33'), row(2, '15')], []).toPending).toEqual([1, 2]);
  });
});
