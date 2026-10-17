// ─── טבלת האייקונים של מוד הטבלה - חנות אחת בצד הלקוח ─────────────────────────
// אותה טבלה משרתת את הניהול (העלאה, בחירה במיפוי העמודה) ואת העמדה (ציור
// האייקון בתא). נטענת פעם אחת ברמת המודול, כמו קטלוג השדות, ומי שמשנה אותה
// בניהול מרענן את כל הצרכנים בבת אחת.
import { useEffect, useSyncExternalStore } from 'react';
import { API_URL } from '../config';

export interface DisplayIconRow { id: number; name: string; image_data: string }

let icons: DisplayIconRow[] = [];
let loaded = false;
const listeners = new Set<() => void>();
let inFlight: Promise<DisplayIconRow[]> | null = null;

const publish = (next: DisplayIconRow[]) => {
  icons = next;
  loaded = true;
  listeners.forEach(l => l());
};

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => icons;

export function loadDisplayIcons(force = false): Promise<DisplayIconRow[]> {
  if (!force && loaded) return Promise.resolve(icons);
  if (inFlight) return inFlight;
  inFlight = fetch(`${API_URL}/display-icons`)
    .then(r => (r.ok ? r.json() : []))
    .then((list: DisplayIconRow[]) => { publish(Array.isArray(list) ? list : []); return icons; })
    .catch(() => icons)
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** הוספה/עדכון/מחיקה בניהול - ואז רענון החנות */
export async function saveDisplayIcon(icon: { id?: number; name: string; image_data?: string }): Promise<boolean> {
  const url = icon.id ? `${API_URL}/display-icons/${icon.id}` : `${API_URL}/display-icons`;
  const r = await fetch(url, {
    method: icon.id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: icon.name, image_data: icon.image_data }),
  });
  await loadDisplayIcons(true);
  return r.ok;
}

export async function deleteDisplayIcon(id: number): Promise<void> {
  await fetch(`${API_URL}/display-icons/${id}`, { method: 'DELETE' });
  await loadDisplayIcons(true);
}

/** האייקונים שהועלו. `enabled=false` - לא טוען (מוד טבלה בלי עמודת אייקון) */
export function useDisplayIcons(enabled = true): DisplayIconRow[] {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { if (enabled) loadDisplayIcons(); }, [enabled]);
  return list;
}

export function displayIconById(list: DisplayIconRow[], id: string | number): DisplayIconRow | null {
  return list.find(i => String(i.id) === String(id)) || null;
}
