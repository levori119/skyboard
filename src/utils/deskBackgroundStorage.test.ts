import { describe, it, expect, beforeEach } from 'vitest';
import { loadDeskBackground, saveDeskBackground, DEFAULT_DESK_BACKGROUND } from './deskBackground';

describe('deskBackground - שמירה פר-עמדה', () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
    };
  });

  it('ברירת מחדל - חלק', () => {
    expect(loadDeskBackground(7)).toEqual(DEFAULT_DESK_BACKGROUND);
    expect(DEFAULT_DESK_BACKGROUND.kind).toBe('none');
  });

  it('בחירה נשמרת לעמדה וחוזרת אחרי טעינה', () => {
    saveDeskBackground(7, { kind: 'grid', size: 40, line: 'dotted' });
    expect(loadDeskBackground(7)).toEqual({ kind: 'grid', size: 40, line: 'dotted' });
  });

  it('עמדה אחרת באותו דפדפן לא יורשת את הבחירה', () => {
    saveDeskBackground(7, { kind: 'lines', size: 30, line: 'solid' });
    expect(loadDeskBackground(8)).toEqual(DEFAULT_DESK_BACKGROUND);
  });

  it('ערך שבור חוזר לברירת המחדל', () => {
    store['skyking.freeDesk.bg_7'] = '{not json';
    expect(loadDeskBackground(7)).toEqual(DEFAULT_DESK_BACKGROUND);
  });

  it('localStorage חסום - לא נופל', () => {
    (globalThis as any).localStorage = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadDeskBackground(7)).toEqual(DEFAULT_DESK_BACKGROUND);
    expect(() => saveDeskBackground(7, DEFAULT_DESK_BACKGROUND)).not.toThrow();
  });
});
