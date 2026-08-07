import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RUNWAY_WIDTH,
  MAX_RUNWAY_WIDTH,
  MIN_RUNWAY_WIDTH,
  aidLabels,
  derivedRunwayWidth,
  centerlineDashes,
  designatorFontSize,
  designatorText,
  runwayAxis,
  runwayQuad,
  thresholdBars,
} from './runwayShape';

// מסלול המראה מצויר כ**מסלול** ולא כקו: מלבן אספלט ברוחב אמיתי, ספי מסלול
// (פסנתר) בשני הקצוות, קו מרכז מקווקו, ומספר הכיוון בכל קצה.
// כמו בהקפות - החישוב במרחב איזוטרופי (אחוז מגובה התמונה), אחרת המלבן יוצא
// מעוות בתמונה שאינה ריבועית ורוחב המסלול משתנה עם הכיוון.

const RW = { start_x_pct: 50, start_y_pct: 70, end_x_pct: 50, end_y_pct: 30, heading_a: '33', heading_b: '15' };
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('runwayAxis', () => {
  it('מחזיר את שני הקצוות, האורך והכיוון', () => {
    const ax = runwayAxis(RW, 1)!;
    expect(ax.from).toEqual({ x: 50, y: 70 });
    expect(ax.to).toEqual({ x: 50, y: 30 });
    near(ax.length, 40);
    near(ax.bearing, 0); // מ-start ל-end = כלפי מעלה
  });

  it('מתקן יחס תמונה - אורך נמדד בפיקסלים, לא באחוזים', () => {
    const horiz = { start_x_pct: 10, start_y_pct: 50, end_x_pct: 30, end_y_pct: 50 };
    near(runwayAxis(horiz, 2)!.length, 40); // 20% רוחב * aspect 2
    near(runwayAxis(horiz, 2)!.bearing, 90);
  });

  it('בלי נ"צ אין ציר', () => {
    expect(runwayAxis({}, 1)).toBeNull();
    expect(runwayAxis({ start_x_pct: 5, start_y_pct: 5, end_x_pct: 5, end_y_pct: 5 }, 1)).toBeNull();
  });
});

describe('runwayQuad - מלבן האספלט', () => {
  it('ארבע פינות, רוחב אחיד סביב הציר', () => {
    const q = runwayQuad(RW, 1, 6)!;
    expect(q).toHaveLength(4);
    const xs = q.map(p => p.x).sort((a, b) => a - b);
    near(xs[0], 47); near(xs[3], 53); // רוחב 6 סביב x=50
    const ys = q.map(p => p.y).sort((a, b) => a - b);
    near(ys[0], 30); near(ys[3], 70);
  });

  it('רוחב המסלול נשמר בפיקסלים גם באלכסון ובתמונה לא ריבועית', () => {
    const diag = { start_x_pct: 20, start_y_pct: 20, end_x_pct: 60, end_y_pct: 60 };
    const q = runwayQuad(diag, 2, 8)!;
    // המרחק בין שתי הפינות שבאותו קצה = רוחב המסלול, במרחב iso
    const d = Math.hypot((q[0].x - q[3].x) * 2, q[0].y - q[3].y);
    near(d, 8);
  });

  it('הרוחב הנגזר צר דיו כדי שהמסלול לא יבלע את סביבתו', () => {
    // מסלול ארוך על רוב המפה - הרוחב נעצר בתקרה
    expect(derivedRunwayWidth(80)).toBe(MAX_RUNWAY_WIDTH);
    expect(MAX_RUNWAY_WIDTH).toBeLessThan(5);
    // מעל רצפת הקריאות - הרוחב קטן מעשירית האורך
    for (const len of [40, 60, 100]) expect(derivedRunwayWidth(len)).toBeLessThan(len / 10);
    // מתחתיה הרצפה גוברת **בכוונה**: מסלול קצר עדיין חייב לשאת את הסימונים
    expect(derivedRunwayWidth(20)).toBe(MIN_RUNWAY_WIDTH);
    expect(derivedRunwayWidth(5)).toBe(MIN_RUNWAY_WIDTH);
    expect(MIN_RUNWAY_WIDTH).toBeGreaterThan(1.5);
  });

  it('רוחב ברירת מחדל סביר ולא אפס', () => {
    expect(DEFAULT_RUNWAY_WIDTH).toBeGreaterThan(0);
    expect(runwayQuad(RW, 1, DEFAULT_RUNWAY_WIDTH)).toHaveLength(4);
  });

  it('בלי נ"צ אין מלבן', () => expect(runwayQuad({}, 1, 6)).toBeNull());
});

