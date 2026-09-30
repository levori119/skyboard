// לאן הולכת בקשת /api — לשרת המרכזי או למאגר המקומי בעמדה.
//
// זו נקודת ההכרעה של "עבודה מנותקת": אותה בקשה בדיוק, אותו נתיב, ורק היעד
// משתנה. הלקוח אינו יודע מי ענה לו, ולכן `API_URL='/api'` ומאות אתרי ה-fetch
// בקוד נשארים כמו שהם.
//
// שלושה מצבים:
//   'auto'   — ברירת המחדל. מול השרת המרכזי כל עוד הוא חי; נופל למקומי כשלא.
//   'local'  — עמדה עצמאית: תמיד מקומי, גם אם יש רשת.
//   'remote' — ההתנהגות הישנה: תמיד מרכזי, בלי מאגר מקומי כלל.
//
// ⚠️ **החלטה לפי מצב, לא ניסיון-וכשל.** אי אפשר "לנסות מרכזי ואם נכשל לנסות
// מקומי" בלי לשמור את גוף הבקשה בזיכרון, כי גוף הבקשה הוא זרם שנצרך פעם אחת.
// לכן מצב הקשר נמדד ברקע, וכל בקשה מנותבת לפי המצב הידוע. בקשה בודדת שנופלת
// ברגע המעבר תיכשל, וזה מכוון: העמדה מדווחת עליה במקום להעמיד פנים.

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * כמה כשלים **רצופים** לפני שעוברים למאגר המקומי.
 *
 * הסף אינו קוסמטיקה - הוא אותו שיקול כמו ב-src/offline/netStatus.ts: העמדה
 * מריצה עשרות pollers מול תקרה של 6 חיבורים בו-זמנית, ובקשה בודדת שנופלת היא
 * אירוע שגרתי. בלי הסף כל אירוע כזה היה מחליף מאגר הלוך ושוב, והבקר היה רואה
 * מידע שקופץ בין שני מקורות. בנתק אמיתי כל הבקשות נופלות והסף נחצה מיד.
 */
const FAILURE_THRESHOLD = 3;

/** כל כמה זמן נבדק אם השרת המרכזי חזר, כשאנחנו על המאגר המקומי. */
const PROBE_INTERVAL_MS = 5000;

/** נתיב הבריאות של השרת המרכזי - אינו נוגע ב-DB, ולכן בודק את הקשר בלבד. */
const HEALTH_PATH = '/api/health';

function createRemoteHealth({ apiTarget, probeIntervalMs = PROBE_INTERVAL_MS, timeoutMs = 4000, now = Date.now }) {
  let failures = 0;
  let online = true;
  let offlineSince = null;
  let timer = null;
  const listeners = new Set();

  const emit = () => { for (const l of listeners) l(snapshot()); };

  const snapshot = () => ({ online, failures, offlineSince });

  function markUp() {
    failures = 0;
    if (!online) { online = true; offlineSince = null; stopProbing(); emit(); }
  }

  function markDown() {
    if (!online) return;
    if (++failures < FAILURE_THRESHOLD) return;
    online = false;
    offlineSince = now();
    startProbing();
    emit();
  }

  // הבדיקה התקופתית רצה **רק** בזמן נתק. כשהשרת חי, כל בקשה אמיתית היא כבר
  // עדות למצבו, ובדיקה נוספת הייתה תעבורה מיותרת בכל עמדה כל 5 שניות.
  function startProbing() {
    if (timer) return;
    timer = setInterval(() => {
      probeOnce().then(ok => { if (ok) markUp(); }).catch(() => {});
    }, probeIntervalMs);
    timer.unref?.();
  }

  function stopProbing() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function probeOnce() {
    return new Promise(resolve => {
      let url;
      try { url = new URL(HEALTH_PATH, apiTarget); } catch { return resolve(false); }
      const mod = url.protocol === 'https:' ? https : http;
      const req = mod.request(url, { method: 'GET' }, res => {
        res.resume();
        resolve((res.statusCode || 0) < 500);
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error('probe timeout')));
      req.on('error', () => resolve(false));
      req.end();
    });
  }

  return {
    snapshot,
    markUp,
    markDown,
    probeOnce,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    stop: stopProbing,
  };
}

/**
 * בוחר יעד לבקשה.
 *
 * `simulated` (נתק מדומה) מתנהג כמו נתק אמיתי לכל דבר - **חוץ** מזה שהוא
 * מוגבל לעמדה הזו. הוא גובר גם על `mode: 'remote'`: מי שביקש במפורש לדמות
 * נתק מתכוון שהעמדה תנותק, ולא ש"תנסה בכל זאת".
 *
 * ⚠️ בלי מאגר מקומי אין לאן לנתב. אז הנתק המדומה מתבטא בכך שהבקשה **נכשלת**
 * (`which: 'none'`), ולא בכך שהיא ממשיכה לעבוד כרגיל - אחרת הכפתור היה נדלק
 * בלי שקורה דבר, וזה נראה למפעיל בדיוק כמו פיצ'ר שבור.
 *
 * @returns {'remote'|'local'|'none'}
 */
