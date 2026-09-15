import { describe, it, expect } from 'vitest';
import {
  formationIndexOf, matchFormationTracks, distToSegmentNm, detectLeg, expectedFormationCount,
  tickPatternAutotrack, emptyPatternTrackState, aircraftKey,
  JOIN_ENTER_NM, JOIN_EXIT_NM, LEG_NM, LANDED_HOLD_MS, DWELL_MS,
  type AutoStrip, type AutoAircraft, type AutoTrack, type PatternGeo, type PatternTrackState, type GeoPt,
} from './patternTrack';

// ── מרחב הבדיקה ──────────────────────────────────────────────────────────────
// ראשית בנ"צ אמיתי, ומייל ימי אחד = 1/60 מעלת רוחב. אורך מתוקן ב-cos(רוחב).
const LAT0 = 32, LON0 = 35;
const COS = Math.cos(LAT0 * Math.PI / 180);
/** נקודה במרחק x מייל מזרחה ו-y מייל צפונה מהראשית. */
const nm = (x: number, y: number): GeoPt => ({ lat: LAT0 + y / 60, lon: LON0 + x / (60 * COS) });

// הקפה: מסלול צפון-דרום באורך 2 מייל, הסף בראשית, עם הרוח 1.5 מייל מזרחה.
const PAT: PatternGeo = {
  id: 7, runwayIdent: '36',
  legs: {
    downwind: [nm(1.5, 3), nm(1.5, -1)],
    base: [nm(1.5, -1), nm(0, -1)],
    final: [nm(0, -1), nm(0, 0)],
  },
  threshold: nm(0, 0),
  runway: [nm(0, 0), nm(0, 2)],
};
const POINT = nm(8, 8);

const strip = (over: Partial<AutoStrip> = {}): AutoStrip => ({
  stripId: '10', callSign: 'בננה', formationSize: 4, indices: null, ...over,
});

const ac = (over: Partial<AutoAircraft> = {}): AutoAircraft => ({
  stripId: '10', idx: 1, pointId: 3, pointGeo: POINT, inPattern: false,
  patternId: null, runwayIdent: '', flightStatus: 'none', ...over,
});

const trk = (at: GeoPt, over: Partial<AutoTrack> = {}): AutoTrack => ({
  id: 't1', cs: 'בננה 1', lat: at.lat, lon: at.lon, alt: 3000, spd: 180, ...over,
});

/** טיקים בזה אחר זה. כל פריים: מטוסים, רכיבים וזמן. */
function run(frames: { aircraft: AutoAircraft[]; tracks: AutoTrack[]; at: number }[],
  strips: AutoStrip[] = [strip()], patterns: PatternGeo[] = [PAT]) {
  let s: PatternTrackState = emptyPatternTrackState();
  const all: ReturnType<typeof tickPatternAutotrack>[] = [];
  for (const f of frames) {
    const r = tickPatternAutotrack(s, { strips, aircraft: f.aircraft, tracks: f.tracks, patterns, now: f.at });
    s = r.state;
    all.push(r);
  }
  return { last: all[all.length - 1], all, actions: all.flatMap(r => r.actions) };
}

// ── §3 זיהוי: מספר במבנה ─────────────────────────────────────────────────────
describe('formationIndexOf - המספר במבנה מתוך או"ק הרכיב', () => {
  it('מספר בטווח המבנה', () => {
    expect(formationIndexOf('בננה 1', 4)).toBe(1);
    expect(formationIndexOf('בננה 4', 4)).toBe(4);
  });
  it('בננה 11 ברביעייה = בננה 1, ובננה 12 = בננה 2', () => {
    expect(formationIndexOf('בננה 11', 4)).toBe(1);
    expect(formationIndexOf('בננה12', 4)).toBe(2);
  });
  it('מספר שגם ספרתו האחרונה מחוץ לטווח - לא משודך', () => {
    expect(formationIndexOf('בננה 19', 4)).toBeNull();
    expect(formationIndexOf('בננה 5', 4)).toBeNull();
    expect(formationIndexOf('בננה 10', 4)).toBeNull();
  });
  it('מבנה גדול מ-9: 11 הוא המטוס ה-11 ולא 1', () => {
    expect(formationIndexOf('בננה 11', 12)).toBe(11);
  });
  it('בלי מספר: בודד = 1, מבנה = לא משודך (אין ניחוש)', () => {
    expect(formationIndexOf('בננה', 1)).toBe(1);
    expect(formationIndexOf('בננה', 2)).toBeNull();
  });
});

