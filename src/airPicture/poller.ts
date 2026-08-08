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

import { parseSnapshot, versionCompatible } from '../../shared/airTrafficApi';
import { airPictureStore } from './store';

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
/** תקרת ה-backoff. מעבר לזה אין טעם - העמדה כבר מסומנת down. */
const MAX_BACKOFF_MS = 30000;
/** הבקשה מבוטלת לפני שהדגימה הבאה אמורה לצאת. */
const REQUEST_TIMEOUT_MS = 1800;

let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: AbortController | null = null;
let subscribers = 0;
let pollMs = DEFAULT_POLL_MS;
let backoff = 0;
let etag: string | null = null;
let versionWarned = false;

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
    // 502/503 = **המאגר** לא ענה (השרת שלנו כן ענה, והוא זה שאומר את זה).
    // כל שאר הכשלים - כולל נפילת רשת שנתפסת ב-catch - הם השרת של SKY-KING.
    // ההבחנה אינה קוסמטית: היא קובעת לאן הפקח הולך לחפש את התקלה.
    if (!res.ok) throw new Error(res.status === 502 || res.status === 503 ? 'repo' : `HTTP ${res.status}`);

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
    airPictureStore.setSnapshot(snap.t, snap.seq, snap.tracks, Date.now());
    backoff = 0;
  } catch (err) {
    // ביטול יזום (מעבר לדגימה הבאה / כיבוי) אינו תקלה ואינו מדליק backoff.
    if (ac.signal.aborted && subscribers <= 0) return;
    backoff = backoff ? Math.min(backoff * 2, MAX_BACKOFF_MS) : pollMs * 2;
    etag = null;
    const msg = err instanceof Error ? err.message : 'error';
    airPictureStore.setStatus(msg === 'repo' ? 'down' : 'server', msg);
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
  airPictureStore.reset();
}

/** לבדיקות בלבד - חשיפת המצב הפנימי בלי לייצא משתנים משתנים. */
export function _pollerState() {
  return { subscribers, pollMs, backoff, hasTimer: timer !== null };
}
