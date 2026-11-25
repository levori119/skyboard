// אובייקטים על מפה - מטמון פר-מפה לעמדה. ראה MAP_OBJECTS_SPEC.md.
//
// למה חנות במודול ולא state ב-SectorDashboard: מספר המפות על המסך נקבע בזמן
// ריצה (מפה יחידה, דו-מפה, חלונות מפה בדסק משימה), ופונקציית הציור של המפה
// אינה יכולה לקרוא ל-hook לכל מפה. כאן הציור פשוט שואל "מה יש במפה X", והשאלה
// עצמה מתחילה טעינה כשאין עדיין תשובה או שהיא ישנה.
//
// האובייקטים הם **הגדרה** שמשתנה לעתים רחוקות (במסך הניהול), ולכן מספיק
// רענון פעם בדקה ולא פולינג צפוף.

import { useEffect, useSyncExternalStore } from 'react';
import { API_URL } from '../config';
import { normalizeMapObject, sortMapObjects, type MapObject } from '../utils/mapObjects';

const TTL_MS = 60_000;
const EMPTY: MapObject[] = [];

type Entry = { objects: MapObject[]; at: number; inflight: boolean };
const entries = new Map<number, Entry>();
let version = 0;
const listeners = new Set<() => void>();
const notify = () => { version++; listeners.forEach(l => l()); };

async function load(mapId: number) {
  const prev = entries.get(mapId);
  entries.set(mapId, { objects: prev?.objects ?? EMPTY, at: prev?.at ?? 0, inflight: true });
  try {
    const res = await fetch(`${API_URL}/maps/${mapId}/objects`);
    const rows = res.ok ? await res.json() : null;
    const objects = Array.isArray(rows) ? sortMapObjects(rows.map(normalizeMapObject)) : (prev?.objects ?? EMPTY);
    entries.set(mapId, { objects, at: Date.now(), inflight: false });
  } catch {
    // אין רשת: נשארים עם מה שהיה, ומנסים שוב בעוד TTL
    entries.set(mapId, { objects: prev?.objects ?? EMPTY, at: Date.now(), inflight: false });
  }
  notify();
}

/**
 * האובייקטים של המפה (ממוינים לסדר ציור). קריאה ראשונה או אחרי TTL מתחילה
 * טעינה ברקע ומחזירה בינתיים את מה שיש - הרכיב מתרנדר כשהטעינה מסתיימת.
 */
export function readMapObjects(mapId: number | null | undefined): MapObject[] {
  const id = Number(mapId);
  if (!Number.isInteger(id) || id <= 0) return EMPTY;
  const e = entries.get(id);
  if (!e || (!e.inflight && Date.now() - e.at > TTL_MS)) void load(id);
  return e?.objects ?? EMPTY;
}

/** לאחר עריכה בעורך: הקריאה הבאה תטען מחדש מהשרת. */
export function invalidateMapObjects(mapId?: number) {
  if (mapId == null) entries.clear();
  else entries.delete(Number(mapId));
  notify();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getVersion = () => version;

/**
 * מנוי לחנות: הרכיב מתרנדר כשטעינה מסתיימת, ופעם בדקה - כדי שקריאת
 * `readMapObjects` תרענן אובייקטים ששונו בניהול גם במסך שלא מתרנדר מעצמו.
 */
export function useMapObjectsStore() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  useEffect(() => {
    const t = setInterval(notify, TTL_MS);
    return () => clearInterval(t);
  }, []);
  return readMapObjects;
}
