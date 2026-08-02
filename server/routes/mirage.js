// הזדהות דרך מיראז' — מתווך בין מסך ה-LOGIN לשירות המיראז' החיצוני.
// מיראז' מזהה לפי מספר אישי ומחזיר את התפקידים המורשים לאפליקציה;
// כאן ממפים תפקידים לדגלי SKY-KING ומאחדים עם איש צוות קיים לפי personal_id
// (כדי לשמור עמדות מאושרות והעדפות אישיות).
import { Router } from 'express';
import pool from '../db/pool.js';

const router = new Router();

// 127.0.0.1 ולא localhost — fetch של Node מעדיף ::1 ועלול לפספס שרת IPv4-בלבד
const MIRAGE_URL = process.env.MIRAGE_URL || 'http://127.0.0.1:7300';
const MIRAGE_APP_NAME = process.env.MIRAGE_APP_NAME || 'SKY-KING';
// 10ש' ולא 4: המיראז' שואל Neon, וההתעוררות הקרה שלו לוקחת ~6ש' —
// timeout קצר גרם ל-"mirage_unavailable" מזויף בכניסה הראשונה
const MIRAGE_TIMEOUT_MS = 10000;

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

// תפקידים מקצועיים במיראז' (ציר נפרד מ-roles שהוא ציר ההרשאה)
export const MIRAGE_POSITIONS = ['bakar', 'mashak', 'mefale'];

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

  if (!mirage?.authorized) {
    // מיפוי סיבות לפי סוג: אישורים שגויים → 401, חסימת ניסיונות → 429, אחרת 403
    const reason = mirage?.reason || 'denied';
    if (reason === 'bad_credentials' || reason === 'password_not_set') {
      return res.status(401).json({ error: reason });
    }
    if (reason === 'rate_limited') {
      return res.status(429).json({ error: reason });
    }
    return res.status(403).json({ error: 'not_authorized', reason });
  }

  const roles = Array.isArray(mirage.roles) ? mirage.roles : [];
  const is_admin = roles.includes('admin');
  const is_team_lead = roles.includes('team_lead');
  // כח אדם — פותח את מסך "כ"א ותחקירים" ב-LOGIN. אינו מקנה הרשאת ניהול.
  const is_manpower = roles.includes('manpower');

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
      crewMember = { ...result.rows[0], is_admin, is_team_lead, is_manpower, approved_workstations: mirageApproved || [] };
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
      is_manpower,
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
//   bakar  → בקר/פקח · משגיח הבקר · אחורי
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
    users = await fetchMirage('/api/users');
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
