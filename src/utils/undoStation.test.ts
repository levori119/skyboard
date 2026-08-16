// ביטול פעולה — הצד הלקוחי. סביבת node כמו שאר הבדיקות בפרויקט (אין jsdom):
// ה-DOM מדומה בדיוק במידה שהקוד נוגע בו, וזה גם מוודא שהוא לא נשען על יותר.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStationKey, shouldTagRequest, installStationFetchInterceptor, STATION_HEADER } from './undoStation';
import { isUndoHotkey, isEditableTarget } from '../components/shared/UndoManager';

const key = (e: Partial<KeyboardEvent>) => e as KeyboardEvent;

/** אלמנט מדומה — `isEditableTarget` נוגע רק בשלושת השדות האלה. */
const el = (tagName: string, isContentEditable = false) =>
  ({ tagName, isContentEditable, closest: () => null }) as unknown as EventTarget;

describe('מזהה העמדה', () => {
  it('יציב לאורך הסשן — ריענון דף לא מאבד את המחסנית', () => {
    const first = getStationKey();
    expect(first).toBeTruthy();
    expect(getStationKey()).toBe(first);
  });

  it('מתויגות רק קריאות API יחסיות', () => {
    expect(shouldTagRequest('/api/strips')).toBe(true);
    expect(shouldTagRequest('https://tiles.example.com/1.png')).toBe(false);
    expect(shouldTagRequest('/assets/logo.svg')).toBe(false);
  });

  it('היירוט מצרף את הכותרת לכל קריאת API, בלי לגעת ב-748 אתרי הקריאה', async () => {
    const seen: Headers[] = [];
    const base = vi.fn(async (_i: any, init?: any) => {
      seen.push(new Headers(init?.headers));
      return new Response('{}');
    });
    (globalThis as any).window = { fetch: base };

    installStationFetchInterceptor();
    await (globalThis as any).window.fetch('/api/strips', { method: 'POST' });
    await (globalThis as any).window.fetch('https://example.com/x');

    expect(seen).toHaveLength(2);
    expect(seen[0].get(STATION_HEADER)).toBe(getStationKey());
    expect(seen[1].get(STATION_HEADER)).toBeNull();
  });

  it('היירוט מותקן פעם אחת בלבד', () => {
    const w = (globalThis as any).window;
    const patched = w.fetch;
    installStationFetchInterceptor();
    expect(w.fetch).toBe(patched);
  });
});

describe('ההקשה CTRL+Z', () => {
  it('נתפסת', () => {
    expect(isUndoHotkey(key({ ctrlKey: true, key: 'z' }))).toBe(true);
    expect(isUndoHotkey(key({ metaKey: true, key: 'Z' }))).toBe(true);
  });

  it('CTRL+SHIFT+Z אינו ביטול — הוא חזרה קדימה, שאינה בהיקף', () => {
    expect(isUndoHotkey(key({ ctrlKey: true, shiftKey: true, key: 'z' }))).toBe(false);
  });

  it('Z לבד או עם ALT אינו ביטול', () => {
    expect(isUndoHotkey(key({ key: 'z' }))).toBe(false);
    expect(isUndoHotkey(key({ ctrlKey: true, altKey: true, key: 'z' }))).toBe(false);
  });

  it('מסך שכבר טיפל בהקשה גובר', () => {
    expect(isUndoHotkey(key({ ctrlKey: true, key: 'z', defaultPrevented: true }))).toBe(false);
  });
});

describe('פוקוס בשדה עריכה', () => {
  it('שדות טקסט שומרים את ה-undo של הדפדפן', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isEditableTarget(el(tag)), tag).toBe(true);
    }
  });

  it('אלמנט contentEditable נחשב עריכה', () => {
    expect(isEditableTarget(el('DIV', true))).toBe(true);
  });

  it('לחיצה על המסך עצמו אינה עריכה', () => {
    expect(isEditableTarget(el('DIV'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
