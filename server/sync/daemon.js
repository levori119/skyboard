// שירות המראה - מושך את המאגר המרכזי אל המאגר המקומי, כל הזמן.
//
// **הבעיה שזה פותר, ולמה היא חזרה שוב ושוב:** עד היום הסנכרון רץ **בדפדפן**
// (src/offline/syncClient.ts). התוצאה הייתה שרשרת תנאים שכל אחד מהם מכבה את
// המראה בשקט - אין דפדפן פתוח, איש אינו מחובר, הטאב במצב רקע, המפעיל סגר
// את העמדה בסוף המשמרת. ובכל אחד מהמקרים האלה המאגר המקומי נשאר ריק, וזה
// מתגלה רק ברגע הגרוע ביותר: כשהקשר נופל והמסך מתרוקן.
//
// כאן זה הפוך: השירות רץ כל עוד הסוכן רץ, בלי קשר לדפדפן ובלי קשר למי מחובר.
//
// ⚠️ **למה בתוך התהליך של המאגר ולא כאפליקציה נפרדת.** PGlite **נועל את
// תיקיית המאגר**: תהליך שני שינסה לפתוח אותה ייכשל. לכן השירות חייב לחיות
// בתהליך שמחזיק את המאגר - וזו דווקא הקלה, כי הצד המקומי הוא קריאת DB ישירה
// ורק הצד המרכזי הוא HTTP. זה מסיר את הקושי שבגללו הסנכרון הושם בדפדפן
// מלכתחילה ("צריך אסימון תקף לשני הצדדים באותה נשימה").
//
// ⚠️ **כיוון אחד בלבד: מהמרכז אל העמדה.** הדחיפה חזרה נשארת בדפדפן, שם יושבת
// הזהות של המפעיל ושם מוכרעות הסתירות. לסוכן יש אסימון **קריאה בלבד**
// (`STATION_PATHS` ב-middleware/auth.js), ולכן גם אם ייגנב - אי אפשר לכתוב בו.

import { ingestSnapshot } from './mirror.js';

/**
 * כמה טבלאות בבקשה אחת.
 *
 * נמדד מול הייצור: צילום מלא הוא 128 טבלאות, 4.58MB ו-10.5 שניות, ו-12
 * טבלאות הן כ-1.2 שניות. בקשה אחת גדולה חרגה מתקרת הזמן של הפרוקסי וחזרה
 * 502 **תמיד** - זו הייתה התקלה שהשאירה את המאגר ריק.
 */
const BATCH = 12;

/** כל כמה זמן נמשכת מראה שלמה כשהכל תקין. */
const DEFAULT_INTERVAL_MS = 60_000;

/** אחרי כשל - נסיגה מתגברת, עד התקרה. רשת מבודדת יכולה ליפול לשעות. */
const RETRY_MIN_MS = 10_000;
const RETRY_MAX_MS = 5 * 60_000;

/** תקרת זמן לבקשה בודדת. רחבה: צילום הוא בקשה כבדה מטבעה, לא בקשה תפעולית. */
const REQUEST_TIMEOUT_MS = 60_000;

const state = {
  enabled: false,
  running: false,
  lastOkAt: null,
  lastError: null,
  lastDurationMs: null,
  progress: null,        // { done, total }
  rounds: 0,
  failures: 0,
};

export const mirrorDaemonState = () => ({ ...state });

