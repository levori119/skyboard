// הזדהות דרך מיראז' — מתווך בין מסך ה-LOGIN לשירות המיראז' החיצוני.
// מיראז' מזהה לפי מספר אישי ומחזיר את התפקידים המורשים לאפליקציה;
// כאן ממפים תפקידים לדגלי SKY-KING ומאחדים עם איש צוות קיים לפי personal_id
// (כדי לשמור עמדות מאושרות והעדפות אישיות).
import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import pool from '../db/pool.js';
import { signToken, DEFAULT_TTL_MS } from '../auth/token.js';
import { isLocalDbMode } from '../db/localPool.js';
import {
  cacheCredential, verifyLocalLogin, createLoginLimiter, LOCAL_LOGIN,
} from '../auth/localCredentials.js';

const router = new Router();

/** מגביל ניחושים בכניסה המקומית. מופע יחיד לתהליך — עמדה אחת, שרת אחד. */
const localLimiter = createLoginLimiter();

// 127.0.0.1 ולא localhost — fetch של Node מעדיף ::1 ועלול לפספס שרת IPv4-בלבד
const MIRAGE_URL = process.env.MIRAGE_URL || 'http://127.0.0.1:7300';
const MIRAGE_APP_NAME = process.env.MIRAGE_APP_NAME || 'SKY-KING';
// 10ש' ולא 4: המיראז' שואל Neon, וההתעוררות הקרה שלו לוקחת ~6ש' —
// timeout קצר גרם ל-"mirage_unavailable" מזויף בכניסה הראשונה
const MIRAGE_TIMEOUT_MS = 10000;

// אסימון שירות לקריאה שרת-לשרת מול המיראז' (SK-54). המיראז' דורש אותו
// ב-/api/authorize וב-GET /api/users, כך שלא כל מי שרואה את השירות ברשת יכול
// לשאול אותו על סיסמאות או למשוך את רשימת המשתמשים.
const MIRAGE_SERVICE_TOKEN = process.env.MIRAGE_SERVICE_TOKEN || '';

/**
 * מחזיר את הסטטוס **בנוסף** לגוף, ולא רק את הגוף.
 *
 * למה זה חשוב: המיראז' יכול לדחות את הקריאה משתי סיבות שונות לגמרי -
 * "המשתמש אינו מורשה" (תשובה לוגית) לעומת "אסימון השירות שגוי או חסר"
 * (כשל תצורה בין שני השירותים). בלי הסטטוס שתיהן נראות זהות, וכשל התצורה
 * הוצג למפעיל כ"אין לך הרשאה במיראז'" - הודעה ששולחת אותו לחפש את הבעיה
 * במקום הלא נכון לגמרי.
 */
const fetchMirage = async (path, init) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MIRAGE_TIMEOUT_MS);
  try {
    const headers = { ...(init?.headers || {}) };
    if (MIRAGE_SERVICE_TOKEN) headers['X-Service-Token'] = MIRAGE_SERVICE_TOKEN;
    const r = await fetch(`${MIRAGE_URL}${path}`, { ...init, headers, signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body };
  } finally {
    clearTimeout(timer);
  }
};

/** קודי השגיאה שמעידים על תקלת **תצורה** בערוץ, ולא על החלטה לגבי המשתמש. */
const CHANNEL_ERRORS = new Set(['bad_service_token', 'service_token_required', 'unauthenticated']);

/**
 * האם התשובה מעידה שהערוץ עצמו שבור. מוחזר 502 ולא 403, כדי שהמפעיל יראה
 * "המיראז' אינו זמין" ולא "אין לך הרשאה" (login.mirageUnavailable בלקוח).
 */
const isChannelFailure = (res) =>
  !res.ok && (CHANNEL_ERRORS.has(res.body?.error) || res.status >= 500);

// התאמת עמדת מיראז' ל-preset: עם id — השוואת ID טכני; ידנית — השוואת טקסט השם (trim)
const wsMatchesPreset = (w, preset) =>
  (w.id != null && Number(preset.id) === Number(w.id)) ||
  (w.name && String(preset.name).trim() === String(w.name).trim());

