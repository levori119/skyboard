// זיהוי - פ"מ באזור. **פונקציות טהורות בלבד**, כמו track.ts.
//
// המנוע עונה על שאלה אחת: האם הרכיב האווירי של הפ"מ נמצא באזור שהוקצה לו, ורק
// הוא. אין כאן React, אין fetch ואין קריאה לשעון - הזמן נכנס כפרמטר, ולכן כל
// מטריצת המקרים (כניסה, יציאה, חריגת גובה, כניסה ללא תיאום, מבנה, אובדן מגע)
// נבדקת ב-vitest בלי להריץ עמדה.
//
// זכור: `WatchTrack` הוא **מטוס פיזי בשמיים** ו-`WatchAssignment` הוא ה**רישום**
// שלו. הגשר ביניהם הוא או"ק דומה - לא זהה (AIR_PICTURE_SPEC.md §0).

import { pointInPolygon, distToSegment } from '../utils/zoneHit';

// ── כיולים ───────────────────────────────────────────────────────────────────

/**
 * סף התאמת או"ק: 80% מה**אותיות**, בסדר.
 *
 * הספרות אינן נכנסות להשוואה: הן מספר סידורי בתוך המבנה, לא שם. לכן "בננה",
 * "בננה1" ו"בננה12" הם אותו שם בדיוק (100%), ומה שנמדד הוא רק א-ב מול א-ב.
 * ההבחנה בין חברי מבנה אינה אובדת - היא עוברת לשובר השוויון בשידוך
 * (`fullCallsignSimilarity`), שם הספרה כן נספרת.
 *
 * הנרמול הוא לפי השם ה**ארוך**: לפי הקצר, "א" היה מתאים ל"אבגד" ב-100%.
 */
export const CALLSIGN_MATCH_MIN = 0.8;

/**
 * חיץ סביב קו האזור, ב**אחוזי תמונת מפה** - ולכן אינו משתנה עם זום המפה או עם
 * גודל המסך. תמונ"א מרעידה מזיזה מטוס בשבריר אחוז בין דגימה לדגימה, ובלי החיץ
 * מטוס שטס לאורך הגבול היה מייצר סדרת "חורג/חזר".
 */
export const EDGE_BUFFER_PCT = 0.3;

/** חיץ סביב גבול בלוק הגובה, ברגל. אותו היגיון של EDGE_BUFFER_PCT. */
export const ALT_BUFFER_FT = 100;

/**
 * הגובה הגבוה ביותר שעדיין נקרא כ**רום טיסה** ולא כרגל. FL600 הוא 60,000 רגל -
 * מעל כל מה שטס באזור, ולכן אין ערך שיכול להתפרש לשני הכיוונים.
 */
const MAX_FLIGHT_LEVEL = 600;

/**
 * גבול בלוק → רגל.
 *
 * **כל הגבהים ב-SKY-KING הם רום טיסה** ("מאות רגל"): `strips.alt` מחזיק
 * `FL235`/`090`/`310`, ו-`zone_altitude_ranges` מחזיק 100-400 ("נמוך" 100-140,
 * "גבוה" 150-400). התמונ"א היא **החריג היחיד** - היא מגיעה מהמאגר ברגל, כי כך
 * המאגר מוסר אותה.
 *
 * כאן נפגשו השניים, ובלי ההמרה ההשוואה הייתה 12,000 רגל מול "140" - כלומר כל
 * מטוס נמצא תמיד מחוץ לבלוק, והפ"מ נתקע על חריגת גובה קבועה.
 *
 * המנוע כולו עובד ברגל (`ALT_BUFFER_FT`), ולכן ההמרה היא של **הבלוק**: לתמונ"א
 * אין שגיאת עיגול, ולבלוק - שגובהו תמיד כפולה של 100 - אין מה לאבד.
 */
export function blockAltFeet(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.abs(raw) <= MAX_FLIGHT_LEVEL ? raw * 100 : raw;
}

/**
 * זמן החזקה: שינוי חייב להתמיד לפני שהוא נחשב. בקצב דגימה של 2 שניות אלו
 * 2-3 דגימות רצופות - מספיק כדי לבלוע דגימה חריגה בודדת, ומעט מכדי שהבקר
 * ירגיש שההתראה מאחרת.
 */
export const DWELL_MS = 5000;

/**
 * ערכי הסטטוס של `strip_zone_assignments.status`. אלו **ערכי נתונים** בעברית
 * שנשמרים ב-DB ומושווים בקוד - לא טקסט תצוגה, ולכן אינם עוברים i18n.
 */