describe('matchFormationTracks - רכיב אווירי למטוס בפ"מ', () => {
  it('משדך לפי שם + מספר', () => {
    const m = matchFormationTracks([strip()], [
      { id: 'a', cs: 'בננה 1' }, { id: 'b', cs: 'בננה 2' }, { id: 'c', cs: 'תפוח 1' },
    ]);
    expect(m.byKey.get(aircraftKey('10', 1))).toBe('a');
    expect(m.byKey.get(aircraftKey('10', 2))).toBe('b');
    expect(m.byKey.size).toBe(2);
  });

  it('מבנה מפוצל: המטוס הולך לפ"מ שמחזיק את המספר שלו', () => {
    const m = matchFormationTracks([
      strip({ stripId: '10', formationSize: 4, indices: [1, 2] }),
      strip({ stripId: '11', formationSize: 4, indices: [3, 4] }),
    ], [{ id: 'a', cs: 'בננה 3' }, { id: 'b', cs: 'בננה 1' }]);
    expect(m.byKey.get(aircraftKey('11', 3))).toBe('a');
    expect(m.byKey.get(aircraftKey('10', 1))).toBe('b');
    expect(m.byKey.has(aircraftKey('10', 3))).toBe(false);
  });

  it('שני רכיבים לאותו מטוס - אף אחד לא משודך, והמטוס מסומן דו-משמעי', () => {
    const m = matchFormationTracks([strip()], [{ id: 'a', cs: 'בננה 1' }, { id: 'b', cs: 'בננה 11' }]);
    expect(m.byKey.has(aircraftKey('10', 1))).toBe(false);
    expect(m.ambiguous.has(aircraftKey('10', 1))).toBe(true);
  });

  it('שם אחר לגמרי אינו משתדך', () => {
    const m = matchFormationTracks([strip()], [{ id: 'a', cs: 'אפיק 1' }]);
    expect(m.byKey.size).toBe(0);
  });
});

// ── §4 גאומטריה ──────────────────────────────────────────────────────────────
describe('גאומטריה במייל ימי', () => {
  it('מרחק לקטע: ניצב, ומעבר לקצה - לקצה', () => {
    expect(distToSegmentNm(nm(1, 0), nm(0, -1), nm(0, 1))).toBeCloseTo(1, 2);
    expect(distToSegmentNm(nm(0, 3), nm(0, -1), nm(0, 1))).toBeCloseTo(2, 2);
  });

  it('צלע בטווח חצי מייל', () => {
    expect(detectLeg(nm(1.4, 1), [PAT])).toEqual({ patternId: 7, leg: 'downwind' });
    expect(detectLeg(nm(0.8, -1.1), [PAT])).toEqual({ patternId: 7, leg: 'base' });
    expect(detectLeg(nm(0.1, -0.5), [PAT])).toEqual({ patternId: 7, leg: 'final' });
    expect(detectLeg(nm(4, 1), [PAT])).toBeNull();
    expect(detectLeg(nm(1.5 + LEG_NM + 0.05, 1), [PAT])).toBeNull();
  });

  it('בפינה - הצלע הקרובה', () => {
    // קרוב לסוף העם-הרוח אבל מעט יותר לבסיס
    expect(detectLeg(nm(1.3, -1.05), [PAT])?.leg).toBe('base');
  });

  it('הקפה מועדפת: כשלמטוס כבר יש הקפה, לא בודקים אחרת', () => {
    const other: PatternGeo = { ...PAT, id: 8 };
    expect(detectLeg(nm(1.4, 1), [other, PAT], 7)?.patternId).toBe(7);
    expect(detectLeg(nm(1.4, 1), [other], 7)).toBeNull();
  });
});

