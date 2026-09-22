// החלת פעולת סנכרון במרכז - ומי מנצח כששני הצדדים נגעו באותה שורה.
//
// **המדיניות: האחרון מנצח (last write wins).** מי שעדכן מאוחר יותר הוא התמונה
// הנכונה, והמערכת מכריעה **לבדה** ולא עוצרת את הבקר.
//
// למה כך, ולא "שתי גרסאות להכרעת הבקר": במציאות התפעולית של SKY-KING פעילה
// בכל רגע נתון **עמדה אחת מכל סוג**, ולכן פ"מ שנגרר בעמדה מנותקת כמעט לעולם
// אינו נגוע בו-זמנית במרכז. מסך הכרעה היה עוצר את הבקר אחרי כל נתק כדי לאשר
// את מה שממילא נכון - כלומר צעד נוסף מול הסדק, בדיוק מה ש-SKY-KING בא למנוע.
// המקרה הנדיר שבו כן היו שתי נגיעות נפתר לפי הזמן, ונרשם כדי שיהיה **גלוי**.
//
// `rev` לא נזרק - הוא עדיין מה שמזהה ששני הצדדים נגעו באותה שורה. הוא פשוט
// אינו עוצר עוד את הזרימה: הוא מדליק את ההשוואה, וההשוואה מכריעה.
//
// ⚠️ **שעונים.** הזמן בעמדה והזמן במרכז אינם אותו שעון. לכן העמדה שולחת את
// השעה שלה בדחיפה, השרת מודד את ההפרש (`skewMs`) ומתרגם את זמן העמדה לשעון
// שלו לפני ההשוואה. בלי זה עמדה שהשעון שלה מקדים בעשר דקות הייתה **תמיד**
// מנצחת, ועמדה שמפגרת - תמיד מפסידה.
//
// ⚠️ **הסכמה נקבעת בשרת ולא בבקשה.** שורת היומן נושאת את הסכמה שבה נכתבה
// בעמדה, אבל המרכז מחיל אותה בסכמת הסביבה של **הבקשה** (`X-Env`). עמדה
// שתשלח `table_schema: 'public'` מתוך תרגול לא תוכל לכתוב לסביבה האמיתית.

import { VERSIONED_TABLES } from '../db/versionedTables.js';
import { currentRow, insertRow, updateRow, deleteRow } from '../db/rowOps.js';

/** עמודות שהמרכז מתחזק בעצמו (טריגר `skyking_touch_row`) ולא נכתבות מהעמדה. */
const SERVER_OWNED = ['rev', 'updated_at'];

/** מדיניות ההכרעה. */
export const POLICY = {
  /** האחרון מנצח - ברירת המחדל, והמדיניות התפעולית של SKY-KING */
  LWW: 'lww',
  /** אל תכריע - החזר סתירה. נשמר למקרים שבהם הכרעה אוטומטית אסורה */
  ASK: 'ask',
};

/** תוצאות אפשריות לפעולה אחת. */
export const RESULT = {
  /** נכתב במרכז */
  APPLIED: 'applied',
  /** המרכז עודכן מאוחר יותר - גרסתו מנצחת, והעמדה מאמצת אותה */
  SUPERSEDED: 'superseded',
  /** אין מה לעשות (נוצרה ונמחקה בנתק) */
  SKIPPED: 'skipped',
  /** אי אפשר היה להכריע אוטומטית - עולה לבקר */
  CONFLICT: 'conflict',
  ERROR: 'error',
};

/** למה ההכרעה נפלה כך - הקוד שהממשק מתרגם למשפט לבקר. */
export const REASON = {
  NEWER_HERE: 'newer_here',       // העמדה עדכנה מאוחר יותר
  NEWER_THERE: 'newer_there',     // המרכז עודכן מאוחר יותר
  DELETED_THERE: 'deleted_there', // השורה נמחקה במרכז בזמן הנתק
  NO_TIMESTAMP: 'no_timestamp',   // אין על מה להשוות - הבקר יכריע
  LOCAL_ONLY: 'local_only',       // נוצרה ונמחקה בנתק
  NOT_SYNCED: 'not_synced',       // טבלה שאינה ברשימת הסנכרון
};

const revOf = (row) => {
  const v = row?.rev;
  return v === undefined || v === null || v === '' ? null : Number(v);
};

/** מתרגם חותמת זמן למילישניות, או NaN. */
const msOf = (v) => (v == null ? NaN : new Date(v).getTime());

/**
 * מי עדכן מאוחר יותר.
 *
 * `skewMs` מתרגם את שעון העמדה לשעון השרת. שוויון נחשב לטובת העמדה: היא הצד
 * שהמפעיל ראה לאחרונה, ובתיקו עדיף לכבד את מה שעל המסך שלו.
 *
 * @returns {'mine'|'theirs'|null} null כשאין חותמת ואי אפשר להשוות
 */
export function decideByTime(localAt, serverAt, skewMs = 0) {
  const local = msOf(localAt);
  const server = msOf(serverAt);
  if (Number.isNaN(local) || Number.isNaN(server)) return null;
  return (local + skewMs) >= server ? 'mine' : 'theirs';
}

