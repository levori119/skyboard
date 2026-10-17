import { describe, it, expect } from 'vitest';
import {
  defaultReaderRect, clampReaderRect, bottomBarSlots, shapeReaderDoc, engineFor, docIcon,
  READER_DEFAULT_FRACTION, READER_MIN_W, READER_MIN_H,
  READER_SIZE_PRESETS, presetReaderRect, activeSizePreset, linkOpensInWindow, fitRectToContent, CONTENT_PAD, mergeRefreshedDocs, canvasPixelScale, loadErrorKey,
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

  it('activeSizePreset מזהה גודל לפי הרוחב בלבד - הגובה נגזר מהעמוד', () => {
    const r = presetReaderRect(1 / 2, { x: 0, y: 0, w: 500, h: 400 }, VW, VH);
    expect(activeSizePreset(r, VW, VH)).toBe('half');
    expect(activeSizePreset({ ...r, h: 300 }, VW, VH)).toBe('half');
    expect(activeSizePreset({ ...r, w: r.w - 40 }, VW, VH)).toBeNull();
  });
});

describe('linkOpensInWindow - איפה נפתח קישור עמדה (עזר > עמדה > מערכת)', () => {
  const URL_LINK = { url: 'https://x/a.pdf', doc_id: null };
  const FILE_LINK = { url: '', doc_id: 4 };

  it('הגדרת מערכת "חלון קריאה" - קישור כתובת נפתח בחלון', () => {
    expect(linkOpensInWindow('window', '', URL_LINK)).toBe(true);
  });

  it("הגדרת מערכת חיצונית - קישור כתובת נפתח בחוץ, כמו לפני הפיצ'ר", () => {
    expect(linkOpensInWindow('external', '', URL_LINK)).toBe(false);
    expect(linkOpensInWindow('external', '', { url: 'https://x/a.pdf', doc_id: 4 })).toBe(false);
  });

  it('קובץ בלבד בלי הגדרה בעזר ובעמדה - בחלון (גם כשהמערכת חיצונית)', () => {
    expect(linkOpensInWindow('external', '', FILE_LINK)).toBe(true);
  });

  it('קובץ בלבד - הגדרת העמדה או העזר "חיצונית" מכובדת', () => {
    expect(linkOpensInWindow('window', 'external', FILE_LINK)).toBe(false);
    expect(linkOpensInWindow('window', '', { ...FILE_LINK, open_mode: 'external' })).toBe(false);
  });

  it('הגדרת העזר גוברת על העמדה', () => {
    expect(linkOpensInWindow('external', 'external', { ...URL_LINK, open_mode: 'window' })).toBe(true);
    expect(linkOpensInWindow('window', 'window', { ...URL_LINK, open_mode: 'external' })).toBe(false);
  });

  it('קישור ריק לגמרי - אין מה לפתוח בחלון', () => {
    expect(linkOpensInWindow('window', '', { url: '', doc_id: null })).toBe(false);
  });
});

describe('fitRectToContent - החלון בגודל העמוד המוצג, לא יותר', () => {
  // מסגרת החלון: 40 רוחב (גבולות + פאנל סגור), 60 גובה (כותרת + שורת ניווט)
  const CH = { chromeW: 40, chromeH: 60 };
  const VW = 1800, VH = 1000;

  it('מצגת לרוחב (16:9) - הגובה מתכווץ לגובה השקף, בלי שטח ריק', () => {
    const r = fitRectToContent({ x: 0, y: 0, w: 840, h: 1000 }, 9 / 16, CH, VW, VH);
    const contentW = 840 - 40 - CONTENT_PAD;
    expect(r.w).toBe(840);
    expect(r.h).toBe(Math.round(60 + contentW * 9 / 16 + CONTENT_PAD));
  });

  it('עמוד לאורך שלא נכנס בגובה - הרוחב מתכווץ, לא נשאר שטח ריק בצדדים', () => {
    const r = fitRectToContent({ x: 0, y: 0, w: 1800, h: 1000 }, 1.414, CH, VW, VH);
    expect(r.h).toBe(VH);
    const contentH = VH - 60 - CONTENT_PAD;
    expect(r.w).toBe(Math.round(contentH / 1.414 + 40 + CONTENT_PAD));
  });

  it('חלון שהיה בצד ימין נשאר צמוד לימין אחרי הכיווץ', () => {
    const r = fitRectToContent({ x: 0, y: 0, w: VW, h: VH }, 1.414, CH, VW, VH);
    expect(r.x).toBe(0);
    const right = fitRectToContent({ x: 900, y: 0, w: 900, h: VH }, 1.414, CH, VW, VH);
    expect(right.x + right.w).toBe(VW);
  });

  it('החלון לא יוצא מתחתית המסך אחרי שהגובה גדל', () => {
    const r = fitRectToContent({ x: 0, y: 700, w: 900, h: 200 }, 9 / 16, CH, VW, VH);
    expect(r.y + r.h).toBeLessThanOrEqual(VH);
  });

  it('יחס לא תקין (0 / NaN) - החלון לא משתנה', () => {
    const rect = { x: 10, y: 10, w: 600, h: 400 };
    expect(fitRectToContent(rect, 0, CH, VW, VH)).toEqual(rect);
    expect(fitRectToContent(rect, NaN, CH, VW, VH)).toEqual(rect);
  });
});

