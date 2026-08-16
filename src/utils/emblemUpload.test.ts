import { describe, it, expect } from 'vitest';
import {
  EMBLEM_MAX_PX,
  EMBLEM_ACCEPT,
  isAllowedEmblemFileType,
  fitWithin,
  dataUrlMime,
} from './emblemUpload';

describe('isAllowedEmblemFileType', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'IMAGE/PNG'])('מקבל %s', (t) => {
    expect(isAllowedEmblemFileType(t)).toBe(true);
  });

  it('דוחה SVG — מוגש מאותו origin ויכול להריץ סקריפט', () => {
    expect(isAllowedEmblemFileType('image/svg+xml')).toBe(false);
  });

  it.each(['application/pdf', 'text/plain', '', null, undefined])('דוחה %s', (t) => {
    expect(isAllowedEmblemFileType(t as string)).toBe(false);
  });

  it('accept של ה-input מכיל בדיוק את הסוגים המותרים ובלי svg', () => {
    expect(EMBLEM_ACCEPT).toBe('image/png,image/jpeg,image/webp,image/gif');
  });
});

describe('fitWithin — כיווץ לפני שמירה ב-DB', () => {
  it('מכווץ תמונה גדולה ושומר על היחס', () => {
    expect(fitWithin(1400, 700)).toEqual({ width: 350, height: 175 });
    expect(fitWithin(700, 1400)).toEqual({ width: 175, height: 350 });
  });

  it('ריבוע גדול יורד בדיוק לתקרה', () => {
    expect(fitWithin(2000, 2000)).toEqual({ width: EMBLEM_MAX_PX, height: EMBLEM_MAX_PX });
  });

  it('לא מגדיל תמונה שכבר קטנה מהתקרה', () => {
    expect(fitWithin(120, 90)).toEqual({ width: 120, height: 90 });
  });

  it('תמונה בדיוק בגודל התקרה נשארת כמות שהיא', () => {
    expect(fitWithin(350, 350)).toEqual({ width: 350, height: 350 });
  });

  it('לא מחזיר 0 בצד צר במיוחד', () => {
    expect(fitWithin(2000, 3).height).toBe(1);
  });

  it.each([[0, 100], [100, 0], [-5, 5], [NaN, 10]])('מידה לא חוקית (%s×%s) → 0', (w, h) => {
    expect(fitWithin(w, h)).toEqual({ width: 0, height: 0 });
  });

  it('התקרה זהה לגודל הסמלים המובנים (350px)', () => {
    expect(EMBLEM_MAX_PX).toBe(350);
  });
});

describe('dataUrlMime', () => {
  it('מוציא את הסוג מ-data URL', () => {
    expect(dataUrlMime('data:image/webp;base64,UklGR')).toBe('image/webp');
    expect(dataUrlMime('data:image/PNG;base64,iVBOR')).toBe('image/png');
  });

  it.each(['https://example.com/a.png', 'data:image/png,notbase64', '', null, undefined])(
    'מחזיר ריק על %s', (v) => {
      expect(dataUrlMime(v as string)).toBe('');
    });
});
