import { describe, it, expect } from 'vitest';
import {
  RUNWAY_AID_TYPES,
  aidMarksForEnd,
  aidStatusColor,
  aidStatusCrossed,
  aidStatusNeedsNote,
  aidsForEnd,
  anyAidDegraded,
  normalizeAidStatus,
  parseAidList,
} from './runwayAids';

// אמצעי נחיתה: ההגדרה (אילו אמצעים בקצה) מגיעה מהשדה, הסטטוס מהעמדה.
// הכלל שנבדק כאן: **ההגדרה קובעת מה מוצג**, הסטטוס רק צובע.

const RW = { id: 7, aids_a: ['ILS', 'GS'], aids_b: ['TACAN'] };

describe('parseAidList - הגדרת האמצעים', () => {
  it('מקבלת מערך, מחרוזת JSON ורשימה מופרדת בפסיקים', () => {
    expect(parseAidList(['ILS', 'VOR'])).toEqual(['ILS', 'VOR']);
    expect(parseAidList('["LOC","GS"]')).toEqual(['LOC', 'GS']);
    expect(parseAidList('ILS, TACAN')).toEqual(['ILS', 'TACAN']);
  });

  it('מנקה רווחים, אותיות קטנות וכפילויות - וזורקת מה שאינו אמצעי מוכר', () => {
    expect(parseAidList([' ils ', 'ILS', 'PAPI', '', null])).toEqual(['ILS']);
  });

  it('סדר ההגדרה נשמר - הוא סדר התצוגה על המסלול', () => {
    expect(parseAidList(['TACAN', 'ILS'])).toEqual(['TACAN', 'ILS']);
  });

  it('ריק / לא תקין = אין אמצעים', () => {
    for (const v of [null, undefined, '', '   ', '{oops', 42, {}]) expect(parseAidList(v)).toEqual([]);
  });

  it('כל הסוגים שבאפיון מוכרים', () => {
    expect([...RUNWAY_AID_TYPES]).toEqual(['ILS', 'LOC', 'GS', 'VOR', 'TACAN']);
  });
});

describe('aidsForEnd - אמצעי שייך לקצה, לא למסלול', () => {
  it('כל קצה והאמצעים שלו', () => {
    expect(aidsForEnd(RW, 'a')).toEqual(['ILS', 'GS']);
    expect(aidsForEnd(RW, 'b')).toEqual(['TACAN']);
  });

  it('מסלול בלי הגדרה - בלי אמצעים', () => {
    expect(aidsForEnd({ id: 1 }, 'a')).toEqual([]);
    expect(aidsForEnd(null, 'b')).toEqual([]);
  });
});

describe('normalizeAidStatus - ברירת המחדל היא שמיש', () => {
  it('אמצעי מוגדר בלי דיווח הוא תקין', () => {
    for (const v of [null, undefined, '', 'לא-מוכר']) expect(normalizeAidStatus(v)).toBe('ok');
  });

  it('סטטוס מוכר נשמר, גם באותיות גדולות', () => {
    expect(normalizeAidStatus('maintenance')).toBe('maintenance');
    expect(normalizeAidStatus('RESTRICTED')).toBe('restricted');
  });
});

describe('צבע וסימון לפי סטטוס', () => {
  it('ירוק שמיש, אדום לא שמיש ואחזקה, כתום מוחרג', () => {
    expect(aidStatusColor('ok')).toBe('#22c55e');
    expect(aidStatusColor('unserviceable')).toBe('#ef4444');
    expect(aidStatusColor('maintenance')).toBe('#ef4444');
    expect(aidStatusColor('restricted')).toBe('#f59e0b');
  });

  it('ה-X מבחין בין "לא שמיש" ל"אחזקה" - שניהם אדומים', () => {
    expect(aidStatusCrossed('unserviceable')).toBe(true);
    expect(aidStatusCrossed('maintenance')).toBe(false);
    expect(aidStatusColor('maintenance')).toBe(aidStatusColor('unserviceable'));
  });

  it('רק להחרגה יש הערה שנושאת מידע תפעולי', () => {
    expect(aidStatusNeedsNote('restricted')).toBe(true);
    expect(aidStatusNeedsNote('ok')).toBe(false);
  });
});

describe('aidMarksForEnd - הגדרה + סטטוס', () => {
  const statuses = [
    { runway_id: 7, end_side: 'a', aid_type: 'ILS', status: 'restricted', note: 'GP בלבד' },
    { runway_id: 7, end_side: 'b', aid_type: 'TACAN', status: 'unserviceable', note: null },
    // סטטוס לאמצעי שהוסר מההגדרה - חייב ליפול, אחרת נשאר "אמצעי רפאים"
    { runway_id: 7, end_side: 'a', aid_type: 'VOR', status: 'maintenance', note: null },
    // סטטוס של מסלול אחר
    { runway_id: 9, end_side: 'a', aid_type: 'GS', status: 'maintenance', note: null },
  ];

  it('מחזיר בדיוק את האמצעים המוגדרים, בסדר ההגדרה', () => {
    expect(aidMarksForEnd(RW, 'a', statuses).map(m => m.type)).toEqual(['ILS', 'GS']);
  });

  it('אמצעי מוגדר בלי דיווח מוצג כשמיש', () => {
    const gs = aidMarksForEnd(RW, 'a', statuses).find(m => m.type === 'GS')!;
    expect(gs.status).toBe('ok');
    expect(gs.note).toBe('');
  });

  it('הערת ההחרגה נשמרת - היא ה-HINT שמוצג על המסלול', () => {
    const ils = aidMarksForEnd(RW, 'a', statuses).find(m => m.type === 'ILS')!;
    expect(ils.status).toBe('restricted');
    expect(ils.note).toBe('GP בלבד');
  });

  it('סטטוס של קצה אחר או מסלול אחר אינו זולג', () => {
    expect(aidMarksForEnd(RW, 'b', statuses)).toEqual([{ type: 'TACAN', status: 'unserviceable', note: '' }]);
    expect(aidMarksForEnd({ id: 9, aids_a: ['GS'] }, 'a', statuses)[0].status).toBe('maintenance');
  });

  it('בלי סטטוסים כלל - הכל שמיש', () => {
    expect(aidMarksForEnd(RW, 'a').every(m => m.status === 'ok')).toBe(true);
    expect(anyAidDegraded(aidMarksForEnd(RW, 'a'))).toBe(false);
    expect(anyAidDegraded(aidMarksForEnd(RW, 'a', statuses))).toBe(true);
  });
});