export const ZONE_STATUS = {
  heading: 'בדרך לאזור',
  inZone: 'באזור',
  leaving: 'עוזב אזור',
} as const;

// ── טיפוסים ──────────────────────────────────────────────────────────────────

export interface WatchZone {
  id: number;
  name: string;
  /** אחוזי תמונת מפה (0..100), כמו `map_zones.polygon`. */
  polygon: { x: number; y: number }[];
}

export interface WatchAssignment {
  stripId: number;
  /** האו"ק של הפ"מ, כפי שהבקר רשם אותו. */
  callSign: string;
  /** האזור הראשי + האזורים הנוספים (`extra_zones`). ריק = פ"מ בלי אזור. */
  zoneIds: number[];
  /**
   * בלוק הגובה שהוקצה, **ברגל**. `null`/`null` = בלי הגבלת גובה.
   * ב-DB הוא שמור ברום טיסה - הקורא חייב להעביר אותו ב-`blockAltFeet`.
   */
  altMin: number | null;
  altMax: number | null;
  /** קונפליקט מתואם - משתיק את התראת "ללא תיאום" על האזור הזה. */
  isCoordinated: boolean;
  /** הסטטוס הנוכחי ב-DB. משמש להשוואה, כדי לא לכתוב מה שכבר כתוב. */
  status: string;
  /** האם העמדה שלי היא זו שחיברה את הפ"מ לאזור (`preset_id`) - רק היא כותבת. */
  ownedByMe: boolean;
}

export interface WatchTrack {
  id: string;
  /** האו"ק כפי שהמאגר מוסר אותו. */
  cs: string;
  /** אחוזי תמונת מפה, אחרי `track.place()`. */
  x: number;
  y: number;
  /** גובה ברגל. */
  alt: number;
}

export type ZoneAlertKind =
  /** הרכיב האווירי של הפ"מ יצא מהאזור בעוד הפ"מ עדיין מוקצה. */
  | 'out-of-zone'
  /** הרכיב באזור, אך מחוץ לבלוק הגובה שהוקצה - "כאילו חרג מהאזור". */
  | 'alt-deviation'
  /** רכיב שאינו מוקצה נכנס לאזור תפוס, בלי תיאום ובלי הפרדה אנכית. */
  | 'intruder';

export interface ZoneAlert {
  /** מפתח יציב בין טיקים - כדי שסימון "נקרא" לא יתאפס בכל שנייה. */
  key: string;
  kind: ZoneAlertKind;
  /** הפ"מ שההתראה עליו (ב-`intruder` - הפ"מ שנמצא באזור). */
  stripId: number;
  callSign: string;
  zoneId: number;
  zoneName: string;
  /** האו"ק של הרכיב הזר. רק ב-`intruder`. */
  intruderCs?: string;
  /**
   * מזהה הרכיב האווירי הזר. רק ב-`intruder`, וקיים כדי שהעמדה תוכל **להדגיש
   * אותו על המפה** כשהתמונה כבויה - בלעדיו היה צריך לפרק את `key`.
   */
  trackId?: string;
}

interface Pending { value: boolean; since: number }

interface TrackWatchState {
  inZone: boolean;
  altOk: boolean;
  /** האזור האחרון שבו נראה - **דביק**, כדי שהתראת יציאה תדע מאיזה אזור. */
  zoneId: number | null;
  pendingIn: Pending | null;
  pendingAlt: Pending | null;
}

export interface ZoneWatchState {
  /** מצב פר זוג (פ"מ, רכיב אווירי): `${stripId}|${trackId}`. */
  tracks: Record<string, TrackWatchState>;
  /** מצב פר זוג (רכיב זר, אזור): `${trackId}|${zoneId}`. */
  intruders: Record<string, { on: boolean; pending: Pending | null }>;
  /** האם הרכיב של הפ"מ כבר היה באזור - מפריד "בדרך לאזור" מ"עוזב אזור". */
  entered: Record<number, boolean>;
}

export interface ZoneWatchInput {
  zones: WatchZone[];
  assignments: WatchAssignment[];
  tracks: WatchTrack[];
  now: number;
}

export interface ZoneWatchTick {
  state: ZoneWatchState;
  /** ההתראות ה**חיות** - נגזרות מהמצב בכל טיק, ולא לוג שתופח. */
  alerts: ZoneAlert[];
  /** רק לפ"מים של העמדה שלי, ורק כשהסטטוס באמת שונה. */
  statusChanges: { stripId: number; status: string }[];
  /** הרכיבים ששויכו לכל פ"מ (מבנה = יותר מאחד). */
  trackIdsByStrip: Map<number, string[]>;
  alertedStripIds: Set<number>;
  alertedZoneIds: Set<number>;
}

