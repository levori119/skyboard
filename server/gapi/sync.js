// GAPI — החלת אירועים נכנסים מ-GAPI על DB של SKYKING (ראה GAPI-CONTRACT.md §4).
// idempotency (event_id) + גרסאות (version) + resolve שדות תעופה + aircraft nesting.
// echo suppression: מסלול זה **לא** מזין את ה-outbox — רק עריכות משתמש SKYKING כן.
//
// applyEvent מקבל client מוזרק → נבדק עם mock. applyBatch מנהל טרנזקציה פר-אירוע.
import pool from '../db/pool.js';
import { getEntityDef, AIRCRAFT_FIELDS, AIRCRAFT_KEY } from './entities.js';
import { toColumns } from './adapter.js';
import { buildInsert, buildUpdate } from './sqlbuild.js';
import { shouldApplyIncoming } from './conflict.js';

// code/name → id מול טבלת ה-bases. by = עמודות ההתאמה (name/code/custom_name).
async function resolveRef(client, table, by, value) {
  if (value == null || value === '') return null;
  const cond = by.map((c, i) => `LOWER(${c}) = LOWER($1)`).join(' OR ');
  const { rows } = await client.query(
    `SELECT id FROM ${table} WHERE ${cond} LIMIT 1`, [String(value)]);
  return rows[0]?.id ?? null;
}

// פותר שדות airfield ב-data → מוסיף id לעמודות. תומך במחרוזת, {code|name}, או {id}.
async function applyAirfields(client, def, data, cols) {
  for (const a of (def.airfields || [])) {
    if (!(a.gapi in data)) continue;
    const ref = data[a.gapi];
    if (ref && typeof ref === 'object' && ref.id != null) { cols[a.col] = ref.id; continue; }
    const val = ref && typeof ref === 'object' ? (ref.code ?? ref.name) : ref;
    cols[a.col] = await resolveRef(client, a.table, a.by || ['name'], val);
  }
}

// מסנכרן מטוסי הפ"מ (+חימושים/מערכות) — GAPI סמכותי (מסיר מטוסים שאינם ברשימה).
//
// העמודות נגזרות מ-AIRCRAFT_FIELDS ולא מקודדות כאן: הוספת שדה מטוס לחוזה נעשית
// במקום אחד (entities.js) ומחלחלת לכניסה, ליציאה ולתיעוד.
//
// **replace-set ולא מיזוג פר-שדה:** מטוס שאינו במערך נמחק כליל, ולכן מטוס שכן
// במערך נלקח כשורה שלמה - שדה שלא הופיע בו נכתב NULL. זו התנהגות ה-datk/כיפה
// מאז ומעולם, והיא נשמרת אחידה לכל השדות כדי שלא ייווצר מצב שבו חצי מהשורה
// מתעדכן וחצי נשאר ישן.
//
// שדות התקלה (AIRCRAFT_INTERNAL_COLUMNS) **אינם** ברשימה ולכן לא נדרסים:
// התקלה היא דיווח של הבקר בעמדה, ו-GAPI אינו מקור אמת עבורה.
async function syncAircraft(client, stripId, aircraft) {
  const cols = AIRCRAFT_FIELDS.map(f => f.col);
  const insertCols = ['strip_id', AIRCRAFT_KEY.col, ...cols];
  const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(',');
  const setClause = cols.map(c => `${c} = EXCLUDED.${c}`).join(', ');
  const keepIdx = [];
  for (const ac of aircraft) {
    const idx = parseInt(ac?.idx);
    if (!Number.isInteger(idx) || idx < 1) continue;
    keepIdx.push(idx);
    const up = await client.query(
      `INSERT INTO strip_aircraft (${insertCols.join(', ')}) VALUES (${placeholders})
       ON CONFLICT (strip_id, ${AIRCRAFT_KEY.col}) DO UPDATE SET ${setClause}
       RETURNING id`,
      [stripId, idx, ...AIRCRAFT_FIELDS.map(f => ac?.[f.gapi] ?? null)]);
    const saId = up.rows[0].id;
    if (Array.isArray(ac.armaments)) {
      await client.query('DELETE FROM strip_aircraft_armaments WHERE strip_aircraft_id=$1', [saId]);
      for (const arm of ac.armaments) {
        if (arm && arm.name) await client.query(
          'INSERT INTO strip_aircraft_armaments (strip_aircraft_id, armament_name, quantity) VALUES ($1,$2,$3)',
          [saId, String(arm.name), parseInt(arm.quantity) || 1]);
      }
    }
    if (Array.isArray(ac.systems)) {
      await client.query('DELETE FROM strip_aircraft_systems WHERE strip_aircraft_id=$1', [saId]);
      for (const sys of ac.systems) {
        if (sys && sys.name) await client.query(
          'INSERT INTO strip_aircraft_systems (strip_aircraft_id, system_name, status) VALUES ($1,$2,$3)',
          [saId, String(sys.name), String(sys.status || 'שמיש')]);
      }
    }
  }
  if (keepIdx.length) {
    await client.query('DELETE FROM strip_aircraft WHERE strip_id=$1 AND idx <> ALL($2::int[])', [stripId, keepIdx]);
  } else {
    await client.query('DELETE FROM strip_aircraft WHERE strip_id=$1', [stripId]);
  }
}

