// תיקון sequences מפגרים.
//
// ── הבעיה ────────────────────────────────────────────────────────────────────
// עמודת `id SERIAL` שואבת את ערכה מ-sequence. שחזור dump, ייבוא seed או כל
// כתיבה שנוקבת ב-id **במפורש** אינם מקדמים את ה-sequence - הוא נשאר מאחור.
// מרגע זה **כל** INSTERT לטבלה נכשל ב-`duplicate key value violates unique
// constraint "<table>_pkey"`, כי nextval מחזיר id שכבר תפוס.
//
// כך נשבר שכפול שדה תעופה: `airfield_sectors` (max=11, next=10),
// `airfield_polygons` (max=4, next=4) ו-`airfield_status_types` (max=6, next=2)
// כולם פיגרו, וההוספה נפלה. זו אינה תקלה של השכפול - כל הוספת סקטור/פוליגון
// לשדה הייתה נכשלת באותו אופן.
//
// ── הפתרון ───────────────────────────────────────────────────────────────────
// בכל עלייה: לסרוק את קטלוג ה-DB, לאתר עמודות שברירת המחדל שלהן `nextval`,
// ולהריץ `setval` ל-max(id) רק היכן שה-sequence מפגר. אידמפוטנטי - הרצה שנייה
// לא עושה דבר, ותיקון אינו נוגע בנתונים עצמם.

/** טבלאות שאינן חלק מ-SKY-KING (AeroZone - פרויקט ישן, ראה CLAUDE.md). */
export const SEQ_SKIP_PREFIXES = ['az_'];

const num = (v) => Number(v ?? 0);

/**
 * שולף את שם ה-sequence מברירת המחדל של העמודה:
 *   nextval('airfield_sectors_id_seq'::regclass)  ->  airfield_sectors_id_seq
 *
 * ⚠ למה לא `pg_get_serial_sequence`: הפונקציה מחזירה NULL כשה-sequence אינו
 * **owned** על ידי העמודה - וזה בדיוק המצב אחרי שחזור dump, כלומר בדיוק
 * הטבלאות שנשברו. ברירת המחדל של העמודה קיימת בכל מקרה.
 */
export function sequenceFromDefault(defaultExpr) {
  const m = /nextval\(\s*'([^']+)'/.exec(String(defaultExpr ?? ''));
  if (!m) return null;
  // השם עשוי לבוא מלא-סכמה ומצוטט: "public"."x_id_seq" / public.x_id_seq
  return m[1];
}

/**
 * מסנן את רשימת ה-sequences לאלה שדורשים תיקון.
 * `next_value <= max_id` פירושו שה-id הבא כבר תפוס - כולל שוויון.
 */
export function buildSequenceRepairPlan(rows) {
  return rows.filter(r =>
    r.sequence &&
    !SEQ_SKIP_PREFIXES.some(p => String(r.table).startsWith(p)) &&
    num(r.max_id) > 0 &&
    num(r.next_value) <= num(r.max_id),
  ).map(r => ({ table: r.table, column: r.column, max_id: num(r.max_id), next_value: num(r.next_value) }));
}

/**
 * סורק ומתקן. `query` הוא (sql, params) => { rows } - כדי שאפשר יהיה לבדוק
 * את הלוגיקה בלי DB. מחזיר את מה שתוקן בפועל.
 * כשל בטבלה בודדת אינו מפיל את השאר, וכשל בגילוי אינו מפיל את העלייה.
 */
export async function resyncSequences(query) {
  let defs;
  try {
    const res = await query(`
      SELECT c.relname AS table, a.attname AS column,
             pg_get_expr(ad.adbin, ad.adrelid) AS default_expr
      FROM pg_attrdef ad
      JOIN pg_class c ON c.oid = ad.adrelid
      JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval%'`);
    defs = res.rows.map(r => ({ ...r, sequence: r.sequence ?? sequenceFromDefault(r.default_expr) }));
  } catch (err) {
    console.warn('[sequences] גילוי sequences נכשל:', err.message);
    return [];
  }

  const candidates = [];
  for (const d of defs) {
    if (!d.sequence) continue;
    if (SEQ_SKIP_PREFIXES.some(p => String(d.table).startsWith(p))) continue;
    try {
      const mx = await query(`SELECT COALESCE(MAX("${d.column}"), 0) AS max_id FROM "${d.table}"`);
      const nv = await query(`SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END AS next_value FROM ${d.sequence}`);
      candidates.push({ ...d, max_id: mx.rows[0]?.max_id, next_value: nv.rows[0]?.next_value });
    } catch (err) {
      console.warn(`[sequences] דילוג על ${d.table}.${d.column}: ${err.message}`);
    }
  }

  const plan = buildSequenceRepairPlan(candidates);
  const fixed = [];
  for (const p of plan) {
    const seq = candidates.find(c => c.table === p.table && c.column === p.column).sequence;
    try {
      await query(`SELECT setval('${seq}', ${p.max_id}, true)`);
      fixed.push(p);
    } catch (err) {
      console.warn(`[sequences] תיקון ${p.table}.${p.column} נכשל: ${err.message}`);
    }
  }
  return fixed;
}
