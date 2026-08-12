// עמידות בנתק — שכבת אחסון מקומי בעמדה.
//
// למה IndexedDB ולא localStorage:
//   1. נפח — כתבי יד, aircraft_positions ותמונות מפה חורגים מ-5MB.
//   2. localStorage **סינכרוני** וחוסם את ה-UI thread. במסך בקרה שמצייר פ"מים
//      בזמן אמת, כתיבה חוסמת של מאות KB בכל poll היא תקלה תפעולית.
//
// הממשק מופשט (OfflineStore) כדי שהלוגיקה תיבדק מול מימוש בזיכרון, בלי
// להוסיף תלות חיצונית — הפרויקט נפרס לרשת מבודדת וכל dependency היא נטל
// בשרשרת האספקה.

export interface StoredEntry<T = unknown> {
  value: T;
  savedAt: number;
}

export interface OfflineStore {
  get<T>(key: string): Promise<StoredEntry<T> | undefined>;
  set<T>(key: string, value: T, savedAt: number): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

// ── מימוש בזיכרון (בדיקות, ודפדפן ללא IndexedDB) ──────────────────────────────

export function createMemoryStore(): OfflineStore {
  const map = new Map<string, StoredEntry>();
  return {
    async get<T>(key: string) { return map.get(key) as StoredEntry<T> | undefined; },
    async set<T>(key: string, value: T, savedAt: number) { map.set(key, { value, savedAt }); },
    async del(key: string) { map.delete(key); },
    async keys() { return [...map.keys()]; },
    async clear() { map.clear(); },
  };
}

// ── מימוש IndexedDB ───────────────────────────────────────────────────────────

const DB_NAME = 'skyking-offline';
const DB_VERSION = 1;
export const CACHE_STORE = 'api-cache';
export const OUTBOX_STORE = 'outbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function run<T>(storeName: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(d => new Promise<T>((resolve, reject) => {
    const tx = d.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }));
}

/** האם לדפדפן הנוכחי יש IndexedDB זמין (לא קיים ב-jsdom/בדיקות). */
export function hasIndexedDb(): boolean {
  try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch { return false; }
}

export function createIdbStore(storeName: string): OfflineStore {
  return {
    get: <T,>(key: string) => run<StoredEntry<T> | undefined>(storeName, 'readonly', s => s.get(key)),
    set: <T,>(key: string, value: T, savedAt: number) =>
      run<void>(storeName, 'readwrite', s => s.put({ value, savedAt } as StoredEntry<T>, key)),
    del: (key: string) => run<void>(storeName, 'readwrite', s => s.delete(key)),
    keys: () => run<string[]>(storeName, 'readonly', s => s.getAllKeys() as IDBRequest)
      .then(ks => (ks as unknown as IDBValidKey[]).map(String)),
    clear: () => run<void>(storeName, 'readwrite', s => s.clear()),
  };
}

/**
 * בוחר את המימוש הזמין. נפילה לזיכרון אינה שקטה מבחינת התנהגות: המערכת
 * עדיין עובדת, אבל ה-cache לא שורד רענון — לכן נרשמת אזהרה בקונסול.
 */
export function createStore(storeName: string): OfflineStore {
  if (hasIndexedDb()) {
    try { return createIdbStore(storeName); } catch { /* נופלים לזיכרון */ }
  }
  console.warn(`[offline] IndexedDB לא זמין — ${storeName} נשמר בזיכרון בלבד ולא ישרוד רענון`);
  return createMemoryStore();
}
