// הקשר הפעולה של הבקשה הנוכחית (AsyncLocalStorage) — אחיו של env-context.js.
//
// **פעולה** = בקשת כתיבה אחת של מפעיל. זו יחידת הביטול (UNDO_SPEC.md §1).
//
// למה מזהה פעולה ולא `txid_current()`: handler טיפוסי מריץ כמה `pool.query`,
// כל אחת בטרנזקציה משלה. txid היה מפצל לחיצה אחת של הפקח לחמישה ביטולים
// נפרדים. המזהה הזה נושא את **אותו** ערך על פני כל השאילתות של הבקשה,
// ו-pool.js מציב אותו ב-`SET LOCAL app.action_id` בתוך כל טרנזקציה.
//
// ה-middleware (server/middleware/actionContext.js) קובע אותו פעם אחת;
// pool.js קורא אותו בכל כתיבה; הטריגר ב-DB קורא את ה-GUC.
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

/** מזהה הפעולה הנוכחית, או '' כשאין (רקע, אתחול, קליטה חיצונית). */
export function currentActionId() {
  return als.getStore()?.actionId || '';
}

/** מריץ fn תחת מזהה פעולה. כל כתיבה בתוכו תירשם ביומן הביטול. */
export function runWithAction(actionId, fn) {
  return als.run({ actionId: String(actionId || '') }, fn);
}

/**
 * מריץ fn **בלי** הקשר פעולה, גם בתוך בקשה שיש לה אחד.
 *
 * נחוץ לכתיבות שירות שנלוות לפעולה ואינן חלק ממנה — יצירת שורת הפעולה עצמה,
 * גיזום היומן, ורישום ל-`activity_log`. בלי זה, פעולת השירות הראשונה הייתה
 * מנסה לרשום את עצמה ליומן שלה.
 */
export function withoutAction(fn) {
  return als.run({ actionId: '' }, fn);
}
