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

// קישור מסלולים בין **שדות תעופה**: קבוצה של N מסלולים, N>=2.
// המודל הקודם קישר בין **עמדות** - וזו הייתה הטעות: מסלול שייך לשדה, לא לעמדה,
// ואותו מסלול פיזי נראה בשמות שונים בשני שדות. עמדה רואה את המסלול דרך השדה שלה.

const m = (route_id: number, airfield_id = route_id): LinkMember =>
  ({ route_id, route_name: `R${route_id}`, airfield_id, airfield_name: `A${airfield_id}` });

const group = (id: number, ...members: LinkMember[]): LinkGroup =>
  ({ id, name: '', members });

/** סיבת הפסילה, או null אם הקבוצה תקינה - מצמצם את ה-union לצורך הבדיקה. */
const reasonOf = (v: ReturnType<typeof validateLinkGroup>) => (v.ok ? null : v.reason);

describe('validateLinkGroup', () => {
  it('שני מסלולים זה המינימום', () => {
    expect(MIN_LINK_MEMBERS).toBe(2);
    expect(validateLinkGroup([m(10, 1), m(20, 2)]).ok).toBe(true);
  });

  it('שלושה שדות ומעלה - זו כל הנקודה', () => {
    expect(validateLinkGroup([m(10, 1), m(20, 2), m(30, 3), m(40, 4)]).ok).toBe(true);
  });

  it('מסלול בודד אינו קישור', () => {
    expect(reasonOf(validateLinkGroup([m(10, 1)]))).toBe('tooFew');
  });

  it('אותו מסלול פעמיים נדחה', () => {
    expect(reasonOf(validateLinkGroup([m(10, 1), m(20, 2), m(10, 1)]))).toBe('duplicate');
  });

  it('שני מסלולים שונים מאותו שדה מותרים - שדה יכול להחזיק שני מסלולים מקושרים', () => {
    expect(validateLinkGroup([m(10, 1), m(11, 1)]).ok).toBe(true);
  });

  it('חבר בלי מסלול נדחה', () => {
    expect(reasonOf(validateLinkGroup([m(10, 1), { route_id: 0, airfield_id: 2 }]))).toBe('incomplete');
  });
});

describe('isMemberTaken', () => {
  it('מזהה מסלול שכבר בקבוצה - בלי תלות בשדה', () => {
    const members = [m(10, 1), m(20, 2)];
    expect(isMemberTaken(members, { route_id: 10 })).toBe(true);
    expect(isMemberTaken(members, { route_id: 11 })).toBe(false);
  });
});

describe('addMember / removeMember', () => {
  it('הוספה מחזירה מערך חדש ואינה משכפלת', () => {
    const before = [m(10, 1)];
    const after = addMember(before, m(20, 2));
    expect(after).toHaveLength(2);
    expect(before).toHaveLength(1);
    expect(addMember(after, m(20, 2))).toHaveLength(2); // כפילות לא נוספת
  });

  it('הסרה לפי אינדקס', () => {
    const after = removeMember([m(10, 1), m(20, 2), m(30, 3)], 1);
    expect(after.map(x => x.route_id)).toEqual([10, 30]);
  });

  it('אינדקס מחוץ לתחום אינו משנה דבר', () => {
    const before = [m(10, 1), m(20, 2)];
    expect(removeMember(before, 9)).toEqual(before);
    expect(removeMember(before, -1)).toEqual(before);
  });
});

describe('linkedRouteIds - אילו מסלולים מקושרים לשלי', () => {
  const groups = [
    group(1, m(10, 1), m(20, 2), m(30, 3)),
    group(2, m(40, 4), m(50, 5)),
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
    const g = [group(1, m(10, 1), m(20, 2), m(30, 3))];
    expect(linkedRouteIds(g, [10, 20]).sort()).toEqual([30]);
  });

  it('קבוצה עם חבר בודד אינה מקשרת דבר', () => {
    expect(linkedRouteIds([group(1, m(10, 1))], [10])).toEqual([]);
  });
});

describe('groupSummary - תיאור הקבוצה לתצוגה', () => {
  it('מונה שדות ומסלולים ייחודיים', () => {
    const s = groupSummary(group(1, m(10, 1), m(20, 2), m(30, 3)));
    expect(s.airfieldCount).toBe(3);
    expect(s.routeCount).toBe(3);
  });

  it('אותו שדה עם שני מסלולים נספר פעם אחת', () => {
    const s = groupSummary(group(1, m(10, 1), m(11, 1), m(20, 2)));
    expect(s.airfieldCount).toBe(2);
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
