import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PATTERN3D_PREFS, MIN_WIN_H, MIN_WIN_W, SMALL_WIN_MARGIN, SPLIT_MAX, SPLIT_MIN,
  clampSplitRatio, clampWinPos, clampWinSize, inlineDelta, isPattern3DMode,
  loadPattern3DPrefs, mergePattern3DPrefs, nextSplitRatio, savePattern3DPrefs, smallWinInArea,
} from './pattern3dPrefs';

/**
 * הבדיקות רצות בסביבת node (אין jsdom - ראה vite.config.ts §test), ולכן
 * sessionStorage מסופק כאן כמימוש זיכרון מינימלי. זה גם מה שמוודא שהמודול ניגש
 * לאחסון דרך ה-API הסטנדרטי בלבד.
 */
const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
};

describe('העדפות ההקפה התלת מימדית - מצב תצוגה וגאומטריה', () => {
  beforeEach(() => { (globalThis as { sessionStorage?: Storage }).sessionStorage = memoryStorage(); });

  it('ברירת המחדל היא המצב הקיים (overlay) - פתיחת תלת מימד לא משנה התנהגות', () => {
    expect(DEFAULT_PATTERN3D_PREFS.mode).toBe('overlay');
    expect(mergePattern3DPrefs(null, null).mode).toBe('overlay');
  });

  it('מצב שאינו מוכר נופל ל-overlay ולא מותיר את הפקח עם מסך ריק', () => {
    expect(isPattern3DMode('window')).toBe(true);
    expect(isPattern3DMode('hologram')).toBe(false);
    expect(mergePattern3DPrefs(null, { mode: 'hologram' as never }).mode).toBe('overlay');
    expect(mergePattern3DPrefs(null, { mode: 'split' }).mode).toBe('split');
  });

  it('יחס הפיצול נחסם לטווח שמשאיר את שתי התצוגות שמישות', () => {
    expect(clampSplitRatio(0.5)).toBe(0.5);
    expect(clampSplitRatio(0.98)).toBe(SPLIT_MAX);
    expect(clampSplitRatio(0.01)).toBe(SPLIT_MIN);
    // ערך פגום = לחזור לברירת המחדל, לא להעלים אחת מהתצוגות
    expect(clampSplitRatio(NaN)).toBe(DEFAULT_PATTERN3D_PREFS.split.ratio);
    expect(clampSplitRatio('חצי')).toBe(DEFAULT_PATTERN3D_PREFS.split.ratio);
  });

  it('כיוון פיצול לא מוכר נופל לאופקי (זה לצד זה)', () => {
    expect(mergePattern3DPrefs(null, { split: { ratio: 0.5, orient: 'diagonal' as never } }).split.orient).toBe('h');
    expect(mergePattern3DPrefs(null, { split: { ratio: 0.5, orient: 'v' } }).split.orient).toBe('v');
  });

  it('גודל החלון לעולם אינו יורד מתחת למינימום שמשאיר את הסצנה קריאה', () => {
    expect(clampWinSize(10, 10)).toEqual({ w: MIN_WIN_W, h: MIN_WIN_H });
    expect(clampWinSize(600, 500)).toEqual({ w: 600, h: 500 });
    // חלון גדול ממסך העמדה - נחתך למסך, אחרת הידית ⇲ יוצאת מהתצוגה
    expect(clampWinSize(4000, 4000, 900, 700)).toEqual({ w: 900, h: 700 });
    // מסך קטן מהמינימום: המינימום מנצח - עדיף חלון שגולש על חלון בלתי קריא
    expect(clampWinSize(500, 400, 100, 100)).toEqual({ w: MIN_WIN_W, h: MIN_WIN_H });
    expect(clampWinSize(NaN, undefined)).toEqual({
      w: DEFAULT_PATTERN3D_PREFS.win.w, h: DEFAULT_PATTERN3D_PREFS.win.h,
    });
  });

  it('החלון אינו נגרר אל מחוץ למסך - תמיד נשאר ממנו מספיק כדי להחזיר אותו', () => {
    expect(clampWinPos(100, 80, 1000, 800)).toEqual({ x: 100, y: 80 });
    expect(clampWinPos(-50, -50, 1000, 800)).toEqual({ x: 0, y: 0 });
    const far = clampWinPos(5000, 5000, 1000, 800);
    expect(far.x).toBeLessThan(1000);
    expect(far.y).toBeLessThan(800);
    // מסך זעיר - לא לייצר טווח שלילי
    expect(clampWinPos(10, 10, 20, 20)).toEqual({ x: 0, y: 0 });
  });

  it('היסט פיזי מומר להיסט לוגי - בעברית (RTL) גרירה שמאלה מגדילה', () => {
    expect(inlineDelta(30, false)).toBe(30);
    expect(inlineDelta(30, true)).toBe(-30);
    expect(inlineDelta(-12, true)).toBe(12);
  });

  it('גרירת הספליטר מתורגמת ליחס - לפי גודל האזור, לא לפי פיקסלים גולמיים', () => {
    // חצי מהרוחב = חצי יחס
    expect(nextSplitRatio(0.5, 100, 1000)).toBeCloseTo(0.6, 6);
    expect(nextSplitRatio(0.5, -100, 1000)).toBeCloseTo(0.4, 6);
    // גרירה מעבר לקצה נחסמת ולא מעלימה תצוגה
    expect(nextSplitRatio(0.5, 5000, 1000)).toBe(SPLIT_MAX);
    expect(nextSplitRatio(0.5, -5000, 1000)).toBe(SPLIT_MIN);
    // אזור באורך אפס (עוד לא נמדד) - להשאיר את היחס כפי שהוא, לא לחלק באפס
    expect(nextSplitRatio(0.5, 100, 0)).toBe(0.5);
  });

  it('שמירה וטעינה מהסשן משמרות את המצב ואת הגאומטריה', () => {
    savePattern3DPrefs(7, {
      mode: 'window',
      win: { x: 120, y: 64, w: 640, h: 480 },
      split: { ratio: 0.35, orient: 'v' },
    });
    expect(loadPattern3DPrefs(7)).toEqual({
      mode: 'window',
      win: { x: 120, y: 64, w: 640, h: 480 },
      split: { ratio: 0.35, orient: 'v' },
    });
  });

  it('עמדות שונות אינן דורסות זו את הגאומטריה של זו', () => {
    savePattern3DPrefs(1, { ...DEFAULT_PATTERN3D_PREFS, mode: 'split' });
    savePattern3DPrefs(2, { ...DEFAULT_PATTERN3D_PREFS, mode: 'window' });
    expect(loadPattern3DPrefs(1).mode).toBe('split');
    expect(loadPattern3DPrefs(2).mode).toBe('window');
  });

  it('JSON פגום בסשן לא מפיל את העמדה', () => {
    sessionStorage.setItem('skyking.pattern3d.9', '{not json');
    expect(loadPattern3DPrefs(9)).toEqual(DEFAULT_PATTERN3D_PREFS);
  });

  it('ברירת מחדל של העמדה נדרסת על ידי מה שהפקח שינה בסשן', () => {
    const merged = mergePattern3DPrefs({ mode: 'split' }, { mode: 'window' });
    expect(merged.mode).toBe('window');
    // ומה שהפקח לא נגע בו נשאר של העמדה
    expect(mergePattern3DPrefs({ split: { ratio: 0.3, orient: 'v' } }, { mode: 'split' }).split)
      .toEqual({ ratio: 0.3, orient: 'v' });
  });

  it('מיקום חלון שטרם מוקם נשמר כ-null - החלון נפתח בפינת ברירת המחדל', () => {
    expect(DEFAULT_PATTERN3D_PREFS.win.x).toBeNull();
    expect(mergePattern3DPrefs(null, { win: { x: 'שמאל' as never, y: 5, w: 600, h: 400 } }).win.x).toBeNull();
    expect(mergePattern3DPrefs(null, { win: { x: 5, y: 5, w: 600, h: 400 } }).win.x).toBe(5);
  });
});

