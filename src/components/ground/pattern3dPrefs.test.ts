import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PATTERN3D_PREFS, MIN_WIN_H, MIN_WIN_W, SPLIT_MAX, SPLIT_MIN,
  clampSplitRatio, clampWinPos, clampWinSize, inlineDelta, isPattern3DMode,
  loadPattern3DPrefs, mergePattern3DPrefs, nextSplitRatio, savePattern3DPrefs,
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
