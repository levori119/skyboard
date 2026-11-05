/**
 * **גובה מתוכנן לקבלה** - לפ"מ בדסק במוד טבלה שני גבהים:
 *
 * | | |
 * |---|---|
 * | **גובה במרחב** (`planned_alt`) | הגובה **הפנימי** של הדסק - גם לפ"מ שאצלי. משפיע רק על הקונפליקטים והבלוקים של הדסק, לא על עמדות אחרות ולא על נקודות ההעברה |
 * | **גובה קבלה** (`planned_receive_alt`) | לפ"מ שעוד לא אצלי: הגובה שבו הדסק מבקש לקבל אותו בנקודת ההעברה. לפ"מ שאצלי השדה הוא גובה המסירה - הגובה שעליו (`strips.alt`) |
 *
 * גובה הקבלה - ו**לא** גובה המרחב - נכנס לפ"מ ברגע שנפתחת העברה אל הדסק, כשהפ"מ
 * בנקודת ההעברה למסירה. זה יכול לקרות הרבה אחרי שהגובה נקבע, ולכן זה קורה כאן,
 * בשרת, ולא בדסק. בקשה ישנה (`planned_alt_to_sender` - "לעדכן את המוסרת בגובה
 * המרחב", מלפני שהיה גובה קבלה) עדיין מתממשת כשאין גובה קבלה.
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
async function hasColumn(db, column) {
  const { rows } = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'strip_table_assignments' AND column_name = $1`,
    [column],
  );
  return rows.length > 0;
}
const hasPlannedAltColumns = db => hasColumn(db, 'planned_alt_to_sender');

/**
 * העברה נפתחה: אם הדסק המקבל ביקש לעדכן את המוסרת - הגובה שלו נכנס לפ"מ ולהעברה.
 * הבקשה מתממשת פעם אחת (`planned_alt_to_sender` יורד). מחזיר את ההעברה המעודכנת.
 */
export async function applyPlannedReceiveAlt(db, transfer) {
  const presetId = receiverOf(transfer);
  if (!transfer?.id || !transfer?.strip_id || presetId == null) return { transfer, applied: false };
  if (!(await hasPlannedAltColumns(db))) return { transfer, applied: false };
  const withReceive = await hasColumn(db, 'planned_receive_alt');
  // גובה הקבלה קודם; בלעדיו - הבקשה הישנה (גובה המרחב). שתיהן מתממשות פעם אחת
  const { rows } = withReceive
    ? await db.query(
      `WITH o AS (
         SELECT strip_id, preset_id,
                COALESCE(NULLIF(planned_receive_alt, ''), CASE WHEN planned_alt_to_sender THEN NULLIF(planned_alt, '') END) AS alt
           FROM strip_table_assignments WHERE strip_id = $1 AND preset_id = $2 FOR UPDATE)
       UPDATE strip_table_assignments t SET planned_alt_to_sender = FALSE, planned_receive_alt = NULL
         FROM o WHERE t.strip_id = o.strip_id AND t.preset_id = o.preset_id AND o.alt IS NOT NULL
       RETURNING o.alt AS alt`,
      [transfer.strip_id, presetId],
    )
    : await db.query(
      `UPDATE strip_table_assignments SET planned_alt_to_sender = FALSE
        WHERE strip_id = $1 AND preset_id = $2 AND planned_alt_to_sender
          AND planned_alt IS NOT NULL AND planned_alt <> ''
        RETURNING planned_alt AS alt`,
      [transfer.strip_id, presetId],
    );
  if (!rows.length) return { transfer, applied: false };
  await db.query('UPDATE strips SET alt = $1 WHERE id = $2', [rows[0].alt, transfer.strip_id]);
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

/**
 * הפ"מ התקבל בעמדה: בקשת הקבלה כבר לא רלוונטית - הגובה שעליו הוא עכשיו גובה
 * המסירה שלי. **גובה המרחב נשאר**: הוא הגובה הפנימי של הדסק, גם לפ"מ שאצלי.
 */
export async function clearPlannedAlt(db, stripId, presetId) {
  if (!stripId || presetId == null) return;
  if (!(await hasPlannedAltColumns(db))) return;
  const withReceive = await hasColumn(db, 'planned_receive_alt');
  const withMode = await hasColumn(db, 'handover_mode');
  // הפ"מ אצלי עכשיו - השדה "גובה מסירה/קבלה" עובר למסירה
  await db.query(
    `UPDATE strip_table_assignments SET planned_alt_to_sender = FALSE${withReceive ? ', planned_receive_alt = NULL' : ''}${withMode ? ", handover_mode = 'send'" : ''}
      WHERE strip_id = $1 AND preset_id = $2`,
    [stripId, presetId],
  );
}
