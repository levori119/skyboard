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
 * @returns {'remote'|'local'}
 */
function chooseTarget({ mode, remoteOnline, hasLocal }) {
  if (mode === 'remote' || !hasLocal) return 'remote';
  if (mode === 'local') return 'local';
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

  return {
    health,
    getMode: () => currentMode,
    setMode: (m) => { currentMode = m; },

    /** לאן הבקשה הזו הולכת, ומהי כתובת היעד. */
    resolve() {
      const local = localTarget();
      const which = chooseTarget({
        mode: currentMode,
        remoteOnline: health.snapshot().online,
        hasLocal: !!local,
      });
      return { which, target: which === 'local' ? local : apiTarget };
    },

    /** מדווח על תוצאת בקשה שעברה בפועל - זה מה שמזין את מצב הקשר. */
    report(which, ok) {
      if (which !== 'remote') return;
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
