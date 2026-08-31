// יומן הביטול (CTRL+Z) — מה השתנה ב-DB בעקבות כל פעולה של מפעיל.
//
// למה טריגר גנרי ולא קוד ב-endpoints: יש ~340 endpoints שכותבים. "לכל פעולה
// פעולה הפוכה" היה מחייב לגעת בכולם, ולהשאיר את מי שנשכח בלי ביטול **ובלי
// שאיש ידע**. הטריגר תופס גם את מה ש-endpoint אינו יודע שהוא עשה: ON DELETE
// CASCADE, עדכון גורף, טריגר אחר — בדיוק המקרים שביטול ידני היה משאיר בהם
// שאריות. אותו שיקול שהוביל ליירוט fetch יחיד בלקוח (authToken/environment/offline).
//
// מקור אמת יחיד: `init.js` מתקין כאן ב-public, ו-`envs.js` בכל סכמת תרגול —
// כמו `versionedTables.js`. שתי רשימות נפרדות היו נפרדות בשינוי הראשון.
//
// ⚠️ **אין הקשר פעולה → אין רישום.** `app.action_id` ריק (קליטת תמונ"א, polling
// של GAPI, initDb, seedDb, מיגרציות) מחזיר מיד ואינו עולה דבר. זה מה ששומר על
// המסלול המהיר נקי.

/** שם פונקציית הטריגר. יושבת ב-public ומשותפת לכל הסכמות. */
export const JOURNAL_FN = 'skyking_undo_journal';

/** שם הטריגר על טבלה. אחיד, כדי ש-DROP IF EXISTS ימצא אותו תמיד. */
export const JOURNAL_TRIGGER = 'undo_journal_row';

/** ה-GUC שנושא את מזהה הפעולה. נקבע ב-SET LOCAL בתוך הטרנזקציה (ראה pool.js). */
export const ACTION_GUC = 'app.action_id';

/**
 * תקרת גודל לשורה ביומן (בתים, before+after יחד).
 *
 * `maps.image_data` הוא base64 של מפה סרוקה — מגה-בייטים. בלי תקרה, עריכת מפה
 * אחת מנפחת את היומן ומאטה כל כתיבה אחריה. שורה שחורגת אינה נרשמת, והפעולה
 * **מסומנת כלא-ניתנת-לביטול** ולא מוצגת כאילו אפשר להחזירה. עדיף לומר
 * "אי אפשר" מאשר להציע ביטול שיחזיר חצי שורה.
 */
export const MAX_ROW_BYTES = 131072; // 128KB

/**
 * טבלאות שאינן נכנסות ליומן — הטריגר כלל אינו מותקן עליהן.
 * הנימוק כתוב לצד כל אחת, כמו בטבלת ה-RULES של middleware/auth.js.
 * ראה UNDO_SPEC.md §4.
 */
export const UNDO_DENYLIST = [
  // ── בטיחות תפעולית — ביטול משנה מי מחזיק במטוס ────────────────────────────
  ['strip_transfers', 'ביטול העברה שבוצעה עלול להשאיר מטוס בלי בקר או עם שניים'],
  ['provisional_transfer_points', 'נקודת העברה זמנית — חלק ממנגנון ההעברות'],
  ['position_merges', 'איחוד/פיצול עמדות משנה מי אחראי על מה'],
  ['temp_zone_seizures', 'הלאמת אזור זמני - ביטול שקט מחזיר לאוויר מרחב שעמדות כבר אישרו שנתפס'],
  ['temp_zone_seizure_targets', 'אישור עמדה שראתה את ההלאמה - אישור שנמחק בשקט הוא אישור שלא היה'],

  // ── כבר יצא החוצה — אי אפשר "לבטל שידור" ──────────────────────────────────
  ['gapi_outbox', 'הודעה שכבר שודרה לשו"ב החיצוני'],
  ['gapi_inbound_events', 'מה שהתקבל מבחוץ אינו פעולה של מפעיל'],
  ['gapi_env_config', 'תצורת החיבור לשו"ב החיצוני'],

  // ── יומן ביקורת — יומן שניתן לבטלו אינו יומן ───────────────────────────────
  ['activity_log', 'יומן ביקורת (SK-18)'],
  ['undo_actions', 'היומן של עצמו'],
  ['undo_journal', 'היומן של עצמו'],

  // ── זהות ומושב — אינם "מידע שדה" ──────────────────────────────────────────
  ['station_sessions', 'כניסה ויציאה מעמדה'],
  ['workstation_session_roles', 'תפקיד במושב העמדה'],
  ['crew_member_workstations', 'הרשאת איש צוות לעמדה'],

  // ── תצוגה אישית — החלטת אפיון: לא מזהמת את המחסנית ────────────────────────
  ['workstation_personal_filters', 'פילטר אישי של המפעיל'],
  ['strip_window_layouts', 'פריסת חלון תצוגה'],
  ['strip_window_columns', 'עמודות בחלון תצוגה'],
  ['strip_window_cells', 'תאים בחלון תצוגה'],

  // ── למידה ומטמון — לא מידע שדה ────────────────────────────────────────────
  ['learned_digits', 'נתוני אימון של זיהוי כתב יד'],
  ['learned_strokes', 'נתוני אימון של זיהוי כתב יד'],
  ['air_picture_config', 'תצורת המאגר החיצוני של התמונ"א'],
];

