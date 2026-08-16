// ─── קטלוג השדות המותאמים - מקור אחד בצד הלקוח ───────────────────────────────
// אותו קטלוג משרת שלושה צרכנים: עורך הסטריפ (הצבת שדה במשבצת), מוד הטבלה
// (בחירת עמודה), והעמדה (ציור הפקד וקריאת ערכו). לכן הוא נטען פעם אחת לחנות
// ברמת המודול, ולא בכל מסך מחדש - ומי שמשנה הגדרה מרענן את כולם בבת אחת.
//
// רישום השדות הגלובליים ב-Query Builder נעשה כאן, כדי ששדה חדש יהיה זמין
// לסינון באותו רגע שבו הוא נוצר, בלי שאף מסך יצטרך לזכור לעשות זאת.

import { useSyncExternalStore } from 'react';
import { API_URL } from '../config';
import type { StripControl } from '../types/stripControls';
import { globalControls, catalogByKey } from './stripControls';
import { setStripControlRegistry } from './queryBuilder';

let catalog: StripControl[] = [];
let byKey: Record<string, StripControl> = {};
const listeners = new Set<() => void>();
let inFlight: Promise<StripControl[]> | null = null;

const publish = (next: StripControl[]) => {
  catalog = next;
  byKey = catalogByKey(next);
  setStripControlRegistry(globalControls(next));
  listeners.forEach(l => l());
};

export const getStripFieldCatalog = (): StripControl[] => catalog;
export const getStripFieldByKey = (): Record<string, StripControl> => byKey;

export function subscribeStripFieldCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** טעינה מהשרת. קריאות מקבילות מתאחדות לבקשה אחת */
export function loadStripFieldCatalog(force = false): Promise<StripControl[]> {
  if (!force && catalog.length) return Promise.resolve(catalog);
  if (inFlight) return inFlight;
  inFlight = fetch(`${API_URL}/strip-field-defs`)
    .then(r => (r.ok ? r.json() : []))
    .then((list: StripControl[]) => {
      publish(Array.isArray(list) ? list : []);
      return catalog;
    })
    .catch(() => catalog)
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** יצירת שדה. המפתח נקבע בשרת ואינו נשלח מכאן */
export async function createStripField(def: Partial<StripControl>): Promise<StripControl | null> {
  const r = await fetch(`${API_URL}/strip-field-defs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(def),
  });
  if (!r.ok) return null;
  const created: StripControl = await r.json();
  publish([...catalog, created]);
  return created;
}

export async function updateStripField(def: StripControl): Promise<StripControl | null> {
  const r = await fetch(`${API_URL}/strip-field-defs/${def.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(def),
  });
  if (!r.ok) return null;
  const saved: StripControl = await r.json();
  publish(catalog.map(f => (f.key === saved.key ? saved : f)));
  return saved;
}

export async function deleteStripField(def: StripControl): Promise<boolean> {
  const r = await fetch(`${API_URL}/strip-field-defs/${def.id}`, { method: 'DELETE' });
  if (!r.ok) return false;
  publish(catalog.filter(f => f.key !== def.key));
  return true;
}

/** הקטלוג כמצב React. טוען בעצמו בפעם הראשונה שמסך כלשהו מבקש אותו */
export function useStripFieldCatalog(): StripControl[] {
  const list = useSyncExternalStore(subscribeStripFieldCatalog, getStripFieldCatalog, getStripFieldCatalog);
  if (!catalog.length && !inFlight) void loadStripFieldCatalog();
  return list;
}