describe('thresholdBars - פסי הסף (פסנתר)', () => {
  it('פסים בשני הקצוות', () => {
    const bars = thresholdBars(RW, 1, 6, 4);
    expect(bars.length).toBeGreaterThan(0);
    const atStart = bars.filter(b => b.end === 'a');
    const atEnd = bars.filter(b => b.end === 'b');
    expect(atStart.length).toBe(atEnd.length);
    expect(atStart.length).toBeGreaterThanOrEqual(2);
  });

  it('כל פס הוא מרובע בתוך רוחב המסלול', () => {
    for (const b of thresholdBars(RW, 1, 6, 4)) {
      expect(b.points).toHaveLength(4);
      for (const p of b.points) {
        expect(p.x).toBeGreaterThanOrEqual(46.99);
        expect(p.x).toBeLessThanOrEqual(53.01);
      }
    }
  });

  it('מסלול קצר מאוד לא מייצר פסים חופפים', () => {
    const tiny = { start_x_pct: 50, start_y_pct: 50, end_x_pct: 50, end_y_pct: 51 };
    const bars = thresholdBars(tiny, 1, 6, 4);
    for (const b of bars) for (const p of b.points) {
      expect(p.y).toBeGreaterThanOrEqual(49.99);
      expect(p.y).toBeLessThanOrEqual(51.01);
    }
  });

  it('בלי נ"צ אין פסים', () => expect(thresholdBars({}, 1, 6, 4)).toEqual([]));
});

describe('centerlineDashes - קו המרכז המקווקו', () => {
  it('מקטעים לאורך הציר בלבד', () => {
    const dashes = centerlineDashes(RW, 1, 4, 2);
    expect(dashes.length).toBeGreaterThan(1);
    for (const d of dashes) { near(d.from.x, 50); near(d.to.x, 50); }
  });

  it('כל המקטעים בתוך אורך המסלול', () => {
    for (const d of centerlineDashes(RW, 1, 4, 2)) {
      for (const p of [d.from, d.to]) {
        expect(p.y).toBeGreaterThanOrEqual(29.99);
        expect(p.y).toBeLessThanOrEqual(70.01);
      }
    }
  });

  it('מסלול קצר מהמקטע הראשון אינו מייצר קווקוו חורג', () => {
    const tiny = { start_x_pct: 50, start_y_pct: 50, end_x_pct: 50, end_y_pct: 50.5 };
    for (const d of centerlineDashes(tiny, 1, 4, 2)) {
      expect(d.to.y).toBeLessThanOrEqual(50.51);
    }
  });

  it('בלי נ"צ אין קווקוו', () => expect(centerlineDashes({}, 1, 4, 2)).toEqual([]));
});

describe('designatorText - מספר הכיוון בכל קצה', () => {
  it('הקצה שממנו ממריאים נושא את שמו, והמספר קורא לכיוון הטיסה', () => {
    const d = designatorText(RW, 1)!;
    expect(d.a.text).toBe('33');
    expect(d.b.text).toBe('15');
    // הכיתוב בקצה A מסובב לכיוון הטיסה מ-A (כלפי מעלה = 0)
    near(d.a.rotation, 0);
    near(d.b.rotation, 180);
  });

  it('נופל לפירוק השם כשאין heading_a/heading_b', () => {
    const d = designatorText({ ...RW, heading_a: '', heading_b: '', name: '09/27' }, 1)!;
    expect(d.a.text).toBe('09');
    expect(d.b.text).toBe('27');
  });

  it('בלי שם כלל - בלי כיתוב', () => {
    expect(designatorText({ ...RW, heading_a: '', heading_b: '', name: '' }, 1)).toBeNull();
  });

  it('הכיתוב יושב בתוך המסלול, קרוב לקצה שלו', () => {
    const d = designatorText(RW, 1)!;
    expect(d.a.at.y).toBeLessThan(70);
    expect(d.a.at.y).toBeGreaterThan(60);
    expect(d.b.at.y).toBeGreaterThan(30);
    expect(d.b.at.y).toBeLessThan(40);
  });
});

