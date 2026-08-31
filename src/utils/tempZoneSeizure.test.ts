import { describe, it, expect } from 'vitest';
import {
  segmentsIntersect, polygonEdgesCross, polygonContains, geometricCoverage,
  seizureCoversAllAltitudes, altitudeCoverage, seizureAffectsAltitude,
  seizureCoverage, pinFlagged, pinFlaggedForAssignment, seizureRangeLabel, normalizeSeizureRange, seizureOverdue,
  vertexAt, tapAction, SEIZURE_TAP_TOL_PCT, SEIZURE_GRAB_TOL_PCT, elapsedLabel,
  SEIZURE_COVERAGE_COLOR, SEIZURE_DEFAULT_COLOR,
} from './tempZoneSeizure';

/** ריבוע נוח לבדיקות: מ-(x,y) בגודל s. */
const sq = (x: number, y: number, s: number) => [
  { x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s },
];

const ALL = { alt_min: null, alt_max: null };

describe('segmentsIntersect', () => {
  it('חוצות באמצע', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
  });
  it('מקבילות שאינן נוגעות', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });
  it('קולינאריות חופפות - מרחב שצויר לאורך גבול האזור', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 })).toBe(true);
  });
  it('נוגעות בקצה בלבד', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })).toBe(true);
  });
});

