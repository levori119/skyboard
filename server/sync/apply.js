// החלת פעולת סנכרון במרכז - והשאלה היחידה שחשובה: נגע בזה מישהו אחר?
//
// התשובה היא `rev`. הגרסה הבסיסית שהעמדה שלחה היא זו שהמרכז החזיק כשהיא ראתה
// את השורה לאחרונה. אם `rev` במרכז זהה לה - איש לא נגע, והכתיבה עוברת. אם הוא
// גבוה יותר - עמדה אחרת שינתה את השורה בזמן הנתק, והמערכת **אינה מכריעה**:
// היא מסמנת סתירה ומעלה אותה לבקר. בקרת טיסה לא מנחשת מי צודק.
//
// למה לא "האחרון כותב מנצח": פ"מ שהועבר לעמדה אחרת בזמן שהעמדה המנותקת גררה
// אותו על המפה - דחיפה שקטה הייתה מחזירה אותו לעמדה שכבר לא מחזיקה בו, ואיש
// לא היה יודע. זה בדיוק התרחיש שההעברות בנויות למנוע.
//
// ⚠️ **הסכמה נקבעת בשרת ולא בבקשה.** שורת היומן נושאת את הסכמה שבה נכתבה
// בעמדה, אבל המרכז מחיל אותה בסכמת הסביבה של **הבקשה** (`X-Env`). עמדה
// שתשלח `table_schema: 'public'` מתוך תרגול לא תוכל לכתוב לסביבה האמיתית.

import { VERSIONED_TABLES } from '../db/versionedTables.js';
import { currentRow, insertRow, updateRow, deleteRow } from '../db/rowOps.js';

/** עמודות שהמרכז מתחזק בעצמו (טריגר `skyking_touch_row`) ולא נכתבות מהעמדה. */
const SERVER_OWNED = ['rev', 'updated_at'];

/** תוצאות אפשריות לפעולה אחת. */
export const RESULT = {
  APPLIED: 'applied',
  CONFLICT: 'conflict',
  SKIPPED: 'skipped',
  ERROR: 'error',
};

/** סיבות סתירה - הקוד שהממשק מתרגם למשפט לבקר. */
export const REASON = {
  CHANGED: 'changed',   // עמדה אחרת שינתה את השורה בזמן הנתק
  MISSING: 'missing',   // השורה כבר אינה קיימת במרכז
  EXISTS: 'exists',     // המפתח כבר תפוס במרכז
  LOCAL_ONLY: 'local_only', // נוצרה ונמחקה בנתק - המרכז לא ידע עליה מעולם
  NOT_SYNCED: 'not_synced', // טבלה שאינה ברשימת הסנכרון
};

const revOf = (row) => {
  const v = row?.rev;
  return v === undefined || v === null || v === '' ? null : Number(v);
};

/**
 * מחיל פעולת נטו אחת. **הקורא אחראי לטרנזקציה.**
 *
 * @param client   connection בתוך טרנזקציה
 * @param op       פעולת נטו מ-`coalesceJournal`
 * @param schema   סכמת היעד - נקבעת בשרת, לא בבקשה
 * @param {{force?: boolean}} [opts] `force` מדלג על בדיקת הגרסה (הבקר בחר "הגרסה שלי")
 */
