// GAPI — תור יציאה אמין (SKYKING → GAPI). ראה GAPI-CONTRACT.md §9.
// enqueue נקרא מ-hooks בעריכות משתמש SKYKING (echo suppression: מסלול ה-sync
// הנכנס לא מזין כאן). drain דוחף מנה ל-GAPI עם retry+backoff.
import pool from '../db/pool.js';
import { currentEnv, runWithEnv } from '../db/env-context.js';
import { getEntityDef } from './entities.js';
import { toGapiData, toGapiAircraft } from './adapter.js';
import { getConfig, getSecret } from './config.js';
import { ingest } from './client.js';

const MAX_ATTEMPTS = 12;
const DRAIN_BATCH = 100;
const KICK_DELAY_MS = 50;

// בונה אירוע יוצא משורת DB. טהור → נבדק.
// `aircraftRows` - שורות טבלת המטוסים של הפ"מ, נטענות ב-drain (ראה loadAircraft).
// כשהן null המערך לא נכלל בכלל ב-data: היעדר שדה הוא "לא נגעתי", בעוד `[]` היה
// אומר ל-GAPI "לפ"מ אין מטוסים" ומוחק אצלו את הטבלה.
export function buildOutboundEvent(entity, op, row, gapiId, aircraftRows = null) {
  if (op === 'delete') return { entity, op: 'delete', gapi_id: gapiId ?? row?.gapi_id ?? null };
  const data = toGapiData(entity, row || {});
  if (aircraftRows) data.aircraft = toGapiAircraft(aircraftRows);
  return {
    entity, op: 'upsert',
    gapi_id: row?.gapi_id ?? gapiId ?? null,
    version: row?.gapi_version ?? null,
    data,
  };
}

// טוען את טבלת המטוסים של הפ"מ (+חימושים/מערכות) לאירוע היוצא.
// תת-שאילתות ולא JOIN: שני JOINים מצטברים היו מכפילים את שורת המטוס.
async function loadAircraft(db, stripId) {
  const { rows } = await db.query(
    `SELECT sa.*,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', a.armament_name, 'quantity', a.quantity)
                                  ORDER BY a.id), '[]'::jsonb)
          FROM strip_aircraft_armaments a WHERE a.strip_aircraft_id = sa.id) AS armaments,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', s.system_name, 'status', s.status)
                                  ORDER BY s.id), '[]'::jsonb)
          FROM strip_aircraft_systems s WHERE s.strip_aircraft_id = sa.id) AS systems
       FROM strip_aircraft sa WHERE sa.strip_id = $1 ORDER BY sa.idx`, [stripId]);
  // אין שורות → null ולא []: שורות המטוסים נוצרות ב-ensure ולא נולדות עם הפ"מ,
  // ו-`[]` היה מכריז בפני GAPI "לפ"מ הזה אין מטוסים" ומוחק שם את הטבלה בכל
  // עריכת או"ק של פ"מ שטרם נבנתה לו טבלת מטוסים ב-SKY-KING.
  return rows.length ? rows : null;
}

export async function enqueue({ entity, op = 'upsert', localId = null, gapiId = null, payload = {} }, db = pool) {
  await db.query(
    `INSERT INTO gapi_outbox (entity, op, local_id, gapi_id, payload) VALUES ($1,$2,$3,$4,$5)`,
    [entity, op, localId, gapiId, JSON.stringify(payload || {})],
  );
  kickDrain(); // דחיפה מיידית; ה-worker התקופתי נשאר רשת ביטחון
}

// ── דחיפה מיידית (SKYKING → GAPI) ───────────────────────────────────────────
// ה-worker מנקז כל 5ש' — מספיק לאמינות, לא ל"מיידי". לכן כל enqueue מזמן drain
// קצר-השהיה: ההשהיה מקבצת רצף עריכות באותה בקשה למנה אחת, וניקוז שמתבקש בזמן
// ניקוז פעיל נדחה לסופו (kickAgain) כדי ששורה חדשה לא תמתין ל-tick הבא.
// פעיל רק כששרת הפעיל את ה-workers — בדיקות יחידה לא פותחות טיימרים או רשת.
let immediateEnabled = false;
const kickTimer = new Map();   // env → טיימר ממתין
const kickRunning = new Set(); // env שמנקז כרגע
const kickAgain = new Set();   // env שהתבקש שוב תוך כדי ניקוז

export function enableImmediateDrain(on = true) { immediateEnabled = on; }

