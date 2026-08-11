// GAPI — hook לכידת שינויי משתמש SKYKING → outbox (כיוון יוצא).
// עקרונות בטיחות (נקרא ממסלולי mutation חמים):
//   1. no-op זול כשכבוי — דגל enabled ב-cache עם TTL, בלי round-trip ל-DB לכל קריאה.
//   2. בולע כל שגיאה — לעולם לא מפיל את ה-route המארח.
//   3. echo suppression — מסלול ה-sync הנכנס לא קורא לכאן, רק עריכות משתמש.
import pool from '../db/pool.js';
import { currentEnv } from '../db/env-context.js';
import { getEntityDef } from './entities.js';
import { getConfig } from './config.js';
import { enqueue } from './outbox.js';

const TTL_MS = 10_000;
const enabledCache = new Map(); // env → { enabled, at }

export function invalidateEnabledCache() { enabledCache.clear(); }

async function isEnabled(db) {
  const env = currentEnv();
  const now = Date.now();
  const c = enabledCache.get(env);
  if (c && now - c.at < TTL_MS) return c.enabled;
  let enabled = false;
  try { enabled = (await getConfig(db)).enabled === true; } catch { enabled = false; }
  enabledCache.set(env, { enabled, at: now });
  return enabled;
}

// upsert/delete של ישות עקב עריכת משתמש. delete חייב להיקרא **לפני** מחיקת השורה
// (כדי לקרוא את ה-gapi_id). מחזיר מיד ובשקט כשהאינטגרציה כבויה.
export async function captureChange(entity, op, localId, db = pool) {
  try {
    const def = getEntityDef(entity);
    if (!def || localId == null) return;
    if (!(await isEnabled(db))) return;
    let gapiId = null;
    if (op === 'delete') {
      const r = await db.query(`SELECT gapi_id FROM ${def.table} WHERE id=$1`, [localId]);
      gapiId = r.rows[0]?.gapi_id ?? null;
      if (!gapiId) return; // מעולם לא סונכרן ל-GAPI → אין מה למחוק שם
    }
    await enqueue({ entity, op, localId, gapiId }, db);
  } catch (err) {
    console.error('[gapi] captureChange (ignored):', err.message);
  }
}

// שדות פ"מ תפעוליים — עריכה שלהם מצדיקה סנכרון יוצא (מיקום/דסק פנימיים → לא).
export const SORTIE_OP_FIELDS = [
  'callSign', 'callsign', 'sq', 'task', 'airborne', 'landed', 'takeoff_time',
  'planned_landing_time',
  'numberOfFormation', 'number_of_formation', 'erka', 'koteret', 'mivtza',
  'tzevet_shilta', 'ta_shilta', 'takeoff_airfield_id', 'landing_airfield_id',
  // טבלת נקודות מכוון. בלי השדה כאן הבקר היה עורך נ"צ תקיפה, השינוי היה נשמר
  // ב-SKYKING, ו**לא** היה נדחף ל-GAPI - בשקט, בלי שגיאה ובלי סימן.
  'targets',
];

export function bodyTouchesOperational(body, fields) {
  if (!body) return false;
  return fields.some(f => body[f] !== undefined);
}
