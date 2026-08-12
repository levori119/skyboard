import { describe, it, expect } from 'vitest';
import { downwindPoint, legForFlightStatus, legPoint, spreadFracs } from './PatternAircraftLayer';

// שני מטוסים שנגררו לאותה הקפה נחתו על אותו שבר (מרכז צלע ה"עם הרוח") ואחד
// הסתיר את השני - כלומר בדיוק המידע שהפקח צריך לראות נעלם. הפיזור משאיר אותם
// **צמודים** (זו אותה הקפה) אבל נפרדים, ובלי לגלוש מהצלע.

const asc = (a: number[]) => a.every((v, i) => i === 0 || v > a[i - 1]);

describe('spreadFracs - מטוסים על אותה הקפה לא יושבים זה על זה', () => {
  it('מטוס בודד נשאר בדיוק על השבר שנבחר', () => {
    expect(spreadFracs(1, 0.5, 0.13)).toEqual([0.5]);
    expect(spreadFracs(1, 0.2, 0.13)).toEqual([0.2]);
  });

  it('שניים מתפזרים סימטרית סביב השבר', () => {
    const [a, b] = spreadFracs(2, 0.5, 0.13);
    expect(a).toBeCloseTo(0.435, 5);
    expect(b).toBeCloseTo(0.565, 5);
    expect((a + b) / 2).toBeCloseTo(0.5, 5);
  });

  it('אף שניים אינם על אותו מקום', () => {
    for (const n of [2, 3, 4, 8]) {
      const out = spreadFracs(n, 0.5, 0.13);
      expect(new Set(out).size).toBe(n);
      expect(asc(out)).toBe(true);
    }
  });

  it('הם נשארים צמודים - המרווח אינו גדל עם המספר', () => {
    const out = spreadFracs(4, 0.5, 0.13);
    expect(out[1] - out[0]).toBeCloseTo(0.13, 5);
    expect(out[3] - out[2]).toBeCloseTo(0.13, 5);
  });

  it('הרבה מטוסים - המרווח מתכווץ כדי שכולם יישארו על הצלע', () => {
    const out = spreadFracs(12, 0.5, 0.13);
    expect(out.length).toBe(12);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0.03);
    expect(Math.max(...out)).toBeLessThanOrEqual(0.97);
    expect(out[1] - out[0]).toBeLessThan(0.13);
  });

  it('שבר בסיס בקצה הצלע - אף מטוס לא גולש מחוצה לה', () => {
    for (const base of [0, 1, 0.02, 0.99]) {
      const out = spreadFracs(5, base, 0.13);
      expect(Math.min(...out)).toBeGreaterThanOrEqual(0.03);
      expect(Math.max(...out)).toBeLessThanOrEqual(0.97);
    }
  });

  it('0 מטוסים אינו מפיל', () => {
    expect(spreadFracs(0, 0.5, 0.13)).toEqual([0.5]);
  });
});

describe('legForFlightStatus - הצלע נגזרת מסטטוס הטיסה', () => {
  it('אישור נחיתה = כבר בפיינל, לא ממתין בעם הרוח', () => {
    expect(legForFlightStatus('cleared_to_land')).toBe('final');
  });

  it('נחת = לא באוויר, לא מצויר כלל', () => {
    expect(legForFlightStatus('landed')).toBeNull();
  });

  it('בסיס ופיינל - כל אחד על הצלע שלו', () => {
    expect(legForFlightStatus('base')).toBe('base');
    expect(legForFlightStatus('final')).toBe('final');
  });

  // "ירוקים" הפך מ**מצב** ל**דגל דיווח** (`strip_aircraft.greens`): הטייס מדווח
  // בעה"ר, בבסיס או בפיינל, והמטוס ממשיך להתקדם בהקפה. כשהוא היה מצב, סימון
  // ירוקים הוריד את המטוס מההקפה - כלומר מחק בדיוק את מה שהפקח מסתכל עליו.
  it('ירוקים אינו מוריד מטוס מההקפה - הוא דגל ולא מצב', () => {
    expect(legForFlightStatus('greens')).toBe('downwind');
  });

  it('כל השאר ממתינים בעם הרוח', () => {
    for (const s of ['none', 'downwind', '', null, undefined, 'משהו אחר']) {
      expect(legForFlightStatus(s)).toBe('downwind');
    }
  });

  it('סובלני לרווחים', () => {
    expect(legForFlightStatus('  landed ')).toBeNull();
    expect(legForFlightStatus(' cleared_to_land ')).toBe('final');
  });
});

describe('legPoint - מיקום על צלע נתונה', () => {
  const PAT = { id: 1, geometry: { anchor: { x: 50, y: 60 }, bearing: 0, side: 'left', rwyLen: 10, upwind: 5, width: 15, baseExt: 8 } };

  it('אמצע הפיינל, ואמצע עם הרוח - נקודות שונות', () => {
    const f = legPoint(PAT, 1, 'final', 0.5)!;
    const d = legPoint(PAT, 1, 'downwind', 0.5)!;
    expect(f).not.toEqual(d);
    // הפיינל על ציר המסלול (x=50), עם הרוח מוסט לרוחב
    expect(f.x).toBeCloseTo(50, 6);
    expect(d.x).toBeCloseTo(35, 6);
  });

  it('שבר 0 ו-1 הם קצות הצלע', () => {
    const a = legPoint(PAT, 1, 'final', 0)!;
    const b = legPoint(PAT, 1, 'final', 1)!;
    expect(b.y).toBeCloseTo(60, 6); // סוף הפיינל = הסף
    expect(a.y).toBeGreaterThan(b.y);
  });

  it('שבר חורג נחתך לתחום, ושבר חסר נופל למרכז', () => {
    expect(legPoint(PAT, 1, 'final', 5)).toEqual(legPoint(PAT, 1, 'final', 1));
    expect(legPoint(PAT, 1, 'final', -3)).toEqual(legPoint(PAT, 1, 'final', 0));
    expect(legPoint(PAT, 1, 'final', null)).toEqual(legPoint(PAT, 1, 'final', 0.5));
  });

  it('עם הרוח דרך legPoint זהה ל-downwindPoint', () => {
    expect(legPoint(PAT, 1, 'downwind', 0.3)).toEqual(downwindPoint(PAT, 1, 0.3));
  });
});
