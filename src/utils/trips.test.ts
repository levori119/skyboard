import { describe, it, expect } from 'vitest';
import {
  DEPARTURE_ALERT_MINUTES, DRIVER_ACTION_ALERT_MINUTES, STALE_TRIP_HOURS, TRIP_STATUSES, TRIP_VEHICLE_ICONS,
  MAX_TRIP_COPIES, TRIP_FIELDS_NOT_COPIED, clampCopies, duplicateSchedule,
  asTripStatus, canApproveTrip, dedupeRouteOptions, hasPendingDriverChange, isDepartureAlertDue,
  isDriverActionFresh, isNewDriverRequest, isRouteChosen, isVehicleOnMap, routeInputSignature, routeSignature,
  minutesUntilDeparture, normalizeEscorts, normalizeStops, pendingChangeFields,
  stopLabel, suggestedVehicleIcon, tripIcon, tripStatusKey, groupTrips, tripGroupValue, quickApproveBlocker,
} from './trips';

const NOW = new Date('2026-09-12T10:00:00Z').getTime();
/** זמן יציאה N דקות מעכשיו (שלילי = כבר עבר). */
const inMin = (m: number) => new Date(NOW + m * 60_000).toISOString();
/** ISO -> "YYYY-MM-DD HH:MM" בשעון המקומי - כפי שהמפעיל רואה בטופס. */
const splitLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso); const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

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

