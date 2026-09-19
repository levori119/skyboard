/**
 * ציור על מפה - הלוגיקה הטהורה.
 *
 * **מעוגן למפה, לא למסך:** כל נקודה נשמרת כ**שבר** (0..1) מגודל משטח הציור,
 * ולכן הציור נשאר על אותו מקום במפה בשינוי גודל חלון, בזום/פאן של המפה, בסקייל
 * גודל המסך (`--s`) ובין עמדות ברזולוציות שונות. ערכים ישנים שנשמרו בפיקסלים
 * (> 1.5) ממשיכים לעבוד כפי שהם.
 *
 * הקובץ משותף לעמדת המפה (SectorDashboard) ולעמדת השדה (GroundView) - ראה
 * `src/components/map/MapDrawLayer.tsx` לרכיבי התצוגה.
 */

export type DrawTool = 'pen' | 'eraser' | 'circle' | 'rect' | 'polygon' | 'polyline' | 'recognize';

/** פוליגון סגור (האחרונה מתחברת לראשונה) או פתוח (קו שבור). */
export type PolyTool = 'polygon' | 'polyline';

export type PenStroke = {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  size: number;
  eraser: boolean;
};

export type MapShape = {
  id: string;
  type: 'circle' | 'rect' | PolyTool;
  /** בפוליגון - המלבן התוחם, כדי שקוד שמכיר רק x/y/w/h ימשיך לעבוד. */
  x: number; y: number; w: number; h: number;
  /** קודקודי הפוליגון בשברים (0..1). רק ב-polygon/polyline. */
  points?: { x: number; y: number }[];
  color: string;
  filled: boolean;
  strokeWidth: number;
};

/** גודל משטח הציור. `HTMLCanvasElement` מתאים לטיפוס הזה כמו שהוא. */
export type CanvasSize = { width: number; height: number };

/** צבעי העט המהירים. אלה צבעי **סימון של המשתמש** ולכן קבועים בכל תמה. */
export const DRAW_PALETTE = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#000000'];

/** המחק רחב פי כך מהעט - בעובי העט מחיקה בעט הייתה איטית מדי לתפעול. */
export const ERASER_WIDTH_FACTOR = 10;

/** צורה קטנה מזה = רעד עט, לא כוונה לצייר. */
const MIN_DRAG_PX = 5;
/** צורה דקה מזה נמתחת - אחרת אי אפשר לראות/לתפוס אותה. */
const MIN_SHAPE_PX = 10;

/** האם הערך שמור כשבר (0..1) ולא בפיקסלים legacy. */
export const isFrac = (v: number): boolean => Math.abs(v) <= 1.5;

export const fracToPx = (p: { x: number; y: number }, c: CanvasSize) => ({
  x: isFrac(p.x) ? p.x * c.width : p.x,
  y: isFrac(p.y) ? p.y * c.height : p.y,
});

export const pxToFrac = (p: { x: number; y: number }, c: CanvasSize) => ({
  x: c.width ? p.x / c.width : 0,
  y: c.height ? p.y / c.height : 0,
});

/**
 * גודל ה-bitmap של קנבס הציור, ב**פיקסלי מסך**.
 *
 * הקנבס נמתח ל-`width:100%` של משטח שיושב תחת `#root { zoom: var(--s) }`, ולכן
 * גודל ה**פריסה** שלו (`clientWidth`) קטן פי `--s` מגודלו **על המסך**. bitmap
 * בגודל הפריסה נמתח בהצגה פי --s, וכל קו נראה עבה פי --s ומטושטש: עט 1.5 הפך
 * ל-2.5 פיקסל מסך בעמדת 24" (נמדד בכרום - 600 פריסה מול 990 מסך).
 *
 * לכן ה-bitmap נבנה בפיקסלי **מסך**: פיקסל בקנבס = פיקסל על הזכוכית, ועובי העט
 * זהה בכל גדלי המסך ובכל העמדות. ה**מיקום** אינו מושפע - הנקודות נשמרות כשברים
 * (0..1), וההמרה מהמצביע מחלקת ב-`getBoundingClientRect` בפועל.
 *
 * שכבת ה**צורות** (SVG ב-`width:100%`) לעומת זאת מפרשת קואורדינטות בפיקסלי
 * **פריסה**, ולכן היא ממשיכה לקבל את `clientWidth` כמו שהוא.
 */
export const bitmapPx = (layoutPx: number, screenZoom: number): number =>
  Math.max(0, Math.round(layoutPx * (screenZoom > 0 ? screenZoom : 1)));

/**
 * מסנכרן את ה-bitmap של הקנבס לגודל המשטח **בפיקסלי מסך** (ראה `bitmapPx`).
 * מחזיר `true` אם ה-bitmap הוחלף - החלפה מנקה את הקנבס, ואז חובה לצייר מחדש
 * מהשברים (`redrawStrokes`). משטח בגודל 0 (לפני פריסה) לא נוגע ב-bitmap קיים.
 */
export function syncCanvasBitmap(canvas: HTMLCanvasElement, layout: CanvasSize, screenZoom: number): boolean {
  const w = bitmapPx(layout.width, screenZoom), h = bitmapPx(layout.height, screenZoom);
  if (!w || !h || (canvas.width === w && canvas.height === h)) return false;
  canvas.width = w; canvas.height = h;
  return true;
}

/** עובי הקו בפועל - המחק רחב מהעט (ראה ERASER_WIDTH_FACTOR). */
export const strokeLineWidth = (st: { size: number; eraser: boolean }): number =>
  st.eraser ? st.size * ERASER_WIDTH_FACTOR : st.size;

