// מנוע הסנכרון בלקוח - מי שמחזיק את שני הקצוות.
//
// למה דווקא הדפדפן מריץ את זה: הסנכרון חייב לדבר עם **שני** הצדדים באותה
// נשימה - לקרוא את היומן מהמאגר המקומי ולדחוף אותו למרכז - והדפדפן הוא
// היחיד שמחזיק אסימון תקף לשניהם. שרת מקומי שהיה פונה למרכז בעצמו היה זקוק
// לזהות משלו, כלומר משטח תקיפה חדש ועוד מסלול הזדהות לתחזק.
//
// שני כיוונים, ושניהם דרך `/api/__local` ו-`/api/__remote` (ראה
// electron/stationServer.cjs):
//   מראה  - מהמרכז לעמדה, כל עוד יש קשר. זה מה שנותן לעמדה על מה לעבוד בנתק.
//   דחיפה - מהעמדה למרכז, כשהקשר חוזר. זה מה שמחזיר את העבודה לשדה.
//
// **סדר קשיח:** קודם דוחפים, רק אחר כך מושכים מראה. מראה שמגיעה לפני הדחיפה
// הייתה מביאה את הגרסה הישנה של המרכז אל מול עבודה מקומית חדשה - ומייצרת
// סתירות יש מאין. (קליטת המראה מדלגת על שורות ממתינות, אבל אין סיבה לסמוך
// על שכבה אחת בלבד בדבר כזה.)

import { API_URL } from '../config';
import { getNetSnapshot } from './netStatus';
import {
  refreshStationStatus, getStationState, isSimulatedOutage, hasLocalDb,
} from './stationMode';

const LOCAL = `${API_URL}/__local/sync`;
const REMOTE = `${API_URL}/__remote/sync`;

/** כל כמה זמן נמשכת מראה מהמרכז כשהכל תקין. */
const MIRROR_EVERY_MS = 45_000;
/** כל כמה זמן נבדק המצב (זול: נתיב מקומי בלבד). */
const TICK_MS = 10_000;

export type SyncConflict = {
  key: string;
  table: string;
  pk: Record<string, unknown>;
  at: string;
  /** `superseded` = הוכרע אוטומטית לטובת המרכז · `conflict` = לא ניתן להכריע */
  status?: 'superseded' | 'conflict' | string;
  reason: 'newer_there' | 'deleted_there' | 'no_timestamp' | string;
  /** השורה כפי שהמרכז מחזיק אותה עכשיו */
  serverRow: Record<string, unknown> | null;
  /** השורה כפי שהיא בעמדה בסוף הנתק */
  mine: Record<string, unknown> | null;
  journalIds: number[];
};

export type SyncState = {
  /** false = אין מאגר מקומי בעמדה, ואין מה לסנכרן */
  enabled: boolean;
  pending: number;
  /**
   * הוכרעו **אוטומטית** לטובת המרכז (האחרון מנצח). אינן עוצרות את הבקר -
   * הן שם כדי שיראה מה הוכרע, ויוכל להפוך אם אינו מסכים.
   */
  resolved: SyncConflict[];
  /** מעט השורות שלא ניתן היה להכריע אוטומטית. רק אלה דורשות אדם. */
  conflicts: SyncConflict[];
  busy: boolean;
  lastPushAt: number | null;
  lastMirrorAt: number | null;
  lastPushed: number;
  error: string | null;
};

let state: SyncState = {
  enabled: false, pending: 0, resolved: [], conflicts: [], busy: false,
  lastPushAt: null, lastMirrorAt: null, lastPushed: 0, error: null,
};

const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const set = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; emit(); };

