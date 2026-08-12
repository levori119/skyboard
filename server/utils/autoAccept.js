// ─── קבלה אוטומטית בנקודת מעבר - הלוגיקה הטהורה ───────────────────────────────
//
// בשלב ה-MVP יש עמדה **אחת**, ולכן אין מי שילחץ "קבל פ"מ" בצד המקבל וכל העברה
// נתקעת ב-pending. נקודת מעבר שמסומנת במסך הניהול כ"קבלה אוטומטית" מבצעת את
// הקבלה בעצמה - בדיוק אותה פעולה של קבלה ידנית - כדי שאפשר יהיה לתרגל את
// התהליך מקצה לקצה.
//
// המודול הזה **לא נוגע ב-DB**: הוא רק עונה על "האם ההעברה הזו הבשילה לקבלה".
// המנוע שמריץ אותו יושב ב-server/routes/transfers.js (runAutoAcceptOnce).

/** הנקודה אינה מקבלת אוטומטית - התנהגות רגילה, המקבל לוחץ "קבל" */
export const AUTO_ACCEPT_OFF = 'off';
/** הפ"מ נקלט ברגע שההעברה נשלחה */
export const AUTO_ACCEPT_IMMEDIATE = 'immediate';
/** הפ"מ נקלט בתום הזמן שהוקצה לו להגיע לנקודה (eta_minutes) */
export const AUTO_ACCEPT_ETA = 'eta';

export const AUTO_ACCEPT_MODES = [AUTO_ACCEPT_OFF, AUTO_ACCEPT_IMMEDIATE, AUTO_ACCEPT_ETA];

/**
 * נרמול הערך שמגיע מה-DB או מהלקוח.
 * fail closed בכוונה: ערך לא מוכר = כבוי. פ"מ שנקלט מעצמו בטעות חמור יותר
 * מפ"מ שממתין לקבלה ידנית.
 */
export function normalizeAutoAcceptMode(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  return AUTO_ACCEPT_MODES.includes(v) ? v : AUTO_ACCEPT_OFF;
}

/** תאריך מכל צורה ש-pg מחזיר (Date / מחרוזת ISO), או null */
function toDate(value) {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && value) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * הרגע שבו ההעברה מבשילה לקבלה אוטומטית.
 *
 * - `immediate` - רגע שליחת ההעברה.
 * - `eta` - `eta_set_at` + `eta_minutes`. הבסיס הוא **חותמת קביעת הזמן** ולא
 *   יצירת ההעברה, כי הבקר יכול לעדכן את הזמן אחרי השליחה (set-eta / move),
 *   ואז הספירה מתחילה מחדש - כמו שהמונה על כרטיס ההעברה מציג.
 * - `eta` בלי זמן מוקצה - אין למה להמתין, ולכן מבשילה מיד. אחרת פ"מ שנשלח
 *   בלי ETA היה נתקע לנצח דווקא בנקודה שהוגדרה לקבלה אוטומטית.
 *
 * @returns {Date|null} null = הנקודה כבויה (אין קבלה אוטומטית)
 */
export function autoAcceptDueAt(transfer, mode) {
  const m = normalizeAutoAcceptMode(mode);
  if (m === AUTO_ACCEPT_OFF) return null;

  const created = toDate(transfer?.created_at) || new Date(0);
  if (m === AUTO_ACCEPT_IMMEDIATE) return created;

  const minutes = Number(transfer?.eta_minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return created;
  const base = toDate(transfer?.eta_set_at) || created;
  return new Date(base.getTime() + minutes * 60000);
}

/** האם ההעברה הבשילה לקבלה אוטומטית נכון ל-`now` */
export function isAutoAcceptDue(transfer, mode, now = new Date()) {
  const due = autoAcceptDueAt(transfer, mode);
  if (!due) return false;
  const ts = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return due.getTime() <= ts;
}
