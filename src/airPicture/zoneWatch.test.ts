import { describe, it, expect } from 'vitest';
import {
  normalizeCallsign, callsignLetters, callsignSimilarity, fullCallsignSimilarity,
  matchTracks, tickZoneWatch, emptyZoneWatchState, blockAltFeet,
  CALLSIGN_MATCH_MIN, DWELL_MS, ZONE_STATUS,
  type WatchZone, type WatchAssignment, type WatchTrack, type ZoneWatchState,
} from './zoneWatch';

// ── מרחב הבדיקה ──────────────────────────────────────────────────────────────
// שני ריבועים באחוזי תמונת מפה, רחוקים זה מזה כדי שהחיץ לא יערבב ביניהם.
const ZONE_A: WatchZone = { id: 1, name: 'אזור א', polygon: [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 40 }, { x: 10, y: 40 }] };
const ZONE_B: WatchZone = { id: 2, name: 'אזור ב', polygon: [{ x: 60, y: 60 }, { x: 90, y: 60 }, { x: 90, y: 90 }, { x: 60, y: 90 }] };

const INSIDE_A = { x: 25, y: 25 };
const OUTSIDE = { x: 50, y: 50 };

const asg = (over: Partial<WatchAssignment> = {}): WatchAssignment => ({
  stripId: 7, callSign: 'בננה', zoneIds: [1], altMin: null, altMax: null,
  isCoordinated: false, status: '', ownedByMe: true, ...over,
});

const trk = (over: Partial<WatchTrack> = {}): WatchTrack =>
  ({ id: 't1', cs: 'בננה', x: INSIDE_A.x, y: INSIDE_A.y, alt: 10000, ...over });

/** מריץ סדרת טיקים ומחזיר את הטיק האחרון. הזמן מתקדם ב-`stepMs` בין טיק לטיק. */
function run(
  state: ZoneWatchState,
  frames: { tracks: WatchTrack[]; assignments?: WatchAssignment[]; at: number }[],
  zones: WatchZone[] = [ZONE_A, ZONE_B],
  baseAssignments: WatchAssignment[] = [asg()],
) {
  let s = state;
  let last = tickZoneWatch(s, { zones, assignments: baseAssignments, tracks: [], now: 0 });
  for (const f of frames) {
    last = tickZoneWatch(s, { zones, assignments: f.assignments ?? baseAssignments, tracks: f.tracks, now: f.at });
    s = last.state;
  }
  return last;
}

// ── או"ק דומה ────────────────────────────────────────────────────────────────
describe('normalizeCallsign', () => {
  it('מוריד רווחים, מקפים וגרשיים', () => expect(normalizeCallsign(' בננה-1 ')).toBe('בננה1'));
  it('מאחיד אנגלית לאותיות קטנות', () => expect(normalizeCallsign('Banana 2')).toBe('banana2'));
  it('מחרוזת ריקה נשארת ריקה', () => expect(normalizeCallsign('   ')).toBe(''));
});

describe('callsignLetters', () => {
  it('מסיר את הספרה הסידורית', () => expect(callsignLetters('בננה1')).toBe('בננה'));
  it('מסיר גם סיומת דו-ספרתית', () => expect(callsignLetters('בננה12')).toBe('בננה'));
  it('או"ק ספרתי לחלוטין נשאר ריק', () => expect(callsignLetters('1234')).toBe(''));
});

