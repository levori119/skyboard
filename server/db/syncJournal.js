// יומן הפעולות המקומיות — מה העמדה שינתה בזמן שהייתה מנותקת.
//
// זו החוליה שחסרה כדי שעבודה בנתק לא תישאר כלואה במאגר המקומי: בלעדיה העמדה
// עובדת יפה מול PGlite, ואיש אינו יודע **מה** בדיוק היא שינתה, ולכן אי אפשר
// לדחוף את זה חזרה. היומן הוא הרשימה הזו.
//
// למה טריגר ולא רישום ב-endpoints — אותו שיקול בדיוק כמו ביומן הביטול
// (`undoJournal.js`) וכמו ביירוט ה-fetch בלקוח: 457 endpoints כותבים, ומי
// שנשכח היה עובד בנתק **ולא מסונכרן**, בלי שאיש ידע. הטריגר אינו יכול להישכח,
// והוא תופס גם מה ש-endpoint אינו יודע שעשה (ON DELETE CASCADE, עדכון גורף).
//
// **מותקן רק במאגר המקומי.** בשרת המרכזי אין לו מה לעשות: מה שנכתב שם כבר
// נמצא במקור האמת. `server/local.js` מתקין אותו אחרי `initDb`/`seedDb`, ולכן
// נתוני האתחול אינם נרשמים בו כאילו היו עבודה של מפעיל.
//
// **חמש טבלאות בלבד** — אותן טבלאות שנושאות `rev` (`versionedTables.js`),
// ומאותה סיבה: `rev` הוא מה שעונה בסנכרון על "האם מישהו אחר נגע בזה".
// רשימה נפרדת הייתה נפרדת בשינוי הראשון, ואז סתירה הייתה נבלעת בשקט.

import { VERSIONED_TABLES } from './versionedTables.js';

/** שם פונקציית הטריגר. */
export const SYNC_FN = 'skyking_sync_journal';

/** שם הטריגר על טבלה. אחיד, כדי ש-DROP IF EXISTS ימצא אותו תמיד. */
export const SYNC_TRIGGER = 'sync_journal_row';

/**
 * ה-GUC שמסמן "הכתיבה הזו **היא** הסנכרון עצמו".
 *
 * קריטי: קליטת המראה מהמרכז (`POST /api/sync/mirror`) כותבת לאותן חמש טבלאות.
 * בלי הסימון הזה כל שורה שהמרכז שלח הייתה נרשמת ביומן כאילו העמדה שינתה אותה,
 * והדחיפה הבאה הייתה מחזירה למרכז את מה שהוא עצמו זה עתה שלח — לולאה שמייצרת
 * סתירות יש מאין.
 */
export const SYNC_GUC = 'app.sync_apply';

/** מצבי שורה ביומן. */
export const STATUS = {
  PENDING: 'pending',   // ממתינה לדחיפה
  SYNCED: 'synced',     // נדחפה בהצלחה
  SUPERSEDED: 'superseded', // המרכז עודכן מאוחר יותר - גרסתו אומצה כאן
  CONFLICT: 'conflict', // לא ניתן היה להכריע אוטומטית - ממתינה להכרעת הבקר
  DROPPED: 'dropped',   // הבקר בחר בגרסת השרת
};

/** שם הטבלה. `public` בלבד, עם `table_schema` פר-שורה (כמו יומן הביטול). */
export const JOURNAL_TABLE = 'public.local_sync_journal';

/**
 * טבלת היומן. יושבת ב-**public בלבד**, עם `table_schema` פר-שורה.
 *
 * למה לא עותק בכל סכמת תרגול: הדחיפה היא פעולה של העמדה, לא של הסביבה, והיא
 * חייבת לראות תור אחד. הבידוד נאכף בסינון על `table_schema`, בדיוק כפי
 * ש-`undo_journal` עושה עם `env`.
 */