async function getJson(url, headers, signal) {
  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.replace(/\?.*/, '')}`);
  return res.json();
}

/**
 * סיבוב אחד: רשימת הטבלאות, ואז קבוצה-קבוצה אל המאגר המקומי.
 *
 * ⚠️ **`protectedKeys` בכל קבוצה.** המראה לעולם אינה דורסת שורה שממתינה ביומן
 * הסנכרון - כלומר עבודה שהמפעיל עשה בנתק וטרם נדחפה. בלי זה סיבוב מראה אחד
 * היה מוחק אותה בשקט.
 */
async function runOnce({ central, headers, pool, schema, protectedKeys, log }) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS * 4);
  try {
    const { tables } = await getJson(`${central}/api/sync/mirror/tables`, headers, ctrl.signal);
    if (!Array.isArray(tables) || !tables.length) throw new Error('רשימת טבלאות ריקה');

    let upserted = 0;
    for (let i = 0; i < tables.length; i += BATCH) {
      const batch = tables.slice(i, i + BATCH);
      state.progress = { done: i, total: tables.length };
      const snap = await getJson(
        `${central}/api/sync/mirror?tables=${encodeURIComponent(batch.join(','))}`,
        headers, ctrl.signal,
      );
      // ⚠️ `pool.query` ולא `pool.connect()`: במאגר המקומי יש חיבור יחיד,
      // והחזקת client כאן הייתה נועלת את כל בקשות העמדה עד סוף הסיבוב.
      const keys = await protectedKeys((sql, params) => pool.query(sql, params));
      const stats = await ingestSnapshot(
        { query: (sql, params) => pool.query(sql, params) }, schema, snap, keys);
      upserted += stats.upserted;
    }

    state.progress = null;
    state.lastOkAt = Date.now();
    state.lastDurationMs = Date.now() - t0;
    state.lastError = null;
    state.failures = 0;
    state.rounds++;
    log(`[mirror] סיבוב ${state.rounds}: ${tables.length} טבלאות · ${upserted} שורות · ${state.lastDurationMs}ms`);
    return true;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * מפעיל את השירות. מחזיר פונקציית עצירה.
 *
 * חסר `central` או `token` - השירות פשוט אינו נדלק, והעמדה ממשיכה לעבוד
 * כמו קודם (סנכרון מהדפדפן). תצורה חסרה אינה סיבה להפיל עמדה.
 */
export function startMirrorDaemon({
  central,
  token,
  stationKey = 'unknown',
  env = '1',
  pool,
  schema = 'public',
  protectedKeys,
  intervalMs = Number(process.env.SKYKING_MIRROR_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
  log = console.log,
} = {}) {
  if (!central || !token) {
    log('[mirror] שירות המראה כבוי - חסרים SKYKING_CENTRAL_URL או SKYKING_STATION_TOKEN');
    return () => {};
  }

  const base = String(central).replace(/\/+$/, '');
  const headers = {
    'X-Station-Token': token,
    'X-Station-Key': stationKey,
    'X-Env': String(env),
    'Cache-Control': 'no-store',
  };

  state.enabled = true;
  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped || state.running) return;
    state.running = true;
    let wait = intervalMs;
    try {
      await runOnce({ central: base, headers, pool, schema, protectedKeys, log });
    } catch (err) {
      state.failures++;
      state.lastError = String(err?.message || err);
      state.progress = null;
      // נסיגה מתגברת: רשת מבודדת שנפלה יכולה להיות למטה שעות, ובקשה כל 10
      // שניות לאורך כל הזמן הזה היא רעש בלוג ועומס על שער היציאה.
      wait = Math.min(RETRY_MIN_MS * 2 ** Math.min(state.failures - 1, 5), RETRY_MAX_MS);
      log(`[mirror] סיבוב נכשל (${state.failures}): ${state.lastError} - שוב בעוד ${Math.round(wait / 1000)}ש'`);
    } finally {
      state.running = false;
      if (!stopped) {
        timer = setTimeout(() => { void tick(); }, wait);
        timer.unref?.();
      }
    }
  };

  log(`[mirror] שירות המראה פעיל - ${base} · עמדה ${stationKey} · כל ${Math.round(intervalMs / 1000)}ש'`);
  void tick();

  return () => {
    stopped = true;
    state.enabled = false;
    if (timer) clearTimeout(timer);
  };
}

export const __internals = { BATCH, RETRY_MIN_MS, RETRY_MAX_MS, runOnce };