describe('callsignSimilarity - א-ב בלבד, בלי ספרות', () => {
  it('זהה = 1', () => expect(callsignSimilarity('בננה', 'בננה')).toBe(1));
  it('בננה מול בננה1 - הספרה אינה נספרת, ולכן זהה', () => {
    expect(callsignSimilarity('בננה', 'בננה1')).toBe(1);
  });
  it('בננה מול בננה12 - גם סיומת דו-ספרתית אינה משנה', () => {
    expect(callsignSimilarity('בננה', 'בננה12')).toBe(1);
  });
  it('בננה1 מול בננה2 - אותו שם לחלוטין מבחינת הסף', () => {
    expect(callsignSimilarity('בננה1', 'בננה2')).toBe(1);
  });
  it('סימטרית', () => expect(callsignSimilarity('בננה1', 'בננה')).toBe(1));
  it('אות אחת שונה מתוך חמש = 0.8 בדיוק - על הסף', () => {
    expect(callsignSimilarity('אבגדה', 'אבגדו')).toBeCloseTo(0.8, 5);
    expect(callsignSimilarity('אבגדה', 'אבגדו')).toBeGreaterThanOrEqual(CALLSIGN_MATCH_MIN);
  });
  it('אות אחת שונה מתוך ארבע - מתחת לסף', () => {
    expect(callsignSimilarity('אבגד', 'אבגה')).toBeLessThan(CALLSIGN_MATCH_MIN);
  });
  it('שמות שונים - מתחת לסף', () => expect(callsignSimilarity('בננה', 'תפוז')).toBeLessThan(CALLSIGN_MATCH_MIN));
  it('אותיות בסדר הפוך אינן התאמה', () => expect(callsignSimilarity('אבג', 'גבא')).toBeLessThan(CALLSIGN_MATCH_MIN));
  it('מחרוזת ריקה = 0', () => expect(callsignSimilarity('', 'בננה')).toBe(0));
  it('או"ק ספרתי לחלוטין - נופל לצורה המלאה ולא מאבד את עצמו', () => {
    expect(callsignSimilarity('1234', '1234')).toBe(1);
    expect(callsignSimilarity('1234', '5678')).toBe(0);
  });
  it('או"ק ספרתי מול או"ק אותיות - אינו מתאים', () => {
    expect(callsignSimilarity('1234', 'בננה')).toBeLessThan(CALLSIGN_MATCH_MIN);
  });
});

describe('fullCallsignSimilarity - שובר השוויון', () => {
  it('כאן הספרה כן נספרת', () => {
    expect(fullCallsignSimilarity('בננה1', 'בננה1')).toBe(1);
    expect(fullCallsignSimilarity('בננה2', 'בננה1')).toBeCloseTo(0.8, 5);
  });
});

describe('matchTracks', () => {
  it('משדך רכיב אווירי לפ"מ בעל או"ק דומה', () => {
    const m = matchTracks([asg()], [trk({ id: 'a', cs: 'בננה1' })]);
    expect(m.get(7)).toEqual(['a']);
  });
  it('לא משדך או"ק רחוק', () => {
    const m = matchTracks([asg()], [trk({ id: 'a', cs: 'תפוז' })]);
    expect(m.get(7) ?? []).toEqual([]);
  });
  it('מבנה - שני רכיבים לאותו פ"מ', () => {
    const m = matchTracks([asg()], [trk({ id: 'a', cs: 'בננה1' }), trk({ id: 'b', cs: 'בננה2' })]);
    expect((m.get(7) ?? []).sort()).toEqual(['a', 'b']);
  });
  it('רכיב אחד לא מתחלק בין שני פ"מים - הדומה ביותר זוכה', () => {
    const m = matchTracks(
      [asg({ stripId: 1, callSign: 'בננה' }), asg({ stripId: 2, callSign: 'בננה1' })],
      [trk({ id: 'a', cs: 'בננה1' })],
    );
    expect(m.get(2)).toEqual(['a']);
    expect(m.get(1) ?? []).toEqual([]);
  });
  it('שני פ"מים שנבדלים רק בספרה - הספרה מכריעה, למרות שאינה בסף', () => {
    const m = matchTracks(
      [asg({ stripId: 1, callSign: 'בננה2' }), asg({ stripId: 2, callSign: 'בננה1' })],
      [trk({ id: 'a', cs: 'בננה1' }), trk({ id: 'b', cs: 'בננה2' })],
    );
    expect(m.get(2)).toEqual(['a']);
    expect(m.get(1)).toEqual(['b']);
  });
});

