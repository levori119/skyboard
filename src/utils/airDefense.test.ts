import { describe, it, expect } from 'vitest';
import {
  AD_FULL_COVER_PCT,
  norm360,
  clampQualityPct,
  qualityBand,
  normalizeAltRange,
  altOverlap,
  apertureDeg,
  isDegenerateAperture,
  isFullCircle,
  validateSystemInput,
} from './airDefense';

// ── norm360 ────────────────────────────────────────────────────────────────
// כל השוואת אזימוט במערכת עוברת כאן. גזרה שחוצה את הצפון (350→020) היא המקרה
// שנשבר בשקט בלי הנרמול הזה - היתד היה נמשך 330 מעלות לצד הלא נכון.
describe('norm360', () => {
  it('משאיר אזימוט בטווח כמות שהוא', () => {
    expect(norm360(0)).toBe(0);
    expect(norm360(180)).toBe(180);
    expect(norm360(359.5)).toBe(359.5);
  });

  it('מנרמל 360 ומעלה חזרה לטווח', () => {
    expect(norm360(360)).toBe(0);
    expect(norm360(370)).toBe(10);
    expect(norm360(720 + 45)).toBe(45);
  });

  it('מנרמל אזימוט שלילי', () => {
    expect(norm360(-10)).toBe(350);
    expect(norm360(-360)).toBe(0);
    expect(norm360(-370)).toBe(350);
  });

  it('מחזיר null על קלט שאינו מספר', () => {
    expect(norm360(NaN)).toBeNull();
    expect(norm360(Infinity)).toBeNull();
    expect(norm360(null as unknown as number)).toBeNull();
    expect(norm360(undefined as unknown as number)).toBeNull();
  });
});

// ── איכות עמידה במשימה (אחוזים 0-100) ──────────────────────────────────────
describe('clampQualityPct', () => {
  it('מקבל מספר שלם בטווח', () => {
    expect(clampQualityPct(0)).toBe(0);
    expect(clampQualityPct(50)).toBe(50);
    expect(clampQualityPct(100)).toBe(100);
  });

  it('מעגל שבר למספר שלם', () => {
    expect(clampQualityPct(72.4)).toBe(72);
    expect(clampQualityPct(72.6)).toBe(73);
  });

  it('דוחה ערך מחוץ לטווח - ולא מהדק אותו בשקט', () => {
    expect(clampQualityPct(-1)).toBeNull();
    expect(clampQualityPct(101)).toBeNull();
  });

  it('דוחה קלט שאינו מספר', () => {
    expect(clampQualityPct('' as unknown as number)).toBeNull();
    expect(clampQualityPct('abc' as unknown as number)).toBeNull();
    expect(clampQualityPct(null as unknown as number)).toBeNull();
  });

  it('מקבל מחרוזת מספרית (קלט מטופס)', () => {
    expect(clampQualityPct('80' as unknown as number)).toBe(80);
  });
});

describe('qualityBand', () => {
  it('0 = לא מתמודד', () => {
    expect(qualityBand(0)).toBe('none');
  });

  it('מתחת לסף = התמודדות חלקית', () => {
    expect(qualityBand(1)).toBe('partial');
    expect(qualityBand(AD_FULL_COVER_PCT - 1)).toBe('partial');
  });

  it('מהסף ומעלה = מתמודד', () => {
    expect(qualityBand(AD_FULL_COVER_PCT)).toBe('full');
    expect(qualityBand(100)).toBe('full');
  });

  it('צמד שלא הוזן נחשב "לא מתמודד" ולא "לא ידוע"', () => {
    // ברירת המחדל הבטוחה: כיסוי שלא הוגדר במפורש אינו כיסוי (AIR_DEFENSE_SPEC §2.4)
    expect(qualityBand(null)).toBe('none');
    expect(qualityBand(undefined)).toBe('none');
  });
});

// ── טווח גובה (רום טיסה) ───────────────────────────────────────────────────
describe('normalizeAltRange', () => {
  it('שומר טווח תקין', () => {
    expect(normalizeAltRange(100, 200)).toEqual([100, 200]);
  });

  it('הופך טווח שהוזן במהופך', () => {
    expect(normalizeAltRange(200, 100)).toEqual([100, 200]);
  });

  it('גבול חסר נשאר חסר - "מ-200" הוא 200 ומעלה', () => {
    expect(normalizeAltRange(200, null)).toEqual([200, null]);
    expect(normalizeAltRange(null, 200)).toEqual([null, 200]);
    expect(normalizeAltRange(null, null)).toEqual([null, null]);
  });

  it('מחרוזת ריקה נחשבת חסרה', () => {
    expect(normalizeAltRange('' as unknown as number, '' as unknown as number)).toEqual([null, null]);
  });

  it('מעגל לשלם', () => {
    expect(normalizeAltRange(99.6, 200.2)).toEqual([100, 200]);
  });
});

