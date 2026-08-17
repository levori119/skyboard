// מזהה העמדה לצורך מחסנית הביטול (CTRL+Z) — הצד הלקוחי של UNDO_SPEC.md §2.
//
// המחסנית היא **פר-עמדה** ולא פר-משתמש: אותו בקר שיושב בשתי עמדות מקבל שתי
// מחסניות נפרדות, כי CTRL+Z בעמדה אחת לא אמור להחזיר לאחור מה שנעשה בשנייה.
//
// למה sessionStorage: אותו שיקול כמו באסימון ההזדהות. הוא שורד ריענון דף
// ונפילת עמדה (מקרה 16 במטריצה), אבל סגירת הדפדפן פותחת מחסנית חדשה — משמרת
// חדשה לא יורשת פעולות לביטול מהמשמרת שלפניה.
//
// היירוט הוא **המקום היחיד** שמצרף את הכותרת, בדיוק כמו יירוט האסימון
// (utils/authToken.ts) ויירוט הסביבה (utils/environment.ts). helper שקוראים לו
// ידנית היה מחייב לגעת ב-748 קריאות fetch, ולהשאיר את מי שנשכח בלי ביטול.

const KEY = 'bt-station-key';
/** אותו שם כותרת כמו ב-server/middleware/actionContext.js */
export const STATION_HEADER = 'X-Station';

let current: string | null = null;

/** מזהה אקראי גם בלי הקשר מאובטח — בסיס על רשת פנימית מוגש ב-http. */
function newKey(): string {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : null;
  return uuid || `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getStationKey(): string {
  if (current) return current;
  try {
    current = sessionStorage.getItem(KEY);
  } catch { /* אין sessionStorage (בדיקות) — זיכרון בלבד */ }
  if (!current) {
    current = newKey();
    try { sessionStorage.setItem(KEY, current); } catch { /* זיכרון בלבד */ }
  }
  return current;
}

/** האם לתייג בקשה זו — רק קריאות API יחסיות, כמו בשני היירוטים האחרים. */
export function shouldTagRequest(url: string): boolean {
  return typeof url === 'string' && url.startsWith('/api');
}

export function installStationFetchInterceptor(): void {
  if (typeof window === 'undefined' || (window as any).__btStationFetchPatched) return;
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.pathname
      : (input as Request).url;
    if (!shouldTagRequest(url)) return orig(input, init);
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set(STATION_HEADER, getStationKey());
    return orig(input, { ...init, headers });
  };
  (window as any).__btStationFetchPatched = true;
}