// ── יחידת הגובה ──────────────────────────────────────────────────────────────
// הבלוק שמור ברום טיסה והתמונ"א מגיעה ברגל. הבדיקות האלה מקבעות את הגבול
// שביניהם, כי הטעות כאן אינה נראית כשגיאה - היא נראית כ"הפיצ'ר לא עובד".
describe('blockAltFeet - רום טיסה לרגל', () => {
  it('FL140 (כפי ששמור ב-DB) = 14,000 רגל', () => expect(blockAltFeet(140)).toBe(14000));
  it('FL100 = 10,000 רגל', () => expect(blockAltFeet(100)).toBe(10000));
  it('FL400, הגבוה שקיים בפועל ב-DB', () => expect(blockAltFeet(400)).toBe(40000));
  it('ערך שכבר ברגל אינו מומר פעמיים', () => expect(blockAltFeet(14000)).toBe(14000));
  it('null נשאר null - בלוק בלי גבול', () => expect(blockAltFeet(null)).toBeNull());
  it('undefined נשאר null', () => expect(blockAltFeet(undefined)).toBeNull());
  it('אפס הוא גובה תקין ולא "אין בלוק"', () => expect(blockAltFeet(0)).toBe(0));
});

describe('הבלוק אחרי המרה - הרגרסיה עצמה', () => {
  it('מטוס ב-12,000 רגל בבלוק "נמוך" (FL100-FL140) נמצא בפנים', () => {
    const low = asg({ altMin: blockAltFeet(100), altMax: blockAltFeet(140) });
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ alt: 12000 })], at: 1000, assignments: [low] },
      { tracks: [trk({ alt: 12000 })], at: 1000 + DWELL_MS, assignments: [low] },
    ], [ZONE_A, ZONE_B], [low]);
    expect(r.alerts).toEqual([]);
    expect(r.statusChanges).toEqual([{ stripId: 7, status: ZONE_STATUS.inZone }]);
  });

  it('בלי ההמרה אותו מטוס היה מדווח חריגה - זה הבאג שהיה', () => {
    const raw = asg({ altMin: 100, altMax: 140 }); // FL שנשלח כאילו הוא רגל
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ alt: 12000 })], at: 1000, assignments: [raw] },
      { tracks: [trk({ alt: 12000 })], at: 1000 + DWELL_MS, assignments: [raw] },
    ], [ZONE_A, ZONE_B], [raw]);
    expect(r.alerts.map(a => a.kind)).toEqual(['alt-deviation']);
  });
});

// ── כניסה לאזור ──────────────────────────────────────────────────────────────
describe('כניסה לאזור', () => {
  it('רכיב מחוץ לאזור - הפ"מ "בדרך לאזור", בלי התראה', () => {
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ ...OUTSIDE })], at: 1000 },
      { tracks: [trk({ ...OUTSIDE })], at: 1000 + DWELL_MS },
    ]);
    expect(r.statusChanges).toEqual([{ stripId: 7, status: ZONE_STATUS.heading }]);
    expect(r.alerts).toEqual([]);
  });

  it('נכנס לאזור - לפני חלוף זמן ההחזקה אין עדיין "באזור"', () => {
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ ...OUTSIDE })], at: 0 },
      { tracks: [trk()], at: 1000 },
      { tracks: [trk()], at: 1000 + DWELL_MS - 1 },
    ]);
    expect(r.statusChanges.find(c => c.status === ZONE_STATUS.inZone)).toBeUndefined();
  });

  it('נכנס לאזור - אחרי זמן ההחזקה הסטטוס "באזור"', () => {
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ ...OUTSIDE })], at: 0 },
      { tracks: [trk()], at: 1000 },
      { tracks: [trk()], at: 1000 + DWELL_MS },
    ]);
    expect(r.statusChanges).toEqual([{ stripId: 7, status: ZONE_STATUS.inZone }]);
    expect(r.alerts).toEqual([]);
  });

  it('נכנס לאזור הנוסף (אזור שני של אותו פ"מ) - "באזור", בלי חריגה', () => {
    const both = [asg({ zoneIds: [1, 2] })];
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ x: 75, y: 75 })], at: 1000 },
      { tracks: [trk({ x: 75, y: 75 })], at: 1000 + DWELL_MS },
    ], [ZONE_A, ZONE_B], both);
    expect(r.statusChanges).toEqual([{ stripId: 7, status: ZONE_STATUS.inZone }]);
    expect(r.alerts).toEqual([]);
  });
});

