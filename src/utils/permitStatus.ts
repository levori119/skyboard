// סטטוס אישור כניסה - **מקור אמת יחיד** לנגזרת מהתאריכים.
//
// האפיון: "סטטוס אישור (אוטומטי לפי התאריכים אך ניתן לדרוס ידנית)". שני הרבדים
// חיים בנפרד ב-DB - `permit_from`/`permit_until` מול `status_override` - ורק
// כאן הם מתמזגים לסטטוס אחד שמוצג למפעיל.
//
// למה לא לחשב בשרת: הפקח עורך תאריכים בטופס ורואה את הסטטוס משתנה **לפני**
// השמירה. חישוב בשרת היה מחייב שליחה לכל הקלדה, או מימוש שני שיתפצל בשקט.
// השרת שומר את הנתונים הגולמיים ולא מחשב סטטוס בכלל.

/** ארבעת הסטטוסים מהאפיון. */
export type PermitStatus = 'approved' | 'not_approved' | 'pending' | 'rejected';

export const PERMIT_STATUSES: PermitStatus[] = ['approved', 'not_approved', 'pending', 'rejected'];

/** צבעי סטטוס - קבועים בכל תמה, כמו כל צבע סטטוס במערכת. */
export const PERMIT_STATUS_COLOR: Record<PermitStatus, string> = {
  approved: '#22c55e',
  not_approved: '#f87171',
  pending: '#fbbf24',
  rejected: '#ef4444',
};

/** מפתח ה-i18n של הסטטוס: permits.statusApproved וכו'. */
export function permitStatusKey(s: PermitStatus): string {
  return `permits.status${s === 'not_approved' ? 'NotApproved' : s.charAt(0).toUpperCase() + s.slice(1)}`;
}

export interface PermitDates {
  /** תאריך אישור כניסה (YYYY-MM-DD, או null) */
  permit_from?: string | null;
  /** תאריך פג תוקף (YYYY-MM-DD, או null) */
  permit_until?: string | null;
  /** דריסה ידנית של הפקח. null = הסטטוס נגזר מהתאריכים */
  status_override?: PermitStatus | string | null;
}

/** היום, כ-YYYY-MM-DD בשעון המקומי - להשוואה מול עמודות DATE. */
export function today(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** תאריך מה-DB (DATE או TIMESTAMPTZ) ל-YYYY-MM-DD להשוואה לקסיקוגרפית. */
export function dateOnly(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : '';
}

/**
 * הסטטוס ה**נגזר** מהתאריכים בלבד, בלי דריסה.
 *
 * - בלי תאריך פג תוקף  → בבדיקה (רשומה שנפתחה ועדיין לא אושרה)
 * - היום אחרי פג התוקף → לא מאושר
 * - היום לפני תאריך האישור → בבדיקה (טרם נכנס לתוקף)
 * - אחרת → מאושר
 */
export function computedPermitStatus(p: PermitDates, now?: Date): PermitStatus {
  const t = today(now);
  const from = dateOnly(p.permit_from);
  const until = dateOnly(p.permit_until);
  if (!until) return 'pending';
  if (t > until) return 'not_approved';
  if (from && t < from) return 'pending';
  return 'approved';
}

/** הסטטוס שמוצג בפועל: הדריסה הידנית גוברת, ובהיעדרה - הנגזרת מהתאריכים. */
export function effectivePermitStatus(p: PermitDates, now?: Date): PermitStatus {
  const ov = p.status_override;
  if (ov && (PERMIT_STATUSES as string[]).includes(ov)) return ov as PermitStatus;
  return computedPermitStatus(p, now);
}

/** האם המוצג נובע מדריסה ידנית - כדי לסמן זאת למפעיל ולאפשר לו לנקות אותה. */
export function isPermitOverridden(p: PermitDates): boolean {
  return !!p.status_override && (PERMIT_STATUSES as string[]).includes(String(p.status_override));
}

/** מספר הימים עד פקיעת התוקף (שלילי = כבר פג). null כשאין תאריך פקיעה. */
export function daysUntilExpiry(p: PermitDates, now: Date = new Date()): number | null {
  const until = dateOnly(p.permit_until);
  if (!until) return null;
  const [y, m, d] = until.split('-').map(Number);
  const end = new Date(y, m - 1, d).getTime();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((end - start) / 86400000);
}
