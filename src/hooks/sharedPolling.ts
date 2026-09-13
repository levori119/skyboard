// סקר משותף עם ספירת מנויים - מעל מנוע ה-polling המאוחד.
//
// ⚠️ הכשל שהקובץ הזה פותר: `pollingRegistry.register(id)` **מחליף** משימה קיימת
// באותו מפתח, ו-`unregister(id)` **מוחק** אותה. כששני רכיבים סוקרים את אותם
// נתונים באותו מפתח:
//   1. בזמן ששניהם פתוחים - רק האחרון שנרשם מקבל נתונים, והשני קפוא בשקט.
//   2. כשאחד נסגר - המשימה נמחקת, והשני **לא סוקר יותר בכלל**.
//
// זה קרה ב-useAirfieldTrips (חלון "ניהול נסיעות" מול ערימת ההתראות), ותוקן שם
// במזהה ייחודי לכל צרכן (`useId`) - כל צרכן סוקר בנפרד.
//
// **למה כאן ערוץ משותף ולא מזהה לכל צרכן:** במעקב החי המפה וההתרעות חייבות לראות
// את **אותה** תמונה. שני סקרים נפרדים חלוקים עד 5 ש' - המפה מראה רכב סוטה
// וההתרעה עוד לא עלתה, או ההפך - ובתצוגת בטיחות זה בדיוק מה שאסור. ובנוסף בקשה
// אחת במקום שתיים, בשדה שכבר נסקר בכבדות.
//
// ערוץ אחד לכל מפתח, שמשדר לכל המנויים. המשימה נרשמת עם המנוי הראשון, ומוסרת
// רק כשהאחרון עוזב. הקצב הוא **המהיר** מבין המנויים, וחוזר לאיטי כשהמהיר עוזב.

import { pollingRegistry } from './usePollingRegistry';

interface Subscriber<T> { listener: (data: T) => void; intervalMs: number }

interface Channel<T> {
  subs: Set<Subscriber<T>>;
  fetcher: () => Promise<T | undefined>;
  last: T | undefined;
  registeredMs: number | null;
}

const channels = new Map<string, Channel<unknown>>();

async function runChannel(key: string): Promise<void> {
  const ch = channels.get(key);
  if (!ch) return;
  const data = await ch.fetcher();
  // undefined = כשל (רשת, שרת) - הנתונים הקודמים נשארים על המסך ולא מתרוקנים
  if (data === undefined || channels.get(key) !== ch) return;
  ch.last = data;
  for (const s of ch.subs) s.listener(data);
}

/** רישום מחדש רק כשהקצב המבוקש באמת השתנה - בלי לרשום שוב בכל מנוי */
function reschedule(key: string): void {
  const ch = channels.get(key);
  if (!ch || ch.subs.size === 0) return;
  const fastest = Math.min(...[...ch.subs].map(s => s.intervalMs));
  if (ch.registeredMs === fastest) return;
  const first = ch.registeredMs === null;
  ch.registeredMs = fastest;
  pollingRegistry.register(key, () => runChannel(key), fastest, { immediate: first });
}

/**
 * מנוי לנתונים שנסקרים תחת `key`. מחזיר ביטול מנוי.
 * `fetcher` מחזיר את הנתונים, או undefined בכשל. כל המנויים על מפתח חולקים סקר אחד.
 */
export function subscribeShared<T>(
  key: string,
  fetcher: () => Promise<T | undefined>,
  intervalMs: number,
  listener: (data: T) => void,
): () => void {
  let ch = channels.get(key) as Channel<T> | undefined;
  if (!ch) {
    ch = { subs: new Set(), fetcher, last: undefined, registeredMs: null };
    channels.set(key, ch as Channel<unknown>);
  } else {
    ch.fetcher = fetcher;
  }
  const sub: Subscriber<T> = { listener, intervalMs };
  ch.subs.add(sub);
  // מצטרף מאוחר מקבל מיד את מה שכבר נטען, בלי לחכות לסבב הבא
  if (ch.last !== undefined) listener(ch.last);
  reschedule(key);

  const mine = ch;
  return () => {
    mine.subs.delete(sub);
    if (mine.subs.size === 0) {
      if (channels.get(key) === mine) channels.delete(key);
      pollingRegistry.unregister(key);
    } else {
      reschedule(key);
    }
  };
}

/** רענון יזום (אחרי אישור, דחייה, שמירה) - משודר לכל המנויים, לא רק למי שביקש */
export function refreshShared(key: string): Promise<void> {
  return runChannel(key);
}

/** לבדיקות בלבד */
export function __sharedChannelSize(key: string): number {
  return channels.get(key)?.subs.size ?? 0;
}
