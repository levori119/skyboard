// מנוע הביטול — הופך את מה שהיומן רשם, בסדר הפוך, בטרנזקציה אחת.
//
// שלושה היפוכים בלבד, וכל השאר נגזר מהם:
//   נוצרה שורה (I)  → מחיקה
//   שונתה שורה (U)  → החזרת הערכים שב-`before`
//   נמחקה שורה (D)  → הכנסה מחדש מתוך `before`
//
// **הכל או כלום.** כשל באמצע מגלגל אחורה את הביטול כולו, והפעולה נשארת
// במחסנית. ביטול שהצליח חלקית היה משאיר מידע שדה במצב שאיש לא בחר בו —
// גרוע יותר מלא לבטל בכלל.
//
// הפרימיטיבים לכתיבת שורה מתוך JSONB יושבים ב-`db/rowOps.js` ומשותפים עם
// מנוע הסנכרון (`sync/apply.js`) — שעושה בדיוק את אותו דבר מהכיוון השני.

import { denyReason } from '../db/undoJournal.js';
import { currentRow, insertRow, updateRow, deleteRow } from '../db/rowOps.js';

/** השורה הנוכחית ב-DB, או null. */
const rowNow = (client, entry) =>
  currentRow(client, entry.table_schema, entry.table_name, entry.pk);

/**
 * האם מישהו נגע בשורה מאז הפעולה.
 *
 * ההשוואה היא מול `after` — צילום השורה **אחרי** שהפעולה הסתיימה, כולל
 * ה-`rev` שטריגר הגרסה העלה. לכן כל כתיבה מאוחרת יותר, גם מעמדה אחרת, מזיזה
 * את `rev` ונתפסת כאן. ראה UNDO_SPEC.md §5 מקרים 6-7.
 *
 * @returns {null | {type: 'changed'|'missing'|'exists', table: string}}
 */
export async function conflictFor(client, entry) {
  const now = await rowNow(client, entry);

  if (entry.op === 'D') {
    // מחקנו שורה ומישהו יצר אותה מחדש באותו מפתח — הכנסה חוזרת תיפול על המפתח
    return now ? { type: 'exists', table: entry.table_name } : null;
  }

  if (!now) {
    // השורה כבר איננה. ב-INSERT זה בדיוק מה שרצינו (מישהו הקדים אותנו);
    // ב-UPDATE אין למה להחזיר את הערכים.
    return entry.op === 'I' ? null : { type: 'missing', table: entry.table_name };
  }

  const same = JSON.stringify(now) === JSON.stringify(entry.after);
  return same ? null : { type: 'changed', table: entry.table_name };
}

/** בודק את כל שורות היומן ומחזיר את ההתנגשויות שנמצאו. */
export async function conflictsFor(client, entries) {
  const out = [];
  for (const entry of entries) {
    const c = await conflictFor(client, entry);
    if (c) out.push({ ...c, journalId: entry.id });
  }
  return out;
}

/** מבצע את ההיפוך של שורת יומן אחת. */
async function revertEntry(client, entry) {
  const { table_schema: schema, table_name: table, pk } = entry;

  if (entry.op === 'I') return void await deleteRow(client, schema, table, pk);
  if (entry.op === 'D') return void await insertRow(client, schema, table, entry.before);
  await updateRow(client, schema, table, pk, entry.before);
}

/**
 * מבטל פעולה שלמה. **הקורא אחראי לטרנזקציה** — כדי שגם בדיקת ההתנגשות וגם
 * ההיפוך יראו את אותו מצב DB, ולא ייווצר חלון שבו מישהו כותב ביניהם.
 *
 * @param entries שורות היומן של הפעולה, בסדר עולה (סדר הכתיבה המקורי)
 */
export async function revertEntries(client, entries) {
  // סדר הפוך: הבן נמחק לפני האב, והאב מוכנס לפני הבן. אילוצים נדחים מכסים
  // את מה שהסדר לבדו אינו פותר (מחזוריות בין טבלאות).
  try {
    await client.query('SET CONSTRAINTS ALL DEFERRED');
  } catch { /* אילוץ שאינו DEFERRABLE — הסדר ההפוך יטפל בו */ }

  for (let i = entries.length - 1; i >= 0; i--) {
    await revertEntry(client, entries[i]);
  }
}

/**
 * טבלה חסומה שהצליחה בכל זאת להיכנס ליומן (טריגר שלא הותקן, סכמה ישנה).
 * שכבת הגנה שנייה: הבדיקה בזמן הביטול ולא רק בזמן הרישום.
 */
export function blockedTableIn(entries) {
  for (const e of entries) {
    const reason = denyReason(e.table_name);
    if (reason) return { table: e.table_name, reason };
  }
  return null;
}
