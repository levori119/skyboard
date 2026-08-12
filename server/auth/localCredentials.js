// הזדהות בעמדה מנותקת — אסמכתאות שמורות.
//
// הבעיה: ההזדהות של SKY-KING עוברת דרך המיראז', שירות **חיצוני**. עמדה
// שהכבל שלה מנותק מקבלת `502 mirage_unavailable`, ולכן הפקח לא יכול להיכנס
// כלל — גם אם המאגר המקומי מלא ותקין.
//
// הפתרון הוא הדפוס של כניסה לדומיין ב-Windows בלי קשר לבקר התחום: אחרי כניסה
// **מוצלחת** מול המיראז', העמדה שומרת אצלה טביעה של הסיסמה ואת הזהות שהמיראז'
// אישר. בנתק היא מאמתת מולן. כך אין מסלול הזדהות חדש — יש זיכרון של מסלול
// שכבר עבר.
//
// שלוש מגבלות מכוונות:
//   1. **תוקף.** אסמכתא פגה אחרי CACHE_TTL_DAYS. עמדה שנשכחה במחסן לא
//      נשארת דלת כניסה לצמיתות עם סיסמה שהוחלפה מזמן.
//   2. **רק מי שכבר נכנס כאן.** אין "רישום" מקומי. אם הפקח מעולם לא נכנס
//      בעמדה הזו כשהייתה מחוברת, אין לו כניסה בנתק — וזה נכון: אחרת כל עמדה
//      הייתה מקור סמכות עצמאי.
//   3. **scrypt ולא SHA.** הסיסמה נשמרת כטביעה יקרה-לחישוב עם מלח פר-משתמש,
//      כך שמי שמעתיק את קובץ המאגר לא מקבל סיסמאות בכוח גס זול.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCb);

/** כמה זמן אסמכתא שמורה תקפה בלי חידוש מול המיראז'. */
export const CACHE_TTL_DAYS = Number(process.env.SKYKING_OFFLINE_CRED_DAYS) || 14;

/** פרמטרי scrypt. N=2^15 — כשנייה על מעבד עמדה, יקר מספיק מול כוח גס. */
const KEYLEN = 64;
const SCRYPT_OPTS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const dk = await scrypt(String(password), salt, KEYLEN, SCRYPT_OPTS);
  return { salt, hash: dk.toString('hex') };
}

