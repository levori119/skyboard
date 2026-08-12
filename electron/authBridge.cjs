// גשר הזהות בין השרת המרכזי למאגר המקומי.
//
// שתי בעיות שהוא פותר, ושתיהן מתגלות רק ברגע שהקשר נופל:
//
//   1. **הפקח מנותק באמצע משמרת.** לשרת המקומי סוד חתימה משלו, ולכן אסימון
//      שהשרת המרכזי הנפיק נדחה אצלו ב-401. בחירה מודעת: סוד משותף לכל
//      העמדות היה הופך כל עמדה גנובה למפתח של המערכת כולה. במקום זה, בכל
//      כניסה מוצלחת העמדה מבקשת מהשרת המקומי אסימון **משלו** לאותה זהות,
//      ומחליפה אליו כשהניתוב עובר. עמדה גנובה יכולה לזייף סשן על עצמה בלבד.
//
//   2. **עמדה שעולה כשהיא כבר מנותקת.** אין למי לפנות: המיראז' חיצוני.
//      לכן בכל כניסה מוצלחת נשמרת גם טביעת הסיסמה (server/auth/localCredentials.js),
//      וכניסה בנתק מאומתת מולה.
//
// שתיהן נשענות על אותו רגע: **כניסה מוצלחת מול השרת המרכזי**. הגשר מקשיב לו,
// ואינו יוצר שום מסלול הזדהות חדש.

const http = require('http');
const https = require('https');
const { URL } = require('url');

const LOGIN_PATH = '/api/auth/mirage-login';
const CACHE_PATH = '/api/auth/cache-credential';

/**
 * מפענח את גוף האסימון בלי לאמת חתימה.
 *
 * מכוון: אין לעמדה את סוד השרת המרכזי, והיא גם לא צריכה אותו. האמון כאן אינו
 * באסימון אלא ב**תשובה** שהשרת המרכזי החזיר - הוא הסמכות, והוא ענה 200.
 * מכאן שולפים רק את מה שהוא כבר הכריע (תפקידים, עמדות מאושרות).
 */
function decodeTokenClaims(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function postJson(targetUrl, payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(targetUrl); } catch (e) { return reject(e); }
    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: res.statusCode, body: JSON.parse(text || '{}') }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('cache-credential timeout')));
    req.on('error', reject);
    req.end(data);
  });
}

function createAuthBridge({ localTarget = () => null, timeoutMs = 8000, log = console } = {}) {
  // אסימון מרכזי → אסימון מקומי. בזיכרון בכוונה: הוא חי כאורך הסשן, והפעלה
  // מחדש של העמדה מחייבת כניסה מחדש ממילא.
  const tokens = new Map();

  return {
    LOGIN_PATH,

    /**
     * נקרא אחרי כניסה **מוצלחת** מול השרת המרכזי.
     * @param {Buffer|string} reqBody  גוף בקשת הכניסה (מספר אישי + סיסמה)
     * @param {Buffer|string} resBody  תשובת השרת המרכזי (אסימון + זהות)
     */
    async onLoginSuccess(reqBody, resBody) {
      const local = localTarget();
      if (!local) return { cached: false, reason: 'המאגר המקומי עדיין לא עלה' };

      let creds, out;
      try {
        creds = JSON.parse(String(reqBody || '{}'));
        out = JSON.parse(String(resBody || '{}'));
      } catch {
        return { cached: false, reason: 'גוף הכניסה אינו JSON' };
      }
      if (!creds.personalNumber || !creds.password || !out.token) {
        return { cached: false, reason: 'חסרים שדות בכניסה' };
      }

      const claims = decodeTokenClaims(out.token) || {};
      try {
        const r = await postJson(`${local}${CACHE_PATH}`, {
          personalNumber: creds.personalNumber,
          password: creds.password,
          claims: {
            crewMemberId: claims.crewMemberId ?? null,
            personalId: claims.personalId ?? String(creds.personalNumber),
            name: claims.name ?? null,
            isAdmin: !!claims.isAdmin,
            isTeamLead: !!claims.isTeamLead,
            isManpower: !!claims.isManpower,
            approvedWorkstations: claims.approvedWorkstations ?? [],
            crewMember: out.crewMember ?? null,
            roles: out.roles ?? [],
          },
        }, timeoutMs);

        if (r.status !== 200 || !r.body?.localToken) {
          return { cached: false, reason: `השרת המקומי החזיר ${r.status}` };
        }
        tokens.set(out.token, r.body.localToken);
        log.log?.(`[authBridge] אסמכתא נשמרה לעבודה בנתק (תוקף עד ${r.body.expiresAt})`);
        return { cached: true };
      } catch (err) {
        // כשל כאן אינו שובר את הכניסה עצמה - הפקח כבר נכנס. הוא רק מבטל את
        // היכולת לעבוד בנתק, ולכן נרשם בקול.
        log.warn?.(`[authBridge] שמירת אסמכתא נכשלה: ${err.message}`);
        return { cached: false, reason: err.message };
      }
    },

    /**
     * מחליף אסימון מרכזי במקומי כשהבקשה מנותבת למאגר המקומי.
     * בלי התאמה - מחזיר את הכותרת כמות שהיא, והשרת המקומי יחזיר 401 שיוביל
     * את הלקוח למסך כניסה. זו התנהגות נכונה: עדיף להתבקש להיכנס שוב מאשר
     * שהעמדה תעבוד עם זהות שאיש לא אימת.
     */
    swapAuthHeader(authHeader) {
      const m = /^Bearer\s+(.+)$/i.exec(String(authHeader || '').trim());
      if (!m) return null;
      const local = tokens.get(m[1].trim());
      return local ? `Bearer ${local}` : null;
    },

    /** לחיווי ולבדיקות */
    knownSessions: () => tokens.size,
    _tokens: tokens,
  };
}

module.exports = { createAuthBridge, decodeTokenClaims, LOGIN_PATH, CACHE_PATH };
