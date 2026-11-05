/**
 * **מרחב הבלוקים בדסק** - כמו גובה הדסק (src/utils/deskAlt.ts): פ"מ יכול להיות
 * בכמה דסקים, ובכל אחד במרחב בלוקים אחר.
 *
 * | | |
 * |---|---|
 * | **בדסק** | המרחב שהדסק קבע (`strip_table_assignments.block_space_id`), ובלעדיו - בלי מרחב |
 * | **לא בדסק** | `strips.block_space_id` - המסכים שאינם דסק נשארו כמו שהיו |
 * | **עריכה** | בדסק - נשמרת לדסק בלבד (`PATCH /api/strip-table-assignments/:s/:p/space`) |
 * | **ניקוי הקצאות** | הרשומה של הדסק נמחקת, ואיתה המרחב והגובה |
 */

const toId = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n;
};

/** הפ"מ בדסק של העמדה: הקצאת דסק בשרת, רשומת מרחב, או שהוא על הלוח עכשיו (`onBoard`) */
export function isOnDesk(strip: any, presetId: number | null | undefined, onBoard = false): boolean {
  if (!strip || presetId == null) return false;
  if (onBoard) return true;
  if (Array.isArray(strip.table_preset_ids) && strip.table_preset_ids.map(Number).includes(Number(presetId))) return true;
  return !!strip.table_spaces && Object.prototype.hasOwnProperty.call(strip.table_spaces, String(presetId));
}

/** מרחב הבלוקים של הפ"מ בדסק הזה, או null */
export function deskSpaceId(strip: any, presetId: number): number | null {
  return toId(strip?.table_spaces?.[String(presetId)]);
}

/** הפ"מ כפי שהדסק רואה אותו: בדסק - `block_space_id` הוא של הדסק */
export function withDeskSpace<T extends Record<string, any>>(strip: T, presetId: number, onBoard = false): T {
  if (!isOnDesk(strip, presetId, onBoard)) return strip;
  return { ...strip, block_space_id: deskSpaceId(strip, presetId) };
}

/**
 * יש קונפליקט בין שני פ"מים ב**מרחבים שונים** - כזה שעבודה לפי מרחבי בלוקים
 * (תצוגה מופרדת) הייתה מבטלת. `pairs` - מפת הקונפליקטים של הטבלה.
 */
export function deskSpaceConflict(strips: { id: unknown; block_space_id?: unknown }[], pairs: Map<string, string[]>): boolean {
  const spaceOf = new Map(strips.map(s => [String(s.id), toId(s.block_space_id)]));
  for (const [a, others] of pairs) {
    const sa = spaceOf.get(a);
    if (sa == null) continue;
    for (const b of others) {
      const sb = spaceOf.get(String(b));
      if (sb != null && sb !== sa) return true;
    }
  }
  return false;
}
