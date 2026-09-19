// ─── שדה "העברה/קבלה" של מוד הטבלה ─────────────────────────────────────────
//
// תא אחד שעונה על "מה אפשר לעשות עכשיו עם הפ"מ הזה מבחינת העברות":
//   - נמצא בנקודת העברה בדרך **אליי**  → "קבל" (ירוק) + זמן ההגעה
//   - בדרך **ממני** לעמדה אחרת         → "ממתין לקבלה" (או "נדחה")
//   - נמצא אצלי                         → "העבר לעמדה" (נקודת העברה ← עמדה)
//
// הלוגיקה כאן טהורה (בלי React) כדי שתיבדק, והתא עצמו ב-
// components/transfers/TableTransferAcceptCell.tsx.

/** מזהה פ"מ אחיד: 's123' / '123' / 123 → '123' */
export const stripKeyOf = (id: unknown): string => String(id ?? '').replace(/^s/, '');

export type TransferCellState =
  | { kind: 'accept'; transfer: any }
  | { kind: 'pending'; transfer: any }
  | { kind: 'rejected'; transfer: any }
  | { kind: 'send' }
  | { kind: 'transferred' };

/** אינדקס העברות לפי מזהה הפ"מ. העברה אחת פעילה לפ"מ (כך נאכף בשליחה). */
export function indexTransfersByStrip(transfers: any[] | null | undefined): Map<string, any> {
  const m = new Map<string, any>();
  for (const t of transfers || []) {
    if (t?.strip_id == null) continue;
    m.set(stripKeyOf(t.strip_id), t);
  }
  return m;
}

/**
 * מה מוצג בתא עבור פ"מ.
 *
 * הנכנסת גוברת: פ"מ שנמצא בנקודת העברה אליי הוא קודם כל "לקבל", גם אם הוא
 * עדיין מסומן אצלי מתצורה קודמת. רוח-רפאים של פ"מ שכבר נמסר (`_transferredOut`)
 * לא מציעה שום פעולה - הוא כבר לא שלי.
 */
export function transferCellState(
  strip: any,
  incomingByStrip: Map<string, any>,
  outgoingByStrip: Map<string, any>,
): TransferCellState {
  if (strip?._transferredOut) return { kind: 'transferred' };
  const key = stripKeyOf(strip?.id);
  const incoming = incomingByStrip.get(key);
  if (incoming && incoming.status !== 'rejected') return { kind: 'accept', transfer: incoming };
  const outgoing = outgoingByStrip.get(key);
  if (outgoing) {
    return outgoing.status === 'rejected'
      ? { kind: 'rejected', transfer: outgoing }
      : { kind: 'pending', transfer: outgoing };
  }
  return { kind: 'send' };
}

/**
 * זמן עד ההגעה לנקודת ההעברה, בפורמט MM:SS - אותו חישוב של כרטיס ההעברה.
 * null כשלא הוגדר זמן. `over` = הזמן עבר (מוצג באדום, 00:00).
 */
export function etaCountdown(
  etaMinutes: unknown,
  etaSetAt: unknown,
  now: number = Date.now(),
): { text: string; over: boolean } | null {
  if (!etaMinutes || !etaSetAt) return null;
  const setAt = new Date(etaSetAt as any).getTime();
  if (!Number.isFinite(setAt)) return null;
  const rem = setAt + Number(etaMinutes) * 60000 - now;
  if (!Number.isFinite(rem)) return null;
  if (rem <= 0) return { text: '00:00', over: true };
  const m = Math.floor(rem / 60000);
  const s = Math.floor((rem % 60000) / 1000);
  return { text: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, over: false };
}

// ─── הבהוב קבלה ─────────────────────────────────────────────────────────────

/** משך ההבהוב הירוק אחרי קבלה במוד טבלה (דרישה: 20 שניות) */
export const ACCEPT_FLASH_TABLE_MS = 20000;
/** משך ההבהוב על המפה / בתצוגות האחרות - כפי שהיה */
export const ACCEPT_FLASH_DEFAULT_MS = 5000;
/** מחזור הבהוב אחד */
export const ACCEPT_FLASH_CYCLE_MS = 550;

/**
 * כלל ה-CSS שמהבהב בירוק את כל הפ"מים שהתקבלו לאחרונה. נבנה כמחרוזת כי
 * הבורר הוא `data-strip-id` - אותו פ"מ מסומן כך בשורת הטבלה ובאייקון המפה.
 * מספר המחזורים נגזר מהמשך, כך שההבהוב נגמר עם הטיימר ולא לפניו.
 */
export function acceptFlashCss(stripIds: string[], durationMs: number): string {
  const ids = stripIds.filter(Boolean);
  if (ids.length === 0) return '';
  const cycles = Math.max(1, Math.round(durationMs / ACCEPT_FLASH_CYCLE_MS));
  const selector = ids.map(id => `[data-strip-id="${String(id).replace(/"/g, '')}"]`).join(',');
  return `@keyframes accept-green-flash{0%,100%{outline:3px solid #22c55e!important;outline-offset:2px;box-shadow:0 0 14px rgba(34,197,94,0.8)}50%{outline:3px solid transparent!important;outline-offset:2px;box-shadow:none}}`
    + `${selector}{animation:accept-green-flash ${ACCEPT_FLASH_CYCLE_MS / 1000}s ease-in-out ${cycles};outline:3px solid #22c55e!important;outline-offset:2px;position:relative;z-index:10;}`;
}
