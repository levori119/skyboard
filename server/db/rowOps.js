// כתיבת שורה גנרית מתוך JSONB - הפרימיטיבים שמשותפים לביטול ולסנכרון.
//
// שני המנגנונים עושים את אותו דבר בדיוק משני כיוונים: הביטול מחיל את `before`
// של שורת יומן, הסנכרון מחיל את `after`. עד שהקובץ הזה נוצר, הלוגיקה ישבה
// ב-`undo/revert.js` בלבד - וכל תיקון בה (עמודה שירדה, מפתח מורכב, טיפוס
// שצריך המרה) היה חייב להיכתב פעמיים ולהתפצל בפעם הראשונה שמישהו שכח.
//
// הכלל שמנחה את כולם: **לא לנחש טיפוסים.** השורה נשמרת ביומן כ-JSONB גנרי,
// ו-`jsonb_populate_record` הוא שמחזיר אותה לטיפוסי העמודות של הטבלה עצמה.
// בניית השוואות והמרות ביד הייתה נשברת על כל TIMESTAMPTZ, JSONB ומערך.

/** ציטוט מזהה. השמות מגיעים מקטלוג ה-DB, והבדיקה היא הגנת עומק. */
export function ident(name) {
  const s = String(name);
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(s)) throw new Error(`שם לא חוקי: ${s}`);
  return `"${s}"`;
}

/** `"schema"."table"` מתוך שורת יומן או מתוך שני שמות. */
export const qualified = (schema, table) =>
  typeof schema === 'object' && schema !== null
    ? `${ident(schema.table_schema)}.${ident(schema.table_name)}`
    : `${ident(schema)}.${ident(table)}`;

/**
 * איתור השורה לפי המפתח הראשי דרך `to_jsonb(t) @> pk`.
 *
 * למה הכלה ולא `WHERE id = $1`: המפתח נשמר כ-JSONB גנרי (יש גם מפתחות
 * מורכבים), ובנייה של השוואה מוקלדת לכל עמודה הייתה מחייבת אותנו לנחש טיפוסים.
 * ההכלה משווה ערכי JSON לערכי JSON ומדויקת לכל טיפוס.
 *
 * המחיר הוא סריקה מלאה במקום שימוש באינדקס - מקובל כאן, כי גם הביטול וגם
 * הסנכרון הם פעולות נדירות שאדם יוזם, על עשרות שורות לכל היותר.
 */
export const PK_MATCH = (alias) => `to_jsonb(${alias}) @> $1::jsonb`;

/** עמודות הטבלה **כפי שהן עכשיו** - ולא מפתחות ה-JSON שנשמרו. */
export async function currentColumns(client, schema, table) {
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

/** השורה הנוכחית ב-DB כ-JSONB, או null. */
export async function currentRow(client, schema, table, pk) {
  const { rows } = await client.query(
    `SELECT to_jsonb(t) AS row FROM ${qualified(schema, table)} t WHERE ${PK_MATCH('t')} LIMIT 1`,
    [JSON.stringify(pk)],
  );
  return rows[0]?.row ?? null;
}

/**
 * מכניס שורה מתוך JSONB - **רק את העמודות שיש בה**.
 *
 * ⚠️ הצורה הקצרה (`INSERT INTO t SELECT * FROM jsonb_populate_record(...)`)
 * נראית נקייה יותר והיא שגויה: עמודה שאינה ב-JSON מקבלת שם `NULL` **במקום
 * ברירת המחדל שלה**. שורה חלקית נופלת על `rev NOT NULL`, או גרוע מזה מאפסת
 * ערך תפעולי בשקט. רשימת עמודות מפורשת משאירה את מה שלא נשלח בברירת המחדל.
 *
 * העמודות נלקחות מהטבלה **כפי שהיא עכשיו**, ולכן מפתח שקיים ב-JSON ואינו
 * עמודה עוד פשוט מדולג.
 */
export async function insertRow(client, schema, table, row) {
  const tbl = qualified(schema, table);
  const cols = (await currentColumns(client, schema, table))
    .filter(c => Object.prototype.hasOwnProperty.call(row, c));
  if (!cols.length) return;

  await client.query(
    `INSERT INTO ${tbl} (${cols.map(ident).join(', ')})
     SELECT ${cols.map(c => `r.${ident(c)}`).join(', ')}
       FROM jsonb_populate_record(NULL::${tbl}, $1::jsonb) AS r`,
    [JSON.stringify(row)],
  );
}

/**
 * כותב על שורה קיימת את העמודות שב-`row`.
 *
 * רק עמודות שקיימות **עכשיו**: אם עמודה נוספה או ירדה מאז שהשורה נרשמה
 * ביומן, הכתיבה לא תנסה לגעת בעמודה שאיננה ולא תיפול על כך.
 *
 * @param {string[]} [skip] עמודות שלא לכתוב (למשל `rev`, שהטריגר מתחזק)
 */
export async function updateRow(client, schema, table, pk, row, skip = []) {
  const tbl = qualified(schema, table);
  const skipSet = new Set(skip);
  const cols = (await currentColumns(client, schema, table))
    .filter(c => !skipSet.has(c) && Object.prototype.hasOwnProperty.call(row, c));
  if (!cols.length) return 0;

  const list = cols.map(ident).join(', ');
  const src = `(SELECT ${cols.map(c => `r.${ident(c)}`).join(', ')} `
            + `FROM jsonb_populate_record(NULL::${tbl}, $2::jsonb) AS r)`;
  // צורת העמודה הבודדת אינה זהה לצורת הרשימה - PostgreSQL דורש הפרדה
  const setClause = cols.length === 1 ? `${list} = ${src}` : `(${list}) = ${src}`;

  const res = await client.query(
    `UPDATE ${tbl} t SET ${setClause} WHERE ${PK_MATCH('t')}`,
    [JSON.stringify(pk), JSON.stringify(row)],
  );
  return res.rowCount ?? 0;
}

/** מוחק שורה לפי מפתח ראשי. */
export async function deleteRow(client, schema, table, pk) {
  const res = await client.query(
    `DELETE FROM ${qualified(schema, table)} t WHERE ${PK_MATCH('t')}`,
    [JSON.stringify(pk)],
  );
  return res.rowCount ?? 0;
}
