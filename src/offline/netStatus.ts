// עמידות בנתק — מצב הקשר לשרת, כמקור אמת יחיד לכל הממשק.
//
// זהו ה-store שהבאנר, החיוויים והחסימות קוראים ממנו. הוא **לא** מסתמך על
// navigator.onLine: הוא מדווח רק על כרטיס הרשת של המחשב, ולא יודע אם השרת
// עצמו נפל או אם המתג באמצע מת. מקור האמת היחיד הוא האם בקשת API אמיתית
// הצליחה לאחרונה.

export type NetSnapshot = {
  /** האם התקבלה תשובה מהשרת בבקשה האחרונה */
  online: boolean;
  /** מתי התקבלה תשובה מוצלחת אחרונה (ms epoch); null = מעולם לא בסשן הזה */
  lastSuccessAt: number | null;
  /** מתי אותר הנתק (ms epoch); null = מחובר */
  offlineSince: number | null;
  /** כמה פעולות פרטיות ממתינות ב-outbox המקומי */
  queued: number;
  /** הפעולה המשותפת האחרונה שנחסמה (לצורך הודעה למשתמש) */
  lastBlocked: { path: string; at: number } | null;
};

let state: NetSnapshot = {
  online: true,
  lastSuccessAt: null,
  offlineSince: null,
  queued: 0,
  lastBlocked: null,
};

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

/** בקשת API הצליחה — הקשר חי. */
export function markOnline(now: number = Date.now()) {
  update({ online: true, lastSuccessAt: now, offlineSince: null });
}

/** בקשת API נכשלה ברמת הקשר (לא 404 לוגי) — אנחנו בנתק. */
export function markOffline(now: number = Date.now()) {
  if (state.online) update({ online: false, offlineSince: now });
  else update({ online: false });
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
  state = { online: true, lastSuccessAt: null, offlineSince: null, queued: 0, lastBlocked: null };
  listeners.clear();
}