// תפקידים מקצועיים במיראז' (ציר נפרד מ-roles שהוא ציר ההרשאה).
// bakar = בקר (יב"א) · pakach = פקח (מגדל) — שני מקצועות נפרדים.
export const MIRAGE_POSITIONS = ['bakar', 'pakach', 'mashak', 'mefale'];

// רשומת האפליקציה של משתמש מיראז' — פורמט ישן (מערך) או מורחב
// ({roles, workstations, positions})
const mirageAppEntry = (user) => {
  const entry = (user.apps || {})[MIRAGE_APP_NAME];
  if (Array.isArray(entry)) return { roles: entry, workstations: [], positions: [] };
  if (entry && typeof entry === 'object') {
    return {
      roles: Array.isArray(entry.roles) ? entry.roles : [],
      workstations: Array.isArray(entry.workstations) ? entry.workstations : [],
      positions: Array.isArray(entry.positions)
        ? entry.positions.filter(p => MIRAGE_POSITIONS.includes(p))
        : [],
    };
  }
  return { roles: [], workstations: [], positions: [] };
};

/** מורשה לעמדה = יש לו תפקיד באפליקציה, ואין הגבלת עמדות או שהעמדה ברשימה */
const isEligibleForPreset = (entry, preset) =>
  entry.roles.length > 0 &&
  (entry.workstations.length === 0 || entry.workstations.some(w => wsMatchesPreset(w, preset)));

const presetById = async (presetId) => {
  const { rows } = await pool.query('SELECT id, name FROM workstation_presets WHERE id = $1', [presetId]);
  return rows[0] || null;
};