/** מחיל על ה-context את סגנון הקו של המשיכה (כולל מצב מחיקה). */
export function applyStrokeStyle(ctx: CanvasRenderingContext2D, st: { color: string; size: number; eraser: boolean }): void {
  ctx.globalCompositeOperation = st.eraser ? 'destination-out' : 'source-over';
  ctx.strokeStyle = st.eraser ? 'rgba(0,0,0,1)' : st.color;
  ctx.lineWidth = strokeLineWidth(st);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** מצייר משיכה שמורה (בשברים) על הקנבס בגודלו הנוכחי. */
export function drawStrokeFrac(ctx: CanvasRenderingContext2D, st: PenStroke, c: CanvasSize): void {
  if (!st.points || st.points.length < 2) return;
  ctx.beginPath();
  applyStrokeStyle(ctx, st);
  const p0 = fracToPx(st.points[0], c);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < st.points.length; i++) {
    const p = fracToPx(st.points[i], c);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

/** מנקה ומצייר מחדש את כל המשיכות מהשברים - כך הן נשארות מעוגנות אחרי סיזור. */
export function redrawStrokes(canvas: HTMLCanvasElement | null, strokes: PenStroke[]): void {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const st of strokes) drawStrokeFrac(ctx, st, canvas);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * צורה (עיגול/מלבן) מגרירה אחת, בקואורדינטות **תוכן** המפה.
 * `W`/`H` הם גודל משטח הציור; התוצאה נשמרת בשברים ולכן נשארת מעוגנת ופרופורציונית.
 * גרירה זעירה מחזירה `null` - לחיצה בטעות לא מייצרת צורה.
 */
export function shapeFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  W: number,
  H: number,
  opts: { id: string; type: 'circle' | 'rect'; color: string; filled: boolean; strokeWidth: number },
): MapShape | null {
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  if (w <= MIN_DRAG_PX && h <= MIN_DRAG_PX) return null;
  const sw = W || 1, sh = H || 1;
  return {
    ...opts,
    x: Math.min(start.x, end.x) / sw,
    y: Math.min(start.y, end.y) / sh,
    w: Math.max(w, MIN_SHAPE_PX) / sw,
    h: Math.max(h, MIN_SHAPE_PX) / sh,
  };
}

/** שבר → פיקסלים לרינדור הצורות (ערכי legacy בפיקסלים נשארים כפי שהם). */
export const shapeToPx = (s: MapShape, size: { w: number; h: number }) => ({
  x: isFrac(s.x) ? s.x * size.w : s.x,
  y: isFrac(s.y) ? s.y * size.h : s.y,
  w: isFrac(s.w) ? s.w * size.w : s.w,
  h: isFrac(s.h) ? s.h * size.h : s.h,
});

// ─────────────────────────────────────────────────────────────────────────────
// פוליגון סגור / פתוח - דוקרים נקודות, והן מתחברות בקו
// ─────────────────────────────────────────────────────────────────────────────

export const isPolyTool = (t: string): t is PolyTool => t === 'polygon' || t === 'polyline';

/** פחות מזה אין צורה: סגור צריך משולש, פתוח צריך קטע. */
export const POLY_MIN_POINTS: Record<PolyTool, number> = { polygon: 3, polyline: 2 };

/** מרחק הדקירה (בפיקסלי מסך) שנחשב "על" נקודה קיימת - מותאם לעט ולאצבע. */
export const POLY_SNAP_SCREEN_PX = 14;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** מסיר נקודות צמודות (רעד / דקירה כפולה) - הן לא מוסיפות צלע. */
const dedupe = (pts: { x: number; y: number }[]) =>
  pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > MIN_DRAG_PX);

/**
 * מה עושה דקירה בזמן ציור פוליגון:
 * - על הנקודה האחרונה (דקירה כפולה) → `finish`
 * - בסגור, על הנקודה הראשונה → `finish` (סוגר את הצורה)
 * - כשאין עדיין מספיק נקודות לסיום → `ignore`
 * - אחרת → `add`
 */
export function polyTapAction(
  points: { x: number; y: number }[],
  p: { x: number; y: number },
  type: PolyTool,
  tol: number,
): 'add' | 'finish' | 'ignore' {
  if (!points.length) return 'add';
  const enough = points.length >= POLY_MIN_POINTS[type];
  if (dist(p, points[points.length - 1]) <= tol) return enough ? 'finish' : 'ignore';
  if (type === 'polygon' && points.length >= 3 && dist(p, points[0]) <= tol) return 'finish';
  return 'add';
}

/** פוליגון מנקודות בפיקסלי תוכן. `null` אם אין מספיק נקודות שונות. */
export function polyShapeFromPoints(
  pointsPx: { x: number; y: number }[],
  W: number,
  H: number,
  opts: { id: string; type: PolyTool; color: string; filled: boolean; strokeWidth: number },
): MapShape | null {
  const pts = dedupe(pointsPx);
  if (pts.length < POLY_MIN_POINTS[opts.type]) return null;
  const sw = W || 1, sh = H || 1;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return {
    ...opts,
    // קו שבור הוא לא שטח - מילוי שלו היה סוגר אותו בעין
    filled: opts.type === 'polygon' && opts.filled,
    x: minX / sw, y: minY / sh,
    w: (Math.max(...xs) - minX) / sw, h: (Math.max(...ys) - minY) / sh,
    points: pts.map(p => ({ x: p.x / sw, y: p.y / sh })),
  };
}

/** קודקודי הפוליגון כמחרוזת `points` ל-SVG, בגודל המשטח הנוכחי. */
export const polyPointsToPx = (s: MapShape, size: { w: number; h: number }): string =>
  (s.points || [])
    .map(p => `${isFrac(p.x) ? p.x * size.w : p.x},${isFrac(p.y) ? p.y * size.h : p.y}`)
    .join(' ');
