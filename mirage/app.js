// מיראז' — דמו מערכת ניהול משתמשים והרשאות (אפליקציה נפרדת מ-SKY-KING).
// זרימה: אפליקציה שולחת { app, personalNumber } → מיראז' בודק הרשאה →
// מחזיר את התפקידים המורשים למשתמש באותה אפליקציה (admin / team_lead / user).
// אחסון: Postgres/Neon כשמוגדר DATABASE_URL (פרודקשן), אחרת data.json — ראה store.js.
import express from 'express';
import path from 'path';
import { timingSafeEqual } from 'crypto';
import { fileURLToPath } from 'url';
import { createStore } from './store.js';
import { validatePassword, hashPassword, verifyPassword, PASSWORD_POLICY_HE } from './password.js';
// אותו מנגנון אסימון של SKY-KING. שיתוף מכוון: זהו מקור אמת אחד לחתימה
// ולאימות, ואין סיבה לתחזק שני מימושים. (מיראז' כבר מייבא server/listen.js.)
import { signToken, verifyToken, bearerFrom } from '../server/auth/token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// manpower ("כח אדם") — הרשאה לכ"א ותחקירים במסך ה-LOGIN של SKY-KING.
// הרשאה ולא תפקיד מקצועי: היא פותחת מסך, לא קובעת מה האדם עושה בעמדה.
export const KNOWN_ROLES = ['admin', 'team_lead', 'manpower', 'user'];

// תפקידים מקצועיים — **ציר נפרד** מ-roles, בכוונה:
// roles (admin/team_lead/user) הוא ציר ההרשאה, ו-`roles.length > 0` הוא התנאי
// לגישה לאפליקציה. אילו "בקר" היה נכנס לאותה רשימה, סימון תפקיד מקצועי היה
// מעניק גישה למערכת. בנוסף אדם יכול להיות גם admin וגם בקר.
// הקודים באנגלית כדי שתוויות התצוגה יוכלו להשתנות בלי לגעת בנתונים.
// bakar = בקר (יב"א) · pakach = פקח (מגדל) — תפקידים נפרדים ולא אותו תא:
// אלו שני מקצועות, ומי שמוסמך לעמדת יב"א אינו בהכרח מוסמך למגדל.
export const KNOWN_POSITIONS = ['bakar', 'pakach', 'mashak', 'mefale'];

/** האפליקציה שאליה משויך המנהל הראשון (POST /api/admin/bootstrap). */
const MIRAGE_BOOTSTRAP_APP = process.env.MIRAGE_APP_NAME || 'SKY-KING';