describe('בקשת נסיעה חדשה מהנהג - התראה למגדל', () => {
  it('בקשה טרייה שעדיין ממתינה מתפרצת', () => {
    expect(isNewDriverRequest({ status: 'pending', driver_requested_at: inMin(-3) }, NOW)).toBe(true);
  });

  // המגדל כבר הכריע - אין מה להתריע
  it('בקשה שהמגדל כבר אישר או דחה אינה מתפרצת', () => {
    expect(isNewDriverRequest({ status: 'approved', driver_requested_at: inMin(-3) }, NOW)).toBe(false);
    expect(isNewDriverRequest({ status: 'not_approved', driver_requested_at: inMin(-3) }, NOW)).toBe(false);
  });

  it('בקשה ישנה, או נסיעה שהמגדל רשם בעצמו, אינה מתפרצת', () => {
    expect(isNewDriverRequest({ status: 'pending', driver_requested_at: inMin(-DRIVER_ACTION_ALERT_MINUTES - 1) }, NOW)).toBe(false);
    expect(isNewDriverRequest({ status: 'pending', driver_requested_at: null }, NOW)).toBe(false);
  });

  it('חותמת הבקשה אינה עוברת לעותק', () => {
    expect(TRIP_FIELDS_NOT_COPIED).toContain('driver_requested_at');
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

describe('חתימת הקלט של חישוב הנתיב', () => {
  // נתיב שחושב בלי תחנה שנוספה אינו הנסיעה שהפקח מאשר
  it('תחנת ביניים היא חלק מהחתימה', () => {
    const a = routeInputSignature({ from_point_id: '20', to_point_id: '21', stops: [] });
    const b = routeInputSignature({ from_point_id: '20', to_point_id: '21', stops: [{ point_id: 7 }] });
    expect(a).not.toBe(b);
  });

  it('סדר התחנות משנה', () => {
    const a = routeInputSignature({ from_point_id: '20', to_point_id: '21', stops: [{ point_id: 7 }, { point_id: 9 }] });
    const b = routeInputSignature({ from_point_id: '20', to_point_id: '21', stops: [{ point_id: 9 }, { point_id: 7 }] });
    expect(a).not.toBe(b);
  });

  // אין לה נ"צ, ולכן אינה משנה את החישוב
  it('תחנה בטקסט חופשי אינה נכנסת לחתימה', () => {
    const a = routeInputSignature({ from_point_id: '20', to_point_id: '21', stops: [{ point_id: null }] });
    const b = routeInputSignature({ from_point_id: '20', to_point_id: '21', stops: [] });
    expect(a).toBe(b);
  });

  it('שינוי מוצא או יעד משנה את החתימה', () => {
    const base = { from_point_id: '20', to_point_id: '21', stops: [] };
    expect(routeInputSignature({ ...base, from_point_id: '22' })).not.toBe(routeInputSignature(base));
    expect(routeInputSignature({ ...base, to_point_id: '22' })).not.toBe(routeInputSignature(base));
  });

  it('מספר ומחרוזת של אותו מזהה נותנים אותה חתימה', () => {
    expect(routeInputSignature({ from_point_id: 20, to_point_id: 21 }))
      .toBe(routeInputSignature({ from_point_id: '20', to_point_id: '21' }));
  });

  it('טופס ריק נותן חתימה יציבה ולא זורק', () => {
    expect(routeInputSignature({})).toBe('>>');
  });
});

describe('שכפול נסיעה', () => {
  const at = (local: string) => new Date(local).toISOString();

  it('מעביר ליום אחר ושומר את שעת היציאה', () => {
    const out = duplicateSchedule(at('2026-09-12T11:50'), '2026-09-13');
    expect(splitLocal(out)).toBe('2026-09-13 11:50');
  });

  // הזזה של 1440 דקות הייתה מזיזה את השעה בשעה במעבר שעון קיץ
  it('שומר את השעה גם במעבר שעון', () => {
    // מוצ"ש של מעבר השעון בישראל ב-2026 (25.10) - היום שאחריו ארוך בשעה
    const out = duplicateSchedule(at('2026-10-24T08:00'), '2026-10-25');
    expect(splitLocal(out)).toBe('2026-10-25 08:00');
  });

  it('בלי תאריך יעד הנסיעה נשארת במועדה', () => {
    const iso = at('2026-09-12T11:50');
    expect(duplicateSchedule(iso, '')).toBe(iso);
  });

  it('מרווח בין עותקים נספר מהעותק הראשון', () => {
    expect(splitLocal(duplicateSchedule(at('2026-09-12T08:00'), '2026-09-12', 0, 30))).toBe('2026-09-12 08:00');
    expect(splitLocal(duplicateSchedule(at('2026-09-12T08:00'), '2026-09-12', 1, 30))).toBe('2026-09-12 08:30');
    expect(splitLocal(duplicateSchedule(at('2026-09-12T08:00'), '2026-09-12', 3, 30))).toBe('2026-09-12 09:30');
  });

  // עותק אינו המקום להמציא מועד לנסיעה שאין לה
  it('נסיעה בלי מועד נשארת בלי מועד', () => {
    expect(duplicateSchedule(null, '2026-09-13')).toBeNull();
    expect(duplicateSchedule('לא תאריך', '2026-09-13')).toBeNull();
  });

  it('מספר העותקים נחסם לטווח שפוי', () => {
    expect(clampCopies(1)).toBe(1);
    expect(clampCopies(0)).toBe(1);
    expect(clampCopies(-5)).toBe(1);
    expect(clampCopies(MAX_TRIP_COPIES + 10)).toBe(MAX_TRIP_COPIES);
    expect(clampCopies('שלוש')).toBe(1);
    expect(clampCopies(3.7)).toBe(3);
  });

  // שכפול נסיעה מאושרת שהיה גורר את האישור מוציא לשטח רכב שאיש לא אישר
  it('הסטטוס אינו מועתק - עותק אינו מאושר', () => {
    expect(TRIP_FIELDS_NOT_COPIED).toContain('status');
  });

  it('מצב חי של המקור אינו מועתק', () => {
    for (const f of ['driver_ack_at', 'pending_change', 'departure_alerted_at', 'vehicle_request_id', 'ended_at']) {
      expect(TRIP_FIELDS_NOT_COPIED).toContain(f);
    }
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

describe('קיבוץ ומיון רשימת הנסיעות', () => {
  const trip = (id: number, over: Record<string, unknown> = {}) => ({
    id, status: 'pending', scheduled_at: null as string | null,
    trip_type_name: null, vehicle_name: '', vehicle_type_name: null,
    permit_driver_name: null, driver_name: '', from_point_name: null, from_text: '',
    to_point_name: null, to_text: '', ...over,
  });
  const T = (h: number) => new Date(2026, 8, 14, h, 0).toISOString();
  const trips = [
    trip(1, { status: 'approved', scheduled_at: T(12), trip_type_name: 'אספקה' }),
    trip(2, { status: 'pending', scheduled_at: T(10), trip_type_name: 'הסעה' }),
    trip(3, { status: 'approved', scheduled_at: T(8), trip_type_name: 'אספקה' }),
    trip(4, { status: 'not_approved', scheduled_at: T(9) }),
    trip(5, { status: 'pending', scheduled_at: null }),
  ];

  // ברירת המחדל: מה שממתין להכרעה קודם, ובכל קבוצה מהמוקדמת
  it('לפי סטטוס: ממתין, יש אישור, אין אישור, הסתיים - ובכל קבוצה לפי זמן', () => {
    const g = groupTrips(trips, 'status');
    expect(g.map(x => x.value)).toEqual(['pending', 'approved', 'not_approved']);
    expect(g[0].trips.map(t => t.id)).toEqual([2, 5]);
    expect(g[1].trips.map(t => t.id)).toEqual([3, 1]);
  });

  it('בהיסטוריה - האחרונה ראשונה', () => {
    expect(groupTrips(trips, 'status', 'desc')[1].trips.map(t => t.id)).toEqual([1, 3]);
  });

  it('לפי עמודה טקסטואלית: קבוצות לפי א-ב, וקבוצה ריקה בסוף', () => {
    const g = groupTrips(trips, 'tripType');
    expect(g.map(x => x.value)).toEqual(['אספקה', 'הסעה', '']);
    expect(g[0].trips.map(t => t.id)).toEqual([3, 1]);
  });

  it('לפי תאריך: כרונולוגי, ובלי מועד בסוף', () => {
    const g = groupTrips([trip(1, { scheduled_at: new Date(2026, 8, 15, 9).toISOString() }), trip(2, { scheduled_at: T(8) }), trip(3)], 'date');
    expect(g.map(x => x.value)).toEqual(['2026-09-14', '2026-09-15', '']);
  });

  it('ללא קיבוץ: קבוצה אחת ממוינת לפי זמן', () => {
    const g = groupTrips(trips, 'none');
    expect(g).toHaveLength(1);
    expect(g[0].trips.map(t => t.id)).toEqual([3, 4, 2, 1, 5]);
  });

  it('רכב, נהג, מוצא ויעד נקראים מהשם שבמרשם ואז מהטקסט', () => {
    const t = trip(9, {
      vehicle_type_name: 'מיניבוס', permit_driver_name: 'דני', driver_name: 'אחר',
      from_text: 'שער', to_point_name: 'מחסן', to_text: 'x',
    });
    expect(tripGroupValue(t, 'vehicle')).toBe('מיניבוס');
    expect(tripGroupValue(t, 'driver')).toBe('דני');
    expect(tripGroupValue(t, 'from')).toBe('שער');
    expect(tripGroupValue(t, 'to')).toBe('מחסן');
  });
});

describe('אישור מהרשימה', () => {
  const base = { status: 'pending', from_point_id: 20, to_point_id: 21, selected_route_ids: [] as unknown, selected_route_label: '' };

  it('נסיעה עם נתיב שנבחר - מאשרים ישר מהרשימה', () => {
    expect(quickApproveBlocker({ ...base, selected_route_ids: [3], selected_route_label: 'כביש 1' })).toBeNull();
  });

  // אישור בלי נתיב שולח את הנהג לדרך שאיש לא הסכים עליה
  it('נסיעה בין שתי נקודות בלי נתיב שנבחר - צריך לבחור נתיב', () => {
    expect(quickApproveBlocker(base)).toBe('route');
  });

  it('מוצא או יעד בטקסט חופשי - אין נתיב לחשב, ומאשרים', () => {
    expect(quickApproveBlocker({ ...base, to_point_id: null })).toBeNull();
  });

  it('נסיעה שכבר מאושרת או הסתיימה - אין מה לאשר', () => {
    expect(quickApproveBlocker({ ...base, status: 'approved' })).toBe('status');
    expect(quickApproveBlocker({ ...base, status: 'ended' })).toBe('status');
  });
});