router.post('/api/auth/mirage-login', async (req, res) => {
  const personalNumber = String(req.body?.personalNumber || '').trim();
  const password = String(req.body?.password || '');
  // presetId אופציונלי — בהחלפת איש צוות בעמדה: מיראז' חייב לאשר גם את העמדה עצמה
  const presetId = req.body?.presetId != null ? Number(req.body.presetId) : null;
  if (!personalNumber) {
    return res.status(400).json({ error: 'missing_personal_number' });
  }
  if (!password) {
    return res.status(400).json({ error: 'missing_password' });
  }

  // ── עמדה מנותקת: אין מיראז' לפנות אליו ─────────────────────────────────────
  // השרת הזה רץ על המאגר המקומי, כלומר הכבל מנותק או שהעמדה עצמאית. פנייה
  // למיראז' תיפול ל-502, ולכן מאמתים מול האסמכתא שנשמרה בכניסה מוצלחת קודמת.
  if (isLocalDbMode()) return localLogin(req, res);

  let mirage;
  try {
    mirage = await fetchMirage('/api/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: MIRAGE_APP_NAME, personalNumber, password }),
    });
  } catch (err) {
    console.error('[mirage] service unavailable:', err.message);
    return res.status(502).json({ error: 'mirage_unavailable' });
  }

  // ⚠️ **קודם** כשל ערוץ, ורק אחר כך החלטה על המשתמש. הסדר הזה הוא התיקון:
  // כשאסימון השירות חסר או שגוי, המיראז' מחזיר 401/503 ללא שדה `authorized`,
  // והקוד הקודם נפל ישר ל-`not_authorized` — כלומר הציג למפעיל "אין לך הרשאה"
  // על תקלת תצורה בין שני השירותים. במערכת מבצעית ההודעה הזו שולחת אותו לחפש
  // את הבעיה במיראז' במקום בשרת, וזה בדיוק סוג הכשל השקט שהסקר מזהיר מפניו.
  if (isChannelFailure(mirage)) {
    console.error(
      `[mirage] ערוץ ההזדהות נכשל (HTTP ${mirage.status}, ${mirage.body?.error || 'לא ידוע'}). ` +
      'בדוק ש-MIRAGE_SERVICE_TOKEN מוגדר עם אותו ערך בשני התהליכים.',
    );
    return res.status(502).json({ error: 'mirage_unavailable', reason: mirage.body?.error || 'channel' });
  }

  const auth = mirage.body || {};
  if (!auth.authorized) {
    // מיפוי סיבות לפי סוג: אישורים שגויים → 401, חסימת ניסיונות → 429, אחרת 403
    const reason = auth.reason || 'denied';
    if (reason === 'bad_credentials' || reason === 'password_not_set') {
      return res.status(401).json({ error: reason });
    }
    if (reason === 'rate_limited') {
      return res.status(429).json({ error: reason });
    }
    return res.status(403).json({ error: 'not_authorized', reason });
  }

  const roles = Array.isArray(auth.roles) ? auth.roles : [];
  const is_admin = roles.includes('admin');
  const is_team_lead = roles.includes('team_lead');
  // כח אדם — פותח את מסך "כ"א ותחקירים" ב-LOGIN. אינו מקנה הרשאת ניהול.
  const is_manpower = roles.includes('manpower');

  // הגבלת עמדות ממיראז' → פענוח ל-ids של workstation_presets.
  // רשימה ריקה ממיראז' = אין הגבלה. הגבלה שאף עמדה בה לא זוהתה → [-1] (שום עמדה).
  const mirageWs = Array.isArray(auth.workstations) ? auth.workstations : [];
  let mirageApproved = null;
  if (mirageWs.length > 0) {
    try {
      const { rows: presets } = await pool.query('SELECT id, name FROM workstation_presets');
      const ids = new Set();
      for (const w of mirageWs) {
        const match = presets.find(p => wsMatchesPreset(w, p));
        if (match) ids.add(match.id);
      }
      mirageApproved = ids.size > 0 ? [...ids] : [-1];
    } catch (err) {
      console.error('[mirage] preset resolution failed:', err.message);
    }
  }

  // אכיפת עמדה ספציפית (החלפת איש צוות): מותר אם אין הגבלה או שהעמדה ברשימה
  if (presetId != null && mirageApproved && !mirageApproved.includes(presetId)) {
    return res.status(403).json({ error: 'workstation_not_permitted' });
  }

  // איחוד עם איש צוות קיים לפי מספר אישי — התפקידים ממיראז' גוברים
  let crewMember = null;
  try {
    const result = await pool.query(`
      SELECT cm.*,
        COALESCE(
          (SELECT json_agg(cmw.workstation_preset_id)
           FROM crew_member_workstations cmw
           WHERE cmw.crew_member_id = cm.id), '[]'
        ) as approved_workstations
      FROM crew_members cm
      WHERE cm.personal_id = $1
    `, [personalNumber]);
    if (result.rows.length > 0) {
      // בכניסת מיראז' — מיראז' הוא המקור הבלעדי לעמדות: הגבלה = בדיוק היא;
      // אין הגבלה = כל העמדות (לא רשימת ה-crew_member_workstations של SKY-KING)
      crewMember = { ...result.rows[0], is_admin, is_team_lead, is_manpower, approved_workstations: mirageApproved || [] };
    }
  } catch (err) {
    console.error('[mirage] crew lookup failed:', err.message);
  }

  // אין איש צוות תואם — משתמש וירטואלי מפרטי מיראז' (רואה את כל העמדות)
  if (!crewMember) {
    const u = auth.user || {};
    crewMember = {
      id: null,
      name: u.fullName || personalNumber,
      first_name: u.firstName || '',
      last_name: u.lastName || '',
      personal_id: personalNumber,
      is_admin,
      is_team_lead,
      is_manpower,
      approved_workstations: mirageApproved || [],
    };
  }

  // ── האסימון (SK-01) ─────────────────────────────────────────────────────────
  // כל ה-claims נגזרים ממה שהמיראז' אישר ומה שהשרת פענח — **לא** ממה שהלקוח
  // שלח. מכאן והלאה כל בקשה נושאת אותו, ו-middleware/auth.js הוא שקובע
  // מה מותר. `is_admin` שהלקוח יחזיק ב-state שלו כבר לא מעניק דבר (SK-02).
  const token = signToken({
    crewMemberId: crewMember.id ?? null,
    personalId: personalNumber,
    name: crewMember.name || null,
    isAdmin: is_admin,
    isTeamLead: is_team_lead,
    isManpower: is_manpower,
    approvedWorkstations: mirageApproved || [],
  });

  res.json({ crewMember, roles, source: 'mirage', token, expiresInMs: DEFAULT_TTL_MS });
});