export const emptyZoneWatchState = (): ZoneWatchState => ({ tracks: {}, intruders: {}, entered: {} });

// ── או"ק דומה ────────────────────────────────────────────────────────────────

/** משאיר אותיות וספרות בלבד, באנגלית קטנה. רווח, מקף וגרש אינם חלק מהשם. */
export function normalizeCallsign(raw: string): string {
  return String(raw ?? '').toLowerCase().replace(/[^0-9a-z֐-׿]/g, '');
}

/** הא-ב בלבד. הספרה היא מספר סידורי במבנה - ראה CALLSIGN_MATCH_MIN. */
export function callsignLetters(raw: string): string {
  return normalizeCallsign(raw).replace(/[0-9]/g, '');
}

/** LCS מנורמל לאורך הארוך. 0..1. */
function ratio(x: string, y: string): number {
  if (!x || !y) return 0;
  if (x === y) return 1;
  return lcsLength(x, y) / Math.max(x.length, y.length);
}

/** אורך תת-הסדרה המשותפת הארוכה ביותר (LCS) - "אותיות משותפות **בסדר**". */
function lcsLength(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1).fill(0);
  const cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = 0;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/**
 * 0..1 - כמה מה**אותיות** משותפות ובסדר, ביחס לשם הארוך. זהו הציון שנמדד מול
 * `CALLSIGN_MATCH_MIN`, וספרות אינן נספרות בו.
 *
 * החריג: או"ק שכולו ספרות. אחרי הסרתן לא נשאר ממנו דבר, והוא לא היה משתדך
 * לעולם - ולכן במקרה הזה בלבד ההשוואה נופלת לצורה המלאה.
 */
export function callsignSimilarity(a: string, b: string): number {
  const x = callsignLetters(a);
  const y = callsignLetters(b);
  if (x && y) return ratio(x, y);
  return ratio(normalizeCallsign(a), normalizeCallsign(b));
}

/**
 * אותה מדידה, אבל **עם** הספרות. אינה משמשת כסף - רק כשובר שוויון בשידוך:
 * "בננה1" ו"בננה2" הם שני פ"מים נפרדים שהאותיות שלהם זהות, וזו השורה היחידה
 * שיודעת להבדיל ביניהם.
 */
export function fullCallsignSimilarity(a: string, b: string): number {
  return ratio(normalizeCallsign(a), normalizeCallsign(b));
}

/**
 * שיוך רכיבים אוויריים לפ"מים. **רכיב אחד לפ"מ אחד** (הדומה ביותר זוכה), אבל
 * פ"מ יכול להחזיק כמה רכיבים - זה בדיוק מקרה המבנה: "בננה1" ו"בננה2" שניהם
 * שייכים לפ"מ "בננה", ובלי זה השני היה מדווח כרכיב זר באזור של עצמו.
 *
 * שובר השוויון הוא הסיבה שההתעלמות מספרות אינה מסוכנת: משעה שהאותיות אינן
 * מבדילות, שני פ"מים בשם "בננה1" ו"בננה2" מקבלים **שניהם** ציון 1 מול הרכיב
 * "בננה1" - ורק ההשוואה המלאה יודעת שהוא של הראשון.
 */
export function matchTracks(assignments: WatchAssignment[], tracks: WatchTrack[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const a of assignments) out.set(a.stripId, []);
  for (const t of tracks) {
    let bestId: number | null = null;
    let bestScore = 0;
    let bestTie = -1;
    for (const a of assignments) {
      const score = callsignSimilarity(a.callSign, t.cs);
      if (score < CALLSIGN_MATCH_MIN) continue;
      const tie = fullCallsignSimilarity(a.callSign, t.cs);
      if (score > bestScore || (score === bestScore && tie > bestTie)) {
        bestScore = score; bestTie = tie; bestId = a.stripId;
      }
    }
    if (bestId != null) out.get(bestId)!.push(t.id);
  }
  return out;
}

// ── גאומטריה עם היסטרזיס ─────────────────────────────────────────────────────

/** המרחק הקצר ביותר לקו המתאר של אחד הפוליגונים, באחוזי מפה. */
function edgeDistance(px: number, py: number, polygons: { x: number; y: number }[][]): number {
  let best = Infinity;
  for (const poly of polygons) {
    if (poly.length < 2) continue;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      best = Math.min(best, distToSegment(px, py, poly[j].x, poly[j].y, poly[i].x, poly[i].y));
    }
  }
  return best;
}