describe('altOverlap', () => {
  it('חפיפה מלאה - האמצעי מכיל את האירוע', () => {
    expect(altOverlap([0, 400], [150, 300])).toEqual([150, 300]);
  });

  it('חפיפה חלקית מחזירה את מקטע החפיפה בלבד', () => {
    // מכ"ם 000-200 מול אירוע 150-300 (AIR_DEFENSE_SPEC §2.5)
    expect(altOverlap([0, 200], [150, 300])).toEqual([150, 200]);
  });

  it('אין חפיפה - null', () => {
    expect(altOverlap([0, 200], [250, 300])).toBeNull();
  });

  it('נגיעה בקצה נחשבת חפיפה', () => {
    expect(altOverlap([0, 200], [200, 300])).toEqual([200, 200]);
  });

  it('גבול פתוח = אינסוף לאותו כיוון', () => {
    expect(altOverlap([null, null], [150, 300])).toEqual([150, 300]);
    expect(altOverlap([200, null], [150, 300])).toEqual([200, 300]);
    expect(altOverlap([null, 200], [150, 300])).toEqual([150, 200]);
  });

  it('שני הטווחים פתוחים לגמרי', () => {
    expect(altOverlap([null, null], [null, null])).toEqual([null, null]);
  });
});

// ── מפתח זווית ─────────────────────────────────────────────────────────────
describe('isFullCircle', () => {
  it('שני הגבולות ריקים = 360', () => {
    expect(isFullCircle(null, null)).toBe(true);
  });

  it('גבול אחד בלבד אינו 360 - זו הגדרה חלקית', () => {
    expect(isFullCircle(10, null)).toBe(false);
    expect(isFullCircle(null, 10)).toBe(false);
  });

  it('שני גבולות = גזרה', () => {
    expect(isFullCircle(-30, 30)).toBe(false);
  });
});

describe('apertureDeg', () => {
  it('מפתח סימטרי סביב ה-PTL', () => {
    expect(apertureDeg(-30, 30)).toBe(60);
  });

  it('מפתח שחוצה את הצפון נמדד בכיוון השעון', () => {
    // 350 -> 020 = 30 מעלות, ולא 330
    expect(apertureDeg(350, 20)).toBe(30);
  });

  it('360 מחזיר null - אין למפתח משמעות במכ"ם מסתובב', () => {
    expect(apertureDeg(null, null)).toBeNull();
  });

  it('מפתח מנוון (מ = עד) הוא 0', () => {
    expect(apertureDeg(45, 45)).toBe(0);
  });
});

describe('isDegenerateAperture', () => {
  it('מ = עד הוא מנוון ונחסם', () => {
    expect(isDegenerateAperture(45, 45)).toBe(true);
    expect(isDegenerateAperture(0, 360)).toBe(true);
  });

  it('מפתח אמיתי אינו מנוון', () => {
    expect(isDegenerateAperture(-30, 30)).toBe(false);
    expect(isDegenerateAperture(350, 20)).toBe(false);
  });

  it('360 (שניהם ריקים) אינו מנוון - הוא מכ"ם מסתובב', () => {
    expect(isDegenerateAperture(null, null)).toBe(false);
  });
});

// ── ולידציית טופס הקטלוג ───────────────────────────────────────────────────
// הטופס חוסם **ומנמק**: פקד שנחסם בלי סיבה נראה למפעיל כמו תקלה.
describe('validateSystemInput', () => {
  const ok = { name: 'מכ"ם א', kind: 'ground', range_nm: 120, alt_min: 0, alt_max: 400 };

  it('קלט תקין עובר בלי שגיאות', () => {
    expect(validateSystemInput(ok)).toEqual([]);
  });

  it('שם ריק נחסם', () => {
    expect(validateSystemInput({ ...ok, name: '   ' })).toContain('nameRequired');
  });

  it('טווח שלילי או אפס נחסם', () => {
    expect(validateSystemInput({ ...ok, range_nm: 0 })).toContain('rangeInvalid');
    expect(validateSystemInput({ ...ok, range_nm: -5 })).toContain('rangeInvalid');
  });

  it('טווח ריק מותר - הוא ב"מ שנקבע בפריסה', () => {
    expect(validateSystemInput({ ...ok, range_nm: null })).toEqual([]);
  });

  it('רצפה מעל תקרה נחסמת', () => {
    expect(validateSystemInput({ ...ok, alt_min: 300, alt_max: 100 })).toContain('altRangeInvalid');
  });

  it('גובה שלילי נחסם', () => {
    expect(validateSystemInput({ ...ok, alt_min: -10 })).toContain('altRangeInvalid');
  });

  it('מפתח זווית מנוון נחסם', () => {
    const errs = validateSystemInput({ ...ok, detect_from_deg: 45, detect_to_deg: 45 });
    expect(errs).toContain('detectApertureDegenerate');
  });

  it('מפתח זווית עם גבול אחד בלבד נחסם - זו הגדרה חלקית ולא 360', () => {
    expect(validateSystemInput({ ...ok, track_from_deg: 10, track_to_deg: null }))
      .toContain('trackApertureIncomplete');
  });

  it('סוג שאינו קרקעי/אווירי נחסם', () => {
    expect(validateSystemInput({ ...ok, kind: 'sea' })).toContain('kindInvalid');
  });

  it('מצטבר: כמה שגיאות יחד', () => {
    const errs = validateSystemInput({ name: '', kind: 'x', range_nm: -1, alt_min: 500, alt_max: 100 });
    expect(errs).toEqual(expect.arrayContaining(['nameRequired', 'kindInvalid', 'rangeInvalid', 'altRangeInvalid']));
  });
});
