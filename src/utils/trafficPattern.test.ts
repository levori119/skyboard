import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GEOMETRY,
  LEG_KEYS,
  MIN_LEG,
  fitToMap,
  geometryFromRunway,
  mirrorGeometry,
  patternLegs,
  patternPathSegments,
  patternPoints,
  reciprocalIdent,
  resizeByCorner,
  runwayEnds,
  translateGeometry,
  type PatternGeometry,
} from './trafficPattern';

// ההקפה נשמרת כפרמטרים (עוגן/כיוון/צד/אורכי צלעות) ולא כרשימת נקודות חופשית,
// כדי ששכפול הפוך וסיבוב יישארו הקפה תקינה. הבדיקות כאן נועלות את החוזה הזה.

const G: PatternGeometry = {
  anchor: { x: 50, y: 60 },
  bearing: 0,
  side: 'left',
  rwyLen: 10,
  upwind: 5,
  width: 15,
  baseExt: 8,
};

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const nearPt = (p: { x: number; y: number }, x: number, y: number) => { near(p.x, x); near(p.y, y); };

describe('patternPoints', () => {
  it('מחזיר 6 נקודות: המראה → צולבת → עם הרוח → בסיס → פיינל', () => {
    expect(patternPoints(G, 1)).toHaveLength(6);
    expect(LEG_KEYS).toEqual(['upwind', 'crosswind', 'downwind', 'base', 'final']);
  });

  it('הקפת שמאל בכיוון 0 (צפונה) יושבת ממערב למסלול, והפיינל מסתיים בעוגן', () => {
    const p = patternPoints(G, 1);
    nearPt(p[0], 50, 50); // סוף המסלול - תחילת "אחרי המראה"
    nearPt(p[1], 50, 45); // סוף אחרי-המראה
    nearPt(p[2], 35, 45); // סוף צולבת
    nearPt(p[3], 35, 68); // סוף עם-הרוח
    nearPt(p[4], 50, 68); // סוף בסיס
    nearPt(p[5], 50, 60); // סוף פיינל = העוגן (סף המסלול)
  });

  it('הקפת ימין היא שיקוף לרוחב סביב ציר המסלול', () => {
    const p = patternPoints({ ...G, side: 'right' }, 1);
    nearPt(p[2], 65, 45);
    nearPt(p[3], 65, 68);
  });

  it('מתקן יחס תמונה: מרחק לרוחב באחוזי-רוחב קטן פי aspect', () => {
    const p = patternPoints(G, 2); // תמונה רחבה פי 2 מגובהה
    nearPt(p[2], 50 - 15 / 2, 45);
    nearPt(p[0], 50, 50); // לאורך ציר Y - ללא שינוי
  });

  it('סיבוב ב-90 מעלות מסובב סביב העוגן ולא מזיז אותו', () => {
    const p = patternPoints({ ...G, bearing: 90 }, 1);
    nearPt(p[5], 50, 60);
    nearPt(p[0], 60, 60); // המסלול מצביע מזרחה
    nearPt(p[2], 65, 45); // שמאל של טיסה מזרחה = צפון (למעלה במסך)
  });
});

describe('patternLegs', () => {
  it('חמש צלעות, כל אחת עם מפתח, קצוות ואמצע', () => {
    const legs = patternLegs(G, 1);
    expect(legs.map(l => l.key)).toEqual([...LEG_KEYS]);
    nearPt(legs[4].to, 50, 60);
    nearPt(legs[2].mid, 35, 56.5);
  });

  it('התווית מוזחת בניצב לצלע שלה, החוצה מגוף ההקפה', () => {
    const legs = patternLegs(G, 1);
    nearPt(legs[2].outward, -1, 0); // עם הרוח יורדת אנכית - התווית שמאלה, הרחק מהמרכז
    nearPt(legs[1].outward, 0, -1); // צולבת אופקית - התווית כלפי מעלה
    nearPt(legs[0].outward, 1, 0);  // אחרי המראה אנכית - התווית ימינה, לא כלפי הצולבת
  });

  it('הזחת התוויות מתקנת יחס תמונה', () => {
    const legs = patternLegs(G, 2);
    nearPt(legs[2].outward, -0.5, 0); // וקטור יחידה במרחב iso -> חצי באחוזי רוחב
  });

  it('אורך עם-הרוח = מסלול + אחרי המראה + פיינל', () => {
    const legs = patternLegs(G, 1);
    near(legs[2].length, G.rwyLen + G.upwind + G.baseExt);
    near(legs[0].length, G.upwind);
    near(legs[1].length, G.width);
    near(legs[3].length, G.width);
    near(legs[4].length, G.baseExt);
  });
});