// ── הזדהות בעמדה מנותקת ───────────────────────────────────────────────────────
//
// שתי נקודות, ושתיהן פועלות רק כשהשרת רץ על המאגר המקומי:
//
//   cache-credential — נקראת בזמן שיש קשר, אחרי כניסה מוצלחת מול המיראז'.
//                      שומרת טביעת סיסמה + את הזהות שהמיראז' אישר, ומחזירה
//                      אסימון מקומי לאותה זהות.
//   localLogin       — נקראת בזמן נתק, במקום המיראז'.
//
// האסימון המקומי הוא מה שפותר את הניתוק באמצע משמרת: לשרת המקומי סוד חתימה
// משלו, ולכן אסימון מהשרת המרכזי נדחה אצלו. במקום להנפיק סוד משותף לכל
// העמדות - שהיה הופך כל עמדה גנובה למפתח של המערכת כולה - כל עמדה מנפיקה
// אסימון משלה **לזהות שכבר אומתה** מול המיראז'. עמדה גנובה יכולה לזייף סשן
// על עצמה בלבד.

/** בונה את גוף התשובה של כניסה, זהה בצורתו לכניסת מיראז'. */
function loginResponse(claims, source) {
  const token = signToken({
    crewMemberId: claims.crewMemberId ?? null,
    personalId: claims.personalId,
    name: claims.name ?? null,
    isAdmin: !!claims.isAdmin,
    isTeamLead: !!claims.isTeamLead,
    isManpower: !!claims.isManpower,
    approvedWorkstations: claims.approvedWorkstations ?? [],
  });
  return {
    crewMember: claims.crewMember ?? null,
    roles: claims.roles ?? [],
    source,
    token,
    expiresInMs: DEFAULT_TTL_MS,
  };
}

async function localLogin(req, res) {
  const personalNumber = String(req.body?.personalNumber || '').trim();
  const password = String(req.body?.password || '');

  const gate = localLimiter.check(personalNumber);
  if (gate.blocked) {
    return res.status(429).json({ error: 'rate_limited', retryInMs: gate.retryInMs, source: 'local' });
  }

  let result;
  try {
    result = await verifyLocalLogin(pool, { personalNumber, password });
  } catch (err) {
    console.error('[local-auth] כשל באימות מקומי:', err.message);
    return res.status(500).json({ error: 'local_auth_failed', source: 'local' });
  }

  if (!result.ok) {
    // ניחוש סיסמה נספר; "אין אסמכתא כאן" אינו ניחוש אלא מצב תצורה, ולכן
    // אינו נועל את המשתמש - אחרת מי שלא נכנס אף פעם בעמדה הזו היה ננעל
    // אחרי חמישה ניסיונות תמימים.
    if (result.reason === LOCAL_LOGIN.BAD_PASSWORD) localLimiter.fail(personalNumber);
    const status = result.reason === LOCAL_LOGIN.BAD_PASSWORD ? 401 : 403;
    return res.status(status).json({ error: result.reason, source: 'local' });
  }

  localLimiter.succeed(personalNumber);
  console.log(`[local-auth] כניסה מקומית: ${personalNumber}`);
  res.json(loginResponse({ ...result.claims, personalId: personalNumber }, 'local'));
}

/**
 * שמירת אסמכתא לשימוש בנתק. נקראת **מהעמדה עצמה** (שרת העמדה) מיד אחרי
 * כניסה מוצלחת מול השרת המרכזי.
 *
 * ⚠️ loopback בלבד. הנתיב מקבל סיסמה בגוף הבקשה, ופתיחתו לרשת הייתה הופכת
 * אותו לצינור לאיסוף סיסמאות. השרת המקומי מאזין ל-127.0.0.1 בלבד ממילא,
 * וזו שכבת ההגנה השנייה.
 */
