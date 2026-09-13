// הנסיעות הפעילות בשדה (GET /api/trips/live), בסקר **אחד** שמשותף לכל הצרכנים.
//
// שני מקומות צורכים אותן במקביל: הרכבים על מפת השדה, וההתרעות על סטייה וחסימה.
// הסקר המשותף עם ספירת המנויים (sharedPolling) הוא מה שמונע מאחד מהם לקפוא
// בשקט - `pollingRegistry.register` מחליף משימה באותו מפתח. ראה sharedPolling.ts.
//
// 5 שניות - קצב השידור של אפליקציית הנהג. מהר מזה אין מה לראות.

import { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { subscribeShared, __sharedChannelSize } from './sharedPolling';
import type { LiveTrip } from '../utils/liveTrips';

export const LIVE_TRIPS_POLL_MS = 5_000;

const keyOf = (airfieldId: number) => `trips-live-${airfieldId}`;

async function fetchLive(airfieldId: number): Promise<LiveTrip[] | undefined> {
  try {
    const r = await fetch(`${API_URL}/trips/live?airfield_id=${airfieldId}`);
    if (!r.ok) return undefined;
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    // הרשת נופלת - הרכבים נשארים במקומם האחרון, וסימון "אות אבד" מגיע מהשרת
    // בקריאה הבאה שתצליח. לא מרוקנים את המפה בגלל תקלת רשת.
    return undefined;
  }
}

/** מנוי לנסיעות הפעילות בשדה. מחזיר ביטול מנוי. */
export function subscribeLiveTrips(airfieldId: number, listener: (rows: LiveTrip[]) => void): () => void {
  return subscribeShared<LiveTrip[]>(keyOf(airfieldId), () => fetchLive(airfieldId), LIVE_TRIPS_POLL_MS, listener);
}

export function useLiveTrips(airfieldId: number | null): LiveTrip[] {
  const [rows, setRows] = useState<LiveTrip[]>([]);
  useEffect(() => {
    if (!airfieldId) { setRows([]); return; }
    return subscribeLiveTrips(airfieldId, setRows);
  }, [airfieldId]);
  return rows;
}

/** לבדיקות בלבד */
export function __liveTripsSubscriberCount(airfieldId: number): number {
  return __sharedChannelSize(keyOf(airfieldId));
}

export default useLiveTrips;