/** השוואה בזמן קבוע — אחרת זמן התשובה מדליף כמה תווים התאימו. */
export async function verifyPassword(password, salt, expectedHex) {
  try {
    const dk = await scrypt(String(password), salt, KEYLEN, SCRYPT_OPTS);
    const expected = Buffer.from(expectedHex, 'hex');
    return dk.length === expected.length && timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}

/**
 * הטבלה נוצרת **רק** בשרת המקומי (server/local.js) ולא ב-initDb המשותף:
 * למאגר המרכזי אין שום צורך בטביעות סיסמה, ועמודה כזו שם היא רק משטח תקיפה.
 */
export async function ensureLocalCredentialsTable(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS local_credentials (
    personal_number VARCHAR(32) PRIMARY KEY,
    salt            TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    claims          JSONB NOT NULL,
    cached_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    last_used_at    TIMESTAMPTZ
  )`);
}

/**
 * שומר אסמכתא אחרי כניסה מוצלחת מול המיראז'.
 * `claims` הוא מה שהמיראז' אישר — תפקידים, מזהה איש צוות, הגבלת עמדות.
 */
export async function cacheCredential(pool, { personalNumber, password, claims, now = Date.now() }) {
  const pn = String(personalNumber || '').trim();
  if (!pn || !password) throw new Error('personalNumber ו-password נדרשים');
  const { salt, hash } = await hashPassword(password);
  const expires = new Date(now + CACHE_TTL_DAYS * 86400_000);
  await pool.query(
    `INSERT INTO local_credentials (personal_number, salt, password_hash, claims, cached_at, expires_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (personal_number) DO UPDATE
       SET salt = EXCLUDED.salt, password_hash = EXCLUDED.password_hash,
           claims = EXCLUDED.claims, cached_at = EXCLUDED.cached_at, expires_at = EXCLUDED.expires_at`,
    [pn, salt, hash, JSON.stringify(claims ?? {}), new Date(now), expires],
  );
  return { expiresAt: expires };
}

/** למה הכניסה המקומית נדחתה. מוחזר לקריאה ביומן ולהודעה למפעיל. */
export const LOCAL_LOGIN = {
  OK: 'ok',
  NO_CREDENTIAL: 'no_local_credential',
  EXPIRED: 'local_credential_expired',
  BAD_PASSWORD: 'bad_credentials',
};

/**
 * מאמת כניסה מול האסמכתא השמורה.
 *
 * ⚠️ אין כאן הגנת קצב. היא נדרשת בשכבה שמעל (הנתיב), אחרת עמדה גנובה היא
 * מכונת ניחוש סיסמאות בלי הגבלה.
 */
export async function verifyLocalLogin(pool, { personalNumber, password, now = Date.now() }) {
  const pn = String(personalNumber || '').trim();
  const r = await pool.query(
    `SELECT salt, password_hash, claims, expires_at FROM local_credentials WHERE personal_number = $1`, [pn]);
  if (r.rows.length === 0) return { ok: false, reason: LOCAL_LOGIN.NO_CREDENTIAL };

  const row = r.rows[0];
  if (new Date(row.expires_at).getTime() <= now) return { ok: false, reason: LOCAL_LOGIN.EXPIRED };

  const good = await verifyPassword(password, row.salt, row.password_hash);
  if (!good) return { ok: false, reason: LOCAL_LOGIN.BAD_PASSWORD };

  await pool.query(`UPDATE local_credentials SET last_used_at = $2 WHERE personal_number = $1`, [pn, new Date(now)]);
  return { ok: true, reason: LOCAL_LOGIN.OK, claims: row.claims ?? {} };
}

/** ניקוי אסמכתאות שפג תוקפן. נקרא בעליית השרת המקומי. */
export async function purgeExpiredCredentials(pool, now = Date.now()) {
  const r = await pool.query(`DELETE FROM local_credentials WHERE expires_at <= $1`, [new Date(now)]);
  return r.rowCount ?? 0;
}

// ── הגבלת קצב ─────────────────────────────────────────────────────────────────
// בלי זה, עמדה שנלקחה היא מכונת ניחוש סיסמאות בלי הגבלה: הטביעה יושבת על
// הדיסק והתוקף יכול לנסות מולה בלי סוף. במיראז' יש הגבלה משלו (`rate_limited`),
// והכניסה המקומית חייבת את המקבילה שלה.
//
// בזיכרון ולא ב-DB בכוונה: אתחול העמדה מנקה את המונה, וזה מקובל — מי שמאתחל
// עמדה כדי לאפס מונה כבר עומד מולה פיזית, וזה תרחיש אחר לגמרי.

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60_000;

export function createLoginLimiter({ maxAttempts = MAX_ATTEMPTS, lockoutMs = LOCKOUT_MS } = {}) {
  const state = new Map(); // personalNumber → { fails, until }

  return {
    /** האם הכניסה חסומה כרגע, וכמה זמן נותר. */
    check(personalNumber, now = Date.now()) {
      const s = state.get(String(personalNumber));
      if (!s || s.until <= now) return { blocked: false, retryInMs: 0 };
      return { blocked: true, retryInMs: s.until - now };
    },
    fail(personalNumber, now = Date.now()) {
      const key = String(personalNumber);
      const s = state.get(key) ?? { fails: 0, until: 0 };
      if (s.until <= now && s.until !== 0) { s.fails = 0; s.until = 0; } // חלון קודם פג
      s.fails++;
      if (s.fails >= maxAttempts) { s.until = now + lockoutMs; s.fails = 0; }
      state.set(key, s);
    },
    succeed(personalNumber) { state.delete(String(personalNumber)); },
    /** לבדיקות */
    _state: state,
  };
}
