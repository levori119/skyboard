// פיצול מבנה - איפה נוחת החלק המפוצל, ומתי שני פ"ממים **אינם** קונפליקט.
//
// שני חלקים של אותו מבנה אינם קונפליקט זה עם זה: רגע לפני הפיצול הם היו פ"מ
// אחד, ולכן אותו גובה ואותו אזור הם המצב הצפוי ולא חריגה. הזיהוי הוא לפי שורש
// הפיצול - `parent_strip_id`, שאותו כל החלקים חולקים (ראה data-model.md §strips).
//
// המודול משותף לשני מצבי התצוגה שבהם הפיצול נראה לעין:
//   • **מפת אזורים** - `splitPinPosition` שם את החלק המפוצל בתוך אותו אזור, ליד
//     המקור ולא עליו, ו-`isSameFormation` מונע נצנוץ קונפליקט אדום בין החלקים.
//   • **מוד טבלה** - `insertAfter` שם את שורת החלק מיד מתחת לפ"מ שממנו פוצל.

export type FormationLike = {
  id?: string | number | null;
  parent_strip_id?: number | string | null;
};

export type Pt = { x: number; y: number };

/** ה-id המספרי של פ"מ. `'s12'` ו-`12` הם אותו פ"מ. */
export const numericStripId = (id: string | number | null | undefined): number | null => {
  if (id == null) return null;
  const n = parseInt(String(id).replace(/^s/, ''), 10);
  return isNaN(n) ? null : n;
};

/** שורש המבנה: `parent_strip_id` אחרי פיצול, ואחרת הפ"מ עצמו. */
export const formationRootId = (s: FormationLike | null | undefined): number | null => {
  if (!s) return null;
  return numericStripId(s.parent_strip_id) ?? numericStripId(s.id);
};

/**
 * האם שני הפ"ממים הם שני חלקים של **אותו** מבנה.
 * פ"מ מול עצמו אינו "אח" - אחרת כל פ"מ היה מסתיר את הקונפליקטים של עצמו.
 */
export const isSameFormation = (
  a: FormationLike | null | undefined,
  b: FormationLike | null | undefined
): boolean => {
  const rootA = formationRootId(a);
  const rootB = formationRootId(b);
  if (rootA == null || rootB == null) return false;
  const idA = numericStripId(a?.id);
  const idB = numericStripId(b?.id);
  if (idA != null && idB != null && idA === idB) return false;
  return rootA === rootB;
};

/** `id` נכנס מיד אחרי `afterId`. אם `afterId` אינו ברשימה - `id` נדחף לסוף. */
export const insertAfter = (order: string[], afterId: string, id: string): string[] => {
  if (afterId === id) return order;
  const without = order.filter(x => x !== id);
  const at = without.indexOf(afterId);
  if (at === -1) return [...without, id];
  return [...without.slice(0, at + 1), id, ...without.slice(at + 1)];
};

/** ray-casting - האם הנקודה בתוך הפוליגון (אחוזי תמונת מפה). */
const inside = (p: Pt, poly: Pt[]): boolean => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) hit = !hit;
  }
  return hit;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type SplitPinOptions = {
  /** מרחק הטבעת הראשונה מהמקור, באחוזי מפה. */
  step?: number;
  /** מרחק מזערי מכל פ"מ אחר, באחוזי מפה. */
  minGap?: number;
  /** שוליים מקצה המפה, באחוזי מפה. */
  margin?: number;
  /** כמה טבעות לנסות לפני שמוותרים על הרווח. */
  rings?: number;
};

/**
 * מיקום לחלק המפוצל על מפת אזורים: **בתוך אותו אזור**, ליד המקור ולא עליו.
 *
 * הסריקה היא בטבעות סביב המקור - 12 כיוונים בכל טבעת, מהקרובה לרחוקה - ונעצרת
 * בנקודה הראשונה שגם בתוך הפוליגון וגם רחוקה מספיק מכל פ"מ אחר. אם אין נקודה
 * כזו, עדיף אזור נכון על רווח נכון: מוחזרת נקודה בתוך הפוליגון גם אם היא צפופה,
 * כי פ"מ שנחת מחוץ לאזור שלו הוא מידע **שגוי**, בעוד שצפיפות היא רק אי-נוחות
 * שהבקר פותר בגרירה אחת.
 */
export function splitPinPosition(
  base: Pt,
  polygon: Pt[] | null | undefined,
  taken: Pt[],
  opts: SplitPinOptions = {}
): Pt {
  const step = opts.step ?? 4;
  const minGap = opts.minGap ?? 3;
  const margin = opts.margin ?? 2;
  const rings = opts.rings ?? 3;
  const poly = Array.isArray(polygon) && polygon.length >= 3 ? polygon : null;

  const farEnough = (p: Pt) => taken.every(t => Math.hypot(p.x - t.x, p.y - t.y) >= minGap);
  const inZone = (p: Pt) => !poly || inside(p, poly);

  let fallbackInZone: Pt | null = null;
  for (let ring = 1; ring <= rings; ring++) {
    for (let k = 0; k < 12; k++) {
      const angle = (k * Math.PI) / 6;
      const p = {
        x: clamp(base.x + Math.cos(angle) * step * ring, margin, 100 - margin),
        y: clamp(base.y + Math.sin(angle) * step * ring, margin, 100 - margin),
      };
      if (!inZone(p)) continue;
      if (farEnough(p)) return p;
      if (!fallbackInZone) fallbackInZone = p;
    }
  }
  if (fallbackInZone) return fallbackInZone;
  // אין אף נקודה בתוך הפוליגון (אזור צר מהטבעת הראשונה) - נשארים על המקור
  // עצמו, שהוא לפחות בתוך האזור הנכון, ולא נזרקים אל מחוצה לו.
  return { x: clamp(base.x, margin, 100 - margin), y: clamp(base.y, margin, 100 - margin) };
}