router.post('/api/auth/cache-credential', async (req, res) => {
  if (!isLocalDbMode()) return res.status(404).json({ error: 'not_found' });
  const ip = req.socket?.remoteAddress || '';
  if (!/^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/.test(ip)) {
    console.warn(`[local-auth] ניסיון שמירת אסמכתא ממקור שאינו loopback: ${ip}`);
    return res.status(403).json({ error: 'loopback_only' });
  }

  const { personalNumber, password, claims } = req.body || {};
  if (!personalNumber || !password) return res.status(400).json({ error: 'missing_fields' });

  try {
    const { expiresAt } = await cacheCredential(pool, { personalNumber, password, claims });
    // האסימון המקומי חוזר לשרת העמדה, שיחליף בו את האסימון המרכזי ברגע
    // שהניתוב יעבור למאגר המקומי - וכך הפקח לא מנותק.
    const local = loginResponse({ ...claims, personalId: String(personalNumber) }, 'local');
    res.json({ ok: true, expiresAt, localToken: local.token });
  } catch (err) {
    console.error('[local-auth] שמירת אסמכתא נכשלה:', err.message);
    res.status(500).json({ error: 'cache_failed' });
  }
});

// ── הזדהות אפליקציית הנהג ─────────────────────────────────────────────────────
// אפליקציית הנהג (public/driver.html) פונה ל-API בלי שום זהות, ולכן נעילת
// SK-01 הייתה שוברת אותה. הפתרון אינו לפתוח לה חור אלא לתת לה אסימון משלה,
// מוגבל לנתיבי הנהג בלבד (ROLE.DRIVER ב-middleware/auth.js).
//
// **fail-closed**: בלי DRIVER_ACCESS_CODE אין הזדהות נהג בכלל, ולא "פתוח
// כשאינו מוגדר" — זו בדיוק הטעות של DIAG_TOKEN (SK-13).
// הקוד משותף לכלל הנהגים בבסיס; הוא אינו מזהה אדם, רק מגדיר מי מורשה להתחבר.
router.post('/api/auth/driver', (req, res) => {
  const configured = process.env.DRIVER_ACCESS_CODE || '';
  if (configured.length < 6) {
    return res.status(503).json({ error: 'driver_access_disabled', message: 'גישת נהגים אינה מוגדרת במערכת' });
  }
  const given = String(req.body?.code || '');
  const a = Buffer.from(given);
  const b = Buffer.from(configured);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'bad_code', message: 'קוד גישה שגוי' });
  }
  // תוקף קצר יותר מעמדה: מכשיר נייד של נהג אובד בקלות רבה יותר מעמדת בקרה.
  const ttl = 8 * 60 * 60 * 1000;
  res.json({ token: signToken({ role: 'driver', name: 'driver' }, ttl), expiresInMs: ttl });
});

// רשימת המורשים לעמדה ספציפית לפי מיראז' — להחלפת איש צוות בכניסת מיראז'.
// מורשה = יש לו תפקיד באפליקציה, ואין לו הגבלת עמדות או שהעמדה מופיעה בה (id או שם).
router.get('/api/auth/mirage-eligible', async (req, res) => {
  const presetId = Number(req.query.presetId);
  if (!Number.isFinite(presetId)) {
    return res.status(400).json({ error: 'missing_preset_id' });
  }

  let users;
  try {
    const r = await fetchMirage('/api/users');
    // כשל ערוץ (אסימון שירות חסר/שגוי) אינו "אין משתמשים" אלא תקלת תצורה.
    // בלי ההבחנה הזו הרשימה הייתה חוזרת ריקה בשקט, והמפעיל היה מסיק שאין
    // מורשים לעמדה במקום שהשירותים לא מדברים.
    if (isChannelFailure(r)) {
      console.error(
        `[mirage] קריאת רשימת המשתמשים נכשלה (HTTP ${r.status}, ${r.body?.error || 'לא ידוע'}). ` +
        'בדוק ש-MIRAGE_SERVICE_TOKEN מוגדר עם אותו ערך בשני התהליכים.',
      );
      return res.status(502).json({ error: 'mirage_unavailable', reason: r.body?.error || 'channel' });
    }
    users = r.body;
  } catch (err) {
    console.error('[mirage] service unavailable:', err.message);
    return res.status(502).json({ error: 'mirage_unavailable' });
  }

  let preset = null;
  try {
    preset = await presetById(presetId);
  } catch (err) {
    console.error('[mirage] preset lookup failed:', err.message);
  }
  if (!preset) return res.status(404).json({ error: 'preset_not_found' });

  const eligible = (Array.isArray(users) ? users : [])
    .map(u => ({ user: u, entry: mirageAppEntry(u) }))
    .filter(({ entry }) => isEligibleForPreset(entry, preset))
    .map(({ user, entry }) => ({
      personalNumber: user.personalNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      roles: entry.roles,
    }));

  res.json({ presetId, presetName: preset.name, eligible });
});

