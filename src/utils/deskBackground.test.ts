import { describe, it, expect } from 'vitest';
import {
  deskBackgroundStyle, dashPattern, normalizeDeskBackground, DEFAULT_DESK_BACKGROUND,
  DESK_BG_MIN_SIZE, DESK_BG_MAX_SIZE,
} from './deskBackground';

const decode = (style: ReturnType<typeof deskBackgroundStyle>) =>
  decodeURIComponent(String(style.backgroundImage).replace(/^url\("data:image\/svg\+xml,/, '').replace(/"\)$/, ''));

describe('deskBackground - רקע שורות/משבצות לדסק החופשי', () => {
  it('ללא רקע - אין backgroundImage (דף לבן כמו היום)', () => {
    expect(deskBackgroundStyle({ ...DEFAULT_DESK_BACKGROUND, kind: 'none' })).toEqual({});
  });

  it('שורות - אריח ברוחב ובגובה השורה, קו אופקי אחד בתחתית', () => {
    const st = deskBackgroundStyle({ kind: 'lines', size: 28, line: 'solid' });
    expect(st.backgroundSize).toBe('28px 28px');
    const svg = decode(st);
    expect(svg).toContain('y1="27.5"');
    expect(svg).not.toContain('x1="27.5"'); // אין קו אנכי בשורות
  });

  it('משבצות - קו אופקי וגם אנכי באותו גודל אריח', () => {
    const st = deskBackgroundStyle({ kind: 'grid', size: 40, line: 'solid' });
    expect(st.backgroundSize).toBe('40px 40px');
    const svg = decode(st);
    expect(svg).toContain('y1="39.5"');
    expect(svg).toContain('x1="39.5"');
  });

  it('רציף - בלי stroke-dasharray', () => {
    expect(decode(deskBackgroundStyle({ kind: 'grid', size: 30, line: 'solid' }))).not.toContain('stroke-dasharray');
  });

  it('מקווקו ומנוקד - stroke-dasharray שונה', () => {
    const dashed = decode(deskBackgroundStyle({ kind: 'lines', size: 32, line: 'dashed' }));
    const dotted = decode(deskBackgroundStyle({ kind: 'lines', size: 32, line: 'dotted' }));
    expect(dashed).toContain('stroke-dasharray');
    expect(dotted).toContain('stroke-dasharray');
    expect(dashed).not.toBe(dotted);
  });

  it('מחזור הקווקוו מחלק את גודל האריח בדיוק - הקו לא נשבר בתפר בין אריחים', () => {
    for (const size of [16, 23, 28, 37, 60]) {
      for (const line of ['dashed', 'dotted'] as const) {
        const [on, off] = dashPattern(line, size)!;
        const n = size / (on + off);
        expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-9);
      }
    }
    expect(dashPattern('solid', 30)).toBeNull();
  });

  it('נרמול - ערכים שבורים מ-localStorage חוזרים לברירת מחדל, גודל נחתך לטווח', () => {
    expect(normalizeDeskBackground(null)).toEqual(DEFAULT_DESK_BACKGROUND);
    expect(normalizeDeskBackground({ kind: 'bogus', size: 'x', line: 7 })).toEqual(DEFAULT_DESK_BACKGROUND);
    expect(normalizeDeskBackground({ kind: 'grid', size: 999, line: 'dotted' }))
      .toEqual({ kind: 'grid', size: DESK_BG_MAX_SIZE, line: 'dotted' });
    expect(normalizeDeskBackground({ kind: 'lines', size: 2, line: 'dashed' }).size).toBe(DESK_BG_MIN_SIZE);
  });
});
