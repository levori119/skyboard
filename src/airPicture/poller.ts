// ה-poller של התמונ"א - **מופע יחיד לעמדה**, עם ספירת מנויים.
//
// יחיד בכוונה: בעמדת דו-מפה שתי המפות מציגות את אותה תמונה, ואין שום סיבה
// למשוך אותה פעמיים. שתיהן קוראות מאותו store.
//
// כללי הרשת (AIR_PICTURE_SPEC.md §5.1) - כל אחד מהם מונע תקלה מוכרת:
//   · setTimeout שרשרתי ולא setInterval - רשת שמשיבה ב-3ש' מול קצב של 2ש'
//     הייתה בונה תור בקשות חופפות שגדל בלי גבול.
//   · AbortController - בקשה תקועה לא מחזיקה חיבור ולא מעכבת את הבאה.
//   · document.hidden - עמדה מוסתרת לא צורכת רשת ולא מציירת.
//   · backoff מעריכי - נתק רשת לא הופך ל-1,800 בקשות כושלות בשעה.
//   · ETag - תמונה קפואה חוזרת כ-304 בגוף ריק, בלי parse ובלי ציור.

import { parseSnapshot, versionCompatible, envBucket } from '../../shared/airTrafficApi';
import { getCurrentEnv } from '../utils/environment';
import { airPictureStore, type AirPictureStatus } from './store';

/**
 * מי אשם בקוד התשובה. זו לא קוסמטיקה - ההודעה קובעת לאן הפקח הולך לחפש:
 *   · 502/503 - **המאגר**. השרת שלנו ענה, והוא זה שמדווח שהמאגר לא נענה.
 *   · 401/403 - **הסשן**. השרת ענה ודחה; הוא עובד.
 *   · כל השאר  - תקלת שרת אמיתית.
 */
function statusForHttp(code: number): AirPictureStatus {
  if (code === 502 || code === 503) return 'down';
  if (code === 401 || code === 403) return 'unauth';
  return 'server';
}

/**
 * נתיב אחד ללקוח, שתי הכרעות בצד השרת:
 *   · בעמדת Electron - שרת העמדה עונה **ישירות מהמאגר** ומזריק את הטוקן,
 *     בלי לעבור דרך SKY-KING (זו הדרישה "חיבור ישיר לעמדה").
 *   · בדפדפן/פיתוח - הבקשה מגיעה לשרת SKY-KING שמרלה למאגר.
 * בשני המקרים same-origin, ולכן אין CORS ואין טוקן ב-renderer.
 */
const PATH = '/api/air-picture/live';

/** קצב הבסיס. נדרס מהקונפיג של המאגר. */
const DEFAULT_POLL_MS = 2000;
/**
 * תקרת ה-backoff. **10 שניות ולא 30**: זו תצוגה תפעולית בקצב 2 שניות, והמחיר
 * של תקרה גבוהה משולם דווקא בהתאוששות - אחרי הפסקה קצרה במאגר העמדה המשיכה
 * להציג "אין קשר" עד חצי דקה אחרי שהוא כבר חזר. עלות הדגימות הנוספות בזמן
 * נפילה זניחה מול פקח שמסתכל על שגיאה שכבר אינה נכונה.
 */
const MAX_BACKOFF_MS = 10000;
/** הבקשה מבוטלת לפני שהדגימה הבאה אמורה לצאת. */
const REQUEST_TIMEOUT_MS = 1800;

let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: AbortController | null = null;
let subscribers = 0;
let pollMs = DEFAULT_POLL_MS;
let backoff = 0;
let etag: string | null = null;
let versionWarned = false;
let envUnknownWarned = false;

const schedule = (ms: number) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, ms);
};