export function syncJournalDdl() {
  return [
    `CREATE TABLE IF NOT EXISTS ${JOURNAL_TABLE} (
       id              BIGSERIAL PRIMARY KEY,
       at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       table_schema    TEXT NOT NULL,
       table_name      TEXT NOT NULL,
       op              CHAR(1) NOT NULL,
       pk              JSONB NOT NULL,
       before          JSONB,
       after           JSONB,
       action_id       TEXT,
       status          TEXT NOT NULL DEFAULT '${STATUS.PENDING}',
       synced_at       TIMESTAMPTZ,
       conflict_reason TEXT,
       server_row      JSONB,
       error           TEXT
     )`,
    // התור לדחיפה: מה שממתין, בסדר הכתיבה. זו השאילתה היחידה בנתיב החם.
    `CREATE INDEX IF NOT EXISTS local_sync_journal_pending_idx
       ON ${JOURNAL_TABLE} (status, id)`,
    // איחוד פר-שורה (coalesce) — כל מה שנגע באותו מפתח, לפי הסדר
    `CREATE INDEX IF NOT EXISTS local_sync_journal_row_idx
       ON ${JOURNAL_TABLE} (table_schema, table_name, id)`,
  ];
}

/**
 * פונקציית הטריגר.
 *
 * AFTER ולא BEFORE, מאותה סיבה כמו ביומן הביטול: `after` חייב לשקף את השורה
 * **הסופית** כולל ה-`rev` שטריגר הגרסה העלה. ה-`rev` שב-`before` של השינוי
 * הראשון לשורה הוא בדיוק הגרסה שהמרכז החזיק כשהעמדה ראתה אותה לאחרונה —
 * וזה מה שמכריע בסנכרון אם מישהו אחר נגע בה מאז.
 */
export function syncFunctionDdl() {
  return `CREATE OR REPLACE FUNCTION public.${SYNC_FN}() RETURNS TRIGGER AS $fn$
    DECLARE
      rec      JSONB;
      pk_cols  TEXT[];
      pk_val   JSONB;
      before_j JSONB;
      after_j  JSONB;
    BEGIN
      -- הכתיבה הזו היא הסנכרון עצמו (קליטת מראה / יישוב סתירה) — לא עבודה
      -- של המפעיל, ואסור שתחזור למרכז.
      IF COALESCE(current_setting('${SYNC_GUC}', true), '') = '1' THEN RETURN NULL; END IF;

      IF TG_OP = 'DELETE' THEN
        before_j := to_jsonb(OLD); after_j := NULL;          rec := before_j;
      ELSIF TG_OP = 'INSERT' THEN
        before_j := NULL;          after_j := to_jsonb(NEW); rec := after_j;
      ELSE
        before_j := to_jsonb(OLD); after_j := to_jsonb(NEW); rec := after_j;
        -- עדכון שלא שינה דבר אינו שינוי שצריך לדחוף. ההשוואה מתעלמת
        -- מ-rev ומ-updated_at: טריגר הגרסה (BEFORE) כבר העלה אותם, ולכן
        -- בלי ההחרגה שתי השורות **לעולם** אינן זהות והתנאי היה מת. כתיבה
        -- שכל שינויה הוא ספירת הגרסה אינה עבודה של מפעיל.
        IF (before_j - 'rev' - 'updated_at') = (after_j - 'rev' - 'updated_at')
          THEN RETURN NULL; END IF;
      END IF;

      SELECT array_agg(a.attname ORDER BY k.ord)
        INTO pk_cols
        FROM pg_index i
        CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
       WHERE i.indrelid = TG_RELID AND i.indisprimary;

      -- בלי מפתח ראשי אין לדחיפה למה לכוון. נרשם עם pk ריק ו-error, כדי
      -- שהמפעיל יראה שמשהו לא ייסנכרן — ולא ייעלם בשקט.
      IF pk_cols IS NULL THEN
        INSERT INTO ${JOURNAL_TABLE}
          (table_schema, table_name, op, pk, before, after, action_id, status, error)
        VALUES
          (TG_TABLE_SCHEMA, TG_TABLE_NAME, LEFT(TG_OP, 1), '{}'::jsonb, before_j, after_j,
           NULLIF(current_setting('app.action_id', true), ''), '${STATUS.CONFLICT}', 'no_pk');
        RETURN NULL;
      END IF;

      SELECT jsonb_object_agg(c, rec -> c) INTO pk_val FROM unnest(pk_cols) AS c;

      INSERT INTO ${JOURNAL_TABLE}
        (table_schema, table_name, op, pk, before, after, action_id)
      VALUES
        (TG_TABLE_SCHEMA, TG_TABLE_NAME, LEFT(TG_OP, 1), pk_val, before_j, after_j,
         NULLIF(current_setting('app.action_id', true), ''));

      RETURN NULL;
    END;
    $fn$ LANGUAGE plpgsql`;
}

