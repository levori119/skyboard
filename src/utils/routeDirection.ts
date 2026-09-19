// כיוון נסיעה בנתיב נסיעה (`base_routes.direction`) - מה שעורך הנתיבים מציג.
// המשמעות לתכנון הנתיב נאכפת בשרת (server/utils/roadGraph.js); כאן רק התצוגה.
//
//   both     - דו-כיווני (ברירת המחדל, גם לערך חסר)
//   forward  - חד-כיווני בסדר שבו הנתיב צויר (מהנקודה הראשונה לאחרונה)
//   backward - חד-כיווני הפוך לסדר הציור

export type RouteDirection = 'both' | 'forward' | 'backward';

export function normalizeRouteDirection(d: unknown): RouteDirection {
  return d === 'forward' || d === 'backward' ? d : 'both';
}

/** סדר המחזור בלחיצה על הכפתור בשורת הנתיב */
export function nextRouteDirection(d: unknown): RouteDirection {
  const cur = normalizeRouteDirection(d);
  return cur === 'both' ? 'forward' : cur === 'forward' ? 'backward' : 'both';
}

export function routeDirectionGlyph(d: unknown): string {
  const cur = normalizeRouteDirection(d);
  return cur === 'both' ? '⇄' : cur === 'forward' ? '→' : '←';
}

/**
 * חצי כיוון לציור על המפה: אחד באמצע כל קטע, בזווית כיוון הנסיעה (מעלות, SVG).
 * נתיב דו-כיווני - בלי חצים, כדי לא להעמיס את המפה בסימון שאינו מוסיף מידע.
 */
export function routeDirectionArrows(
  pts: { x: number; y: number }[], d: unknown,
): { x: number; y: number; angle: number }[] {
  const dir = normalizeRouteDirection(d);
  if (dir === 'both') return [];
  const out: { x: number; y: number; angle: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (a.x === b.x && a.y === b.y) continue;
    const [from, to] = dir === 'forward' ? [a, b] : [b, a];
    out.push({
      x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      angle: (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI,
    });
  }
  return out;
}
