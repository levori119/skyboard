// דגל "התחשבות בנתק" - הצד של הסוכן: קריאה בעלייה והחלה על הנתב.
//
// הסמכות היא המרכז (`GET /api/station/failover`, נתיב ציבורי). עמדה שעולה
// **בנתק** שואלת את אותו נתיב בדיוק במאגר המקומי: `system_defaults` עוברת
// במראה, ולכן שם יושב הערך האחרון שהמרכז קבע. בלי אף אחד מהם - נשארים דלוקים,
// כלומר ההתנהגות הקיימת. ראה server/sync/failoverFlag.js.
//
// ⚠️ המאגר המקומי עולה כמה שניות אחרי הסוכן, ולכן הקריאה ממנו ממתינה לו
// (`retryMs` / `maxWaitMs`) במקום לוותר בניסיון הראשון.

const PATH = '/api/station/failover';

async function readFlag(base, fetchImpl, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${String(base).replace(/\/+$/, '')}${PATH}`, {
      signal: ctrl.signal, headers: { 'Cache-Control': 'no-store' },
    });
    // 404 = מרכז מגרסה שאינה מכירה את הדגל. זו אינה תשובה "כבוי".
    if (!res.ok) return null;
    const d = await res.json();
    return typeof d?.enabled === 'boolean' ? d.enabled : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms) => new Promise(r => { const t = setTimeout(r, ms); t.unref?.(); });

/**
 * @returns {Promise<{enabled: boolean, source: 'central'|'local'|'default'}>}
 */
async function resolveStationFailover({
  apiTarget, localTarget = () => null, router, log = () => {},
  fetchImpl = globalThis.fetch, timeoutMs = 4000, retryMs = 2000, maxWaitMs = 60_000,
}) {
  const apply = (enabled, source) => {
    if (!enabled) router.setFailover(false);
    log(`[station] התחשבות בנתק: ${enabled ? 'דלוקה' : 'כבויה - כל הבקשות למרכז, בלי מאגר מקומי'} (מקור: ${source})`);
    return { enabled, source };
  };

  const central = apiTarget ? await readFlag(apiTarget, fetchImpl, timeoutMs) : null;
  if (central != null) return apply(central, 'central');

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const local = localTarget();
    if (local) {
      const v = await readFlag(local, fetchImpl, timeoutMs);
      if (v != null) return apply(v, 'local');
    }
    await sleep(retryMs);
  }
  return apply(true, 'default');
}

module.exports = { resolveStationFailover, FAILOVER_PATH: PATH };