/** רק השמות — לשימוש ב-SQL ובבדיקות. */
export const DENIED_TABLES = UNDO_DENYLIST.map(([t]) => t);

/** הנימוק לחסימה, או null אם הטבלה כן נרשמת. */
export function denyReason(table) {
  return UNDO_DENYLIST.find(([t]) => t === table)?.[1] ?? null;
}

/** ליטרל מערך טקסט ל-SQL. השמות קבועים בקוד, והציטוט הוא הגנת עומק. */
const sqlTextArray = (arr) =>
  `ARRAY[${arr.map(s => `'${String(s).replace(/'/g, "''")}'`).join(',')}]::text[]`;

/**
 * שתי טבלאות היומן. יושבות ב-**public בלבד**, עם עמודת `env`.
 *
 * למה לא עותק בכל סכמת תרגול: פעולה אחת של מפעיל בתרגול נוגעת גם בטבלה
 * תפעולית (env_NN) וגם בטבלת הגדרות (public) — יומן פר-סכמה היה **מפצל אותה
 * לשניים**, וביטול היה מחזיר חצי. הבידוד נאכף בסינון על `env`, ומיקום השורה
 * המקורית נשמר ב-`table_schema` כדי שההיפוך יפגע בסכמה הנכונה.
 */
export function journalTablesDdl() {
  return [
    `CREATE TABLE IF NOT EXISTS public.undo_actions (
       id             TEXT PRIMARY KEY,
       created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       env            INTEGER NOT NULL DEFAULT 1,
       station_key    TEXT NOT NULL,
       crew_member_id INTEGER,
       crew_name      TEXT,
       method         TEXT NOT NULL,
       path           TEXT NOT NULL,
       label_key      TEXT NOT NULL,
       label_params   JSONB NOT NULL DEFAULT '{}',
       kind           TEXT NOT NULL DEFAULT 'action',
       status         TEXT NOT NULL DEFAULT 'active',
       block_reason   TEXT,
       undone_at      TIMESTAMPTZ,
       undo_of        TEXT
     )`,
    `CREATE TABLE IF NOT EXISTS public.undo_journal (
       id           BIGSERIAL PRIMARY KEY,
       action_id    TEXT NOT NULL,
       at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       table_schema TEXT NOT NULL,
       table_name   TEXT NOT NULL,
       op           CHAR(1) NOT NULL,
       pk           JSONB,
       before       JSONB,
       after        JSONB
     )`,
    // המחסנית של עמדה: הפעולות שלה, החדשה קודם. זו השאילתה היחידה בנתיב החם.
    `CREATE INDEX IF NOT EXISTS undo_actions_stack_idx
       ON public.undo_actions (env, station_key, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS undo_journal_action_idx
       ON public.undo_journal (action_id)`,
    // ניקוי לפי זמן (5 דקות) — ראה pruneSql
    `CREATE INDEX IF NOT EXISTS undo_journal_at_idx ON public.undo_journal (at)`,
    `CREATE INDEX IF NOT EXISTS undo_actions_created_idx ON public.undo_actions (created_at)`,
  ];
}

/**
 * פונקציית הטריגר. `CREATE OR REPLACE` ולכן בטוחה לריצה חוזרת.
 *
 * AFTER ולא BEFORE: `after` חייב לשקף את השורה **הסופית**, כולל מה שטריגרים
 * אחרים שינו — בעיקר `rev` של `versionedTables`. זה גם מה שהופך את `rev`
 * לגלאי ההתנגשות: אם מישהו נגע בשורה אחרי הפעולה, ה-`rev` הנוכחי כבר אינו
 * זה שביומן.
 */
