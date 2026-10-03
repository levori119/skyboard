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
import { replaceMirageUsers } from '../auth/mirageReplica.js';
import { writeSnapshotMarker } from './stationSeed.js';

/**
 * כמה טבלאות בבקשה אחת.
 *
 * נמדד מול הייצור: צילום מלא הוא 128 טבלאות, 4.58MB ו-10.5 שניות, ו-12
 * טבלאות הן כ-1.2 שניות. בקשה אחת גדולה חרגה מתקרת הזמן של הפרוקסי וחזרה
 * 502 **תמיד** - זו הייתה התקלה שהשאירה את המאגר ריק.
 */
const BATCH = 12;

/**
 * כל כמה זמן נמשכת מראה שלמה כשהכל תקין.
 *
 * ⚠️ **5 דקות ולא דקה.** סיבוב מלא מול הייצור נמדד ב-68-75 שניות (128
 * טבלאות, 8341 שורות), ובמרווח של דקה הסיבובים רצו **גב אל גב** - מחזור
 * עבודה של 100% על שער היציאה ועל המרכז, בלי הפסקה. הפער שזה חוסך אינו
 * משמעותי: המראה רצה ממילא בעליית העמדה, ונתק שמתרחש חמש דקות אחרי סיבוב
 * מוצא מאגר שלם כמעט לגמרי.
 *
 * לשינוי: `SKYKING_MIRROR_INTERVAL_MS`.
 */
const DEFAULT_INTERVAL_MS = 5 * 60_000;

/**
 * כל כמה זמן רץ ה**סיבוב המהיר** (דלתא).
 *
 * זה מה שעונה על "שיסתנכרן כל הזמן" (הכרעת אורי): הסיבוב המלא יקר ולכן נדיר,
 * והדלתא זולה ולכן תכופה. היא נוגעת בשש הטבלאות שמשתנות תוך כדי משמרת, מושכת
 * רק שורות שזזו, וכשאין שינויים התשובה היא כמה קילובייטים של מזהים.
 *
 * 15 שניות ולא שנייה: ההפרש התפעולי בין השתיים על לוח פ"מים זניח, וההפרש
 * בעומס על שער היציאה הוא פי 15. לשינוי: `SKYKING_MIRROR_FAST_MS`; `0` מכבה
 * את הסיבוב המהיר וחוזר להתנהגות הקודמת.
 */
const DEFAULT_FAST_MS = 15_000;

