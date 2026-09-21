import { describe, it, expect } from 'vitest';
import {
  isFrac, fracToPx, pxToFrac, shapeFromDrag, strokeLineWidth, DRAW_PALETTE, ERASER_WIDTH_FACTOR, eraserRadius,
  bitmapPx, syncCanvasBitmap,
  isPolyTool, polyShapeFromPoints, polyTapAction, polyPointsToPx, POLY_MIN_POINTS,
  dashArray, outlinePoints, crossMarks, LINE_STYLES, shapeAtPoint, eraseShapesAt, mergeRemoteShapes, type LineStyle, type MapShape,
  type PenStroke,
} from './mapDrawing';

const SIZE = { width: 800, height: 400 };

describe('mapDrawing - עיגון לציור המפה (שברים 0..1)', () => {
  it('pxToFrac ממיר פיקסלים לשבר של גודל הקנבס', () => {
    expect(pxToFrac({ x: 400, y: 100 }, SIZE)).toEqual({ x: 0.5, y: 0.25 });
  });

  it('קנבס בגודל 0 לא מייצר NaN', () => {
    expect(pxToFrac({ x: 40, y: 10 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('fracToPx הוא ההופכי של pxToFrac', () => {
    const p = { x: 123, y: 77 };
    expect(fracToPx(pxToFrac(p, SIZE), SIZE)).toEqual(p);
  });

  it('הציור נשאר מעוגן כשגודל הקנבס משתנה (חצי מפה = חצי מפה)', () => {
    const frac = pxToFrac({ x: 400, y: 200 }, SIZE);
    expect(fracToPx(frac, { width: 1600, height: 800 })).toEqual({ x: 800, y: 400 });
  });

  it('ערך legacy בפיקסלים (>1.5) נשאר כפי שהוא', () => {
    expect(isFrac(0.5)).toBe(true);
    expect(isFrac(1.5)).toBe(true);
    expect(isFrac(12)).toBe(false);
    expect(fracToPx({ x: 12, y: 30 }, SIZE)).toEqual({ x: 12, y: 30 });
  });
});

describe('mapDrawing - עובי קו', () => {
  const base: PenStroke = { id: 'a', points: [], color: '#fff', size: 3, eraser: false };
  it('עט מצייר בעובי שנבחר', () => {
    expect(strokeLineWidth(base)).toBe(3);
  });
  it('מחק רחב פי 10 מהעט - אחרת מחיקה בעט דקה מדי לתפעול', () => {
    expect(strokeLineWidth({ ...base, eraser: true })).toBe(30);
  });
});

// ── רגרסיה: הקו נראה עבה פי --s ─────────────────────────────────────────────
// ה-bitmap נבנה בגודל ה**פריסה** של המשטח, בעוד שהמשטח מוצג תחת
// `#root { zoom: var(--s) }` - כלומר גדול פי --s. הדפדפן מתח את ה-bitmap
// בהצגה, ועט 1.5 הפך ל-2.5 פיקסל מסך בעמדת 24" (נמדד בכרום: 600 פריסה מול
// 990 מסך). ה-bitmap חייב להיות בפיקסלי **מסך**.
describe('mapDrawing - גודל ה-bitmap מול הזום הגלובלי (--s)', () => {
  it('במסך 15.6" (--s=1) ה-bitmap הוא גודל הפריסה', () => {
    expect(bitmapPx(600, 1)).toBe(600);
  });

  it('במסך 24" (--s=1.65) ה-bitmap גדול פי הזום - פיקסל קנבס = פיקסל מסך', () => {
    expect(bitmapPx(600, 1.65)).toBe(990);
  });

  it('זום לא תקין (0 / NaN) נופל ל-1 ולא מאפס את הקנבס', () => {
    expect(bitmapPx(600, 0)).toBe(600);
    expect(bitmapPx(600, NaN)).toBe(600);
  });

  it('syncCanvasBitmap מחליף את ה-bitmap ומדווח שצריך לצייר מחדש', () => {
    const canvas = { width: 300, height: 150 } as HTMLCanvasElement;
    expect(syncCanvasBitmap(canvas, { width: 600, height: 400 }, 1.65)).toBe(true);
    expect([canvas.width, canvas.height]).toEqual([990, 660]);
  });

  it('גודל זהה - בלי החלפה, כי החלפת bitmap מנקה את הציור', () => {
    const canvas = { width: 990, height: 660 } as HTMLCanvasElement;
    expect(syncCanvasBitmap(canvas, { width: 600, height: 400 }, 1.65)).toBe(false);
  });

  it('משטח בגודל 0 (לפני פריסה) לא מאפס את ה-bitmap הקיים', () => {
    const canvas = { width: 990, height: 660 } as HTMLCanvasElement;
    expect(syncCanvasBitmap(canvas, { width: 0, height: 0 }, 1.65)).toBe(false);
    expect([canvas.width, canvas.height]).toEqual([990, 660]);
  });
});

describe('mapDrawing - יצירת צורה מגרירה', () => {
  const opts = { id: 's1', type: 'rect' as const, color: '#ef4444', filled: false, strokeWidth: 2 };

  it('גרירה זעירה (רעד עט) אינה יוצרת צורה', () => {
    expect(shapeFromDrag({ x: 10, y: 10 }, { x: 13, y: 12 }, 800, 400, opts)).toBeNull();
  });

  it('גרירה נשמרת כשברים של משטח הציור', () => {
    const s = shapeFromDrag({ x: 200, y: 100 }, { x: 600, y: 300 }, 800, 400, opts);
    expect(s).toMatchObject({ id: 's1', type: 'rect', x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });

  it('גרירה הפוכה (מלמטה-ימין למעלה-שמאל) מנורמלת', () => {
    const s = shapeFromDrag({ x: 600, y: 300 }, { x: 200, y: 100 }, 800, 400, opts);
    expect(s).toMatchObject({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });

  it('צורה דקה מקבלת מינימום 10px כדי שתישאר ניתנת לתפיסה', () => {
    const s = shapeFromDrag({ x: 100, y: 100 }, { x: 300, y: 102 }, 800, 400, opts);
    expect(s!.h).toBeCloseTo(10 / 400);
  });
});

describe('mapDrawing - פלטה', () => {
  it('הפלטה מכילה צבעים ייחודיים בלבד', () => {
    expect(new Set(DRAW_PALETTE).size).toBe(DRAW_PALETTE.length);
  });
});

describe('mapDrawing - פוליגון סגור ופתוח', () => {
  const opts = (type: 'polygon' | 'polyline') => ({ id: 'p1', type, color: '#ef4444', filled: false, strokeWidth: 2 });

  it('isPolyTool מזהה רק את שני כלי הפוליגון', () => {
    expect(isPolyTool('polygon')).toBe(true);
    expect(isPolyTool('polyline')).toBe(true);
    expect(isPolyTool('rect')).toBe(false);
    expect(isPolyTool('pen')).toBe(false);
  });

  it('מינימום נקודות: סגור 3, פתוח 2', () => {
    expect(POLY_MIN_POINTS.polygon).toBe(3);
    expect(POLY_MIN_POINTS.polyline).toBe(2);
  });

  it('פוליגון נשמר בשברים + מלבן תוחם', () => {
    const s = polyShapeFromPoints([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 300 }], 400, 400, opts('polygon'))!;
    expect(s.type).toBe('polygon');
    expect(s.points).toEqual([{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.5, y: 0.75 }]);
    expect({ x: s.x, y: s.y, w: s.w, h: s.h }).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });

  it('פוליגון סגור עם פחות מ-3 נקודות - null', () => {
    expect(polyShapeFromPoints([{ x: 0, y: 0 }, { x: 50, y: 50 }], 400, 400, opts('polygon'))).toBeNull();
  });

  it('פוליגון פתוח עם 2 נקודות - תקין, ועם 1 - null', () => {
    expect(polyShapeFromPoints([{ x: 0, y: 0 }, { x: 50, y: 50 }], 400, 400, opts('polyline'))?.type).toBe('polyline');
    expect(polyShapeFromPoints([{ x: 0, y: 0 }], 400, 400, opts('polyline'))).toBeNull();
  });

  it('נקודות כפולות (דקירה חוזרת באותו מקום) לא נספרות', () => {
    expect(polyShapeFromPoints([{ x: 0, y: 0 }, { x: 1, y: 1 }], 400, 400, opts('polyline'))).toBeNull();
  });

  it('פתוח לא מקבל מילוי גם אם נבחר', () => {
    expect(polyShapeFromPoints([{ x: 0, y: 0 }, { x: 50, y: 50 }], 400, 400, { ...opts('polyline'), filled: true })!.filled).toBe(false);
  });

  it('polyTapAction: נקודה חדשה רחוקה - add', () => {
    expect(polyTapAction([{ x: 0, y: 0 }], { x: 100, y: 0 }, 'polyline', 10)).toBe('add');
  });

  it('polyTapAction: דקירה על הנקודה האחרונה - finish (כשיש מספיק נקודות)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(polyTapAction(pts, { x: 103, y: 2 }, 'polyline', 10)).toBe('finish');
  });

  it('polyTapAction: דקירה על האחרונה בלי מספיק נקודות - ignore', () => {
    expect(polyTapAction([{ x: 0, y: 0 }], { x: 2, y: 2 }, 'polyline', 10)).toBe('ignore');
    expect(polyTapAction([{ x: 0, y: 0 }, { x: 100, y: 0 }], { x: 100, y: 2 }, 'polygon', 10)).toBe('ignore');
  });

  it('polyTapAction: בסגור - דקירה על הנקודה הראשונה סוגרת', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }];
    expect(polyTapAction(pts, { x: 3, y: 3 }, 'polygon', 10)).toBe('finish');
  });

  it('polyTapAction: בפתוח - דקירה על הראשונה היא נקודה רגילה', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }];
    expect(polyTapAction(pts, { x: 3, y: 3 }, 'polyline', 10)).toBe('add');
  });

  it('polyPointsToPx מחזיר מחרוזת points ל-SVG בגודל הנוכחי', () => {
    const s = polyShapeFromPoints([{ x: 100, y: 100 }, { x: 300, y: 100 }], 400, 400, opts('polyline'))!;
    expect(polyPointsToPx(s, { w: 800, h: 200 })).toBe('200,50 600,50');
  });
});

describe('mapDrawing - סגנון הקו', () => {
  it('רציף אינו מקווקו כלל', () => {
    expect(dashArray('solid', 2)).toBeUndefined();
  });

  it('קווים / נקודות / קו-נקודה מקבלים תבנית שגדלה עם עובי הקו', () => {
    for (const st of ['dashed', 'dotted', 'dashdot'] as LineStyle[]) {
      const thin = dashArray(st, 1), thick = dashArray(st, 4);
      expect(thin).toBeTruthy();
      expect(thick).not.toBe(thin);
    }
  });

  it('איקסים אינו נשען על מקוקוו - הוא סימנים על הקו', () => {
    expect(dashArray('cross', 2)).toBeUndefined();
    expect(LINE_STYLES).toEqual(['solid', 'dashed', 'dotted', 'dashdot', 'cross']);
  });

  it('קו המתאר: מלבן = 4 פינות סגורות, פוליגון פתוח = הנקודות כפי שהן', () => {
    const rect = outlinePoints({ id: 'r', type: 'rect', x: 0, y: 0, w: 0.5, h: 0.5, color: '#fff', filled: false, strokeWidth: 1 }, { w: 100, h: 100 });
    expect(rect.closed).toBe(true);
    expect(rect.points).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }]);
    const line = outlinePoints({ id: 'l', type: 'polyline', x: 0, y: 0, w: 1, h: 0, color: '#fff', filled: false, strokeWidth: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, { w: 100, h: 100 });
    expect(line.closed).toBe(false);
    expect(line.points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });

  it('קו המתאר של עיגול נדגם למצולע צפוף', () => {
    const el = outlinePoints({ id: 'c', type: 'circle', x: 0, y: 0, w: 1, h: 1, color: '#fff', filled: false, strokeWidth: 1 }, { w: 100, h: 100 });
    expect(el.closed).toBe(true);
    expect(el.points.length).toBeGreaterThan(24);
  });

  it('האיקסים יושבים על הקו, במרווחים קבועים ובזווית הקו', () => {
    const marks = crossMarks([{ x: 0, y: 0 }, { x: 100, y: 0 }], false, 25);
    expect(marks.length).toBe(3); // 25, 50, 75 - בלי הקצוות
    expect(marks[0]).toMatchObject({ x: 25, y: 0 });
    expect(marks.every(m => Math.abs(m.angle) < 1e-9)).toBe(true);
  });

  it('קו קצר מהמרווח מקבל איקס יחיד באמצע - אחרת הסגנון נעלם', () => {
    expect(crossMarks([{ x: 0, y: 0 }, { x: 10, y: 0 }], false, 25)).toEqual([{ x: 5, y: 0, angle: 0 }]);
  });

  it('בצורה סגורה גם הצלע החוזרת מקבלת איקסים', () => {
    const open = crossMarks([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], false, 50);
    const closed = crossMarks([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], true, 50);
    expect(closed.length).toBeGreaterThan(open.length);
  });
});

