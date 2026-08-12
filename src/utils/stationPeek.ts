// תצוגת עמדות אחרות בעמדה — הלוגיקה הטהורה של הפיצ'ר.
//
// עמדה יכולה להציג בתחתית המסך ריבועים חיים של עמדות אחרות (סרגל התצוגה).
// הרשימה והסדר מוגדרים במסך הניהול (טבלת preset_view_stations), אבל **ההרשאה
// אינה נשמרת שם**: מי שרשאי להיכנס לעמדה במיראז' רשאי לצפות בה. הסינון נעשה מול
// crewMember.approved_workstations שמגיע מ-mirage-login (רשימה ריקה = בלי הגבלה),
// בדיוק כמו סינון רשימת העמדות במסך הכניסה.
//
// כל ריבוע הוא מסגרת (iframe) של האפליקציה עצמה בכתובת ?peek=<presetId>, ולכן
// המסך מוצג במלואו ומתעדכן בזמן אמת בלי לשכפל שורת רינדור אחת (DRY). מצב peek
// גם מגן על העמדה החיה: הוא read-only ולא כותב ל-DB.

export interface ViewStation {
  id: number;
  preset_id: number;
  target_preset_id: number;
  label?: string;
  sort_order?: number;
  target_name?: string;
  target_preset_type?: string;
}

// שם הפרמטר ב-URL שמסמן מסגרת צפייה
export const PEEK_PARAM = 'peek';

// רוחב הריבוע בפיקסלים — שלבי ההקטנה/הגדלה (הכפתורים על הסרגל)
export const TILE_WIDTHS = [150, 200, 260, 340, 440] as const;
export const DEFAULT_TILE_IDX = 1;

// יחס הריבוע — יחס מסך עמדה (16:9), כדי שהמיניאטורה לא תיחתך
export const TILE_ASPECT = 16 / 9;

// מיתון ביצועים: כל ריבוע הוא instance מלא של האפליקציה. במצב צפייה מכפילים את
// מרווחי הפולינג, כדי שארבעה ריבועים לא יכפילו פי-חמישה את העומס על השרת.
export const PEEK_POLL_FACTOR = 3;

const toId = (v: unknown): number => Number(v);

// רשימה ריקה או חסרה = אין הגבלת עמדות במיראז' = כל העמדות מותרות.
// הגבלה שאף עמדה בה לא זוהתה מגיעה מהשרת כ-[-1] ולכן חוסמת הכל.
export function canViewStation(targetPresetId: number, approved?: number[] | null): boolean {
  if (!Array.isArray(approved) || approved.length === 0) return true;
  return approved.some(id => toId(id) === toId(targetPresetId));
}

export function visibleViewStations(stations: ViewStation[], approved?: number[] | null): ViewStation[] {
  if (!Array.isArray(stations)) return [];
  return stations
    .filter(s => canViewStation(s.target_preset_id, approved))
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
}

export function stationLabel(s: ViewStation): string {
  const label = (s.label || '').trim();
  return label || s.target_name || '';
}

export function stepTileIdx(idx: number, delta: number): number {
  const base = Number.isInteger(idx) && idx >= 0 && idx < TILE_WIDTHS.length ? idx : DEFAULT_TILE_IDX;
  return Math.min(TILE_WIDTHS.length - 1, Math.max(0, base + delta));
}

export function tileHeight(width: number): number {
  return Math.round(width / TILE_ASPECT);
}

// ה-URL של מסגרת הצפייה. סביבת העבודה (X-Env) לא נשלחת כאן בכוונה — היא נקראת
// מ-localStorage המשותף ל-origin, ולכן המסגרת עולה באותה סביבה כמו העמדה.
export function peekUrl(presetId: number): string {
  return `/?${PEEK_PARAM}=${presetId}`;
}

