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

/**
 * בקשת נסיעה חדשה שהנהג שלח מאפליקציית DRIVER, ועדיין ממתינה להכרעת המגדל.
 * מתפרצת רק כשהיא טרייה; נסיעה שהמגדל רשם בעצמו אין לה `driver_requested_at`.
 */
export function isNewDriverRequest(
  t: { status: string; driver_requested_at?: string | null },
  now: number = Date.now(),
): boolean {
  return asTripStatus(t.status) === 'pending' && isDriverActionFresh(t.driver_requested_at, now);
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

/** נקודה בנתיב שאושר - בדיוק מה שמעקב הנסיעה החי צריך, ותו לא. */
export interface RouteWaypoint {
  lat: number | null;
  lon: number | null;
  xPct: number | null;
  yPct: number | null;
  routeType: string;
  isCrossing: boolean;
}

export interface RouteOptionLike {
  /** רמת ההרשאה ששימשה לחישוב */
  key: string;
  /** מזהי המסלולים שהנתיב עובר בהם */
  route_ids: number[];
  label: string;
  dist_m: number;
  crossings: number;
  /**
   * הנתיב עצמו, כפי שחושב ברגע שהפקח ראה אותו. מעקב הנסיעה החי מודד סטייה
   * **מולו** ולא מול חישוב מחדש (TRIP_LIVE_TRACKING_SPEC.md §1). חסר בנסיעות
   * שאושרו לפני שנשמר - ואז זיהוי הסטייה כבוי, והמסך אומר זאת.
   */
  waypoints?: RouteWaypoint[];
}

/**
 * הנתיב מ-/api/route-plan בצורה מצומצמת לשמירה על הנסיעה.
 *
 * התשובה נושאת לכל נקודה הוראות פנייה, פרטי חצייה ומזהי צמתים - שלושה נתיבים
 * כאלה על כל נסיעה היו מנפחים את השורה בלי שמעקב הנסיעה צריך אותם. נקודה בלי
 * נ"צ **ובלי** אחוזים אינה ניתנת למיקום ונזרקת.
 */
export function compactRouteWaypoints(raw: unknown): RouteWaypoint[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const out: RouteWaypoint[] = [];
  for (const w of raw as Record<string, unknown>[]) {
    if (!w || typeof w !== 'object') continue;
    const lat = num(w.lat), lon = num(w.lon ?? w.lng);
    const xPct = num(w.xPct ?? w.x), yPct = num(w.yPct ?? w.y);
    const hasGeo = lat !== null && lon !== null;
    const hasPct = xPct !== null && yPct !== null;
    if (!hasGeo && !hasPct) continue;
    out.push({
      lat: hasGeo ? lat : null, lon: hasGeo ? lon : null,
      xPct: hasPct ? xPct : null, yPct: hasPct ? yPct : null,
      routeType: typeof w.routeType === 'string' && w.routeType ? w.routeType : 'vehicle',
      isCrossing: w.isCrossing === true,
    });
  }
  return out;
}

/**
 * כמה חלופות מבקשים מהמתכנן לכל רמת הרשאה, מעבר לנתיב הקצר. בשדה שבו שלוש
 * הרמות מחזירות אותו נתיב, בלי חלופות הפקח ראה שורה אחת ולא הייתה לו בחירה.
 */
export const ROUTE_ALTERNATIVES = 2;

type PlanPath = {
  waypoints?: unknown; routeSegments?: unknown; segmentPath?: unknown;
  totalDistM?: unknown; crossings?: unknown;
} | null | undefined;

/**
 * תשובת /api/route-plan -> אפשרויות לבחירה: הנתיב הקצר, ואחריו כל חלופה
 * (\`alternatives\`) כאפשרות שלמה עם הנקודות שלה - כך שחלופה שנבחרה היא בדיוק
 * הנתיב שהנהג נמדד מולו. שגיאה, או נתיב בלי נקודות - אין אפשרות.
 */
export function routeOptionsFromPlan<K extends string>(
  key: K,
  data: (PlanPath & { error?: unknown; alternatives?: unknown }) | null | undefined,
): (RouteOptionLike & { key: K })[] {
  if (!data || data.error) return [];
  const toOption = (p: PlanPath): (RouteOptionLike & { key: K }) | null => {
    if (!p || !Array.isArray(p.waypoints) || !p.waypoints.length) return null;
    const segments = (Array.isArray(p.routeSegments) ? p.routeSegments : []) as { id: unknown; name: unknown }[];
    return {
      key,
      route_ids: segments.map(sg => Number(sg.id)).filter(Number.isFinite),
      label: String(p.segmentPath || segments.map(sg => sg.name).join(' → ') || ''),
      dist_m: Number(p.totalDistM) || 0,
      crossings: Array.isArray(p.crossings) ? p.crossings.length : 0,
      waypoints: compactRouteWaypoints(p.waypoints),
    };
  };
  const alternatives = Array.isArray(data.alternatives) ? (data.alternatives as PlanPath[]) : [];
  return [data, ...alternatives].map(toOption).filter((o): o is RouteOptionLike & { key: K } => o !== null);
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

/**
 * אישור **מהרשימה**, בלי לפתוח את הטופס. מחזיר null כשמותר, או את הסיבה:
 *   'status' - הנסיעה כבר מאושרת או הסתיימה; אין מה לאשר
 *   'route'  - נסיעה בין שתי נקודות שדה שלא נבחר לה נתיב
 *
 * מחמיר מ-canApproveTrip בכוונה: שם הנתיבים כבר חושבו מול עיני הפקח, וכאן
 * הם אולי מעולם לא חושבו (בקשה מאפליקציית הנהג). אישור כזה היה שולח את הנהג
 * לדרך שאיש לא הסכים עליה. מוצא או יעד בטקסט חופשי - אין נתיב לחשב, ומאשרים.
 */
export function quickApproveBlocker(t: {
  status: string;
  from_point_id?: number | null;
  to_point_id?: number | null;
  selected_route_ids?: unknown;
  selected_route_label?: string | null;
}): 'status' | 'route' | null {
  const st = asTripStatus(t.status);
  if (st === 'approved' || st === 'ended') return 'status';
  const chosen = (Array.isArray(t.selected_route_ids) && t.selected_route_ids.length > 0) || !!t.selected_route_label;
  if (!chosen && t.from_point_id && t.to_point_id) return 'route';
  return null;
}

// ── קיבוץ ומיון רשימת הנסיעות ────────────────────────────────────────────────
//
// הפקח מקבץ לפי כל עמודה ברשימה. ברירת המחדל היא **סטטוס**, ובו הממתינות
// קודם: אלה הנסיעות שמחכות להכרעה שלו. בתוך כל קבוצה - לפי זמן היציאה.

export const TRIP_GROUP_KEYS = ['status', 'tripType', 'vehicle', 'driver', 'from', 'to', 'date', 'none'] as const;
export type TripGroupKey = (typeof TRIP_GROUP_KEYS)[number];

/** סדר קבוצות הסטטוס: מה שממתין להכרעה בראש. */
const STATUS_GROUP_ORDER: TripStatus[] = ['pending', 'approved', 'not_approved', 'ended'];

interface GroupableTrip {
  id: number;
  status: string;
  scheduled_at: string | null;
  trip_type_name?: string | null;
  vehicle_name?: string | null;
  vehicle_type_name?: string | null;
  permit_driver_name?: string | null;
  driver_name?: string | null;
  from_point_name?: string | null;
  from_text?: string | null;
  to_point_name?: string | null;
  to_text?: string | null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** ערך הקבוצה של נסיעה. ריק = "ללא". תאריך הוא YYYY-MM-DD בשעון המקומי. */
export function tripGroupValue(t: GroupableTrip, by: TripGroupKey): string {
  switch (by) {
    case 'status': return asTripStatus(t.status);
    case 'tripType': return t.trip_type_name || '';
    case 'vehicle': return t.vehicle_name || t.vehicle_type_name || '';
    case 'driver': return t.permit_driver_name || t.driver_name || '';
    case 'from': return t.from_point_name || t.from_text || '';
    case 'to': return t.to_point_name || t.to_text || '';
    case 'date': {
      const d = t.scheduled_at ? new Date(t.scheduled_at) : null;
      return d && Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : '';
    }
    default: return '';
  }
}

const tripTime = (t: GroupableTrip): number | null => {
  const v = t.scheduled_at ? new Date(t.scheduled_at).getTime() : NaN;
  return Number.isFinite(v) ? v : null;
};

/**
 * קיבוץ ומיון. `order`: 'asc' מהמוקדמת (נסיעות עתידיות), 'desc' מהאחרונה
 * (היסטוריה). נסיעה בלי מועד תמיד בסוף הקבוצה.
 */
export function groupTrips<T extends GroupableTrip>(
  trips: T[], by: TripGroupKey, order: 'asc' | 'desc' = 'asc',
): { value: string; trips: T[] }[] {
  const byTime = (a: T, b: T) => {
    const ta = tripTime(a); const tb = tripTime(b);
    if (ta === null && tb === null) return a.id - b.id;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return (order === 'asc' ? ta - tb : tb - ta) || a.id - b.id;
  };
  if (by === 'none') return [{ value: '', trips: [...trips].sort(byTime) }];

  const groups = new Map<string, T[]>();
  for (const t of trips) {
    const v = tripGroupValue(t, by);
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v)!.push(t);
  }
  const values = [...groups.keys()].sort((a, b) => {
    if (by === 'status') return STATUS_GROUP_ORDER.indexOf(a as TripStatus) - STATUS_GROUP_ORDER.indexOf(b as TripStatus);
    if (a === '' || b === '') return a === '' ? 1 : -1;
    if (by === 'date') return order === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
    return a.localeCompare(b, 'he');
  });
  return values.map(value => ({ value, trips: groups.get(value)!.sort(byTime) }));
}

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
  'departure_alerted_at', 'vehicle_request_id', 'ended_at', 'driver_requested_at',
  'driver_started_at', 'pending_change_prev_status',
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

/**
 * האם הנסיעה שייכת להיסטוריה ולא לטאב הפעיל: הסתיימה, או שמועד היציאה עבר.
 *
 * **חריג: בקשת שינוי מהנהג שממתינה להכרעה נשארת פעילה.** המועד שעבר הוא לרוב
 * בדיוק מה שהנהג מבקש לתקן, והנסיעה נעלמה מהלוח הפעיל ברגע שהמגדל צריך להכריע.
 */
export function isPastTrip(
  t: { status?: string | null; scheduled_at?: string | null; pending_change?: unknown },
  now: number = Date.now(),
): boolean {
  if (asTripStatus(t.status) === 'ended') return true;
  if (hasPendingDriverChange(t)) return false;
  return !!t.scheduled_at && new Date(t.scheduled_at).getTime() < now;
}

/** מה בדיוק הנהג ביקש לשנות - כדי שהמגדל יאשר שינוי ולא "עדכון" עמום. */
export function pendingChangeFields(trip: { pending_change?: unknown }): DriverEditableField[] {
  let c: unknown = trip.pending_change;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch { return []; } }
  if (!c || typeof c !== 'object') return [];
  return DRIVER_EDITABLE_FIELDS.filter(f => f in (c as object));
}
