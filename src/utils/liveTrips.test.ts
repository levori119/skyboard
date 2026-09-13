// מעקב נסיעה חי במגדל - מה הפקח רואה ועל מה הוא מקבל התרעה (TRIP_LIVE_TRACKING_SPEC.md §6 T1-T12).
//
// הסטייה והחסימה מחושבות בשרת; כאן רק הנגזרת לתצוגה - ובה שני כשלים שמסוכנים
// בדיוק כמו באג בשרת: התרעה שנסגרה ולא חוזרת כשהרכב סוטה **שוב**, ורכב שאיבד
// אות שמוצג במגדל כאילו הוא נוסע כרגיל.

import { describe, it, expect } from 'vitest';
import {
  liveTripAlerts, pruneDismissedLive, liveVehicleTone, LIVE_TONE_COLOR, type LiveTrip,
} from './liveTrips';

const base = (over: Partial<LiveTrip> = {}): LiveTrip => ({
  id: 1, status: 'approved', driver_started_at: '2026-09-13T10:00:00Z', ended_at: null,
  vehicle_name: 'מיניבוס', from_point_id: 20,
  route: [], has_route: true, has_anchor: true,
  position: { lat: 31.25, lng: 34.65, accuracy_m: 8, heading: 90, speed_kmh: 30, fix_at: '2026-09-13T10:05:00Z' },
  stale: false, deviation_m: 12, deviating: false, blocking_element: null,
  ...over,
} as LiveTrip);

describe('liveTripAlerts - על מה המגדל מתריע', () => {
  it('נסיעה תקינה - אין התרעה', () => {
    expect(liveTripAlerts([base()])).toEqual([]);
  });

  it('T5: סטייה - התרעה אחת לנסיעה', () => {
    const a = liveTripAlerts([base({ deviating: true, deviation_m: 312 })]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ key: 'dev:1', kind: 'deviation' });
  });

  it('T7: אלמנט חוסם - המפתח כולל את האלמנט', () => {
    const a = liveTripAlerts([base({ blocking_element: { id: 31, name: 'מחסום', display_state: 'close', distance_m: 22 } })]);
    expect(a).toEqual([expect.objectContaining({ key: 'blk:1:31', kind: 'blocked' })]);
  });

  // סכנה פיזית מיידית לפני סטייה: רכב מול מחסום סגור עוצר עכשיו
  it('שתיהן יחד - החסימה ראשונה', () => {
    const a = liveTripAlerts([base({ deviating: true, blocking_element: { id: 31, name: 'מחסום', display_state: 'close', distance_m: 22 } })]);
    expect(a.map(x => x.kind)).toEqual(['blocked', 'deviation']);
  });

  it('אלמנט אחר - מפתח אחר, כך שהתרעה שנסגרה על הראשון לא מסתירה את השני', () => {
    const a1 = liveTripAlerts([base({ blocking_element: { id: 31, name: 'א', display_state: 'close', distance_m: 20 } })]);
    const a2 = liveTripAlerts([base({ blocking_element: { id: 32, name: 'ב', display_state: 'close', distance_m: 20 } })]);
    expect(a1[0].key).not.toBe(a2[0].key);
  });

  it('כמה נסיעות - כל אחת בנפרד', () => {
    expect(liveTripAlerts([base({ id: 1, deviating: true }), base({ id: 2, deviating: true })]).map(a => a.key))
      .toEqual(['dev:1', 'dev:2']);
  });

  it('קלט ריק או לא רשימה', () => {
    expect(liveTripAlerts([])).toEqual([]);
    expect(liveTripAlerts(null as unknown as LiveTrip[])).toEqual([]);
  });
});

describe('pruneDismissedLive - התרעה שנסגרה חוזרת באירוע הבא', () => {
  // בלי זה: הפקח סגר התרעת סטייה, הרכב חזר לנתיב וסטה שוב - ואין התרעה
  it('התרעת סטייה שנסגרה והתנאי חלף - נמחקת מהסגורות', () => {
    const dismissed = new Set(['dev:1']);
    expect([...pruneDismissedLive(dismissed, new Set())]).toEqual([]);
  });

  it('התנאי עדיין קיים - נשארת סגורה', () => {
    expect([...pruneDismissedLive(new Set(['dev:1']), new Set(['dev:1']))]).toEqual(['dev:1']);
  });

  it('התרעות שאינן של מעקב חי (תחילת נסיעה, בקשה) - לא נוגעים בהן', () => {
    const dismissed = new Set(['dep:5', 'chg:5:x', 'dev:1']);
    expect([...pruneDismissedLive(dismissed, new Set())].sort()).toEqual(['chg:5:x', 'dep:5']);
  });

  it('מחזיר את אותו אובייקט כשאין שינוי - בלי רינדור מיותר', () => {
    const d = new Set(['dep:5']);
    expect(pruneDismissedLive(d, new Set())).toBe(d);
  });
});

describe('liveVehicleTone - צבע הרכב על המפה', () => {
  it('נוסע כרגיל', () => {
    expect(liveVehicleTone(base())).toBe('normal');
  });
  it('T2: הופעלה ועוד אין קריאה - ממתין', () => {
    expect(liveVehicleTone(base({ position: null, stale: true }))).toBe('waiting');
  });
  it('T3: אות אבד', () => {
    expect(liveVehicleTone(base({ stale: true }))).toBe('stale');
  });
  it('סוטה', () => {
    expect(liveVehicleTone(base({ deviating: true }))).toBe('deviating');
  });
  it('מול אלמנט חוסם - גובר על סטייה', () => {
    expect(liveVehicleTone(base({ deviating: true, blocking_element: { id: 1, name: 'x', display_state: 'close', distance_m: 5 } }))).toBe('blocked');
  });
  // רכב שאיבד אות **בזמן** שסטה - המגדל לא יודע איפה הוא עכשיו; אות אבד גובר
  it('אות אבד גובר על סטייה וחסימה - המיקום כבר לא ידוע', () => {
    expect(liveVehicleTone(base({ stale: true, deviating: true }))).toBe('stale');
  });
  it('לכל גוון צבע', () => {
    for (const t of ['normal', 'waiting', 'stale', 'deviating', 'blocked'] as const) {
      expect(LIVE_TONE_COLOR[t]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
