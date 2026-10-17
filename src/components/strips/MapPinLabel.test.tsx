import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapPinLabel, isMapPinLabelMode, pinDisplayLabel, pinDisplayGlyph } from './MapPinLabel';
import { PIN_DISPLAY_MODES, isPinDisplay, normalizePinDisplay } from '../../../shared/pinDisplay';

// מה שנבדק: סגנונות התצוגה של פ"מ על המפה.
//   1. רשימת הסגנונות משותפת לשרת ולעמדה, וסגנון לא מוכר נופל לברירת המחדל.
//   2. "כתב רגיל" מציג את אותו תוכן של כתב היד - בלי גופן כתב יד ובלי הטיה.
//   3. תגית ובלוק נתונים מציגים או"ק, טייסת וגובה.
//   4. לכל סגנון יש שם ואייקון בבורר.

const parts = [{ text: 'בננה', ltr: false }, { text: '(2)', ltr: true }, { text: ' - ', ltr: false }, { text: '105', ltr: true }];
const props = { parts, callSign: 'בננה', sq: '105', alt: '445-455', color: '#a78bfa', conflict: false, zoom: 2, fontPx: 12, dir: 'rtl' as const };

describe('shared/pinDisplay', () => {
  it('הסגנונות החדשים ברשימה, וערך לא מוכר נופל לברירת המחדל', () => {
    for (const m of ['text', 'tag', 'block', 'handwrite', 'icon', 'small', 'strip']) expect(isPinDisplay(m)).toBe(true);
    expect(normalizePinDisplay('בלה', null)).toBeNull();
    expect(normalizePinDisplay(undefined, 'handwrite')).toBe('handwrite');
    expect(normalizePinDisplay('tag', 'handwrite')).toBe('tag');
  });

  it('לכל סגנון שם ואייקון', () => {
    for (const m of PIN_DISPLAY_MODES) {
      expect(pinDisplayLabel(m)).not.toMatch(/^ctrl\./);
      expect(pinDisplayGlyph(m)).not.toBe('');
    }
  });
});

describe('MapPinLabel', () => {
  it('רק text/tag/block מצוירים כאן', () => {
    expect(isMapPinLabelMode('text')).toBe(true);
    expect(isMapPinLabelMode('handwrite')).toBe(false);
  });

  it('כתב רגיל - תוכן כתב היד בגופן ישר', () => {
    const html = renderToStaticMarkup(<MapPinLabel mode="text" {...props} />);
    expect(html).toContain('data-pin-style="text"');
    expect(html).toContain('בננה');
    expect(html).toContain('(2)');
    expect(html).not.toContain('Segoe Print');
    expect(html).not.toContain('rotate');
    expect(html).not.toContain('italic');
  });

  it('תגית ובלוק - או"ק, טייסת וגובה', () => {
    for (const mode of ['tag', 'block'] as const) {
      const html = renderToStaticMarkup(<MapPinLabel mode={mode} {...props} />);
      expect(html).toContain(`data-pin-style="${mode}"`);
      expect(html).toContain('בננה');
      expect(html).toContain('105');
      expect(html).toContain('445-455');
    }
  });

  it('הגודל מתחלק בזום - קריא בכל רמת זום', () => {
    const z1 = renderToStaticMarkup(<MapPinLabel mode="tag" {...props} zoom={1} />);
    const z2 = renderToStaticMarkup(<MapPinLabel mode="tag" {...props} zoom={2} />);
    expect(z1).toContain('font-size:13px');
    expect(z2).toContain('font-size:8px'); // max(8, 13/2)
  });
});
