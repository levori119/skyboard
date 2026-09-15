import { describe, it, expect } from 'vitest';
import { resolveAircraftOnly, applyAircraftOnlyChoice } from './joiningPointProps.js';

// "מטוסים בלבד" בנקודת הצטרפות: הניהול קובע ברירת מחדל, והעמדה יכולה לדרוס
// לעצמה. null בעמדה = הולכת אחרי הניהול.

describe('resolveAircraftOnly', () => {
  it('בלי בחירה בעמדה - ברירת המחדל של הניהול', () => {
    expect(resolveAircraftOnly(true, null)).toEqual({ value: true, fromStation: false, defaultValue: true });
    expect(resolveAircraftOnly(false, undefined)).toEqual({ value: false, fromStation: false, defaultValue: false });
  });

  it('בחירת העמדה גוברת - גם כשהיא "לא" מול "כן" בניהול', () => {
    expect(resolveAircraftOnly(true, false)).toEqual({ value: false, fromStation: true, defaultValue: true });
    expect(resolveAircraftOnly(false, true)).toEqual({ value: true, fromStation: true, defaultValue: false });
  });

  it('ערכים לא בוליאניים מה-DB לא נקראים כבחירה', () => {
    expect(resolveAircraftOnly(null, 'x').value).toBe(false);
    expect(resolveAircraftOnly(null, 'x').fromStation).toBe(false);
  });
});

describe('applyAircraftOnlyChoice - עדכון מיידי במסך העמדה', () => {
  const points = [
    { id: 1, expand_aircraft: false, expand_aircraft_default: false, expand_aircraft_override: null },
    { id: 2, expand_aircraft: true, expand_aircraft_default: true, expand_aircraft_override: null },
  ];

  it('בחירה בעמדה: הערך בתוקף מתעדכן והדריסה נרשמת', () => {
    const r = applyAircraftOnlyChoice(points, 1, true);
    expect(r[0]).toEqual(expect.objectContaining({ expand_aircraft: true, expand_aircraft_override: true, expand_aircraft_default: false }));
    expect(r[1]).toBe(points[1]);
  });

  it('חזרה לברירת המחדל: הערך חוזר לזה של הניהול', () => {
    const chosen = applyAircraftOnlyChoice(points, 2, false);
    const back = applyAircraftOnlyChoice(chosen, 2, null);
    expect(back[1]).toEqual(expect.objectContaining({ expand_aircraft: true, expand_aircraft_override: null }));
  });

  it('נקודה בלי שדה ברירת מחדל (תשובה ישנה) - ברירת המחדל נגזרת מהערך הנוכחי', () => {
    const r = applyAircraftOnlyChoice([{ id: 3, expand_aircraft: true }], 3, null);
    expect(r[0].expand_aircraft).toBe(true);
  });

  it('לא משנה את הקלט', () => {
    applyAircraftOnlyChoice(points, 1, true);
    expect(points[0].expand_aircraft).toBe(false);
  });
});