export async function applyOp(client, op, schema, opts = {}) {
  const table = op.table_name;
  const base = { key: op.key, table_name: table, pk: op.pk, journalIds: op.journalIds || [] };

  // נוצרה ונמחקה בזמן הנתק - אין מה לדחוף, והשורות ביומן מאושרות
  if (!op.op) return { ...base, status: RESULT.SKIPPED, reason: REASON.LOCAL_ONLY };

  // רשימה סגורה: עמדה אינה יכולה לדחוף שורות לטבלה שלא הוגדרה כמסונכרנת
  if (!VERSIONED_TABLES.includes(table)) {
    return { ...base, status: RESULT.ERROR, reason: REASON.NOT_SYNCED };
  }

  const now = await currentRow(client, schema, table, op.pk);
  const force = !!opts.force;

  if (op.op === 'I') {
    if (now) {
      // המפתח תפוס. בכפייה זו כתיבה על הקיים, אחרת סתירה להכרעת הבקר.
      if (!force) return { ...base, status: RESULT.CONFLICT, reason: REASON.EXISTS, serverRow: now };
      await updateRow(client, schema, table, op.pk, op.row, SERVER_OWNED);
      return { ...base, status: RESULT.APPLIED };
    }
    await insertRow(client, schema, table, op.row);
    return { ...base, status: RESULT.APPLIED };
  }

  if (op.op === 'D') {
    // כבר אינה שם - זו בדיוק התוצאה שביקשנו. מחיקה היא אידמפוטנטית.
    if (!now) return { ...base, status: RESULT.APPLIED };
    if (!force && op.baseRev !== null && revOf(now) !== op.baseRev) {
      return { ...base, status: RESULT.CONFLICT, reason: REASON.CHANGED, serverRow: now };
    }
    await deleteRow(client, schema, table, op.pk);
    return { ...base, status: RESULT.APPLIED };
  }

  // U
  if (!now) {
    // בכפייה - השורה נוצרת מחדש מהגרסה המקומית. אחרת: הבקר יכריע אם היא
    // נמחקה בכוונה במרכז או שהעדכון שלו חשוב יותר.
    if (!force) return { ...base, status: RESULT.CONFLICT, reason: REASON.MISSING, serverRow: null };
    await insertRow(client, schema, table, op.row);
    return { ...base, status: RESULT.APPLIED };
  }
  if (!force && op.baseRev !== null && revOf(now) !== op.baseRev) {
    return { ...base, status: RESULT.CONFLICT, reason: REASON.CHANGED, serverRow: now };
  }
  await updateRow(client, schema, table, op.pk, op.row, SERVER_OWNED);
  return { ...base, status: RESULT.APPLIED };
}

/**
 * מחיל רשימת פעולות. **הקורא אחראי לטרנזקציה.**
 *
 * סתירה אינה מפילה את השאר: פעולה שנתקלה בה מסומנת ועוברים הלאה. הכל-או-כלום
 * של הביטול אינו מתאים כאן - נתק של משמרת מייצר עשרות פעולות, ופסילת כולן
 * בגלל פ"מ אחד שעמדה אחרת נגעה בו הייתה מוחקת שעה של עבודה.
 */
export async function applyOps(client, ops, schema, opts = {}) {
  try {
    await client.query('SET CONSTRAINTS ALL DEFERRED');
  } catch { /* אילוץ שאינו DEFERRABLE - סדר ההחלה מ-coalesce מטפל בו */ }

  const results = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const sp = `sync_op_${i}`;
    // ⚠️ SAVEPOINT הכרחי: ב-Postgres שגיאה מבטלת את **כל** הטרנזקציה, ובלעדיו
    // כל פעולה שאחרי הכושלת הייתה נופלת ב-"current transaction is aborted"
    // וכל הדחיפה הייתה מתה בגלל שורה אחת.
    await client.query(`SAVEPOINT ${sp}`);
    try {
      const r = await applyOp(client, op, schema, opts);
      if (r.status === RESULT.ERROR) await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      await client.query(`RELEASE SAVEPOINT ${sp}`);
      results.push(r);
    } catch (err) {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      await client.query(`RELEASE SAVEPOINT ${sp}`);
      // כשל נקודתי (אילוץ, טיפוס) - נרשם על הפעולה ואינו מפיל את הדחיפה.
      results.push({
        key: op.key, table_name: op.table_name, pk: op.pk,
        journalIds: op.journalIds || [],
        status: RESULT.ERROR, reason: 'apply_failed', error: String(err?.message || err),
      });
    }
  }
  return results;
}
