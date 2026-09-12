// נסיעות השדה, בסקר יחיד שמשותף לכל הצרכנים.
//
// שלושה מקומות מציגים את אותן נסיעות - חלון "ניהול נסיעות", ההתראות המתפרצות,
// והרכבים על מפת השדה. בלי הוק אחד כל אחד מהם היה פותח `setInterval` משלו, וזו
// בדיוק בעיית ה-30 טיימרים ש-usePollingRegistry נבנה כדי לפתור.
//
// `scope='upcoming'` מחזיר רק את חלון ההתראה, וגבולותיו נשלחים מכאן ולא מקובעים
// בשרת - המספרים חיים במקום אחד, src/utils/trips.ts, והשרת רק מסנן גס.

import { useCallback, useState } from 'react';
import { API_URL } from '../config';
import { usePolling } from './usePollingRegistry';
import { DEPARTURE_ALERT_MINUTES, STALE_TRIP_HOURS } from '../utils/trips';

export type TripScope = 'all' | 'upcoming';

export function useAirfieldTrips<T = any>(
  airfieldId: number | null,
  scope: TripScope,
  intervalMs: number,
): { trips: T[]; reload: () => Promise<void> } {
  const [trips, setTrips] = useState<T[]>([]);

  const reload = useCallback(async () => {
    if (!airfieldId) { setTrips([]); return; }
    const qs = scope === 'upcoming'
      ? `&scope=upcoming&within_minutes=${DEPARTURE_ALERT_MINUTES}&stale_hours=${STALE_TRIP_HOURS}`
      : '';
    try {
      const r = await fetch(`${API_URL}/trips?airfield_id=${airfieldId}${qs}`);
      if (r.ok) setTrips(await r.json());
    } catch { /* הרשת נופלת - הרשימה נשארת כפי שהיא, ולא מתרוקנת על המסך */ }
  }, [airfieldId, scope]);

  usePolling(`airfield-trips-${scope}-${airfieldId ?? 'none'}`, reload, intervalMs);

  return { trips, reload };
}

export default useAirfieldTrips;