// ── סטייה מותרת לכל הקפה (פרמטרי השדה) ─────────────────────────────────────
describe('סטייה מותרת מהצלע ומהגובה - מוגדרת לכל הקפה', () => {
  it('סטייה מהצלע לפי ההקפה, ובלי הגדרה - ברירת המחדל', () => {
    const tight: PatternGeo = { ...PAT, legTolNm: 0.2 };
    expect(detectLeg(nm(1.4, 1), [tight])?.leg).toBe('downwind');     // 0.1 מייל
    expect(detectLeg(nm(1.2, 1), [tight])).toBeNull();                // 0.3 מייל
    expect(detectLeg(nm(1.2, 1), [PAT])?.leg).toBe('downwind');       // ברירת מחדל 0.5
    const wide: PatternGeo = { ...PAT, legTolNm: 1.2 };
    expect(detectLeg(nm(0.5, 1), [wide])?.leg).toBe('downwind');      // 1.0 מייל
  });

  // "מהגובה כמה מעל וכמה מתחת מותר" (2026-09-15) - שני גבולות נפרדים
  it('סטייה מהגובה: גבול מעל וגבול מתחת, כל אחד לעצמו', () => {
    const alt: PatternGeo = { ...PAT, altAboveFt: 1500, altBelowFt: 500, plannedAltFt: () => 3000 };
    expect(detectLeg(nm(1.5, 1), [alt], null, { altFt: 4400 })?.leg).toBe('downwind');   // +1400
    expect(detectLeg(nm(1.5, 1), [alt], null, { altFt: 4600 })).toBeNull();              // +1600
    expect(detectLeg(nm(1.5, 1), [alt], null, { altFt: 2600 })?.leg).toBe('downwind');   // -400
    expect(detectLeg(nm(1.5, 1), [alt], null, { altFt: 2400 })).toBeNull();              // -600
  });

  it('גבול שלא נמסר - אינו נבדק באותו כיוון', () => {
    const onlyBelow: PatternGeo = { ...PAT, altBelowFt: 500, plannedAltFt: () => 3000 };
    expect(detectLeg(nm(1.5, 1), [onlyBelow], null, { altFt: 9000 })?.leg).toBe('downwind');
    expect(detectLeg(nm(1.5, 1), [onlyBelow], null, { altFt: 2000 })).toBeNull();
  });

  it('הגובה המתוכנן נמדד בנקודה שלאורך הצלע', () => {
    const seen: [string, number][] = [];
    const alt: PatternGeo = { ...PAT, altAboveFt: 5000, altBelowFt: 5000, plannedAltFt: (leg, frac) => { seen.push([leg, frac]); return 0; } };
    detectLeg(nm(1.5, 1), [alt], null, { altFt: 100 });
    const dw = seen.find(([l]) => l === 'downwind')!;
    expect(dw[1]).toBeCloseTo(0.5, 2);   // (1.5,3)→(1.5,-1): y=1 הוא האמצע
  });

  it('כיוון טיסה: חוצה את קו עם הרוח בניצב - אינו עליו', () => {
    expect(detectLeg(nm(1.5, 1), [PAT], null, { hdg: 90 })).toBeNull();
    expect(detectLeg(nm(1.5, 1), [PAT], null, { hdg: 175 })?.leg).toBe('downwind');
  });
});

describe('expectedFormationCount - כמה מטוסים צפויים בפ"מ', () => {
  it('פ"מ מפוצל - מספר המטוסים שהוא מחזיק', () => {
    expect(expectedFormationCount({ rows: 1, formation: '4', indices: [3, 4] })).toBe(2);
  });
  it('אחרת - הגדול מבין שורות המטוסים וגודל המבנה', () => {
    expect(expectedFormationCount({ rows: 1, formation: '4', indices: null })).toBe(4);
    expect(expectedFormationCount({ rows: 5, formation: '4', indices: null })).toBe(5);
    expect(expectedFormationCount({ rows: 0, formation: null, indices: null })).toBe(0);
  });
});

