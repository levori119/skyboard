// הלוגיקה הטהורה של אפליקציית DRIVER (public/driver.html). הדף הוא HTML סטטי
// בלי build, ולכן הלוגיקה יושבת כאן כמודול ES שהדף טוען מ-/driver/logic.js -
// וכך אפשר לבדוק אותה בלי DOM (אין jsdom בפרויקט).
import { describe, it, expect } from 'vitest';
import {
  greetingFor, nearestBase, distanceMeters, groupDriverTrips, sortHistory,
  buildTripRequest, joinLocalDateTime, startWindowState, START_WINDOW_MINUTES,
  requestFormFrom, nextDeparture, buildTemplate, TEMPLATE_NAME_MAX,
} from './driverLogic.js';

describe('startWindowState - מתי אפשר להפעיל נסיעה', () => {
  const NOW = new Date('2026-09-13T10:00:00Z').getTime();
  const inMin = m => new Date(NOW + m * 60_000).toISOString();

  it('חצי שעה לפני עד חצי שעה אחרי - פתוח, כולל הקצוות', () => {
    expect(START_WINDOW_MINUTES).toBe(30);
    for (const m of [30, 0, -30, 12]) expect(startWindowState(inMin(m), NOW)).toBe('open');
  });

  it('מוקדם מדי / מאוחר מדי', () => {
    expect(startWindowState(inMin(31), NOW)).toBe('early');
    expect(startWindowState(inMin(-31), NOW)).toBe('late');
  });

  it('בלי מועד - אין מה להפעיל', () => {
    expect(startWindowState(null, NOW)).toBe('none');
    expect(startWindowState('לא תאריך', NOW)).toBe('none');
  });
});

const at = (h, m = 0) => new Date(2026, 8, 13, h, m);

describe('greetingFor - ברכה לפי השעה', () => {
  it('בוקר, צהריים, ערב ולילה', () => {
    expect(greetingFor(at(5))).toBe('בוקר טוב');
    expect(greetingFor(at(11, 59))).toBe('בוקר טוב');
    expect(greetingFor(at(12))).toBe('צהריים טובים');
    expect(greetingFor(at(16, 59))).toBe('צהריים טובים');
    expect(greetingFor(at(17))).toBe('ערב טוב');
    expect(greetingFor(at(21, 59))).toBe('ערב טוב');
    expect(greetingFor(at(22))).toBe('לילה טוב');
    expect(greetingFor(at(4, 59))).toBe('לילה טוב');
  });
});

describe('nearestBase - הבסיס הקרוב לפי GPS', () => {
  const bases = [
    { id: 1, name: 'תל נוף', coord_n: '31.839', coord_e: '34.822' },
    { id: 2, name: 'רמת דוד', coord_n: '32.665', coord_e: '35.179' },
    { id: 3, name: 'בלי נ"צ', coord_n: null, coord_e: null },
  ];

  it('בוחר את הקרוב ביותר', () => {
    expect(nearestBase(bases, { lat: 32.6, lng: 35.1 }).id).toBe(2);
    expect(nearestBase(bases, { lat: 31.85, lng: 34.8 }).id).toBe(1);
  });

  // בסיס בלי נ"צ אינו "קרוב" - הוא פשוט לא משתתף בהשוואה
  it('מתעלם מבסיס בלי נ"צ, ומחזיר null כשאין מיקום או אין נ"צ לאף בסיס', () => {
    expect(nearestBase([bases[2]], { lat: 32, lng: 35 })).toBeNull();
    expect(nearestBase(bases, null)).toBeNull();
    expect(nearestBase([], { lat: 32, lng: 35 })).toBeNull();
  });

  it('מרחק haversine סביר (תל נוף - רמת דוד כ-97 ק"מ)', () => {
    const d = distanceMeters(31.839, 34.822, 32.665, 35.179);
    expect(d).toBeGreaterThan(95_000);
    expect(d).toBeLessThan(100_000);
  });
});

describe('groupDriverTrips - הטאבים', () => {
  const trips = [
    { id: 1, status: 'approved', scheduled_at: '2026-09-13T12:00:00Z' },
    { id: 2, status: 'approved', scheduled_at: '2026-09-13T08:00:00Z' },
    { id: 3, status: 'pending', scheduled_at: '2026-09-14T08:00:00Z' },
    { id: 4, status: 'pending', scheduled_at: '2026-09-13T09:00:00Z' },
    { id: 5, status: 'not_approved', scheduled_at: '2026-09-13T10:00:00Z' },
    { id: 6, status: 'ended', scheduled_at: '2026-09-12T10:00:00Z' },
    { id: 7, status: 'approved', scheduled_at: null },
  ];

  it('מאושרות ממוינות מהמוקדם למאוחר, ובלי מועד בסוף', () => {
    expect(groupDriverTrips(trips).approved.map(t => t.id)).toEqual([2, 1, 7]);
  });

  it('ממתינות ונדחו בנפרד, כל אחת מהמוקדם למאוחר', () => {
    const g = groupDriverTrips(trips);
    expect(g.pending.map(t => t.id)).toEqual([4, 3]);
    expect(g.rejected.map(t => t.id)).toEqual([5]);
  });

  // נסיעה שהסתיימה שייכת להיסטוריה בלבד
  it('נסיעה שהסתיימה אינה באף טאב פעיל', () => {
    const g = groupDriverTrips(trips);
    expect([...g.approved, ...g.pending, ...g.rejected].map(t => t.id)).not.toContain(6);
  });

  it('היסטוריה - האחרונה ראשונה', () => {
    expect(sortHistory([
      { id: 1, scheduled_at: '2026-09-10T08:00:00Z' },
      { id: 2, scheduled_at: '2026-09-12T08:00:00Z' },
      { id: 3, scheduled_at: null, ended_at: '2026-09-11T08:00:00Z' },
    ]).map(t => t.id)).toEqual([2, 3, 1]);
  });
});

