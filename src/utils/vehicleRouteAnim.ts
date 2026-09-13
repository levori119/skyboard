/**
 * אנימציית נסיעה של רכב בניהול שדה (▶ על האלמנט).
 *
 * כשהאנימציה רצה, מסלול הנסיעה מצויר בקו מקווקו אדום ומוצג עד שעוצרים אותה (■) -
 * **בלי תלות** בסרגל השכבות ובהגדרת "הצג מסלול נסיעה". פקח שלחץ PLAY ביקש לראות
 * את הנסיעה; אנימציה שרצה בלי קו נראית כמו פיצ'ר שבור.
 */

/** צבע קו המסלול בזמן אנימציה - צבע סטטוס, לא תלוי תמה */
export const ANIM_TRAIL_COLOR = '#ef4444';

/** האם לצייר את שכבת מסלול הנסיעה של אלמנט */
export function shouldShowNavOverlay(showRoutes: boolean, isAnimating: boolean): boolean {
  return isAnimating || showRoutes;
}

/** צבע קו מסלול הנסיעה: אדום בזמן אנימציה, אחרת כתום לרכב / כחול למטוס */
export function navPathStroke(isVehicle: boolean, isAnimating: boolean): string {
  if (isAnimating) return ANIM_TRAIL_COLOR;
  return isVehicle ? '#f97316' : '#60a5fa';
}
