import { describe, it, expect } from 'vitest';
import { normalizeUiLanguage, buildUiConfig, resolveLock } from './uiLanguage.js';

describe('uiLanguage - נעילת שפת ממשק לפריסה', () => {
  it('נרמול ערך המשתנה', () => {
    expect(normalizeUiLanguage('en')).toBe('en');
    expect(normalizeUiLanguage(' EN ')).toBe('en');
    expect(normalizeUiLanguage('English')).toBe('en');
    expect(normalizeUiLanguage('he')).toBe('he');
    expect(normalizeUiLanguage('')).toBeNull();
    expect(normalizeUiLanguage(undefined)).toBeNull();
    expect(normalizeUiLanguage('fr')).toBeNull();
  });
  it('שרת מרכזי: הנעילה מהסביבה, סמכותי', () => {
    expect(buildUiConfig({ UI_LANGUAGE: 'en' })).toEqual({ uiLanguage: 'en', authoritative: true });
    expect(buildUiConfig({})).toEqual({ uiLanguage: null, authoritative: true });
  });
  it('מאגר מקומי בעמדה: לא סמכותי, גם אם המשתנה מוגדר', () => {
    expect(buildUiConfig({ UI_LANGUAGE: 'en' }, { localDb: true })).toEqual({ uiLanguage: null, authoritative: false });
  });
  it('הלקוח: תשובה לא סמכותית או פגומה = משאירים את הנעילה השמורה', () => {
    expect(resolveLock({ uiLanguage: null, authoritative: false })).toEqual({ action: 'keep' });
    expect(resolveLock(null)).toEqual({ action: 'keep' });
    expect(resolveLock('x')).toEqual({ action: 'keep' });
    expect(resolveLock({ uiLanguage: 'en' })).toEqual({ action: 'keep' });
  });
  it('הלקוח: תשובה סמכותית קובעת או מבטלת', () => {
    expect(resolveLock({ uiLanguage: 'en', authoritative: true })).toEqual({ action: 'set', lock: 'en' });
    expect(resolveLock({ uiLanguage: null, authoritative: true })).toEqual({ action: 'set', lock: null });
  });
});