async function applyUpsert(client, def, entity, event) {
  const { gapi_id, version, data = {} } = event;
  const existing = await client.query(
    `SELECT id, gapi_version FROM ${def.table} WHERE gapi_id=$1 LIMIT 1`, [gapi_id]);
  const row = existing.rows[0];
  if (row && !shouldApplyIncoming(version, row.gapi_version)) {
    return { status: 'skipped', reason: 'stale-version' };
  }
  const cols = toColumns(entity, data);
  await applyAirfields(client, def, data, cols);
  cols.gapi_id = gapi_id;
  cols.gapi_version = version ?? null;
  cols.gapi_synced_at = new Date();

  let localId;
  if (row) {
    const u = buildUpdate(def.table, cols, 'id', row.id);
    await client.query(u.sql, u.params);
    localId = row.id;
  } else {
    const ins = buildInsert(def.table, cols);
    const r = await client.query(ins.sql, ins.params);
    localId = r.rows[0].id;
  }
  if (def.hasAircraft && Array.isArray(data.aircraft)) {
    await syncAircraft(client, localId, data.aircraft);
  }
  return { status: 'applied', op: row ? 'update' : 'insert', localId };
}

async function applyDelete(client, def, gapi_id) {
  const r = await client.query(`DELETE FROM ${def.table} WHERE gapi_id=$1`, [gapi_id]);
  return { status: 'applied', op: 'delete', deleted: r.rowCount };
}

// מז"א — מעדכן תת-קבוצת שדות על רשומת base_statuses קיימת (לא יוצר בסיס חדש).
async function applyWeather(client, event) {
  const { data = {} } = event;
  let baseId = null;
  const baseGapiId = data.base_gapi_id ?? event.gapi_id;
  if (baseGapiId) {
    const r = await client.query('SELECT id FROM base_statuses WHERE gapi_id=$1 LIMIT 1', [baseGapiId]);
    baseId = r.rows[0]?.id ?? null;
  }
  if (!baseId && data.airfield) {
    const val = typeof data.airfield === 'object' ? (data.airfield.code ?? data.airfield.name) : data.airfield;
    const afId = await resolveRef(client, 'airfields', ['name', 'custom_name'], val);
    if (afId) {
      const r = await client.query('SELECT id FROM base_statuses WHERE airfield_id=$1 LIMIT 1', [afId]);
      baseId = r.rows[0]?.id ?? null;
    }
  }
  if (!baseId) return { status: 'skipped', reason: 'no-matching-base' };
  const cols = toColumns('weather', data);
  if (Object.keys(cols).length === 0) return { status: 'skipped', reason: 'no-fields' };
  cols.gapi_synced_at = new Date();
  const u = buildUpdate('base_statuses', cols, 'id', baseId);
  await client.query(u.sql, u.params);
  return { status: 'applied', op: 'update', localId: baseId };
}

// מחיל אירוע בודד. client חייב להיות בתוך טרנזקציה (applyBatch מנהל זאת).
export async function applyEvent(event, client) {
  const { entity, op, gapi_id, version, event_id } = event;
  const def = getEntityDef(entity);
  if (!def) return { status: 'rejected', reason: 'unknown-entity' };
  if (!gapi_id && entity !== 'weather') return { status: 'rejected', reason: 'no-gapi-id' };

  if (event_id) {
    const seen = await client.query('SELECT 1 FROM gapi_inbound_events WHERE event_id=$1', [event_id]);
    if (seen.rowCount) return { status: 'skipped', reason: 'duplicate' };
  }

  let result;
  if (entity === 'weather') result = await applyWeather(client, event);
  else if (op === 'delete') result = await applyDelete(client, def, gapi_id);
  else result = await applyUpsert(client, def, entity, event);

  // רושמים דדופ רק כשהאירוע אכן עובד (applied/skipped-by-version) — לא ב-rejected,
  // כדי לאפשר משלוח חוזר אחרי תיקון. duplicate כבר נחסם למעלה.
  if (event_id && result.status !== 'rejected') {
    await client.query(
      `INSERT INTO gapi_inbound_events (event_id, entity, gapi_id, version)
       VALUES ($1,$2,$3,$4) ON CONFLICT (event_id) DO NOTHING`,
      [event_id, entity, gapi_id ?? null, version ?? null]);
  }
  return result;
}

// מחיל מנת אירועים — טרנזקציה פר-אירוע (כשל בודד לא מפיל את השאר).
export async function applyBatch(events, db = pool) {
  const results = [];
  for (const ev of (events || [])) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const r = await applyEvent(ev, client);
      await client.query('COMMIT');
      results.push({ event_id: ev.event_id, entity: ev.entity, ...r });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* connection כנראה מת */ }
      results.push({ event_id: ev.event_id, entity: ev.entity, status: 'error', reason: err.message });
    } finally {
      client.release();
    }
  }
  const summary = { applied: 0, skipped: 0, rejected: 0, error: 0 };
  for (const r of results) summary[r.status] = (summary[r.status] || 0) + 1;
  return { results, summary };
}
