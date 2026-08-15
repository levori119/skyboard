// הטבלאות שנושאות מעקב גרסה (`rev` + `updated_at`), ולמה דווקא הן.
//
// זו הרשימה שהעמדה כותבת אליה כשהיא מנותקת: הפ"מ עצמו ומיקומו על המפה,
// ההעברות, ההצבה על אזור, ההצבה בטבלה, וההצטרפות. בסנכרון חזרה `rev` הוא
// מה שעונה על השאלה היחידה שחשובה — "האם מישהו אחר נגע בזה בזמן שהייתי מנותק".
//
// מקור אמת יחיד: `init.js` מתקין כאן את הטריגר ב-`public`, ו-`envs.js` מתקין
// אותו בכל סכמת תרגול. שתי רשימות נפרדות היו נפרדות זו מזו בשינוי הראשון,
// וסביבת תרגול הייתה מסנכרנת בלי לזהות סתירות — בשקט.

/** שם פונקציית הטריגר. יושבת ב-public ומשותפת לכל הסכמות. */
export const TOUCH_FN = 'skyking_touch_row';

export const VERSIONED_TABLES = [
  'strips',                   // הפ"מ עצמו, כולל on_map/x/y — גרירה על המפה
  'strip_transfers',          // העברות עמדה
  'strip_zone_assignments',   // הצבת פ"מ על אזור במפה
  'strip_table_assignments',  // הצבת פ"מ בטבלת עמדה
  'joining_point_strips',     // פ"מ בנקודת הצטרפות
];

/** שם הטריגר על טבלה. אחיד, כדי ש-DROP IF EXISTS ימצא אותו תמיד. */
export const triggerName = (table) => `${table}_touch_rev`;

/**
 * הגדרת פונקציית הטריגר. `CREATE OR REPLACE` ולכן בטוחה לריצה חוזרת.
 *
 * מוחזרת כמחרוזת ולא נכתבת רק ב-init.js, כי גם `envs.js` חייב אותה: סכמת
 * תרגול יכולה להיווצר בעצלתיים בבקשה הראשונה, ולא רק בעליית השרת אחרי initDb.
 * תלות סדר בין השניים הייתה נשברת בדיוק בפעם שבה סביבה חדשה נוצרת לראשונה.
 */
export function touchFunctionDdl() {
  return `CREATE OR REPLACE FUNCTION public.${TOUCH_FN}() RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.updated_at := NOW();
      NEW.rev := COALESCE(OLD.rev, 0) + 1;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql`;
}

/**
 * פקודות ההתקנה של הטריגר על טבלה בסכמה נתונה.
 *
 * DROP+CREATE ולא CREATE OR REPLACE: הצורה הזו נתמכת בכל גרסת Postgres,
 * וריצה חוזרת של initDb או של סנכרון סביבות אינה נופלת על
 * "trigger already exists".
 */
export function triggerDdl(table, schema = 'public') {
  const qualified = `${schema}.${table}`;
  return [
    `DROP TRIGGER IF EXISTS ${triggerName(table)} ON ${qualified}`,
    `CREATE TRIGGER ${triggerName(table)} BEFORE UPDATE ON ${qualified} ` +
    `FOR EACH ROW EXECUTE FUNCTION public.${TOUCH_FN}()`,
  ];
}
