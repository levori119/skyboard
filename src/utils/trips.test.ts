import { describe, it, expect } from 'vitest';
import {
  DEPARTURE_ALERT_MINUTES, DRIVER_ACTION_ALERT_MINUTES, STALE_TRIP_HOURS, TRIP_STATUSES, TRIP_VEHICLE_ICONS,
  asTripStatus, hasPendingDriverChange, isDepartureAlertDue, isDriverActionFresh, isVehicleOnMap,
  minutesUntilDeparture, normalizeEscorts, normalizeStops, pendingChangeFields,
  stopLabel, suggestedVehicleIcon, tripIcon, tripStatusKey,
} from './trips';

const NOW = new Date('2026-09-12T10:00:00Z').getTime();
/** זמן יציאה N דקות מעכשיו (שלילי = כבר עבר). */
const inMin = (m: number) => new Date(NOW + m * 60_000).toISOString();

describe('סטטוס נסיעה', () => {
  it('ארבעת הסטטוסים, בסדר התפריט', () => {
    expect(TRIP_STATUSES).toEqual(['approved', 'not_approved', 'pending', 'ended']);
  });

  it('מפתח ה-i18n נגזר מהסטטוס - כולל שם עם קו תחתון', () => {
    expect(tripStatusKey('approved')).toBe('trips.statusApproved');
    expect(tripStatusKey('not_approved')).toBe('trips.statusNotApproved');
    expect(tripStatusKey('pending')).toBe('trips.statusPending');
    expect(tripStatusKey('ended')).toBe('trips.statusEnded');
  });

  it('סטטוס לא מוכר נקרא כ"ממתין" ולא מפיל תצוגה', () => {
    expect(asTripStatus('approved')).toBe('approved');
    expect(asTripStatus('שיבוש')).toBe('pending');
    expect(asTripStatus(null)).toBe('pending');
    expect(asTripStatus(undefined)).toBe('pending');
  });
});

describe('חלון ההתראה - הרכב על המפה 10 דקות לפני', () => {
  it('דקות עד היציאה', () => {
    expect(minutesUntilDeparture(inMin(30), NOW)).toBe(30);
    expect(minutesUntilDeparture(inMin(-5), NOW)).toBe(-5);
    expect(minutesUntilDeparture(null, NOW)).toBeNull();
    expect(minutesUntilDeparture('לא תאריך', NOW)).toBeNull();
  });

  it('הרכב אינו על המפה לפני שנפתח החלון', () => {
    expect(isVehicleOnMap({ scheduled_at: inMin(DEPARTURE_ALERT_MINUTES + 1), status: 'approved' }, NOW)).toBe(false);
  });

  it('הרכב עולה על המפה בדיוק 10 דקות לפני', () => {
    expect(isVehicleOnMap({ scheduled_at: inMin(DEPARTURE_ALERT_MINUTES), status: 'approved' }, NOW)).toBe(true);
  });

  // נסיעה שאיחרה היא בדיוק זו שהפקח צריך לראות - החלון אינו נסגר בשעת היציאה
  it('נסיעה שזמנה עבר נשארת על המפה', () => {
    expect(isVehicleOnMap({ scheduled_at: inMin(-40), status: 'pending' }, NOW)).toBe(true);
  });

  it('נסיעה שהסתיימה יורדת מהמפה', () => {
    expect(isVehicleOnMap({ scheduled_at: inMin(-5), status: 'ended' }, NOW)).toBe(false);
  });

  it('נסיעה בלי זמן מתוכנן אינה עולה על המפה', () => {
    expect(isVehicleOnMap({ scheduled_at: null, status: 'approved' }, NOW)).toBe(false);
  });

  // בלי גבול תחתון, נסיעה משבוע שעבר שאיש לא סגר נשארת על המפה לנצח
  it('נסיעה ישנה שלא נסגרה יורדת מהמפה אחרי חלון ההתיישנות', () => {
    const justInside = -STALE_TRIP_HOURS * 60 + 1;
    expect(isVehicleOnMap({ scheduled_at: inMin(justInside), status: 'pending' }, NOW)).toBe(true);
    expect(isVehicleOnMap({ scheduled_at: inMin(-STALE_TRIP_HOURS * 60 - 1), status: 'pending' }, NOW)).toBe(false);
  });
});

describe('התראת תחילת נסיעה - פעם אחת בלבד', () => {
  it('עולה כשנפתח החלון', () => {
    expect(isDepartureAlertDue({ scheduled_at: inMin(3), status: 'approved' }, NOW)).toBe(true);
  });

  // בלי זה הפקח מקבל את אותה התראה בכל poll ולומד להתעלם ממנה
  it('אינה עולה שוב אחרי שסומנה', () => {
    expect(isDepartureAlertDue(
      { scheduled_at: inMin(3), status: 'approved', departure_alerted_at: inMin(-1) }, NOW,
    )).toBe(false);
  });

  it('אינה עולה לפני שנפתח החלון', () => {
    expect(isDepartureAlertDue({ scheduled_at: inMin(45), status: 'approved' }, NOW)).toBe(false);
  });
});

