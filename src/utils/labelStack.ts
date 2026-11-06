/**
 * **תוויות שלא עולות זו על זו** - תצוגת הבלוקים (VerticalView) במוד זמן.
 *
 * כל תווית יושבת בגובה הפ"מ (`y` - מרכז). תוויות שחופפות בזמן (`x`, ברוחב `w`)
 * וקרובות בגובה מקובצות, נערמות לפי הסדר במרווח `h + gap`, והקבוצה כולה נשארת
 * סביב המרכז המקורי שלה. קודם נדחף כל זוג בנפרד: שלושה פ"מים ב-1000 רגל זה מזה
 * - האמצעי נדחף חזרה על הראשון, והתוויות נשארו אחת על השנייה.
 *
 * מחזיר את ה-`y` החדש של כל תווית, באותו סדר.
 */
export function stackLabels(
  items: { x: number; y: number }[], w: number, h: number, gap = 2,
  bounds?: { min?: number; max?: number },
): number[] {
  const n = items.length;
  const ys = items.map(i => i.y);
  const step = h + gap;
  const xOverlap = (a: number, b: number) => items[a].x < items[b].x + w && items[b].x < items[a].x + w;
  // חוזרים עד שאין חפיפה: איחוד קבוצה יכול להצמיד אותה לשכנה, ואז מאחדים שוב
  for (let round = 0; round < n; round++) {
    // קבוצות: תוויות שחופפות בזמן ו(אחרי הסידור הנוכחי) קרובות בגובה
    const parent = items.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    let touching = false;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        if (xOverlap(a, b) && Math.abs(ys[a] - ys[b]) < step - 1e-9) { parent[find(a)] = find(b); touching = true; }
      }
    }
    if (!touching) break;
    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) groups.set(find(i), [...(groups.get(find(i)) || []), i]);
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      // לפי הגובה הנוכחי (שוויון - לפי המקורי, ואז הסדר) - הפ"מ הגבוה נשאר למעלה
      g.sort((a, b) => ys[a] - ys[b] || items[a].y - items[b].y || a - b);
      const center = g.reduce((s, i) => s + ys[i], 0) / g.length;
      let start = center - ((g.length - 1) * step) / 2;
      if (bounds?.min != null) start = Math.max(start, bounds.min);
      if (bounds?.max != null) start = Math.min(start, bounds.max - (g.length - 1) * step);
      g.forEach((i, k) => { ys[i] = start + k * step; });
    }
  }
  return ys;
}

/**
 * **נתיב צידי** לכל תווית: תוויות שחופפות בזמן (`x`, ברוחב `w`) וקרובות בגובה
 * (פחות מ-`h + gap` - למשל שני פ"מים ב-1000 רגל, כשהתווית גבוהה מהמרחק ביניהם
 * על המסך) נדחקות **הצידה** ולא למעלה או למטה: הגובה על המסך נשאר הגובה האמיתי.
 * 0 = במקום; 1 = תווית אחת ימינה, וכן הלאה. נתיב שהתפנה חוזר לשימוש.
 */
export function sideLanes(items: { x: number; y: number }[], w: number, h: number, gap = 2): number[] {
  const lanes = new Array(items.length).fill(0);
  const order = items.map((_, i) => i).sort((a, b) => items[a].y - items[b].y || items[a].x - items[b].x || a - b);
  const placed: number[] = [];
  for (const i of order) {
    const taken = new Set<number>();
    for (const j of placed) {
      if (Math.abs(items[i].y - items[j].y) >= h + gap) continue;
      if (!(items[i].x < items[j].x + w && items[j].x < items[i].x + w)) continue;
      taken.add(lanes[j]);
    }
    let lane = 0;
    while (taken.has(lane)) lane++;
    lanes[i] = lane;
    placed.push(i);
  }
  return lanes;
}
