/**
 * **שינוי גובה בהעברה פתוחה.** העמדה המקבלת עדכנה את הגובה שבו היא רוצה לקבל:
 * הגובה בשורת ההעברה מהבהב **בשני הצדדים** - במוסרת (שתדע) ובמקבלת (שתראה
 * שהשינוי נקלט) - עד שכל צד מאשר בלחיצה על הגובה. שינוי חדש מדליק שוב בשניהם.
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
  const ack = side === 'from' ? t.alt_ack_from_at : t.alt_ack_to_at;
  const ackAt = Math.max(ack ? new Date(ack).getTime() : 0, localAckAt ?? 0);
  return !(ackAt >= changed);
}
