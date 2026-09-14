// ניהול נהגים: בחירת נהג מרשימת המורשים במיראז' לבסיס - הכללים בלי DOM.
import { describe, it, expect } from 'vitest';
import { normalizeNationalId, driverChoices, pickDriverError, type MirageDriver } from './mirageDrivers';

const d = (nationalId: string, fullName: string): MirageDriver => {
  const [firstName, ...rest] = fullName.split(' ');
  return { nationalId, firstName, lastName: rest.join(' '), fullName };
};
const MIRAGE = [d('012345678', 'דני כהן'), d('012345682', 'רונית לוי'), d('033333334', 'יוסי מזרחי')];

describe('normalizeNationalId - אותו כלל כמו בכניסת הנהג', () => {
  it('ספרות בלבד, משלים ל-9; פחות מ-5 או יותר מ-9 - ריק', () => {
    expect(normalizeNationalId('12345682')).toBe('012345682');
    expect(normalizeNationalId('012-345-678')).toBe('012345678');
    expect(normalizeNationalId('1234')).toBe('');
    expect(normalizeNationalId('1234567890')).toBe('');
    expect(normalizeNationalId(null)).toBe('');
  });
});

describe('driverChoices - מי מוצע ברשימה', () => {
  const registered = [
    { id: 1, national_id: '12345678' },   // דני - כבר רשום (ת"ז בלי אפס מוביל)
    { id: 2, national_id: '099999990' },  // נהג ותיק שאינו במיראז'
  ];

  it('נהג חדש: בלי מי שכבר רשום בשדה', () => {
    const r = driverChoices(MIRAGE, registered, null);
    expect(r.choices.map(x => x.nationalId)).toEqual(['012345682', '033333334']);
    expect(r.currentMissing).toBe(false);
  });

  it('עריכת נהג: הנהג עצמו נשאר ברשימה', () => {
    const r = driverChoices(MIRAGE, registered, registered[0]);
    expect(r.choices.map(x => x.nationalId)).toContain('012345678');
    expect(r.currentMissing).toBe(false);
  });

  // נהג שנרשם לפני החובה, או שהרשאתו הוסרה במיראז' - מסומן, לא נעלם בשקט
  it('נהג רשום שאינו במיראז\' - currentMissing', () => {
    expect(driverChoices(MIRAGE, registered, registered[1]).currentMissing).toBe(true);
  });
});

describe('pickDriverError - מתי אסור לשמור', () => {
  it('נהג חדש: חייב ת"ז של נהג מהרשימה', () => {
    expect(pickDriverError({ nationalId: '', original: null, mirage: MIRAGE })).toBe('pick');
    expect(pickDriverError({ nationalId: '055555556', original: null, mirage: MIRAGE })).toBe('pick');
    expect(pickDriverError({ nationalId: '12345682', original: null, mirage: MIRAGE })).toBeNull();
  });

  it('המיראז\' לא זמין - אי אפשר להוסיף נהג', () => {
    expect(pickDriverError({ nationalId: '012345678', original: null, mirage: null })).toBe('unavailable');
  });

  // בלי זה נהג ותיק היה ננעל: אי אפשר היה לעדכן לו אפילו הערה
  it('עריכת נהג בלי החלפה - מותר, גם כשאינו במיראז\' או שהמיראז\' לא זמין', () => {
    expect(pickDriverError({ nationalId: '099999990', original: '99999990', mirage: MIRAGE })).toBeNull();
    expect(pickDriverError({ nationalId: '099999990', original: '099999990', mirage: null })).toBeNull();
  });

  it('עריכה שמחליפה את הנהג - שוב חייב מהרשימה', () => {
    expect(pickDriverError({ nationalId: '055555556', original: '099999990', mirage: MIRAGE })).toBe('pick');
    expect(pickDriverError({ nationalId: '033333334', original: '099999990', mirage: MIRAGE })).toBeNull();
    expect(pickDriverError({ nationalId: '033333334', original: '099999990', mirage: null })).toBe('unavailable');
  });
});
