import { describe, it, expect, beforeEach } from 'vitest';
import { markResetOnEntry, consumeResetOnEntry, resetButtonsState, _resetAnswered } from './stationResetOnEntry';

// מה שנבדק: "כניסה מאופסת" חלה פעם אחת (לא בכל רענון), ומאפסת את כפתורי האמצעים.
const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('consumeResetOnEntry', () => {
  it('הדגל נמחק מהאחסון - רענון (טעינת דף חדשה) לא מאפס שוב', () => {
    _resetAnswered();
    markResetOnEntry(26);
    expect(consumeResetOnEntry(26)).toBe(true);
    // אותה טעינה (StrictMode מריץ את ה-initializer פעמיים) - אותה תשובה
    expect(consumeResetOnEntry(26)).toBe(true);
    // טעינה חדשה
    _resetAnswered();
    expect(consumeResetOnEntry(26)).toBe(false);
  });
  it('לעמדה אחרת - לא חל', () => {
    _resetAnswered();
    markResetOnEntry(26);
    expect(consumeResetOnEntry(2)).toBe(false);
  });
});

describe('resetButtonsState', () => {
  it('כל כפתור חוזר למצב הראשון, טקסט חופשי מתרוקן', () => {
    const st = { buttons: [{ id: 'a', activeStateIdx: 2, allowFreeText: true, freeText: 'תפוס' }, { id: 'b', activeStateIdx: 0 }] };
    const r = resetButtonsState(st);
    expect(r.buttons.map((b: any) => b.activeStateIdx)).toEqual([0, 0]);
    expect(r.buttons[0].freeText).toBe('');
  });
  it('כבר מאופס - אותו אובייקט (בלי כתיבה מיותרת)', () => {
    const st = { buttons: [{ id: 'b', activeStateIdx: 0 }] };
    expect(resetButtonsState(st)).toBe(st);
  });
});