/** אחרי כמה דלתאות כושלות ברצף מכריזים נתק. 3 × 15ש' = 45 שניות. */
const FAST_FAILURES_FOR_OFFLINE = 3;

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
  /** טבלאות שנכשלו גם בסיבוב השני - תקלה אמיתית, לא סדר תלויות */
  failedTables: [],
  /** כמה משתמשי מיראז' בהעתק המקומי אחרי הסיבוב האחרון, ולמה לא עודכנו */
  mirageUsers: null,
  mirageError: null,
  /** הסיבוב המהיר: חותמת `at` של הדלתא האחרונה (**בשעון המרכז**) */
  lastDeltaAt: null,
  /** מתי הדלתא האחרונה הצליחה, בשעון המקומי - זה מדד הטריות שהמסך מציג */
  lastFastOkAt: null,
  fastRounds: 0,
  fastFailures: 0,
  lastFastError: null,
  /**
   * מול מה העמדה עובדת **עכשיו**. זו השאלה שמסך הכניסה עונה עליה, והיא
   * משקפת את תוצאת הסיבוב האחרון:
   *   'syncing' - הסנכרון הראשון רץ עכשיו
   *   'synced'  - הסיבוב האחרון הצליח; המאגר המקומי מעודכן מהמרכז
   *   'offline' - הסיבוב האחרון נכשל; העמדה עובדת עצמאית מול המאגר המקומי
   *   'off'     - השירות כבוי (אין אסימון עמדה)
   */
  startup: 'off',
  /** מתי המצב הנוכחי התחיל */
  startupAt: null,
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
async function runOnce({ central, headers, pool, schema, protectedKeys, log, dataDir }) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS * 4);
  try {
    const { tables } = await getJson(`${central}/api/sync/mirror/tables`, headers, ctrl.signal);
    if (!Array.isArray(tables) || !tables.length) throw new Error('רשימת טבלאות ריקה');

    // ⚠️ `pool.query` ולא `pool.connect()`: במאגר המקומי יש חיבור יחיד,
    // והחזקת client כאן הייתה נועלת את כל בקשות העמדה עד סוף הסיבוב.
    const q = (sql, params) => pool.query(sql, params);

    let upserted = 0;
    let failed = [];
    /** זמן הצילום המוקדם בסיבוב - נרשם כסימון, ראה stationSeed.js */
    let roundAt = null;
    for (let i = 0; i < tables.length; i += BATCH) {
      const batch = tables.slice(i, i + BATCH);
      state.progress = { done: i, total: tables.length };
      const snap = await getJson(
        `${central}/api/sync/mirror?tables=${encodeURIComponent(batch.join(','))}`,
        headers, ctrl.signal,
      );
      roundAt ??= snap.at;
      const keys = await protectedKeys(q);
      const stats = await ingestSnapshot({ query: q }, schema, snap, keys);
      upserted += stats.upserted;
      if (stats.failedTables?.length) failed = failed.concat(stats.failedTables.map(f => f.table));
    }

    // ── סיבוב שני לטבלאות שנכשלו ──────────────────────────────────────────
    // ⚠️ זה מה שפותר את בעיית **סדר התלויות**, ולא ניחוש טוב יותר של הסדר.
    // בייצור `joining_point_strips` יושב במקום 5 ברשימה ו-`strips` שהוא
    // ההורה שלו במקום 70 - כלומר הילד נמשך 65 מקומות לפני ההורה, ונפל על
    // מפתח זר. עכשיו כל ההורים כבר במאגר, ולכן משיכה שנייה של מה שנפל
    // מסתדרת. מה שנשאר נכשל הוא תקלה אמיתית, ומדווח בשמו.
    let stillFailing = [];
    if (failed.length) {
      const uniq = [...new Set(failed)];
      const snap = await getJson(
        `${central}/api/sync/mirror?tables=${encodeURIComponent(uniq.join(','))}`,
        headers, ctrl.signal,
      );
      const keys = await protectedKeys(q);
      const again = await ingestSnapshot({ query: q }, schema, snap, keys);
      upserted += again.upserted;
      stillFailing = (again.failedTables || []).map(f => f.table);
      log(`[mirror] סיבוב שני: ${uniq.length} טבלאות נפלו · ${again.upserted} שורות נכנסו`
        + (stillFailing.length ? ` · עדיין נופלות: ${stillFailing.join(', ')}` : ' · הכל נסגר'));
    }
    state.failedTables = stillFailing;

    // ── משתמשי המיראז' - להעתק שבמאגר המקומי ──────────────────────────────
    // כך כל משתמש מורשה נכנס בנתק, גם אם מעולם לא נכנס בעמדה הזו. ראה
    // auth/mirageReplica.js. ⚠️ כשל כאן **אינו** מפיל את הסיבוב: המיראז' יכול
    // להיות למטה כשהמרכז חי, וההעתק הקודם נשאר תקף - עדיף משתמשים מלפני
    // רבע שעה מאשר אף משתמש.
    try {
      const mirage = await getJson(`${central}/api/sync/mirror/mirage-users`, headers, ctrl.signal);
      if (mirage?.ok === true && Array.isArray(mirage.users)) {
        const { count } = await replaceMirageUsers(pool, mirage.users);
        state.mirageUsers = count;
        state.mirageError = null;
      } else {
        throw new Error('תשובה לא תקינה');
      }
    } catch (err) {
      state.mirageError = String(err?.message || err);
      log(`[mirror] משתמשי המיראז' לא עודכנו (${state.mirageError}) - ההעתק הקודם נשאר`);
    }
    writeSnapshotMarker(dataDir, Date.parse(roundAt ?? ''));

    state.progress = null;
    state.lastOkAt = Date.now();
    state.lastDurationMs = Date.now() - t0;
    state.lastError = null;
    state.failures = 0;
    state.rounds++;
    // ⚠️ **המצב משקף את הסיבוב האחרון, ולא את הראשון בלבד.**
    // בגרסה הראשונה המעבר היה `syncing → synced` בלבד, ולכן עמדה שהסיבוב
    // הראשון שלה נכשל (רשת שטרם עלתה, תקלה חולפת) נתקעה על `offline`
    // **לנצח** - והמסך הכריז "אין קשר למרכז" בזמן שהמראה סונכרנה כל חמש
    // דקות בהצלחה. חיווי שמשקר גרוע מחיווי שאינו קיים.
    if (state.startup !== 'synced') {
      const first = state.startup === 'syncing';
      state.startup = 'synced';
      state.startupAt = Date.now();
      log(first
        ? '[mirror] העמדה עלתה **מסונכרנת** מול המאגר המרכזי'
        : '[mirror] הקשר למרכז חזר - העמדה **מסונכרנת**');
    }
    log(`[mirror] סיבוב ${state.rounds}: ${tables.length} טבלאות · ${upserted} שורות · ${state.lastDurationMs}ms`);
    // הסיבוב המלא קובע נקודת ייחוס חדשה לדלתא: כל מה שקדם לו כבר אצלנו.
    state.lastDeltaAt = roundAt ?? new Date().toISOString();
    return true;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * סיבוב **מהיר**: רק מה שהשתנה בשש הטבלאות התפעוליות.
 *
 * זה מה שמחזיק את ההעתק המקומי צמוד למרכז בין הסיבובים המלאים. הוא מגיע
 * לאותה `ingestSnapshot` בדיוק - עם כל ההגנות שלה (יומן הסנכרון, שורות
 * שנולדו בעמדה, מרוץ צילום/קליטה) - ונבדל ממנה רק בכך שהצילום נושא `keys`
 * במקום את כל השורות. ראה sync/mirror.js §הסיבוב המהיר.
 */
async function runDelta({ central, headers, pool, schema, protectedKeys, log }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const q = (sql, params) => pool.query(sql, params);
    const since = state.lastDeltaAt;
    const url = `${central}/api/sync/mirror/delta`
      + (since ? `?since=${encodeURIComponent(since)}` : '');
    const snap = await getJson(url, headers, ctrl.signal);
    if (!snap || !Array.isArray(snap.tables)) throw new Error('תשובת דלתא לא תקינה');

    const keys = await protectedKeys(q);
    const stats = await ingestSnapshot({ query: q }, schema, snap, keys);

    state.lastDeltaAt = snap.at;
    state.lastFastOkAt = Date.now();
    // ⚠️ גם `lastOkAt`: זה מדד הטריות שמסך הכניסה והפקד מציגים, והשאלה
    // שהוא עונה עליה היא "מתי לאחרונה הסתנכרנו" - לא "מתי רץ סיבוב מלא".
    state.lastOkAt = Date.now();
    state.fastRounds++;
    state.fastFailures = 0;
    state.lastFastError = null;

    // התאוששות מהירה: הקשר חזר, ואין סיבה לחכות לסיבוב המלא כדי לומר זאת.
    // **רק** מ-`offline`: `syncing` פירושו שהסיבוב המלא הראשון טרם הסתיים,
    // ואז שש טבלאות אינן "מסונכרנת" - זו הייתה הכרזה שקרית.
    if (state.startup === 'offline') {
      state.startup = 'synced';
      state.startupAt = Date.now();
      log('[mirror] הקשר למרכז חזר - העמדה **מסונכרנת**');
    }
    if (stats.upserted || stats.deleted) {
      log(`[mirror] דלתא ${state.fastRounds}: ${stats.upserted} שורות · ${stats.deleted} נמחקו`);
    }
    return stats;
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
  dataDir = null,
  intervalMs = Number(process.env.SKYKING_MIRROR_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
  // `0` מכבה את הסיבוב המהיר. `??` ולא `||` כדי ש-0 יישמר כבחירה ולא ייפול
  // לברירת המחדל.
  fastMs = Number(process.env.SKYKING_MIRROR_FAST_MS ?? DEFAULT_FAST_MS),
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
  state.startup = 'syncing';
  let stopped = false;
  let timer = null;
  let fastTimer = null;

  // ── הסיבוב המהיר ─────────────────────────────────────────────────────────
  // רץ כל 15 שניות לצד הסיבוב המלא, ו**נדחה מפניו**: `state.running` מסמן
  // שסיבוב מלא באוויר, ושניהם כותבים לאותו מאגר בעל חיבור יחיד.
  const fastTick = async () => {
    if (stopped || !fastMs) return;
    // הסיבוב המלא הראשון עדיין רץ - אין בסיס לדלתא, ואין טעם להתחרות בו
    if (state.running || state.startup === 'syncing') return;
    state.running = true;
    try {
      await runDelta({ central: base, headers, pool, schema, protectedKeys, log });
    } catch (err) {
      state.fastFailures++;
      state.lastFastError = String(err?.message || err);
      // דלתא בודדת שנפלה אינה נתק - היא יכולה להיות הבהוב. שלוש ברצף
      // (45 שניות) הן כבר תשובה, והן מגיעות **הרבה** לפני הסיבוב המלא הבא.
      if (state.fastFailures >= FAST_FAILURES_FOR_OFFLINE && state.startup === 'synced') {
        state.startup = 'offline';
        state.startupAt = Date.now();
        log(`[mirror] הקשר למרכז אבד (${state.fastFailures} דלתאות) - העמדה עובדת מול המאגר המקומי`);
      }
    } finally {
      state.running = false;
    }
  };

  const tick = async () => {
    if (stopped || state.running) return;
    state.running = true;
    let wait = intervalMs;
    try {
      await runOnce({ central: base, headers, pool, schema, protectedKeys, log, dataDir });
    } catch (err) {
      state.failures++;
      state.lastError = String(err?.message || err);
      state.progress = null;
      // סיבוב שנכשל מחזיר את החיווי ל"אין קשר" - זה מה שמסך הכניסה חייב
      // לומר למפעיל **לפני** שהוא מתחיל לעבוד, ולא אחרי שיגלה שמידע חסר.
      if (state.startup !== 'offline') {
        const first = state.startup === 'syncing';
        state.startup = 'offline';
        state.startupAt = Date.now();
        log(first
          ? '[mirror] העמדה עלתה **בנתק** - תעבוד עצמאית מול המאגר המקומי'
          : '[mirror] הקשר למרכז אבד - העמדה עובדת מול המאגר המקומי');
      }
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

  log(`[mirror] שירות המראה פעיל - ${base} · עמדה ${stationKey}`
    + ` · מלא כל ${Math.round(intervalMs / 1000)}ש'`
    + (fastMs ? ` · דלתא כל ${Math.round(fastMs / 1000)}ש'` : ' · דלתא כבויה'));
  void tick();
  if (fastMs) {
    fastTimer = setInterval(() => { void fastTick(); }, fastMs);
    fastTimer.unref?.();
  }

  return () => {
    stopped = true;
    state.enabled = false;
    if (timer) clearTimeout(timer);
    if (fastTimer) clearInterval(fastTimer);
  };
}

export const __internals = {
  BATCH, RETRY_MIN_MS, RETRY_MAX_MS, DEFAULT_FAST_MS, FAST_FAILURES_FOR_OFFLINE,
  runOnce, runDelta,
};