function chooseTarget({ mode, remoteOnline, hasLocal, simulated, drainPending = false }) {
  if (simulated) return hasLocal ? 'local' : 'none';
  if (mode === 'remote' || !hasLocal) return 'remote';
  if (mode === 'local') return 'local';
  // ⚠️ **הקשר חזר, אבל עבודה מהנתק עדיין לא נדחפה.** החלפה מיידית למרכז
  // פירושה שהמסך מציג את גרסת המרכז על שורות שהעמדה שינתה בנתק - והפ"מ
  // "קופץ אחורה" מול עיני הפקח, בדיוק בשניות שבין חזרת הקשר לדחיפה. זהו
  // הדיווח "מסנכרן מה שיש במאגר במקום מה שבעמדה". נשארים מקומיים עד
  // שהיומן מתרוקן (ראה drainPending ב-createApiRouter).
  if (remoteOnline && drainPending) return 'local';
  return remoteOnline ? 'remote' : 'local'; // auto
}

/**
 * בונה נתב.
 *
 * @param {object} opts
 * @param {string} opts.apiTarget      כתובת השרת המרכזי
 * @param {() => string|null} opts.localTarget  כתובת השרת המקומי (null עד שהוא עולה)
 * @param {'auto'|'local'|'remote'} [opts.mode]
 */
function createApiRouter({ apiTarget, localTarget = () => null, mode = 'auto', probeIntervalMs, timeoutMs = 4000 }) {
  const health = createRemoteHealth({ apiTarget, probeIntervalMs, timeoutMs });
  let currentMode = mode;
  let simulated = false;
  let simulatedSince = null;

  // ── המתנה לניקוז היומן ──────────────────────────────────────────────────
  // כמה עבודה מהנתק עדיין לא נדחפה. נקרא מהמאגר המקומי ברקע, ולא בתוך
  // ההכרעה עצמה: `resolve()` נקרא **בכל בקשה** ואסור לו לחכות לרשת.
  let pendingCount = 0;
  let drainUntil = 0;
  let pendingTimer = null;

  /**
   * ⚠️ **תקרת זמן, ולא המתנה אינסופית.** יומן שנתקע (סתירה שאיש אינו מכריע,
   * שורה שנדחית שוב ושוב) היה משאיר את העמדה מנותקת מהמרכז לנצח - כלומר
   * הגנה שהופכת לתקלה חמורה יותר מזו שהיא מונעת.
   */
  const DRAIN_MAX_MS = 60_000;
  const PENDING_POLL_MS = 2000;

  const readPending = () => {
    const local = localTarget();
    if (!local) { pendingCount = 0; return; }
    let url;
    try { url = new URL('/api/__localdb/pending', local); } catch { return; }
    const req = http.get(url, { timeout: 2000 }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { pendingCount = Number(JSON.parse(body).pending) || 0; } catch { pendingCount = 0; }
        if (pendingCount > 0 && !drainUntil) drainUntil = Date.now() + DRAIN_MAX_MS;
        if (pendingCount === 0) drainUntil = 0;
      });
    });
    req.on('error', () => { pendingCount = 0; });
    req.on('timeout', () => req.destroy());
  };

  // נדגם רק כשיש בכלל מאגר מקומי. בעמדה בלי מאגר זו פעולה ריקה.
  pendingTimer = setInterval(readPending, PENDING_POLL_MS);
  pendingTimer.unref?.();
  readPending();

  const drainPending = () => pendingCount > 0 && drainUntil > Date.now();

  return {
    health,
    getMode: () => currentMode,
    setMode: (m) => { currentMode = m; },

    /**
     * נתק מדומה - **בעמדה הזו בלבד**.
     *
     * זה כל העניין: השרת המרכזי ממשיך לרוץ, שאר העמדות אינן יודעות דבר,
     * ורק העמדה שלחצה עוברת לעבוד מול המאגר שלה. כך אפשר לתרגל נתק, ולבדוק
     * שהסנכרון חזרה באמת עובד, בלי להפיל שדה שלם.
     */
    setSimulatedOutage(on) {
      const next = !!on;
      if (next === simulated) return this.status();
      simulated = next;
      simulatedSince = next ? Date.now() : null;
      return this.status();
    },
    isSimulated: () => simulated,

    /** לאן הבקשה הזו הולכת, ומהי כתובת היעד. */
    resolve() {
      const local = localTarget();
      const which = chooseTarget({
        mode: currentMode,
        remoteOnline: health.snapshot().online,
        hasLocal: !!local,
        simulated,
        drainPending: drainPending(),
      });
      return {
        which,
        target: which === 'local' ? local : which === 'remote' ? apiTarget : null,
      };
    },

    /** ניתוב מפורש ליעד אחד, בלי קשר למצב. משמש את נתיבי הסנכרון. */
    resolveForced(which) {
      const target = which === 'local' ? localTarget() : apiTarget;
      return { which, target: target || null };
    },

    /** מדווח על תוצאת בקשה שעברה בפועל - זה מה שמזין את מצב הקשר. */
    report(which, ok) {
      if (which !== 'remote') return;
      // בנתק מדומה אין ללמוד דבר מכשל: הוא מלאכותי. דיווח היה מגלגל את מצב
      // הקשר האמיתי למטה, והעמדה הייתה נשארת "מנותקת" גם אחרי כיבוי הדימוי.
      if (simulated) return;
      if (ok) health.markUp(); else health.markDown();
    },

    /** מצב לחיווי בממשק. */
    status() {
      const local = localTarget();
      const { which } = this.resolve();
      return {
        mode: currentMode,
        serving: which,
        remote: health.snapshot(),
        localReady: !!local,
        simulated,
        simulatedSince,
      };
    },
  };
}

module.exports = {
  createApiRouter,
  createRemoteHealth,
  chooseTarget,
  FAILURE_THRESHOLD,
  HEALTH_PATH,
};
