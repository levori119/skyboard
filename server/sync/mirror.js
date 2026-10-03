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
import { sortByDependency } from '../db/foreign-keys.js';
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
// ⚠️ **ממוינות אב לפני בן.** בלי זה הצילום נשלח בסדר שבו הרשימות כתובות
// (תפעולי לפני קונפיג), כלומר פ"מ לפני הסקטור שהוא מצביע אליו - וקליטת
// המראה נופלת על "מפתח זר אינו קיים". נתפס בבדיקת הקצה-לקצה של העמדה.
export const MIRROR_TABLES = sortByDependency(
  [...OPERATIONAL_TABLES, ...CONFIG_TABLES].filter(t => !DENIED.has(t)),
);

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
 * כמה שורות דחויות נשמרות לניסיון חוזר.
 *
 * תקרה ולא "הכל": שגיאה שיטתית (סכמה שהתפצלה בין הצדדים) הייתה מציפה את
 * הזיכרון של העמדה בשורות שלעולם לא ייכנסו.
 */
export const MAX_DEFERRED = 5000;

/**
 * צילום המרכז לשליחה לעמדה.
 *
 * @returns {Promise<{schema: string, at: string, tables: Array<{table: string, rows: object[], truncated: boolean}>}>}
 */
export async function snapshotTables(client, schema, tables = MIRROR_TABLES) {
  const present = sortByDependency(await existingTables(client, schema, tables));
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

// ── הסיבוב המהיר: רק מה שהשתנה ────────────────────────────────────────────────
//
// **הבעיה:** הצילום המלא הוא 128 טבלאות, 4.6MB ו-70 שניות מול הייצור, ולכן הוא
// רץ כל 5 דקות. המשמעות התפעולית היא שהעתק העמדה מפגר אחרי המרכז עד 5 דקות -
// ובמשמרת פעילה זה נצח. "שיסתנכרן כל הזמן" (הכרעת אורי) מחייב סיבוב שעלותו
// קרובה לאפס כשאין שינויים.
//
// **מה הסיבוב המהיר מכסה:** שש הטבלאות שמשתנות תוך כדי משמרת - אלה שנושאות
// `rev`/`updated_at` (`versionedTables.js`). השאר הן הגדרות שמשתנות בניהול
// ונשארות באחריות הסיבוב המלא.
//
// ⚠️ **מחיקות.** דלתא לפי `updated_at` אינה יכולה לראות שורה ש**נמחקה** -
// היא כבר אינה שם. לכן כל טבלה מחזירה גם את **רשימת המפתחות המלאה** שלה,
// וממנה הקליטה מסיקה מה נעלם. זה זול (מזהים בלבד: 113 פ"מים הם כ-2KB)
// והוא מה שמונע פ"מ רפאים שנשאר על המפה עד הסיבוב המלא הבא.

/** הטבלאות של הסיבוב המהיר: מה שמשתנה תוך כדי משמרת. */
export const FAST_TABLES = sortByDependency(VERSIONED_TABLES);

/**
 * חפיפה לאחור על `since`.
 *
 * שורה שנכתבה **בזמן** הצילום הקודם (בין קריאת הטבלה לבין חותמת `at`) הייתה
 * נופלת בין הכיסאות: מאוחרת מדי לצילום ההוא, ומוקדמת מדי לדלתא הבאה. שנייתיים
 * של חפיפה סוגרות את החלון, והמחיר הוא שידור חוזר של שורה בודדת - `upsert`
 * אידמפוטנטי ממילא.
 */
const DELTA_OVERLAP_MS = 2000;

/**
 * צילום **דלתא**: רק שורות שהשתנו מאז `since`, ולצידן מפתחות כל השורות.
 *
 * @param {string|null} since חותמת ISO **בשעון המרכז** (ה-`at` של הסיבוב הקודם).
 *   `null` = אין בסיס, ולכן מוחזר הכל - כמו צילום מלא של שש הטבלאות.
 */
export async function snapshotDelta(client, schema, since, tables = FAST_TABLES) {
  const sinceMs = Date.parse(since ?? '');
  const from = Number.isFinite(sinceMs)
    ? new Date(sinceMs - DELTA_OVERLAP_MS).toISOString()
    : null;

  const present = sortByDependency(await existingTables(client, schema, tables));
  const out = [];
  for (const table of present) {
    const tbl = qualified(schema, table);
    const pkCols = await pkColumns(client, schema, table);
    if (!pkCols.length) continue;

    // טבלה בלי `updated_at` אינה יכולה לענות "מה השתנה", ולכן היא נשלחת
    // במלואה. בפועל כל שש הטבלאות נושאות אותה (init.js מוסיף אותה לכל
    // טבלה ב-VERSIONED_TABLES), וזו רשת ביטחון לסכמה שהתפצלה.
    const cols = await currentColumns(client, schema, table);
    const canDelta = from && cols.includes('updated_at');

    const { rows } = canDelta
      ? await client.query(
        `SELECT to_jsonb(t) AS row FROM ${tbl} t
          WHERE t.updated_at > $1::timestamptz
          LIMIT ${MIRROR_ROW_CAP + 1}`, [from])
      : await client.query(
        `SELECT to_jsonb(t) AS row FROM ${tbl} t LIMIT ${MIRROR_ROW_CAP + 1}`);

    // רשימת המפתחות המלאה - זה מה שמאפשר לזהות מחיקות בלי למשוך את השורות
    const { rows: keyRows } = await client.query(
      `SELECT ${pkCols.map(c => `t.${ident(c)}`).join(', ')} FROM ${tbl} t`);

    out.push({
      table,
      rows: rows.slice(0, MIRROR_ROW_CAP).map(r => r.row),
      truncated: rows.length > MIRROR_ROW_CAP,
      keys: keyRows,
      full: !canDelta,
    });
  }
  return { schema, at: new Date().toISOString(), since: since ?? null, delta: true, tables: out };
}

/**
 * האם השורה המקומית נכתבה **אחרי** שהצילום נלקח במרכז.
 *
 * מסתמך על `updated_at`/`created_at` של השורה עצמה. אין להן ערך - מחזיר
 * `false`, כלומר ההתנהגות הישנה: אי-ודאות אינה סיבה לשמור שורה שהמרכז מחק.
 */
function isNewerThanSnapshot(row, snapshotAt) {
  if (!Number.isFinite(snapshotAt)) return false;
  const t = Date.parse(row?.updated_at ?? row?.created_at ?? '');
  return Number.isFinite(t) && t > snapshotAt;
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
  const stats = { tables: 0, upserted: 0, deleted: 0, skipped: 0, keptNewer: 0, failedTables: [] };
  // זמן הצילום במרכז. בלעדיו (צילום מגרסה ישנה) אין במה להשוות, ואז
  // ההתנהגות חוזרת למה שהייתה - עדיף לשמור שורה מיותרת מאשר למחוק עבודה.
  const snapshotAt = Date.parse(snapshot?.at ?? '');
  const present = new Set(await existingTables(client, schema, snapshot.tables.map(t => t.table)));
  // גם בקליטה ולא רק בצילום: צילום מגרסה מוקדמת יותר עלול להגיע בסדר אחר.
  const order = sortByDependency(snapshot.tables.map(t => t.table));
  const ordered = [...snapshot.tables].sort((a, b) => order.indexOf(a.table) - order.indexOf(b.table));

  let spIndex = 0;
  await withoutJournal(client, async () => {
    // ── קליטת רפליקציה, לא כתיבה תפעולית ─────────────────────────────────
    //
    // ⚠️ **`session_replication_role = 'replica'`** - בדיוק מה שרפליקציה
    // לוגית של Postgres עושה: מפתחות זרים אינם נאכפים בזמן הקליטה.
    //
    // למה זה **נכון** ולא עקיפה: הצילום הוא מצב **עקבי** שנלקח בטרנזקציה
    // אחת במרכז, ושם האילוצים כבר נאכפו. אכיפה חוזרת כאן אינה מוסיפה שום
    // אמת - והיא נכשלת משתי סיבות שאין להן קשר לנכונות הנתונים:
    //   1. **רשימת החסימה.** `maps` אינה נשלחת (מגה-בייטים לשורה), וכ-66
    //      טבלאות מצביעות עליה במישרין או בעקיפין. כולן נפלו.
    //   2. **סדר התלויות.** בייצור `joining_point_strips` נמשך 65 מקומות
    //      לפני `strips` שהוא ההורה שלו.
    //
    // הניסיונות שקדמו לזה, ולמה נזנחו: `SET CONSTRAINTS ALL DEFERRED` אינו
    // עושה דבר לאילוץ שאינו DEFERRABLE (ורובם אינם), ו-SAVEPOINT לכל שורה
    // הפיל את המאגר ב-`stack depth limit exceeded` - אלפי תת-טרנזקציות
    // מרוקנות את מחסנית ה-WASM של PGlite.
    //
    // `SET LOCAL` ולא `SET`: התוקף נגמר ב-COMMIT, ולכן שום בקשה תפעולית
    // אחרי הקליטה אינה רצה בלי אכיפת מפתחות זרים.
    await client.query(`SET LOCAL session_replication_role = 'replica'`);

    for (const { table, rows, keys: fullKeys } of ordered) {
      if (!present.has(table)) continue;
      // טבלה שלמה בסייפפוינט: תקלה בטבלה אחת (עמודה שהתפצלה בין הצדדים,
      // טריגר שנכשל) לא תפיל את כל הסיבוב ואיתו את כל המאגר.
      const sp = `tbl_${spIndex++}`;
      await client.query(`SAVEPOINT ${sp}`);
      try {
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
        // ⚠️ **בלי SAVEPOINT לכל שורה.** זה היה הניסיון הראשון, והוא הפיל את
        // המאגר ב-`stack depth limit exceeded`: אלפי תת-טרנזקציות בטרנזקציה
        // אחת מרוקנות את מחסנית ה-WASM של PGlite. הגבול הנכון הוא **טבלה**,
        // ולא שורה - כ-128 סייפפוינטים לסיבוב במקום עשרות אלפים.
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

      // ── מי הסמכות לשאלה "מה קיים במרכז" ──────────────────────────────────
      //
      // בצילום **מלא** `rows` הוא גם רשימת המצאי, ולכן `seen` עונה על זה.
      // בצילום **דלתא** `rows` מכיל רק את מה שהשתנה - ושימוש ב-`seen` שם היה
      // מוחק את **כל** מה שלא השתנה, כלומר את רוב המאגר. לכן הדלתא נושאת
      // `keys`, ורק הוא הסמכות.
      //
      // ⚠️ דלתא **בלי** `keys` (גרסת מרכז מוקדמת יותר) מדלגת על המחיקה
      // לגמרי. עדיף שורה שנמחקה במרכז ושורדת כאן דקה נוספת, מאשר מאגר
      // מקומי שמתרוקן בגלל אי-התאמת גרסאות.
      const isDelta = snapshot?.delta === true;
      const authority = Array.isArray(fullKeys)
        ? new Set(fullKeys.map(k => keyOf(table, Object.fromEntries(pkCols.map(c => [c, k[c]])))))
        : seen;
      if (isDelta && !Array.isArray(fullKeys)) continue;

      // מה שנעלם במרכז נמחק גם כאן - פרט למה שנולד בעמדה, למה שממתין ביומן,
      // ולמה ש**חדש מהצילום עצמו**.
      const local = await client.query(
        `SELECT to_jsonb(t) AS row FROM ${tbl} t`);
      for (const { row } of local.rows) {
        const pk = Object.fromEntries(pkCols.map(c => [c, row[c]]));
        const key = keyOf(table, pk);
        if (authority.has(key) || pendingKeys.has(key)) continue;
        if (pkCols.length === 1 && isLocalId(pk[pkCols[0]])) continue;
        // ⚠️ **מרוץ בין זמן הצילום לזמן הקליטה.** הצילום נלקח במרכז ברגע
        // אחד, והקליטה רצה אחריו - סיבוב מלא נמשך עשרות שניות. בין השניים
        // הדפדפן יכול היה לדחוף שורה חדשה: היא כבר **אינה ממתינה ביומן**
        // (ולכן אינה מוגנת), ועדיין **אינה בצילום** (שנלקח לפניה). פסקת
        // המחיקה ראתה שורה מקומית שאין לה מקבילה - ומחקה אותה.
        //
        // כך נעלם פ"מ שהוצב בנקודת העברה בנתק, ברגע שהקשר חזר. מזהה UUID
        // אינו מוגן ע"י `isLocalId` (הוא בודק טווח מספרי), ולכן דווקא
        // `strip_transfers` נפגעה.
        //
        // שורה שנכתבה **אחרי** זמן הצילום אינה יכולה היה להיות בו, ולכן
        // היעדרה ממנו אינו אומר דבר.
        if (isNewerThanSnapshot(row, snapshotAt)) { stats.keptNewer++; continue; }
        // מחיקת הורה שעדיין יש לו ילדים תיכשל, ותפיל את **הטבלה** הזו בלבד
        // (סייפפוינט הטבלה) - היא תנוקה בסיבוב הבא, אחרי שילדיה ילכו.
        await client.query(
          `DELETE FROM ${tbl} t WHERE to_jsonb(t) @> $1::jsonb`, [JSON.stringify(pk)]);
        stats.deleted++;
      }
        await client.query(`RELEASE SAVEPOINT ${sp}`);
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        await client.query(`RELEASE SAVEPOINT ${sp}`);
        stats.failedTables.push({ table, error: String(err?.message || err) });
      }
    }
  });

  return stats;
}

export { keyOf as mirrorRowKey };