/**
 * "פותח תמיד מלא, וכשמקטינים - ברבע התחתון-שמאלי, כולו על המפה" (בקשת הפקח).
 * הרבע נמדד מול **שטח המפה** ולא מול החלון: החלון כולל סרגלים וטבלת פ"מים,
 * וחלון שמוקם ביחס אליו נוחת חלקית מחוץ למפה - בדיוק מה שהתבקש למנוע.
 */
describe('החלון הקטן נפתח ברבע התחתון-שמאלי של שטח המפה', () => {
  const AREA = { left: 100, top: 50, width: 1000, height: 600 };
  const VIEW = { w: 1400, h: 800 };
  const M = SMALL_WIN_MARGIN;
  /** הקצה השמאלי ה**פיזי** של החלון, בשתי השפות */
  const physLeft = (g: { x: number | null; w: number }, rtl: boolean) =>
    (rtl ? VIEW.w - (g.x! + g.w) : g.x!);

  it('רבע = חצי רוחב על חצי גובה של שטח המפה', () => {
    const g = smallWinInArea(AREA, VIEW, 1, false);
    expect(g.w).toBe(500);
    expect(g.h).toBe(300);
  });

  it('צמוד לתחתית ולשמאל הפיזיים של המפה, בשוליים קבועים', () => {
    const g = smallWinInArea(AREA, VIEW, 1, false);
    expect(g.x).toBe(AREA.left + M);
    expect(g.y).toBe(AREA.top + AREA.height - M - 300);
  });

  it('בעברית (RTL) העוגן הוא inline-start=ימין - ואותה פינה פיזית מתקבלת', () => {
    const g = smallWinInArea(AREA, VIEW, 1, true);
    expect(physLeft(g, true)).toBe(AREA.left + M);
    expect(g.y).toBe(smallWinInArea(AREA, VIEW, 1, false).y);
  });

  it('כולו בתוך שטח המפה - בשתי השפות', () => {
    for (const rtl of [false, true]) {
      const g = smallWinInArea(AREA, VIEW, 1, rtl);
      expect(physLeft(g, rtl)).toBeGreaterThanOrEqual(AREA.left);
      expect(physLeft(g, rtl) + g.w).toBeLessThanOrEqual(AREA.left + AREA.width);
      expect(g.y!).toBeGreaterThanOrEqual(AREA.top);
      expect(g.y! + g.h).toBeLessThanOrEqual(AREA.top + AREA.height);
    }
  });

  it('הכל ביחידות מוגדלות - מסך 24" (--s=1.65) לא פותח חלון פי 1.65', () => {
    // מסך 24" פיזי גדול יותר, ולכן שטח המפה גדול יותר בפיקסלים פיזיים
    const big = { left: 165, top: 82, width: 2000, height: 1400 };
    const g = smallWinInArea(big, { w: 2560, h: 1600 }, 1.65, false);
    expect(g.w).toBeCloseTo(2000 / 1.65 / 2, 5);
    expect(g.h).toBeCloseTo(1400 / 1.65 / 2, 5);
    expect(g.x).toBeCloseTo(165 / 1.65 + M, 5);
  });

  it('אזור מפה שגולש מתחת לקצה החלון - התחתית נמדדת לפי מה שנראה', () => {
    const tall = { left: 0, top: 0, width: 1000, height: 2000 };
    const g = smallWinInArea(tall, VIEW, 1, false);
    expect(g.h).toBe(400);
    expect(g.y! + g.h).toBeLessThanOrEqual(VIEW.h);
  });

  it('מפה קטנה מהחלון המינימלי - הקריאות גוברת, והחלון נצמד לפינה ולא יוצא ממנה', () => {
    const small = { left: 20, top: 20, width: 200, height: 150 };
    const g = smallWinInArea(small, VIEW, 1, false);
    expect(g.w).toBe(MIN_WIN_W);
    expect(g.h).toBe(MIN_WIN_H);
    expect(g.x).toBe(small.left);
    expect(g.y).toBe(small.top);
  });

  it('אזור מפה מנוון (טרם נמדד) לא מחזיר NaN', () => {
    const g = smallWinInArea({ left: 0, top: 0, width: 0, height: 0 }, VIEW, 1, false);
    expect(Number.isFinite(g.x!)).toBe(true);
    expect(Number.isFinite(g.y!)).toBe(true);
    expect(g.w).toBe(MIN_WIN_W);
    expect(g.h).toBe(MIN_WIN_H);
  });
});
