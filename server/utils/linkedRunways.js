// ─── מסלולי המראה מקושרים ──────────────────────────────────────────────────────
//
// אותו מסלול פיזי מוגדר בשני שדות תעופה בשמות שונים, ו**קישור מסלולים** מצהיר
// שהם אותו דבר. מרגע שקושרו, מצב המסלול הוא מצב **פיזי** אחד: אם הוא סגור הוא
// סגור לשני הצדדים, התאורות הן אותן נורות, והכיוון שבשימוש הוא אותו אספלט.
//
// הגשר: כל מסלול המראה מחזיק **מסלול ראי** ב"מסלולי הסעה" (`source_runway_id`,
// ראה runwayRoute.js), והקישור הוא בין מסלולי ההסעה. לכן:
//   מסלול המראה -> מסלול הראי שלו -> קבוצת הקישור -> מסלולי הראי האחרים ->
//   מסלולי ההמראה שלהם.

/** מסלולי ההמראה המקושרים ל-$1 (בלי עצמו). */
export const LINKED_RUNWAYS_SQL = `
  SELECT DISTINCT other_rw.id
    FROM airfield_routes mine
    JOIN route_link_members m_mine  ON m_mine.route_id = mine.id
    JOIN route_link_members m_other ON m_other.group_id = m_mine.group_id
                                   AND m_other.route_id <> m_mine.route_id
    JOIN airfield_routes other      ON other.id = m_other.route_id
    JOIN airfield_runways other_rw  ON other_rw.id = other.source_runway_id
   WHERE mine.source_runway_id = $1
     AND other_rw.id <> $1`;

/**
 * מזהי מסלולי ההמראה המקושרים.
 * @param {(q: string, p?: any[]) => Promise<{rows: any[]}>} query
 */
export async function linkedRunwayIds(query, runwayId) {
  const id = Number(runwayId);
  if (!id) return [];
  const { rows } = await query(LINKED_RUNWAYS_SQL, [id]);
  return rows.map(r => Number(r.id)).filter(Boolean);
}

const txt = (v) => String(v ?? '').trim();
/** המספר של הקצה: '15L' -> 15, ' 33r ' -> 33. null כשאין מספר. */
const endNumber = (name) => {
  const m = txt(name).match(/\d+/);
  return m ? Number(m[0]) : null;
};

/**
 * שם הקצה אצל המסלול המקושר שמקביל ל-`endName` שלי.
 *
 * ההתאמה לפי **המספר** ולא לפי המיקום: שדה אחד יכול להגדיר `heading_a='18'`
 * והשני `heading_a='36'` (אותו מסלול, סדר הפוך), והתאמה לפי מיקום הייתה סוגרת
 * את הקצה ההפוך. אות הצד (L/R/C) אינה חלק מההשוואה - '15L' ו-'15R' הם אותו כיוון.
 * רק כששני הצדדים חסרי מספר נופלים למיקום (a<->a).
 */
export function matchEndName(fromRunway, toRunway, endName) {
  const e = txt(endName);
  const fa = txt(fromRunway?.heading_a), fb = txt(fromRunway?.heading_b);
  const ta = txt(toRunway?.heading_a), tb = txt(toRunway?.heading_b);
  const isA = e && e.toLowerCase() === fa.toLowerCase();
  const isB = e && e.toLowerCase() === fb.toLowerCase();
  if (!isA && !isB) return null;

  const num = endNumber(e);
  if (num !== null) {
    if (endNumber(ta) === num) return ta || null;
    if (endNumber(tb) === num) return tb || null;
    // למסלול המקושר יש מספרים אחרים לגמרי - עדיף בלי סנכרון מאשר על הקצה ההפוך
    if (endNumber(ta) !== null || endNumber(tb) !== null) return null;
  }
  const positional = isA ? ta : tb;
  return positional || null;
}

/**
 * המיקום ('a'/'b') של הקצה המקביל אצל המסלול המקושר.
 * NOTAM של **קיצור** נשמר לפי מיקום ולא לפי שם, ולכן העתקה כמו-שהיא לשדה שבו
 * הסדר הפוך הייתה מקצרת את הקצה הלא נכון.
 */
export function matchEndSlot(fromRunway, toRunway, slot) {
  const s = txt(slot).toLowerCase();
  if (s !== 'a' && s !== 'b') return null;
  const myName = s === 'a' ? txt(fromRunway?.heading_a) : txt(fromRunway?.heading_b);
  const theirName = matchEndName(fromRunway, toRunway, myName);
  if (!theirName) return null;
  if (theirName.toLowerCase() === txt(toRunway?.heading_a).toLowerCase()) return 'a';
  if (theirName.toLowerCase() === txt(toRunway?.heading_b).toLowerCase()) return 'b';
  return null;
}
