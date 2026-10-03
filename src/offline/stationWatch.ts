// ניטור הנתב של העמדה - "מאיפה המידע שעל המסך מגיע עכשיו".
//
// ⚠️ **למה צריך דגימה, ולא די בהצלחת בקשות:** כשסוכן העמדה מותקן, נתק -
// יזום או אמיתי - אינו מייצר שום כשל בדפדפן. הסוכן מנתב למאגר המקומי
// ומחזיר **200 עם מידע טרי**, ולכן `markOnline` מתאפס ו-`ConnectionBanner`
// לא עולה. המנגנון שנבנה לעמידות בנתק היה שקוף בדיוק בעמדה שהוכנה לנתק.
//
// התשובה היחידה הכשרה לשאלה "לאן הבקשות הולכות" היא של הנתב, ולכן שואלים
// אותו. בלי סוכן - אין את מי לשאול, הניטור מכבה את עצמו, והחיווי נשאר
// נשען על כשלי רשת כמו קודם.

import { agentOrigin } from './stationAgent';
import { noteStationServing } from './netStatus';

/** הנתק היזום נדלק ונכבה ביד, ולכן הדגימה תכופה דיה כדי שהמסך יגיב מיד. */
const POLL_MS = 5000;

/** אחרי כמה כשלים רצופים מפסיקים לשאול - אין סוכן על המחשב הזה. */
const GIVE_UP_AFTER = 3;

type Status = { serving?: string | null; simulated?: boolean };

export async function readStationServing(
  origin: string = agentOrigin(),
  fetchImpl: typeof fetch = fetch,
): Promise<Status | null> {
  try {
    const res = await fetchImpl(`${origin}/api/__station/status`, {
      cache: 'no-store',
      ...({ targetAddressSpace: 'loopback' } as RequestInit),
    });
    if (!res.ok) return null;
    const d = await res.json();
    // `serving` הוא השדה שבגללו באנו. תשובה בלעדיו אינה של הנתב.
    return typeof d?.serving === 'string' ? { serving: d.serving, simulated: !!d.simulated } : null;
  } catch {
    return null;
  }
}

/** מתחיל לנטר. מחזיר פונקציית עצירה. */
export function startStationWatch(opts: {
  intervalMs?: number;
  read?: () => Promise<Status | null>;
} = {}): () => void {
  const intervalMs = opts.intervalMs ?? POLL_MS;
  const read = opts.read ?? (() => readStationServing());
  let stopped = false;
  let misses = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    if (stopped) return;
    const st = await read();
    if (stopped) return;
    if (st) {
      misses = 0;
    } else if (++misses >= GIVE_UP_AFTER) {
      // אין סוכן - מכבים את החיווי ומפסיקים לשאול. דגימה כל 5 שניות לנצח
      // מול פורט סגור היא רעש, ובדפדפן גם שורת שגיאה בקונסולה בכל סיבוב.
      noteStationServing(null);
      return;
    }
    noteStationServing(st);
    timer = setTimeout(() => { void tick(); }, intervalMs);
  };

  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
