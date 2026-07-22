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

router.post('/api/auth/mirage-login', async (req, res) => {
  const personalNumber = String(req.body?.personalNumber || '').trim();
  if (!personalNumber) {
    return res.status(400).json({ error: 'missing_personal_number' });
  }

  let mirage;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), MIRAGE_TIMEOUT_MS);
    const r = await fetch(`${MIRAGE_URL}/api/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: MIRAGE_APP_NAME, personalNumber }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    mirage = await r.json();
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
      crewMember = { ...result.rows[0], is_admin, is_team_lead };
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
      approved_workstations: [],
    };
  }

  res.json({ crewMember, roles, source: 'mirage' });
});

export default router;
