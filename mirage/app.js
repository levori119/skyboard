// מיראז' — דמו מערכת ניהול משתמשים והרשאות (אפליקציה נפרדת מ-SKY-KING).
// זרימה: אפליקציה שולחת { app, personalNumber } → מיראז' בודק הרשאה →
// מחזיר את התפקידים המורשים למשתמש באותה אפליקציה (admin / team_lead / user).
// אחסון: Postgres/Neon כשמוגדר DATABASE_URL (פרודקשן), אחרת data.json — ראה store.js.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createStore } from './store.js';
import { validatePassword, hashPassword, verifyPassword, PASSWORD_POLICY_HE } from './password.js';

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

  app.get('/api/health', async (req, res) => {
    try {
      res.json({ ok: true, service: 'MIRAGE', store: store.kind, users: (await store.listUsers()).length });
    } catch (e) {
      res.status(500).json({ ok: false, service: 'MIRAGE', error: 'store_unavailable' });
    }
  });

  // ── ליבת השירות: בדיקת הרשאה לאפליקציה — מספר אישי + סיסמה ─────────────
  app.post('/api/authorize', async (req, res) => {
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
  app.get('/api/workstation-options', async (req, res) => {
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
  app.get('/api/users', async (req, res) => {
    res.json((await store.listUsers()).map(publicUser));
  });

  app.post('/api/users', async (req, res) => {
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

  app.put('/api/users/:personalNumber', async (req, res) => {
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

  app.delete('/api/users/:personalNumber', async (req, res) => {
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