describe('buildTripRequest - טופס בקשה חדשה', () => {
  const form = {
    airfield_id: '5', trip_type_id: '9', vehicle_type_id: '', vehicle_name: ' מיניבוס ',
    date: '2026-09-14', time: '07:30',
    from_point_id: '20', from_text: '', to_point_id: '', to_text: 'שער דרומי',
    stops: [{ point_id: '21', text: '' }, { point_id: '', text: '' }, { point_id: '', text: 'מחסן' }],
    requester_name: 'יוסי', requester_phone: '050', driver_phone: '052',
    escorts: [{ name: 'דנה', national_id: '123' }, { name: '', national_id: '' }],
    note: 'הערה',
  };

  it('בונה גוף בקשה נקי: מספרים, תחנות ונלווים ריקים מסוננים', () => {
    const { body, errors } = buildTripRequest(form);
    expect(errors).toEqual([]);
    expect(body).toEqual({
      airfield_id: 5, trip_type_id: 9, vehicle_type_id: null, vehicle_name: 'מיניבוס',
      scheduled_at: joinLocalDateTime('2026-09-14', '07:30'),
      from_point_id: 20, from_text: '', to_point_id: null, to_text: 'שער דרומי',
      stops: [{ point_id: 21, text: '' }, { point_id: null, text: 'מחסן' }],
      requester_name: 'יוסי', requester_phone: '050', driver_phone: '052',
      escorts: [{ name: 'דנה', national_id: '123' }],
      note: 'הערה',
    });
  });

  // נקודה שנבחרה גוברת על טקסט שנשאר בשדה - אחרת היעד נשמר כפול וסותר
  it('נקודה שנבחרה מנקה את הטקסט החופשי', () => {
    const { body } = buildTripRequest({ ...form, from_point_id: '20', from_text: 'ישן' });
    expect(body.from_text).toBe('');
  });

  it('שדה, מועד, מוצא ויעד הם חובה', () => {
    const { errors } = buildTripRequest({ ...form, airfield_id: '', date: '', from_point_id: '', to_text: '' });
    expect(errors).toEqual(['airfield', 'when', 'from', 'to']);
  });
});

describe('requestFormFrom - שכפול בקשה / בקשה מתבנית', () => {
  const trip = {
    id: 9, base_id: 70, airfield_id: 1, trip_type_id: 5, vehicle_type_id: 6, vehicle_name: 'מיניבוס',
    scheduled_at: new Date(2026, 8, 14, 7, 30).toISOString(),
    from_point_id: 20, from_text: '', to_point_id: null, to_text: 'שער צפוני',
    stops: [{ point_id: 21, text: '' }, { point_id: null, text: 'מגורים' }, { point_id: null, text: '' }],
    escorts: [{ name: 'דנה', national_id: '123' }, { name: '', national_id: '' }],
    requester_name: 'אבי', requester_phone: '050', driver_phone: '052', note: 'להביא ציוד',
    status: 'approved', driver_ack_at: '2026-09-13T08:00:00Z', selected_route_ids: [5],
  };

  it('נסיעה: כל פרטי הבקשה, והשעה המקומית של היציאה', () => {
    expect(requestFormFrom(trip)).toEqual({
      base_id: '70', airfield_id: '1', trip_type_id: '5', vehicle_type_id: '6', vehicle_name: 'מיניבוס',
      from_point_id: '20', from_text: '', to_point_id: '', to_text: 'שער צפוני',
      stops: [{ point_id: '21', text: '' }, { point_id: '', text: 'מגורים' }],
      escorts: [{ name: 'דנה', national_id: '123' }],
      requester_name: 'אבי', requester_phone: '050', driver_phone: '052', note: 'להביא ציוד',
      time: '07:30',
    });
  });

  // הכרעות המגדל אינן חלק מהבקשה - שכפול לא מעתיק אישור, נתיב או הפעלה
  it('לא מעתיק סטטוס, אישור או נתיב', () => {
    const f = requestFormFrom(trip);
    for (const k of ['status', 'driver_ack_at', 'selected_route_ids', 'scheduled_at', 'id']) expect(f).not.toHaveProperty(k);
  });

  it('תבנית: הפרטים מ-data, השדה והבסיס מהשורה', () => {
    const tpl = { id: 3, name: 'בוקר', airfield_id: 1, base_id: 70,
      data: { from_point_id: 20, to_text: 'שער', stops: '[{"point_id":21}]', time: '06:15', note: 'x' } };
    const f = requestFormFrom(tpl);
    expect(f.airfield_id).toBe('1');
    expect(f.base_id).toBe('70');
    expect(f.from_point_id).toBe('20');
    expect(f.to_text).toBe('שער');
    expect(f.stops).toEqual([{ point_id: '21', text: '' }]);
    expect(f.time).toBe('06:15');
  });

  it('תבנית בלי שעה, או שעה לא תקינה - בלי שעה', () => {
    expect(requestFormFrom({ airfield_id: 1, data: {} }).time).toBe('');
    expect(requestFormFrom({ airfield_id: 1, data: { time: '25:99' } }).time).toBe('');
  });

  it('קלט ריק לא נופל', () => {
    expect(requestFormFrom(null).stops).toEqual([]);
  });
});

