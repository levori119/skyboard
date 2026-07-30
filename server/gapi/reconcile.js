// GAPI — reconciliation: משיכת אירועים שאחרי ה-cursor (fallback ל-webhooks שאבדו,
// וגם ריצת boot). ראה GAPI-CONTRACT.md §9.
import pool from '../db/pool.js';
import { getConfig, getSecret, advanceCursor } from './config.js';
import { fetchChanges } from './client.js';
import { applyBatch } from './sync.js';

// מושך ומחיל גל אחד. resync=true מתחיל מ-cursor ריק (משיכה מלאה).
export async function reconcileOnce({ resync = false } = {}, db = pool) {
  const cfg = await getConfig(db);
  if (!cfg.enabled || !cfg.base_url) return { skipped: true };
  const secret = await getSecret(db);
  const since = resync ? null : cfg.last_cursor;

  const changes = await fetchChanges(cfg.base_url, secret, since);
  const events = changes?.events || [];
  const { summary } = await applyBatch(events, db);
  // מקדמים cursor רק כשאין כשלים (error) — כדי לא לדלג על אירועים שנכשלו
  if (changes?.cursor && !summary.error) await advanceCursor(changes.cursor, db);
  return { summary, cursor: changes?.cursor ?? null, count: events.length };
}
