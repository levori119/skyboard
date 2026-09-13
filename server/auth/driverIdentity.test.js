// זהות הנהג באפליקציית DRIVER - ת"ז מתוך האסימון, ולא מקלט הלקוח.
import { describe, it, expect } from 'vitest';
import { normalizeNationalId, driverScopeOf, driverMayUseBase, nationalIdSql } from './driverIdentity.js';

describe('normalizeNationalId', () => {
  it('ת"ז מלאה נשארת כמו שהיא', () => {
    expect(normalizeNationalId('012345678')).toBe('012345678');
  });

  // אותו אדם נרשם פעם "12345678" ופעם "012345678" - בלי השלמה הוא לא היה
  // רואה את הנסיעה שנרשמה לו
  it('אפס מוביל שנשמט מושלם ל-9 ספרות', () => {
    expect(normalizeNationalId('12345678')).toBe('012345678');
    expect(normalizeNationalId(12345678)).toBe('012345678');
  });

  it('רווחים ומקפים מוסרים', () => {
    expect(normalizeNationalId(' 01234-567 8 ')).toBe('012345678');
  });

  it('ריק, זבל, קצר מדי או ארוך מדי = אין זהות', () => {
    for (const v of [undefined, null, '', 'abc', '1234', '1234567890']) {
      expect(normalizeNationalId(v)).toBe('');
    }
  });
});

describe('driverScopeOf', () => {
  it('משתמש עמדה אינו מוגבל לנהג', () => {
    expect(driverScopeOf({ role: 'user', nationalId: null })).toEqual({ isDriver: false, nationalId: '', baseIds: [] });
    expect(driverScopeOf(undefined)).toEqual({ isDriver: false, nationalId: '', baseIds: [] });
  });

  it('נהג מקבל את הת"ז ואת הבסיסים שבאסימון', () => {
    expect(driverScopeOf({ role: 'driver', nationalId: '12345678', baseIds: [7, '9'] }))
      .toEqual({ isDriver: true, nationalId: '012345678', baseIds: [7, 9] });
  });

  // אסימון נהג ישן מקוד הגישה המשותף - נהג בלי זהות, ולכן בלי שום נסיעה
  it('נהג בלי ת"ז באסימון = נהג בלי זהות', () => {
    expect(driverScopeOf({ role: 'driver', baseIds: [7] }).nationalId).toBe('');
  });

  // אסימון מלפני הרשאת הבסיסים, או נהג שלא שויך לבסיס: אין לו מה לראות
  it('נהג בלי בסיס מורשה = נהג בלי זהות', () => {
    expect(driverScopeOf({ role: 'driver', nationalId: '012345678' }).nationalId).toBe('');
    expect(driverScopeOf({ role: 'driver', nationalId: '012345678', baseIds: ['x'] }).nationalId).toBe('');
  });
});

describe('driverMayUseBase', () => {
  const driver = driverScopeOf({ role: 'driver', nationalId: '012345678', baseIds: [7] });
  it('עמדה - כל בסיס', () => {
    expect(driverMayUseBase(driverScopeOf({ role: 'user' }), 99)).toBe(true);
  });
  it('נהג - רק בסיס מורשה', () => {
    expect(driverMayUseBase(driver, '7')).toBe(true);
    expect(driverMayUseBase(driver, 8)).toBe(false);
    expect(driverMayUseBase(driver, null)).toBe(false);
  });
});

describe('nationalIdSql', () => {
  it('מנרמל בצד ה-DB באותו כלל - ריק נשאר NULL ולא "000000000"', () => {
    expect(nationalIdSql('d.national_id')).toBe(
      "LPAD(NULLIF(REGEXP_REPLACE(COALESCE(d.national_id, ''), '[^0-9]', '', 'g'), ''), 9, '0')",
    );
  });
});