export function parsePeekPresetId(search: string): number | null {
  try {
    const raw = new URLSearchParams(search || '').get(PEEK_PARAM);
    const id = Number(raw);
    return raw && Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function isPeekMode(search: string): boolean {
  return parsePeekPresetId(search) != null;
}

// האם המסמך הנוכחי הוא מסגרת צפייה. זו תכונה של הדף כולו ולא של רכיב מסוים,
// ולכן נקראת פעם אחת מה-URL במקום לזלוג כ-prop דרך עשרות רכיבים. שימושיה:
// (1) חסימת כתיבות אוטומטיות ל-DB (רישום איש צוות פעיל, סנכרון מצב שיתופי),
// (2) גארד נגד קינון — עמדה שמוצגת בריבוע לא מציגה סרגל עמדות משלה.
export const IS_PEEK_FRAME: boolean =
  typeof window !== 'undefined' && isPeekMode(window.location?.search || '');

type FetchLike = (input: any, init?: any) => Promise<any>;

// רשת ביטחון לצפייה: במסגרת peek נחסמת כל כתיבה ל-API. אינטראקציה כבר חסומה
// (pointer-events: none על המסגרת), אבל עמדה מריצה גם כתיבות אוטומטיות — למשל
// רישום איש הצוות הפעיל — ואסור שצפייה תשנה משהו בעמדה הנצפית. חוסמים בנקודה
// אחת במקום לבדוק כל אחת מ-149 הכתיבות שב-SectorDashboard.
// התשובה החסומה נראית כמו Response כדי שקוד קורא שבודק res.ok לא יקרוס.
export function peekFetchGuard(orig: FetchLike): FetchLike {
  return (input: any, init?: any) => {
    const method = String(init?.method || (input && typeof input === 'object' ? input.method : '') || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : String(input?.url || '');
    const isApi = url.startsWith('/api');
    if (!isApi || method === 'GET' || method === 'HEAD') return orig(input, init);
    return Promise.resolve({
      ok: false,
      status: 403,
      statusText: 'peek_read_only',
      json: async () => ({ error: 'peek_read_only' }),
      text: async () => '',
    } as any);
  };
}

export function installPeekWriteGuard(): void {
  if (typeof window === 'undefined' || !IS_PEEK_FRAME || (window as any).__btPeekGuarded) return;
  window.fetch = peekFetchGuard(window.fetch.bind(window)) as typeof window.fetch;
  (window as any).__btPeekGuarded = true;
}

// מתחת לסף הזה מדובר בטיימרי תצוגה (שעון שנייתי, אנימציה) ולא בפולינג נתונים
const PEEK_THROTTLE_MIN_MS = 2000;

// מיתון הפולינג במסגרת צפייה. כל ריבוע הוא instance מלא של האפליקציה, ובלי מיתון
// ארבעה ריבועים היו מכפילים פי-חמישה את העומס על השרת. טיימרים מהירים (שעון
// העמדה) נשארים מדויקים — שעה מיושנת בעמדה נצפית היא מידע מטעה.
export function peekIntervalDelay(ms?: number): number | undefined {
  if (typeof ms !== 'number' || ms < PEEK_THROTTLE_MIN_MS) return ms;
  return ms * PEEK_POLL_FACTOR;
}

// נקודה אחת במקום 24 קריאות setInterval פזורות ב-SectorDashboard/GroundView —
// וכך גם כל טיימר שיתווסף בעתיד ממותן אוטומטית במצב צפייה.
export function installPeekPollThrottle(): void {
  if (typeof window === 'undefined' || !IS_PEEK_FRAME || (window as any).__btPeekThrottled) return;
  const orig = window.setInterval.bind(window);
  window.setInterval = ((handler: any, timeout?: number, ...args: any[]) =>
    orig(handler, peekIntervalDelay(timeout) as number, ...args)) as typeof window.setInterval;
  (window as any).__btPeekThrottled = true;
}

// גרירה: מזיזים את draggedId למקומו של targetId וממספרים מחדש את sort_order —
// זה בדיוק מה שנשלח ל-PUT /order, כך שהתצוגה והשרת מסכימים על אותו סדר.
export function reorderStations(list: ViewStation[], draggedId: number, targetId: number): ViewStation[] {
  const from = list.findIndex(s => s.id === draggedId);
  const to = list.findIndex(s => s.id === targetId);
  if (from < 0 || to < 0 || from === to) return list.map((s, i) => ({ ...s, sort_order: i }));
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((s, i) => ({ ...s, sort_order: i }));
}