/**
 * "בפנים" עם רצועת היסטרזיס ברוחב `buffer` סביב הקו: כדי **להיכנס** צריך
 * להיות בפנים ומעבר לחיץ, וכדי **לצאת** צריך להיות בחוץ ומעבר לחיץ. באמצע -
 * המצב הקודם נשמר.
 */
export function insideWithHysteresis(
  px: number, py: number, polygons: { x: number; y: number }[][], wasInside: boolean, buffer = EDGE_BUFFER_PCT,
): boolean {
  const inside = polygons.some(p => p.length >= 3 && pointInPolygon(px, py, p));
  const d = edgeDistance(px, py, polygons);
  if (inside) return wasInside ? true : d >= buffer;
  return wasInside ? d < buffer : false;
}

/** אותו היגיון על בלוק הגובה. בלי בלוק מוגדר - תמיד תקין. */
export function altOkWithHysteresis(
  alt: number, min: number | null, max: number | null, wasOk: boolean, buffer = ALT_BUFFER_FT,
): boolean {
  if (min == null && max == null) return true;
  const lo = min == null ? -Infinity : (wasOk ? min - buffer : min);
  const hi = max == null ? Infinity : (wasOk ? max + buffer : max);
  return alt >= lo && alt <= hi;
}

/** האם גובה הרכיב הזר חופף לבלוק של המחזיק. בלי בלוק - כל גובה חופף. */
function altOverlaps(alt: number, min: number | null, max: number | null): boolean {
  if (min == null && max == null) return true;
  const lo = min == null ? -Infinity : min - ALT_BUFFER_FT;
  const hi = max == null ? Infinity : max + ALT_BUFFER_FT;
  return alt >= lo && alt <= hi;
}

/** צעד אחד במכונת ההשהיה: שינוי מתקבל רק אחרי שהתמיד `DWELL_MS`. */
function advance(pending: Pending | null, committed: boolean, raw: boolean, now: number, dwellMs = DWELL_MS) {
  if (raw === committed) return { committed, pending: null as Pending | null };
  if (!pending || pending.value !== raw) return { committed, pending: { value: raw, since: now } };
  if (now - pending.since >= dwellMs) return { committed: raw, pending: null as Pending | null };
  return { committed, pending };
}

// ── הטיק ─────────────────────────────────────────────────────────────────────

/**
 * טיק אחד של הזיהוי. מחזיר מצב חדש (המצב הקודם אינו משתנה), את ההתראות
 * החיות, ואת שינויי הסטטוס שיש לכתוב.
 *
 * המצב נבנה מחדש בכל טיק ונושא רק מפתחות **חיים**, ולכן פ"מ שנותק מאזור או
 * מטוס שנחת אינם משאירים אחריהם רשומה. משמרת של 12 שעות אינה מנפחת אותו.
 */
