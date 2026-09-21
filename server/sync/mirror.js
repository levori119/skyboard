// המראה - מה שהמרכז שולח לעמדה כל עוד יש קשר, כדי שיהיה לה על מה לעבוד בנתק.
//
// בלי המראה כל שאר הסנכרון הוא תיאטרון: המאגר המקומי עולה **ריק**, ועמדה
// שמתנתקת עוברת למאגר שאין בו פ"מ אחד. המראה היא מה שהופך את המאגר המקומי
// מ"מקום לכתוב אליו" ל"תמונת המצב של השדה לפני רגע".
//
// היא גם מה שנותן לסנכרון את נקודת הייחוס שלו: ה-`rev` שהגיע במראה הוא הגרסה
// שהמרכז החזיק, ולכן ה-`before` של השינוי המקומי הראשון נושא אותה - וזה מה
// שמכריע אחר כך אם מישהו אחר נגע בשורה. ראה `sync/apply.js`.
//
// ⚠️ **קליטת מראה אינה עבודה של מפעיל.** היא רצה תחת `withoutJournal`, אחרת
// כל שורה שהמרכז שלח הייתה נרשמת ביומן ונדחפת אליו בחזרה - לולאה שמייצרת
// סתירות יש מאין.

import { OPERATIONAL_TABLES, CONFIG_TABLES } from '../db/env-tables.js';
import { VERSIONED_TABLES } from '../db/versionedTables.js';
import { withoutJournal } from '../db/syncJournal.js';
import { ident, qualified, currentColumns } from '../db/rowOps.js';
import { isLocalId } from '../db/localIds.js';

/**
 * טבלאות שאינן נשלחות במראה, והסיבה לצד כל אחת.
 *
 * המשותף לכולן: כבדות מאוד ביחס לתועלת בנתק. `maps.image_data` הוא base64 של
 * מפה סרוקה - מגה-בייטים לשורה, והדפדפן כבר מטמן אותו דרך ETag. יומן הביקורת
 * וחומרי הלמידה אינם נדרשים כדי להמשיך לעבוד.
 */
export const MIRROR_DENYLIST = [
  ['maps', 'base64 של מפה סרוקה - מגה-בייטים לשורה, וכבר מטומן בדפדפן'],
  ['translations', 'מחרוזות הממשק נטענות ל-cache של הדפדפן בכניסה'],
  ['learned_digits', 'נתוני אימון של זיהוי כתב יד - לא נדרשים לעבודה'],
  ['learned_strokes', 'נתוני אימון של זיהוי כתב יד - לא נדרשים לעבודה'],
  ['reader_docs', 'מסמכי חלון הקריאה - קבצים כבדים שאינם מידע שדה'],
  ['activity_log', 'יומן ביקורת - נצבר ללא גבול, ואינו נדרש לעבודה בנתק'],
  ['screen_recording_sessions', 'מקטעי הקלטה - קבצים על דיסק הרשת'],
];

const DENIED = new Set(MIRROR_DENYLIST.map(([t]) => t));

/**
 * הטבלאות שהמראה מעבירה: מידע שדה חי + ההגדרות שבלעדיהן אין מה לצייר.
 *
 * למה גם קונפיג: עמדה מנותקת שיש לה פ"מים בלי סקטורים, בלי עמדות ובלי שדה -
 * אינה יכולה להציג דבר. הקונפיג משתנה לעתים רחוקות, ולכן הוא זול לשלוח.
 */
export const MIRROR_TABLES = [...OPERATIONAL_TABLES, ...CONFIG_TABLES]
  .filter(t => !DENIED.has(t));

/**
 * הטבלאות שהמראה **מוחקת** בהן שורות שנעלמו במרכז.
 *
 * רק חמש הטבלאות המסונכרנות: שם מחיקה במרכז היא אירוע תפעולי שחייב להגיע
 * לעמדה (פ"מ שנחת ונמחק אינו יכול להמשיך לרחף על המפה). בשאר - מחיקה שקטה
 * של שורה שהעמדה מצפה לה מסוכנת יותר מלהשאיר שורה ישנה.
 */
const REPLACE_TABLES = new Set(VERSIONED_TABLES);

/** אילו טבלאות באמת קיימות בסכמה - גרסאות שונות בין מרכז לעמדה קורות. */
async function existingTables(client, schema, tables) {
  const { rows } = await client.query(
    `SELECT c.relname AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname = ANY($2::text[])`,
    [schema, tables],
  );
  return rows.map(r => r.name);
}

/** עמודות המפתח הראשי של טבלה, לפי הקטלוג. */
async function pkColumns(client, schema, table) {
  const { rows } = await client.query(
    `SELECT a.attname AS name
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      WHERE n.nspname = $1 AND c.relname = $2 AND i.indisprimary
      ORDER BY k.ord`,
    [schema, table],
  );
  return rows.map(r => r.name);
}

/** תקרת שורות לטבלה. מעבר לה השורות נחתכות והדגל `truncated` עולה. */
export const MIRROR_ROW_CAP = 20000;

