// עמידות בנתק — מצב הקשר לשרת, כמקור אמת יחיד לכל הממשק.
//
// זהו ה-store שהבאנר, החיוויים והחסימות קוראים ממנו. הוא **לא** מסתמך על
// navigator.onLine: הוא מדווח רק על כרטיס הרשת של המחשב, ולא יודע אם השרת
// עצמו נפל או אם המתג באמצע מת. מקור האמת היחיד הוא האם בקשת API אמיתית
// הצליחה לאחרונה.
//
// שלושה מצבים, לא שניים — וההפרדה ביניהם היא מה שמונע חיווי מהבהב:
//   markOnline    — הגיע מידע טרי. הכל תקין.
//   markReachable — השרת ענה, אבל ב-5xx. הקשר חי, המידע לא התרענן.
//   noteFailure   — לא הגיעה תשובה כלל. נתק מוכרז רק אחרי סף כשלים רצופים.

/**
 * כמה כשלי קשר **רצופים** לפני שמכריזים נתק.
 *
 * הסף אינו קוסמטיקה. העמדה מריצה עשרות pollers מול תקרה של 6 חיבורים בו-זמנית
 * (HTTP/1.1), ולכן בקשה בודדת שנתקעת בתור או נופלת היא אירוע שגרתי שאינו מעיד
 * על דבר. בלי הסף כל אירוע כזה הדליק "אין קשר" ומיד אחריו "הקשר חזר", והפינה
 * של המסך הבהבה בלי הרף. בנתק אמיתי **כל** הבקשות נופלות, והסף נחצה בתוך פחות
 * משנייה.
 */
export const FAILURE_THRESHOLD = 3;

/**
 * מעבר לגיל הזה המידע שעל המסך אינו חי, גם אם השרת עונה. מכסה את המקרה שהקשר
 * תקין אבל הקריאות חוזרות בשגיאה — מסך שמציג מידע ישן בלי לומר זאת מסוכן יותר
 * ממסך שקרס.
 */
export const STALE_DATA_MS = 30_000;

export type NetSnapshot = {
  /** האם התקבלה תשובה מהשרת בבקשה האחרונה */
  online: boolean;
  /** מתי התקבלה תשובה מוצלחת אחרונה (ms epoch); null = מעולם לא בסשן הזה */
  lastSuccessAt: number | null;
  /** מתי אותר הנתק (ms epoch); null = מחובר */
  offlineSince: number | null;
  /** כשלי קשר רצופים, חסום ב-FAILURE_THRESHOLD כדי שלא ירנדר בכל כשל מחדש */
  failures: number;
  /**
   * מתי התחילה סדרת התשובות שאינן מביאות מידע טרי — כשל קשר או 5xx.
   * null = המידע מתרענן כרגיל. זה מה שמבדיל "אין תנועה כי הכל תקין" (מסך שקט,
   * בלי חיווי) מ"אין תנועה כי משהו שבור" (חיווי אחרי STALE_DATA_MS).
   */
  degradedSince: number | null;
  /** כמה פעולות פרטיות ממתינות ב-outbox המקומי */
  queued: number;
  /** הפעולה המשותפת האחרונה שנחסמה (לצורך הודעה למשתמש) */
  lastBlocked: { path: string; at: number } | null;
};

const CLEAN: NetSnapshot = {
  online: true,
  lastSuccessAt: null,
  offlineSince: null,
  failures: 0,
  degradedSince: null,
  queued: 0,
  lastBlocked: null,
};

let state: NetSnapshot = { ...CLEAN };

/** מונה מלא (לא חסום) + רגע הכשל הראשון ברצף — הנתק מתוארך אליו, לא לסף. */
let failureRun = 0;
let firstFailureAt: number | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** מחליף את ה-snapshot רק אם משהו באמת השתנה — כדי לא לרנדר מחדש כל 5 שניות. */
function update(patch: Partial<NetSnapshot>) {
  let changed = false;
  const next = { ...state };
  for (const k of Object.keys(patch) as (keyof NetSnapshot)[]) {
    if (next[k] !== patch[k]) { (next as Record<string, unknown>)[k] = patch[k]; changed = true; }
  }
  if (!changed) return;
  state = next;
  emit();
}

export function getNetSnapshot(): NetSnapshot {
  return state;
}

export function subscribeNet(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** בקשת API החזירה מידע — הקשר חי והמידע שעל המסך טרי. */
export function markOnline(now: number = Date.now()) {
  failureRun = 0;
  firstFailureAt = null;
  update({ online: true, lastSuccessAt: now, offlineSince: null, failures: 0, degradedSince: null });
}

/**
 * השרת **ענה**, אבל בשגיאת שרת (5xx).
 *
 * זה לא נתק: הכבל, המתג והשרת עובדים, והבעיה היא ב-endpoint אחד. לכן מונה
 * הכשלים מתאפס ומצב הקשר תקין — אבל `lastSuccessAt` **לא** מתעדכן, כי מידע
 * חדש לא הגיע. אם המצב יימשך, גיל המידע יחצה את STALE_DATA_MS והחיווי יעלה
 * מהסיבה הנכונה: "המידע אינו מתעדכן", ולא "אין קשר".
 */
export function markReachable(now: number = Date.now()) {
  failureRun = 0;
  firstFailureAt = null;
  update({ online: true, offlineSince: null, failures: 0, degradedSince: state.degradedSince ?? now });
}

/**
 * כשל קשר אמיתי — הבקשה לא קיבלה תשובה כלל (שגיאת רשת או תקרת זמן).
 * הנתק מוכרז רק אחרי FAILURE_THRESHOLD כשלים רצופים.
 */
export function noteFailure(now: number = Date.now()) {
  if (firstFailureAt == null) firstFailureAt = now;
  failureRun++;
  const failures = Math.min(failureRun, FAILURE_THRESHOLD);
  const degradedSince = state.degradedSince ?? now;
  if (failureRun < FAILURE_THRESHOLD) { update({ failures, degradedSince }); return; }
  update({ online: false, offlineSince: firstFailureAt, failures, degradedSince });
}

export function setQueuedCount(n: number) {
  update({ queued: n });
}

export function noteBlocked(path: string, now: number = Date.now()) {
  state = { ...state, lastBlocked: { path, at: now } };
  emit();
}

/** גיל המידע המוצג במסך, במילישניות. null כשאין עדיין מידע כלל. */
export function dataAgeMs(now: number = Date.now()): number | null {
  if (state.lastSuccessAt == null) return null;
  return Math.max(0, now - state.lastSuccessAt);
}

/** לבדיקות בלבד — מאפס את המצב הגלובלי בין מקרים. */
export function __resetNetStatus() {
  state = { ...CLEAN };
  failureRun = 0;
  firstFailureAt = null;
  listeners.clear();
}
