import { describe, it, expect, beforeEach } from 'vitest';
import { mergePrefs, loadPrefs, savePrefs, defaultBlendFor, DEFAULT_PREFS } from './prefs';

/**
 * הבדיקות רצות בסביבת node (אין jsdom בפרויקט - ראה vite.config.ts §test),
 * ולכן sessionStorage מסופק כאן כמימוש זיכרון מינימלי. זה גם מה שמוודא שהמודול
 * ניגש לאחסון דרך ה-API הסטנדרטי בלבד.
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

describe('העדפות המז"א', () => {
  beforeEach(() => { (globalThis as { sessionStorage?: Storage }).sessionStorage = memoryStorage(); });

  it('ברירת מחדל: כבוי, מכ"ם, בהירות שמשאירה את המפה קריאה', () => {
    expect(DEFAULT_PREFS.on).toBe(false);
    expect(DEFAULT_PREFS.overlay).toBe('radar');
    expect(DEFAULT_PREFS.opacity).toBeLessThan(1);
  });

  it('מיזוג ברירת המחדל לפי התמה - ocean היא תמה כהה', () => {
    // נמדד מול Windy אמיתי: רקע המפה שלו אפור בהיר, ולכן screen מלבין סדק כהה
    // ואינו יכול להיות ברירת המחדל שם. ראה prefs.ts §WeatherBlend.
    expect(defaultBlendFor('light')).toBe('multiply');
    expect(defaultBlendFor('dark')).toBe('normal');
    expect(defaultBlendFor('ocean')).toBe('normal');
    expect(mergePrefs(null, 'light').blend).toBe('multiply');
    expect(mergePrefs(null, 'dark').blend).toBe('normal');
  });

  it('שכבה שאינה בקטלוג נופלת למכ"ם ולא שוברת את התצוגה', () => {
    expect(mergePrefs({ overlay: 'evil' as never }).overlay).toBe('radar');
  });

  it('בהירות מחוץ לטווח נחסמת, וערך פגום נופל לברירת המחדל', () => {
    expect(mergePrefs({ opacity: 5 }).opacity).toBe(1);
    expect(mergePrefs({ opacity: 0 }).opacity).toBe(0.15);
    expect(mergePrefs({ opacity: NaN }).opacity).toBe(DEFAULT_PREFS.opacity);
  });

  it('מצב מיזוג לא חוקי נופל לברירת המחדל של התמה', () => {
    expect(mergePrefs({ blend: 'plasma' as never }, 'light').blend).toBe('multiply');
    expect(mergePrefs({ blend: 'normal' }).blend).toBe('normal');
  });

  it('שמירה וטעינה מהסשן משמרות את מה שהפקח בחר', () => {
    savePrefs(7, { ...DEFAULT_PREFS, on: true, overlay: 'gust', opacity: 0.8, blend: 'normal', menuOpen: false });
    const loaded = loadPrefs(7);
    expect(loaded).toEqual({ on: true, overlay: 'gust', opacity: 0.8, blend: 'normal', menuOpen: false });
  });

  it('עמדות שונות אינן דורסות זו את העדפות זו', () => {
    savePrefs(1, { ...DEFAULT_PREFS, overlay: 'temp' });
    savePrefs(2, { ...DEFAULT_PREFS, overlay: 'thunder' });
    expect(loadPrefs(1).overlay).toBe('temp');
    expect(loadPrefs(2).overlay).toBe('thunder');
  });

  it('JSON פגום בסשן לא מפיל את העמדה', () => {
    sessionStorage.setItem('skyking.weather.9', '{not json');
    expect(loadPrefs(9).overlay).toBe('radar');
  });
});
