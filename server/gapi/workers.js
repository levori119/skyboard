// GAPI — עובדי רקע: drain של ה-outbox ו-reconciliation תקופתי, פר-סביבה.
// forEachEnvironment מריץ כל tick על public (env 1) + כל סכמות התרגול הקיימות;
// כשסביבה לא מוגדרת/כבויה — drain/reconcile חוזרים מיד (no-op זול).
import { forEachEnvironment } from '../db/envs.js';
import { currentEnv } from '../db/env-context.js';
import { drain, enableImmediateDrain } from './outbox.js';
import { reconcileOnce } from './reconcile.js';
import { getConfig, getSecret } from './config.js';
import { pushSubscription } from './client.js';

let started = false;

// רישום מחדש של המנוי בעליית השרת. ב-GAPI הכלל הוא "אין מנוי → הכל עובר",
// ולכן אם ה-DB שלו נבנה מחדש ואיבד את טבלת המנויים, הסינון (חלון-4ש, נחת)
// מפסיק לעבוד **בשקט** ופ"מ שיצא מהתנאי לא נמחק אצלנו. שליחה בכל עלייה סוגרת את זה.
async function republishSubscription() {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.base_url) return;
  const secret = await getSecret();
  await pushSubscription(cfg.base_url, secret, { env: currentEnv(), ...(cfg.subscription || {}) });
}

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

// reconcile הוא גם מסלול הקליטה היחיד לשינויים שנוצרו במופע GAPI אחר (למשל ה-UI
// שב-Railway, שחולק את אותו DB אך לא יכול לדחוף אלינו) — ולכן 15ש' ולא דקה.
export function startGapiWorkers({ outboxMs = 5000, reconcileMs = Number(process.env.GAPI_RECONCILE_MS) || 15000 } = {}) {
  if (started) return;
  started = true;
  enableImmediateDrain(true); // עריכת משתמש נדחפת מיד, לא ממתינה ל-tick
  guardedInterval(outboxMs, 'outbox', () => drain().catch(e => console.error('[gapi] drain:', e.message)));
  guardedInterval(reconcileMs, 'reconcile', () => reconcileOnce().catch(e => console.error('[gapi] reconcile:', e.message)));
  forEachEnvironment(() => republishSubscription()
    .catch(e => console.error(`[gapi] subscription republish (env ${currentEnv()}):`, e.message)))
    .catch(() => { /* GAPI למטה בעלייה — ה-PUT הבא/הסבב הבא יכסה */ });
  console.log('[gapi] workers started (outbox + reconcile + immediate push)');
}