export function createMirageApp({ dataFile, skykingUrl, databaseUrl } = {}) {
  const store = createStore({ dataFile, databaseUrl });
  // 127.0.0.1 ולא localhost: fetch של Node 22 מנסה קודם ::1 (IPv6), ושרת ה-dev
  // של SKY-KING מאזין רק על IPv4 — התוצאה הייתה "SKY-KING לא זמין" במקומי.
  const SKYKING_URL = skykingUrl || process.env.SKYKING_URL || 'http://127.0.0.1:3001';

  // רשומת אפליקציה: פורמט ישן — מערך roles; פורמט מורחב — { roles, workstations, positions }.
  // workstations: [{ id, name }] (מהאפליקציה) או [{ name }] (הזנה ידנית — השוואת טקסט).
  // positions: תפקידים מקצועיים (KNOWN_POSITIONS). ריק = לא הוגדר, ולא "אף תפקיד" —
  // ראה ההערה ב-mirage-crew בצד SKY-KING.
  const appEntry = (user, appName) => {
    const entry = (user.apps || {})[appName];
    if (Array.isArray(entry)) return { roles: entry, workstations: [], positions: [] };
    if (entry && typeof entry === 'object') {
      return {
        roles: Array.isArray(entry.roles) ? entry.roles : [],
        workstations: Array.isArray(entry.workstations) ? entry.workstations : [],
        positions: Array.isArray(entry.positions)
          ? entry.positions.filter(p => KNOWN_POSITIONS.includes(p))
          : [],
      };
    }
    return { roles: [], workstations: [], positions: [] };
  };
  // לעולם לא חושפים את ה-hash החוצה; hasPassword — למסך הניהול
  const publicUser = (u) => ({
    personalNumber: u.personalNumber,
    firstName: u.firstName,
    lastName: u.lastName,
    fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
    apps: u.apps || {},
    hasPassword: !!u.passwordHash,
  });

  // הגבלת ניסיונות (לפי התקן): 5 כישלונות → חסימה זמנית של דקה למספר האישי
  const RATE_LIMIT_MAX_FAILS = 5;
  const RATE_LIMIT_BLOCK_MS = 60 * 1000;
  const loginAttempts = new Map(); // personalNumber → { fails, blockedUntil }
  const rateLimit = {
    isBlocked(pn) {
      const rec = loginAttempts.get(pn);
      return !!rec && rec.blockedUntil > Date.now();
    },
    fail(pn) {
      const rec = loginAttempts.get(pn) || { fails: 0, blockedUntil: 0 };
      rec.fails += 1;
      if (rec.fails >= RATE_LIMIT_MAX_FAILS) {
        rec.blockedUntil = Date.now() + RATE_LIMIT_BLOCK_MS;
        rec.fails = 0;
      }
      loginAttempts.set(pn, rec);
    },
    success(pn) { loginAttempts.delete(pn); },
  };

  const app = express();
  app.use(express.json());

  // ── אימות (ממצא SK-54) ──────────────────────────────────────────────────────
  // עד כה נתיבי /api/users היו פתוחים לחלוטין: מי שהגיע לשירות יכול היה לקבוע
  // סיסמה למשתמש קיים ולהעניק לעצמו admin ב-SKY-KING — כלומר לעקוף את כל
  // הקשחת הסיסמאות. שני שערים נפרדים, שניהם fail-closed:
  //
  //   1. ניהול משתמשים — אסימון אדמין שמונפק ב-POST /api/admin/login מול
  //      משתמש מיראז' קיים בעל תפקיד admin. אותה סיסמה, אותו scrypt, אותו
  //      rate limit — אין ערוץ עוקף.
  //   2. /api/authorize — קריאה שרת-לשרת מ-SKY-KING. אם MIRAGE_SERVICE_TOKEN
  //      מוגדר, היא דורשת אותו. זה מצמצם גם את SK-48: לא כל מי שרואה את
  //      השירות יכול לשאול אותו על סיסמאות.
  //
  // ⚠️ בפרודקשן שער מנותק אינו אופציה: בלי משתמש admin כלשהו, ניהול המשתמשים
  // פשוט סגור. זו ההחלטה ההפוכה מ-DIAG_TOKEN (SK-13), ששם "פתוח כשאינו מוגדר"
  // הפך את השער ללא-שער.
  const isProd = process.env.NODE_ENV === 'production';

  const hasAdminRole = (user) =>
    Object.values(user?.apps || {}).some((entry) => {
      const roles = Array.isArray(entry) ? entry : entry?.roles;
      return Array.isArray(roles) && roles.includes('admin');
    });

  function requireMirageAdmin(req, res, next) {
    const claims = verifyToken(bearerFrom(req));
    if (!claims || claims.scope !== 'mirage-admin') {
      return res.status(401).json({ error: 'unauthenticated', message: 'נדרשת הזדהות מנהל' });
    }
    req.mirageAdmin = claims;
    return next();
  }

  /** האם הבקשה נושאת את אסימון השירות הנכון. `false` גם כשהוא כלל לא מוגדר. */
  function serviceTokenOk(req) {
    const expected = process.env.MIRAGE_SERVICE_TOKEN || '';
    if (!expected) return false;
    const a = Buffer.from(String(req.get('X-Service-Token') || ''));
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  const isAdminToken = (req) => {
    const claims = verifyToken(bearerFrom(req));
    if (claims && claims.scope === 'mirage-admin') { req.mirageAdmin = claims; return true; }
    return false;
  };

  /**
   * קריאת הרוסטר מותרת לשני צרכנים: מסך הניהול (אסימון אדמין) ו-SKY-KING
   * (אסימון שירות) — האחרון צריך אותה כדי לחשב מי מורשה לעמדה בהחלפת איש צוות.
   * **כתיבה** לעולם לא: היא דורשת אסימון אדמין בלבד. זו ההפרדה שנעדרה ב-SK-54.
   *
   * ⚠️ **אין כאן מסלול פיתוח מקל.** זה ה-endpoint שמחזיר מספרים אישיים ושמות
   * של כל אנשי הצוות (ממצא SK-47), ו"פתוח כשלא מוגדר" היה הופך את השער ללא-שער
   * בכל סביבה שבה מישהו שכח משתנה. בפיתוח יש להגדיר MIRAGE_SERVICE_TOKEN
   * בשני התהליכים — ראה README.
   */
  function requireAdminOrService(req, res, next) {
    if (isAdminToken(req) || serviceTokenOk(req)) return next();
    return res.status(401).json({ error: 'unauthenticated', message: 'נדרש אסימון מנהל או אסימון שירות' });
  }

  /**
   * שער ל-/api/authorize (קריאה שרת-לשרת מ-SKY-KING). כאן **כן** יש מסלול
   * פיתוח: זהו endpoint שבודק אישורים, ובלי מספר אישי וסיסמה נכונים הוא אינו
   * מחזיר דבר. בפרודקשן האסימון חובה, כדי שלא כל מי שרואה את השירות ברשת יוכל
   * לנסות עליו סיסמאות (מצמצם גם את SK-48).
   */
  function requireServiceToken(req, res, next) {
    if (isAdminToken(req) || serviceTokenOk(req)) return next();
    if (!process.env.MIRAGE_SERVICE_TOKEN) {
      if (isProd) {
        return res.status(503).json({ error: 'service_token_required', message: 'MIRAGE_SERVICE_TOKEN אינו מוגדר' });
      }
      return next();
    }
    return res.status(401).json({ error: 'bad_service_token' });
  }

  app.get('/api/health', async (req, res) => {
    try {
      res.json({ ok: true, service: 'MIRAGE', store: store.kind, users: (await store.listUsers()).length });
    } catch (e) {
      res.status(500).json({ ok: false, service: 'MIRAGE', error: 'store_unavailable' });
    }
  });

  // ── אתחול ראשוני: יצירת המנהל הראשון ──────────────────────────────────────
  // אחרי SK-54 ניהול המשתמשים דורש אסימון מנהל, ואסימון מנהל דורש משתמש מנהל
  // עם סיסמה. במערכת חדשה אין כזה - זו בעיית ביצה ותרנגולת אמיתית, ולא פרט
  // טכני של הבדיקות: גם הלקוח צריך דרך ליצור את המנהל הראשון.
  //
  // התנאי הוא **מצב ולא סוד**: הנתיב פתוח בדיוק כל עוד אין במאגר אף משתמש
  // שיכול להתחבר כמנהל (יש לו גם סיסמה וגם תפקיד admin). ברגע שנוצר אחד -
  // הנתיב נסגר לצמיתות ומחזיר 409. אין כאן חלון שנשאר פתוח בהיסח הדעת.
  const bootstrapNeeded = async () => {
    const users = await store.listUsers();
    return !users.some(u => u.passwordHash && hasAdminRole(u));
  };

  app.post('/api/admin/bootstrap', async (req, res) => {
    let needed;
    try { needed = await bootstrapNeeded(); }
    catch { return res.status(503).json({ error: 'store_unavailable' }); }
    if (!needed) {
      return res.status(409).json({ error: 'already_initialized', message: 'קיים כבר מנהל במערכת' });
    }
    const { personalNumber, firstName, lastName, password } = req.body || {};
    const pn = String(personalNumber || '').trim();
    if (!pn || !String(firstName || '').trim() || !password) {
      return res.status(400).json({ error: 'missing_fields', required: ['personalNumber', 'firstName', 'password'] });
    }
    const check = validatePassword(password, { personalNumber: pn, firstName, lastName });
    if (!check.ok) {
      return res.status(400).json({ error: 'weak_password', details: check.errors, policy: PASSWORD_POLICY_HE });
    }
    // התפקיד נקבע כאן ולא מגוף הבקשה: הנתיב הזה יוצר **מנהל**, ותו לא.
    const apps = { [MIRAGE_BOOTSTRAP_APP]: { roles: ['admin'], workstations: [], positions: [] } };
    const existing = await store.getUser(pn);
    const user = existing
      ? await store.updateUser(pn, { firstName, lastName: lastName || '', apps, passwordHash: hashPassword(password) })
      : await store.createUser({ personalNumber: pn, firstName, lastName: lastName || '', apps, passwordHash: hashPassword(password) });
    res.status(201).json(publicUser(user));
  });

  // ── הזדהות מנהל למסך הניהול (SK-54) ──────────────────────────────────────
  // משתמש מיראז' קיים בעל תפקיד admin, עם הסיסמה שלו. עובר דרך אותו rateLimit
  // כמו /api/authorize כדי שלא ייווצר ערוץ ניחוש חלופי.
  app.post('/api/admin/login', async (req, res) => {
    const personalNumber = String(req.body?.personalNumber || '').trim();
    const password = String(req.body?.password || '');
    if (!personalNumber || !password) {
      return res.status(400).json({ error: 'missing_fields', required: ['personalNumber', 'password'] });
    }
    if (rateLimit.isBlocked(personalNumber)) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    let user;
    try {
      user = await store.getUser(personalNumber);
    } catch {
      return res.status(503).json({ error: 'store_unavailable' });
    }
    // אותה תשובה בדיוק לשלושת המצבים (אין משתמש / אין סיסמה / סיסמה שגויה):
    // הבחנה ביניהם הייתה מסגירה אילו מספרים אישיים קיימים.
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash) || !hasAdminRole(user)) {
      rateLimit.fail(personalNumber);
      return res.status(401).json({ error: 'bad_credentials' });
    }
    rateLimit.success(personalNumber);
    const ttl = 60 * 60 * 1000; // שעה — מסך ניהול, לא עמדה תפעולית
    res.json({
      token: signToken({ scope: 'mirage-admin', personalId: personalNumber, name: `${user.firstName || ''} ${user.lastName || ''}`.trim() }, ttl),
      expiresInMs: ttl,
    });
  });

  // ── ליבת השירות: בדיקת הרשאה לאפליקציה — מספר אישי + סיסמה ─────────────
  app.post('/api/authorize', requireServiceToken, async (req, res) => {
    const appName = String(req.body?.app || '').trim();
    const personalNumber = String(req.body?.personalNumber || '').trim();
    const password = String(req.body?.password || '');
    if (!appName || !personalNumber || !password) {
      return res.status(400).json({ error: 'missing_fields', required: ['app', 'personalNumber', 'password'] });
    }
    if (rateLimit.isBlocked(personalNumber)) {
      return res.status(429).json({ authorized: false, reason: 'rate_limited' });
    }
    const user = await store.getUser(personalNumber);
    // משתמש לא קיים או סיסמה שגויה — אותה תשובה (בלי חשיפת קיום משתמש, לפי התקן)
    if (!user) {
      rateLimit.fail(personalNumber);
      return res.json({ authorized: false, reason: 'bad_credentials' });
    }
    if (!user.passwordHash) {
      return res.json({ authorized: false, reason: 'password_not_set' });
    }
    if (!verifyPassword(password, user.passwordHash)) {
      rateLimit.fail(personalNumber);
      return res.json({ authorized: false, reason: 'bad_credentials' });
    }
    rateLimit.success(personalNumber);
    const { roles, workstations, positions } = appEntry(user, appName);
    if (roles.length === 0) {
      return res.json({ authorized: false, reason: 'app_not_permitted' });
    }
    // workstations ריק = אין הגבלת עמדות ממיראז'
    res.json({ authorized: true, app: appName, roles, workstations, positions, user: publicUser(user) });
  });

  // ── שמות העמדות מהאפליקציה (לתפריט הבחירה המרובה במסך הניהול) ─────────────
  // מעשיר כל עמדה ב-role (tower/yaba) וב-base (שם בסיס האב) לחלוקה במסך הניהול.
  app.get('/api/workstation-options', requireMirageAdmin, async (req, res) => {
    const getJson = async (p) => {
      const ctrl = new AbortController();
      // 10ש' ולא 3: הבקשה הראשונה מעירה את Neon (cold start ~6ש') — timeout קצר
      // גרם ל"SKY-KING לא זמין" מזויף במסך הניהול
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const r = await fetch(`${SKYKING_URL}${p}`, { signal: ctrl.signal });
        return await r.json();
      } finally { clearTimeout(timer); }
    };
    try {
      const presets = await getJson('/api/workstation-presets');
      if (!Array.isArray(presets)) throw new Error('bad response');
      let bases = [];
      try {
        const b = await getJson('/api/aviation-bases');
        if (Array.isArray(b)) bases = b;
      } catch { /* אין בסיסים — הקיבוץ יהיה "ללא בסיס" */ }
      const baseName = (id) => bases.find(x => Number(x.id) === Number(id))?.name || null;
      res.json({
        available: true,
        workstations: presets.map(p => ({
          id: p.id,
          name: p.name,
          role: p.preset_role === 'tower' || p.preset_role === 'yaba' ? p.preset_role : null,
          base: p.parent_base_id != null ? baseName(p.parent_base_id) : null,
        })),
      });
    } catch (e) {
      // האפליקציה לא זמינה — מסך הניהול עובר להזנה ידנית
      console.error('[mirage] workstation-options נכשל:', e?.cause?.code || e?.name || e?.message);
      res.json({ available: false, workstations: [] });
    }
  });

  // ── ניהול משתמשים (עבור מסך הניהול של הדמו) ─────────────────────────────
  app.get('/api/users', requireAdminOrService, async (req, res) => {
    res.json((await store.listUsers()).map(publicUser));
  });

  app.post('/api/users', requireMirageAdmin, async (req, res) => {
    const { personalNumber, firstName, lastName, apps, password } = req.body || {};
    const pn = String(personalNumber || '').trim();
    if (!pn || !String(firstName || '').trim() || !password) {
      return res.status(400).json({ error: 'missing_fields', required: ['personalNumber', 'firstName', 'password'] });
    }
    const check = validatePassword(password, { personalNumber: pn, firstName, lastName });
    if (!check.ok) {
      return res.status(400).json({ error: 'weak_password', details: check.errors, policy: PASSWORD_POLICY_HE });
    }
    const user = await store.createUser({
      personalNumber: pn, firstName, lastName: lastName || '', apps: apps || {},
      passwordHash: hashPassword(password),
    });
    if (!user) return res.status(409).json({ error: 'user_exists' });
    res.status(201).json(publicUser(user));
  });

  app.put('/api/users/:personalNumber', requireMirageAdmin, async (req, res) => {
    const { firstName, lastName, apps, password } = req.body || {};
    const patch = { firstName, lastName, apps };
    if (password !== undefined && password !== '') {
      const existing = await store.getUser(req.params.personalNumber);
      const check = validatePassword(password, {
        personalNumber: req.params.personalNumber,
        firstName: firstName ?? existing?.firstName,
        lastName: lastName ?? existing?.lastName,
      });
      if (!check.ok) {
        return res.status(400).json({ error: 'weak_password', details: check.errors, policy: PASSWORD_POLICY_HE });
      }
      patch.passwordHash = hashPassword(password);
    }
    const user = await store.updateUser(req.params.personalNumber, patch);
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    res.json(publicUser(user));
  });

  app.delete('/api/users/:personalNumber', requireMirageAdmin, async (req, res) => {
    const removed = await store.deleteUser(req.params.personalNumber);
    if (!removed) return res.status(404).json({ error: 'user_not_found' });
    res.json({ ok: true });
  });

  // ── מסך ניהול (דמו) ──────────────────────────────────────────────────────
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
  });

  return app;
}
