// סוכן העמדה - איך עמדה שעולה ב-WEB מגיעה למאגר שעל המחשב שלה.
//
// **הבעיה שזה פותר:** טאב בכרום אינו יכול להחזיק מאגר מקומי. PGlite ו-457
// ה-endpoints שעובדים מולו דורשים תהליך Node על המחשב, ולכן פקח שפותח את
// SKY-KING בדפדפן קיבל "נתק יאפשר צפייה בלבד" - גם כשהמאגר המקומי עצמו בנוי
// ועובד. בעמדת Electron הפתרון היה שרת העמדה; כאן הוא **אותו שרת בדיוק**,
// שרץ על המחשב כסוכן (`"AGENT": true`) בלי חלון.
//
// ```
//    כרום (הכתובת של SKY-KING)
//         │  כל /api
//         ▼
//    http://127.0.0.1:5100   ← הסוכן שעל המחשב
//         │
//         ├──> השרת המרכזי      (כשיש קשר)
//         └──> PGlite שבעמדה     (בנתק)
// ```
//
// **למה *כל* התעבורה דרכו ולא רק בנתק:** גשר הזהות
// ([electron/authBridge.cjs](electron/authBridge.cjs)) מנפיק אסימון מקומי רק
// כשהוא **רואה** אסימון מרכזי שהתקבל. אילו התעבורה הרגילה עקפה אותו, הכניסה
// לא הייתה נרשמת אצלו, וברגע הנתק כל בקשה הייתה חוזרת 401 - כלומר מאגר מקומי
// שקיים ואי אפשר לגעת בו. זו גם הסיבה שבעמדת Electron הכל עובר בשרת העמדה.
//
// ⚠️ **בדיקת ההתאמה אינה פורמליות.** הסוכן מחזיק `apiTarget` משלו מקובץ
// התצורה. סוכן שהוגדר מול שרת אחר היה שולח את מידע השדה לשם בלי שאיש יראה
// זאת, ולכן סוכן שה-`apiTarget` שלו אינו המקור של הדף פשוט אינו משמש.

import { resetStationProbe } from './stationMode';

/** הפורט הקבוע של שרת העמדה. ראה electron-main.cjs §פורט העמדה ומצב סוכן. */
export const DEFAULT_AGENT_ORIGIN = 'http://127.0.0.1:5100';

/** עקיפה לבדיקות ולעמדה שהוגדרה לפורט אחר. */
const LS_KEY = 'skyking.stationAgent';

/** בדיקה מול פורט סגור נכשלת מיד; התקרה היא מפני proxy שבולע את הבקשה. */
const PROBE_TIMEOUT_MS = 1500;

/** כל כמה זמן מנסים שוב כשלא נמצא סוכן - הוא יכול לעלות אחרי הדפדפן. */
const RETRY_MS = 60_000;

export type AgentInfo = {
  origin: string;
  /** השרת המרכזי שהסוכן מוגדר מולו, כפי שהוא מדווח עליו */
  apiTarget: string | null;
  localReady: boolean;
};

export type AgentState = {
  /** null = טרם נבדק */
  agent: AgentInfo | null;
  /** למה אין סוכן - מוצג למפעיל, כי "לא קורה כלום" אינו מידע */
  reason: 'searching' | 'none' | 'mismatch' | 'self' | null;
  checkedAt: number | null;
};

let state: AgentState = { agent: null, reason: 'searching', checkedAt: null };
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const set = (patch: Partial<AgentState>) => { state = { ...state, ...patch }; emit(); };

export const getAgentState = (): AgentState => state;
export function subscribeAgent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** הסוכן הפעיל, או null. מקור האמת היחיד לשאלה "לאן הולכת הבקשה". */
export const activeAgent = (): AgentInfo | null => state.agent;

export function agentOrigin(): string {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v && /^https?:\/\//i.test(v)) return v.replace(/\/+$/, '');
  } catch { /* מצב פרטי */ }
  return DEFAULT_AGENT_ORIGIN;
}

const originOf = (url: string): string | null => {
  try { return new URL(url).origin; } catch { return null; }
};

/**
 * האם מותר לדף הזה לעבוד מול סוכן שמכוון ל-`apiTarget`.
 *
 * בפיתוח (localhost) כל יעד מתקבל - שם ה-API יושב על פורט אחר מהדף מלכתחילה,
 * ובדיקה קשיחה הייתה מכבה את הסוכן בדיוק במקום שבו בודקים אותו.
 */
export function targetMatches(pageOrigin: string, apiTarget: string | null): boolean {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/i.test(pageOrigin)) return true;
  if (!apiTarget) return false;
  return originOf(apiTarget) === pageOrigin;
}