// ── חריגה מהאזור ─────────────────────────────────────────────────────────────
describe('חריגה מהאזור', () => {
  const enter = (): ZoneWatchState => {
    let s = emptyZoneWatchState();
    for (const at of [0, DWELL_MS, 2 * DWELL_MS]) s = tickZoneWatch(s, { zones: [ZONE_A, ZONE_B], assignments: [asg({ status: ZONE_STATUS.inZone })], tracks: [trk()], now: at }).state;
    return s;
  };

  it('עזב את האזור בעוד הפ"מ מוקצה - התראת חריגה + סטטוס "עוזב אזור"', () => {
    const base = 2 * DWELL_MS;
    const r = run(enter(), [
      { tracks: [trk({ ...OUTSIDE })], at: base + 1000, assignments: [asg({ status: ZONE_STATUS.inZone })] },
      { tracks: [trk({ ...OUTSIDE })], at: base + 1000 + DWELL_MS, assignments: [asg({ status: ZONE_STATUS.inZone })] },
    ]);
    expect(r.alerts.map(a => a.kind)).toEqual(['out-of-zone']);
    expect(r.alerts[0]).toMatchObject({ stripId: 7, callSign: 'בננה', zoneName: 'אזור א' });
    expect(r.statusChanges).toEqual([{ stripId: 7, status: ZONE_STATUS.leaving }]);
  });

  it('ההתראה מתמידה כל עוד הפ"מ מוקצה והרכיב בחוץ', () => {
    const base = 2 * DWELL_MS;
    const r = run(enter(), [
      { tracks: [trk({ ...OUTSIDE })], at: base + 1000, assignments: [asg({ status: ZONE_STATUS.inZone })] },
      { tracks: [trk({ ...OUTSIDE })], at: base + 1000 + DWELL_MS, assignments: [asg({ status: ZONE_STATUS.leaving })] },
      { tracks: [trk({ ...OUTSIDE })], at: base + 60000, assignments: [asg({ status: ZONE_STATUS.leaving })] },
    ]);
    expect(r.alerts.map(a => a.kind)).toEqual(['out-of-zone']);
    expect(r.statusChanges).toEqual([]); // הסטטוס כבר נכון - אין כתיבה חוזרת
  });

  it('ריצוד על הגבול אינו מייצר חריגה - החיץ בולע אותו', () => {
    // הגבול ב-x=40; תזוזה של 0.2% פנימה והחוצה נשארת בתוך החיץ.
    const base = 2 * DWELL_MS;
    const jitter = [39.9, 40.1, 39.9, 40.1, 39.9].map((x, i) => ({
      tracks: [trk({ x, y: 25 })], at: base + 1000 + i * DWELL_MS, assignments: [asg({ status: ZONE_STATUS.inZone })],
    }));
    const r = run(enter(), jitter);
    expect(r.alerts).toEqual([]);
  });

  it('פ"מ שהרכיב שלו טרם נכנס מעולם אינו מדווח כחורג', () => {
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ ...OUTSIDE })], at: 1000 },
      { tracks: [trk({ ...OUTSIDE })], at: 1000 + DWELL_MS },
      { tracks: [trk({ ...OUTSIDE })], at: 1000 + 10 * DWELL_MS },
    ]);
    expect(r.alerts).toEqual([]);
  });
});