describe('התראה על פעולת נהג - מתפרצת רק כשהיא טרייה', () => {
  it('אישור שזה עתה ניתן מתפרץ', () => {
    expect(isDriverActionFresh(inMin(-2), NOW)).toBe(true);
  });

  // בלי גבול, אישור מלפני שלושה ימים קופץ בכל פתיחת עמדה
  it('אישור ישן אינו מתפרץ', () => {
    expect(isDriverActionFresh(inMin(-DRIVER_ACTION_ALERT_MINUTES - 1), NOW)).toBe(false);
    expect(isDriverActionFresh(inMin(-DRIVER_ACTION_ALERT_MINUTES + 1), NOW)).toBe(true);
  });

  // הפרשי שעון בין השרת לעמדה לא אמורים לבלוע התראה
  it('סטייה קטנה קדימה עדיין מתפרצת, סטייה גדולה לא', () => {
    expect(isDriverActionFresh(inMin(0.5), NOW)).toBe(true);
    expect(isDriverActionFresh(inMin(5), NOW)).toBe(false);
  });

  it('בלי חותמת זמן אין התראה', () => {
    expect(isDriverActionFresh(null, NOW)).toBe(false);
    expect(isDriverActionFresh('לא תאריך', NOW)).toBe(false);
  });
});

describe('אייקון הרכב', () => {
  it('מוצע לפי סוג הרכב, בעברית ובאנגלית', () => {
    expect(suggestedVehicleIcon('אמבולנס')).toBe('🚑');
    expect(suggestedVehicleIcon('משאית הובלה')).toBe('🚚');
    expect(suggestedVehicleIcon('אוטובוס הסעות')).toBe('🚌');
    expect(suggestedVehicleIcon('Fire truck')).toBe('🚒');
    expect(suggestedVehicleIcon('מיכלית דלק')).toBe('⛽');
  });

  it('סוג לא מוכר או ריק מקבל את ברירת המחדל', () => {
    expect(suggestedVehicleIcon('משהו אחר')).toBe(TRIP_VEHICLE_ICONS[0]);
    expect(suggestedVehicleIcon('')).toBe(TRIP_VEHICLE_ICONS[0]);
    expect(suggestedVehicleIcon(null)).toBe(TRIP_VEHICLE_ICONS[0]);
  });

  it('דריסה ידנית גוברת על המוצע', () => {
    expect(tripIcon({ icon: '🚜', vehicle_type_name: 'אמבולנס' })).toBe('🚜');
  });

  // ריק = "השתמש במוצע", ולכן האייקון עוקב אחרי סוג הרכב גם אחרי שהוא משתנה
  it('בלי דריסה - האייקון נגזר מסוג הרכב', () => {
    expect(tripIcon({ icon: '', vehicle_type_name: 'אמבולנס' })).toBe('🚑');
    expect(tripIcon({ icon: null, vehicle_type_name: 'משטרה צבאית' })).toBe('🚓');
  });
});

describe('תחנות ביניים', () => {
  it('קוראת JSONB ומחרוזת JSON באותה תוצאה', () => {
    const expected = [{ point_id: 4, text: '' }, { point_id: null, text: 'שער דרומי' }];
    expect(normalizeStops([{ point_id: 4, text: '' }, { point_id: null, text: 'שער דרומי' }])).toEqual(expected);
    expect(normalizeStops('[{"point_id":4,"text":""},{"point_id":null,"text":"שער דרומי"}]')).toEqual(expected);
  });

  it('זבל מחזיר מערך ריק ולא זורק', () => {
    expect(normalizeStops(null)).toEqual([]);
    expect(normalizeStops('{לא JSON')).toEqual([]);
    expect(normalizeStops({ point_id: 1 })).toEqual([]);
  });

  it('תחנה ריקה נושרת - שורה בלי נקודה ובלי טקסט אינה תחנה', () => {
    expect(normalizeStops([{ point_id: null, text: '  ' }, { point_id: 7, text: '' }]))
      .toEqual([{ point_id: 7, text: '' }]);
  });

  it('שם התחנה: הנקודה מהשדה, ובהיעדרה הטקסט', () => {
    expect(stopLabel({ point_id: 7, text: '' }, 'מסוף מטענים')).toBe('מסוף מטענים');
    expect(stopLabel({ point_id: null, text: 'שער דרומי' }, null)).toBe('שער דרומי');
    // נקודה שנמחקה מהשדה - הטקסט שנרשם הוא מה שנשאר
    expect(stopLabel({ point_id: 7, text: 'שער דרומי' }, null)).toBe('שער דרומי');
  });
});

describe('נלווים', () => {
  it('קוראת רשימה ומסננת שורות ריקות', () => {
    expect(normalizeEscorts([{ name: 'דנה', national_id: '123' }, { name: '', national_id: '' }]))
      .toEqual([{ name: 'דנה', national_id: '123' }]);
    expect(normalizeEscorts('לא JSON')).toEqual([]);
  });
});

describe('עדכון מהנהג הממתין לאישור המגדל', () => {
  it('מזהה שינוי ממתין - כאובייקט וכמחרוזת', () => {
    expect(hasPendingDriverChange({ pending_change: { scheduled_at: '2026-09-12T12:00:00Z' } })).toBe(true);
    expect(hasPendingDriverChange({ pending_change: '{"stops":[]}' })).toBe(true);
  });

  it('אין שינוי - null, אובייקט ריק או זבל', () => {
    expect(hasPendingDriverChange({ pending_change: null })).toBe(false);
    expect(hasPendingDriverChange({ pending_change: {} })).toBe(false);
    expect(hasPendingDriverChange({ pending_change: 'לא JSON' })).toBe(false);
  });

  // "עדכון" עמום לא מספיק - המגדל צריך לדעת מה בדיוק הנהג ביקש לשנות
  it('מפרט אילו שדות שונו, בסדר קבוע', () => {
    expect(pendingChangeFields({ pending_change: { note: 'x', scheduled_at: 'y' } }))
      .toEqual(['scheduled_at', 'note']);
    expect(pendingChangeFields({ pending_change: null })).toEqual([]);
  });
});
