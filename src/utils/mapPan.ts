/**
 * גרירת מפה (pan) - הזזת המפה בלחיצה על שטח ריק שלה.
 *
 * הכלל התפעולי: לחיצה שלא פגעה ביישות לחיצה (פ"מ, נקודת העברה, סמן שכן, ובכל
 * יישות שתתווסף בעתיד) ולא במוד ציור - גוררת את המפה עצמה, והיא נעה עם העט/
 * העכבר 1:1 כל עוד הוא לא הורם.
 *
 * המימוש במסך עצמו הוא **שכבת גרירה מתחת ליישויות**: יישות תופסת את הלחיצה
 * שלה בעצמה, וכל השאר נופל לשכבה. לכן יישות חדשה לא צריכה לדעת דבר על הגרירה.
 *
 * כאן יושבת רק הלוגיקה הטהורה - נבדקת ב-mapPan.test.ts ומשותפת לכל מפה.
 */

export type MapPan = { x: number; y: number };

/** ה-transition של שכבות המפה. מנוטרל בזמן גרירה (אחרת המפה "רודפת" אחרי העט). */
export const MAP_LAYER_TRANSITION = 'transform 0.15s ease-out';

/**
 * סמן "מטרה" (כוונת) - מוצג כל עוד המפה נגררת.
 * **שונה במכוון מסמן היד** של גרירת פ"מ: היד = לוקח יישות, המטרה = מזיז את המפה.
 */
const RETICLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
  // קו מתאר שחור עבה - הסמן נשאר קריא גם על מפה בהירה וגם על רקע כהה
  '<g fill="none" stroke="#000" stroke-width="4.5" stroke-linecap="round" opacity="0.6">' +
  '<circle cx="16" cy="16" r="7.5"/><path d="M16 2v6M16 24v6M2 16h6M24 16h6"/></g>' +
  '<g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">' +
  '<circle cx="16" cy="16" r="7.5"/><path d="M16 2v6M16 24v6M2 16h6M24 16h6"/></g>' +
  '<circle cx="16" cy="16" r="1.6" fill="#fff"/></svg>';

export const MAP_PAN_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(RETICLE_SVG)}") 16 16, crosshair`;

/** ה-transform המשותף לכל שכבות המפה (תמונה+יישויות, קנבס הציור, שכבת הצורות). */
export function mapLayerTransform(pan: MapPan, zoom: number): string {
  return `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
}

/** האם אירוע ה-pointerdown הזה אמור להתחיל גרירת מפה. */
export function shouldStartMapPan(
  e: { button: number; pointerType?: string; isPrimary?: boolean },
  opts: { drawingMode: boolean },
): boolean {
  if (opts.drawingMode) return false;          // העט מצייר - לא מזיז מפה
  if (e.isPrimary === false) return false;     // אצבע שנייה במגע מרובה
  if (e.button !== 0) return false;            // ימני שמור לתפריט האזור, אמצעי לא בשימוש
  return true;
}

/**
 * הפאן החדש: הפאן שהיה בתחילת הלחיצה + תזוזת המצביע.
 *
 * הדלתא **אינה** מחולקת בזום של המפה - ב-`translate(...) scale(...)` ההזזה
 * מתבצעת לפני ה-scale, ולכן פיקסל מצביע = פיקסל מפה בכל רמת זום מפה.
 *
 * היא **כן** מחולקת ב-`cssZoom` - הסקייל של גודל המסך (`#root { zoom: var(--s) }`,
 * 1.00 ל-15.6" ועד 1.65 ל-24"). `clientX` נמדד במרחב המסך שאחרי ה-zoom, ואילו
 * ה-translate נמדד בפיקסלים המקומיים שלפניו. בלי החלוקה המפה הייתה "בורחת"
 * מהעט פי 1.65 בעמדת ה-24" - בדיוק עמדת היעד.
 */
export function panAfterDrag(
  startPan: MapPan,
  down: { x: number; y: number },
  current: { x: number; y: number },
  cssZoom = 1,
): MapPan {
  const z = cssZoom > 0 ? cssZoom : 1;
  return { x: startPan.x + (current.x - down.x) / z, y: startPan.y + (current.y - down.y) / z };
}

/**
 * הסקייל האפקטיבי של גודל המסך על אלמנט נתון (`#root { zoom: var(--s) }`).
 * נמדד ולא נקרא מה-CSS: היחס בין הרוחב על המסך לרוחב הפריסה הוא הזום בפועל.
 * האלמנט חייב להיות **בלי transform משלו** (שכבת הגרירה, לא שכבת המפה).
 */
export function measureCssZoom(el: { getBoundingClientRect(): { width: number }; offsetWidth: number }): number {
  const layout = el.offsetWidth;
  if (!layout) return 1;
  const visual = el.getBoundingClientRect().width;
  if (!visual) return 1;
  const z = visual / layout;
  return z > 0.05 && z < 20 ? z : 1;
}
