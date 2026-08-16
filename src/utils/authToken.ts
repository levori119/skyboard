// אסימון ההזדהות בצד הלקוח - הצד השני של SK-01.
//
// עיקרון הרכיב המשותף: היירוט הזה הוא **המקום היחיד** שמצרף את האסימון. יש
// מאות קריאות `fetch(`${API_URL}/...`)` בקוד, ו-helper שקוראים לו ידנית היה
// מחייב לגעת בכולן ולהשאיר את מי שנשכח בלי אסימון - כלומר בלי גישה, וגרוע
// מכך: לגרום למישהו "לתקן" את זה בעתיד בפתיחת נתיב בשרת. אותו שיקול בדיוק
// כמו ביירוט הסביבה (utils/environment.ts) ובעמידות בנתק (offline/apiFetch.ts).
//
// למה sessionStorage ולא localStorage: עמדת בקרה משותפת. סגירת הדפדפן חייבת
// לנתק, ולא להשאיר זהות פתוחה למשמרת הבאה.

const TOKEN_KEY = 'bt-auth-token';
const EXPIRES_KEY = 'bt-auth-expires';

let current: string | null = null;
let expiresAt = 0;

const read = () => {
  try {
    if (typeof sessionStorage === 'undefined') return;
    current = sessionStorage.getItem(TOKEN_KEY);
    expiresAt = Number(sessionStorage.getItem(EXPIRES_KEY) || 0);
  } catch { /* אין sessionStorage (בדיקות) - זיכרון בלבד */ }
};
read();

/** מחזיר את האסימון, או null אם אין או שפג תוקפו. */
export function getAuthToken(): string | null {
  // בדיקת התוקף גם בלקוח: אין טעם לשלוח בקשה שידוע שתיפסל, והמסך יכול
  // להחזיר את המשתמש להזדהות מיד. השרת הוא זה שאוכף בפועל.
  if (current && expiresAt && Date.now() >= expiresAt) clearAuthToken();
  return current;
}

export function setAuthToken(token: string, expiresInMs?: number): void {
  current = token;
  expiresAt = expiresInMs ? Date.now() + expiresInMs : 0;
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(TOKEN_KEY, token);
    if (expiresAt) sessionStorage.setItem(EXPIRES_KEY, String(expiresAt));
  } catch { /* זיכרון בלבד */ }
}

export function clearAuthToken(): void {
  current = null;
  expiresAt = 0;
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRES_KEY);
  } catch { /* זיכרון בלבד */ }
}

/** האם לצרף אסימון לבקשה זו - רק קריאות API יחסיות, כמו ביירוט הסביבה. */
export function shouldAttachToken(url: string): boolean {
  return typeof url === 'string' && url.startsWith('/api');
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/**
 * נרשם ע"י App: מה לעשות כשהשרת מחזיר 401 (אסימון פג / בוטל / השרת עלה מחדש
 * בלי AUTH_SECRET קבוע). ההתנהגות הנכונה בעמדה תפעולית היא לחזור למסך
 * ההזדהות ולא להשאיר מסך שקט שמפסיק להתעדכן - בקר חייב לדעת.
 */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  onUnauthorized = fn;
}

let notifying = false;
function notifyUnauthorized() {
  if (notifying || !onUnauthorized) return;
  // נעילה קצרה: עשרות קריאות polling מקבילות היו מפעילות את המטפל עשרות פעמים
  notifying = true;
  try { onUnauthorized(); } finally { setTimeout(() => { notifying = false; }, 1000); }
}

/**
 * מתקין את היירוט. חייב לרוץ **לפני** יירוט הסביבה ויירוט הנתק, כדי שהאסימון
 * יהיה על הבקשה גם כשהיא משודרת מחדש מה-outbox אחרי נתק.
 */
export function installAuthFetchInterceptor(): void {
  if (typeof window === 'undefined' || (window as any).__btAuthFetchPatched) return;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.pathname
      : (input as Request).url;
    if (!shouldAttachToken(url)) return orig(input, init);

    const token = getAuthToken();
    let res: Response;
    if (token) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('Authorization', `Bearer ${token}`);
      res = await orig(input, { ...init, headers });
    } else {
      res = await orig(input, init);
    }
    if (res.status === 401) { clearAuthToken(); notifyUnauthorized(); }
    return res;
  };
  (window as any).__btAuthFetchPatched = true;
}
