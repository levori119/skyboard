import { describe, it, expect } from 'vitest';
import { applyPendingAssignments, type PendingAssignment } from './assignmentPending';

// מה שנבדק: שיוך שנגרר מוצג מיד, ופולינג שיצא לפני השחרור לא מחזיר את הפ"מ אחורה.
type A = { strip_id: number; map_id: number; zone_id: number | null };

describe('applyPendingAssignments', () => {
  const mk = (entries: [number, PendingAssignment<A>][]) => new Map<number, PendingAssignment<A>>(entries);

  it('פולינג ישן עם האזור הקודם - הפ"מ נשאר באזור החדש', () => {
    const p = mk([[7, { a: { strip_id: 7, map_id: 24, zone_id: 2 }, until: 100 }]]);
    expect(applyPendingAssignments([{ strip_id: 7, map_id: 24, zone_id: 1 }], 24, p, 50)).toEqual([{ strip_id: 7, map_id: 24, zone_id: 2 }]);
  });
  it('שיוך חדש שעוד לא בשרת - נוסף לרשימה', () => {
    const p = mk([[7, { a: { strip_id: 7, map_id: 24, zone_id: 2 }, until: 100 }]]);
    expect(applyPendingAssignments([], 24, p, 50)).toHaveLength(1);
  });
  it('הפ"מ עבר למפה אחרת - יורד מהמפה הקודמת', () => {
    const p = mk([[7, { a: { strip_id: 7, map_id: 22, zone_id: 9 }, until: 100 }]]);
    expect(applyPendingAssignments([{ strip_id: 7, map_id: 24, zone_id: 1 }], 24, p, 50)).toEqual([]);
  });
  it('תוקף פג - השרת גובר והממתין נמחק', () => {
    const p = mk([[7, { a: { strip_id: 7, map_id: 24, zone_id: 2 }, until: 100 }]]);
    const list = [{ strip_id: 7, map_id: 24, zone_id: 1 }];
    expect(applyPendingAssignments(list, 24, p, 150)).toBe(list);
    expect(p.size).toBe(0);
  });
  it('בלי ממתינים - אותה רשימה (בלי רינדור מיותר)', () => {
    const list = [{ strip_id: 1, map_id: 24, zone_id: 1 }];
    expect(applyPendingAssignments(list, 24, mk([]), 0)).toBe(list);
  });
});
