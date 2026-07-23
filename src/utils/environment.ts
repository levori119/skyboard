// סביבות תרגול — לוגיקת הסביבה בצד הלקוח. מקור אמת אחד למספר הסביבה הנוכחי,
// שמוזרק בכותרת X-Env לכל בקשת API (ראה src/config.ts / bootstrap). ברירת מחדל 1.
export const ENV_MIN = 1;
export const ENV_MAX = 50;
export const FLYING_MAX = 10; // 1..10 טסות (public משותף), 11..50 תרגול (מבודד)

const STORAGE_KEY = 'bt-env';

export function isFlyingEnv(env: number): boolean {
  return env <= FLYING_MAX;
}

// מנרמל קלט (מספר/מחרוזת) לסביבה חוקית שלמה, או null
export function normalizeEnv(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < ENV_MIN || n > ENV_MAX) return null;
  return n;
}

function readStored(): number {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
    return normalizeEnv(raw) ?? ENV_MIN;
  } catch {
    return ENV_MIN;
  }
}

let current = readStored();

export function getCurrentEnv(): number {
  return current;
}

export function setCurrentEnv(value: number | string): void {
  const n = normalizeEnv(value);
  if (n == null) return; // קלט לא חוקי לא משנה מצב
  current = n;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(STORAGE_KEY, String(n));
  } catch { /* אין sessionStorage (בדיקות/SSR) — נשמר בזיכרון בלבד */ }
}

// האם לתייג בקשה זו בכותרת X-Env — רק קריאות API יחסיות (לא חיצוניות/סטטיות)
export function shouldTagRequest(url: string): boolean {
  return typeof url === 'string' && url.startsWith('/api');
}

export function envHeaderFor(): string {
  return String(current);
}

// עוטף את fetch הגלובלי פעם אחת (ב-bootstrap) כדי להוסיף כותרת X-Env לכל קריאת
// API — כך כל מאות ה-fetch(`${API_URL}/...`) הקיימים נשלחים בהקשר הסביבה הנכון
// בלי לגעת בהם. בקשות חיצוניות/סטטיות נשלחות כרגיל.
export function installEnvFetchInterceptor(): void {
  if (typeof window === 'undefined' || (window as any).__btEnvFetchPatched) return;
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : (input as Request).url;
    if (!shouldTagRequest(url)) return orig(input, init);
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('X-Env', envHeaderFor());
    return orig(input, { ...init, headers });
  };
  (window as any).__btEnvFetchPatched = true;
}
