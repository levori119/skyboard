// ─── כיוון המסלול שבשימוש (המראה / נחיתה) ─────────────────────────────────────
//
// שני קצוות של אותו מסלול פיזי הם **כיוונים מנוגדים**: המראה מ-15L ונחיתה
// ל-33R הן תנועות זו מול זו על אותו אספלט. הפאנל "מסלולים בשימוש" החזיק שתי
// רשימות חופשיות (המראה, נחיתה) ולכן איפשר לסמן את שני הקצוות יחד - מצב שאינו
// קיים בשדה.
//
// הכלל: ל**מסלול** יש כיוון אחד בשימוש, והוא חוצה את שתי השורות. לחיצה על הקצה
// הנגדי אינה נחסמת אלא **מחליפה כיוון** (וזו הפעולה התכופה בשדה - שינוי כיוון
// נחיתה), והכפתור הנגדי מסומן כ`opposed` כדי שהמצב ייראה לפני הלחיצה.

/** שורת מסלול כפי שהיא מגיעה מ-`airfield_runways` - רק שני הקצוות מעניינים כאן. */
export interface RunwayEnds { heading_a?: string | null; heading_b?: string | null; [k: string]: unknown }
export interface EndsInUse { takeoff: string[]; landing: string[] }
export type UseRow = 'takeoff' | 'landing';
/** `active` - בשימוש בשורה הזו · `opposed` - הכיוון הנגדי בשימוש · `off` - פנוי */
export type EndUseState = 'active' | 'opposed' | 'off';

const txt = (v: unknown) => String(v ?? '').trim();

/** הקצה השני של אותו מסלול פיזי, או null כשאין. */
export function oppositeEnd(runways: RunwayEnds[], end: string): string | null {
  const e = txt(end);
  if (!e) return null;
  for (const rw of runways || []) {
    const a = txt(rw?.heading_a), b = txt(rw?.heading_b);
    if (!a || !b) continue;
    if (a === e) return b;
    if (b === e) return a;
  }
  return null;
}

/** כל הקצוות שבשימוש כרגע, בשתי השורות יחד. */
export const runwayEndsInUse = (s: EndsInUse): string[] =>
  [...new Set([...(s?.takeoff || []), ...(s?.landing || [])].map(txt).filter(Boolean))];

/**
 * לחיצה על קצה:
 * - פעיל בשורה הזו -> כיבוי
 * - פנוי -> הפעלה, **ואם הקצה הנגדי בשימוש הוא יורד בשתי השורות** (החלפת כיוון)
 *
 * מסלולים אחרים אינם מושפעים, ומוחזרים מערכים חדשים.
 */
export function setEndInUse(s: EndsInUse, row: UseRow, end: string, runways: RunwayEnds[]): EndsInUse {
  const e = txt(end);
  const takeoff = [...(s?.takeoff || [])];
  const landing = [...(s?.landing || [])];
  const current = row === 'takeoff' ? takeoff : landing;
  if (!e) return { takeoff, landing };

  if (current.includes(e)) {
    const without = current.filter(x => x !== e);
    return row === 'takeoff' ? { takeoff: without, landing } : { takeoff, landing: without };
  }

  const opp = oppositeEnd(runways, e);
  const drop = (arr: string[]) => (opp ? arr.filter(x => x !== opp) : arr);
  const nextTakeoff = drop(takeoff);
  const nextLanding = drop(landing);
  return row === 'takeoff'
    ? { takeoff: [...nextTakeoff, e], landing: nextLanding }
    : { takeoff: nextTakeoff, landing: [...nextLanding, e] };
}

/** מצב התצוגה של כפתור קצה בשורה נתונה. */
export function endUseState(s: EndsInUse, row: UseRow, end: string, runways: RunwayEnds[]): EndUseState {
  const e = txt(end);
  const rowEnds = row === 'takeoff' ? (s?.takeoff || []) : (s?.landing || []);
  if (rowEnds.includes(e)) return 'active';
  const opp = oppositeEnd(runways, e);
  // הכיוון הנגדי בשימוש - בכל אחת מהשורות. זו אזהרה על המסלול, לא על השורה.
  if (opp && runwayEndsInUse(s).includes(opp)) return 'opposed';
  return 'off';
}
