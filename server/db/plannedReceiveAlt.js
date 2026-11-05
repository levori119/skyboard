/**
 * **גובה מתוכנן לקבלה** - דסק במוד טבלה קובע לפ"מ גובה משלו
 * (`strip_table_assignments.planned_alt`), בלי לגעת בגובה של העמדה שמחזיקה
 * אותו. כשהפקח ביקש לעדכן את העמדה המוסרת (`planned_alt_to_sender`), הגובה
 * נכנס לפ"מ ברגע שנפתחת העברה אליו - כשהפ"מ בנקודת ההעברה למסירה. זה יכול
 * לקרות הרבה אחרי שהגובה נקבע, ולכן זה קורה כאן, בשרת, ולא בדסק.
 *
 * הגובה מסומן בהעברה כ"שונה ע"י המקבלת" (`alt_changed_at`) - אותו מנגנון של
 * שינוי גובה בהעברה פתוחה (src/utils/transferAltChange.ts): הוא מהבהב במוסרת עד
 * שהיא מאשרת. src/utils/deskAlt.ts
 */

/** העמדה המקבלת של העברה - בהעברה לעמדה `to_preset_id`, בהעברה לנקודה `to_workstation_id` */
const receiverOf = (t) => t?.to_preset_id ?? t?.to_workstation_id ?? null;

/**
 * העמודות קיימות בסכמה הנוכחית. שליחת העברה היא נתיב קריטי: סכמה שעוד לא
 * עודכנה (סביבת תרגול, מאגר מקומי ישן) לא תפיל אותה - בלי העמודות אין מה לממש.
 * בתוך טרנזקציה שאילתה שנכשלה מבטלת את כולה, ולכן בודקים ולא תופסים.
 */
async function hasPlannedAltColumns(db) {
  const { rows } = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'strip_table_assignments' AND column_name = 'planned_alt_to_sender'`,
  );
  return rows.length > 0;
}

/**
 * העברה נפתחה: אם הדסק המקבל ביקש לעדכן את המוסרת - הגובה שלו נכנס לפ"מ ולהעברה.
 * הבקשה מתממשת פעם אחת (`planned_alt_to_sender` יורד). מחזיר את ההעברה המעודכנת.
 */
export async function applyPlannedReceiveAlt(db, transfer) {
  const presetId = receiverOf(transfer);
  if (!transfer?.id || !transfer?.strip_id || presetId == null) return { transfer, applied: false };
  if (!(await hasPlannedAltColumns(db))) return { transfer, applied: false };
  const { rows } = await db.query(
    `UPDATE strip_table_assignments SET planned_alt_to_sender = FALSE
      WHERE strip_id = $1 AND preset_id = $2 AND planned_alt_to_sender
        AND planned_alt IS NOT NULL AND planned_alt <> ''
      RETURNING planned_alt`,
    [transfer.strip_id, presetId],
  );
  if (!rows.length) return { transfer, applied: false };
  await db.query('UPDATE strips SET alt = $1 WHERE id = $2', [rows[0].planned_alt, transfer.strip_id]);
  const t = await db.query(
    `UPDATE strip_transfers SET alt_changed_at = NOW(), alt_changed_by = $2, alt_ack_from_at = NULL, alt_ack_to_at = NULL
      WHERE id = $1 RETURNING *`,
    [transfer.id, presetId],
  );
  return { transfer: t.rows[0] || transfer, applied: true };
}

/** ההעברה הפתוחה של הפ"מ אל הדסק, אם יש - בקשה שנענתה כשהפ"מ כבר בנקודה מתממשת מיד */
export async function openTransferTo(db, stripId, presetId) {
  const { rows } = await db.query(
    `SELECT * FROM strip_transfers
      WHERE strip_id = $1 AND COALESCE(to_preset_id, to_workstation_id) = $2 AND status IN ('pending','acknowledged')
      ORDER BY created_at DESC LIMIT 1`,
    [stripId, presetId],
  );
  return rows[0] || null;
}

/** הפ"מ התקבל בעמדה: מעכשיו הגובה שלו הוא האמיתי, וגובה הדסק כבר לא רלוונטי */
export async function clearPlannedAlt(db, stripId, presetId) {
  if (!stripId || presetId == null) return;
  if (!(await hasPlannedAltColumns(db))) return;
  await db.query(
    `UPDATE strip_table_assignments SET planned_alt = NULL, planned_alt_to_sender = FALSE
      WHERE strip_id = $1 AND preset_id = $2 AND (planned_alt IS NOT NULL OR planned_alt_to_sender)`,
    [stripId, presetId],
  );
}