// ── חריגת בלוק גבהים ─────────────────────────────────────────────────────────
describe('חריגת בלוק גבהים', () => {
  const blocked = (over: Partial<WatchAssignment> = {}) => asg({ altMin: 5000, altMax: 10000, ...over });

  it('בתוך הבלוק - "באזור" בלי התראה', () => {
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ alt: 7000 })], at: 1000 },
      { tracks: [trk({ alt: 7000 })], at: 1000 + DWELL_MS },
    ], [ZONE_A, ZONE_B], [blocked()]);
    expect(r.alerts).toEqual([]);
    expect(r.statusChanges).toEqual([{ stripId: 7, status: ZONE_STATUS.inZone }]);
  });

  it('באזור אך מעל הבלוק - התראת חריגת גובה, וסטטוס כמו חריגה מהאזור', () => {
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ alt: 7000 })], at: 0 },
      { tracks: [trk({ alt: 7000 })], at: DWELL_MS },
      { tracks: [trk({ alt: 14000 })], at: 2 * DWELL_MS, assignments: [blocked({ status: ZONE_STATUS.inZone })] },
      { tracks: [trk({ alt: 14000 })], at: 3 * DWELL_MS, assignments: [blocked({ status: ZONE_STATUS.inZone })] },
    ], [ZONE_A, ZONE_B], [blocked()]);
    expect(r.alerts.map(a => a.kind)).toEqual(['alt-deviation']);
    expect(r.alerts[0]).toMatchObject({ stripId: 7, zoneName: 'אזור א' });
    expect(r.statusChanges).toEqual([{ stripId: 7, status: ZONE_STATUS.leaving }]);
  });

  it('50 רגל מעל הבלוק - בתוך החיץ, בלי התראה', () => {
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ alt: 7000 })], at: 0 },
      { tracks: [trk({ alt: 7000 })], at: DWELL_MS },
      { tracks: [trk({ alt: 10050 })], at: 2 * DWELL_MS, assignments: [blocked({ status: ZONE_STATUS.inZone })] },
      { tracks: [trk({ alt: 10050 })], at: 3 * DWELL_MS, assignments: [blocked({ status: ZONE_STATUS.inZone })] },
    ], [ZONE_A, ZONE_B], [blocked()]);
    expect(r.alerts).toEqual([]);
  });

  it('בלי בלוק מוגדר - שום גובה אינו חריגה', () => {
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ alt: 45000 })], at: 1000 },
      { tracks: [trk({ alt: 45000 })], at: 1000 + DWELL_MS },
    ]);
    expect(r.alerts).toEqual([]);
  });
});