describe('mirrorGeometry - שכפול הקפה הפוכה', () => {
  it('העוגן עובר לקצה השני, הכיוון מתהפך והצד מתחלף', () => {
    const m = mirrorGeometry(G, 1);
    nearPt(m.anchor, 50, 50);
    near(m.bearing, 180);
    expect(m.side).toBe('right');
    expect([m.rwyLen, m.upwind, m.width, m.baseExt]).toEqual([G.rwyLen, G.upwind, G.width, G.baseExt]);
  });

  it('ההקפה ההפוכה נשארת באותו צד פיזי של המסלול', () => {
    const orig = patternPoints(G, 1);
    const mir = patternPoints(mirrorGeometry(G, 1), 1);
    const origSide = Math.min(...orig.map(p => p.x));
    const mirSide = Math.min(...mir.map(p => p.x));
    near(origSide, mirSide); // שתיהן ממערב למסלול
  });

  it('היא שיקוף סביב אמצע המסלול', () => {
    const mid = 55; // אמצע בין y=60 ל-y=50
    const orig = patternPoints(G, 1);
    const mir = patternPoints(mirrorGeometry(G, 1), 1);
    for (const p of orig) {
      expect(mir.some(q => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - (2 * mid - p.y)) < 1e-6)).toBe(true);
    }
  });

  it('שיקוף פעמיים חוזר למקור', () => {
    const back = mirrorGeometry(mirrorGeometry(G, 1), 1);
    nearPt(back.anchor, G.anchor.x, G.anchor.y);
    near(back.bearing, G.bearing);
    expect(back.side).toBe(G.side);
  });

  it('עובד גם על תמונה לא ריבועית', () => {
    const m = mirrorGeometry(G, 2);
    nearPt(m.anchor, 50, 50);
  });
});

describe('reciprocalIdent - השם ההופכי', () => {
  it('33 → 15', () => expect(reciprocalIdent('33')).toBe('15'));
  it('15 → 33', () => expect(reciprocalIdent('15')).toBe('33'));
  it('01 → 19', () => expect(reciprocalIdent('01')).toBe('19'));
  it('18 → 36', () => expect(reciprocalIdent('18')).toBe('36'));
  it('36 → 18', () => expect(reciprocalIdent('36')).toBe('18'));
  it('מרפד לשתי ספרות', () => expect(reciprocalIdent('5')).toBe('23'));
  it('מחליף שמאל/ימין', () => {
    expect(reciprocalIdent('33L')).toBe('15R');
    expect(reciprocalIdent('15R')).toBe('33L');
    expect(reciprocalIdent('09C')).toBe('27C');
  });
  it('סובלני לרווחים ואותיות קטנות', () => expect(reciprocalIdent(' 09l ')).toBe('27R'));
  it('שם שאינו מסלול מחזיר ריק - שהמשתמש ימלא', () => {
    expect(reciprocalIdent('')).toBe('');
    expect(reciprocalIdent('אבג')).toBe('');
    expect(reciprocalIdent('99')).toBe('');
  });
});

describe('runwayEnds - קצוות המסלול לבחירה', () => {
  it('שני הקצוות מ-heading_a/heading_b', () => {
    expect(runwayEnds({ id: 7, name: '33/15', heading_a: '33', heading_b: '15' })).toEqual([
      { runway_id: 7, ident: '33', end: 'a' },
      { runway_id: 7, ident: '15', end: 'b' },
    ]);
  });

  it('נופל לפירוק השם כשאין heading', () => {
    expect(runwayEnds({ id: 3, name: '09/27' })).toEqual([
      { runway_id: 3, ident: '09', end: 'a' },
      { runway_id: 3, ident: '27', end: 'b' },
    ]);
  });

  it('מסלול עם קצה אחד בלבד', () => {
    expect(runwayEnds({ id: 4, name: '12' })).toEqual([{ runway_id: 4, ident: '12', end: 'a' }]);
  });

  it('מסלול בלי שם כלל אינו מייצר קצוות', () => {
    expect(runwayEnds({ id: 5, name: '' })).toEqual([]);
  });
});

