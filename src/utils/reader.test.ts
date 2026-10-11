import { describe, it, expect } from 'vitest';
import {
  defaultReaderRect, clampReaderRect, bottomBarSlots, shapeReaderDoc, engineFor, docIcon,
  READER_DEFAULT_FRACTION, READER_MIN_W, READER_MIN_H,
  READER_SIZE_PRESETS, presetReaderRect, activeSizePreset, linkOpensInWindow,
} from './reader';

describe('defaultReaderRect - ב"מ 40% מגודל המסך', () => {
  it('40% מהרוחב ומהגובה, ממורכז', () => {
    const r = defaultReaderRect(2000, 1200);
    expect(r.w).toBe(2000 * READER_DEFAULT_FRACTION);
    expect(r.h).toBe(1200 * READER_DEFAULT_FRACTION);
    expect(r.x).toBe((2000 - r.w) / 2);
    expect(r.y).toBe((1200 - r.h) / 2);
  });

  it('חלון שני אינו מכסה את הראשון בדיוק', () => {
    const a = defaultReaderRect(2000, 1200, 0);
    const b = defaultReaderRect(2000, 1200, 1);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it('מסך קטן - החלון לא יורד מתחת למינימום הקריא', () => {
    const r = defaultReaderRect(600, 400);
    expect(r.w).toBeGreaterThanOrEqual(READER_MIN_W);
    expect(r.h).toBeGreaterThanOrEqual(READER_MIN_H);
  });

  it('חלון עשירי עדיין נשאר על המסך', () => {
    const r = defaultReaderRect(1600, 900, 10);
    expect(r.x).toBeLessThan(1600);
    expect(r.y).toBeLessThan(900);
  });
});

describe('clampReaderRect', () => {
  it('מחזיר חלון שנגרר החוצה', () => {
    const r = clampReaderRect({ x: -300, y: -80, w: 800, h: 500 }, 1600, 900);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });
  it('משאיר חלק מהחלון על המסך גם בגרירה ימינה/למטה', () => {
    const r = clampReaderRect({ x: 9999, y: 9999, w: 800, h: 500 }, 1600, 900);
    expect(r.x).toBeLessThan(1600);
    expect(r.y).toBeLessThan(900);
  });
  it('מעבר לעמדה עם מסך קטן יותר מכווץ את החלון ולא משאיר אותו גדול מהמסך', () => {
    const r = clampReaderRect({ x: 0, y: 0, w: 2400, h: 1400 }, 1280, 720);
    expect(r.w).toBeLessThanOrEqual(1280);
    expect(r.h).toBeLessThanOrEqual(720);
  });
  it('לא מקטין מתחת למינימום גם על מסך זעיר', () => {
    const r = clampReaderRect({ x: 0, y: 0, w: 10, h: 10 }, 200, 150);
    expect(r.w).toBe(READER_MIN_W);
    expect(r.h).toBe(READER_MIN_H);
  });
});

describe('bottomBarSlots - קריאה מהירה בשמאל, עמדות בימין', () => {
  it('שניהם מוצגים - הרצועה מתחלקת, והקריאה המהירה בשמאל הפיזי', () => {
    const s = bottomBarSlots(true, true);
    expect(s.quick.left).toBe('0');
    expect(s.quick.right).not.toBe('0');
    expect(s.stations.right).toBe('0');
    expect(s.stations.left).not.toBe('0');
  });
  it('רק קריאה מהירה - כל הרוחב', () => {
    const s = bottomBarSlots(true, false);
    expect(s.quick).toEqual({ left: '0', right: '0' });
  });
  it('רק עמדות - כל הרוחב, בדיוק כמו לפני הפיצ׳ר', () => {
    const s = bottomBarSlots(false, true);
    expect(s.stations).toEqual({ left: '0', right: '0' });
  });
  it('החלוקה אינה חופפת - הימני מתחיל היכן שהשמאלי נגמר', () => {
    const s = bottomBarSlots(true, true);
    expect(100 - Number(s.quick.right.replace('%', ''))).toBe(Number(s.stations.left.replace('%', '')));
  });
});

describe('shapeReaderDoc', () => {
  it('גוזר סוג וסיומת משורת שרת עם שמות snake_case', () => {
    const d = shapeReaderDoc({ id: '4', name: 'תדריך', url: 'https://d.local/a.pptx', has_file: true, convert_error: '' });
    expect(d.id).toBe(4);
    expect(d.ext).toBe('pptx');
    expect(d.kind).toBe('office');
    expect(d.hasFile).toBe(true);
    expect(d.hasPdf).toBe(false);
  });
  it('שדות חסרים אינם מפילים ואינם הופכים ל-undefined בממשק', () => {
    const d = shapeReaderDoc({ id: 1 });
    expect(d.name).toBe('');
    expect(d.kind).toBe('other');
    expect(d.convertError).toBe('');
  });
});

describe('engineFor + docIcon', () => {
  it('PDF שהועלה נפרס בחלון', () => {
    const d = shapeReaderDoc({ id: 1, file_name: 'a.pdf', has_file: true });
    expect(engineFor(d, 'pdf').engine).toBe('pdf');
    expect(docIcon(d.kind)).toBe('📕');
  });
  it('מצגת בכתובת כונן רשת - סימניות בלבד, והסיבה מוצגת למשתמש', () => {
    const d = shapeReaderDoc({ id: 2, url: '\\\\srv\\share\\a.pptx' });
    const r = engineFor(d, 'server');
    expect(r.engine).toBe('notes');
    expect(r.reason).toBe('unreachable');
  });
});

describe('גדלים קבועים לחלון - מלא, 2/3, חצי, 1/3', () => {
  const VW = 1800, VH = 1000;

  it('ארבעת הגדלים, בסדר יורד', () => {
    expect(READER_SIZE_PRESETS.map(p => p.key)).toEqual(['full', 'twoThirds', 'half', 'third']);
    expect(READER_SIZE_PRESETS.map(p => p.fraction)).toEqual([1, 2 / 3, 1 / 2, 1 / 3]);
  });

  it('מלא - כל המסך', () => {
    expect(presetReaderRect(1, { x: 300, y: 200, w: 500, h: 400 }, VW, VH)).toEqual({ x: 0, y: 0, w: VW, h: VH });
  });

  it('שבר מהרוחב ובגובה מלא', () => {
    const r = presetReaderRect(1 / 3, { x: 100, y: 200, w: 500, h: 400 }, VW, VH);
    expect(r.w).toBe(600);
    expect(r.h).toBe(VH);
    expect(r.y).toBe(0);
  });

  it('נצמד לצד שבו החלון כבר נמצא - שמאל', () => {
    expect(presetReaderRect(1 / 2, { x: 100, y: 0, w: 500, h: 400 }, VW, VH).x).toBe(0);
  });

  it('נצמד לצד שבו החלון כבר נמצא - ימין', () => {
    const r = presetReaderRect(2 / 3, { x: 1200, y: 0, w: 500, h: 400 }, VW, VH);
    expect(r.x + r.w).toBe(VW);
  });

  it('במסך צר לא יורד מתחת לרוחב המינימלי', () => {
    expect(presetReaderRect(1 / 3, { x: 0, y: 0, w: 500, h: 400 }, 600, 500).w).toBe(READER_MIN_W);
  });

  it('activeSizePreset מזהה גודל שנבחר, ו-null אחרי שינוי ידני', () => {
    const r = presetReaderRect(1 / 2, { x: 0, y: 0, w: 500, h: 400 }, VW, VH);
    expect(activeSizePreset(r, VW, VH)).toBe('half');
    expect(activeSizePreset({ ...r, w: r.w - 40 }, VW, VH)).toBeNull();
    expect(activeSizePreset({ ...r, h: 300 }, VW, VH)).toBeNull();
  });
});

describe('linkOpensInWindow - איפה נפתח קישור עמדה', () => {
  it('הגדרת "חלון קריאה" - כל קישור נפתח בחלון', () => {
    expect(linkOpensInWindow('window', { url: 'https://x/a.pdf', doc_id: null })).toBe(true);
  });

  it("הגדרה חיצונית - קישור כתובת נפתח בחוץ, כמו לפני הפיצ'ר", () => {
    expect(linkOpensInWindow('external', { url: 'https://x/a.pdf', doc_id: null })).toBe(false);
    expect(linkOpensInWindow('external', { url: 'https://x/a.pdf', doc_id: 4 })).toBe(false);
  });

  it('קישור שהוא קובץ בלבד (בלי כתובת) נפתח תמיד בחלון', () => {
    expect(linkOpensInWindow('external', { url: '', doc_id: 4 })).toBe(true);
  });

  it('קישור ריק לגמרי - אין מה לפתוח בחלון', () => {
    expect(linkOpensInWindow('external', { url: '', doc_id: null })).toBe(false);
  });
});
