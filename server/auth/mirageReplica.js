// המיראז' במאגר המקומי - כניסה בנתק לכל משתמש מורשה.
//
// הבעיה: האסמכתאות השמורות (localCredentials.js) מכסות רק מי שכבר נכנס
// **בעמדה הזו** כשהיה קשר. פקח שמגיע למשמרת בעמדה שמעולם לא עבד בה, או עמדה
// שהותקנה ברשת מנותקת ולא ראתה את המרכז אף פעם - אף אחד לא נכנס.
//
// הפתרון: העמדה מחזיקה העתק של משתמשי המיראז' לאפליקציה, **עם טביעת הסיסמה
// של המיראז' עצמו** (scrypt, `s2$salt$hash`). האימות בנתק הוא אותו אימות
// בדיוק שהמיראז' עושה - אותה פונקציה (`mirage/password.js`), ולכן אין כאן
// מסלול הזדהות שני שיכול להתפצל מהראשון.
//
// ההעתק מגיע בשתי דרכים, ושתיהן מחליפות אותו **כולו**:
//   · שירות המראה (sync/daemon.js) בכל סיבוב, כשיש קשר
//   · חבילת האתחול (sync/stationSeed.js) לעמדה שמעולם לא ראתה את המרכז
// החלפה מלאה ולא upsert: משתמש שהוסר במיראז' חייב להיעלם גם מכאן, אחרת
// העמדה היא דלת שנשארת פתוחה למי שכבר אין לו הרשאה.
//
// ⚠️ **המחיר, וההכרעה:** טביעות הסיסמה של כל המורשים יושבות על דיסק העמדה.
// זו הכרעה מפורשת (2026-10-02) - העמדה חייבת לעבוד בנתק מלא. ההגנות: scrypt
// עם מלח פר-משתמש, הגבלת קצב בנתיב (`createLoginLimiter`), שהטבלה אינה נכנסת
// ליומן הביטול (UNDO_DENYLIST) ושאינה קיימת במאגר המרכזי בכלל.

import { verifyPassword } from '../../mirage/password.js';
import { mirageAppEntry } from './mirageApps.js';

/** הטבלה נוצרת **רק** במאגר המקומי (server/local.js), כמו local_credentials. */
export async function ensureMirageReplicaTable(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS mirage_users (
    personal_number VARCHAR(32) PRIMARY KEY,
    first_name      TEXT NOT NULL DEFAULT '',
    last_name       TEXT NOT NULL DEFAULT '',
    apps            JSONB NOT NULL DEFAULT '{}'::jsonb,
    password_hash   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

/**
 * מחליף את ההעתק כולו ברשימה שהגיעה מהמיראז'.
 *
 * ⚠️ **פקודה אחת ולא טרנזקציה.** במאגר המקומי יש חיבור יחיד, ו-BEGIN שפותח
 * `pool.query` אחד וסוגר אחר היה עוטף גם בקשות של המפעיל שנכנסו באמצע.
 * DELETE ו-INSERT באותה פקודה (CTE) הם אטומיים מעצמם.
 *
 * ⚠️ **קלט שאינו מערך נזרק.** תשובה שבורה מהמרכז אינה "אין משתמשים" -
 * פירוש כזה היה מרוקן את ההעתק ונועל את כל העמדה בנתק הבא.
 */
export async function replaceMirageUsers(pool, users) {
  if (!Array.isArray(users)) throw new Error('רשימת משתמשי מיראז\' אינה מערך');
  const rows = users
    .filter(u => u && String(u.personalNumber || '').trim())
    .map(u => ({
      personal_number: String(u.personalNumber).trim(),
      first_name: u.firstName || '',
      last_name: u.lastName || '',
      apps: u.apps || {},
      password_hash: u.passwordHash || null,
    }));
  await pool.query(
    `WITH incoming AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb)
         AS x(personal_number TEXT, first_name TEXT, last_name TEXT, apps JSONB, password_hash TEXT)
     ), gone AS (
       DELETE FROM mirage_users WHERE personal_number NOT IN (SELECT personal_number FROM incoming)
     )
     INSERT INTO mirage_users (personal_number, first_name, last_name, apps, password_hash, updated_at)
     SELECT personal_number, first_name, last_name, apps, password_hash, NOW() FROM incoming
     ON CONFLICT (personal_number) DO UPDATE
       SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
           apps = EXCLUDED.apps, password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
    [JSON.stringify(rows)],
  );
  return { count: rows.length };
}

export async function countMirageUsers(pool) {
  const r = await pool.query('SELECT COUNT(*)::int AS n FROM mirage_users');
  return r.rows[0].n;
}

/** למה הכניסה מול ההעתק נדחתה. */
export const REPLICA_LOGIN = {
  OK: 'ok',
  /** לא בהעתק - הנתיב ממשיך לאסמכתא השמורה, ולא נועל */
  NOT_FOUND: 'not_in_replica',
  BAD_PASSWORD: 'bad_credentials',
  PASSWORD_NOT_SET: 'password_not_set',
  APP_NOT_PERMITTED: 'app_not_permitted',
};

/**
 * מאמת כניסה מול ההעתק. מחזיר את אותה צורה ש-`/api/authorize` של המיראז'
 * מחזיר (`auth`), כדי שהנתיב יבנה ממנה את הסשן באותו קוד של הכניסה המקוונת.
 */
export async function verifyReplicaLogin(pool, { personalNumber, password, appName }) {
  const pn = String(personalNumber || '').trim();
  const r = await pool.query(
    'SELECT first_name, last_name, apps, password_hash FROM mirage_users WHERE personal_number = $1', [pn]);
  if (r.rows.length === 0) return { ok: false, reason: REPLICA_LOGIN.NOT_FOUND };
  const u = r.rows[0];
  if (!u.password_hash) return { ok: false, reason: REPLICA_LOGIN.PASSWORD_NOT_SET };
  if (!verifyPassword(password, u.password_hash)) return { ok: false, reason: REPLICA_LOGIN.BAD_PASSWORD };
  const { roles, workstations, positions } = mirageAppEntry(u.apps, appName);
  if (roles.length === 0) return { ok: false, reason: REPLICA_LOGIN.APP_NOT_PERMITTED };
  const firstName = u.first_name || '';
  const lastName = u.last_name || '';
  return {
    ok: true,
    reason: REPLICA_LOGIN.OK,
    auth: {
      authorized: true, roles, workstations, positions,
      user: { personalNumber: pn, firstName, lastName, fullName: `${firstName} ${lastName}`.trim() },
    },
  };
}
