import { describe, it, expect } from 'vitest';
import {
  DEPARTURE_ALERT_MINUTES, DRIVER_ACTION_ALERT_MINUTES, STALE_TRIP_HOURS, TRIP_STATUSES, TRIP_VEHICLE_ICONS,
  asTripStatus, canApproveTrip, dedupeRouteOptions, hasPendingDriverChange, isDepartureAlertDue,
  isDriverActionFresh, isRouteChosen, isVehicleOnMap, routeSignature,
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

describe('נתיב הנסיעה - בחירה מפורשת', () => {
  const opt = (over = {}) =>
    ({ key: 'vehicle', route_ids: [3, 7], label: 'כיבוי -> תחילת 15', dist_m: 2923, crossings: 1, ...over });

  it('הזהות מורכבת מהמסלולים ומהתיאור', () => {
    expect(routeSignature(opt())).toBe('3,7|כיבוי -> תחילת 15');
  });

  // זה מה שנראה בשטח: שלושה נתיבים, שלושה סימני ✓, ואי אפשר לדעת מה אושר
  it('נתיב בלי מסלולים אינו מתלכד עם נתיב אחר בלי מסלולים', () => {
    const a = opt({ route_ids: [], label: 'דרך א' });
    const b = opt({ route_ids: [], label: 'דרך ב' });
    expect(routeSignature(a)).not.toBe(routeSignature(b));
  });

  it('בחירה ריקה = אף אפשרות אינה מסומנת', () => {
    expect(isRouteChosen(opt(), '')).toBe(false);
    expect(isRouteChosen(opt(), routeSignature(opt()))).toBe(true);
    expect(isRouteChosen(opt(), routeSignature(opt({ route_ids: [9] })))).toBe(false);
  });

  it('שלוש רמות הרשאה שמחזירות אותו נתיב מתאחדות לשורה אחת', () => {
    const merged = dedupeRouteOptions([
      opt({ key: 'vehicle' }), opt({ key: 'taxiways' }), opt({ key: 'runways' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].keys).toEqual(['vehicle', 'taxiways', 'runways']);
    // הרמה הנמוכה ביותר שמגיעה לנתיב היא זו שנשמרת
    expect(merged[0].key).toBe('vehicle');
  });

  it('נתיבים שונים נשארים נפרדים, וממוינים מהקצר לארוך', () => {
    const merged = dedupeRouteOptions([
      opt({ key: 'runways', route_ids: [1], label: 'ארוך', dist_m: 4000 }),
      opt({ key: 'vehicle', route_ids: [2], label: 'קצר', dist_m: 1000 }),
    ]);
    expect(merged.map(m => m.label)).toEqual(['קצר', 'ארוך']);
  });

  it('רשימה ריקה אינה מפילה', () => {
    expect(dedupeRouteOptions([])).toEqual([]);
  });

  // אישור בלי נתיב נבחר = הפקח רואה אישור, הנהג אינו מקבל דרך
  it('אי אפשר לאשר נסיעה כשחושבו נתיבים ולא נבחר אחד', () => {
    expect(canApproveTrip('approved', true, '')).toBe(false);
    expect(canApproveTrip('approved', true, '3,7|x')).toBe(true);
  });

  it('סטטוס שאינו "יש אישור", או נסיעה שלא חושב לה נתיב, אינם נחסמים', () => {
    expect(canApproveTrip('pending', true, '')).toBe(true);
    expect(canApproveTrip('ended', true, '')).toBe(true);
    expect(canApproveTrip('approved', false, '')).toBe(true);
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
