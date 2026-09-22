// הצצה אל המאגר המקומי שבעמדה - מה באמת יושב בו.
//
// **למה זה נחוץ:** עד היום "האם המאגר המקומי מלא" הייתה שאלה שאי אפשר היה
// לענות עליה בלי לפתוח קונסולה. כשהמראה מהמרכז נפלה בשקט (502 על בקשה שחרגה
// מתקרת הזמן), הדרך היחידה לגלות זאת הייתה **לנתק את העמדה ולראות מסך ריק** -
// כלומר לגלות את התקלה ברגע הכי גרוע. הדף הזה הופך את זה לדבר שרואים מראש.
//
// ⚠️ **`localOnly` בכל נתיב.** במאגר המרכזי אין לזה שום שימוש, ויש לזה נזק:
// קריאה חופשית של כל טבלה היא בדיוק מה ש-457 ה-endpoints נמנעים ממנו בכוונה.
// כאן זה מותר רק כי המאגר הוא של העמדה עצמה, והשרת מאזין ל-127.0.0.1 בלבד.
//
// ⚠️ **חיבור יחיד.** PGlite אינו pool, ולכן כל handler כאן מריץ `pool.query`
// ישירות ולעולם אינו מחזיק `connect()` - ראה server/db/localPool.js §חיבור יחיד.

import express from 'express';
import pool from '../db/pool.js';
import { currentSchema } from '../db/env-context.js';
import { isLocalDbMode } from '../db/localPool.js';
import { mirrorDaemonState } from '../sync/daemon.js';

const router = express.Router();

const localOnly = (req, res, next) =>
  isLocalDbMode() ? next() : res.status(404).json({ error: 'not a local station' });

/** תקרת שורות לבקשה. מסך אחד, לא ייצוא. */
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

/** מזהה מצוטט. הגנה מפני הזרקה דרך שם טבלה שמגיע מה-query. */
const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;

/**
 * מאשרת ששם הטבלה קיים **בקטלוג** לפני שהוא נכנס לשאילתה.
 *
 * ציטוט לבדו אינו מספיק כאן: שם שאינו קיים היה מייצר שגיאת SQL גולמית
 * שנשלחת ללקוח, ושם טבלה של מערכת היה נקרא בשמחה. רשימת ההיתר היא הקטלוג
 * של הסכמה הנוכחית, ותו לא.
 */
async function tableExists(schema, table) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'`,
    [schema, table],
  );
  return rows.length > 0;
}

// ── סיכום: כל הטבלאות ומספר השורות בכל אחת ───────────────────────────────────
//
// `COUNT(*)` על כל טבלה ולא הערכה מ-`pg_class.reltuples`: במאגר של עמדה
// מדובר בעשרות אלפי שורות לכל היותר, והערכה שמראה 0 על טבלה מלאה (או להפך)
// היא בדיוק סוג המידע השגוי שהדף הזה בא למנוע.
router.get('/api/__localdb/summary', localOnly, async (_req, res) => {
  try {
    const schema = currentSchema();
    const { rows: names } = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
      [schema],
    );

    const tables = [];
    let total = 0;
    for (const { table_name: t } of names) {
      try {
        const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${ident(schema)}.${ident(t)}`);
        const n = rows[0]?.n ?? 0;
        tables.push({ table: t, rows: n });
        total += n;
      } catch {
        // טבלה שנוצרה חלקית או שאין בה הרשאה - מוצגת עם null ולא מפילה את הדף
        tables.push({ table: t, rows: null });
      }
    }

    res.json({
      schema,
      // מצב שירות המראה - התשובה ל"למה המאגר ריק". בלעדיו הדף מראה 0 שורות
      // ומשאיר את המפעיל לנחש אם זה כשל, תצורה חסרה, או פשוט עוד לא הספיק.
      mirror: mirrorDaemonState(),
      dataDir: process.env.SKYKING_LOCAL_DB_DIR || null,
      station: process.env.SKYKING_STATION_KEY || null,
      tableCount: tables.length,
      totalRows: total,
      tables,
      at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('GET /api/__localdb/summary', e);
    res.status(500).json({ error: 'קריאת המאגר המקומי נכשלה' });
  }
});

// ── תוכן טבלה אחת ─────────────────────────────────────────────────────────────
router.get('/api/__localdb/rows', localOnly, async (req, res) => {
  const table = String(req.query.table || '');
  const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  try {
    const schema = currentSchema();
    if (!table || !await tableExists(schema, table)) {
      return res.status(404).json({ error: 'טבלה לא קיימת במאגר המקומי' });
    }
    const qualified = `${ident(schema)}.${ident(table)}`;

    const { rows: cols } = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [schema, table],
    );
    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${qualified}`);
    // `to_jsonb` ולא שורות גולמיות: הלקוח מקבל טיפוסים שניתן להציג כמו שהם,
    // בלי שהדף יצטרך לדעת דבר על סכמת הטבלה.
    const { rows } = await pool.query(
      `SELECT to_jsonb(t) AS row FROM ${qualified} t LIMIT $1 OFFSET $2`, [limit, offset]);

    res.json({
      table,
      columns: cols.map(c => ({ name: c.column_name, type: c.data_type })),
      total: countRows[0]?.n ?? 0,
      limit,
      offset,
      rows: rows.map(r => r.row),
    });
  } catch (e) {
    console.error('GET /api/__localdb/rows', e);
    res.status(500).json({ error: 'קריאת הטבלה נכשלה' });
  }
});

export default router;