async function probe(origin: string, signal?: AbortSignal): Promise<AgentInfo | null> {
  const res = await fetch(`${origin}/api/__station/status`, { cache: 'no-store', signal });
  if (!res.ok) return null;
  const d = await res.json();
  return {
    origin,
    apiTarget: typeof d.apiTarget === 'string' ? d.apiTarget : null,
    localReady: !!d.localReady,
  };
}

/**
 * מחפש סוכן על המחשב. בטוח לקריאה חוזרת.
 *
 * כשל מכל סוג הוא "אין סוכן" ולא שגיאה: הדף חייב להמשיך לעבוד מול השרת
 * המרכזי בדיוק כמו קודם, וסוכן הוא תוספת ולא תנאי.
 */
export async function discoverStationAgent(pageOrigin = globalThis.location?.origin || ''): Promise<AgentInfo | null> {
  const origin = agentOrigin();

  // הדף כבר מוגש מהסוכן (עמדת Electron, או פתיחה ישירה של 5100) - הכל
  // ממילא עובר דרכו, ושכתוב כתובות כאן היה מיותר ומבלבל.
  if (pageOrigin === origin) { set({ agent: null, reason: 'self', checkedAt: Date.now() }); return null; }

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS) : null;
  try {
    const info = await probe(origin, ctrl?.signal);
    if (!info) { set({ agent: null, reason: 'none', checkedAt: Date.now() }); return null; }
    if (!targetMatches(pageOrigin, info.apiTarget)) {
      set({ agent: null, reason: 'mismatch', checkedAt: Date.now() });
      return null;
    }
    set({ agent: info, reason: null, checkedAt: Date.now() });
    // הדף כבר הספיק להכריע "אין שרת עמדה" (404 על `__station/status` לפני
    // שהסוכן נמצא). בלי האיפוס הזה החיווי היה נתקע על "צפייה בלבד" לנצח.
    resetStationProbe();
    return info;
  } catch {
    set({ agent: null, reason: 'none', checkedAt: Date.now() });
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** מפעיל חיפוש חוזר כל עוד לא נמצא סוכן. מחזיר פונקציית עצירה. */
export function startAgentDiscovery(): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    if (stopped) return;
    await discoverStationAgent();
    // נמצא סוכן - אין טעם להמשיך לחפש. אם הוא ייפול, הבקשות עצמן ידווחו.
    if (!stopped && !state.agent) timer = setTimeout(tick, RETRY_MS);
  };
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

/**
 * ממירה כתובת `/api/...` לכתובת אצל הסוכן. null = אין מה לשכתב.
 *
 * הנתיב, ה-query וה-hash נשמרים כמו שהם; רק ה-origin מוחלף.
 */
export function rewriteToAgent(url: string, pageOrigin = globalThis.location?.origin || ''): string | null {
  const agent = state.agent;
  if (!agent) return null;
  try {
    const u = new URL(url, pageOrigin || 'http://localhost');
    if (u.origin === agent.origin) return null;   // כבר אצל הסוכן
    if (pageOrigin && u.origin !== pageOrigin) return null; // שירות חיצוני
    // ⚠️ **רק ה-API.** הסוכן מגיש גם dist משלו, ומשיכת נכסים דרכו הייתה
    // מריצה בעמדה את הגרסה שארוזה בו במקום את זו שהשרת המרכזי מגיש - שתי
    // גרסאות שונות שמתחלפות לפי מי ענה ראשון.
    if (!/^\/api(\/|$)/.test(u.pathname)) return null;
    return `${agent.origin}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

/**
 * מתקין את השכתוב כיירוט fetch.
 *
 * ⚠️ **חייב להיות הראשון שמותקן, ולכן הפנימי ביותר בשרשרת.** יירוטי האסימון,
 * הסביבה והעמדה מצרפים את הכותרות שלהם רק לנתיב **יחסי**
 * (`shouldAttachToken` דורש `url.startsWith('/api')`). שכתוב לכתובת מוחלטת
 * לפניהם היה שולח כל בקשה לסוכן **בלי אסימון ובלי X-Env** - כלומר 401 על
 * הכל, ומידע של סביבה אחת שנקרא בסביבה אחרת. כאן הכתובת מוחלפת אחרי שכולם
 * כבר סימנו את הבקשה, ברגע האחרון לפני הרשת.
 */
export function installStationAgentFetch(): () => void {
  const original = globalThis.fetch.bind(globalThis);
  const wrapped: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.toString()
      : (input as Request).url;
    const next = rewriteToAgent(url);
    if (!next) return original(input, init);
    if (typeof input === 'string' || input instanceof URL) return original(next, init);
    try { return original(new Request(next, input as Request), init); }
    catch { return original(input, init); }
  };
  globalThis.fetch = wrapped;
  return () => { globalThis.fetch = original; };
}

/** לבדיקות בלבד. */
export function __setAgentForTests(next: Partial<AgentState>): void {
  state = { agent: null, reason: null, checkedAt: null, ...next };
}
