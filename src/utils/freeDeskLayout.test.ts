import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PAD_LAYOUT, PAD_SPLIT_MIN, PAD_SPLIT_MAX,
  normalizePadLayout, clampSplit, padPaneOrder, splitAfterDrag,
  loadPadLayout, savePadLayout,
} from './freeDeskLayout';
import { DEFAULT_DESK_BACKGROUND } from './deskBackground';

describe('normalizePadLayout - ערך שמור עלול להיות שבור או ישן', () => {
  it('ערך ריק / לא אובייקט → ברירת המחדל', () => {
    expect(normalizePadLayout(null)).toEqual(DEFAULT_PAD_LAYOUT);
    expect(normalizePadLayout('x')).toEqual(DEFAULT_PAD_LAYOUT);
    expect(normalizePadLayout(undefined)).toEqual(DEFAULT_PAD_LAYOUT);
  });

  it('ברירת המחדל: כתב יד, אחד מעל השני, מקלדת ראשונה, חצי-חצי, רקע חלק', () => {
    expect(DEFAULT_PAD_LAYOUT).toEqual({
      mode: 'handwriting', orientation: 'stacked', swapped: false, split: 0.45, bg: DEFAULT_DESK_BACKGROUND,
    });
  });

  it('שומר ערכים תקינים', () => {
    const raw = { mode: 'both', orientation: 'side', swapped: true, split: 0.3, bg: { kind: 'grid', size: 20, line: 'dashed' } };
    expect(normalizePadLayout(raw)).toEqual(raw);
  });

  it('שדה לא מוכר חוזר לברירת המחדל שלו בלבד', () => {
    const out = normalizePadLayout({ mode: 'xxx', orientation: 'diagonal', swapped: 'yes', split: 'a', bg: { kind: 'lines' } });
    expect(out.mode).toBe('handwriting');
    expect(out.orientation).toBe('stacked');
    expect(out.swapped).toBe(false);
    expect(out.split).toBe(0.45);
    expect(out.bg.kind).toBe('lines');
  });

  it('יחס הספליטר נחתך לגבולות - אף חלק לא נעלם', () => {
    expect(normalizePadLayout({ split: 0 }).split).toBe(PAD_SPLIT_MIN);
    expect(normalizePadLayout({ split: 1 }).split).toBe(PAD_SPLIT_MAX);
  });
});

describe('clampSplit', () => {
  it('נחתך לטווח, ו-NaN חוזר לברירת המחדל', () => {
    expect(clampSplit(0.5)).toBe(0.5);
    expect(clampSplit(-3)).toBe(PAD_SPLIT_MIN);
    expect(clampSplit(9)).toBe(PAD_SPLIT_MAX);
    expect(clampSplit(NaN)).toBe(0.45);
  });
});

describe('padPaneOrder - היפוך המקלדת וכתב היד', () => {
  it('בלי היפוך המקלדת ראשונה, עם היפוך כתב היד ראשון', () => {
    expect(padPaneOrder({ ...DEFAULT_PAD_LAYOUT, mode: 'both' })).toEqual(['text', 'ink']);
    expect(padPaneOrder({ ...DEFAULT_PAD_LAYOUT, mode: 'both', swapped: true })).toEqual(['ink', 'text']);
  });

  it('במצב יחיד יש חלק אחד בלבד', () => {
    expect(padPaneOrder({ ...DEFAULT_PAD_LAYOUT, mode: 'keyboard', swapped: true })).toEqual(['text']);
    expect(padPaneOrder({ ...DEFAULT_PAD_LAYOUT, mode: 'handwriting' })).toEqual(['ink']);
  });
});

describe('splitAfterDrag - גרירת הספליטר', () => {
  // split הוא תמיד החלק של **המקלדת**, בלי קשר למיקומה
  const base = { mode: 'both' as const, bg: DEFAULT_DESK_BACKGROUND, split: 0.5 };

  it('אחד מעל השני, מקלדת למעלה: גרירה למטה מגדילה את המקלדת', () => {
    expect(splitAfterDrag({ ...base, orientation: 'stacked', swapped: false }, 50, 500, 'rtl')).toBeCloseTo(0.6);
  });

  it('אחד מעל השני, מקלדת למטה: גרירה למטה מקטינה את המקלדת', () => {
    expect(splitAfterDrag({ ...base, orientation: 'stacked', swapped: true }, 50, 500, 'rtl')).toBeCloseTo(0.4);
  });

  it('זה לצד זה ב-LTR, מקלדת משמאל: גרירה ימינה מגדילה את המקלדת', () => {
    expect(splitAfterDrag({ ...base, orientation: 'side', swapped: false }, 50, 500, 'ltr')).toBeCloseTo(0.6);
  });

  it('זה לצד זה ב-RTL, מקלדת מימין: גרירה ימינה מקטינה את המקלדת', () => {
    expect(splitAfterDrag({ ...base, orientation: 'side', swapped: false }, 50, 500, 'rtl')).toBeCloseTo(0.4);
    expect(splitAfterDrag({ ...base, orientation: 'side', swapped: true }, 50, 500, 'rtl')).toBeCloseTo(0.6);
  });

  it('לא חורג מהגבולות, ושטח אפס לא משנה דבר', () => {
    expect(splitAfterDrag({ ...base, orientation: 'stacked', swapped: false }, 5000, 500, 'rtl')).toBe(PAD_SPLIT_MAX);
    expect(splitAfterDrag({ ...base, orientation: 'stacked', swapped: false }, 50, 0, 'rtl')).toBe(0.5);
  });
});

describe('שמירה פר-עמדה', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
  });

  it('נשמר ונטען לפי עמדה', () => {
    const l = { ...DEFAULT_PAD_LAYOUT, mode: 'both' as const, swapped: true };
    savePadLayout(7, l);
    expect(loadPadLayout(7)).toEqual(l);
    expect(loadPadLayout(8)).toEqual(DEFAULT_PAD_LAYOUT);
  });

  it('רקע שנשמר לפני הפריסה (המפתח הישן) לא הולך לאיבוד', () => {
    localStorage.setItem('skyking.freeDesk.bg_7', JSON.stringify({ kind: 'grid', size: 24, line: 'dotted' }));
    expect(loadPadLayout(7).bg).toEqual({ kind: 'grid', size: 24, line: 'dotted' });
  });
});
