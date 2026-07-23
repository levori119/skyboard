// מיראז' — שכבת אחסון מתחלפת:
//   · Postgres (Neon) כשיש DATABASE_URL/MIRAGE_DATABASE_URL — לפרודקשן,
//     כדי שעריכות משתמשים ישרדו פריסות (הדיסק ב-Railway זמני).
//   · קובץ data.json כשאין DB — פיתוח מקומי ובדיקות (ללא תלות ברשת).
// בהפעלה ראשונה מול DB ריק — ייבוא חד-פעמי של המשתמשים מ-data.json.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_FILE = path.join(__dirname, 'data.json');

// ── אחסון קובץ (המנגנון המקורי, עטוף ב-API אחיד אסינכרוני) ──────────────────
export function createFileStore(dataFile = DEFAULT_DATA_FILE) {
  const load = () => {
    try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
    catch { return { users: [] }; }
  };
  const save = (store) => fs.writeFileSync(dataFile, JSON.stringify(store, null, 2), 'utf8');
  return {
    kind: 'file',
    async listUsers() { return load().users; },
    async getUser(pn) { return load().users.find(u => u.personalNumber === pn) || null; },
    async createUser(user) {
      const store = load();
      if (store.users.some(u => u.personalNumber === user.personalNumber)) return null;
      store.users.push(user);
      save(store);
      return user;
    },
    async updateUser(pn, patch) {
      const store = load();
      const user = store.users.find(u => u.personalNumber === pn);
      if (!user) return null;
      if (patch.firstName !== undefined) user.firstName = patch.firstName;
      if (patch.lastName !== undefined) user.lastName = patch.lastName;
      if (patch.apps !== undefined) user.apps = patch.apps;
      save(store);
      return user;
    },
    async deleteUser(pn) {
      const store = load();
      const before = store.users.length;
      store.users = store.users.filter(u => u.personalNumber !== pn);
      if (store.users.length === before) return false;
      save(store);
      return true;
    },
  };
}

// ── אחסון Postgres/Neon ──────────────────────────────────────────────────────
const rowToUser = (r) => ({
  personalNumber: r.personal_number,
  firstName: r.first_name,
  lastName: r.last_name || '',
  apps: r.apps || {},
});

export function createPgStore(databaseUrl) {
  let pool = null;
  let ready = null;

  const init = async () => {
    const { default: pg } = await import('pg');
    pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query(`CREATE TABLE IF NOT EXISTS mirage_users (
      personal_number VARCHAR(20) PRIMARY KEY,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) DEFAULT '',
      apps JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    // ייבוא חד-פעמי מהקובץ — רק כשהטבלה ריקה (המשתמשים שהוגדרו בפיתוח)
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM mirage_users');
    if (rows[0].n === 0) {
      let seed = { users: [] };
      try { seed = JSON.parse(fs.readFileSync(DEFAULT_DATA_FILE, 'utf8')); } catch { /* אין קובץ — מתחילים ריק */ }
      for (const u of seed.users || []) {
        await pool.query(
          `INSERT INTO mirage_users (personal_number, first_name, last_name, apps)
           VALUES ($1, $2, $3, $4) ON CONFLICT (personal_number) DO NOTHING`,
          [u.personalNumber, u.firstName || '', u.lastName || '', JSON.stringify(u.apps || {})]
        );
      }
      if ((seed.users || []).length) console.log(`[mirage] ייבוא ראשוני ל-DB: ${seed.users.length} משתמשים מ-data.json`);
    }
  };
  const ensure = () => (ready ??= init());

  return {
    kind: 'pg',
    async listUsers() {
      await ensure();
      const { rows } = await pool.query('SELECT * FROM mirage_users ORDER BY first_name, last_name');
      return rows.map(rowToUser);
    },
    async getUser(pn) {
      await ensure();
      const { rows } = await pool.query('SELECT * FROM mirage_users WHERE personal_number = $1', [pn]);
      return rows.length ? rowToUser(rows[0]) : null;
    },
    async createUser(user) {
      await ensure();
      const { rows } = await pool.query(
        `INSERT INTO mirage_users (personal_number, first_name, last_name, apps)
         VALUES ($1, $2, $3, $4) ON CONFLICT (personal_number) DO NOTHING RETURNING *`,
        [user.personalNumber, user.firstName, user.lastName || '', JSON.stringify(user.apps || {})]
      );
      return rows.length ? rowToUser(rows[0]) : null;
    },
    async updateUser(pn, patch) {
      await ensure();
      const { rows } = await pool.query(
        `UPDATE mirage_users SET
           first_name = COALESCE($1, first_name),
           last_name  = COALESCE($2, last_name),
           apps       = COALESCE($3, apps),
           updated_at = NOW()
         WHERE personal_number = $4 RETURNING *`,
        [patch.firstName ?? null, patch.lastName ?? null,
         patch.apps !== undefined ? JSON.stringify(patch.apps) : null, pn]
      );
      return rows.length ? rowToUser(rows[0]) : null;
    },
    async deleteUser(pn) {
      await ensure();
      const { rowCount } = await pool.query('DELETE FROM mirage_users WHERE personal_number = $1', [pn]);
      return rowCount > 0;
    },
  };
}

// בחירת אחסון: dataFile מפורש (בדיקות) → קובץ; אחרת DB אם מוגדר; אחרת קובץ.
export function createStore({ dataFile, databaseUrl } = {}) {
  if (dataFile) return createFileStore(dataFile);
  const url = databaseUrl || process.env.MIRAGE_DATABASE_URL || process.env.DATABASE_URL;
  return url ? createPgStore(url) : createFileStore();
}
