import type { CSSProperties, KeyboardEvent } from 'react';

/**
 * עריכה בתא במוד טבלה - התנהגות משותפת לכל התאים.
 *
 * שלושה כללים, זהים בכל עמודה:
 *   1. תא שפתוח לעריכה מסומן ב**קו תחתון** - הפקח רואה מה אפשר לערוך בלי
 *      ללחוץ ובלי לנחש, כמו משבצת ריקה בסדק הפיזי.
 *   2. לחיצה פותחת את השדה לעריכה במקום.
 *   3. ENTER סוגר את השדה ושומר; ALT+ENTER יורד שורה - רק בשדות שמחזיקים
 *      כמה שורות (הערות, חימושים, מטרות, מערכות, שדה מותאם).
 *
 * השמירה עצמה נשארת ב-onBlur הקיים של כל תא: ENTER רק מוציא את הפוקוס,
 * ולכן אין כאן שכפול של לוגיקת השמירה (שונה מתא לתא).
 */

/** מה לעשות עם הקשה בזמן עריכת תא */
export type CellEditKeyAction = 'save' | 'newline' | 'ignore';

/** הכרעת ההקשה - פונקציה טהורה, בלי DOM */
export function cellEditKeyAction(
  e: { key: string; altKey?: boolean; shiftKey?: boolean },
  multiline: boolean,
): CellEditKeyAction {
  if (e.key !== 'Enter') return 'ignore';
  // ALT+ENTER (ו-SHIFT+ENTER כמותו) = ירידת שורה, ורק בשדה רב-שורתי.
  // בשדה חד-שורתי ההקשה נבלעת ולא מכניסה \n לשדה שיישמר כשורה אחת.
  if (e.altKey || e.shiftKey) return multiline ? 'newline' : 'ignore';
  return 'save';
}

/** הכנסת ירידת שורה במקום הסמן (מחליפה את הטקסט המסומן, אם יש) */
export function insertNewline(value: string, start: number, end: number): { value: string; caret: number } {
  return { value: value.slice(0, start) + '\n' + value.slice(end), caret: start + 1 };
}

/**
 * ה-handler עצמו. השדות במוד טבלה אינם controlled (defaultValue), ולכן
 * ירידת השורה נכתבת ישירות ל-value של האלמנט - React אינו מנהל אותו.
 */
export function handleCellEditKeyDown(
  e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
  multiline: boolean,
): void {
  const action = cellEditKeyAction(e, multiline);
  if (action === 'ignore') {
    if (e.key === 'Enter') e.preventDefault();
    return;
  }
  e.preventDefault();
  const el = e.currentTarget as HTMLTextAreaElement;
  if (action === 'save') { el.blur(); return; } // ה-onBlur של התא שומר וסוגר
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const next = insertNewline(el.value, start, end);
  el.value = next.value;
  el.selectionStart = el.selectionEnd = next.caret;
}

/** הקו התחתון שמסמן "אפשר לערוך" */
export function editableCellUnderline(color: string, editable = true): CSSProperties {
  return editable ? { borderBottom: `1px dashed ${color}` } : {};
}
