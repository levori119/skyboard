/**
 * **שיוך פ"מ לאזור - עדכון מיידי.** השיוך נכנס למסך ברגע השחרור, והשמירה
 * יוצאת ברקע. הפולינג של השיוכים (כל 5 שניות, לכל מפה) מחליף את הרשימה כולה,
 * ותמונה שיצאה לפני השחרור הייתה מחזירה את הפ"מ למקומו הקודם עד הסיבוב הבא.
 *
 * לכן השיוכים הממתינים מוחלים על כל רשימה שמגיעה מהשרת, עד `until`:
 * - במפה של השיוך - הפ"מ יושב לפי הממתין (מוחלף או נוסף)
 * - בכל מפה אחרת - הוא יורד ממנה (לפ"מ יש שיוך אחד, `ON CONFLICT (strip_id)`)
 *
 * ממתין שפג תוקפו נמחק - השרת חוזר להיות האמת. הצלחה מקצרת את התוקף לכמה
 * שניות; כישלון מוחק מיד.
 */
export interface PendingAssignment<A> { a: A; until: number }
type Asgn = { strip_id: number | string; map_id?: number | null };

export function applyPendingAssignments<A extends Asgn>(
  list: A[], mapId: number | null | undefined, pending: Map<number, PendingAssignment<A>>, now: number,
): A[] {
  if (!pending.size) return list;
  let out = list;
  for (const [sid, p] of [...pending.entries()]) {
    if (p.until <= now) { pending.delete(sid); continue; }
    const here = mapId != null && Number(p.a.map_id) === Number(mapId);
    const idx = out.findIndex(a => Number(a.strip_id) === Number(sid));
    if (here) {
      out = idx >= 0 ? out.map((a, i) => (i === idx ? { ...a, ...p.a } : a)) : [...out, p.a];
    } else if (idx >= 0) {
      out = out.filter((_, i) => i !== idx);
    }
  }
  return out;
}
