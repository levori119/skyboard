/**
 * פגיעה בפוליגון של אזור - "איזה אזור נמצא מתחת לנקודה הזו".
 *
 * הקואורדינטות הן **אחוזי תמונת מפה** (0..100), כמו שנשמר ב-`polygon` של האזור,
 * ולכן הסובלנות של "על הקו" נמדדת גם היא באחוזים ולא בפיקסלים - היא לא משתנה
 * עם זום המפה או עם גודל המסך.
 *
 * למה שתי פונקציות ולא אחת: הגרירה מפילה את הפ"מ **לתוך** האזור, ואילו שידוך
 * בלחיצה נדרש לתפוס גם לחיצה שנחתה על קו המתאר עצמו (בקר שלוחץ "על הגבול").
 */

export type ZonePoint = { x: number; y: number };
export type HittableZone = { polygon: ZonePoint[] };

/** ray-casting: האם הנקודה בתוך הפוליגון. */
export function pointInPolygon(px: number, py: number, polygon: ZonePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** המרחק הקצר ביותר מהנקודה אל הקטע (x1,y1)-(x2,y2). */
export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** האזור הראשון שהנקודה בתוכו. `null` אם אין. */
export function zoneAtPoint<Z extends HittableZone>(px: number, py: number, zones: Z[]): Z | null {
  for (const zone of zones) {
    if (zone.polygon?.length >= 3 && pointInPolygon(px, py, zone.polygon)) return zone;
  }
  return null;
}

/**
 * כמו `zoneAtPoint`, אבל תופס גם לחיצה **על קו המתאר** בטווח `tol` (אחוזי מפה).
 * פנים הפוליגון קודם תמיד; רק אם הנקודה מחוץ לכולם נבדק הקו הקרוב ביותר.
 */
export function zoneAtPointOrEdge<Z extends HittableZone>(px: number, py: number, zones: Z[], tol = 1): Z | null {
  const inside = zoneAtPoint(px, py, zones);
  if (inside) return inside;
  let best: Z | null = null, bestD = tol;
  for (const zone of zones) {
    const poly = zone.polygon || [];
    if (poly.length < 2) continue;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const d = distToSegment(px, py, poly[j].x, poly[j].y, poly[i].x, poly[i].y);
      if (d < bestD) { bestD = d; best = zone; }
    }
  }
  return best;
}

/**
 * האזור שה**קו** שלו נמצא בטווח `tol` מהנקודה - ורק הקו.
 *
 * להבדיל מ-`zoneAtPointOrEdge`, לחיצה בתוך האזור **אינה** פגיעה: פנים האזור הוא
 * יעד שחרור של פ"מ, והקו הוא הפקד שפותח את תפריט האזור (סגור/מוגבל). בלי
 * ההפרדה הזו כל לחיצה על המפה הייתה פותחת תפריט.
 *
 * שובר השוויון בין שני אזורים **צמודים** שחולקים גבול: קודם האזור שהנקודה
 * בתוכו (הפקח לחץ על הצד שלו בקו), ורק אחריו הקו הקרוב ביותר. בלעדיו לחיצה על
 * גבול משותף הייתה נופלת על האזור שהופיע ראשון ברשימה - כלומר על סדר ה-`id`.
 */
export function zoneAtEdgeOnly<Z extends HittableZone>(px: number, py: number, zones: Z[], tol = 1): Z | null {
  let best: Z | null = null, bestD = tol;
  let inside: Z | null = null, insideD = tol;
  for (const zone of zones) {
    const poly = zone.polygon || [];
    if (poly.length < 2) continue;
    let d = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      d = Math.min(d, distToSegment(px, py, poly[j].x, poly[j].y, poly[i].x, poly[i].y));
    }
    if (d > tol) continue;
    if (poly.length >= 3 && pointInPolygon(px, py, poly)) {
      if (d < insideD) { insideD = d; inside = zone; }
    }
    if (d < bestD) { bestD = d; best = zone; }
  }
  return inside ?? best;
}
