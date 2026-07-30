// מסך מלא בעליית עמדה (kiosk) — בדיקות לפני מימוש (TDD).
// אין jsdom בפרויקט, לכן ה-util מקבל אובייקט document-like ובודקים אותו ישירות.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KIOSK_FLAG_KEY, isKioskEnabled, isFullscreen, enterKioskFullscreen } from './kiosk';

// localStorage מזויף — סביבת הבדיקות היא node, אין אחסון אמיתי
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};

function fakeDoc(opts: { fullscreen?: boolean; req?: any; webkitReq?: any } = {}) {
  const el: any = {};
  if (opts.req !== undefined) el.requestFullscreen = opts.req;
  if (opts.webkitReq !== undefined) el.webkitRequestFullscreen = opts.webkitReq;
  return {
    fullscreenElement: opts.fullscreen ? el : null,
    documentElement: el,
  } as any;
}

beforeEach(() => { store.clear(); });

describe('isKioskEnabled — מתי מפעילים מסך מלא', () => {
  it('בפרודקשן — מופעל כברירת מחדל', () => {
    expect(isKioskEnabled(true)).toBe(true);
  });

  it('בפיתוח — כבוי כברירת מחדל (לא מפריע לעבודה/בדיקות)', () => {
    expect(isKioskEnabled(false)).toBe(false);
  });

  it("דגל 'off' מבטל גם בפרודקשן", () => {
    localStorage.setItem(KIOSK_FLAG_KEY, 'off');
    expect(isKioskEnabled(true)).toBe(false);
  });

  it("דגל 'on' מפעיל גם בפיתוח (לאימות מקומי)", () => {
    localStorage.setItem(KIOSK_FLAG_KEY, 'on');
    expect(isKioskEnabled(false)).toBe(true);
  });

  it('דגל לא מוכר — מתעלמים ונשארים לפי סוג הבנייה', () => {
    localStorage.setItem(KIOSK_FLAG_KEY, 'maybe');
    expect(isKioskEnabled(true)).toBe(true);
    expect(isKioskEnabled(false)).toBe(false);
  });
});

describe('isFullscreen — זיהוי מצב נוכחי', () => {
  it('לא במסך מלא', () => {
    expect(isFullscreen(fakeDoc())).toBe(false);
  });

  it('במסך מלא (תקן)', () => {
    expect(isFullscreen(fakeDoc({ fullscreen: true }))).toBe(true);
  });

  it('במסך מלא (webkit ישן)', () => {
    const doc: any = { webkitFullscreenElement: {}, documentElement: {} };
    expect(isFullscreen(doc)).toBe(true);
  });

  it('אין document (בדיקות/SSR) — false ולא קורס', () => {
    expect(isFullscreen(undefined)).toBe(false);
  });
});

describe('enterKioskFullscreen — עליית עמדה', () => {
  it('קורא ל-requestFullscreen על ה-root עם הסתרת ניווט', async () => {
    localStorage.setItem(KIOSK_FLAG_KEY, 'on');
    const req = vi.fn().mockResolvedValue(undefined);
    const doc = fakeDoc({ req });
    expect(await enterKioskFullscreen(doc)).toBe(true);
    expect(req).toHaveBeenCalledTimes(1);
    expect(req.mock.instances[0]).toBe(doc.documentElement); // דווקא ה-root: portals ל-body נשארים גלויים
    expect(req.mock.calls[0][0]).toEqual({ navigationUI: 'hide' });
  });

  it('כבוי (פיתוח) — לא נוגע במסך', async () => {
    const req = vi.fn();
    expect(await enterKioskFullscreen(fakeDoc({ req }))).toBe(false);
    expect(req).not.toHaveBeenCalled();
  });

  it('כבר במסך מלא — לא קורא שוב', async () => {
    localStorage.setItem(KIOSK_FLAG_KEY, 'on');
    const req = vi.fn();
    expect(await enterKioskFullscreen(fakeDoc({ fullscreen: true, req }))).toBe(true);
    expect(req).not.toHaveBeenCalled();
  });

  it('דפדפן דחה (אין user gesture) — לא זורק, מחזיר false', async () => {
    localStorage.setItem(KIOSK_FLAG_KEY, 'on');
    const req = vi.fn().mockRejectedValue(new Error('Permissions check failed'));
    expect(await enterKioskFullscreen(fakeDoc({ req }))).toBe(false);
  });

  it('דפדפן ישן — נופל ל-webkitRequestFullscreen', async () => {
    localStorage.setItem(KIOSK_FLAG_KEY, 'on');
    const webkitReq = vi.fn(); // מחזיר undefined, לא Promise
    expect(await enterKioskFullscreen(fakeDoc({ webkitReq }))).toBe(true);
    expect(webkitReq).toHaveBeenCalledTimes(1);
  });

  it('אין API מסך מלא כלל — false', async () => {
    localStorage.setItem(KIOSK_FLAG_KEY, 'on');
    expect(await enterKioskFullscreen(fakeDoc())).toBe(false);
  });

  it('אין document — false ולא קורס', async () => {
    localStorage.setItem(KIOSK_FLAG_KEY, 'on');
    expect(await enterKioskFullscreen(undefined)).toBe(false);
  });
});
