// הזדהות דרך מיראז' — מתווך בין מסך ה-LOGIN לשירות המיראז' החיצוני.
// מיראז' מזהה לפי מספר אישי ומחזיר את התפקידים המורשים לאפליקציה;
// כאן ממפים תפקידים לדגלי SKY-KING ומאחדים עם איש צוות קיים לפי personal_id
// (כדי לשמור עמדות מאושרות והעדפות אישיות).
import { Router } from 'express';
import pool from '../db/pool.js';

const router = new Router();

const MIRAGE_URL = process.env.MIRAGE_URL || 'http://localhost:7300';
const MIRAGE_APP_NAME = process.env.MIRAGE_APP_NAME || 'SKY-KING';
const MIRAGE_TIMEOUT_MS = 4000;

const fetchMirage = async (path, init) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MIRAGE_TIMEOUT_MS);
  try {
    const r = await fetch(`${MIRAGE_URL}${path}`, { ...init, signal: ctrl.signal });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
};

// התאמת עמדת מיראז' ל-preset: עם id — השוואת ID טכני; ידנית — השוואת טקסט השם (trim)
const wsMatchesPreset = (w, preset) =>
  (w.id != null && Number(preset.id) === Number(w.id)) ||
  (w.name && String(preset.name).trim() === String(w.name).trim());

// רשומת האפליקציה של משתמש מיראז' — פורמט ישן (מערך) או מורחב ({roles, workstations})
const mirageAppEntry = (user) => {
  const entry = (user.apps || {})[MIRAGE_APP_NAME];
  if (Array.isArray(entry)) return { roles: entry, workstations: [] };
  if (entry && typeof entry === 'object') {
    return {
      roles: Array.isArray(entry.roles) ? entry.roles : [],
      workstations: Array.isArray(entry.workstations) ? entry.workstations : [],
    };
  }
  return { roles: [], workstations: [] };
};

router.post('/api/auth/mirage-login', async (req, res) => {
  const personalNumber = String(req.body?.personalNumber || '').trim();
  // presetId אופציונלי — בהחלפת איש צוות בעמדה: מיראז' חייב לאשר גם את העמדה עצמה
  const presetId = req.body?.presetId != null ? Number(req.body.presetId) : null;
  if (!personalNumber) {
    return res.status(400).json({ error: 'missing_personal_number' });
  }

  let mirage;
  try {
    mirage = await fetchMirage('/api/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: MIRAGE_APP_NAME, personalNumber }),
    });
  } catch (err) {
    console.error('[mirage] service unavailable:', err.message);
    return res.status(502).json({ error: 'mirage_unavailable' });
  }

  if (!mirage?.authorized) {
    return res.status(403).json({ error: 'not_authorized', reason: mirage?.reason || 'denied' });
  }

  const roles = Array.isArray(mirage.roles) ? mirage.roles : [];
  const is_admin = roles.includes('admin');
  const is_team_lead = roles.includes('team_lead');

  // הגבלת עמדות ממיראז' → פענוח ל-ids של workstation_presets.
  // רשימה ריקה ממיראז' = אין הגבלה. הגבלה שאף עמדה בה לא זוהתה → [-1] (שום עמדה).
  const mirageWs = Array.isArray(mirage.workstations) ? mirage.workstations : [];
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
      crewMember = { ...result.rows[0], is_admin, is_team_lead, approved_workstations: mirageApproved || [] };
    }
  } catch (err) {
    console.error('[mirage] crew lookup failed:', err.message);
  }

  // אין איש צוות תואם — משתמש וירטואלי מפרטי מיראז' (רואה את כל העמדות)
  if (!crewMember) {
    const u = mirage.user || {};
    crewMember = {
      id: null,
      name: u.fullName || personalNumber,
      first_name: u.firstName || '',
      last_name: u.lastName || '',
      personal_id: personalNumber,
      is_admin,
      is_team_lead,
      approved_workstations: mirageApproved || [],
    };
  }

  res.json({ crewMember, roles, source: 'mirage' });
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
    users = await fetchMirage('/api/users');
  } catch (err) {
    console.error('[mirage] service unavailable:', err.message);
    return res.status(502).json({ error: 'mirage_unavailable' });
  }

  let preset = null;
  try {
    const { rows } = await pool.query('SELECT id, name FROM workstation_presets WHERE id = $1', [presetId]);
    preset = rows[0] || null;
  } catch (err) {
    console.error('[mirage] preset lookup failed:', err.message);
  }
  if (!preset) return res.status(404).json({ error: 'preset_not_found' });

  const eligible = (Array.isArray(users) ? users : [])
    .map(u => ({ user: u, entry: mirageAppEntry(u) }))
    .filter(({ entry }) =>
      entry.roles.length > 0 &&
      (entry.workstations.length === 0 || entry.workstations.some(w => wsMatchesPreset(w, preset)))
    )
    .map(({ user, entry }) => ({
      personalNumber: user.personalNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      roles: entry.roles,
    }));

  res.json({ presetId, presetName: preset.name, eligible });
});

export default router;
