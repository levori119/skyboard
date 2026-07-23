// מיראז' — דמו מערכת ניהול משתמשים והרשאות (אפליקציה נפרדת מ-SKY-KING).
// זרימה: אפליקציה שולחת { app, personalNumber } → מיראז' בודק הרשאה →
// מחזיר את התפקידים המורשים למשתמש באותה אפליקציה (admin / team_lead / user).
// אחסון: Postgres/Neon כשמוגדר DATABASE_URL (פרודקשן), אחרת data.json — ראה store.js.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const KNOWN_ROLES = ['admin', 'team_lead', 'user'];

export function createMirageApp({ dataFile, skykingUrl, databaseUrl } = {}) {
  const store = createStore({ dataFile, databaseUrl });
  const SKYKING_URL = skykingUrl || process.env.SKYKING_URL || 'http://localhost:3001';

  // רשומת אפליקציה: פורמט ישן — מערך roles; פורמט מורחב — { roles, workstations }.
  // workstations: [{ id, name }] (מהאפליקציה) או [{ name }] (הזנה ידנית — השוואת טקסט).
  const appEntry = (user, appName) => {
    const entry = (user.apps || {})[appName];
    if (Array.isArray(entry)) return { roles: entry, workstations: [] };
    if (entry && typeof entry === 'object') {
      return {
        roles: Array.isArray(entry.roles) ? entry.roles : [],
        workstations: Array.isArray(entry.workstations) ? entry.workstations : [],
      };
    }
    return { roles: [], workstations: [] };
  };
  const publicUser = (u) => ({
    personalNumber: u.personalNumber,
    firstName: u.firstName,
    lastName: u.lastName,
    fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
    apps: u.apps || {},
  });

  const app = express();
  app.use(express.json());

  app.get('/api/health', async (req, res) => {
    try {
      res.json({ ok: true, service: 'MIRAGE', store: store.kind, users: (await store.listUsers()).length });
    } catch (e) {
      res.status(500).json({ ok: false, service: 'MIRAGE', error: 'store_unavailable' });
    }
  });

  // ── ליבת השירות: בדיקת הרשאה לאפליקציה ──────────────────────────────────
  app.post('/api/authorize', async (req, res) => {
    const appName = String(req.body?.app || '').trim();
    const personalNumber = String(req.body?.personalNumber || '').trim();
    if (!appName || !personalNumber) {
      return res.status(400).json({ error: 'missing_fields', required: ['app', 'personalNumber'] });
    }
    const user = await store.getUser(personalNumber);
    if (!user) {
      return res.json({ authorized: false, reason: 'unknown_user' });
    }
    const { roles, workstations } = appEntry(user, appName);
    if (roles.length === 0) {
      return res.json({ authorized: false, reason: 'app_not_permitted' });
    }
    // workstations ריק = אין הגבלת עמדות ממיראז'
    res.json({ authorized: true, app: appName, roles, workstations, user: publicUser(user) });
  });

  // ── שמות העמדות מהאפליקציה (לתפריט הבחירה המרובה במסך הניהול) ─────────────
  // מעשיר כל עמדה ב-role (tower/yaba) וב-base (שם בסיס האב) לחלוקה במסך הניהול.
  app.get('/api/workstation-options', async (req, res) => {
    const getJson = async (p) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
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
    } catch {
      // האפליקציה לא זמינה — מסך הניהול עובר להזנה ידנית
      res.json({ available: false, workstations: [] });
    }
  });

  // ── ניהול משתמשים (עבור מסך הניהול של הדמו) ─────────────────────────────
  app.get('/api/users', async (req, res) => {
    res.json((await store.listUsers()).map(publicUser));
  });

  app.post('/api/users', async (req, res) => {
    const { personalNumber, firstName, lastName, apps } = req.body || {};
    const pn = String(personalNumber || '').trim();
    if (!pn || !String(firstName || '').trim()) {
      return res.status(400).json({ error: 'missing_fields', required: ['personalNumber', 'firstName'] });
    }
    const user = await store.createUser({ personalNumber: pn, firstName, lastName: lastName || '', apps: apps || {} });
    if (!user) return res.status(409).json({ error: 'user_exists' });
    res.status(201).json(publicUser(user));
  });

  app.put('/api/users/:personalNumber', async (req, res) => {
    const { firstName, lastName, apps } = req.body || {};
    const user = await store.updateUser(req.params.personalNumber, { firstName, lastName, apps });
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
