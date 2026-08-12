// עמידות בנתק — יירוט fetch גלובלי אחד, במקום לשכתב מאות אתרי קריאה.
//
// למה יירוט ולא helper שקוראים לו ידנית: יש מאות קריאות `fetch(`${API_URL}/...`)`
// בקוד. helper חדש היה מחייב לגעת בכולן, ולהשאיר את מי שנשכח בלי הגנה — כלומר
// בדיוק ההתנהגות המסוכנת שאנחנו באים לסגור. יירוט אחד מכסה את כולן, כולל
// קריאות עתידיות, ומקיים את עקרון הרכיב המשותף.
//
// זרימה:
//   GET  → רשת. הצליח: נשמר ב-cache והוחזר. נכשל: מוחזר מה-cache עם ציון גיל.
//   כתיבה → רשת. בנתק: פרטית → outbox מקומי · משותפת → נחסמת בקול.

import { bypassesOfflineLayer, classifyWrite, isApiRequest, isReadMethod, normalizePath } from './policy';
import { createStore, CACHE_STORE, OUTBOX_STORE, type OfflineStore } from './store';
import { Outbox, type OutboxItem } from './outbox';
import { markReachable, markOnline, noteFailure, noteBlocked, getNetSnapshot } from './netStatus';

/** כותרות שהממשק קורא כדי לדעת שהתשובה הגיעה מה-cache ולא מהשרת. */
export const HDR_FROM_CACHE = 'x-skyking-from-cache';
export const HDR_CACHED_AT = 'x-skyking-cached-at';
/** קוד הכשל שהממשק מזהה כ"פעולה משותפת נחסמה בנתק". */
export const BLOCKED_CODE = 'OFFLINE_SHARED_WRITE';

type CachedPayload = { body: string; status: number; contentType: string };

export type OfflineFetchOptions = {
  baseFetch?: typeof fetch;
  cacheStore?: OfflineStore;
  outboxStore?: OfflineStore;
  now?: () => number;
  /** מעבר לזמן הזה ללא תשובה נחשב נתק. כבל מנותק תוקע fetch עד timeout של TCP. */
  timeoutMs?: number;
  /**
   * ⚠️ בטיחות: מזהה הסביבה (X-Env). ה-cache **חייב** להיות משויך אליו — אחרת
   * סביבת תרגול וסביבה טסה חולקות את אותה רשומה, ותרגול מציג מידע אמיתי (או
   * להפך). זו בדיוק הזליגה שמנגנון הסכמות בשרת בא למנוע.
   */
  scope?: () => string;
  /** שם הכותרת שנושאת את ה-scope בשידור חוזר מה-outbox. */
  scopeHeader?: string;
};

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

