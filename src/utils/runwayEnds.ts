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

// ─── סדר תצוגה קנוני ─────────────────────────────────────────────────────────
//
// הסדר בפאנל "מסלולים בשימוש" הגיע מ-`sort_order`/`id` של ה-DB, ולכן שתי עמדות
// שמקושרות לאותם מסלולים הציגו אותם בסדר שונה. הפקח משווה בין מסכים, וסדר שונה
// לאותו מידע הוא מלכודת. הסדר כאן נגזר מ**שם המסלול בלבד** ולכן זהה בכל עמדה:
//   קבוצה = מסלול (שני קצותיו צמודים) · בתוך הקבוצה הקצה הנמוך ראשון ·
//   הקבוצות לפי הקצה הנמוך, ובשוויון לפי הסיומת L < C < R.

export interface RunwayGroup { key: string; ends: string[] }

const SUFFIX_ORDER: Record<string, number> = { L: 0, C: 1, R: 2, '': 3 };

/** מפרק קצה לערך מספרי ולסיומת, לצורך מיון בלבד. */
function endKey(end: string): { num: number; suffix: number } {
  const m = /^(\d{1,2})\s*([LRClrc]?)$/.exec(txt(end));
  if (!m) return { num: 99, suffix: 9 };
  return { num: Number(m[1]), suffix: SUFFIX_ORDER[m[2].toUpperCase()] ?? 3 };
}

const cmpEnd = (a: string, b: string) => {
  const ka = endKey(a), kb = endKey(b);
  return ka.num - kb.num || ka.suffix - kb.suffix || a.localeCompare(b);
};

/**
 * המסלולים כקבוצות מסודרות לתצוגה. `key` מזהה את הקבוצה כדי לצייר קו מפריד
 * בין מסלול למסלול. קצה שמופיע בשני מסלולים מוצג פעם אחת בלבד.
 */
export function orderedRunwayGroups(runways: RunwayEnds[]): RunwayGroup[] {
  const seen = new Set<string>();
  const groups: RunwayGroup[] = [];
  for (const rw of runways) {
    const ends = [txt(rw.heading_a), txt(rw.heading_b)]
      .filter(Boolean)
      .filter(e => !seen.has(e));
    if (!ends.length) continue;
    ends.forEach(e => seen.add(e));
    ends.sort(cmpEnd);
    groups.push({ key: ends.join('/'), ends });
  }
  return groups.sort((a, b) => cmpEnd(a.ends[0], b.ends[0]));
}

// ─── מסלול סגור ב-NOTAM ──────────────────────────────────────────────────────
//
// סגירה חלה על ה**מסלול**, כלומר על שני קצותיו: אין "כיוון סגור" - האספלט סגור.
// לכן מסלול שנסגר יורד מהתצוגה גם אם קצה שלו עדיין מסומן בשימוש בפאנל: הסימון
// הוא כוונה תפעולית, וה-NOTAM גובר עליה.

export interface RunwayWithId extends RunwayEnds { id?: number | string | null }
export interface RunwayNotam { runway_id?: number | string | null; notam_type?: string | null }

/** שמות הקצוות של כל מסלול שיש עליו NOTAM סגירה. */
export function closedRunwayEnds(runways: RunwayWithId[], notams: RunwayNotam[]): Set<string> {
  const closedIds = new Set(
    (notams || [])
      .filter(n => txt(n.notam_type) === 'closed' && n.runway_id != null)
      .map(n => String(n.runway_id)),
  );
  const out = new Set<string>();
  if (!closedIds.size) return out;
  for (const rw of runways || []) {
    if (rw.id == null || !closedIds.has(String(rw.id))) continue;
    for (const e of [txt(rw.heading_a), txt(rw.heading_b)]) if (e) out.add(e);
  }
  return out;
}