describe('geometryFromRunway - הקפה מוצעת למסלול מצויר', () => {
  const rw = { start_x_pct: 50, start_y_pct: 60, end_x_pct: 50, end_y_pct: 40 };

  it('קצה A: העוגן בתחילת המסלול והכיוון אליו', () => {
    const g = geometryFromRunway(rw, 'a', 'left', 1)!;
    nearPt(g.anchor, 50, 60);
    near(g.bearing, 0);
    near(g.rwyLen, 20);
  });

  it('קצה B: העוגן בקצה הנגדי והכיוון הפוך', () => {
    const g = geometryFromRunway(rw, 'b', 'left', 1)!;
    nearPt(g.anchor, 50, 40);
    near(g.bearing, 180);
    near(g.rwyLen, 20);
  });

  it('מחשב כיוון נכון על תמונה לא ריבועית', () => {
    const diag = { start_x_pct: 0, start_y_pct: 10, end_x_pct: 10, end_y_pct: 10 };
    near(geometryFromRunway(diag, 'a', 'left', 2)!.bearing, 90); // מזרחה
    near(geometryFromRunway(diag, 'a', 'left', 2)!.rwyLen, 20); // 10% רוחב * aspect 2
  });

  it('בלי נ"צ למסלול - אין הצעה', () => {
    expect(geometryFromRunway({}, 'a', 'left', 1)).toBeNull();
    expect(geometryFromRunway({ start_x_pct: 5, start_y_pct: 5, end_x_pct: 5, end_y_pct: 5 }, 'a', 'left', 1)).toBeNull();
  });
});

describe('resizeByCorner - גרירת פינה מאריכה את הצלעות הצמודות', () => {
  it('פינה 1 מאריכה את "אחרי המראה" בלבד', () => {
    const g = resizeByCorner(G, 1, { x: 50, y: 40 }, 1);
    near(g.upwind, 10);
    expect([g.rwyLen, g.width, g.baseExt]).toEqual([G.rwyLen, G.width, G.baseExt]);
  });

  it('פינה 2 מאריכה גם את הצולבת', () => {
    const g = resizeByCorner(G, 2, { x: 30, y: 40 }, 1);
    near(g.upwind, 10);
    near(g.width, 20);
  });

  it('פינה 3 מאריכה את הפיינל ואת הרוחב', () => {
    const g = resizeByCorner(G, 3, { x: 30, y: 70 }, 1);
    near(g.baseExt, 10);
    near(g.width, 20);
    near(g.upwind, G.upwind);
  });

  it('פינה 4 מאריכה את הפיינל בלבד', () => {
    const g = resizeByCorner(G, 4, { x: 50, y: 75 }, 1);
    near(g.baseExt, 15);
    near(g.width, G.width);
  });

  it('פינה 0 קובעת את אורך קטע המסלול', () => {
    near(resizeByCorner(G, 0, { x: 50, y: 44 }, 1).rwyLen, 16);
  });

  it('גרירת פינה מעבר לציר המסלול מחליפה צד', () => {
    const g = resizeByCorner(G, 2, { x: 62, y: 45 }, 1);
    expect(g.side).toBe('right');
    near(g.width, 12);
  });

  it('אורך צלע לעולם אינו יורד מתחת למינימום', () => {
    const g = resizeByCorner(G, 4, { x: 50, y: 10 }, 1);
    expect(g.baseExt).toBeGreaterThan(0);
    expect(resizeByCorner(G, 2, { x: 50, y: 45 }, 1).width).toBeGreaterThan(0);
  });

  it('פינה 5 (העוגן) אינה משנה גדלים', () => {
    expect(resizeByCorner(G, 5, { x: 10, y: 10 }, 1)).toEqual(G);
  });
});

describe('translateGeometry', () => {
  it('מזיז את ההקפה כולה ומקבע אותה לגבולות המפה', () => {
    nearPt(translateGeometry(G, 5, -10).anchor, 55, 50);
    nearPt(translateGeometry(G, 999, 999).anchor, 100, 100);
    nearPt(translateGeometry(G, -999, -999).anchor, 0, 0);
  });
});

