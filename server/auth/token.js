// אסימון הזדהות חתום — הבסיס לשכבת האימות של SKY-KING (ממצא אבטחה SK-01).
//
// למה HMAC עם node:crypto ולא jsonwebtoken/passport: המערכת נפרסת לרשת מבודדת,
// וכל תלות חיצונית היא נטל בשרשרת האספקה (SK-30) ו-CVE נוסף לתחזק (SK-19).
// חתימת HMAC-SHA256 על JSON היא בדיוק מה ש-JWT עושה עבור המקרה הזה, ב-40 שורות
// בלי חבילה. הפורמט מתועד למטה כדי שמי שיחליף אותו בעתיד (למשל בכניסה למערכת
// הזדהות ארגונית) יידע בדיוק מה הוא מחליף.
//
// פורמט:  v1.<base64url(payload JSON)>.<base64url(HMAC-SHA256)>
// החתימה מחושבת על המחרוזת "v1.<payload>" — כולל תג הגרסה, כדי שלא ניתן יהיה
// להוריד גרסה (downgrade) על ידי שינוי התג.
//
// ⚠️ האסימון **אינו מוצפן**, רק חתום. אסור להכניס אליו סוד. הוא מכיל זהות
// והרשאה בלבד — בדיוק מה שהלקוח ממילא רואה על עצמו.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** תוקף ברירת מחדל: 12 שעות = משמרת. מעבר לכך נדרשת הזדהות מחדש (SK-26). */
export const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

const VERSION = 'v1';

let cachedSecret = null;

/**
 * הסוד לחתימה. בפרודקשן **חובה** להגדיר AUTH_SECRET — ראה assertAuthSecret().
 * בפיתוח נוצר סוד אקראי לכל הרצה: האסימונים מתבטלים בהפעלה מחדש, וזה מכוון —
 * עדיף חוסר נוחות בפיתוח על פני סוד ברירת מחדל שיזלוג לפרודקשן.
 */
function secret() {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = Buffer.from(fromEnv, 'utf8');
    return cachedSecret;
  }
  cachedSecret = randomBytes(48);
  return cachedSecret;
}

/**
 * נבדק בעליית השרת (server.js) ולא בשימוש הראשון: שרת פרודקשן שעולה בלי סוד
 * חייב ליפול **בקול** ומיד, ולא להתחיל לשרת ואז להיכשל באסימון הראשון.
 * זו ההחלטה ההפוכה מ-DIAG_TOKEN (SK-13), שם שער אופציונלי הפך ללא-שער.
 */
export function assertAuthSecret() {
  const v = process.env.AUTH_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  if (v && v.length >= 32) return { ok: true, source: 'env' };
  if (isProd) {
    throw new Error(
      'AUTH_SECRET חסר או קצר מ-32 תווים. בפרודקשן זו דרישה קשיחה - ' +
      'בלעדיו אי אפשר לחתום אסימוני הזדהות. ליצירת סוד: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  return { ok: true, source: 'ephemeral' };
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(data) {
  return createHmac('sha256', secret()).update(data).digest();
}

/**
 * חותם אסימון. `claims` הוא מה שהשרת קבע - **לעולם לא מה שהלקוח שלח**.
 * @param {object} claims
 * @param {number} [ttlMs]
 * @returns {string}
 */
export function signToken(claims, ttlMs = DEFAULT_TTL_MS) {
  const now = Date.now();
  const payload = { ...claims, iat: now, exp: now + ttlMs };
  const body = `${VERSION}.${b64url(JSON.stringify(payload))}`;
  return `${body}.${b64url(sign(body))}`;
}

/**
 * מאמת אסימון ומחזיר את ה-claims, או null. כל כשל מחזיר null באותה צורה:
 * אין הבחלה בין "פג תוקף" ל"חתימה שגויה" כלפי חוץ, כדי לא לתת מידע לתוקף.
 * @param {string|null|undefined} token
 * @returns {object|null}
 */
export function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  const body = `${parts[0]}.${parts[1]}`;
  let given;
  try {
    given = Buffer.from(parts[2], 'base64url');
  } catch {
    return null;
  }
  const expected = sign(body);
  // timingSafeEqual זורק כשהאורכים שונים — בודקים קודם, אחרת אורך שגוי יפיל את הבקשה
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims || typeof claims !== 'object') return null;
  if (typeof claims.exp !== 'number' || Date.now() >= claims.exp) return null;
  return claims;
}

/** מחלץ את האסימון מכותרת Authorization. מקבל רק סכמת Bearer. */
export function bearerFrom(req) {
  const raw = req.get?.('Authorization') || req.headers?.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  return m ? m[1].trim() : null;
}
