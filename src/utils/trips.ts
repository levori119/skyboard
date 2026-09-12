// ניהול נסיעות - הנגזרות של הנסיעה במקום אחד.
//
// הכלל כאן זהה ל-permitStatus.ts: **השרת אינו מחשב** סטטוס, אייקון מוצע או
// "האם להתריע" - הוא שומר את מה שהוזן ואת חותמות הזמן, והנגזרת חיה כאן בלבד.
// כך הפקח רואה את האייקון והסטטוס משתנים בטופס לפני השמירה, ואין מימוש שני
// בשרת שיתפצל בשקט.
//
// הסטטוס עצמו הוא **הכרעה של המגדל** ולא נגזרת של תאריכים: "יש אישור" נאמר
// על ידי אדם. מה שכן נגזר הוא חלון ההתראה - מתי הרכב עולה על המפה ומתי
// קופצת ההתראה המתפרצת.

/** ארבעת סטטוסי הנסיעה. הסדר = סדר ההצגה בתפריט. */
export const TRIP_STATUSES = ['approved', 'not_approved', 'pending', 'ended'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_STATUS_COLOR: Record<TripStatus, string> = {
  approved: '#22c55e',
  not_approved: '#ef4444',
  pending: '#f59e0b',
  ended: '#94a3b8',
};

/** מפתח ה-i18n של הסטטוס - הטקסט עצמו חי ב-registry, לא כאן. */
export const tripStatusKey = (s: TripStatus): string =>
  `trips.status${s.charAt(0).toUpperCase()}${s.slice(1).replace(/_(\w)/g, (_, c) => c.toUpperCase())}`;

/** סטטוס לא מוכר (שורה ישנה, כתיבה מבחוץ) נקרא כ"ממתין" ולא מפיל תצוגה. */
export const asTripStatus = (v: unknown): TripStatus =>
  (TRIP_STATUSES as readonly string[]).includes(String(v)) ? (v as TripStatus) : 'pending';

/**
 * כמה דקות לפני היציאה המשוערת הרכב עולה על המפה וקופצת ההתראה.
 * מספר אחד, כי שני מספרים נפרדים היו נפרדים בשינוי הראשון.
 */
export const DEPARTURE_ALERT_MINUTES = 10;

/**
 * אחרי כמה שעות נסיעה שלא סומנה כהסתיימה יורדת מהמפה.
 *
 * בלי גבול תחתון, נסיעה משבוע שעבר שאיש לא סגר נשארת על המפה לנצח ומרעישה
 * את התמונה. הגבול אינו "הנסיעה הסתיימה" - הוא רק מפסיק להציג אותה.
 */
export const STALE_TRIP_HOURS = 12;

/**
 * כמה דקות אחרי שהנהג פעל (אישר / ביקש לשנות) ההתראה עדיין **מתפרצת**.
 *
 * בלי גבול, אישור מלפני שלושה ימים קופץ בכל פתיחת עמדה. הבקשה עצמה אינה
 * נעלמת: היא ממשיכה להיות מסומנת בחלון "ניהול נסיעות" עד שהמגדל מכריע בה -
 * מה שחולף הוא רק ה**התפרצות**.
 */
export const DRIVER_ACTION_ALERT_MINUTES = 30;

const MS_PER_MIN = 60_000;

/** האם חותמת הזמן טרייה מספיק כדי להצדיק התראה מתפרצת. */
export function isDriverActionFresh(ts: string | null | undefined, now: number = Date.now()): boolean {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t <= DRIVER_ACTION_ALERT_MINUTES * MS_PER_MIN && now - t >= -MS_PER_MIN;
}

/** דקות עד היציאה המשוערת. שלילי = היציאה כבר עברה. null = אין זמן מתוכנן. */
export function minutesUntilDeparture(scheduledAt: string | null | undefined, now: number = Date.now()): number | null {
  if (!scheduledAt) return null;
  const t = new Date(scheduledAt).getTime();
  if (!Number.isFinite(t)) return null;
  return (t - now) / MS_PER_MIN;
}

export interface TripTiming {
  scheduled_at?: string | null;
  status?: string | null;
  ended_at?: string | null;
}

/**
 * האם הרכב מוצג ליד נקודת המוצא.
 *
 * החלון נפתח 10 דקות לפני היציאה ו**אינו נסגר בשעת היציאה**: נסיעה שאיחרה היא
 * בדיוק זו שהפקח צריך לראות. הוא נסגר כשהנסיעה מסתיימת - אז אין מה להציג.
 */
export function isVehicleOnMap(trip: TripTiming, now: number = Date.now()): boolean {
  if (asTripStatus(trip.status) === 'ended') return false;
  const mins = minutesUntilDeparture(trip.scheduled_at, now);
  if (mins === null) return false;
  return mins <= DEPARTURE_ALERT_MINUTES && mins >= -STALE_TRIP_HOURS * 60;
}

/**
 * האם להקפיץ עכשיו את התראת תחילת הנסיעה.
 *
 * `departure_alerted_at` מסומן בשרת ברגע שההתראה הוקפצה, כדי שהיא תעלה **פעם
 * אחת** ולא בכל poll. בלי זה הפקח מקבל את אותה התראה כל עשר שניות ולומד
 * להתעלם ממנה - וזה בדיוק מה שהתראה מתפרצת לא יכולה להרשות לעצמה.
 */
export function isDepartureAlertDue(
  trip: TripTiming & { departure_alerted_at?: string | null },
  now: number = Date.now(),
): boolean {
  if (trip.departure_alerted_at) return false;
  return isVehicleOnMap(trip, now);
}

// ── אייקון הרכב ──────────────────────────────────────────────────────────────

/** האייקונים שמוצעים בבורר. הראשון הוא גם ברירת המחדל. */
export const TRIP_VEHICLE_ICONS = [
  '🚗', '🚙', '🚐', '🚚', '🚛', '🚌', '🚑', '🚒', '🚓', '🚜', '🏍️', '🛻', '⛽', '🏗️', '🚧', '🛺',
];

/** שם סוג רכב -> אייקון. עברית ואנגלית, כי סוגי הרכב נערכים חופשית בניהול. */
const ICON_BY_KEYWORD: [RegExp, string][] = [
  [/אמבולנס|מד"?א|ambulance/i, '🚑'],
  [/כבא|כיבוי|אש|fire/i, '🚒'],
  [/משטר|מ"?צ|police/i, '🚓'],
  [/אוטובוס|הסע(?:ה|ות)|bus/i, '🚌'],
  [/מיניבוס|ואן|מסחרי|van|minibus/i, '🚐'],
  [/משאית|מוביל|truck|lorry/i, '🚚'],
  [/סמיטריילר|נגרר|trailer|semi/i, '🚛'],
  [/טנדר|פיק ?אפ|pickup/i, '🛻'],
  [/טרקטור|חקלא|tractor/i, '🚜'],
  [/אופנוע|קטנוע|motorcycle|scooter/i, '🏍️'],
  [/מנוף|במה|crane/i, '🏗️'],
  [/דלק|תדלוק|fuel|refuel/i, '⛽'],
  [/תחזוק|עבודות|maintenance|works/i, '🚧'],
  [/גולף|קלנוע|golf|cart/i, '🛺'],
  [/ג'?יפ|שטח|4x4|jeep/i, '🚙'],
];

/** האייקון **המוצע** לפי סוג הרכב. אינו נשמר - כדי שישתנה אם הסוג משתנה. */
export function suggestedVehicleIcon(vehicleTypeName?: string | null): string {
  const name = String(vehicleTypeName ?? '').trim();
  if (name) {
    for (const [re, icon] of ICON_BY_KEYWORD) if (re.test(name)) return icon;
  }
  return TRIP_VEHICLE_ICONS[0];
}

/** האייקון בפועל: דריסה ידנית אם נבחרה, אחרת המוצע. */
export const tripIcon = (trip: { icon?: string | null; vehicle_type_name?: string | null }): string =>
  String(trip.icon ?? '').trim() || suggestedVehicleIcon(trip.vehicle_type_name);

// ── נתיב הנסיעה ──────────────────────────────────────────────────────────────
//
// המודל מריץ את אותו חישוב בכמה רמות הרשאה, ולעתים קרובות **כולן מחזירות את
// אותו נתיב פיזי** - בשדה שבו אין דרך חלופית. שלוש שורות זהות ברשימה אינן
// בחירה אלא רעש, ובמצב שבו כולן מסומנות אי אפשר בכלל לדעת מה אושר לנהג.

export interface RouteOptionLike {
  /** רמת ההרשאה ששימשה לחישוב */
  key: string;
  /** מזהי המסלולים שהנתיב עובר בהם */
  route_ids: number[];
  label: string;
  dist_m: number;
  crossings: number;
}

/**
 * זהות הנתיב: המסלולים שהוא עובר בהם, ואחריהם התיאור.
 *
 * המסלולים לבדם אינם מספיקים - נתיב שכולו על צמתים וירטואליים מחזיר רשימה
 * ריקה, ואז **כל** האפשרויות נראות זהות ומסומנות יחד. זה בדיוק מה שנראה
 * בשטח: שלושה נתיבים, שלושה סימני ✓.
 */
export const routeSignature = (o: Pick<RouteOptionLike, 'route_ids' | 'label'>): string =>
  `${(o.route_ids || []).join(',')}|${o.label || ''}`;

/** האם אפשרות זו היא שנבחרה בפועל. בחירה ריקה = אף אחת, ולא "הכול". */
export const isRouteChosen = (o: Pick<RouteOptionLike, 'route_ids' | 'label'>, chosenSig: string): boolean =>
  chosenSig !== '' && routeSignature(o) === chosenSig;

/**
 * מאחד אפשרויות שמובילות לאותו נתיב פיזי, וממיין מהקצר לארוך.
 *
 * המאוחדת נושאת את **רמת ההרשאה הנמוכה ביותר** שמגיעה לנתיב (הראשונה שנמצאה,
 * ולכן סדר הקלט הוא חלק מהנכונות), ואת רשימת הרמות ב-`keys` - כדי שהמסך יוכל
 * לומר שאין הבדל ביניהן ולא להשאיר את הפקח תוהה למה יש רק שורה אחת.
 */
export function dedupeRouteOptions<T extends RouteOptionLike>(options: T[]): (T & { keys: string[] })[] {
  const bySig = new Map<string, T & { keys: string[] }>();
  for (const o of options || []) {
    const sig = routeSignature(o);
    const seen = bySig.get(sig);
    if (seen) seen.keys.push(o.key);
    else bySig.set(sig, { ...o, keys: [o.key] });
  }
  return [...bySig.values()].sort((a, b) => a.dist_m - b.dist_m);
}

/**
 * חתימת הקלט של חישוב הנתיב: **מוצא, תחנות הביניים ויעד**, בסדר הנסיעה.
 *
 * כל שינוי בה מחייב חישוב מחדש - נתיב שחושב למוצא אחר או בלי תחנה שנוספה
 * אינו הנסיעה שהפקח מאשר. תחנה בטקסט חופשי אינה נכנסת: אין לה נ"צ, ולכן
 * אינה משנה את החישוב.
 */
export function routeInputSignature(d: {
  from_point_id?: string | number | null;
  to_point_id?: string | number | null;
  stops?: { point_id: number | null }[];
}): string {
  const via = (d.stops || []).map(s => s.point_id).filter(Boolean).join(',');
  return `${d.from_point_id || ''}>${via}>${d.to_point_id || ''}`;
}

/**
 * האם מותר לסמן את הנסיעה כ"יש אישור".
 *
 * חושבו נתיבים ולא נבחר אחד = **אין מה לאשר לנהג**. הפקח רואה אישור, הנהג
 * אינו מקבל נתיב, ואיש אינו יודע על איזו דרך הוסכם.
 */
export const canApproveTrip = (status: TripStatus, hasOptions: boolean, chosenSig: string): boolean =>
  status !== 'approved' || !hasOptions || chosenSig !== '';

// ── שכפול נסיעה ──────────────────────────────────────────────────────────────
//
// אותה נסיעה חוזרת על עצמה - אותו רכב, אותו נהג, אותו מסלול, יום אחר. שכפול
// חוסך הקלדה מחדש של טופס שלם, ו**שכפול קבוצתי** מעביר יום שלם של נסיעות
// קדימה בפעולה אחת.

/**
 * כמה עותקים מותר ליצור בפעולה אחת. הגבול אינו טכני אלא תפעולי: מי שמבקש
 * מאה עותקים כנראה טעה בהקלדה, וגילוי הטעות אחרי היצירה יקר ממניעתה.
 */
export const MAX_TRIP_COPIES = 20;

export const clampCopies = (n: unknown): number => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_TRIP_COPIES, Math.max(1, v)) : 1;
};

/**
 * מועד היציאה של עותק.
 *
 * `targetDate` (YYYY-MM-DD) מעביר את הנסיעה ליום אחר **ושומר את שעת היציאה
 * שלה**. זה הדבר הנכון תפעולית ("כל נסיעות היום, מחר") וגם היחיד שנכון מול
 * שעון קיץ: הזזה של 1440 דקות חוצה מעבר שעון ומזיזה את השעה בשעה, בעוד בנייה
 * מחדש של התאריך המקומי עם אותה שעה נשארת נכונה.
 *
 * `intervalMinutes` הוא המרווח בין עותק לעותק, לנסיעה שחוזרת כמה פעמים באותו
 * יום. נסיעה בלי מועד נשארת בלי מועד - עותק אינו המקום להמציא לה אחד.
 */
export function duplicateSchedule(
  origIso: string | null | undefined,
  targetDate: string,
  copyIndex = 0,
  intervalMinutes = 0,
): string | null {
  if (!origIso) return null;
  const d = new Date(origIso);
  if (!Number.isFinite(d.getTime())) return null;
  let base = d;
  if (targetDate) {
    const p2 = (n: number) => String(n).padStart(2, '0');
    const moved = new Date(`${targetDate}T${p2(d.getHours())}:${p2(d.getMinutes())}`);
    if (!Number.isFinite(moved.getTime())) return null;
    base = moved;
  }
  const shifted = new Date(base.getTime() + copyIndex * intervalMinutes * MS_PER_MIN);
  return Number.isFinite(shifted.getTime()) ? shifted.toISOString() : null;
}

/**
 * שדות שאינם עוברים לעותק: מצב חי שנוצר על ה**נסיעה המקורית** בלבד.
 *
 * ⚠️ `status` ביניהם בכוונה - **עותק אינו מאושר**. שכפול נסיעה מאושרת שהיה
 * גורר את האישור היה מוציא לשטח רכב שאיש לא אישר, בדיוק בפעולה שנועדה לחסוך
 * הקלדה. הפקח מאשר את העותק במפורש, כמו כל נסיעה חדשה.
 */
export const TRIP_FIELDS_NOT_COPIED = [
  'status', 'driver_ack_at', 'pending_change', 'pending_change_at',
  'departure_alerted_at', 'vehicle_request_id', 'ended_at',
] as const;

// ── תחנות ביניים ─────────────────────────────────────────────────────────────

export interface TripStop {
  /** נקודה מרשימת השדה; null = תחנה שנרשמה כטקסט חופשי */
  point_id: number | null;
  text: string;
}

/** קורא `stops` מה-DB בסובלנות: JSONB, מחרוזת JSON, או זבל -> מערך ריק. */
export function normalizeStops(raw: unknown): TripStop[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  return arr
    .map(s => {
      if (s == null || typeof s !== 'object') return { point_id: null, text: String(s ?? '').trim() };
      const o = s as Record<string, unknown>;
      const id = Number(o.point_id);
      return { point_id: Number.isFinite(id) && id > 0 ? id : null, text: String(o.text ?? '').trim() };
    })
    .filter(s => s.point_id !== null || s.text !== '');
}

/** שם התחנה לתצוגה: שם הנקודה מהשדה, ובהיעדרה הטקסט שנרשם. */
export const stopLabel = (stop: TripStop, pointName?: string | null): string =>
  (stop.point_id ? String(pointName ?? '').trim() : '') || stop.text || '';

// ── נלווים ───────────────────────────────────────────────────────────────────

export interface TripEscort { name: string; national_id: string }

export function normalizeEscorts(raw: unknown): TripEscort[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  return arr
    .map(e => {
      if (e == null || typeof e !== 'object') return { name: String(e ?? '').trim(), national_id: '' };
      const o = e as Record<string, unknown>;
      return { name: String(o.name ?? '').trim(), national_id: String(o.national_id ?? '').trim() };
    })
    .filter(e => e.name !== '' || e.national_id !== '');
}

// ── עדכון מהנהג הממתין לאישור המגדל ──────────────────────────────────────────

/** אילו שדות הנהג רשאי להציע לשנות מהאפליקציה שלו. */
export const DRIVER_EDITABLE_FIELDS = ['scheduled_at', 'stops', 'note'] as const;
export type DriverEditableField = (typeof DRIVER_EDITABLE_FIELDS)[number];

export const hasPendingDriverChange = (trip: { pending_change?: unknown }): boolean => {
  const c = trip.pending_change;
  if (!c) return false;
  if (typeof c === 'string') { try { return Object.keys(JSON.parse(c) || {}).length > 0; } catch { return false; } }
  return typeof c === 'object' && Object.keys(c as object).length > 0;
};

/** מה בדיוק הנהג ביקש לשנות - כדי שהמגדל יאשר שינוי ולא "עדכון" עמום. */
export function pendingChangeFields(trip: { pending_change?: unknown }): DriverEditableField[] {
  let c: unknown = trip.pending_change;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch { return []; } }
  if (!c || typeof c !== 'object') return [];
  return DRIVER_EDITABLE_FIELDS.filter(f => f in (c as object));
}
