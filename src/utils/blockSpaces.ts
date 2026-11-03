/**
 * **מרחבי חלוקה של טבלת בלוקים** - הלוגיקה הטהורה.
 *
 * טבלת בלוקים יכולה להתחלק לכמה מרחבים (`block_tables.split_space_ids`, מתוך
 * `block_spaces`), ולכל בלוק אפשר לשייך מרחב (`blocks.space_id`; ריק = כל
 * המרחבים). הפ"מ נמצא במרחב לפי `strips.block_space_id`.
 *
 * | כלל | |
 * |---|---|
 * | **קונפליקט** | שני פ"מים באותו גובה ב**מרחבים שונים** שמוגדרים בחלוקה - אין קונפליקט |
 * | **בלוק** | פ"מ "נמצא" רק בבלוק של המרחב שלו (או בבלוק בלי מרחב). פ"מ בלי מרחב - בכל הבלוקים |
 * | **מרחב שאינו בחלוקה** | לא מפריד: מרחב שלא הוגדר כחלוקה של אף טבלה רלוונטית אינו מבטל קונפליקט |
 */

const toId = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n;
};

/** מרחבי החלוקה של הטבלאות (כולן, או רק אלה שב-`tableIds`) */
export function splitSpaceSet(tables: unknown[], tableIds?: Iterable<number>): Set<number> {
  const only = tableIds ? new Set([...tableIds].map(Number)) : null;
  const out = new Set<number>();
  for (const t of Array.isArray(tables) ? tables : []) {
    const r = (t && typeof t === 'object') ? t as Record<string, unknown> : {};
    if (only && !only.has(Number(r.id))) continue;
    const ids = Array.isArray(r.split_space_ids) ? r.split_space_ids : [];
    for (const id of ids) { const n = toId(id); if (n !== null) out.add(n); }
  }
  return out;
}

/** האם שני הפ"מים במרחבי חלוקה שונים - ולכן אינם בקונפליקט גם באותו גובה */
export function separatedBySpace(a: { block_space_id?: unknown }, b: { block_space_id?: unknown }, split: Set<number>): boolean {
  if (!split.size) return false;
  const sa = toId(a?.block_space_id), sb = toId(b?.block_space_id);
  return sa !== null && sb !== null && sa !== sb && split.has(sa) && split.has(sb);
}

/** האם הבלוק משרת את המרחב של הפ"מ */
export function blockFitsSpace(block: { space_id?: unknown }, stripSpaceId: unknown): boolean {
  const bs = toId(block?.space_id), ss = toId(stripSpaceId);
  return bs === null || ss === null || bs === ss;
}