// ── §5 מכונת המצבים ──────────────────────────────────────────────────────────
describe('נקודת הצטרפות', () => {
  it('עד 3 מייל - מהבהב, והוא אינו כותב כלום', () => {
    const { last } = run([{ aircraft: [ac()], tracks: [trk(nm(8, 8 + JOIN_ENTER_NM - 0.1))], at: 1000 }]);
    expect(last.nearPoint.has(aircraftKey('10', 1))).toBe(true);
    expect(last.actions).toEqual([]);
  });

  it('רחוק - לא מהבהב', () => {
    const { last } = run([{ aircraft: [ac()], tracks: [trk(nm(8, 20))], at: 1000 }]);
    expect(last.nearPoint.size).toBe(0);
  });

  it('היה בפנים ויצא מעבר ל-3.2 מייל (אחרי השהיה) - יוצא מהנקודה', () => {
    const far = nm(8, 8 - JOIN_EXIT_NM - 0.3);
    const { actions } = run([
      { aircraft: [ac()], tracks: [trk(POINT)], at: 0 },
      { aircraft: [ac()], tracks: [trk(far)], at: 1000 },
      { aircraft: [ac()], tracks: [trk(far)], at: 1000 + DWELL_MS + 10 },
    ]);
    expect(actions).toEqual([{ kind: 'leave-point', stripId: '10', idx: 1, patternId: 7, runwayIdent: '36' }]);
  });

  it('בין 3 ל-3.2 מייל אינו יוצא (היסטרזיס)', () => {
    const edge = nm(8, 8 - (JOIN_ENTER_NM + JOIN_EXIT_NM) / 2);
    const { actions } = run([
      { aircraft: [ac()], tracks: [trk(POINT)], at: 0 },
      { aircraft: [ac()], tracks: [trk(edge)], at: 1000 },
      { aircraft: [ac()], tracks: [trk(edge)], at: 20000 },
    ]);
    expect(actions).toEqual([]);
  });

  it('לא היה בפנים מעולם - רחוק אינו "יציאה"', () => {
    const { actions } = run([
      { aircraft: [ac()], tracks: [trk(nm(8, 20))], at: 0 },
      { aircraft: [ac()], tracks: [trk(nm(8, 20))], at: 10000 },
    ]);
    expect(actions).toEqual([]);
  });

  it('יציאה חוזרת פעם אחת בלבד', () => {
    const far = nm(8, 2);
    const { actions } = run([
      { aircraft: [ac()], tracks: [trk(POINT)], at: 0 },
      { aircraft: [ac()], tracks: [trk(far)], at: 1000 },
      { aircraft: [ac()], tracks: [trk(far)], at: 5000 },
      { aircraft: [ac()], tracks: [trk(far)], at: 9000 },
    ]);
    expect(actions.filter(a => a.kind === 'leave-point')).toHaveLength(1);
  });
});

