import { describe, it, expect } from 'vitest';
import { parseEmblemDataUrl, MAX_EMBLEM_BYTES } from './emblemImage.js';

// תמונה חוקית קטנה (PNG 1x1 שקוף) — מספיקה לבדיקות הפענוח.
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('parseEmblemDataUrl — שער הכניסה של תמונת סמל שמועלית מהניהול', () => {
  it('מפענח data URL תקין ומחזיר mime + buffer', () => {
    const out = parseEmblemDataUrl(PNG_1x1);
    expect(out.mime).toBe('image/png');
    expect(Buffer.isBuffer(out.buffer)).toBe(true);
    expect(out.buffer.length).toBeGreaterThan(0);
    // חתימת PNG
    expect([...out.buffer.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])('מקבל %s', (mime) => {
    expect(parseEmblemDataUrl(`data:${mime};base64,AAAA`).mime).toBe(mime);
  });

  it('דוחה SVG — קובץ SVG מוגש מאותו origin ויכול להריץ סקריפט', () => {
    expect(() => parseEmblemDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toThrow(/svg|סוג/i);
  });

  it.each([null, undefined, '', 42, {}])('דוחה ערך שאינו מחרוזת data URL: %s', (v) => {
    expect(() => parseEmblemDataUrl(v)).toThrow();
  });

  it('דוחה כתובת רגילה (לא data URL) — הסמל נשמר ב-DB, לא נמשך מאתר חיצוני', () => {
    expect(() => parseEmblemDataUrl('https://example.com/emblem.png')).toThrow();
  });

  it('דוחה data URL שאינו base64', () => {
    expect(() => parseEmblemDataUrl('data:image/png,notbase64')).toThrow();
  });

  it('דוחה תמונה שחורגת מהתקרה', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(Math.ceil((MAX_EMBLEM_BYTES + 1024) / 3) * 4);
    expect(() => parseEmblemDataUrl(big)).toThrow(/גדול|large|תקרה/i);
  });

  it('התקרה סבירה לסמל: לא פחות מ-256KB ולא יותר מ-4MB', () => {
    expect(MAX_EMBLEM_BYTES).toBeGreaterThanOrEqual(256 * 1024);
    expect(MAX_EMBLEM_BYTES).toBeLessThanOrEqual(4 * 1024 * 1024);
  });
});