export function journalFunctionDdl() {
  return `CREATE OR REPLACE FUNCTION public.${JOURNAL_FN}() RETURNS TRIGGER AS $fn$
    DECLARE
      aid      TEXT := NULLIF(current_setting('${ACTION_GUC}', true), '');
      rec      JSONB;
      pk_cols  TEXT[];
      pk_val   JSONB;
      before_j JSONB;
      after_j  JSONB;
    BEGIN
      -- אין הקשר פעולה (רקע/אתחול/קליטה חיצונית) — יציאה מיידית, אפס תקורה
      IF aid IS NULL THEN RETURN NULL; END IF;

      IF TG_OP = 'DELETE' THEN
        before_j := to_jsonb(OLD); after_j := NULL;         rec := before_j;
      ELSIF TG_OP = 'INSERT' THEN
        before_j := NULL;          after_j := to_jsonb(NEW); rec := after_j;
      ELSE
        before_j := to_jsonb(OLD); after_j := to_jsonb(NEW); rec := after_j;
        -- עדכון שלא שינה דבר אינו פעולה שאפשר לבטל
        IF before_j = after_j THEN RETURN NULL; END IF;
      END IF;

      -- המפתח הראשי של הטבלה, לפי הקטלוג. בלעדיו אין להיפוך שום דבר לכוון אליו.
      SELECT array_agg(a.attname ORDER BY k.ord)
        INTO pk_cols
        FROM pg_index i
        CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
       WHERE i.indrelid = TG_RELID AND i.indisprimary;

      IF pk_cols IS NULL THEN
        UPDATE public.undo_actions
           SET status = 'blocked', block_reason = 'no_pk'
         WHERE id = aid AND status = 'active';
        RETURN NULL;
      END IF;

      IF pg_column_size(COALESCE(before_j, '{}'::jsonb))
       + pg_column_size(COALESCE(after_j,  '{}'::jsonb)) > ${MAX_ROW_BYTES} THEN
        UPDATE public.undo_actions
           SET status = 'blocked', block_reason = 'oversized'
         WHERE id = aid AND status = 'active';
        RETURN NULL;
      END IF;

      SELECT jsonb_object_agg(c, rec -> c) INTO pk_val FROM unnest(pk_cols) AS c;

      INSERT INTO public.undo_journal
        (action_id, table_schema, table_name, op, pk, before, after)
      VALUES
        (aid, TG_TABLE_SCHEMA, TG_TABLE_NAME, LEFT(TG_OP, 1), pk_val, before_j, after_j);

      RETURN NULL;
    END;
    $fn$ LANGUAGE plpgsql`;
}

/**
 * מתקין את הטריגר על **כל** הטבלאות בסכמה פרט לרשימת החסימה.
 *
 * לולאה בצד השרת (DO) ולא בצד Node: התקנה פר-טבלה היא ~110 round-trips מול
 * Neon בכל עלייה. חשוב מזה — **טבלה חדשה מקבלת ביטול מאליה** בעלייה הבאה, בלי
 * שמישהו יזכור להוסיף אותה לרשימה. זו המשמעות המעשית של "ביטול לכל המערכת".
 */
export function installTriggersDdl(schema = 'public') {
  return `DO $do$
    DECLARE t RECORD;
    BEGIN
      FOR t IN
        SELECT c.relname
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = '${schema}'
           AND c.relkind = 'r'
           AND c.relname <> ALL(${sqlTextArray(DENIED_TABLES)})
      LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I',
                       '${JOURNAL_TRIGGER}', '${schema}', t.relname);
        EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
                       'FOR EACH ROW EXECUTE FUNCTION public.${JOURNAL_FN}()',
                       '${JOURNAL_TRIGGER}', '${schema}', t.relname);
      END LOOP;
    END
    $do$`;
}

/** דקות השמירה. אחרי זה הפעולה פגה ואי אפשר לבטלה. ראה UNDO_SPEC.md §1. */
export const RETENTION_MINUTES = 5;

/**
 * ניקוי עצל — נקרא לפני יצירת פעולה חדשה. אין cron ואין תהליך רקע: היומן
 * נגזם על ידי מי שמשתמש בו, ומערכת שאיש אינו עובד בה אינה צוברת דבר.
 */
export function pruneSql() {
  return [
    `DELETE FROM public.undo_journal WHERE at < NOW() - INTERVAL '${RETENTION_MINUTES} minutes'`,
    `DELETE FROM public.undo_actions WHERE created_at < NOW() - INTERVAL '${RETENTION_MINUTES} minutes'`,
  ];
}