describe('nextDeparture - מועד ברירת המחדל לבקשה', () => {
  const NOW = new Date(2026, 8, 13, 10, 10);

  it('שעה שעוד לא עברה היום - היום', () => {
    expect(nextDeparture('14:00', NOW)).toEqual({ date: '2026-09-13', time: '14:00' });
  });

  it('שעה שכבר עברה - מחר באותה שעה', () => {
    expect(nextDeparture('07:30', NOW)).toEqual({ date: '2026-09-14', time: '07:30' });
    expect(nextDeparture('10:10', NOW)).toEqual({ date: '2026-09-14', time: '10:10' });
  });

  it('בלי שעה - בעוד שעה, מעוגל לחצי שעה', () => {
    expect(nextDeparture('', NOW)).toEqual({ date: '2026-09-13', time: '11:30' });
    expect(nextDeparture('', new Date(2026, 8, 13, 10, 40))).toEqual({ date: '2026-09-13', time: '12:00' });
  });

  it('מעבר חצות', () => {
    expect(nextDeparture('', new Date(2026, 8, 13, 23, 20))).toEqual({ date: '2026-09-14', time: '00:30' });
  });
});

describe('buildTemplate - שמירת תבנית נסיעה', () => {
  const form = {
    name: '  בוקר לשער  ', airfield_id: '1', trip_type_id: '5', vehicle_name: ' מיניבוס ',
    from_point_id: '20', from_text: 'ישן', to_text: 'שער', time: '07:30',
    stops: [{ point_id: '', text: 'מגורים' }, { point_id: '', text: '' }],
    escorts: [], note: '', date: '2026-09-14',
  };

  it('שם, שדה, והפרטים בלי מועד', () => {
    const { body, errors } = buildTemplate(form);
    expect(errors).toEqual([]);
    expect(body.name).toBe('בוקר לשער');
    expect(body.airfield_id).toBe(1);
    expect(body.data).toMatchObject({
      trip_type_id: 5, vehicle_name: 'מיניבוס', from_point_id: 20, from_text: '', to_text: 'שער',
      stops: [{ point_id: null, text: 'מגורים' }], time: '07:30',
    });
    expect(body.data).not.toHaveProperty('scheduled_at');
    expect(body.data).not.toHaveProperty('airfield_id');
  });

  // תבנית היא נקודת פתיחה - מוצא ויעד משלימים ביצירת הבקשה
  it('רק שם ושדה הם חובה', () => {
    expect(buildTemplate({ name: '', airfield_id: '' }).errors).toEqual(['name', 'airfield']);
    expect(buildTemplate({ name: 'x', airfield_id: '1' }).errors).toEqual([]);
  });

  it('שם ארוך נחתך, שעה לא תקינה נשמטת', () => {
    const { body } = buildTemplate({ name: 'א'.repeat(200), airfield_id: '1', time: '7:3' });
    expect(body.name.length).toBe(TEMPLATE_NAME_MAX);
    expect(body.data.time).toBe('');
  });

  it('הלוך ושוב: תבנית -> טופס -> תבנית שומר את הפרטים', () => {
    const { body } = buildTemplate(form);
    const again = buildTemplate({ ...requestFormFrom({ airfield_id: body.airfield_id, data: body.data }), name: body.name });
    expect(again.body).toEqual(body);
  });
});

describe('joinLocalDateTime', () => {
  it('תאריך ושעה בשעון המקומי -> ISO', () => {
    expect(joinLocalDateTime('2026-09-14', '07:30')).toBe(new Date(2026, 8, 14, 7, 30).toISOString());
    expect(joinLocalDateTime('', '07:30')).toBeNull();
  });
});
