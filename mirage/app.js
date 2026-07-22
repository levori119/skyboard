// מיראז' — דמו מערכת ניהול משתמשים והרשאות (אפליקציה נפרדת מ-SKY-KING).
// זרימה: אפליקציה שולחת { app, personalNumber } → מיראז' בודק הרשאה →
// מחזיר את התפקידים המורשים למשתמש באותה אפליקציה (admin / team_lead / user).
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const KNOWN_ROLES = ['admin', 'team_lead', 'user'];

export function createMirageApp({ dataFile } = {}) {
  const DATA_FILE = dataFile || path.join(__dirname, 'data.json');

  const load = () => {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
      return { users: [] };
    }
  };
  const save = (store) => fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  const publicUser = (u) => ({
    personalNumber: u.personalNumber,
    firstName: u.firstName,
    lastName: u.lastName,
    fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
    apps: u.apps || {},
  });

  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'MIRAGE', users: load().users.length });
  });

  // ── ליבת השירות: בדיקת הרשאה לאפליקציה ──────────────────────────────────
  app.post('/api/authorize', (req, res) => {
    const appName = String(req.body?.app || '').trim();
    const personalNumber = String(req.body?.personalNumber || '').trim();
    if (!appName || !personalNumber) {
      return res.status(400).json({ error: 'missing_fields', required: ['app', 'personalNumber'] });
    }
    const user = load().users.find(u => u.personalNumber === personalNumber);
    if (!user) {
      return res.json({ authorized: false, reason: 'unknown_user' });
    }
    const roles = (user.apps || {})[appName];
    if (!Array.isArray(roles) || roles.length === 0) {
      return res.json({ authorized: false, reason: 'app_not_permitted' });
    }
    res.json({ authorized: true, app: appName, roles, user: publicUser(user) });
  });

  // ── ניהול משתמשים (עבור מסך הניהול של הדמו) ─────────────────────────────
  app.get('/api/users', (req, res) => {
    res.json(load().users.map(publicUser));
  });

  app.post('/api/users', (req, res) => {
    const { personalNumber, firstName, lastName, apps } = req.body || {};
    const pn = String(personalNumber || '').trim();
    if (!pn || !String(firstName || '').trim()) {
      return res.status(400).json({ error: 'missing_fields', required: ['personalNumber', 'firstName'] });
    }
    const store = load();
    if (store.users.some(u => u.personalNumber === pn)) {
      return res.status(409).json({ error: 'user_exists' });
    }
    const user = { personalNumber: pn, firstName, lastName: lastName || '', apps: apps || {} };
    store.users.push(user);
    save(store);
    res.status(201).json(publicUser(user));
  });

  app.put('/api/users/:personalNumber', (req, res) => {
    const store = load();
    const user = store.users.find(u => u.personalNumber === req.params.personalNumber);
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    const { firstName, lastName, apps } = req.body || {};
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (apps !== undefined) user.apps = apps;
    save(store);
    res.json(publicUser(user));
  });

  app.delete('/api/users/:personalNumber', (req, res) => {
    const store = load();
    const before = store.users.length;
    store.users = store.users.filter(u => u.personalNumber !== req.params.personalNumber);
    if (store.users.length === before) return res.status(404).json({ error: 'user_not_found' });
    save(store);
    res.json({ ok: true });
  });

  // ── מסך ניהול (דמו) ──────────────────────────────────────────────────────
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
  });

  return app;
}
