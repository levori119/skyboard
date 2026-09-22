// איחוד יומן הפעולות המקומיות לפעולות נטו — מה באמת צריך להגיע למרכז.
//
// למה לאחד ולא לשדר מחדש שורה-שורה: פקח שגרר פ"מ על המפה במשך נתק של עשר
// דקות מייצר מאות שורות יומן לאותו פ"מ. שידור חוזר של כולן היה מריץ מאות
// כתיבות במרכז כדי להגיע בדיוק לאותה תוצאה, ובדרך היה מייצר מאות הזדמנויות
// לכישלון חלקי. פעולת נטו אחת לכל שורה היא גם מהירה וגם **ניתנת להכרעה**:
// יש לה מצב התחלה אחד ומצב סיום אחד, ולכן אפשר להציג לבקר סתירה אחת ולא מאה.
//
// שלוש הכרעות שקובעות את הנטו:
//   1. **הגרסה הבסיסית** (`baseRev`) נלקחת מה-`before` של השינוי **הראשון**
//      לאותה שורה - זו הגרסה שהמרכז החזיק כשהעמדה ראתה אותה לאחרונה. ה-rev
//      של השינויים שאחריו הוא מקומי בלבד ואינו אומר דבר על המרכז.
//   2. **התוכן** נלקח מה-`after` של השינוי **האחרון** - זה מה שעל המסך עכשיו.
//   3. **נוצרה ונמחקה באותו נתק** = לא קרה כלום. השורה הזו מעולם לא הייתה
//      במרכז, ואין מה למחוק שם. היא מאושרת ביומן ולא נדחפת.

import { tableDependencyRank } from '../db/foreign-keys.js';
import { VERSIONED_TABLES } from '../db/versionedTables.js';

/** ייצוג יציב של מפתח ראשי - סדר המפתחות אינו משנה. */
const stable = (obj) => JSON.stringify(
  Object.keys(obj || {}).sort().map(k => [k, obj[k]]),
);

/** מזהה שורה ליישום ה-coalesce: סכמה + טבלה + מפתח ראשי. */
export function rowKey(entry) {
  return `${entry.table_schema}.${entry.table_name}#${stable(entry.pk)}`;
}

// דירוג תלות: אב לפני בן. נגזר מ-`FOREIGN_KEYS` ומשותף עם המראה
// (`sync/mirror.js`), כי שני המנגנונים צריכים בדיוק את אותו סדר ורשימה ידנית
// הייתה מתיישנת ב-FK הבא שמישהו יוסיף.
const RANKS = tableDependencyRank(VERSIONED_TABLES);
const rankOf = (table) => RANKS.get(table) ?? 0;

/** ה-rev שהשורה נשאה, או null כשאין לטבלה מעקב גרסה. */
function revOf(row) {
  const v = row?.rev;
  return v === undefined || v === null || v === '' ? null : Number(v);
}

/**
 * מאחד שורות יומן (בסדר כתיבה עולה) לפעולות נטו.
 *
 * @param {Array} entries שורות `local_sync_journal`, ממוינות לפי `id`
 * @returns {Array} פעולות נטו, בסדר שבו מותר להחיל אותן במרכז
 */
export function coalesceJournal(entries) {
  const byRow = new Map();

  for (const e of entries) {
    const key = rowKey(e);
    let acc = byRow.get(key);
    if (!acc) {
      acc = {
        key,
        table_schema: e.table_schema,
        table_name: e.table_name,
        pk: e.pk,
        firstOp: e.op,
        lastOp: e.op,
        // הגרסה שהמרכז החזיק. ב-INSERT אין בסיס - השורה נולדה כאן.
        baseRev: e.op === 'I' ? null : revOf(e.before),
        row: e.after ?? null,
        firstSeen: Number(e.id),
        localAt: null,
        journalIds: [],
      };
      byRow.set(key, acc);
    }
    acc.lastOp = e.op;
    // מתי המפעיל עשה את זה בפועל - זה מה שמכריע בסנכרון ('האחרון מנצח').
    // `updated_at` של השורה עצמה קודם ל-`at` של היומן: הוא נקבע בטריגר הגרסה
    // באותה טרנזקציה, ולכן הוא הזמן של השינוי ולא של הרישום עליו.
    acc.localAt = (e.after && e.after.updated_at) || (e.before && e.before.updated_at) || e.at || acc.localAt;
    if (e.after) acc.row = e.after;
    acc.journalIds.push(Number(e.id));
  }

  const ops = [];
  for (const acc of byRow.values()) {
    let op;
    if (acc.firstOp === 'I' && acc.lastOp === 'D') {
      op = null;                       // נולדה ומתה כאן - המרכז לא ידע עליה מעולם
      acc.row = null;
    } else if (acc.lastOp === 'D') {
      op = 'D';
      acc.row = null;
    } else if (acc.firstOp === 'I') {
      op = 'I';
    } else {
      // עודכנה, או נמחקה ונוצרה מחדש באותו מפתח - בשני המקרים המרכז מחזיק
      // שורה קיימת שצריך לכתוב עליה.
      op = 'U';
    }
    ops.push({
      key: acc.key,
      table_schema: acc.table_schema,
      table_name: acc.table_name,
      pk: acc.pk,
      op,
      baseRev: acc.baseRev,
      row: acc.row,
      journalIds: acc.journalIds,
      firstSeen: acc.firstSeen,
      localAt: acc.localAt,
    });
  }

  // סדר ההחלה: קודם מה שיוצר ומעדכן (אב לפני בן), ואחר כך מה שמוחק (בן לפני
  // אב). `SET CONSTRAINTS ALL DEFERRED` בצד המחיל מכסה את מה שהסדר לבדו אינו
  // פותר, בדיוק כמו במנוע הביטול.
  return ops.sort((a, b) => {
    const pa = a.op === 'D' ? 1 : 0;
    const pb = b.op === 'D' ? 1 : 0;
    if (pa !== pb) return pa - pb;
    const ra = rankOf(a.table_name);
    const rb = rankOf(b.table_name);
    if (ra !== rb) return pa === 1 ? rb - ra : ra - rb;
    return a.firstSeen - b.firstSeen;
  });
}