describe('mergeRefreshedDocs - רענון עמדה מרענן את החלונות הפתוחים', () => {
  const d = (id: number, extra: Record<string, unknown> = {}) => shapeReaderDoc({ id, name: `d${id}`, ...extra });

  it('מסמך שהשתנה בשרת (למשל הומר ל-PDF) מתעדכן בחלון', () => {
    const next = mergeRefreshedDocs([d(1), d(2)], new Map([[1, { id: 1, name: 'd1', has_pdf: true }], [2, { id: 2, name: 'חדש' }]]));
    expect(next.map(x => x.hasPdf)).toEqual([true, false]);
    expect(next[1].name).toBe('חדש');
  });

  it('מסמך שנמחק בשרת (null) - החלון שלו נסגר', () => {
    expect(mergeRefreshedDocs([d(1), d(2)], new Map([[1, null], [2, { id: 2 }]])).map(x => x.id)).toEqual([2]);
  });

  it('כשל משיכה (undefined = לא ידוע) - החלון נשאר כמו שהוא, לא נסגר', () => {
    const next = mergeRefreshedDocs([d(1, { has_pdf: true })], new Map());
    expect(next).toHaveLength(1);
    expect(next[0].hasPdf).toBe(true);
  });
});

describe('canvasPixelScale - טקסט חד בעמוד המצויר', () => {
  // ה-canvas צויר ברזולוציה של פיקסל CSS אחד, והמסך הגדיל אותו פי --s (עד 1.65
  // ב-24") ופי devicePixelRatio - ולכן הטקסט נראה מטושטש.
  it('מכפיל צפיפות מסך בהגדלת העמדה', () => {
    expect(canvasPixelScale(1, 1)).toBe(1);
    expect(canvasPixelScale(1, 1.65)).toBeCloseTo(1.65);
    expect(canvasPixelScale(2, 1.5)).toBe(3);
  });
  it('תחום: לא מתחת ל-1, ולא מעל 4 (זיכרון ה-canvas)', () => {
    expect(canvasPixelScale(0.5, 1)).toBe(1);
    expect(canvasPixelScale(3, 2)).toBe(4);
  });
  it('ערכים לא תקינים - 1', () => {
    expect(canvasPixelScale(NaN, 1)).toBe(1);
    expect(canvasPixelScale(0, 0)).toBe(1);
  });
});

describe('loadErrorKey - למה העזר לא נטען, במשפט שהפקח מבין', () => {
  // "טעינת העזר נכשלה (502)" אינו אומר לפקח דבר (2026-10-17)
  it('אין קשר לשרת המרכזי', () => {
    for (const c of ['502', '503', '504', '0', 'Failed to fetch', 'NetworkError when attempting to fetch resource.']) {
      expect(loadErrorKey(c)).toBe('reader.loadFailedNoServer');
    }
  });
  it('הקובץ לא נמצא', () => { expect(loadErrorKey('404')).toBe('reader.loadFailedMissing'); });
  it('אין הרשאה', () => { expect(loadErrorKey('401')).toBe('reader.loadFailedAuth'); expect(loadErrorKey('403')).toBe('reader.loadFailedAuth'); });
  it('כל השאר - ההודעה הכללית', () => { expect(loadErrorKey('Invalid PDF structure')).toBe('reader.loadFailed'); });
});