const methodOf = (input: RequestInfo | URL, init?: RequestInit): string =>
  (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET').toUpperCase();

/**
 * מפתח cache יציב: סביבה + שיטה + הנתיב **עם** ה-query (airfield_id משנה את
 * התשובה), בלי origin — כדי שהמפתח לא ישתנה כשהעמדה עוברת מ-dist מקומי לשרת.
 */
export function cacheKey(url: string, method: string, scope = '1'): string {
  const noOrigin = url.replace(/^[a-z]+:\/\/[^/]+/i, '');
  return `env:${scope}|${method.toUpperCase()} ${noOrigin || '/'}`;
}

function jsonResponse(status: number, payload: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

/** מריץ fetch עם תקרת זמן, ומכבד signal שהקורא כבר העביר. */
async function fetchWithTimeout(
  base: typeof fetch, input: RequestInfo | URL, init: RequestInit | undefined, timeoutMs: number,
): Promise<Response> {
  if (!timeoutMs || typeof AbortController === 'undefined') return base(input, init);
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const outer = init?.signal;
  const onAbort = () => ctrl.abort();
  outer?.addEventListener('abort', onAbort);
  try {
    return await base(input, { ...init, signal: ctrl.signal });
  } catch (err) {
    // תקרת הזמן שלנו היא כשל קשר; ביטול של הקורא אינו כשל כלל. שניהם מגיעים
    // כ-AbortError מאותו controller, ולכן בלי ההסבה הזו אי אפשר להבדיל.
    if (timedOut && isAbortError(err)) throw Object.assign(new Error('request timeout'), { name: 'TimeoutError' });
    throw err;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
}

/** האם התשובה היא שגיאת שרת. השרת **ענה** — זו אינה עדות למצב הקשר. */
const isServerError = (status: number) => status >= 500;

const isAbortError = (err: unknown): boolean =>
  !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';

const signalOf = (input: RequestInfo | URL, init?: RequestInit): AbortSignal | null | undefined =>
  init?.signal ?? (typeof input === 'object' && 'signal' in input ? (input as Request).signal : null);

/**
 * ביטול יזום של הקורא — **לא** כשל, ולא ראיה לשום דבר על מצב הקשר.
 *
 * זו הייתה הסיבה המרכזית לחיווי הנתק המהבהב: ה-poller של התמונ"א מבטל את
 * הבקשה שלו אחרי 1800ms ואת הקודמת בכל טיק, וכל ביטול כזה נספר כנתק.
 */
const isCallerAbort = (err: unknown, signal?: AbortSignal | null): boolean =>
  !!signal?.aborted || isAbortError(err);

export function createOfflineFetch(opts: OfflineFetchOptions = {}) {
  const base = opts.baseFetch ?? fetch.bind(globalThis);
  const now = opts.now ?? (() => Date.now());
  const timeoutMs = opts.timeoutMs ?? 8000;
  const cache = opts.cacheStore ?? createStore(CACHE_STORE);
  const outbox = new Outbox(opts.outboxStore ?? createStore(OUTBOX_STORE));
  const scope = opts.scope ?? (() => '1');
  const scopeHeader = opts.scopeHeader ?? 'X-Env';

  let initPromise: Promise<void> | null = null;
  const ready = () => (initPromise ??= outbox.init().catch(() => {}));

  /**
   * משדר פריט outbox ישירות דרך ה-fetch המקורי (בלי לעבור שוב ביירוט).
   * ה-scope נכפה מהפריט ולא מהמצב הנוכחי: פעולה שנרשמה בסביבת תרגול חייבת
   * להישלח לסביבת תרגול גם אם המפעיל עבר בינתיים לסביבה טסה.
   */
  const sendOutboxItem = (item: OutboxItem) =>
    fetchWithTimeout(base, item.url, {
      method: item.method,
      headers: item.scope ? { ...item.headers, [scopeHeader]: item.scope } : item.headers,
      body: item.body,
    }, timeoutMs);

  const drainOutbox = () => outbox.drain(sendOutboxItem).catch(() => ({ sent: 0, dropped: 0, left: 0 }));

  async function readFromCache(key: string): Promise<Response | null> {
    try {
      const hit = await cache.get<CachedPayload>(key);
      if (!hit?.value) return null;
      return new Response(hit.value.body, {
        status: hit.value.status,
        headers: {
          'Content-Type': hit.value.contentType || 'application/json',
          [HDR_FROM_CACHE]: '1',
          [HDR_CACHED_AT]: String(hit.savedAt),
        },
      });
    } catch {
      return null;
    }
  }

  // כתיבת ה-cache אינה חוסמת את התשובה לקורא: ב-/api/strips/global מדובר
  // במאות KB, והמתנה לכתיבה בכל poll הייתה מוסיפה השהיה למסך.
  // `savedAt` נלכד בזמן **קבלת התשובה** ולא בזמן סיום הכתיבה — אחרת גיל
  // המידע שמוצג לבקר היה צעיר ממה שהוא באמת.
  const inFlight = new Set<Promise<unknown>>();
  function track<T>(p: Promise<T>): Promise<T> {
    inFlight.add(p);
    void p.catch(() => {}).finally(() => inFlight.delete(p));
    return p;
  }

  async function writeToCache(key: string, res: Response, savedAt: number): Promise<void> {
    try {
      const clone = res.clone();
      const contentType = clone.headers.get('Content-Type') || 'application/json';
      // רק תשובות טקסטואליות נשמרות. בינארי (סמלים, תמונות מפה) כבר מטומן
      // ע"י הדפדפן דרך ETag ואין טעם לשכפל אותו ל-IndexedDB.
      if (!/json|text/i.test(contentType)) return;
      const body = await clone.text();
      await cache.set<CachedPayload>(key, { body, status: clone.status, contentType }, savedAt);
    } catch { /* cache מלא או תשובה שכבר נצרכה — לא שובר את הבקשה */ }
  }

  const offlineFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    const method = methodOf(input, init);

    // כל מה שאינו API (נכסים, מיראז', שירותים חיצוניים) עובר כמו שהוא, וכך גם
    // נתיבים שאינם מעידים על בריאות הקשר (ריליי התמונ"א — ראה policy.ts)
    if (!isApiRequest(url) || bypassesOfflineLayer(url)) return base(input, init);

    await ready();

    // התור מנוקז אחרי כל תשובה שמוכיחה שהשרת חי — ולא רק במעבר ממנותק למחובר.
    // כשל בודד כבר אינו מכריז נתק, ולכן "היינו מנותקים" הפסיק להיות טריגר תקף.
    const drainIfPending = () => { if (getNetSnapshot().queued > 0) void track(drainOutbox()); };

    // ── קריאה ────────────────────────────────────────────────────────────────
    if (isReadMethod(method)) {
      const key = cacheKey(url, method, scope());
      let res: Response;
      try {
        res = await fetchWithTimeout(base, input, init, timeoutMs);
      } catch (err) {
        // הקורא ביטל — לא נתק, ובעיקר: השגיאה חוזרת אליו כמו שהיא. תשובה
        // מהטמון במקומה הייתה נקראת אצלו כדגימה חדשה.
        if (isCallerAbort(err, signalOf(input, init))) throw err;
        noteFailure(now());
        const cached = await readFromCache(key);
        if (cached) return cached;
        throw err; // אין מידע קודם להציג — הקורא חייב לדעת, לא לקבל מערך ריק
      }

      // 5xx: השרת ענה, ולכן הקשר תקין — אבל מידע חדש לא הגיע. מגישים את האחרון
      // הידוע עם חותמת הגיל שלו, וגיל המידע הוא שיתריע אם המצב יימשך.
      if (isServerError(res.status)) {
        markReachable(now());
        const cached = await readFromCache(key);
        if (cached) return cached;
        throw new Error(`HTTP ${res.status}`);
      }

      const arrivedAt = now();
      markOnline(arrivedAt);
      if (res.ok) void track(writeToCache(key, res, arrivedAt));
      drainIfPending();
      return res;
    }

    // ── כתיבה ────────────────────────────────────────────────────────────────
    const policy = classifyWrite(url, method);

    try {
      const res = await fetchWithTimeout(base, input, init, timeoutMs);
      // גם 5xx חוזר לקורא. קודם הוא נחשב נתק, ולכן כתיבה משותפת שנכשלה בשגיאת
      // יישום הוצגה כ"נחסמה כי אין קשר" (הודעה שגויה), וכתיבה פרטית נכנסה
      // ל-outbox ושודרה שוב מאוחר יותר — כלומר שוכפלה.
      if (isServerError(res.status)) markReachable(now()); else markOnline(now());
      drainIfPending();
      return res;
    } catch (err) {
      if (isCallerAbort(err, signalOf(input, init))) throw err;
      noteFailure(now());
    }

    if (policy === 'drop') {
      return jsonResponse(200, { ok: true, dropped: true });
    }

    if (policy === 'private') {
      const headers: Record<string, string> = {};
      new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined))
        .forEach((v, k) => { headers[k] = v; });
      let body: string | null = null;
      try {
        body = typeof init?.body === 'string' ? init.body
          : init?.body ? String(init.body)
          : (typeof input === 'object' && 'clone' in input ? await (input as Request).clone().text() : null);
      } catch { body = null; }
      await outbox.enqueue({ url, method, headers, body, queuedAt: now(), scope: scope() });
      return jsonResponse(202, { ok: true, queued: true });
    }

    // משותפת — נחסמת. ההודעה מזוהה ע"י הממשק דרך `code`.
    noteBlocked(normalizePath(url), now());
    return jsonResponse(503, {
      error: 'offline',
      code: BLOCKED_CODE,
      path: normalizePath(url),
    });
  };

  return Object.assign(offlineFetch, {
    /** לשימוש הבאנר / בדיקות */
    _outbox: outbox,
    _drain: drainOutbox,
    _cache: cache,
    /** ממתין לעבודת הרקע (כתיבת cache, drain) — לבדיקות דטרמיניסטיות */
    _settled: async () => { while (inFlight.size) await Promise.allSettled([...inFlight]); },
  });
}

let uninstall: (() => void) | null = null;

/** מתקין את היירוט על window.fetch. מחזיר פונקציית הסרה (לבדיקות). */
export function installOfflineFetch(opts: OfflineFetchOptions = {}): () => void {
  if (uninstall) return uninstall;
  const original = globalThis.fetch.bind(globalThis);
  const wrapped = createOfflineFetch({ ...opts, baseFetch: original });
  globalThis.fetch = wrapped as typeof fetch;
  uninstall = () => { globalThis.fetch = original; uninstall = null; };
  return uninstall;
}

export function getInstalledFetch(): typeof fetch {
  return globalThis.fetch;
}
