// מקבע את מטריצת מקרי הסטטוס של אישור הכניסה. הכלל "אוטומטי לפי התאריכים אך
// ניתן לדרוס ידנית" הוא לב הפיצ'ר, ורגרסיה בו משנה מי נכנס לשדה.

import { describe, expect, it } from 'vitest';
import {
  computedPermitStatus, dateOnly, daysUntilExpiry, effectivePermitStatus,
  isPermitOverridden, permitStatusKey,
} from './permitStatus';

const NOW = new Date(2026, 8, 10); // 2026-09-10

describe('computedPermitStatus - הנגזרת מהתאריכים', () => {
  it('בלי תאריך פג תוקף - בבדיקה', () => {
    expect(computedPermitStatus({ permit_from: '2026-01-01' }, NOW)).toBe('pending');
    expect(computedPermitStatus({}, NOW)).toBe('pending');
  });

  it('בתוך הטווח - מאושר', () => {
    expect(computedPermitStatus({ permit_from: '2026-01-01', permit_until: '2026-12-31' }, NOW)).toBe('approved');
  });

  it('אחרי פג התוקף - לא מאושר', () => {
    expect(computedPermitStatus({ permit_from: '2026-01-01', permit_until: '2026-09-09' }, NOW)).toBe('not_approved');
  });

  it('יום פג התוקף עצמו עדיין מאושר', () => {
    expect(computedPermitStatus({ permit_until: '2026-09-10' }, NOW)).toBe('approved');
  });

  it('טרם נכנס לתוקף - בבדיקה', () => {
    expect(computedPermitStatus({ permit_from: '2026-10-01', permit_until: '2026-12-31' }, NOW)).toBe('pending');
  });

  it('יום תחילת התוקף עצמו כבר מאושר', () => {
    expect(computedPermitStatus({ permit_from: '2026-09-10', permit_until: '2026-12-31' }, NOW)).toBe('approved');
  });

  it('בלי תאריך התחלה אך עם תוקף עתידי - מאושר', () => {
    expect(computedPermitStatus({ permit_until: '2026-12-31' }, NOW)).toBe('approved');
  });

  it('חותמת TIMESTAMPTZ מלאה נחתכת ליום', () => {
    expect(computedPermitStatus({ permit_until: '2026-12-31T00:00:00.000Z' }, NOW)).toBe('approved');
  });
});

describe('effectivePermitStatus - הדריסה הידנית', () => {
  it('דריסה גוברת על תאריכים תקפים', () => {
    const p = { permit_from: '2026-01-01', permit_until: '2026-12-31', status_override: 'rejected' };
    expect(computedPermitStatus(p, NOW)).toBe('approved');
    expect(effectivePermitStatus(p, NOW)).toBe('rejected');
  });

  it('דריסה מאשרת גם כשפג התוקף', () => {
    const p = { permit_until: '2020-01-01', status_override: 'approved' };
    expect(effectivePermitStatus(p, NOW)).toBe('approved');
  });

  it('דריסה ריקה או לא חוקית נופלת לנגזרת', () => {
    expect(effectivePermitStatus({ permit_until: '2026-12-31', status_override: null }, NOW)).toBe('approved');
    expect(effectivePermitStatus({ permit_until: '2026-12-31', status_override: '' }, NOW)).toBe('approved');
    expect(effectivePermitStatus({ permit_until: '2026-12-31', status_override: 'שטויות' }, NOW)).toBe('approved');
  });

  it('isPermitOverridden מזהה רק דריסה חוקית', () => {
    expect(isPermitOverridden({ status_override: 'pending' })).toBe(true);
    expect(isPermitOverridden({ status_override: null })).toBe(false);
    expect(isPermitOverridden({ status_override: 'nonsense' })).toBe(false);
  });
});

describe('עזרי תאריך', () => {
  it('dateOnly חותך ומטפל בריק', () => {
    expect(dateOnly('2026-09-10T12:00:00Z')).toBe('2026-09-10');
    expect(dateOnly(null)).toBe('');
    expect(dateOnly(undefined)).toBe('');
  });

  it('daysUntilExpiry סופר ימים, ושלילי כשפג', () => {
    expect(daysUntilExpiry({ permit_until: '2026-09-17' }, NOW)).toBe(7);
    expect(daysUntilExpiry({ permit_until: '2026-09-10' }, NOW)).toBe(0);
    expect(daysUntilExpiry({ permit_until: '2026-09-03' }, NOW)).toBe(-7);
    expect(daysUntilExpiry({}, NOW)).toBeNull();
  });
});

describe('permitStatusKey', () => {
  it('בונה מפתחות i18n קיימים', () => {
    expect(permitStatusKey('approved')).toBe('permits.statusApproved');
    expect(permitStatusKey('not_approved')).toBe('permits.statusNotApproved');
    expect(permitStatusKey('pending')).toBe('permits.statusPending');
    expect(permitStatusKey('rejected')).toBe('permits.statusRejected');
  });
});
