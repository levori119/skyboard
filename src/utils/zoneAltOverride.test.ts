import { describe, it, expect } from 'vitest';
import { applyAltOverrides, refitAltToBand, parseAltOverrides } from './zoneAltOverride';

const OLD = { alt_min: 150, alt_max: 400 };
const NEW = { alt_min: 200, alt_max: 400 };

describe('refitAltToBand - גובה הפ"מ אחרי שינוי טווח הבלוק', () => {
  it('הפ"מ היה בדיוק בטווח הישן - מקבל את הטווח החדש', () => {
    expect(refitAltToBand('150-400', OLD, NEW)).toBe('200-400');
  });
  it('גובה בודד בתוך הטווח החדש - בלי שינוי', () => {
    expect(refitAltToBand('300', OLD, NEW)).toBeNull();
  });
  it('גובה בודד מחוץ לטווח החדש - הגבול הקרוב', () => {
    expect(refitAltToBand('160', OLD, NEW)).toBe('200');
    expect(refitAltToBand('FL160', OLD, NEW)).toBe('200');
    expect(refitAltToBand('16000', OLD, NEW)).toBe('200');
  });
  it('טווח שחותך את החדש - החיתוך; שאינו נוגע - הטווח החדש', () => {
    expect(refitAltToBand('150-250', OLD, NEW)).toBe('200-250');
    expect(refitAltToBand('150-180', OLD, NEW)).toBe('200-400');
  });
  it('בלי גובה - הטווח החדש; טווח מורחב - גם הפ"מ שבטווח הישן מתרחב', () => {
    expect(refitAltToBand('', OLD, NEW)).toBe('200-400');
    expect(refitAltToBand('150-400', OLD, { alt_min: 100, alt_max: 400 })).toBe('100-400');
  });
  it('גבהים נמוכים נשמרים בשלוש ספרות', () => {
    expect(refitAltToBand('120', { alt_min: 60, alt_max: 140 }, { alt_min: 60, alt_max: 90 })).toBe('090');
  });
});

describe('applyAltOverrides - עקיפה מקומית לעמדה', () => {
  const byZone = { 7: [{ id: 1, alt_min: 150, alt_max: 400 }, { id: 2, alt_min: 100, alt_max: 140 }] };
  it('בלוק שנעקף מקבל את הטווח המקומי ומסומן; השאר כמו שהם', () => {
    const out = applyAltOverrides(byZone, { 1: { alt_min: 200, alt_max: 400 } });
    expect(out[7][0]).toMatchObject({ alt_min: 200, alt_max: 400, local_override: true });
    expect(out[7][1]).toEqual(byZone[7][1]);
  });
  it('בלי עקיפות - אותו אובייקט (בלי רינדור מיותר)', () => {
    expect(applyAltOverrides(byZone, {})).toBe(byZone);
  });
});

describe('parseAltOverrides', () => {
  it('עמיד לערך שבור', () => {
    expect(parseAltOverrides('{"1":{"alt_min":200,"alt_max":400},"x":{"alt_min":"a"}}')).toEqual({ 1: { alt_min: 200, alt_max: 400 } });
    expect(parseAltOverrides('nope')).toEqual({});
    expect(parseAltOverrides(null)).toEqual({});
  });
});