/**
 * פקודות ההתקנה של הטריגר על חמש הטבלאות בסכמה נתונה.
 *
 * `tables` נפתח לפרמטר כדי שבדיקות יוכלו להקים סכמה מצומצמת. בייצור הרשימה
 * היא תמיד `VERSIONED_TABLES` - התקנה חלקית פירושה טבלה שנכתבת בנתק ואינה
 * מסונכרנת, כלומר אובדן שקט.
 */
export function installSyncTriggersDdl(schema = 'public', tables = VERSIONED_TABLES) {
  const out = [];
  for (const table of tables) {
    out.push(
      `DROP TRIGGER IF EXISTS ${SYNC_TRIGGER} ON ${schema}.${table}`,
      `CREATE TRIGGER ${SYNC_TRIGGER} AFTER INSERT OR UPDATE OR DELETE ON ${schema}.${table} ` +
      `FOR EACH ROW EXECUTE FUNCTION public.${SYNC_FN}()`,
    );
  }
  return out;
}

/**
 * מריץ `fn` כשהיומן **אינו** מקליט. זו העטיפה של כל כתיבה שהיא הסנכרון עצמו:
 * קליטת מראה מהמרכז, ואימוץ גרסת השרת ביישוב סתירה.
 *
 * ⚠️ **חייב לרוץ בתוך טרנזקציה.** `set_config(..., is_local => true)` הוא
 * `SET LOCAL`: מחוץ לטרנזקציה הוא חל על הטרנזקציה המשתמעת של אותה שאילתה
 * בלבד, ומתאפס לפני השאילתה הבאה - כלומר הסימון פשוט אינו שם כשהכתיבה מגיעה,
 * והמראה נרשמת ביומן כאילו הייתה עבודה של המפעיל. `begin` מבטיח זאת.
 *
 * למה לא GUC ברמת session: זו בדיוק דליפת ה-SET שתועדה ב-pool.js. connection
 * שחוזר ל-pool עם סימון פעיל היה מבליע את שורות היומן של הבקשה הבאה.
 */
export async function withoutJournal(client, fn, { begin = true } = {}) {
  if (begin) await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('${SYNC_GUC}', '1', true)`);
    const out = await fn();
    if (begin) await client.query('COMMIT');
    return out;
  } catch (err) {
    if (begin) { try { await client.query('ROLLBACK'); } catch { /* connection מת */ } }
    throw err;
  } finally {
    // ⚠️ אסור שהניקוי יזרוק: אחרי שגיאה הטרנזקציה כבר מבוטלת, וכל פקודה בה
    // נכשלת ב-'current transaction is aborted'. השגיאה הזו הייתה **מחליפה**
    // את השגיאה המקורית ומשאירה אותנו בלי מושג מה נשבר (נתפס בפועל).
    if (!begin) {
      try { await client.query(`SELECT set_config('${SYNC_GUC}', '', true)`); }
      catch { /* הטרנזקציה מבוטלת - הסימון ירד איתה ממילא */ }
    }
  }
}