/**
 * מחיל פעולת נטו אחת. **הקורא אחראי לטרנזקציה.**
 *
 * @param client   connection בתוך טרנזקציה
 * @param op       פעולת נטו מ-`coalesceJournal`
 * @param schema   סכמת היעד - נקבעת בשרת, לא בבקשה
 * @param {{force?: boolean, policy?: string, skewMs?: number}} [opts]
 *   `force` - הבקר הפך הכרעה ידנית; כותבים בלי להשוות.
 *   `policy` - `lww` (ברירת מחדל) או `ask`.
 *   `skewMs` - הפרש השעונים בין העמדה למרכז.
 */
export async function applyOp(client, op, schema, opts = {}) {
  const table = op.table_name;
  const base = { key: op.key, table_name: table, pk: op.pk, journalIds: op.journalIds || [] };
  const { force = false, policy = POLICY.LWW, skewMs = 0 } = opts;

  // נוצרה ונמחקה בזמן הנתק - אין מה לדחוף, והשורות ביומן מאושרות
  if (!op.op) return { ...base, status: RESULT.SKIPPED, reason: REASON.LOCAL_ONLY };

  // רשימה סגורה: עמדה אינה יכולה לדחוף שורות לטבלה שלא הוגדרה כמסונכרנת
  if (!VERSIONED_TABLES.includes(table)) {
    return { ...base, status: RESULT.ERROR, reason: REASON.NOT_SYNCED };
  }

  const now = await currentRow(client, schema, table, op.pk);

  /** מכריע בין שתי גרסאות קיימות. `null` = אין הכרעה אוטומטית. */
  const decide = () => {
    if (force) return 'mine';
    if (policy !== POLICY.LWW) return null;
    return decideByTime(op.localAt, now?.updated_at, skewMs);
  };

  const theirs = (reason) => ({
    ...base, status: RESULT.SUPERSEDED, reason, resolved: 'theirs', serverRow: now,
  });
  const undecided = () => ({
    ...base, status: RESULT.CONFLICT, reason: REASON.NO_TIMESTAMP, serverRow: now,
  });

  // ── מחיקה ────────────────────────────────────────────────────────────────
  if (op.op === 'D') {
    // כבר אינה שם - זו בדיוק התוצאה שביקשנו. מחיקה היא אידמפוטנטית.
    if (!now) return { ...base, status: RESULT.APPLIED };
    if (!force && op.baseRev !== null && revOf(now) !== op.baseRev) {
      const who = decide();
      if (who === null) return undecided();
      // מישהו עדכן את השורה אחרי המחיקה שלנו - היא חיה, ואנחנו מאמצים
      if (who === 'theirs') return theirs(REASON.NEWER_THERE);
    }
    await deleteRow(client, schema, table, op.pk);
    return { ...base, status: RESULT.APPLIED, reason: REASON.NEWER_HERE, resolved: 'mine', serverRow: now };
  }

  // ── הכנסה ────────────────────────────────────────────────────────────────
  if (op.op === 'I') {
    // המקרה הרגיל: מזהה מהטווח המקומי, איש אינו מחזיק אותו במרכז
    if (!now) {
      await insertRow(client, schema, table, op.row);
      return { ...base, status: RESULT.APPLIED };
    }
    const who = decide();
    if (who === null) return undecided();
    if (who === 'theirs') return theirs(REASON.NEWER_THERE);
    await updateRow(client, schema, table, op.pk, op.row, SERVER_OWNED);
    return { ...base, status: RESULT.APPLIED, reason: REASON.NEWER_HERE, resolved: 'mine', serverRow: now };
  }

  // ── עדכון ────────────────────────────────────────────────────────────────
  if (!now) {
    // השורה נמחקה במרכז בזמן הנתק. **המחיקה מנצחת**, ואינה נשקלת מול הזמן:
    // מחיקה במרכז היא פעולה מכוונת (פ"מ שנחת והוסר), ושחזור השורה היה מחזיר
    // מטוס רפאים למפה. אין גם מה להשוות - לא נשארה שורה שנושאת חותמת.
    if (force) {
      await insertRow(client, schema, table, op.row);
      return { ...base, status: RESULT.APPLIED, reason: REASON.NEWER_HERE, resolved: 'mine' };
    }
    return {
      ...base, status: RESULT.SUPERSEDED, reason: REASON.DELETED_THERE,
      resolved: 'theirs', serverRow: null,
    };
  }

  if (!force && op.baseRev !== null && revOf(now) !== op.baseRev) {
    const who = decide();
    if (who === null) return undecided();
    if (who === 'theirs') return theirs(REASON.NEWER_THERE);
    await updateRow(client, schema, table, op.pk, op.row, SERVER_OWNED);
    return { ...base, status: RESULT.APPLIED, reason: REASON.NEWER_HERE, resolved: 'mine', serverRow: now };
  }

  // איש לא נגע - הנתיב המהיר, וגם הנפוץ ביותר בפועל
  await updateRow(client, schema, table, op.pk, op.row, SERVER_OWNED);
  return { ...base, status: RESULT.APPLIED };
}

/**
 * מחיל רשימת פעולות. **הקורא אחראי לטרנזקציה.**
 *
 * שורה שהוכרעה לרעת העמדה אינה מפילה את השאר: היא מסומנת `superseded` וממשיכים
 * הלאה. הכל-או-כלום של הביטול אינו מתאים כאן - נתק של משמרת מייצר עשרות
 * פעולות, ופסילת כולן בגלל פ"מ אחד הייתה מוחקת שעה של עבודה.
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