// אנשי הצוות למילוי טופס "חברי העמדה", מקובצים לפי **תפקיד מקצועי**:
//   bakar  → בקר · משגיח הבקר · אחורי   (עמדת יב"א)
//   pakach → פקח · משגיח הפקח · אחורי   (עמדת מגדל)
//   mashak → מש"ק · משגיח המש"ק
//   mefale → מפעיל · משגיח המפעיל
// הסינון הראשון הוא **הרשאה לעמדה** (אותו כלל בדיוק כמו mirage-eligible):
// מי שלא מורשה לעמדה לא יופיע באף תפריט.
//
// זו רשימת **שמות בלבד**: אין כאן הזדהות ואין הרשאה, ולכן אין להחזיר מספרים
// אישיים (בניגוד ל-mirage-eligible, ששם המספר האישי דרוש להזדהות מחדש).
//
// **מי שלא הוגדרו לו תפקידים מופיע בכל התפריטים** — `positions` ריק פירושו
// "לא הוגדר", לא "אף תפקיד". בלי זה כל התפריטים היו נפתחים ריקים בעמדה עד
// שמישהו יעבור על כל המשתמשים במיראז', וזה כשל תפעולי ולא נתון חסר.
router.get('/api/auth/mirage-crew', async (req, res) => {
  const presetId = Number(req.query.presetId);
  if (!Number.isFinite(presetId)) {
    return res.status(400).json({ error: 'missing_preset_id' });
  }

  let users;
  try {
    const r = await fetchMirage('/api/users');
    // כשל ערוץ (אסימון שירות חסר/שגוי) אינו "אין משתמשים" אלא תקלת תצורה.
    // בלי ההבחנה הזו הרשימה הייתה חוזרת ריקה בשקט, והמפעיל היה מסיק שאין
    // מורשים לעמדה במקום שהשירותים לא מדברים.
    if (isChannelFailure(r)) {
      console.error(
        `[mirage] קריאת רשימת המשתמשים נכשלה (HTTP ${r.status}, ${r.body?.error || 'לא ידוע'}). ` +
        'בדוק ש-MIRAGE_SERVICE_TOKEN מוגדר עם אותו ערך בשני התהליכים.',
      );
      return res.status(502).json({ error: 'mirage_unavailable', reason: r.body?.error || 'channel' });
    }
    users = r.body;
  } catch (err) {
    console.error('[mirage] service unavailable:', err.message);
    return res.status(502).json({ error: 'mirage_unavailable' });
  }

  let preset = null;
  try {
    preset = await presetById(presetId);
  } catch (err) {
    console.error('[mirage] preset lookup failed:', err.message);
  }
  if (!preset) return res.status(404).json({ error: 'preset_not_found' });

  const byPosition = Object.fromEntries(MIRAGE_POSITIONS.map(p => [p, new Set()]));
  for (const user of Array.isArray(users) ? users : []) {
    const entry = mirageAppEntry(user);
    if (!isEligibleForPreset(entry, preset)) continue;
    const name = (user.fullName || `${user.firstName || ''} ${user.lastName || ''}`).trim();
    if (!name) continue;
    const positions = entry.positions.length ? entry.positions : MIRAGE_POSITIONS;
    for (const p of positions) byPosition[p].add(name);
  }

  const sorted = Object.fromEntries(
    MIRAGE_POSITIONS.map(p => [p, [...byPosition[p]].sort((a, b) => a.localeCompare(b, 'he'))])
  );
  res.json({ presetId, presetName: preset.name, byPosition: sorted });
});

export default router;
