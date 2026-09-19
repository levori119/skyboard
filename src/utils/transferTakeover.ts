/**
 * פ"מ שנמצא בכמה עמדות - הלוגיקה הטהורה של שתי ההתראות.
 *
 * 1. **לקיחה מנקודת העברה** (`TransferTakeoverRequest`): עמדה גוררת לנקודת
 *    העברה פ"מ שכבר ממתין בנקודת העברה מעמדה אחרת. השרת (transferTakeovers.js)
 *    מחזיק את הבקשה; כאן רק "מה העמדה הזו רואה עכשיו".
 * 2. **"נמצא גם בעמדה"**: פ"מ שנכנס לעמדה שלא דרך קבלת העברה (גרירה מחלון
 *    הפ"מים / מנקודת העברה לדסק או למפה), והוא מוחזק גם בעמדה אחרת.
 */

export type TakeoverStatus = 'pending' | 'approved' | 'denied' | 'stale' | 'expired' | 'cancelled';

export interface TransferTakeoverRequest {
  id: number;
  strip_id: number;
  callsign: string;
  existing_transfer_id: number | null;
  holder_preset_id: number | null;
  holder_name: string;
  existing_point_label: string;
  existing_dest_name: string;
  requester_preset_id: number;
  requester_name: string;
  new_point_label: string;
  new_dest_name: string;
  kind: 'sector' | 'preset';
  status: TakeoverStatus;
  decided_side: 'holder' | 'requester' | null;
  created_at: string;
  decided_at: string | null;
}

export type TakeoverRole = 'holder' | 'requester';

/** איזה צד העמדה הזו בבקשה. null = לא צד (לא אמור להגיע מהשרת). */
export function takeoverRole(r: TransferTakeoverRequest, presetId: number | null | undefined): TakeoverRole | null {
  if (presetId == null) return null;
  if (Number(r.requester_preset_id) === Number(presetId)) return 'requester';
  if (r.holder_preset_id != null && Number(r.holder_preset_id) === Number(presetId)) return 'holder';
  return null;
}

/**
 * מה להציג עכשיו. בקשה פתוחה קודמת לתוצאה (דורשת החלטה); בין פתוחות - הוותיקה
 * קודם, כמו תור. מחזיר גם כמה נוספות ממתינות אחריה.
 */
export function pickTakeoverToShow(list: TransferTakeoverRequest[], presetId: number | null | undefined, hidden: ReadonlySet<number> = new Set()) {
  const mine = list.filter(r => !hidden.has(r.id) && takeoverRole(r, presetId) != null);
  const pending = mine.filter(r => r.status === 'pending');
  const outcomes = mine.filter(r => r.status !== 'pending');
  const ordered = [...pending, ...outcomes];
  return { current: ordered[0] ?? null, queued: Math.max(0, ordered.length - 1) };
}

// ─── "נמצא גם בעמדה" ─────────────────────────────────────────────────────────

export interface HeldStripLike {
  id: string | number;
  callSign?: string;
  callsign?: string;
  status?: string;
  workstation_preset_id?: number | string | null;
  table_preset_ids?: (number | string)[] | null;
  at_preset_names?: string[] | null;
}

export interface HeldElsewhereNotice {
  stripId: string;
  callsign: string;
  others: string[];
}

/** האם הפ"מ נמצא אצלי - בדסק, באזור, או משויך אליי כשאינו ממתין בנקודת העברה. */
export function isHeldByMe(s: HeldStripLike, presetId: number, presetName: string): boolean {
  if (Array.isArray(s.table_preset_ids) && s.table_preset_ids.some(p => Number(p) === presetId)) return true;
  if (presetName && Array.isArray(s.at_preset_names) && s.at_preset_names.includes(presetName)) return true;
  return s.status !== 'pending_transfer' && s.workstation_preset_id != null && Number(s.workstation_preset_id) === presetId;
}

/** העמדות האחרות שמחזיקות את הפ"מ. */
export function otherHolders(s: HeldStripLike, presetName: string): string[] {
  const names = Array.isArray(s.at_preset_names) ? s.at_preset_names : [];
  return [...new Set(names.filter(n => n && n !== presetName))];
}

/**
 * השוואת תמונת "מה אצלי" בין שני סבבים.
 *
 * - `prev === null` = הסבב הראשון: רק לומדים מה כבר אצלי, בלי הודעות. אחרת כל
 *   כניסה לעמדה הייתה מציפה הודעה על כל פ"מ משותף שישב שם כבר קודם.
 * - `viaTransfer` = פ"מים שהגיעו אליי **דרך קבלת העברה**. שם הם עברו מעמדה
 *   לעמדה - ההודעה לא רלוונטית (ההחרגה המפורשת באפיון).
 */
export function diffHeldElsewhere(
  prev: ReadonlySet<string> | null,
  strips: HeldStripLike[],
  presetId: number,
  presetName: string,
  viaTransfer: ReadonlySet<string> = new Set(),
): { held: Set<string>; notices: HeldElsewhereNotice[] } {
  const held = new Set<string>();
  const notices: HeldElsewhereNotice[] = [];
  for (const s of strips) {
    const id = String(s.id);
    if (!isHeldByMe(s, presetId, presetName)) continue;
    held.add(id);
    if (prev === null || prev.has(id) || viaTransfer.has(id)) continue;
    const others = otherHolders(s, presetName);
    if (others.length > 0) notices.push({ stripId: id, callsign: String(s.callSign ?? s.callsign ?? ''), others });
  }
  return { held, notices };
}

/** מזהה פ"מ בצורת הלקוח ('s123') מתוך strip_id של העברה. */
export const stripKeyOfTransfer = (t: { strip_id?: number | string | null }) =>
  t.strip_id == null ? '' : (String(t.strip_id).startsWith('s') ? String(t.strip_id) : 's' + t.strip_id);