describe('mapDrawing - המחק מוחק צורה שלמה', () => {
  const SZ = { w: 200, h: 200 };
  const base = { color: '#ef4444', strokeWidth: 2, filled: false };
  const rect: MapShape = { ...base, id: 'r', type: 'rect', x: 0.25, y: 0.25, w: 0.25, h: 0.25 }; // 50,50 → 100,100
  const circle: MapShape = { ...base, id: 'c', type: 'circle', x: 0.5, y: 0.5, w: 0.5, h: 0.5 }; // מרכז 150,150 רדיוס 50
  const poly: MapShape = { ...base, id: 'p', type: 'polygon', x: 0, y: 0, w: 0.1, h: 0.1, points: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }] };
  const line: MapShape = { ...base, id: 'l', type: 'polyline', x: 0, y: 0.9, w: 1, h: 0, points: [{ x: 0, y: 0.9 }, { x: 1, y: 0.9 }] };

  it('נגיעה בקו המתאר מזהה את הצורה', () => {
    expect(shapeAtPoint([rect], { x: 50, y: 70 }, SZ, 4)?.id).toBe('r');       // הצלע השמאלית
    expect(shapeAtPoint([circle], { x: 200, y: 150 }, SZ, 4)?.id).toBe('c');   // ההיקף
    expect(shapeAtPoint([line], { x: 120, y: 180 }, SZ, 4)?.id).toBe('l');
  });

  it('צורה קווית לא נמחקת מלחיצה בחלל הריק שבתוכה', () => {
    expect(shapeAtPoint([rect], { x: 75, y: 75 }, SZ, 4)).toBeNull();
    expect(shapeAtPoint([circle], { x: 150, y: 150 }, SZ, 4)).toBeNull();
  });

  it('בצורה מלאה גם הפנים נמחק - שם אין "חלל ריק"', () => {
    expect(shapeAtPoint([{ ...rect, filled: true }], { x: 75, y: 75 }, SZ, 4)?.id).toBe('r');
    expect(shapeAtPoint([{ ...circle, filled: true }], { x: 150, y: 150 }, SZ, 4)?.id).toBe('c');
  });

  it('פוליגון סגור נתפס גם על הצלע החוזרת, ופתוח לא נסגר מעצמו', () => {
    expect(shapeAtPoint([poly], { x: 10, y: 10 }, SZ, 4)?.id).toBe('p');       // האלכסון מ-(20,20) ל-(0,0)
    const open: MapShape = { ...poly, id: 'o', type: 'polyline' };
    expect(shapeAtPoint([open], { x: 10, y: 10 }, SZ, 4)).toBeNull();
  });

  it('רחוק מכל צורה - null', () => {
    expect(shapeAtPoint([rect, circle, poly, line], { x: 5, y: 120 }, SZ, 4)).toBeNull();
  });

  it('כשצורות חופפות נמחקת העליונה (האחרונה שצוירה)', () => {
    const twin: MapShape = { ...rect, id: 'r2' };
    expect(shapeAtPoint([rect, twin], { x: 50, y: 70 }, SZ, 4)?.id).toBe('r2');
  });

  it('רדיוס המחק נלקח בחשבון - מחק עבה תופס מרחוק', () => {
    expect(shapeAtPoint([rect], { x: 58, y: 70 }, SZ, 3)).toBeNull();
    expect(shapeAtPoint([rect], { x: 58, y: 70 }, SZ, 12)?.id).toBe('r');
  });

  it('eraseShapesAt מסיר את הצורה שלמה ומחזיר את המזהה שהוסר', () => {
    const res = eraseShapesAt([rect, circle], { x: 50, y: 70 }, SZ, 4);
    expect(res.removedIds).toEqual(['r']);
    expect(res.shapes.map(s => s.id)).toEqual(['c']);
  });

  it('eraseShapesAt בלי פגיעה מחזיר את אותו מערך (בלי רינדור מיותר)', () => {
    const shapes = [rect, circle];
    const res = eraseShapesAt(shapes, { x: 5, y: 120 }, SZ, 4);
    expect(res.shapes).toBe(shapes);
    expect(res.removedIds).toEqual([]);
  });
});