/**
 * צילום המרכז לשליחה לעמדה.
 *
 * @returns {Promise<{schema: string, at: string, tables: Array<{table: string, rows: object[], truncated: boolean}>}>}
 */
export async function snapshotTables(client, schema, tables = MIRROR_TABLES) {
  const present = await existingTables(client, schema, tables);
  const out = [];
  for (const table of present) {
    const { rows } = await client.query(
      `SELECT to_jsonb(t) AS row FROM ${qualified(schema, table)} t LIMIT ${MIRROR_ROW_CAP + 1}`,
    );
    const truncated = rows.length > MIRROR_ROW_CAP;
    out.push({
      table,
      rows: rows.slice(0, MIRROR_ROW_CAP).map(r => r.row),
      truncated,
    });
  }
  return { schema, at: new Date().toISOString(), tables: out };
}

/** מפתח יציב לשורה - חייב להיות זהה לזה שביומן (`coalesce.rowKey`). */
const keyOf = (table, pk) =>
  `${table}#${JSON.stringify(Object.keys(pk).sort().map(k => [k, pk[k]]))}`;

/**
 * קולטת צילום מהמרכז לתוך המאגר המקומי.
 *
 * שלושה כללים, וכולם נובעים מאותו עיקרון - **המראה לעולם אינה דורסת עבודה
 * שטרם סונכרנה**:
 *   1. שורה שיש לה רשומה ממתינה ביומן מדולגת. מה שהפקח שינה נשאר על המסך עד
 *      שהוא נדחף או שהסתירה מוכרעת.
 *   2. שורה שנוצרה בעמדה (מזהה בטווח המקומי) אינה נמחקת, גם אם אינה בצילום -
 *      המרכז פשוט עוד לא יודע עליה.
 *   3. מחיקה מתבצעת רק בחמש הטבלאות המסונכרנות. ראה REPLACE_TABLES.
 *
 * @param {Set<string>} pendingKeys מפתחות שורה שממתינים ביומן (`table#pk`)
 */
export async function ingestSnapshot(client, schema, snapshot, pendingKeys = new Set()) {
  const stats = { tables: 0, upserted: 0, deleted: 0, skipped: 0 };
  const present = new Set(await existingTables(client, schema, snapshot.tables.map(t => t.table)));

  await withoutJournal(client, async () => {
    try {
      await client.query('SET CONSTRAINTS ALL DEFERRED');
    } catch { /* אילוץ שאינו DEFERRABLE - סדר הטבלאות בצילום מטפל ברוב */ }

    for (const { table, rows } of snapshot.tables) {
      if (!present.has(table)) continue;
      const pkCols = await pkColumns(client, schema, table);
      if (!pkCols.length) continue; // בלי מפתח ראשי אין upsert
      const cols = await currentColumns(client, schema, table);
      const tbl = qualified(schema, table);
      const seen = new Set();
      stats.tables++;

      for (const row of rows) {
        const pk = Object.fromEntries(pkCols.map(c => [c, row[c]]));
        const key = keyOf(table, pk);
        seen.add(key);
        if (pendingKeys.has(key)) { stats.skipped++; continue; }

        // `jsonb_populate_record` ממיר את ה-JSON לטיפוסי העמודות של הטבלה
        // עצמה - בלי שנצטרך לדעת אילו הם. עמודה שקיימת רק באחד הצדדים
        // (גרסאות שונות) פשוט אינה נכתבת.
        const writable = cols.filter(c => Object.prototype.hasOwnProperty.call(row, c));
        const list = writable.map(ident).join(', ');
        const setList = writable
          .filter(c => !pkCols.includes(c))
          .map(c => `${ident(c)} = EXCLUDED.${ident(c)}`)
          .join(', ');
        const conflict = setList
          ? `ON CONFLICT (${pkCols.map(ident).join(', ')}) DO UPDATE SET ${setList}`
          : `ON CONFLICT DO NOTHING`;
        await client.query(
          `INSERT INTO ${tbl} (${list})
           SELECT ${writable.map(c => `r.${ident(c)}`).join(', ')}
             FROM jsonb_populate_record(NULL::${tbl}, $1::jsonb) AS r
           ${conflict}`,
          [JSON.stringify(row)],
        );
        stats.upserted++;
      }

      if (!REPLACE_TABLES.has(table)) continue;

      // מה שנעלם במרכז נמחק גם כאן - פרט למה שנולד בעמדה ולמה שממתין ביומן.
      const local = await client.query(
        `SELECT to_jsonb(t) AS row FROM ${tbl} t`);
      for (const { row } of local.rows) {
        const pk = Object.fromEntries(pkCols.map(c => [c, row[c]]));
        const key = keyOf(table, pk);
        if (seen.has(key) || pendingKeys.has(key)) continue;
        if (pkCols.length === 1 && isLocalId(pk[pkCols[0]])) continue;
        await client.query(
          `DELETE FROM ${tbl} t WHERE to_jsonb(t) @> $1::jsonb`, [JSON.stringify(pk)]);
        stats.deleted++;
      }
    }
  });

  return stats;
}

export { keyOf as mirrorRowKey };