describe('polygonContains / polygonEdgesCross', () => {
  it('ריבוע קטן בתוך גדול - מוכל, בלי חיתוך צלעות', () => {
    const outer = sq(0, 0, 100), inner = sq(10, 10, 20);
    expect(polygonContains(outer, inner)).toBe(true);
    expect(polygonEdgesCross(outer, inner)).toBe(false);
  });
  it('ריבועים חופפים חלקית - צלעות נחתכות', () => {
    expect(polygonEdgesCross(sq(0, 0, 20), sq(10, 10, 20))).toBe(true);
  });
  it('פוליגון בן פחות מ-3 קודקודים לעולם אינו מכיל', () => {
    expect(polygonContains(sq(0, 0, 10), [{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBe(false);
  });
});

describe('geometricCoverage', () => {
  it('האזור כולו בתוך המרחב = full', () => {
    expect(geometricCoverage(sq(10, 10, 10), sq(0, 0, 100))).toBe('full');
  });
  it('חפיפה חלקית = partial', () => {
    expect(geometricCoverage(sq(0, 0, 20), sq(10, 10, 20))).toBe('partial');
  });
  it('המרחב בלוע בתוך האזור = partial (רק חלק מהאזור מוגבל)', () => {
    expect(geometricCoverage(sq(0, 0, 100), sq(40, 40, 10))).toBe('partial');
  });
  it('זרים לחלוטין = none', () => {
    expect(geometricCoverage(sq(0, 0, 10), sq(50, 50, 10))).toBe('none');
  });
  it('פוליגון ריק = none', () => {
    expect(geometricCoverage([], sq(0, 0, 10))).toBe('none');
    expect(geometricCoverage(sq(0, 0, 10), [])).toBe('none');
  });
});

describe('altitudeCoverage', () => {
  const bands = [{ lo: 100, hi: 140 }, { lo: 140, hi: 200 }, { lo: 200, hi: 240 }];
  it('טווח ריק = כל הגבהים = full', () => {
    expect(seizureCoversAllAltitudes(ALL)).toBe(true);
    expect(altitudeCoverage(ALL, bands)).toBe('full');
    expect(altitudeCoverage(ALL, [])).toBe('full');
  });
  it('אזור לא מפוצל + טווח = partial (עמוד אוויר שרק חלקו נתפס)', () => {
    expect(altitudeCoverage({ alt_min: 100, alt_max: 140 }, [])).toBe('partial');
  });
  it('חופף לחלק מהבלוקים = partial', () => {
    expect(altitudeCoverage({ alt_min: 100, alt_max: 130 }, bands)).toBe('partial');
  });
  it('חופף לכל הבלוקים = full', () => {
    expect(altitudeCoverage({ alt_min: 50, alt_max: 300 }, bands)).toBe('full');
  });
  it('מתחת לכל הבלוקים = none', () => {
    expect(altitudeCoverage({ alt_min: 10, alt_max: 50 }, bands)).toBe('none');
  });
  it('גבול כלול: 100-140 נוגע בבלוק 140-200', () => {
    expect(altitudeCoverage({ alt_min: 100, alt_max: 140 }, [{ lo: 140, hi: 200 }])).toBe('full');
  });
  it('גבול פתוח למעלה תופס את כל מה שמעליו', () => {
    expect(altitudeCoverage({ alt_min: 100, alt_max: null }, bands)).toBe('full');
  });
});

describe('seizureAffectsAltitude - הפ"מ המהבהב', () => {
  it('כל הגבהים - תמיד חל', () => {
    expect(seizureAffectsAltitude(ALL, 250)).toBe(true);
  });
  it('גובה בתוך הטווח', () => {
    expect(seizureAffectsAltitude({ alt_min: 100, alt_max: 140 }, 120)).toBe(true);
  });
  it('גובה מחוץ לטווח', () => {
    expect(seizureAffectsAltitude({ alt_min: 100, alt_max: 140 }, 200)).toBe(false);
  });
  it('אין גובה - ברירת המחדל הבטוחה: חל', () => {
    expect(seizureAffectsAltitude({ alt_min: 100, alt_max: 140 }, null)).toBe(true);
  });
});

describe('seizureCoverage - התשובה המשולבת', () => {
  const zone = sq(10, 10, 10);
  const big = sq(0, 0, 100);
  const bands = [{ lo: 100, hi: 140 }, { lo: 140, hi: 200 }];

  it('#16 כל האזור בפנים + כל הגבהים = full (אדום)', () => {
    expect(seizureCoverage(zone, big, bands, ALL)).toBe('full');
  });
  it('#17 כל האזור בפנים אבל חלק מהגבהים = partial (כתום)', () => {
    expect(seizureCoverage(zone, big, bands, { alt_min: 100, alt_max: 130 })).toBe('partial');
  });
  it('#15 חיתוך חלקי = partial', () => {
    expect(seizureCoverage(sq(0, 0, 20), sq(10, 10, 20), bands, ALL)).toBe('partial');
  });
  it('אין חפיפת גבהים = none גם כשהאזור כולו בפנים', () => {
    expect(seizureCoverage(zone, big, bands, { alt_min: 10, alt_max: 50 })).toBe('none');
  });
  it('אין חיתוך גיאומטרי = none גם כשכל הגבהים מולאמים', () => {
    expect(seizureCoverage(sq(0, 0, 5), sq(50, 50, 5), bands, ALL)).toBe('none');
  });
  it('אזור לא מפוצל + הלאמה גורפת = full', () => {
    expect(seizureCoverage(zone, big, [], ALL)).toBe('full');
  });
  it('אזור לא מפוצל + הלאמה טווחית = partial', () => {
    expect(seizureCoverage(zone, big, [], { alt_min: 100, alt_max: 140 })).toBe('partial');
  });
});

describe('pinFlagged - #18/#19/#20', () => {
  it('#18 פ"מ באזור מושפע בגובה מושפע - מהבהב', () => {
    expect(pinFlagged('partial', { alt_min: 100, alt_max: 140 }, 120)).toBe(true);
  });
  it('#19 קיבל גובה מחוץ לטווח - מפסיק', () => {
    expect(pinFlagged('partial', { alt_min: 100, alt_max: 140 }, 200)).toBe(false);
  });
  it('#20 בלי גובה - מהבהב (ברירת המחדל הבטוחה)', () => {
    expect(pinFlagged('full', { alt_min: 100, alt_max: 140 }, null)).toBe(true);
  });
  it('אזור שאינו מושפע - לא מהבהב גם בלי גובה', () => {
    expect(pinFlagged('none', ALL, null)).toBe(false);
  });
});

describe('seizureRangeLabel / normalizeSeizureRange', () => {
  it('טווח ריק', () => expect(seizureRangeLabel(ALL)).toBe(''));
  it('טווח מלא', () => expect(seizureRangeLabel({ alt_min: 100, alt_max: 140 })).toBe('100-140'));
  it('נקודה', () => expect(seizureRangeLabel({ alt_min: 120, alt_max: 120 })).toBe('120'));
  it('פתוח למעלה', () => expect(seizureRangeLabel({ alt_min: 200, alt_max: null })).toBe('200+'));
  it('פתוח למטה', () => expect(seizureRangeLabel({ alt_min: null, alt_max: 90 })).toBe('-90'));
  it('#8 min>max מנורמל', () => {
    expect(normalizeSeizureRange({ alt_min: 200, alt_max: 100 })).toEqual({ alt_min: 100, alt_max: 200 });
  });
  it('גבול חסר נשאר חסר', () => {
    expect(normalizeSeizureRange({ alt_min: 200, alt_max: null })).toEqual({ alt_min: 200, alt_max: null });
  });
});

describe('seizureOverdue - #23', () => {
  const now = Date.parse('2026-08-31T12:00:00Z');
  it('בלי זמן סיום - לעולם לא חורג', () => expect(seizureOverdue(null, now)).toBe(false));
  it('זמן שעבר', () => expect(seizureOverdue('2026-08-31T11:59:00Z', now)).toBe(true));
  it('זמן עתידי', () => expect(seizureOverdue('2026-08-31T12:30:00Z', now)).toBe(false));
  it('טקסט לא תקין אינו מפיל', () => expect(seizureOverdue('לא תאריך', now)).toBe(false));
});

describe('צבעי הסטטוס', () => {
  it('כתום לחלקי, אדום למלא', () => {
    expect(SEIZURE_COVERAGE_COLOR.partial).toBe('#f97316');
    expect(SEIZURE_COVERAGE_COLOR.full).toBe('#ef4444');
  });
  it('ב"מ של מרחב חדש - אדום: הצבע הראשון שהפקח רואה אומר "נתפס"', () => {
    expect(SEIZURE_DEFAULT_COLOR).toBe('#ef4444');
  });
});

describe('pinFlaggedForAssignment - הבלוק גובר על הגובה הרשום', () => {
  const s = { alt_min: 130, alt_max: 160 };
  it('בלוק 100-140 חופף להלאמה 130-160 - מהבהב גם כשהגובה הרשום 110', () => {
    expect(pinFlaggedForAssignment('partial', s, [{ lo: 100, hi: 140 }], 110)).toBe(true);
  });
  it('בלוק שאינו חופף - לא מהבהב גם כשהגובה הרשום בתוך ההלאמה', () => {
    expect(pinFlaggedForAssignment('partial', s, [{ lo: 200, hi: 240 }], 140)).toBe(false);
  });
  it('בלי בלוק - נופלים לגובה הרשום', () => {
    expect(pinFlaggedForAssignment('partial', s, [], 140)).toBe(true);
    expect(pinFlaggedForAssignment('partial', s, [], 90)).toBe(false);
  });
  it('בלי בלוק ובלי גובה - מהבהב (ברירת המחדל הבטוחה)', () => {
    expect(pinFlaggedForAssignment('partial', s, [], null)).toBe(true);
  });
  it('הלאמה גורפת - מהבהב בכל בלוק', () => {
    expect(pinFlaggedForAssignment('partial', ALL, [{ lo: 300, hi: 400 }], 350)).toBe(true);
  });
  it('אזור שאינו מושפע - לעולם לא', () => {
    expect(pinFlaggedForAssignment('none', ALL, [], null)).toBe(false);
  });
});

describe('מחוות הציור - vertexAt', () => {
  const pts = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }];
  it('נגיעה על קודקוד תופסת אותו', () => {
    expect(vertexAt(pts, { x: 50.3, y: 10.2 })).toBe(1);
  });
  it('נגיעה רחוקה מכולם לא תופסת', () => {
    expect(vertexAt(pts, { x: 30, y: 30 })).toBe(-1);
  });
  it('שני קודקודים בטווח - נבחר ה**קרוב**, לא הראשון ברשימה', () => {
    const close = [{ x: 20, y: 20 }, { x: 20.9, y: 20 }];
    expect(vertexAt(close, { x: 20.8, y: 20 })).toBe(1);
  });
  it('רשימה ריקה', () => expect(vertexAt([], { x: 1, y: 1 })).toBe(-1));
});

describe('מחוות הציור - tapAction', () => {
  const tri = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }];
  const same = (p: { x: number; y: number }) => tapAction(tri, p, p);

  it('#4 נגיעה בשטח ריק מוסיפה קודקוד', () => {
    expect(same({ x: 30, y: 40 })).toBe('add');
  });
  it('נגיעה בקודקוד הראשון סוגרת - כשיש 3 קודקודים', () => {
    expect(same({ x: 10.2, y: 10.2 })).toBe('close');
  });
  it('#4 עם שני קודקודים בלבד - נגיעה בראשון עדיין **מוסיפה**, לא סוגרת', () => {
    const two = [{ x: 10, y: 10 }, { x: 50, y: 10 }];
    expect(tapAction(two, { x: 10, y: 10 }, { x: 10, y: 10 })).toBe('add');
  });
  it('המצביע זז - גרירת מפה, לא נגיעה', () => {
    expect(tapAction(tri, { x: 30, y: 30 }, { x: 38, y: 30 })).toBe('none');
  });
  it('רעד קטן מסף הנגיעה עדיין נחשב נגיעה - אצבע על מסך מגע תמיד זזה קצת', () => {
    const start = { x: 30, y: 30 };
    const end = { x: 30 + SEIZURE_TAP_TOL_PCT / 2, y: 30 };
    expect(tapAction(tri, start, end)).toBe('add');
  });
  it('סף התפיסה גדול מסף הנגיעה - אחרת אי אפשר לסגור פוליגון באצבע', () => {
    expect(SEIZURE_GRAB_TOL_PCT).toBeGreaterThan(SEIZURE_TAP_TOL_PCT);
  });
});

describe('elapsedLabel - השעון הרץ', () => {
  const t0 = '2026-08-31T12:00:00.000Z';
  const at = (sec: number) => elapsedLabel(t0, Date.parse(t0) + sec * 1000);

  it('מתחת לשעה - MM:SS בלי אפסים מובילים מיותרים', () => {
    expect(at(0)).toBe('0:00');
    expect(at(9)).toBe('0:09');
    expect(at(75)).toBe('1:15');
    expect(at(3599)).toBe('59:59');
  });
  it('מעל שעה - H:MM:SS', () => {
    expect(at(3600)).toBe('1:00:00');
    expect(at(3661)).toBe('1:01:01');
    expect(at(36000)).toBe('10:00:00');
  });
  it('שעון שהוסט אחורה לא מייצר זמן שלילי', () => {
    expect(at(-120)).toBe('0:00');
  });
  it('בלי תאריך, או תאריך לא תקין - ריק ולא NaN', () => {
    expect(elapsedLabel(null, Date.now())).toBe('');
    expect(elapsedLabel('לא תאריך', Date.now())).toBe('');
  });
});
