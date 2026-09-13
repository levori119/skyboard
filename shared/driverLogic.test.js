// הלוגיקה הטהורה של אפליקציית DRIVER (public/driver.html). הדף הוא HTML סטטי
// בלי build, ולכן הלוגיקה יושבת כאן כמודול ES שהדף טוען מ-/driver/logic.js -
// וכך אפשר לבדוק אותה בלי DOM (אין jsdom בפרויקט).
import { describe, it, expect } from 'vitest';
import {
  greetingFor, nearestBase, distanceMeters, groupDriverTrips, sortHistory,
  buildTripRequest, joinLocalDateTime,
} from './driverLogic.js';

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

describe('joinLocalDateTime', () => {
  it('תאריך ושעה בשעון המקומי -> ISO', () => {
    expect(joinLocalDateTime('2026-09-14', '07:30')).toBe(new Date(2026, 8, 14, 7, 30).toISOString());
    expect(joinLocalDateTime('', '07:30')).toBeNull();
  });
});
