// עמידות בנתק — חיבור מצב הקשר ל-React.
//
// ה-hook מרנדר מחדש בשני מקרים: כשמצב הקשר משתנה, וכל שנייה **רק כשמנותקים**
// (כדי ששעון גיל המידע יתקתק). כשהקשר תקין אין טיימר כלל — מסך בקרה לא משלם
// רינדור לשנייה על חיווי שאינו משתנה.

import React from 'react';
import { getNetSnapshot, subscribeNet, type NetSnapshot } from './netStatus';

export type NetView = NetSnapshot & {
  /** גיל המידע המוצג במילישניות; null כשעוד לא התקבל מידע */
  ageMs: number | null;
};

/** "04:12" / "1:02:30" — פורמט קבוע, נקרא במבט חטוף בלי לפרש מילים. */
export function formatAge(ms: number | null): string {
  if (ms == null) return '--:--';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function useNetStatus(): NetView {
  const snap = React.useSyncExternalStore(subscribeNet, getNetSnapshot, getNetSnapshot);
  const [, tick] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    if (snap.online) return;             // מחובר — אין מה לתקתק
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [snap.online]);

  return {
    ...snap,
    ageMs: snap.lastSuccessAt == null ? null : Math.max(0, Date.now() - snap.lastSuccessAt),
  };
}
