// חומרת הודעה בלוח ההודעות (SignalBoard) - מקור אמת יחיד לצבעים ולשמות.
//
//   רגיל   (normal)   - ירוק        - מידע תפעולי שוטף
//   חמור   (severe)   - אדום        - דורש תשומת לב
//   קריטי  (critical) - אדום מהבהב  - דורש פעולה מיידית
//
// הצבעים **קבועים בכל התמות** (אור/שחור/כחול), כמו כל צבע סטטוס במערכת -
// ירוק/אדום נושאים משמעות תפעולית ולכן אינם משתנים עם התמה (CLAUDE.md §Do NOT).
//
// ההודעה הקבועה (מאגר ההודעות בהגדרת העמדה) נושאת את החומרה שלה, וכשהיא
// נפרסת לכפתור בלוח - הכפתור נולד עם אותה חומרה, וניתן לשנותה בעמדה.

export type SignalSeverity = 'normal' | 'severe' | 'critical';

export const SIGNAL_SEVERITIES: SignalSeverity[] = ['normal', 'severe', 'critical'];

/** ערך לא מוכר (הודעה ישנה מלפני הפיצ'ר, לקוח ישן) נופל ל'רגיל'. */
export function normSeverity(v: unknown): SignalSeverity {
  return v === 'severe' || v === 'critical' ? v : 'normal';
}

export interface SeverityPaint { bg: string; border: string; text: string }

/** צבעי הכפתור כשההודעה **פעילה**. כבויה נשארת אפורה בכל חומרה. */
const PAINT: Record<SignalSeverity, SeverityPaint> = {
  normal:   { bg: '#5cb85c', border: '#4a9d4a', text: '#ffffff' },
  severe:   { bg: '#dc2626', border: '#991b1b', text: '#ffffff' },
  critical: { bg: '#dc2626', border: '#fca5a5', text: '#ffffff' },
};

export function severityPaint(sev: SignalSeverity): SeverityPaint {
  return PAINT[sev] || PAINT.normal;
}

/**
 * מחלקת ההבהוב של "קריטי". ה-keyframes ב-App.css מחליפים בין אדום בהיר לאדום
 * כהה ולא ל-opacity 0, כדי שהטקסט יישאר קריא לאורך כל מחזור ההבהוב (הנדסת
 * אנוש של ATC - הבהוב מושך תשומת לב ואסור שימנע קריאה).
 */
export const CRITICAL_BLINK_CLASS = 'sig-critical-blink';

/** נקודת החיווי הקטנה שמסמנת את החומרה על הכפתור ובמאגר ההודעות. */
export function severityDot(sev: SignalSeverity): string {
  return severityPaint(sev).bg;
}
