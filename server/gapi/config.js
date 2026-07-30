// GAPI — גישה לקונפיג פר-סביבה (public.gapi_env_config; ראה GAPI-CONTRACT.md §10).
// currentEnv() קובע את השורה. הטבלה יושבת רק ב-public, ולכן נקראת נכון גם מהקשר
// סביבת תרגול (search_path = env_NN, public → נופל ל-public).
import pool from '../db/pool.js';
import { currentEnv } from '../db/env-context.js';

const DEFAULTS = (env) => ({
  env_number: env, base_url: null, enabled: false, subscription: {},
  last_cursor: null, last_sync_at: null, has_secret: false,
});

// קונפיג ציבורי (בלי ה-secret) — ל-API/UI.
export async function getConfig(db = pool) {
  const env = currentEnv();
  const { rows } = await db.query(
    `SELECT env_number, base_url, enabled, subscription, last_cursor, last_sync_at, updated_at,
            (hmac_secret IS NOT NULL AND hmac_secret <> '') AS has_secret
       FROM gapi_env_config WHERE env_number = $1`,
    [env],
  );
  return rows[0] || DEFAULTS(env);
}

// ה-secret — פנימי בלבד (auth/client). לעולם לא מוחזר ב-API.
export async function getSecret(db = pool) {
  const env = currentEnv();
  const { rows } = await db.query(
    `SELECT hmac_secret FROM gapi_env_config WHERE env_number = $1`, [env]);
  return rows[0]?.hmac_secret || null;
}

const WRITABLE = ['base_url', 'hmac_secret', 'enabled', 'subscription', 'last_cursor', 'last_sync_at'];

// upsert חלקי — כותב רק שדות שסופקו. subscription מסוריאל ל-JSON.
export async function upsertConfig(patch = {}, db = pool) {
  const env = currentEnv();
  const keys = WRITABLE.filter(k => k in patch);
  const cols = ['env_number', ...keys];
  const vals = [env, ...keys.map(k => (k === 'subscription' ? JSON.stringify(patch[k] ?? {}) : patch[k]))];
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const updates = keys.map(k => `${k} = EXCLUDED.${k}`);
  updates.push('updated_at = NOW()');
  await db.query(
    `INSERT INTO gapi_env_config (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
     ON CONFLICT (env_number) DO UPDATE SET ${updates.join(', ')}`,
    vals,
  );
  return getConfig(db);
}

export async function advanceCursor(cursor, db = pool) {
  const env = currentEnv();
  await db.query(
    `INSERT INTO gapi_env_config (env_number, last_cursor, last_sync_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (env_number) DO UPDATE SET last_cursor = EXCLUDED.last_cursor,
       last_sync_at = NOW(), updated_at = NOW()`,
    [env, cursor],
  );
}
