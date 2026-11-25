import { describe, it, expect } from 'vitest';
import { parsePlannedZones, formatPlannedZones, matchPlannedZones, plannedZoneLabel } from './plannedZones';

describe('parsePlannedZones', () => {
  it('מפריד בפסיק/נקודה-פסיק/קו נטוי, לא ברווח; בלי כפילויות', () => {
    expect(parsePlannedZones('705, 711;712 / 705')).toEqual(['705', '711', '712']);
    expect(parsePlannedZones('קדמי דרום, 711')).toEqual(['קדמי דרום', '711']);
  });
  it('ריק / לא מחרוזת - רשימה ריקה', () => {
    expect(parsePlannedZones('')).toEqual([]);
    expect(parsePlannedZones(null)).toEqual([]);
    expect(parsePlannedZones(' , ')).toEqual([]);
  });
  it('פורמט חזרה', () => { expect(formatPlannedZones(['705', '711'])).toBe('705, 711'); });
});

describe('matchPlannedZones', () => {
  const zones = [{ id: 1, name: '703' }, { id: 2, name: '711' }, { id: 3, name: 'קדמי  דרום' }];
  it('לפי שם, בסדר שנרשם בפ"מ; שם שאינו במפה - מדולג', () => {
    expect(matchPlannedZones(['711', '999', '703'], zones).map(z => z.id)).toEqual([2, 1]);
  });
  it('רווחים ורישיות לא משנים', () => {
    expect(matchPlannedZones(['קדמי דרום'], zones).map(z => z.id)).toEqual([3]);
  });
});

describe('plannedZoneLabel', () => {
  const now = Date.parse('2026-11-26T09:00:00Z');
  const at = (min: number) => new Date(now + min * 60_000).toISOString();
  it('המריא - כחול, בלי תלות בשעה', () => {
    expect(plannedZoneLabel({ airborne: true, takeoffTime: at(120) }, now)).toBe('airborne');
    expect(plannedZoneLabel({ airborne: true, takeoffTime: null }, now)).toBe('airborne');
  });
  it('פחות מ-10 דקות להמראה - אפור; בדיוק 10 או יותר - מוסתר', () => {
    expect(plannedZoneLabel({ airborne: false, takeoffTime: at(9) }, now)).toBe('pending');
    expect(plannedZoneLabel({ airborne: false, takeoffTime: at(10) }, now)).toBe('hidden');
    expect(plannedZoneLabel({ airborne: false, takeoffTime: at(45) }, now)).toBe('hidden');
  });
  it('זמן ההמראה עבר ולא סומן שהמריא - נשאר אפור', () => {
    expect(plannedZoneLabel({ airborne: false, takeoffTime: at(-20) }, now)).toBe('pending');
  });
  it('בלי זמן המראה / זמן לא תקין - מוסתר', () => {
    expect(plannedZoneLabel({ airborne: false, takeoffTime: null }, now)).toBe('hidden');
    expect(plannedZoneLabel({ airborne: false, takeoffTime: 'בקרוב' }, now)).toBe('hidden');
  });
});
