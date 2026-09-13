// נסיעות השדה, בסקר דרך usePollingRegistry.
//
// שלושה מקומות מציגים את אותן נסיעות - חלון "ניהול נסיעות", ההתראות המתפרצות,
// והרכבים על מפת השדה. כולם עוברים דרך המנוע המאוחד (טיימר יחיד, עצירה כשהטאב
// מוסתר) ולא פותחים `setInterval` משלהם.
//
// ⚠️ **מזהה הסקר ייחודי לכל צרכן** (`useId`). המנוע ממפתח משימות לפי מזהה:
// `register` באותו מזהה **מחליף** את המשימה ו-`unregister` **מוחק** אותה. מזהה
// שנגזר רק מהשדה ומהטווח היה גורם לחלון "ניהול נסיעות" לדרוס את הסקר של
// ההתראות המתפרצות (שניהם `all`), ובסגירת החלון - לבטל אותו. ההתראות היו
// מפסיקות להתעדכן בדיוק כשהחלון סגור, כלומר כשהן הדרך היחידה לדעת על נסיעה.
//
// `scope='upcoming'` מחזיר רק את חלון ההתראה, וגבולותיו נשלחים מכאן ולא מקובעים
// בשרת - המספרים חיים במקום אחד, src/utils/trips.ts, והשרת רק מסנן גס.

import { useCallback, useId, useState } from 'react';
import { API_URL } from '../config';
import { usePolling } from './usePollingRegistry';
import { DEPARTURE_ALERT_MINUTES, STALE_TRIP_HOURS } from '../utils/trips';

export type TripScope = 'all' | 'upcoming';

/**
 * מזהה משימת הסקר במנוע המאוחד. **חייב לכלול את הצרכן**: שני צרכנים באותו
 * שדה ובאותו טווח שחולקים מזהה דורסים זה את זה, וסגירת אחד מבטלת את השני.
 */
export const tripsPollId = (scope: TripScope, airfieldId: number | null, consumerId: string): string =>
  `airfield-trips-${scope}-${airfieldId ?? 'none'}-${consumerId}`;

export function useAirfieldTrips<T = any>(
  airfieldId: number | null,
  scope: TripScope,
  intervalMs: number,
): { trips: T[]; reload: () => Promise<T[] | null> } {
  const [trips, setTrips] = useState<T[]>([]);
  const consumerId = useId();

  const reload = useCallback(async () => {
    if (!airfieldId) { setTrips([]); return []; }
    const qs = scope === 'upcoming'
      ? `&scope=upcoming&within_minutes=${DEPARTURE_ALERT_MINUTES}&stale_hours=${STALE_TRIP_HOURS}`
      : '';
    try {
      const r = await fetch(`${API_URL}/trips?airfield_id=${airfieldId}${qs}`);
      if (!r.ok) return null;
      const rows: T[] = await r.json();
      setTrips(rows);
      // מוחזרת גם ישירות: מי שכתב זה עתה צריך את השורה המעודכנת **עכשיו**, ולא
      // אחרי שה-state יתעדכן ברינדור הבא
      return rows;
    } catch { return null; /* הרשת נופלת - הרשימה נשארת כפי שהיא, ולא מתרוקנת על המסך */ }
  }, [airfieldId, scope]);

  usePolling(tripsPollId(scope, airfieldId, consumerId), async () => { await reload(); }, intervalMs);

  return { trips, reload };
}

export default useAirfieldTrips;
