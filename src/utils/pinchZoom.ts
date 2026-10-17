/**
 * צביטה בשתי אצבעות (אייפד / מסך מגע) - הגדלה, הקטנה והזזה של מפה.
 *
 * כאן יושבת רק הלוגיקה הטהורה: הגאומטריה של שתי אצבעות, והצעד שמזיז ומגדיל
 * את המפה כך ש**הנקודה שבין האצבעות נשארת מתחתיהן**. זו התחושה של "לתפוס את
 * המפה ביד": מקרבים אצבעות - המפה מתכווצת סביב המקום שבו הן נוגעות, מזיזים את
 * שתיהן יחד - המפה נגררת איתן.
 *
 * ההאזנה לאירועים עצמה ב-`hooks/usePinchZoom`. כל מפה ממירה את הצעד למודל
 * התצוגה שלה (translate+scale, viewBox תלת מימדי, מרכז+זום, גלילה).
 */

export interface Pt { x: number; y: number }

/** מצב תצוגה של מפה שמצוירת ב-`translate(pan) scale(zoom)`. */
export interface ZoomPanView { zoom: number; pan: Pt }

/** צעד אחד של צביטה: יחס המרחק בין האצבעות, ונקודת האמצע לפני ואחרי. */
export interface PinchStep { scale: number; prevMid: Pt; mid: Pt }

/** המרחק בין שתי האצבעות ונקודת האמצע ביניהן. */
export function pinchGeometry(a: Pt, b: Pt): { dist: number; mid: Pt } {
  return { dist: Math.hypot(b.x - a.x, b.y - a.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/**
 * הצעד הבא של מפה ב-`transform: translate(pan) scale(zoom)` עם `transform-origin`
 * בנקודה `origin` (במרחב המקומי של המפה, למשל מרכז השכבה).
 *
 * נקודת תוכן p מוצגת ב-`origin + pan + zoom·(p − origin)`. הנקודה שהייתה מתחת
 * ל-`prevMid` חייבת להופיע מתחת ל-`mid` בזום החדש, ומכאן:
 *
 *     pan' = mid − origin − (zoom'/zoom)·(prevMid − origin − pan)
 *
 * הזום נחסם ל-[min, max]; כשהוא נחסם היחס מחושב מהזום **שנחסם**, ולכן בקצה
 * הטווח המפה ממשיכה להיגרר בלי לקפוץ.
 *
 * כל הנקודות (`prevMid`, `mid`, `origin`, `pan`) באותו מרחב - פיקסלי הפריסה
 * המקומיים של המפה (אחרי חלוקה ב-`--s`, ראה `toLocal`).
 */
export function pinchZoomPan(
  view: ZoomPanView, step: PinchStep, origin: Pt, min: number, max: number,
): ZoomPanView {
  const z0 = view.zoom > 0 ? view.zoom : 1;
  const s = Number.isFinite(step.scale) && step.scale > 0 ? step.scale : 1;
  const zoom = Math.min(max, Math.max(min, z0 * s));
  const r = zoom / z0;
  return {
    zoom,
    pan: {
      x: step.mid.x - origin.x - r * (step.prevMid.x - origin.x - view.pan.x),
      y: step.mid.y - origin.y - r * (step.prevMid.y - origin.y - view.pan.y),
    },
  };
}

/**
 * נקודת מסך (`clientX/Y`) → פיקסלי הפריסה המקומיים של אלמנט.
 *
 * `#root` תחת `zoom: var(--s)` (1.65 ב-24"), ולכן `clientX` ו-`getBoundingClientRect`
 * בפיקסלים אמיתיים בעוד `pan` ו-`offsetWidth` ביחידות שלפני ה-zoom. בלי החלוקה
 * המפה הייתה בורחת מהאצבעות פי 1.65 (CLAUDE.md §גרירה, המלכודת השלישית).
 */
export function toLocal(client: Pt, rect: { left: number; top: number }, cssZoom: number): Pt {
  const z = cssZoom > 0 ? cssZoom : 1;
  return { x: (client.x - rect.left) / z, y: (client.y - rect.top) / z };
}

/** צעד צביטה שהומר כולו למרחב המקומי של אלמנט. */
export function localStep(step: PinchStep, rect: { left: number; top: number }, cssZoom: number): PinchStep {
  return { scale: step.scale, prevMid: toLocal(step.prevMid, rect, cssZoom), mid: toLocal(step.mid, rect, cssZoom) };
}