describe('patternPathSegments - מסלול ציור עם פינות מעוגלות', () => {
  it('מתחיל ב-M ומסיים בנקודת הפיינל', () => {
    const segs = patternPathSegments(G, 1, 2);
    expect(segs[0].cmd).toBe('M');
    nearPt(segs[0].to, 50, 50);
    nearPt(segs[segs.length - 1].to, 50, 60);
  });

  it('כל פינה פנימית הופכת לקשת (Q) בין שתי נקודות', () => {
    const segs = patternPathSegments(G, 1, 2);
    expect(segs.filter(s => s.cmd === 'Q')).toHaveLength(4); // 6 נקודות → 4 פינות פנימיות
  });

  it('רדיוס 0 משאיר קווים ישרים בלבד', () => {
    const segs = patternPathSegments(G, 1, 0);
    expect(segs.filter(s => s.cmd === 'Q')).toHaveLength(0);
    expect(segs).toHaveLength(6);
  });

  it('רדיוס גדול מהצלע נחתך ואינו חורג ממנה', () => {
    const segs = patternPathSegments(G, 1, 999);
    for (const s of segs) {
      expect(s.to.x).toBeGreaterThanOrEqual(34.99);
      expect(s.to.x).toBeLessThanOrEqual(50.01);
    }
  });
});

describe('fitToMap - ההקפה המוצעת חייבת להיראות בשלמותה', () => {
  const inside = (g: PatternGeometry, aspect: number) =>
    patternPoints(g, aspect).every(p => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100);

  it('הקפה שכבר בפנים אינה משתנה', () => {
    const small: PatternGeometry = { ...G, rwyLen: 4, upwind: 2, width: 4, baseExt: 2 };
    expect(fitToMap(small, 1)).toEqual(small);
  });

  it('מכווץ הקפה שגולשת עד שהיא נכנסת', () => {
    const big: PatternGeometry = { ...G, anchor: { x: 62, y: 80 }, bearing: 22, rwyLen: 47, upwind: 24, width: 38, baseExt: 24 };
    expect(inside(big, 4 / 3)).toBe(false);
    const fit = fitToMap(big, 4 / 3);
    expect(inside(fit, 4 / 3)).toBe(true);
  });

  it('מכווץ רק את הצלעות - עוגן, כיוון, צד ואורך המסלול נשמרים', () => {
    const big: PatternGeometry = { ...G, anchor: { x: 62, y: 80 }, bearing: 22, rwyLen: 47, upwind: 24, width: 38, baseExt: 24 };
    const fit = fitToMap(big, 4 / 3);
    expect(fit.anchor).toEqual(big.anchor);
    expect(fit.bearing).toBe(big.bearing);
    expect(fit.side).toBe(big.side);
    expect(fit.rwyLen).toBe(big.rwyLen);
    expect(fit.upwind).toBeLessThan(big.upwind);
    expect(fit.width).toBeLessThan(big.width);
  });

  it('שומר על יחסי הצלעות (כיווץ אחיד)', () => {
    const big: PatternGeometry = { ...G, anchor: { x: 5, y: 95 }, rwyLen: 30, upwind: 30, width: 60, baseExt: 15 };
    const fit = fitToMap(big, 1);
    expect(fit.width / fit.upwind).toBeCloseTo(big.width / big.upwind, 3);
    expect(fit.baseExt / fit.upwind).toBeCloseTo(big.baseExt / big.upwind, 3);
  });

  it('לעולם לא מכווץ מתחת למינימום, גם כשאין מקום כלל', () => {
    const g = fitToMap({ ...G, anchor: { x: 0, y: 0 }, bearing: 180, rwyLen: 99, upwind: 90, width: 90, baseExt: 90 }, 1);
    expect(g.upwind).toBeGreaterThanOrEqual(MIN_LEG);
    expect(g.width).toBeGreaterThanOrEqual(MIN_LEG);
    expect(g.baseExt).toBeGreaterThanOrEqual(MIN_LEG);
  });
});

describe('geometryFromRunway נכנס למפה', () => {
  it('מסלול ארוך על אלכסון המפה - ההקפה עדיין בתוך הגבולות', () => {
    const rw = { start_x_pct: 62, start_y_pct: 80, end_x_pct: 44, end_y_pct: 36 };
    const g = geometryFromRunway(rw, 'a', 'left', 4 / 3)!;
    for (const p of patternPoints(g, 4 / 3)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });

  it('גם הקפת ימין וגם קצה B נכנסות', () => {
    const rw = { start_x_pct: 20, start_y_pct: 15, end_x_pct: 85, end_y_pct: 90 };
    for (const [end, side] of [['a', 'left'], ['a', 'right'], ['b', 'left'], ['b', 'right']] as const) {
      const g = geometryFromRunway(rw, end, side, 1.6)!;
      for (const p of patternPoints(g, 1.6)) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(100);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('DEFAULT_GEOMETRY', () => {
  it('הקפה ברירת מחדל נראית על המפה גם בלי מסלול מצויר', () => {
    const pts = patternPoints(DEFAULT_GEOMETRY, 1);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });
});