export function tickZoneWatch(prev: ZoneWatchState, input: ZoneWatchInput): ZoneWatchTick {
  const { zones, assignments, tracks, now } = input;
  const zoneById = new Map(zones.filter(z => (z.polygon?.length ?? 0) >= 3).map(z => [z.id, z]));
  const trackById = new Map(tracks.map(t => [t.id, t]));
  const trackIdsByStrip = matchTracks(assignments, tracks);

  const state = emptyZoneWatchState();
  const alerts: ZoneAlert[] = [];
  const statusChanges: { stripId: number; status: string }[] = [];

  // ── שלב א: הפ"מים המוקצים ──────────────────────────────────────────────────
  for (const a of assignments) {
    const zoneList = a.zoneIds.map(id => zoneById.get(id)).filter((z): z is WatchZone => !!z);
    if (zoneList.length === 0) continue;
    const polygons = zoneList.map(z => z.polygon);

    const myTracks = (trackIdsByStrip.get(a.stripId) ?? [])
      .map(id => trackById.get(id))
      .filter((t): t is WatchTrack => !!t);

    const wasEntered = prev.entered[a.stripId] === true;

    // אובדן מגע אינו "יציאה מהאזור": רכיב שנחת או יצא מכיסוי המאגר פשוט אינו
    // ניתן לבדיקה. התראה כאן הייתה מדווחת חריגה בכל נחיתה.
    if (myTracks.length === 0) {
      if (wasEntered) state.entered[a.stripId] = true;
      continue;
    }

    let allIn = true;
    let allAltOk = true;
    let anyIn = false;
    let alertZone: WatchZone = zoneList[0];

    for (const t of myTracks) {
      const key = `${a.stripId}|${t.id}`;
      const p = prev.tracks[key];
      const wasIn = p?.inZone ?? false;
      const wasAltOk = p?.altOk ?? true;

      const inR = advance(p?.pendingIn ?? null, wasIn, insideWithHysteresis(t.x, t.y, polygons, wasIn), now);
      const altR = advance(p?.pendingAlt ?? null, wasAltOk, altOkWithHysteresis(t.alt, a.altMin, a.altMax, wasAltOk), now);

      const here = inR.committed
        ? (zoneList.find(z => pointInPolygon(t.x, t.y, z.polygon))?.id ?? p?.zoneId ?? null)
        : (p?.zoneId ?? null);
      state.tracks[key] = { inZone: inR.committed, altOk: altR.committed, zoneId: here, pendingIn: inR.pending, pendingAlt: altR.pending };

      if (inR.committed) anyIn = true; else allIn = false;
      if (!altR.committed) allAltOk = false;
      const zoneOfTrack = here != null ? zoneById.get(here) : undefined;
      if (zoneOfTrack) alertZone = zoneOfTrack;
    }

    const entered = wasEntered || anyIn;
    if (entered) state.entered[a.stripId] = true;

    // חריגת גובה נחשבת כחריגה מהאזור (האפיון: "זה כאילו חרג מהאזור"), ולכן
    // שני המצבים מובילים לאותו סטטוס. מה שמבדיל ביניהם הוא נוסח ההתראה.
    const desired = !allIn
      ? (entered ? ZONE_STATUS.leaving : ZONE_STATUS.heading)
      : (allAltOk ? ZONE_STATUS.inZone : ZONE_STATUS.leaving);

    if (a.ownedByMe && desired !== a.status) statusChanges.push({ stripId: a.stripId, status: desired });

    if (!allIn && entered) {
      alerts.push({ key: `oz|${a.stripId}`, kind: 'out-of-zone', stripId: a.stripId, callSign: a.callSign, zoneId: alertZone.id, zoneName: alertZone.name });
    } else if (allIn && !allAltOk) {
      alerts.push({ key: `ad|${a.stripId}`, kind: 'alt-deviation', stripId: a.stripId, callSign: a.callSign, zoneId: alertZone.id, zoneName: alertZone.name });
    }
  }

  // ── שלב ב: כניסה ללא תיאום ─────────────────────────────────────────────────
  // אזור "תפוס" הוא אזור שיש בו הקצאה. הרכיבים של אותה הקצאה אינם זרים בו,
  // אבל הם כן זרים באזור של פ"מ אחר.
  const holdersByZone = new Map<number, WatchAssignment[]>();
  const ownedInZone = new Map<number, Set<string>>();
  for (const a of assignments) {
    for (const zid of a.zoneIds) {
      if (!zoneById.has(zid)) continue;
      const holders = holdersByZone.get(zid) ?? [];
      holders.push(a);
      holdersByZone.set(zid, holders);
      const owned = ownedInZone.get(zid) ?? new Set<string>();
      for (const id of trackIdsByStrip.get(a.stripId) ?? []) owned.add(id);
      ownedInZone.set(zid, owned);
    }
  }

  for (const [zid, holders] of holdersByZone) {
    const zone = zoneById.get(zid)!;
    const owned = ownedInZone.get(zid) ?? new Set<string>();
    for (const t of tracks) {
      if (owned.has(t.id)) continue;
      const key = `${t.id}|${zid}`;
      const p = prev.intruders[key];
      const was = p?.on ?? false;
      const r = advance(p?.pending ?? null, was, insideWithHysteresis(t.x, t.y, [zone.polygon], was), now);
      if (r.committed || r.pending) state.intruders[key] = { on: r.committed, pending: r.pending };
      if (!r.committed) continue;

      // הפרדה אנכית מלאה אינה קונפליקט, וקונפליקט מתואם כבר טופל. אם אף מחזיק
      // אינו עונה על שניהם - אין למי להתריע.
      const victim = holders.find(h => !h.isCoordinated && altOverlaps(t.alt, h.altMin, h.altMax));
      if (!victim) continue;
      alerts.push({
        key: `in|${t.id}|${zid}`, kind: 'intruder', stripId: victim.stripId,
        callSign: victim.callSign, zoneId: zid, zoneName: zone.name, intruderCs: t.cs, trackId: t.id,
      });
    }
  }

  const alertedStripIds = new Set(alerts.map(a => a.stripId));
  const alertedZoneIds = new Set(alerts.map(a => a.zoneId));
  return { state, alerts, statusChanges, trackIdsByStrip, alertedStripIds, alertedZoneIds };
}

/** חתימה יציבה של רשימת ההתראות - להשוואה זולה, כדי לא לרנדר בלי שינוי. */
export function alertsSignature(alerts: ZoneAlert[]): string {
  return alerts.map(a => a.key).sort().join(',');
}