describe('צלעות ההקפה', () => {
  const onDw = nm(1.5, 1), onBase = nm(0.8, -1), onFinal = nm(0, -0.5);

  it('עם הרוח אחרי השהיה - צלע נכתבת, וגם יציאה מהנקודה', () => {
    const { actions } = run([
      { aircraft: [ac()], tracks: [trk(onDw)], at: 0 },
      { aircraft: [ac()], tracks: [trk(onDw)], at: DWELL_MS + 10 },
    ]);
    expect(actions).toEqual([{ kind: 'set-leg', stripId: '10', idx: 1, leg: 'downwind', patternId: 7, runwayIdent: '36', inPattern: false }]);
  });

  it('לפני תום ההשהיה - כלום', () => {
    const { actions } = run([
      { aircraft: [ac()], tracks: [trk(onDw)], at: 0 },
      { aircraft: [ac()], tracks: [trk(onDw)], at: DWELL_MS - 500 },
    ]);
    expect(actions).toEqual([]);
  });

  it('הצלע כבר רשומה ב-DB - אין כתיבה', () => {
    const a = ac({ inPattern: true, patternId: 7, runwayIdent: '36', flightStatus: 'downwind' });
    const { actions } = run([
      { aircraft: [a], tracks: [trk(onDw)], at: 0 },
      { aircraft: [a], tracks: [trk(onDw)], at: DWELL_MS + 10 },
    ]);
    expect(actions).toEqual([]);
  });

  it('עם הרוח → בסיס → פיינל, כל אחד פעם אחת', () => {
    const a = ac({ inPattern: true, patternId: 7, runwayIdent: '36', flightStatus: 'downwind' });
    const frames = [
      { aircraft: [a], tracks: [trk(onDw)], at: 0 },
      { aircraft: [a], tracks: [trk(onBase)], at: 1000 },
      { aircraft: [a], tracks: [trk(onBase)], at: 1000 + DWELL_MS + 10 },
      { aircraft: [a], tracks: [trk(onBase)], at: 9000 },
      { aircraft: [a], tracks: [trk(onFinal)], at: 10000 },
      { aircraft: [a], tracks: [trk(onFinal)], at: 10000 + DWELL_MS + 10 },
    ];
    const legs = run(frames).actions.filter(x => x.kind === 'set-leg').map(x => (x as { leg: string }).leg);
    expect(legs).toEqual(['base', 'final']);
  });

  // "כשפונה לבסיס - מיד להעביר לסטטוס בסיס" (2026-09-15)
  it('פנייה לבסיס: באותו טיק, בלי השהיה', () => {
    const a = ac({ inPattern: true, patternId: 7, runwayIdent: '36', flightStatus: 'downwind' });
    const { all } = run([
      { aircraft: [a], tracks: [trk(nm(1.5, 0), { hdg: 180 })], at: 0 },
      { aircraft: [a], tracks: [trk(nm(1.45, -0.95), { hdg: 268 })], at: 1000 },
    ]);
    expect(all[1].actions).toEqual([{ kind: 'set-leg', stripId: '10', idx: 1, leg: 'base', patternId: 7, runwayIdent: '36', inPattern: true }]);
  });

  it('אחרי הפנייה, עדיין בפינה ליד קו עם הרוח - לא חוזר לעם הרוח', () => {
    const a = ac({ inPattern: true, patternId: 7, runwayIdent: '36', flightStatus: 'downwind' });
    const inBase = { ...a, flightStatus: 'base' as const };
    const { actions } = run([
      { aircraft: [a], tracks: [trk(nm(1.5, -0.8), { hdg: 180 })], at: 0 },
      { aircraft: [a], tracks: [trk(nm(1.5, -0.98), { hdg: 270 })], at: 1000 },
      { aircraft: [inBase], tracks: [trk(nm(1.4, -1), { hdg: 270 })], at: 2000 },
      { aircraft: [inBase], tracks: [trk(nm(1.3, -1), { hdg: 270 })], at: 6000 },
    ]);
    expect(actions.map(x => (x as { leg?: string }).leg)).toEqual(['base']);
  });

  it('תיקון ידני גובר: הפקח החזיר לעם הרוח והמטוס עדיין בבסיס - לא נדרס', () => {
    const inBase = ac({ inPattern: true, patternId: 7, runwayIdent: '36', flightStatus: 'base' });
    const manual = { ...inBase, flightStatus: 'downwind' as const };
    const { actions } = run([
      { aircraft: [inBase], tracks: [trk(onBase)], at: 0 },
      { aircraft: [inBase], tracks: [trk(onBase)], at: DWELL_MS + 10 },
      { aircraft: [manual], tracks: [trk(onBase)], at: 8000 },
      { aircraft: [manual], tracks: [trk(onBase)], at: 20000 },
    ]);
    expect(actions).toEqual([]);
  });

  it('הקפה חוזרת: מפיינל חזרה לעם הרוח', () => {
    const a = ac({ inPattern: true, patternId: 7, runwayIdent: '36', flightStatus: 'final' });
    const { actions } = run([
      { aircraft: [a], tracks: [trk(onFinal)], at: 0 },
      { aircraft: [a], tracks: [trk(onDw)], at: 5000 },
      { aircraft: [a], tracks: [trk(onDw)], at: 5000 + DWELL_MS + 10 },
    ]);
    expect(actions.map(x => (x as { leg?: string }).leg)).toEqual(['downwind']);
  });

  it('עמדה אחרת מחזיקה את הפ"מ - לא נכתב כלום (הפ"מ לא נמסר למנוע)', () => {
    const { actions } = run([
      { aircraft: [ac()], tracks: [trk(onDw)], at: 0 },
      { aircraft: [ac()], tracks: [trk(onDw)], at: DWELL_MS + 10 },
    ], []);
    expect(actions).toEqual([]);
  });

  it('שידוך דו-משמעי - כלום', () => {
    const { actions } = run([
      { aircraft: [ac()], tracks: [trk(onDw), trk(onDw, { id: 't2', cs: 'בננה 11' })], at: 0 },
      { aircraft: [ac()], tracks: [trk(onDw), trk(onDw, { id: 't2', cs: 'בננה 11' })], at: DWELL_MS + 10 },
    ]);
    expect(actions).toEqual([]);
  });
});