describe('aidLabels - אמצעי הנחיתה בין הזברה למספר', () => {
  const W = derivedRunwayWidth(runwayAxis(RW, 1)!.length); // 2.6 - כמו בציור בפועל
  const barEndY = 70 - Math.min(W * 0.9, 40 / 4);          // סוף פסי הסף בקצה A
  const desY = designatorText(RW, 1)!.a.at.y;               // מספר הכיוון בקצה A

  it('סימון לכל אמצעי, מהזברה פנימה', () => {
    const labels = aidLabels(RW, 1, W, 'a', ['ILS', 'GS']);
    expect(labels).toHaveLength(2);
    // המסלול פונה כלפי מעלה: "פנימה" מקצה A = y יורד
    expect(labels[0].at.y).toBeGreaterThan(labels[1].at.y);
  });

  it('כל הסימונים בין סוף הזברה למספר הכיוון - לא דורסים אף אחד מהם', () => {
    for (const l of aidLabels(RW, 1, W, 'a', ['ILS', 'GS', 'TACAN'])) {
      expect(l.at.y).toBeLessThan(barEndY);
      expect(l.at.y).toBeGreaterThan(desY);
    }
  });

  it('מסובבים עם כיוון המסלול - בדיוק כמו המספר באותו קצה', () => {
    const d = designatorText(RW, 1)!;
    expect(aidLabels(RW, 1, W, 'a', ['ILS'])[0].rotation).toBeCloseTo(d.a.rotation, 6);
    expect(aidLabels(RW, 1, W, 'b', ['ILS'])[0].rotation).toBeCloseTo(d.b.rotation, 6);
  });

  it('קצה B מקבל תמונת ראי - מהסף שלו פנימה', () => {
    const b = aidLabels(RW, 1, W, 'b', ['ILS', 'GS']);
    expect(b[0].at.y).toBeLessThan(b[1].at.y);
    expect(b[0].at.y).toBeGreaterThan(30);
    expect(b[1].at.y).toBeLessThan(designatorText(RW, 1)!.b.at.y);
  });

  it('הכיתוב אינו חורג מרוחב המסלול ואינו גדול מהמספר', () => {
    const wide = aidLabels(RW, 1, W, 'a', ['TACAN'])[0];
    const narrow = aidLabels(RW, 1, W, 'a', ['GS'])[0];
    expect(wide.fontSize * 'TACAN'.length * 0.62).toBeLessThanOrEqual(W);
    expect(wide.fontSize).toBeLessThan(narrow.fontSize); // מילה ארוכה = טקסט קטן יותר
    expect(wide.fontSize).toBeGreaterThan(0);
    expect(narrow.fontSize).toBeLessThan(designatorFontSize(W));
  });

  it('אין מקום בין הזברה למספר - בלי סימון (עדיף כלום מאשר דריסה)', () => {
    const tiny = { start_x_pct: 50, start_y_pct: 50, end_x_pct: 50, end_y_pct: 60 };
    expect(aidLabels(tiny, 1, 6, 'a', ['ILS'])).toEqual([]);
  });

  it('בלי אמצעים ובלי נ"צ - בלי סימון', () => {
    expect(aidLabels(RW, 1, W, 'a', [])).toEqual([]);
    expect(aidLabels({}, 1, W, 'a', ['ILS'])).toEqual([]);
  });
});