export function kickDrain(env = currentEnv()) {
  if (!immediateEnabled) return;
  if (kickRunning.has(env)) { kickAgain.add(env); return; }
  if (kickTimer.has(env)) return;
  const timer = setTimeout(async () => {
    kickTimer.delete(env);
    kickRunning.add(env);
    try {
      const res = await runWithEnv(env, () => drain());
      if (res?.sent) console.log(`[gapi] immediate push: ${res.sent} event(s), env ${env}`);
    } catch (err) {
      console.error('[gapi] immediate drain:', err.message);
    } finally {
      kickRunning.delete(env);
      if (kickAgain.delete(env)) kickDrain(env);
    }
  }, KICK_DELAY_MS);
  timer.unref?.(); // לא מחזיק את התהליך חי
  kickTimer.set(env, timer);
}

// טוען שורות בשלות, בונה אירועים מצב-עדכני, דוחף, ומנקה/מסמן retry.
export async function drain(db = pool) {
  const cfg = await getConfig(db);
  if (!cfg.enabled || !cfg.base_url) return { skipped: true };
  const secret = await getSecret(db);

  const { rows: due } = await db.query(
    `SELECT * FROM gapi_outbox WHERE next_attempt_at <= NOW() ORDER BY id LIMIT $1`, [DRAIN_BATCH]);
  if (due.length === 0) return { sent: 0 };

  const events = [];
  const sentIds = [];
  for (const ob of due) {
    const def = getEntityDef(ob.entity);
    if (!def) { await dropOutbox(db, ob.id); continue; }
    let event;
    if (ob.op === 'delete') {
      event = buildOutboundEvent(ob.entity, 'delete', null, ob.gapi_id);
    } else {
      const cur = await db.query(`SELECT * FROM ${def.table} WHERE id=$1`, [ob.local_id]);
      const row = cur.rows[0];
      if (!row) {                    // נמחק אחרי enqueue → שולחים delete אם יש gapi_id
        if (ob.gapi_id) event = buildOutboundEvent(ob.entity, 'delete', null, ob.gapi_id);
        else { await dropOutbox(db, ob.id); continue; }
      } else {
        const aircraft = def.hasAircraft ? await loadAircraft(db, row.id) : null;
        event = buildOutboundEvent(ob.entity, 'upsert', row, ob.gapi_id, aircraft);
      }
    }
    // local_id נשלח ל-GAPI כשדה מתאם — GAPI מחזיר אותו במיפוי ל-gapi_id החדש
    events.push({ ...event, _outbox_id: ob.id, local_id: ob.local_id });
    sentIds.push(ob.id);
  }
  if (events.length === 0) return { sent: 0 };

  try {
    const resp = await ingest(cfg.base_url, secret, events.map(({ _outbox_id, ...e }) => e));
    // GAPI מחזיר מיפוי local_id→gapi_id ל-inserts חדשים → נשמר בחזרה
    for (const m of (resp?.mappings || [])) {
      const ev = events.find(e => e.local_id === m.local_id);
      if (ev && m.gapi_id) {
        const def = getEntityDef(ev.entity);
        if (def && ev.local_id != null) {
          await db.query(`UPDATE ${def.table} SET gapi_id=$1 WHERE id=$2 AND gapi_id IS NULL`, [m.gapi_id, ev.local_id]);
        }
      }
    }
    await db.query(`DELETE FROM gapi_outbox WHERE id = ANY($1::int[])`, [sentIds]);
    return { sent: sentIds.length };
  } catch (err) {
    // backoff: min(60s * 2^attempts, 1h)
    await db.query(
      `UPDATE gapi_outbox
         SET attempts = attempts + 1,
             last_error = $2,
             next_attempt_at = NOW() + LEAST(INTERVAL '1 hour', (INTERVAL '60 seconds' * POWER(2, LEAST(attempts, 6))))
       WHERE id = ANY($1::int[])`,
      [sentIds, String(err.message).slice(0, 300)]);
    // נטישה אחרי יותר מדי ניסיונות — מסירים כדי לא לחסום את התור
    await db.query(`DELETE FROM gapi_outbox WHERE id = ANY($1::int[]) AND attempts >= $2`, [sentIds, MAX_ATTEMPTS]);
    return { sent: 0, error: err.message };
  }
}

async function dropOutbox(db, id) {
  await db.query(`DELETE FROM gapi_outbox WHERE id=$1`, [id]);
}