describe('נחת', () => {
  const onFinal = ac({ inPattern: true, patternId: 7, runwayIdent: '36', flightStatus: 'final' });
  const rollout = nm(0, 0.3);

  /** טיק כל שנייה בין שני זמנים - כמו ה-hook בפועל. */
  const everySec = (from: number, to: number, frame: (t: number) => { aircraft: AutoAircraft[]; tracks: AutoTrack[] }) => {
    const out: { aircraft: AutoAircraft[]; tracks: AutoTrack[]; at: number }[] = [];
    for (let t = from; t <= to; t += 1000) out.push({ ...frame(t), at: t });
    return out;
  };

  it('במהירות נמוכה ליד הסף 30 שניות - נחת, פעם אחת', () => {
    const { actions } = run(everySec(0, LANDED_HOLD_MS + 5000,
      () => ({ aircraft: [onFinal], tracks: [trk(rollout, { spd: 30 })] })));
    expect(actions).toEqual([{ kind: 'landed', stripId: '10', idx: 1 }]);
  });

  // נמדד בסימולטור (ATSIM): המטוס מתגלגל 1.4 מייל **לאורך המסלול** ורק אז נעלם.
  // מדידה מול נקודת הסף פספסה את כל הנחיתות - המרחק הוא מהמסלול, לא מהסף.
  it('גלגול בקצה הרחוק של המסלול ונעלם שם - נחת', () => {
    const { actions } = run(everySec(0, LANDED_HOLD_MS + 5000,
      t => ({ aircraft: [onFinal], tracks: t < 3000 ? [trk(nm(0, 1.4), { spd: 45 })] : [] })));
    expect(actions).toEqual([{ kind: 'landed', stripId: '10', idx: 1 }]);
  });

  it('לפני 30 שניות - עדיין לא', () => {
    const { actions } = run(everySec(0, LANDED_HOLD_MS - 1000,
      () => ({ aircraft: [onFinal], tracks: [trk(rollout, { spd: 30 })] })));
    expect(actions).toEqual([]);
  });

  it('נעלם ליד הסף 30 שניות - נחת', () => {
    const { actions } = run(everySec(0, LANDED_HOLD_MS + 2000,
      t => ({ aircraft: [onFinal], tracks: t === 0 ? [trk(nm(0, -0.2), { spd: 130 })] : [] })));
    expect(actions).toEqual([{ kind: 'landed', stripId: '10', idx: 1 }]);
  });

  it('טאץ\' אנד גו: חזר למהירות בתוך ה-30 שניות - לא נחת', () => {
    const { actions } = run(everySec(0, LANDED_HOLD_MS + 10000, t => ({
      aircraft: [onFinal],
      tracks: [t < 20000 ? trk(rollout, { spd: 40 }) : trk(nm(0, 0.5 + (t - 20000) / 20000), { spd: 150 })],
    })));
    expect(actions.filter(a => a.kind === 'landed')).toEqual([]);
  });

  it('נעלם רחוק מהסף - אובדן קשר, לא נחיתה', () => {
    const { actions } = run(everySec(0, LANDED_HOLD_MS + 2000,
      t => ({ aircraft: [onFinal], tracks: t === 0 ? [trk(nm(5, 5))] : [] })));
    expect(actions).toEqual([]);
  });

  it('לא בפיינל - מהירות נמוכה ליד הסף אינה נחיתה', () => {
    const dw = { ...onFinal, flightStatus: 'downwind' as const };
    const { actions } = run(everySec(0, LANDED_HOLD_MS + 2000,
      () => ({ aircraft: [dw], tracks: [trk(rollout, { spd: 20 })] })));
    expect(actions.filter(a => a.kind === 'landed')).toEqual([]);
  });

  it('פער בטיקים (תמונה ישנה) מאפס את הספירה', () => {
    const { actions } = run([
      { aircraft: [onFinal], tracks: [trk(rollout, { spd: 40 })], at: 0 },
      { aircraft: [onFinal], tracks: [trk(rollout, { spd: 40 })], at: LANDED_HOLD_MS + 10 },
    ]);
    expect(actions).toEqual([]);
  });
});

describe('שיוך הרכיב המשודך לתצוגה', () => {
  it('trackIdByKey - כדי להבהב את הרכיב האווירי של מטוס בלי ירוקים', () => {
    const { last } = run([{ aircraft: [ac()], tracks: [trk(nm(30, 30))], at: 0 }]);
    expect(last.trackIdByKey.get(aircraftKey('10', 1))).toBe('t1');
  });
});