async function tick(): Promise<void> {
  if (subscribers <= 0) return;

  // חלון מוסתר: לא מבקשים, אבל גם לא נעצרים - בודקים שוב בקצב הרגיל, כדי
  // שהחזרה למסך תהיה מיידית ולא תמתין לאירוע.
  if (typeof document !== 'undefined' && document.hidden) {
    schedule(pollMs);
    return;
  }

  inFlight?.abort();
  const ac = new AbortController();
  inFlight = ac;
  const killer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(PATH, {
      signal: ac.signal,
      headers: etag ? { 'If-None-Match': etag } : undefined,
      cache: 'no-store',
    });

    if (res.status === 304) {
      // התמונה לא זזה. `receivedAt` **לא** מתעדכן בכוונה: הגיל נמדד מול שעון
      // המאגר, ו-304 אינו דגימה חדשה אלא אישור שאין חדש.
      airPictureStore.setStatus('live');
      backoff = 0;
      return;
    }
    // כל תשובה שאינה תקינה נושאת איתה את **מי** נכשל. החלוקה הקודמת הייתה
    // בינארית (502/503 מול "כל השאר"), ולכן סשן שפג (401) הוצג כ"שרת
    // SKY-KING לא זמין" - הודעה ששולחת לבדוק שרת שעובד מצוין.
    if (!res.ok) throw new Error(`${statusForHttp(res.status)}:${res.status}`);

    etag = res.headers.get('ETag');
    const snap = parseSnapshot(await res.json());
    if (!snap) throw new Error('bad snapshot');
    // גרסת חוזה שאינה תואמת **לא חוסמת** את התצוגה: המאגר והעמדה הם שני
    // ריפואים נפרדים, ומסך ריק בלי הסבר גרוע מתמונה שמסומנת כחשודה. מתריעים
    // פעם אחת ל-console וממשיכים לצייר.
    if (!versionCompatible(snap.v) && !versionWarned) {
      versionWarned = true;
      console.warn(`[airPicture] גרסת חוזה שונה במאגר (${snap.v}) - ייתכנו שדות חסרים`);
    }
    // ── אימות הסביבה ────────────────────────────────────────────────────────
    // הבקשה נשאה `X-Env` (מוזרק ב-installEnvFetchInterceptor לכל /api), והמאגר
    // מחזיר את הסביבה שממנה בנה את התמונה. אם השתיים אינן מסכימות - **לא
    // מציגים**: בסביבת תרגול תמונה מהסביבה החיה היא תנועה אמיתית שנראית כתרגיל,
    // וזה בדיוק סוג הכשל שאסור שיהיה שקט. `envBucket` ולא השוואת מספרים, כי
    // 1-10 הן סביבה אחת ובקשה מסביבה 3 שקיבלה תשובה "1" היא **תקינה**.
    if (snap.env === null) {
      if (!envUnknownWarned) {
        envUnknownWarned = true;
        console.warn('[airPicture] המאגר אינו מדווח סביבה - ייתכן מאגר בגרסה ותיקה');
      }
    } else {
      let mine: string | null = null;
      let theirs: string | null = null;
      try { mine = envBucket(getCurrentEnv()); theirs = envBucket(snap.env); } catch { /* ראה למטה */ }
      if (mine === null || theirs === null || mine !== theirs) {
        etag = null;   // אחרת הדגימה הבאה תקבל 304 ותשאיר אותנו תקועים כאן
        airPictureStore.setEnvMismatch(`${snap.env} ≠ ${getCurrentEnv()}`);
        return;
      }
    }
    airPictureStore.setSnapshot(snap.t, snap.seq, snap.tracks, Date.now());
    backoff = 0;
  } catch (err) {
    // ביטול יזום (מעבר לדגימה הבאה / כיבוי) אינו תקלה ואינו מדליק backoff.
    if (ac.signal.aborted && subscribers <= 0) return;
    backoff = backoff ? Math.min(backoff * 2, MAX_BACKOFF_MS) : pollMs * 2;
    etag = null;
    // כשל רשת/ביטול אינו נושא קוד - שם השרת באמת לא נענה.
    const msg = err instanceof Error ? err.message : 'error';
    const [kind, code] = msg.includes(':') ? msg.split(':') : ['server', ''];
    airPictureStore.setStatus(kind as AirPictureStatus, code ? `HTTP ${code}` : msg);
  } finally {
    clearTimeout(killer);
    if (inFlight === ac) inFlight = null;
    if (subscribers > 0) schedule(backoff || pollMs);
  }
}

/**
 * הצטרפות לתמונ"א. מחזיר פונקציית ניתוק.
 * הקריאה הראשונה מפעילה את הלולאה, האחרונה עוצרת אותה - כך שדו-מפה, פאנל
 * הבקרות ותצוגת ההצצה חולקים poller אחד.
 */
export function joinAirPicture(opts?: { pollMs?: number }): () => void {
  if (opts?.pollMs && opts.pollMs >= 500) pollMs = opts.pollMs;
  subscribers++;
  if (subscribers === 1) {
    backoff = 0;
    etag = null;
    void tick();
  }
  let left = false;
  return () => {
    if (left) return;
    left = true;
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers === 0) stopAirPicture();
  };
}

/** עצירה מלאה - ניקוי טיימר, ביטול בקשה, ואיפוס ה-store. */
export function stopAirPicture(): void {
  subscribers = 0;
  if (timer) { clearTimeout(timer); timer = null; }
  inFlight?.abort();
  inFlight = null;
  etag = null;
  backoff = 0;
  versionWarned = false;
  envUnknownWarned = false;
  airPictureStore.reset();
}

/** לבדיקות בלבד - חשיפת המצב הפנימי בלי לייצא משתנים משתנים. */
export function _pollerState() {
  return { subscribers, pollMs, backoff, hasTimer: timer !== null };
}
