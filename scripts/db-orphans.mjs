// ─── שורות יתומות שחוסמות מפתחות זרים ─────────────────────────────────────────
// `ensureForeignKeys()` (server/db/foreign-keys.js) מדווח בכל עלייה על FK שלא
// ניתן להוסיף, אבל לא אומר **כמה** שורות חוסמות אותו ומה הן. הסקריפט הזה עונה
// על זה, ויודע גם לנקות.
//
//   node scripts/db-orphans.mjs            # דוח בלבד (ברירת מחדל, קריאה בלבד)
//   node scripts/db-orphans.mjs --sample   # דוח + עד 5 שורות לדוגמה מכל יתמות
//   node scripts/db-orphans.mjs --fix      # ניקוי בפועל, בטרנזקציה אחת לסכמה
//   node scripts/db-orphans.mjs --schema=public   # סכמה אחת בלבד
//
// מדיניות הניקוי נגזרת מכלל המחיקה המוצהר ב-FOREIGN_KEYS:
//   CASCADE  → השורה היא ילד של הורה שנמחק ואין לה משמעות בלעדיו → DELETE
//   אחר      → העמודה היא מצביע אופציונלי (מי מחזיק, לאיזה סקטור) → SET NULL
// עמודה NOT NULL שאינה CASCADE לא נוגעים בה - מדווחת ודורשת החלטה ידנית.
import 'dotenv/config';
import pg from 'pg';
import { FOREIGN_KEYS } from '../server/db/foreign-keys.js';

const args = process.argv.slice(2);
const FIX = args.includes('--fix');
const SAMPLE = args.includes('--sample');
const ONLY_SCHEMA = args.find(a => a.startsWith('--schema='))?.split('=')[1];

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const q = (sql, params) => pool.query(sql, params);
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

async function schemas() {
  if (ONLY_SCHEMA) return [ONLY_SCHEMA];
  const { rows } = await q(`
    SELECT nspname FROM pg_namespace
     WHERE nspname = 'public' OR nspname LIKE 'env%'
     ORDER BY nspname = 'public' DESC, nspname`);
  return rows.map(r => r.nspname);
}

/** FK שאינם קיימים בסכמה, מתוך המוצהרים - רק הם יכולים להיות חסומים. */
async function missingFks(schema) {
  const { rows } = await q(`
    SELECT src.relname AS tbl, a.attname AS col
      FROM pg_constraint k
      JOIN pg_class src ON src.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = src.relnamespace
      JOIN unnest(k.conkey) u(attnum) ON TRUE
      JOIN pg_attribute a ON a.attrelid = src.oid AND a.attnum = u.attnum
     WHERE k.contype = 'f' AND n.nspname = $1`, [schema]);
  const have = new Set(rows.map(r => `${r.tbl}.${r.col}`));
  return FOREIGN_KEYS.filter(([t, c]) => !have.has(`${t}.${c}`));
}

/** עמודות שקיימות בפועל בסכמה, ומה ה-nullability שלהן. */
async function columnMap(schema) {
  const { rows } = await q(`
    SELECT table_name AS t, column_name AS c, is_nullable AS nullable
      FROM information_schema.columns WHERE table_schema = $1`, [schema]);
  return new Map(rows.map(r => [`${r.t}.${r.c}`, r.nullable === 'YES']));
}

async function scanSchema(schema) {
  const cols = await columnMap(schema);
  const missing = await missingFks(schema);
  const found = [];

  for (const [table, col, refTable, refCol, rule] of missing) {
    // טבלה/עמודה שלא קיימת בסכמה הזו היא מצב תקין (חלק מהטבלאות ב-public בלבד)
    if (!cols.has(`${table}.${col}`) || !cols.has(`${refTable}.${refCol}`)) continue;

    const where = `${ident(col)} IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM ${ident(schema)}.${ident(refTable)} p WHERE p.${ident(refCol)} = c.${ident(col)})`;
    const { rows } = await q(
      `SELECT COUNT(*)::int AS n FROM ${ident(schema)}.${ident(table)} c WHERE ${where}`);
    if (!rows[0].n) continue;

    let sample = [];
    if (SAMPLE) {
      const s = await q(
        `SELECT c.${ident(col)} AS bad_value, COUNT(*)::int AS n
           FROM ${ident(schema)}.${ident(table)} c WHERE ${where}
          GROUP BY 1 ORDER BY 2 DESC LIMIT 5`);
      sample = s.rows;
    }
    found.push({ table, col, refTable, refCol, rule, where, n: rows[0].n,
                 nullable: cols.get(`${table}.${col}`), sample });
  }
  return found;
}

async function fixSchema(schema, found) {
  const client = await pool.connect();
  const done = [], manual = [];
  try {
    await client.query('BEGIN');
    for (const f of found) {
      const target = `${ident(schema)}.${ident(f.table)}`;
      if (f.rule === 'CASCADE') {
        const r = await client.query(`DELETE FROM ${target} c WHERE ${f.where}`);
        done.push(`${f.table}.${f.col}: נמחקו ${r.rowCount} שורות`);
      } else if (f.nullable) {
        const r = await client.query(
          `UPDATE ${target} c SET ${ident(f.col)} = NULL WHERE ${f.where}`);
        done.push(`${f.table}.${f.col}: אופסו ל-NULL ${r.rowCount} שורות`);
      } else {
        manual.push(`${f.table}.${f.col}: ${f.n} שורות, העמודה NOT NULL ואינה CASCADE - החלטה ידנית`);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return { done, manual };
}

const list = await schemas();
console.log(`בדיקת שורות יתומות ב-${list.length} סכמות${FIX ? ' (מצב תיקון)' : ' (קריאה בלבד)'}\n`);

let total = 0;
for (const schema of list) {
  const found = await scanSchema(schema);
  if (!found.length) { console.log(`  ${schema}: נקי`); continue; }
  total += found.reduce((s, f) => s + f.n, 0);
  console.log(`  ${schema}:`);
  for (const f of found) {
    const action = f.rule === 'CASCADE' ? 'מחיקה' : f.nullable ? 'איפוס ל-NULL' : '⚠ ידני';
    console.log(`    ${f.table}.${f.col} → ${f.refTable}.${f.refCol}  |  ${f.n} יתומות  |  ${f.rule} → ${action}`);
    for (const s of f.sample) console.log(`        ערך ${s.bad_value} (${s.n} שורות)`);
  }
  if (FIX) {
    const { done, manual } = await fixSchema(schema, found);
    for (const d of done) console.log(`    ✔ ${d}`);
    for (const m of manual) console.log(`    ⚠ ${m}`);
  }
}

console.log(`\nסה"כ ${total} שורות יתומות.`);
if (!FIX && total) console.log('להרצת הניקוי: node scripts/db-orphans.mjs --fix');
await pool.end();
