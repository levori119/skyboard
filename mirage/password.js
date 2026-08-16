// מיראז' — מדיניות סיסמה חזקה ואחסון מוצפן, לפי התקן (NIST SP 800-63B).
// מדיניות: 12-64 תווים · אות גדולה · אות קטנה · ספרה · תו מיוחד ·
//          לא מכילה מספר אישי/שם · לא סיסמה נפוצה.
// אחסון: scrypt (node:crypto) עם salt אקראי פר-משתמש — לעולם לא plaintext.
// פורמט: s2$<salt-base64>$<hash-base64>
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 64;

// רשימת סיסמאות נפוצות (בדיקה אחרי נרמול לאותיות קטנות והסרת תווים לא-אלפאנומריים)
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'qwerty123', 'qwertyuiop',
  '123456789012', 'abc123abc123', 'iloveyou123', 'admin123admin',
  'welcome12345', 'letmein12345', 'skyking2026', 'mirage2026',
]);

export const PASSWORD_POLICY_HE =
  'לפחות 12 תווים, אות גדולה, אות קטנה, ספרה ותו מיוחד; בלי מספר אישי או שם';

// מחזיר { ok, errors } — errors: קודי מדיניות שנכשלו
export function validatePassword(password, { personalNumber, firstName, lastName } = {}) {
  const errors = [];
  const pw = String(password || '');

  if (pw.length < PASSWORD_MIN_LENGTH) errors.push('too_short');
  if (pw.length > PASSWORD_MAX_LENGTH) errors.push('too_long');
  if (!/[A-Z]/.test(pw)) errors.push('missing_upper');
  if (!/[a-z]/.test(pw)) errors.push('missing_lower');
  if (!/[0-9]/.test(pw)) errors.push('missing_digit');
  if (!/[^A-Za-z0-9֐-׿]/.test(pw)) errors.push('missing_special');

  const lower = pw.toLowerCase();
  for (const part of [personalNumber, firstName, lastName]) {
    const p = String(part || '').trim().toLowerCase();
    if (p.length >= 3 && lower.includes(p)) {
      errors.push('contains_personal_info');
      break;
    }
  }

  const normalized = lower.replace(/[^a-z0-9]/g, '');
  if (COMMON_PASSWORDS.has(normalized) || COMMON_PASSWORDS.has(lower)) {
    errors.push('common_password');
  }

  return { ok: errors.length === 0, errors };
}

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 64);
  return `s2$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [tag, saltB64, hashB64] = String(stored || '').split('$');
    if (tag !== 's2' || !saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = scryptSync(String(password), salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
