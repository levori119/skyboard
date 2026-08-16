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

import { denyReason } from '../db/undoJournal.js';

/** ציטוט מזהה. השמות מגיעים מקטלוג ה-DB, והבדיקה היא הגנת עומק. */
function ident(name) {
  const s = String(name);
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(s)) throw new Error(`שם לא חוקי: ${s}`);
  return `"${s}"`;
}

const qualified = (r) => `${ident(r.table_schema)}.${ident(r.table_name)}`;

/**
 * איתור השורה לפי המפתח הראשי דרך `to_jsonb(t) @> pk`.
 *
 * למה הכלה ולא `WHERE id = $1`: המפתח נשמר כ-JSONB גנרי (יש גם מפתחות
 * מורכבים), ובנייה של השוואה מוקלדת לכל עמודה הייתה מחייבת אותנו לנחש טיפוסים.
 * ההכלה משווה ערכי JSON לערכי JSON ומדויקת לכל טיפוס.
 *
 * המחיר הוא סריקה מלאה במקום שימוש באינדקס. מקובל כאן: ביטול הוא פעולה
 * נדירה שיוזם אדם, והוא נוגע בשורות של חמש הדקות האחרונות בלבד.
 */
const PK_MATCH = (alias) => `to_jsonb(${alias}) @> $1::jsonb`;

/** עמודות הטבלה **כפי שהן עכשיו** — ולא מפתחות ה-JSON שנשמרו. */
async function currentColumns(client, schema, table) {
  const { rows } = await client.query(
    `SELECT a.attname AS name
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`,
    [schema, table],
  );
  return rows.map(r => r.name);
}

/** השורה הנוכחית ב-DB, או null. */
async function currentRow(client, entry) {
  const { rows } = await client.query(
    `SELECT to_jsonb(t) AS row FROM ${qualified(entry)} t WHERE ${PK_MATCH('t')} LIMIT 1`,
    [JSON.stringify(entry.pk)],
  );
  return rows[0]?.row ?? null;
}

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
  const now = await currentRow(client, entry);

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
  const pk = JSON.stringify(entry.pk);
  const tbl = qualified(entry);

  if (entry.op === 'I') {
    await client.query(`DELETE FROM ${tbl} t WHERE ${PK_MATCH('t')}`, [pk]);
    return;
  }

  if (entry.op === 'D') {
    // `jsonb_populate_record` ממיר את ה-JSON חזרה לטיפוסי העמודות של הטבלה
    // עצמה — בלי שנצטרך לדעת אילו טיפוסים אלה.
    await client.query(
      `INSERT INTO ${tbl} SELECT * FROM jsonb_populate_record(NULL::${tbl}, $1::jsonb)`,
      [JSON.stringify(entry.before)],
    );
    return;
  }

  // U — החזרת הערכים. רק עמודות שקיימות **עכשיו**: אם עמודה נוספה או ירדה
  // מאז הפעולה, הביטול לא ינסה לכתוב לעמודה שאיננה ולא ייפול על כך.
  const cols = (await currentColumns(client, entry.table_schema, entry.table_name))
    .filter(c => Object.prototype.hasOwnProperty.call(entry.before, c));
  if (!cols.length) return;

  const list = cols.map(ident).join(', ');
  const src = `(SELECT ${cols.map(c => `r.${ident(c)}`).join(', ')} `
            + `FROM jsonb_populate_record(NULL::${tbl}, $2::jsonb) AS r)`;
  // צורת העמודה הבודדת אינה זהה לצורת הרשימה — PostgreSQL דורש הפרדה
  const setClause = cols.length === 1 ? `${list} = ${src}` : `(${list}) = ${src}`;

  await client.query(
    `UPDATE ${tbl} t SET ${setClause} WHERE ${PK_MATCH('t')}`,
    [pk, JSON.stringify(entry.before)],
  );
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
