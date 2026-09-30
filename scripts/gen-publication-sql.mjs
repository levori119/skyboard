// מייצר את ה-SQL של הפרסום (PUBLICATION) **מתוך הקוד**, ולא מרשימה ידנית.
//
// ⚠️ **למה לא לכתוב את רשימת הטבלאות ב-SQL.** רשימה ידנית מתיישנת בשקט: טבלה
// שנוספה למערכת ולא לפרסום פשוט לא תגיע לעמדה, ואיש לא יידע עד שמישהו יחפש
// אותה בנתק. כאן הרשימה היא אותה `MIRROR_TABLES` שהמראה משתמשת בה, ולכן היא
// לא יכולה להתפצל ממנה.
//
// הסקריפט גם **בודק מפתח ראשי**: רפליקציה לוגית דורשת `REPLICA IDENTITY`,
// וטבלה בלי מפתח ראשי תתפרסם אבל **כל UPDATE/DELETE עליה ייכשל** בפרסום -
// כשל שמתגלה רק בייצור, ורק בפעולה הראשונה מסוגה.
//
// הרצה:
//   node scripts/gen-publication-sql.mjs                 # מדפיס SQL
//   node scripts/gen-publication-sql.mjs --check         # רק בדיקת מפתחות
//   node scripts/gen-publication-sql.mjs > pub.sql

import 'dotenv/config';

const PUBLICATION = process.env.SKYKING_PUBLICATION || 'skyking_pub';
const ROLE = process.env.SKYKING_REPLICATION_ROLE || 'replication_user';
const checkOnly = process.argv.includes('--check');

const { MIRROR_TABLES } = await import('../server/sync/mirror.js');
const { default: pool } = await import('../server/db/pool.js');

const ident = (t) => `"${String(t).replace(/"/g, '""')}"`;

try {
  const { rows: existing } = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`);
  const present = new Set(existing.map(r => r.table_name));

  const tables = MIRROR_TABLES.filter(t => present.has(t));
  const missing = MIRROR_TABLES.filter(t => !present.has(t));

  // מפתח ראשי = REPLICA IDENTITY. בלעדיו UPDATE/DELETE ייכשלו בפרסום.
  const { rows: pkRows } = await pool.query(
    `SELECT c.relname AS table_name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM pg_index i
                     WHERE i.indrelid = c.oid AND i.indisprimary)`);
  const withPk = new Set(pkRows.map(r => r.table_name));
  const noPk = tables.filter(t => !withPk.has(t));

  if (checkOnly || noPk.length) {
    console.error(`טבלאות בפרסום: ${tables.length}`);
    if (missing.length) console.error(`אינן קיימות במאגר (מדולגות): ${missing.join(', ')}`);
    if (noPk.length) {
      console.error(`\n⚠️  ${noPk.length} טבלאות בלי מפתח ראשי - UPDATE/DELETE עליהן ייכשל ברפליקציה:`);
      for (const t of noPk) console.error(`   ${t}`);
      console.error('\nהתיקון: להוסיף מפתח ראשי, או ALTER TABLE ... REPLICA IDENTITY FULL');
    } else if (checkOnly) {
      console.error('✅ לכל הטבלאות בפרסום יש מפתח ראשי');
    }
  }
  if (checkOnly) process.exit(noPk.length ? 1 : 0);

  const list = tables.map(t => `  public.${ident(t)}`).join(',\n');
  console.log(`-- נוצר ע"י scripts/gen-publication-sql.mjs · ${new Date().toISOString()}
-- ${tables.length} טבלאות, מתוך MIRROR_TABLES. אין לערוך ידנית - להריץ מחדש.

-- 1. הרשאות לתפקיד הרפליקציה (קריאה בלבד)
GRANT USAGE ON SCHEMA public TO ${ROLE};
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${ROLE};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${ROLE};

-- 2. הפרסום. DROP+CREATE ולא ALTER: כך ריצה חוזרת אחרי הוספת טבלאות
--    מביאה את הפרסום למצב מלא, בלי לזכור מה השתנה.
--    ⚠️ DROP PUBLICATION **אינו** מוחק את סלוט הרפליקציה של המנוי.
DROP PUBLICATION IF EXISTS ${PUBLICATION};
CREATE PUBLICATION ${PUBLICATION} FOR TABLE
${list};

-- 3. אימות
SELECT count(*) AS tables_in_publication
  FROM pg_publication_tables WHERE pubname = '${PUBLICATION}';`);
} finally {
  await pool.end?.();
}