// ── כניסה ללא תיאום ──────────────────────────────────────────────────────────
describe('כניסה ללא תיאום', () => {
  const holder = asg({ status: ZONE_STATUS.inZone });
  const mine = trk();
  const stranger = trk({ id: 'x', cs: 'תפוז', x: 30, y: 30, alt: 10000 });

  it('רכיב זר נכנס לאזור תפוס - התראה אחרי זמן ההחזקה', () => {
    const r = run(emptyZoneWatchState(), [
      { tracks: [mine, stranger], at: 1000, assignments: [holder] },
      { tracks: [mine, stranger], at: 1000 + DWELL_MS, assignments: [holder] },
    ], [ZONE_A, ZONE_B], [holder]);
    const intruder = r.alerts.find(a => a.kind === 'intruder');
    expect(intruder).toMatchObject({ intruderCs: 'תפוז', callSign: 'בננה', zoneName: 'אזור א' });
  });

  it('אזור פנוי - רכיב זר אינו מייצר התראה', () => {
    const far = asg({ zoneIds: [2], status: ZONE_STATUS.inZone });
    const r = run(emptyZoneWatchState(), [
      { tracks: [stranger], at: 1000, assignments: [far] },
      { tracks: [stranger], at: 1000 + DWELL_MS, assignments: [far] },
    ], [ZONE_A, ZONE_B], [far]);
    expect(r.alerts.filter(a => a.kind === 'intruder')).toEqual([]);
  });

  it('הפרדה אנכית - רכיב זר בבלוק גובה אחר אינו מייצר התראה', () => {
    const blockHolder = asg({ altMin: 5000, altMax: 10000, status: ZONE_STATUS.inZone });
    const high = trk({ id: 'x', cs: 'תפוז', x: 30, y: 30, alt: 25000 });
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ alt: 7000 }), high], at: 1000, assignments: [blockHolder] },
      { tracks: [trk({ alt: 7000 }), high], at: 1000 + DWELL_MS, assignments: [blockHolder] },
    ], [ZONE_A, ZONE_B], [blockHolder]);
    expect(r.alerts.filter(a => a.kind === 'intruder')).toEqual([]);
  });

  it('חריגה בגובה לתוך בלוק תפוס - כן מתריע', () => {
    const blockHolder = asg({ altMin: 5000, altMax: 10000, status: ZONE_STATUS.inZone });
    const sameBlock = trk({ id: 'x', cs: 'תפוז', x: 30, y: 30, alt: 8000 });
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ alt: 7000 }), sameBlock], at: 1000, assignments: [blockHolder] },
      { tracks: [trk({ alt: 7000 }), sameBlock], at: 1000 + DWELL_MS, assignments: [blockHolder] },
    ], [ZONE_A, ZONE_B], [blockHolder]);
    expect(r.alerts.filter(a => a.kind === 'intruder')).toHaveLength(1);
  });

  it('קונפליקט מתואם - אין התראה', () => {
    const coordinated = asg({ isCoordinated: true, status: ZONE_STATUS.inZone });
    const r = run(emptyZoneWatchState(), [
      { tracks: [mine, stranger], at: 1000, assignments: [coordinated] },
      { tracks: [mine, stranger], at: 1000 + DWELL_MS, assignments: [coordinated] },
    ], [ZONE_A, ZONE_B], [coordinated]);
    expect(r.alerts.filter(a => a.kind === 'intruder')).toEqual([]);
  });

  it('רכיב של הפ"מ עצמו אינו "זר" באזור שלו', () => {
    const r = run(emptyZoneWatchState(), [
      { tracks: [mine], at: 1000, assignments: [holder] },
      { tracks: [mine], at: 1000 + DWELL_MS, assignments: [holder] },
    ], [ZONE_A, ZONE_B], [holder]);
    expect(r.alerts.filter(a => a.kind === 'intruder')).toEqual([]);
  });
});

// ── מבנה ─────────────────────────────────────────────────────────────────────
describe('מבנה - כמה רכיבים לאותו פ"מ', () => {
  it('חבר מבנה שיצא מהאזור מייצר חריגה', () => {
    const holder = asg({ status: ZONE_STATUS.inZone });
    const inside = trk({ id: 'a', cs: 'בננה1' });
    const leaving = trk({ id: 'b', cs: 'בננה2', ...OUTSIDE });
    let s = emptyZoneWatchState();
    for (const at of [0, DWELL_MS, 2 * DWELL_MS]) {
      s = tickZoneWatch(s, { zones: [ZONE_A, ZONE_B], assignments: [holder], tracks: [inside, trk({ id: 'b', cs: 'בננה2' })], now: at }).state;
    }
    const r = run(s, [
      { tracks: [inside, leaving], at: 3 * DWELL_MS, assignments: [holder] },
      { tracks: [inside, leaving], at: 4 * DWELL_MS, assignments: [holder] },
    ], [ZONE_A, ZONE_B], [holder]);
    expect(r.alerts.map(a => a.kind)).toEqual(['out-of-zone']);
  });
});

