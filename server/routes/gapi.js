// GAPI — נתיבי האינטגרציה. ראה GAPI-CONTRACT.md §5.
//   inbound/health — נקראים ע"י GAPI, דורשים HMAC.
//   config/status/resync — ניהול פנימי (UI/אדמין), פתוחים כשאר ה-API.
// כל הנתיבים רצים אחרי environment-middleware → currentEnv()/pool מכוונים לסביבה.
import { Router } from 'express';
import { verifyRequest } from '../gapi/auth.js';
import { getConfig, getSecret, upsertConfig, advanceCursor } from '../gapi/config.js';
import { applyBatch } from '../gapi/sync.js';
import { reconcileOnce } from '../gapi/reconcile.js';
import { pushSubscription } from '../gapi/client.js';
import { invalidateEnabledCache } from '../gapi/hooks.js';
import pool from '../db/pool.js';
import { currentEnv } from '../db/env-context.js';

const router = new Router();

async function authGate(req, res) {
  const cfg = await getConfig();
  if (!cfg.enabled) { res.status(503).json({ error: 'gapi integration disabled' }); return null; }
  const secret = await getSecret();
  const check = verifyRequest(req, secret, req.rawBody || '');
  if (!check.ok) { res.status(401).json({ error: 'unauthorized', reason: check.reason }); return null; }
  return cfg;
}

// ── inbound webhook: מנת אירועים מ-GAPI ─────────────────────────────────────
router.post('/api/gapi/inbound', async (req, res) => {
  try {
    const cfg = await authGate(req, res);
    if (!cfg) return;
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    const { summary } = await applyBatch(events);
    if (req.body?.cursor && !summary.error) await advanceCursor(req.body.cursor);
    res.json({
      applied: summary.applied, skipped: summary.skipped,
      rejected: summary.rejected, errors: summary.error, cursor: req.body?.cursor ?? null,
    });
  } catch (err) {
    console.error('[gapi/inbound]', err);
    res.status(500).json({ error: 'inbound failed', detail: err.message });
  }
});

// ── health: בדיקת חיים ל-GAPI ───────────────────────────────────────────────
router.get('/api/gapi/health', async (req, res) => {
  const cfg = await authGate(req, res);
  if (!cfg) return;
  res.json({ ok: true, env: currentEnv(), last_cursor: cfg.last_cursor ?? null });
});

// ── config: ניהול (בלי secret) ──────────────────────────────────────────────
router.get('/api/gapi/config', async (_req, res) => {
  try { res.json(await getConfig()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/gapi/config', async (req, res) => {
  try {
    const { base_url, hmac_secret, enabled, subscription } = req.body || {};
    const patch = {};
    if (base_url !== undefined) patch.base_url = base_url;
    if (hmac_secret !== undefined && hmac_secret !== '') patch.hmac_secret = hmac_secret;
    if (enabled !== undefined) patch.enabled = !!enabled;
    if (subscription !== undefined) patch.subscription = subscription;
    const cfg = await upsertConfig(patch);
    invalidateEnabledCache(); // החלפת enabled תיכנס לתוקף מיד ב-hooks

    // דחיפת המנוי ל-GAPI (best-effort — לא מפיל את השמירה אם GAPI למטה)
    let pushed = false, pushError = null;
    if (cfg.enabled && cfg.base_url) {
      try {
        const secret = await getSecret();
        await pushSubscription(cfg.base_url, secret, { env: currentEnv(), ...(cfg.subscription || {}) });
        pushed = true;
      } catch (e) { pushError = e.message; }
    }
    res.json({ config: cfg, pushed, pushError });
  } catch (err) {
    console.error('[gapi/config PUT]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── status: מצב חיבור + עומק תור + אירועים אחרונים ──────────────────────────
router.get('/api/gapi/status', async (_req, res) => {
  try {
    const cfg = await getConfig();
    const outbox = await pool.query('SELECT COUNT(*)::int AS depth FROM gapi_outbox').catch(() => ({ rows: [{ depth: 0 }] }));
    const inbound = await pool.query(
      'SELECT COUNT(*)::int AS total FROM gapi_inbound_events').catch(() => ({ rows: [{ total: 0 }] }));
    res.json({
      env: currentEnv(),
      enabled: cfg.enabled, connected: !!cfg.base_url && cfg.enabled,
      base_url: cfg.base_url, has_secret: cfg.has_secret,
      subscription: cfg.subscription, last_cursor: cfg.last_cursor, last_sync_at: cfg.last_sync_at,
      outbox_depth: outbox.rows[0].depth, inbound_processed: inbound.rows[0].total,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── resync: reconciliation מלא מיידי ────────────────────────────────────────
router.post('/api/gapi/resync', async (_req, res) => {
  try { res.json(await reconcileOnce({ resync: true })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
