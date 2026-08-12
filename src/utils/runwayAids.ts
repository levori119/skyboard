// אמצעי נחיתה על המסלול (ILS / LOC / GS / VOR / TACAN)
//
// שתי שכבות נפרדות בכוונה, כמו בשאר מצב המסלול:
//   **הגדרה**  - אילו אמצעים מותקנים בקצה. שייכת לשדה (airfield_runways.aids_a/aids_b),
//                נקבעת בעמדת הניהול ואינה משתנה במהלך משמרת.
//   **סטטוס**  - שמיש / לא שמיש / אחזקה / שמיש מוחרג + הערת החרגה. מידע שדה חי
//                (runway_aid_status), נקבע בעמדה ומשותף לכל מי שרואה את המסלול.
//
// אמצעי שייך ל**קצה נחיתה** ולא למסלול: ה-ILS של 27 וה-ILS של 09 הם התקנות
// נפרדות עם סטטוס נפרד. `end_side` הוא 'a'/'b' - מיקום הקצה בהגדרת המסלול
// (כמו `shorten_end` ב-NOTAM), ולא שם הכיוון, כדי שמסלול מקושר בשדה שכן יתמפה
// לקצה הנכון גם כששמות הכיוונים שונים.

export const RUNWAY_AID_TYPES = ['ILS', 'LOC', 'GS', 'VOR', 'TACAN'] as const;
export type RunwayAidType = typeof RUNWAY_AID_TYPES[number];

export const RUNWAY_AID_STATUSES = ['ok', 'unserviceable', 'maintenance', 'restricted'] as const;
export type RunwayAidStatus = typeof RUNWAY_AID_STATUSES[number];

export type RunwayEndSide = 'a' | 'b';

/** שורת סטטוס כפי שהיא חוזרת מ-/api/runway-aid-status */
export interface RunwayAidStatusRow {
  runway_id: number;
  end_side: string;
  aid_type: string;
  status?: string | null;
  note?: string | null;
}

/** ההגדרה כפי שהיא יושבת על שורת המסלול */
export interface RunwayAidDef {
  id?: number;
  aids_a?: unknown;
  aids_b?: unknown;
}

/** אמצעי מוגדר + הסטטוס שלו - מה שמצויר על המסלול */
export interface RunwayAidMark {
  type: RunwayAidType;
  status: RunwayAidStatus;
  note: string;
}

/**
 * צבע הסטטוס. **צבעי סטטוס אינם מותאמי-תמה** (כמו שאר צבעי הסטטוס במערכת):
 * ירוק = שמיש, אדום = לא שמיש/אחזקה, כתום = שמיש מוחרג.
 * ההבחנה בין "לא שמיש" ל"אחזקה" היא ה-X, לא הצבע - שניהם אדומים לפי האפיון.
 */
const STATUS_COLOR: Record<RunwayAidStatus, string> = {
  ok: '#22c55e',
  unserviceable: '#ef4444',
  maintenance: '#ef4444',
  restricted: '#f59e0b',
};

/** מפתחות ה-registry לשמות הסטטוסים - הטקסט חי ב-i18n ולא כאן */
export const AID_STATUS_KEY: Record<RunwayAidStatus, string> = {
  ok: 'shared.aidStatusOk',
  unserviceable: 'shared.aidStatusUnserviceable',
  maintenance: 'shared.aidStatusMaintenance',
  restricted: 'shared.aidStatusRestricted',
};

const TYPE_SET = new Set<string>(RUNWAY_AID_TYPES);
const STATUS_SET = new Set<string>(RUNWAY_AID_STATUSES);

/** סטטוס לא מוכר / חסר = שמיש. אמצעי מוגדר בלי דיווח הוא תקין. */
export function normalizeAidStatus(status?: string | null): RunwayAidStatus {
  const s = String(status ?? '').trim().toLowerCase();
  return STATUS_SET.has(s) ? (s as RunwayAidStatus) : 'ok';
}

export const aidStatusColor = (status?: string | null): string =>
  STATUS_COLOR[normalizeAidStatus(status)];

/** רק "לא שמיש" מקבל X. אחזקה אדומה בלי X. */
export const aidStatusCrossed = (status?: string | null): boolean =>
  normalizeAidStatus(status) === 'unserviceable';

/** ההחרגה היא היחידה שההערה שלה נושאת מידע תפעולי - ולכן נדרש HINT */
export const aidStatusNeedsNote = (status?: string | null): boolean =>
  normalizeAidStatus(status) === 'restricted';

/**
 * רשימת האמצעים מתוך ההגדרה. מקבלת מערך (JSONB), מחרוזת JSON או רשימה מופרדת
 * בפסיקים - השדה חוזר מ-`pg` באחת מהצורות האלה תלוי בטיפוס העמודה ובגרסה.
 * סדר ההגדרה נשמר (הוא סדר התצוגה), וכפילויות מוסרות.
 */
export function parseAidList(value: unknown): RunwayAidType[] {
  let raw: unknown[] = [];
  if (Array.isArray(value)) raw = value;
  else if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try { const parsed = JSON.parse(s); raw = Array.isArray(parsed) ? parsed : []; }
      catch { raw = []; }
    } else raw = s.split(',');
  }
  const out: RunwayAidType[] = [];
  for (const item of raw) {
    const code = String(item ?? '').trim().toUpperCase();
    if (TYPE_SET.has(code) && !out.includes(code as RunwayAidType)) out.push(code as RunwayAidType);
  }
  return out;
}

/** האמצעים המוגדרים לקצה מסוים של המסלול */
export const aidsForEnd = (rw: RunwayAidDef | null | undefined, side: RunwayEndSide): RunwayAidType[] =>
  parseAidList(side === 'a' ? rw?.aids_a : rw?.aids_b);

/**
 * האמצעים של הקצה עם הסטטוס שלהם. **ההגדרה קובעת מה מוצג**: שורת סטטוס לאמצעי
 * שכבר אינו מוגדר (הוסר בעמדת הניהול) נופלת, ואמצעי מוגדר בלי שורת סטטוס מוצג
 * כשמיש - כך שאין "אמצעי רפאים" ואין אמצעי שנעלם כי איש לא דיווח עליו.
 */
export function aidMarksForEnd(
  rw: (RunwayAidDef & { id?: number }) | null | undefined,
  side: RunwayEndSide,
  statuses: RunwayAidStatusRow[] = [],
): RunwayAidMark[] {
  const runwayId = Number(rw?.id);
  const byType = new Map<string, RunwayAidStatusRow>();
  for (const row of statuses) {
    if (Number(row.runway_id) !== runwayId) continue;
    if (String(row.end_side ?? '').trim().toLowerCase() !== side) continue;
    byType.set(String(row.aid_type ?? '').trim().toUpperCase(), row);
  }
  return aidsForEnd(rw, side).map(type => {
    const row = byType.get(type);
    return {
      type,
      status: normalizeAidStatus(row?.status),
      note: String(row?.note ?? '').trim(),
    };
  });
}

/** האם יש בקצה אמצעי שאינו שמיש - לסימון מרוכז (נקודה על הכרטיס, סיכום) */
export const anyAidDegraded = (marks: RunwayAidMark[]): boolean =>
  marks.some(m => m.status !== 'ok');
