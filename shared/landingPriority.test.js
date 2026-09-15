import { describe, it, expect } from 'vitest';
import {
  datkNumberOf, parseLandingPriority, sameRunway, pickLandingRunway, planLandingRunways,
} from './landingPriority.js';

describe('datkNumberOf - מספר הדת"ק מתוך שם הנקודה', () => {
  it('כל צורות הכתיבה', () => {
    for (const [name, n] of [['5', 5], ['דת"ק 5', 5], ['דת"ק5', 5], ['דתק 5', 5], ['דתק5', 5], ['דת"ק-5', 5], ['דת״ק 3', 3], [' 12 ', 12]]) {
      expect(datkNumberOf(name)).toBe(n);
    }
  });
  it('שם בלי מספר דת"ק - null', () => {
    for (const v of ['', null, undefined, 'חניה צפונית', 'דת"ק', '5א']) expect(datkNumberOf(v)).toBeNull();
  });
});

describe('parseLandingPriority - רשימת המסלולים בסדר רץ', () => {
  it('מערך, JSON ומחרוזת מופרדת - מנוקים, בלי ריקים ובלי כפילויות, הסדר נשמר', () => {
    expect(parseLandingPriority(['26', ' 08 ', '', '26'])).toEqual(['26', '08']);
    expect(parseLandingPriority('["33","15"]')).toEqual(['33', '15']);
    expect(parseLandingPriority('26, 08L ,27')).toEqual(['26', '08L', '27']);
  });
  it('קלט ריק או שבור - רשימה ריקה', () => {
    for (const v of [null, undefined, '', '[]', {}, 42]) expect(parseLandingPriority(v)).toEqual([]);
  });
});

describe('sameRunway - השוואת מספר מסלול', () => {
  it('רישיות, רווחים ואפסים מובילים לא משנים', () => {
    expect(sameRunway('08', '8')).toBe(true);
    expect(sameRunway('08l', '8L')).toBe(true);
    expect(sameRunway(' 26 ', '26')).toBe(true);
  });
  it('מסלולים שונים', () => {
    expect(sameRunway('08L', '08R')).toBe(false);
    expect(sameRunway('26', '08')).toBe(false);
    expect(sameRunway('', '')).toBe(false);
  });
});

describe('pickLandingRunway - המסלול הראשון בעדיפות שפתוח לנחיתות', () => {
  it('העדיפות הראשונה פתוחה - נבחרת', () => {
    expect(pickLandingRunway(['26', '08'], ['08', '26'])).toBe('26');
  });
  it('העדיפות הראשונה סגורה - יורדים לבאה', () => {
    expect(pickLandingRunway(['26', '33', '08'], ['08', '33'])).toBe('33');
  });
  it('מחזיר את השם כפי שהוא במסלולים הפתוחים', () => {
    expect(pickLandingRunway(['8'], ['08'])).toBe('08');
  });
  it('אף מסלול מהרשימה לא פתוח, או שאין רשימה - null', () => {
    expect(pickLandingRunway(['26'], ['08'])).toBeNull();
    expect(pickLandingRunway([], ['08'])).toBeNull();
    expect(pickLandingRunway(['26'], [])).toBeNull();
  });
});

describe('planLandingRunways - חלוקת מבנה למסלולים', () => {
  const points = [
    { name: 'דת"ק 1', point_type: 'datk', landing_priority: ['26', '08'] },
    { name: 'דת"ק 2', point_type: 'datk', landing_priority: ['08', '26'] },
    { name: 'דת"ק 3', point_type: 'datk', landing_priority: [] },
    // נקודה שאינה דת"ק - סדר העדיפויות שלה לא נחשב גם כשהשם מתאים
    { name: '4', point_type: 'general', landing_priority: ['26'] },
  ];

  it('כל מטוס לפי סדר העדיפויות של הדת"ק שלו', () => {
    const plan = planLandingRunways({
      aircraft: [{ idx: 1, datk: 1 }, { idx: 2, datk: 1 }, { idx: 3, datk: 2 }, { idx: 4, datk: 2 }],
      points, landingRunways: ['08', '26'],
    });
    expect(plan).toEqual([
      { idx: 1, runway_ident: '26' }, { idx: 2, runway_ident: '26' },
      { idx: 3, runway_ident: '08' }, { idx: 4, runway_ident: '08' },
    ]);
  });

  it('רק מסלולים פתוחים לנחיתות: העדיפות הסגורה מדולגת', () => {
    const plan = planLandingRunways({
      aircraft: [{ idx: 1, datk: 1 }, { idx: 2, datk: 2 }],
      points, landingRunways: ['08'],
    });
    expect(plan).toEqual([{ idx: 1, runway_ident: '08' }, { idx: 2, runway_ident: '08' }]);
  });

  it('מטוס שכבר יש לו מסלול לא נדרס', () => {
    const plan = planLandingRunways({
      aircraft: [{ idx: 1, datk: 1, runway_ident: '08' }, { idx: 2, datk: 1, runway_ident: '' }],
      points, landingRunways: ['08', '26'],
    });
    expect(plan).toEqual([{ idx: 2, runway_ident: '26' }]);
  });

  it('בלי דת"ק, דת"ק בלי נקודה, דת"ק בלי סדר עדיפויות, נקודה שאינה דת"ק - המטוס לא משובץ', () => {
    const plan = planLandingRunways({
      aircraft: [{ idx: 1, datk: null }, { idx: 2, datk: 9 }, { idx: 3, datk: 3 }, { idx: 4, datk: 4 }],
      points, landingRunways: ['08', '26'],
    });
    expect(plan).toEqual([]);
  });

  it('סדר העדיפויות מגיע גם כ-JSON מה-DB', () => {
    const plan = planLandingRunways({
      aircraft: [{ idx: 1, datk: '1' }],
      points: [{ name: 'דת"ק 1', point_type: 'datk', landing_priority: '["33","26"]' }],
      landingRunways: ['26'],
    });
    expect(plan).toEqual([{ idx: 1, runway_ident: '26' }]);
  });
});