describe('mapDrawing - מיזוג צורות בשיתוף עמדה', () => {
  const mk = (id: string): MapShape => ({ id, type: 'rect', x: 0, y: 0, w: 0.1, h: 0.1, color: '#fff', filled: false, strokeWidth: 1 });

  it('צורה חדשה מעמדה אחרת נוספת', () => {
    const merged = mergeRemoteShapes([mk('a')], [mk('a'), mk('b')], new Set(['a']));
    expect(merged.map(s => s.id)).toEqual(['a', 'b']);
  });

  it('צורה שנמחקה בעמדה אחרת נעלמת גם כאן', () => {
    const merged = mergeRemoteShapes([mk('a'), mk('b')], [mk('a')], new Set(['a', 'b']));
    expect(merged.map(s => s.id)).toEqual(['a']);
  });

  it('צורה שלי שטרם נשלחה לא נעלמת בגלל שהיא לא בשרת', () => {
    const merged = mergeRemoteShapes([mk('a'), mk('new')], [mk('a')], new Set(['a']));
    expect(merged.map(s => s.id)).toEqual(['a', 'new']);
  });

  it('בלי שינוי מוחזר אותו מערך', () => {
    const local = [mk('a')];
    expect(mergeRemoteShapes(local, [mk('a')], new Set(['a']))).toBe(local);
  });
});

describe('mapDrawing - סמן המחק = מה שהמחק מוחק', () => {
  const SZ = { w: 200, h: 200 };
  const line: MapShape = { id: 'l', type: 'polyline', x: 0, y: 0.5, w: 1, h: 0, color: '#fff', filled: false, strokeWidth: 1, points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }] };

  it('הרדיוס גדל עם העובי שנבחר', () => {
    expect(eraserRadius(4)).toBeGreaterThan(eraserRadius(1.5));
    expect(eraserRadius(2)).toBe(2 * ERASER_WIDTH_FACTOR / 2);
  });

  it('מה שבתוך הרדיוס נמחק, ומה שמחוצה לו לא - הטבעת אינה קישוט', () => {
    const r = eraserRadius(2);
    expect(shapeAtPoint([line], { x: 100, y: 100 - r + 0.5 }, SZ, r)?.id).toBe('l');
    expect(shapeAtPoint([line], { x: 100, y: 100 - r - 0.5 }, SZ, r)).toBeNull();
  });

  it('מחק דק מדי עדיין ניתן לכוון - רדיוס מינימלי', () => {
    expect(eraserRadius(0.1)).toBeGreaterThanOrEqual(4);
  });
});