// ── מקרי קצה ─────────────────────────────────────────────────────────────────
describe('מקרי קצה', () => {
  it('אין רכיב אווירי מתאים - שום סטטוס ושום התראה', () => {
    // הרכיב היחיד בתמונה נושא או"ק רחוק **ונמצא מחוץ לאזור**, כדי שהבדיקה
    // תבודד את "אין מגע" ולא תיפול על התראת הכניסה ללא תיאום.
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk({ id: 'z', cs: 'אבטיח', ...OUTSIDE })], at: 1000 },
      { tracks: [trk({ id: 'z', cs: 'אבטיח', ...OUTSIDE })], at: 1000 + DWELL_MS },
    ]);
    expect(r.statusChanges).toEqual([]);
    expect(r.alerts).toEqual([]);
  });

  it('אובדן מגע - רכיב שנעלם מהתמונ"א אינו מייצר חריגה', () => {
    const holder = asg({ status: ZONE_STATUS.inZone });
    let s = emptyZoneWatchState();
    for (const at of [0, DWELL_MS, 2 * DWELL_MS]) s = tickZoneWatch(s, { zones: [ZONE_A, ZONE_B], assignments: [holder], tracks: [trk()], now: at }).state;
    const r = run(s, [
      { tracks: [], at: 3 * DWELL_MS, assignments: [holder] },
      { tracks: [], at: 10 * DWELL_MS, assignments: [holder] },
    ], [ZONE_A, ZONE_B], [holder]);
    expect(r.alerts).toEqual([]);
    expect(r.statusChanges).toEqual([]);
  });

  it('פ"מ שאינו שייך לעמדה שלי - מזוהה, אך העמדה אינה כותבת את הסטטוס', () => {
    const foreign = [asg({ ownedByMe: false })];
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk()], at: 1000, assignments: foreign },
      { tracks: [trk()], at: 1000 + DWELL_MS, assignments: foreign },
    ], [ZONE_A, ZONE_B], foreign);
    expect(r.statusChanges).toEqual([]);
    expect(r.trackIdsByStrip.get(7)).toEqual(['t1']);
  });

  it('פ"מ בלי אזור - מדולג', () => {
    const noZone = [asg({ zoneIds: [] })];
    const r = run(emptyZoneWatchState(), [
      { tracks: [trk()], at: 1000, assignments: noZone },
      { tracks: [trk()], at: 1000 + DWELL_MS, assignments: noZone },
    ], [ZONE_A, ZONE_B], noZone);
    expect(r.statusChanges).toEqual([]);
    expect(r.alerts).toEqual([]);
  });

  it('אזור בלי פוליגון תקין - מדולג בלי לזרוק', () => {
    const broken: WatchZone = { id: 1, name: 'שבור', polygon: [{ x: 0, y: 0 }] };
    expect(() => run(emptyZoneWatchState(), [{ tracks: [trk()], at: 1000 }], [broken])).not.toThrow();
  });

  it('המצב אינו תופח - מפתחות של פ"מים ורכיבים שנעלמו נגרעים', () => {
    const r1 = tickZoneWatch(emptyZoneWatchState(), { zones: [ZONE_A], assignments: [asg()], tracks: [trk()], now: 0 });
    const r2 = tickZoneWatch(r1.state, { zones: [ZONE_A], assignments: [], tracks: [], now: 1000 });
    expect(Object.keys(r2.state.tracks)).toEqual([]);
    expect(Object.keys(r2.state.intruders)).toEqual([]);
  });

  it('מפתח ההתראה יציב בין טיקים - כדי שסימון "נקרא" לא ייעלם', () => {
    const holder = asg({ status: ZONE_STATUS.inZone });
    let s = emptyZoneWatchState();
    for (const at of [0, DWELL_MS, 2 * DWELL_MS]) s = tickZoneWatch(s, { zones: [ZONE_A, ZONE_B], assignments: [holder], tracks: [trk()], now: at }).state;
    const a1 = run(s, [
      { tracks: [trk({ ...OUTSIDE })], at: 3 * DWELL_MS, assignments: [holder] },
      { tracks: [trk({ ...OUTSIDE })], at: 4 * DWELL_MS, assignments: [holder] },
    ], [ZONE_A, ZONE_B], [holder]);
    const a2 = tickZoneWatch(a1.state, { zones: [ZONE_A, ZONE_B], assignments: [holder], tracks: [trk({ ...OUTSIDE })], now: 5 * DWELL_MS });
    expect(a2.alerts[0].key).toBe(a1.alerts[0].key);
  });
});
