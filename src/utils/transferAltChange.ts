/**
 * **שינוי גובה בהעברה פתוחה.** העמדה המקבלת עדכנה את הגובה שבו היא רוצה לקבל:
 * הגובה בשורת ההעברה מהבהב **בשני הצדדים** - במוסרת (שתדע) ובמקבלת (שתראה
 * שהשינוי עוד לא אושר). **אישור המוסרת מכבה את שניהם** - היא זו שצריכה לדעת.
 * לחיצה במקבלת מכבה רק אצלה (לא "מאשרת" בשם המוסרת). שינוי חדש מדליק שוב בשניהם.
 *
 * `from` = העמדה המוסרת, `to` = העמדה המקבלת (שמות העמודות בטבלה).
 */
export type AltAckSide = 'from' | 'to';

export function altChangeNeedsAck(
  t: { alt_changed_at?: string | null; alt_ack_from_at?: string | null; alt_ack_to_at?: string | null } | null | undefined,
  side: AltAckSide,
  localAckAt?: number | null,
): boolean {
  if (!t?.alt_changed_at) return false;
  const changed = new Date(t.alt_changed_at).getTime();
  if (!Number.isFinite(changed)) return false;
  const ms = (v?: string | null) => (v ? new Date(v).getTime() : 0) || 0;
  // המקבלת נכבית גם כשהמוסרת אישרה
  const ackAt = side === 'from'
    ? Math.max(ms(t.alt_ack_from_at), localAckAt ?? 0)
    : Math.max(ms(t.alt_ack_to_at), ms(t.alt_ack_from_at), localAckAt ?? 0);
  return !(ackAt >= changed);
}
