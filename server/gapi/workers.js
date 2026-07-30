// GAPI — עובדי רקע: drain של ה-outbox ו-reconciliation תקופתי, פר-סביבה.
// forEachEnvironment מריץ כל tick על public (env 1) + כל סכמות התרגול הקיימות;
// כשסביבה לא מוגדרת/כבויה — drain/reconcile חוזרים מיד (no-op זול).
import { forEachEnvironment } from '../db/envs.js';
import { drain } from './outbox.js';
import { reconcileOnce } from './reconcile.js';

let started = false;

function guardedInterval(ms, label, fn) {
  let inFlight = false;
  return setInterval(async () => {
    if (inFlight) return;               // מונע חפיפה אם tick קודם עוד רץ
    inFlight = true;
    try {
      await forEachEnvironment(fn);
    } catch (err) {
      console.error(`[gapi] ${label} tick failed:`, err.message);
    } finally {
      inFlight = false;
    }
  }, ms);
}

export function startGapiWorkers({ outboxMs = 5000, reconcileMs = 60000 } = {}) {
  if (started) return;
  started = true;
  guardedInterval(outboxMs, 'outbox', () => drain().catch(e => console.error('[gapi] drain:', e.message)));
  guardedInterval(reconcileMs, 'reconcile', () => reconcileOnce().catch(e => console.error('[gapi] reconcile:', e.message)));
  console.log('[gapi] workers started (outbox + reconcile)');
}
