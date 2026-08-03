import { describe, it, expect } from 'vitest';
import {
  MIN_LINK_MEMBERS,
  ROUTE_KINDS,
  addMember,
  groupSummary,
  isMemberTaken,
  linkedRouteIds,
  removeMember,
  routeKind,
  validateLinkGroup,
  type LinkGroup,
  type LinkMember,
} from './routeLinks';

// קישור מסלולים בין עמדות: קבוצה של N חברים (עמדה + מסלול), N>=2.
// המודל הישן היה זוגי (א<->ב) ולא אפשר לקשר יותר משתי עמדות.

const m = (preset_id: number, route_id: number): LinkMember =>
  ({ preset_id, route_id, preset_name: `P${preset_id}`, route_name: `R${route_id}` });

const group = (id: number, ...members: LinkMember[]): LinkGroup =>
  ({ id, name: '', members });

/** סיבת הפסילה, או null אם הקבוצה תקינה - מצמצם את ה-union לצורך הבדיקה. */
const reasonOf = (v: ReturnType<typeof validateLinkGroup>) => (v.ok ? null : v.reason);

describe('validateLinkGroup', () => {
  it('שני חברים זה המינימום', () => {
    expect(MIN_LINK_MEMBERS).toBe(2);
    expect(validateLinkGroup([m(1, 10), m(2, 20)]).ok).toBe(true);
  });

  it('שלוש עמדות ומעלה - זו כל הנקודה', () => {
    expect(validateLinkGroup([m(1, 10), m(2, 20), m(3, 30), m(4, 40)]).ok).toBe(true);
  });

  it('חבר אחד אינו קישור', () => {
    expect(reasonOf(validateLinkGroup([m(1, 10)]))).toBe('tooFew');
  });

  it('אותה עמדה עם אותו מסלול פעמיים נדחית', () => {
    expect(reasonOf(validateLinkGroup([m(1, 10), m(2, 20), m(1, 10)]))).toBe('duplicate');
  });

  it('אותה עמדה עם שני מסלולים שונים מותרת - עמדה יכולה לראות שני מסלולים', () => {
    expect(validateLinkGroup([m(1, 10), m(1, 11)]).ok).toBe(true);
  });

  it('חבר בלי עמדה או בלי מסלול נדחה', () => {
    expect(reasonOf(validateLinkGroup([m(1, 10), { preset_id: 0, route_id: 20 }]))).toBe('incomplete');
    expect(reasonOf(validateLinkGroup([m(1, 10), { preset_id: 2, route_id: 0 }]))).toBe('incomplete');
  });
});

describe('isMemberTaken', () => {
  it('מזהה צמד עמדה+מסלול שכבר בקבוצה', () => {
    const members = [m(1, 10), m(2, 20)];
    expect(isMemberTaken(members, { preset_id: 1, route_id: 10 })).toBe(true);
    expect(isMemberTaken(members, { preset_id: 1, route_id: 11 })).toBe(false);
    expect(isMemberTaken(members, { preset_id: 3, route_id: 10 })).toBe(false);
  });
});

describe('addMember / removeMember', () => {
  it('הוספה מחזירה מערך חדש ואינה משכפלת', () => {
    const before = [m(1, 10)];
    const after = addMember(before, m(2, 20));
    expect(after).toHaveLength(2);
    expect(before).toHaveLength(1);
    expect(addMember(after, m(2, 20))).toHaveLength(2); // כפילות לא נוספת
  });

  it('הסרה לפי אינדקס', () => {
    const after = removeMember([m(1, 10), m(2, 20), m(3, 30)], 1);
    expect(after.map(x => x.preset_id)).toEqual([1, 3]);
  });

  it('אינדקס מחוץ לתחום אינו משנה דבר', () => {
    const before = [m(1, 10), m(2, 20)];
    expect(removeMember(before, 9)).toEqual(before);
    expect(removeMember(before, -1)).toEqual(before);
  });
});

describe('linkedRouteIds - אילו מסלולים מקושרים לשלי', () => {
  const groups = [
    group(1, m(1, 10), m(2, 20), m(3, 30)),
    group(2, m(4, 40), m(5, 50)),
  ];

  it('מחזיר את שאר חברי הקבוצה, בלי המסלול שלי', () => {
    expect(linkedRouteIds(groups, [10]).sort()).toEqual([20, 30]);
  });

  it('מסלול שאינו בשום קבוצה מחזיר ריק', () => {
    expect(linkedRouteIds(groups, [99])).toEqual([]);
  });

  it('כמה מסלולים שלי - איחוד בלי כפילויות', () => {
    expect(linkedRouteIds(groups, [10, 40]).sort((a, b) => a - b)).toEqual([20, 30, 50]);
  });

  it('שני מסלולים שלי באותה קבוצה - כל אחד אינו מחזיר את עצמו', () => {
    const g = [group(1, m(1, 10), m(2, 20), m(3, 30))];
    expect(linkedRouteIds(g, [10, 20]).sort()).toEqual([30]);
  });

  it('קבוצה עם חבר בודד אינה מקשרת דבר', () => {
    expect(linkedRouteIds([group(1, m(1, 10))], [10])).toEqual([]);
  });
});

describe('groupSummary - תיאור הקבוצה לתצוגה', () => {
  it('מונה עמדות ומסלולים ייחודיים', () => {
    const s = groupSummary(group(1, m(1, 10), m(2, 20), m(3, 30)));
    expect(s.presetCount).toBe(3);
    expect(s.routeCount).toBe(3);
  });

  it('אותה עמדה עם שני מסלולים נספרת פעם אחת', () => {
    const s = groupSummary(group(1, m(1, 10), m(1, 11), m(2, 20)));
    expect(s.presetCount).toBe(2);
    expect(s.routeCount).toBe(3);
  });
});

describe('routeKind - סוג המסלול, כדי שהקישור לא ייראה כשייך רק להסעה', () => {
  it('מסלול המראה הוא מסלול טיסה', () => {
    expect(routeKind({ is_runway: true, route_category: 'general' })).toBe('runway');
  });
  it('רכב', () => expect(routeKind({ route_category: 'vehicle' })).toBe('vehicle'));
  it('מטוס', () => expect(routeKind({ route_category: 'aircraft' })).toBe('aircraft'));
  it('ברירת מחדל כללי', () => {
    expect(routeKind({})).toBe('general');
    expect(routeKind({ route_category: 'משהו אחר' })).toBe('general');
  });
  it('is_runway גובר על הקטגוריה', () => {
    expect(routeKind({ is_runway: true, route_category: 'vehicle' })).toBe('runway');
  });
  it('לכל סוג יש אייקון ותווית', () => {
    for (const k of ROUTE_KINDS) {
      expect(k.icon).toBeTruthy();
      expect(k.labelKey).toMatch(/^links\./);
    }
    expect(ROUTE_KINDS.map(k => k.key)).toEqual(['runway', 'aircraft', 'vehicle', 'general']);
  });
});