export const getSyncState = (): SyncState => state;
export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const jsonOf = async (res: Response) => {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** קורא את מצב היומן מהמאגר המקומי. 404 = אין מאגר מקומי, והמנוע נכבה. */
async function readLocalState(): Promise<boolean> {
  const res = await fetch(`${LOCAL}/state`, { cache: 'no-store' });
  if (res.status === 404 || res.status === 503) { set({ enabled: false }); return false; }
  const d = await jsonOf(res);
  set({
    enabled: true,
    pending: Number(d.pending) || 0,
    resolved: Array.isArray(d.resolved) ? d.resolved : [],
    conflicts: Array.isArray(d.conflicts) ? d.conflicts : [],
  });
  return true;
}

/**
 * דוחפת את מה שממתין, ומסמנת ביומן מה הוחל ומה נתקל בסתירה.
 *
 * `force` מגיע רק מהכרעת הבקר ("הגרסה שלי"): שם הוא כבר ראה את גרסת השרת
 * והחליט נגדה. דחיפה אוטומטית לעולם אינה כופה.
 */
export async function pushPending(force = false): Promise<number> {
  if (!state.enabled || state.busy) return 0;
  set({ busy: true, error: null });
  try {
    const { ops } = await jsonOf(await fetch(`${LOCAL}/outbound`, { cache: 'no-store' }));
    if (!ops?.length) return 0;

    // `stationNow` הוא מה שמאפשר למרכז לתרגם את שעון העמדה לשעון שלו לפני
    // שהוא מכריע "מי עדכן אחרון". בלעדיו ההשוואה מודדת שני שעונים שונים.
    const { results } = await jsonOf(
      await post(`${REMOTE}/push`, { ops, force, stationNow: new Date().toISOString() }));
    await post(`${LOCAL}/ack`, { results });

    const applied = results.filter((r: { status: string }) =>
      r.status === 'applied' || r.status === 'skipped').length;
    set({ lastPushAt: Date.now(), lastPushed: applied });
    await readLocalState();
    return applied;
  } catch (err) {
    // כשל דחיפה אינו אובדן: היומן נשאר במצב ממתין, והסיבוב הבא ינסה שוב.
    set({ error: String((err as Error)?.message || err) });
    return 0;
  } finally {
    set({ busy: false });
  }
}

/** מושכת את תמונת המצב מהמרכז וקולטת אותה למאגר המקומי. */
export async function pullMirror(): Promise<boolean> {
  if (!state.enabled || state.busy) return false;
  set({ busy: true });
  try {
    const snap = await jsonOf(await fetch(`${REMOTE}/mirror`, { cache: 'no-store' }));
    await jsonOf(await post(`${LOCAL}/mirror`, snap));
    set({ lastMirrorAt: Date.now(), error: null });
    return true;
  } catch (err) {
    set({ error: String((err as Error)?.message || err) });
    return false;
  } finally {
    set({ busy: false });
  }
}

/**
 * היפוך הכרעה, או הכרעה במה שלא הוכרע אוטומטית.
 *
 * 'mine' מחזיר את השורות לתור ומיד דוחף אותן **בכפייה** - אחרת הן היו נתקלות
 * שוב באותה השוואת זמנים, מפסידות שוב, וההכרעה של הבקר לא הייתה עושה דבר.
 */
export async function resolveConflict(key: string, choice: 'mine' | 'theirs'): Promise<void> {
  const res = await post(`${LOCAL}/resolve`, { key, choice });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  await readLocalState();
  if (d.force) await pushPending(true);
}

let timer: ReturnType<typeof setInterval> | null = null;

/** סיבוב אחד: מצב → דחיפה → מראה. */
async function tick(): Promise<void> {
  await refreshStationStatus();
  const station = getStationState().station;
  // דפדפן בלי שרת עמדה, או עמדה בלי מאגר מקומי - אין יומן ואין מה לסנכרן
  if (station === false || !hasLocalDb()) { set({ enabled: false }); return; }

  if (!(await readLocalState())) return;

  // בזמן נתק (אמיתי או מדומה) אין למי לדחוף. היומן ממשיך להתמלא, וזה בדיוק
  // מה שהוא נועד לעשות.
  if (isSimulatedOutage() || !getNetSnapshot().online) return;

  if (state.pending > 0) { await pushPending(false); return; }
  if (!state.lastMirrorAt || Date.now() - state.lastMirrorAt > MIRROR_EVERY_MS) {
    await pullMirror();
  }
}

/** מפעיל את המנוע. נקרא פעם אחת מ-App. מחזיר פונקציית עצירה. */
export function startSyncClient(): () => void {
  if (timer) return () => { /* כבר רץ */ };
  void tick();
  timer = setInterval(() => { void tick(); }, TICK_MS);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}
