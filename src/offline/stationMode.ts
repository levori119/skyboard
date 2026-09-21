// מצב העמדה ונתק מדומה - מאיזה מאגר העמדה משרתת, והאם ניתקנו אותה בכוונה.
//
// הנתק המדומה הוא **פר-עמדה, ורק פר-עמדה**: הוא חי בשרת העמדה (Electron) או
// בדפדפן שלה, ולעולם אינו נוגע בשרת המרכזי. לכן אפשר לנתק עמדה אחת ולראות
// בעמדה שלידה שהשדה ממשיך לעבוד - וזו כל התועלת שלו ככלי תרגול ובדיקה.
//
// שני מימושים, ובחירה ביניהם לפי מה שקיים בעמדה:
//   · **עמדת Electron עם מאגר מקומי** - השרת המקומי מחליף ניתוב. הבקשות
//     ממשיכות להצליח, אבל מול PGlite שבעמדה. זה הדימוי המלא: אפשר להמשיך
//     לעבוד, והעבודה נצברת ליומן הסנכרון.
//   · **דפדפן, בלי מאגר מקומי** - אין לאן לנתב, ולכן הדימוי מפיל את הבקשות
//     ושכבת ה-offline הקיימת עושה את שלה (cache לקריאה, outbox לכתיבה פרטית,
//     חסימה לכתיבה משותפת). זו בדיוק ההתנהגות של נתק כבל בדפדפן.

import { API_URL } from '../config';

export type StationStatus = {
  /** 'remote' = השרת המרכזי · 'local' = המאגר שבעמדה · 'none' = אין לאן */
  serving: 'remote' | 'local' | 'none';
  mode: 'auto' | 'local' | 'remote';
  localReady: boolean;
  simulated: boolean;
  simulatedSince: number | null;
};

const STATUS_URL = `${API_URL}/__station/status`;
const OUTAGE_URL = `${API_URL}/__station/outage`;

/** דפדפן בלי שרת עמדה - הדימוי חי כאן, ושורד רענון של המסך. */
const LS_KEY = 'skyking.simulatedOutage';

type State = {
  /** null = טרם נבדק · false = אין שרת עמדה (דפדפן) */
  station: StationStatus | null | false;
  /** הדימוי בצד הלקוח, לדפדפן בלבד */
  clientSimulated: boolean;
  busy: boolean;
};

const readLs = (): boolean => {
  try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
};

let state: State = { station: null, clientSimulated: readLs(), busy: false };
const listeners = new Set<() => void>();

const emit = () => { for (const l of listeners) l(); };
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  emit();
};

export const getStationState = (): State => state;
export function subscribeStation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * האם שכבת ה-fetch צריכה להפיל את הבקשה.
 *
 * **רק** בדפדפן: בעמדת Electron עם מאגר מקומי הבקשות חייבות להמשיך להצליח
 * (מול המאגר המקומי), אחרת "נתק מדומה" היה משתק את העמדה במקום לדמות מעבר
 * למאגר שלה - כלומר בדיוק ההפך ממה שהכפתור מבטיח.
 */
export function isClientSimulatedOutage(): boolean {
  return state.clientSimulated && state.station === false;
}

/** האם העמדה מנותקת בכוונה - בכל אחד משני המימושים. */
export function isSimulatedOutage(): boolean {
  return state.station && typeof state.station === 'object'
    ? state.station.simulated
    : state.clientSimulated;
}

/** האם יש מאגר מקומי בעמדה (ולכן אפשר להמשיך לעבוד בנתק ולא רק לצפות). */
export function hasLocalDb(): boolean {
  return !!(state.station && typeof state.station === 'object' && state.station.localReady);
}

/**
 * המצב הידוע האחרון.
 *
 * פונקציה ברמת המודול ולא ביטוי בתוך הקוראת, כדי ש-TypeScript לא "יצמצם" את
 * הטיפוס לפי בדיקה שקדמה לקריאת רשת - `state` מוחלף ב-`set()` בזמן ההמתנה,
 * והצמצום הזה כבר אינו נכון.
 */
const lastKnownStation = (): StationStatus | false =>
  state.station && typeof state.station === 'object' ? state.station : false;

/**
 * קורא את מצב העמדה משרת העמדה.
 *
 * הנתיב אינו קיים בדפדפן רגיל, ו-404 מכבה את החיווי לצמיתות - אותה תבנית
 * שבה נוהג `ConnectionBanner` עם `/api/gapi/status`. התרעה על משהו שלא הותקן
 * אינה מידע, היא רעש.
 */
export async function refreshStationStatus(): Promise<StationStatus | false> {
  if (state.station === false) return false;
  try {
    const res = await fetch(STATUS_URL, { cache: 'no-store' });
    if (res.status === 404) { set({ station: false }); return false; }
    if (!res.ok) return lastKnownStation();
    const d = await res.json();
    const status: StationStatus = {
      serving: d.serving === 'local' || d.serving === 'none' ? d.serving : 'remote',
      mode: d.mode || 'auto',
      localReady: !!d.localReady,
      simulated: !!d.simulated,
      simulatedSince: d.simulatedSince ?? null,
    };
    set({ station: status });
    return status;
  } catch {
    // אין תשובה משרת העמדה עצמו - הוא רץ באותו מחשב, ולכן זו אינה עדות על
    // הקשר לשרת המרכזי. משאירים את המצב הידוע האחרון.
    return lastKnownStation();
  }
}

/** מדליק או מכבה את הנתק המדומה בעמדה הזו. */
export async function setSimulatedOutage(on: boolean): Promise<void> {
  set({ busy: true });
  try {
    if (state.station === false) {
      try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch { /* מצב פרטי */ }
      set({ clientSimulated: on });
      return;
    }
    const res = await fetch(OUTAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on }),
    });
    if (res.status === 404) {
      // אין שרת עמדה - נופלים לדימוי בצד הלקוח, ולא משאירים כפתור מת
      set({ station: false });
      try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch { /* מצב פרטי */ }
      set({ clientSimulated: on });
      return;
    }
    if (res.ok) set({ station: (await res.json()) as StationStatus });
  } finally {
    set({ busy: false });
  }
}
