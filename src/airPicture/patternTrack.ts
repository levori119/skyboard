// מעקב הקפה אוטומטי - **פונקציות טהורות בלבד**. ראה PATTERN_AUTOTRACK_SPEC.md.
//
// המטוס הפיזי בשמיים (תמונ"א) משודך למטוס **בודד** בפ"מ - או"ק + מספר במבנה -
// והרישום זז בעקבותיו: יציאה מנקודת ההצטרפות, צלע ההקפה, ונחת. שתי השכבות לא
// מתערבבות (CLAUDE.md, תמונ"א ≠ פ"מ): המנוע מחזיר **פעולות**, וה-hook שולח אותן
// דרך אותם handlers שהפקח לוחץ עליהם ביד.
//
// ── שלוש הכרעות שקובעות את הצורה ───────────────────────────────────────────
// 1. **מבוסס מעברים, לא מצבים.** נכתב רק כשהזיהוי *משתנה*. מנוע שכותב "בסיס"
//    בכל טיק כל עוד המטוס בבסיס היה דורס כל שנייה את הפקח שתיקן ביד - והופך
//    את האוטומציה ליריב שלו במקום לעזר.
// 2. **שידוך חסר עדיף על שידוך שגוי.** שני רכיבים לאותו מטוס, או מבנה בלי מספר -
//    המטוס לא זז. שגוי מזיז פ"מ לא נכון בשקט; חסר רק משאיר עבודה ידנית.
// 3. **אובדן קשר אינו נחיתה.** "נעלם" נספר רק ליד הסף ואחרי פיינל.

import { callsignSimilarity, normalizeCallsign, CALLSIGN_MATCH_MIN } from './zoneWatch';
import { haversineNm } from '../utils/eta';
import { expectedFormationCount } from '../../shared/formationCount.js';

// ── ספים ────────────────────────────────────────────────────────────────────

/** כניסה לאזור נקודת ההצטרפות (מייל ימי) - מהבהב בירוק. */
export const JOIN_ENTER_NM = 3;
/** יציאה ממנו. הפער מהכניסה הוא היסטרזיס: בלי ריצוד כשהמטוס טס על הגבול. */
export const JOIN_EXIT_NM = 3.2;
/** מרחק מצלע ההקפה שבו המטוס נחשב עליה - **ברירת מחדל**. לכל הקפה `leg_tolerance_nm` משלה. */
export const LEG_NM = 0.5;
/**
 * כיוון הטיסה מול כיוון הצלע. מטוס שחוצה את קו עם הרוח בניצב (בדרך מהנקודה, או
 * בפינה אחרי שכבר פנה לבסיס) נמצא **על** הקו אבל אינו **טס** אותו.
 */
export const HDG_MATCH_DEG = 45;
/**
 * סטייה מותרת מהגובה המתוכנן כשלא נרשם בהקפה - **לא סימטרית**, הכרעת הפקח
 * (2026-09-15). מעל: מטוס מגיע מנקודת ההצטרפות גבוה ויורד אל ההקפה, ולכן 1500.
 * מתחת: מטוס נמוך מהפרופיל הוא חריגה בטיחותית, ולכן רק 500.
 */
export const ALT_ABOVE_FT = 1500;
export const ALT_BELOW_FT = 500;
/**
 * "על המסלול" - המרחק מ**קטע המסלול** (סף → הקצה הרחוק) שבו מהירות נמוכה או
 * היעלמות נחשבות נחיתה. נמדד מהמסלול ולא מנקודת הסף: בסימולטור (ATSIM) המטוס
 * מתגלגל 1.4 מייל לאורך המסלול ורק אז נעלם, ומדידה מול הסף פספסה כל נחיתה.
 */
export const THRESHOLD_NM = 1;
/** מתחת לזה המטוס מתגלגל ולא טס. */
export const LANDED_SPD_KT = 60;
/** כמה זמן ברצף עד "נחת" - טאץ' אנד גו חוזר למהירות לפני כן. */
export const LANDED_HOLD_MS = 30_000;
/** השהיה לפני שמצב חדש נחשב, כמו במעקב האזורים. */
export const DWELL_MS = 3_000;
/**
 * פער בין טיקים שמעליו כל הספירות מתאפסות. ה-hook מדלג על תמונה ישנה, ובלי זה
 * מטוס שנעלם לפני ההקפאה היה "נוחת" ברגע שהתמונה חוזרת.
 */
export const TICK_GAP_MS = 5_000;

// ── טיפוסים ─────────────────────────────────────────────────────────────────

export interface GeoPt { lat: number; lon: number }
export type AutoLeg = 'downwind' | 'base' | 'final';
export type AutoFlightStatus = 'none' | AutoLeg | 'landed';

/** פ"מ שהעמדה הזו **מחזיקה**. פ"מ של עמדה אחרת פשוט לא נמסר למנוע. */
export interface AutoStrip {
  stripId: string;
  callSign: string;
  /** גודל המבנה **המקורי** - בפ"מ מפוצל זה גודל המבנה כולו, לא החלק. */
  formationSize: number;
  /** המספרים שהחלק הזה מחזיק. `null` = כל המבנה. */
  indices: number[] | null;
}

/** מטוס בודד כפי שהוא רשום ב-DB. */
export interface AutoAircraft {
  stripId: string;
  idx: number;
  /** הנקודה שבה הוא ממתין. `null` = אינו בנקודה. */
  pointId: number | null;
  pointGeo: GeoPt | null;
  inPattern: boolean;
  patternId: number | null;
  runwayIdent: string;
  flightStatus: AutoFlightStatus;
}

export interface AutoTrack extends GeoPt {
  id: string; cs: string; alt: number; spd: number;
  /** כיוון טיסה במעלות. חסר = הכיוון אינו נבדק. */
  hdg?: number;
}

export interface PatternGeo {
  id: number;
  runwayIdent: string;
  legs: Record<AutoLeg, [GeoPt, GeoPt]>;
  /** סוף הפיינל. */
  threshold: GeoPt;
  /** המסלול: מהסף אל הקצה הרחוק (תחילת "אחרי המראה"). */
  runway: [GeoPt, GeoPt];
  /** סטייה מותרת מהצלע, מייל ימי (פרמטרי השדה). חסר = `LEG_NM`. */
  legTolNm?: number | null;
  /** כמה **מעל** הגובה המתוכנן מותר, רגל (פרמטרי השדה). חסר = לא נבדק בכיוון הזה. */
  altAboveFt?: number | null;
  /** כמה **מתחת** לגובה המתוכנן מותר, רגל (פרמטרי השדה). חסר = לא נבדק בכיוון הזה. */
  altBelowFt?: number | null;
  /** הגובה המתוכנן (מוחלט) בנקודה שבשבר `frac` של הצלע - מפרופיל ההקפה. */
  plannedAltFt?: ((leg: AutoLeg, frac: number) => number) | null;
}

export type AutoAction =
  | { kind: 'leave-point'; stripId: string; idx: number; patternId: number | null; runwayIdent: string }
  | { kind: 'set-leg'; stripId: string; idx: number; leg: AutoLeg; patternId: number; runwayIdent: string; inPattern: boolean }
  | { kind: 'landed'; stripId: string; idx: number };

interface KeyState {
  wasNear: boolean;
  left: boolean;
  outSince: number | null;
  cand: AutoLeg | null;
  candSince: number;
  leg: AutoLeg | null;
  landSince: number | null;
  landed: boolean;
  lastSeen: GeoPt | null;
}

export interface PatternTrackState { keys: Record<string, KeyState>; lastTick: number | null }

export const emptyPatternTrackState = (): PatternTrackState => ({ keys: {}, lastTick: null });
export const aircraftKey = (stripId: string | number, idx: number): string => `${stripId}|${idx}`;

const LEGS: AutoLeg[] = ['downwind', 'base', 'final'];

// ── §3 זיהוי ─────────────────────────────────────────────────────────────────

/**
 * המספר במבנה מתוך או"ק הרכיב.
 *
 * הספרות בסוף השם. מספר בטווח המבנה - הוא עצמו. מחוצה לו, הספרה **האחרונה**:
 * "בננה 11" ברביעייה הוא בננה 1 (שם הטייסת/המבנה נכתב לפני המספר). מבנה של
 * 10 ומעלה שומר את המספר המלא, כי שם 11 הוא באמת המטוס ה-11.
 */
export function formationIndexOf(cs: string, size: number): number | null {
  const n = Math.max(0, Math.floor(Number(size) || 0));
  const m = normalizeCallsign(cs).match(/(\d+)$/);
  if (!m) return n === 1 ? 1 : null;
  const num = parseInt(m[1], 10);
  if (num >= 1 && num <= n) return num;
  const last = num % 10;
  if (num >= 10 && last >= 1 && last <= n) return last;
  return null;
}

/**
 * כל רכיב אווירי למטוס בודד. מפתח `aircraftKey`.
 * `ambiguous` - מטוסים שקיבלו יותר מרכיב אחד (או שהרכיב מתאים לכמה פ"מים):
 * הם **לא** משודכים, והמנוע לא נוגע בהם.
 */
export function matchFormationTracks(
  strips: AutoStrip[], tracks: { id: string; cs: string }[],
): { byKey: Map<string, string>; ambiguous: Set<string> } {
  const byKey = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const t of tracks) {
    let best = 0;
    let cands: AutoStrip[] = [];
    for (const s of strips) {
      const score = callsignSimilarity(s.callSign, t.cs);
      if (score < CALLSIGN_MATCH_MIN) continue;
      if (score > best) { best = score; cands = [s]; } else if (score === best) cands.push(s);
    }
    if (!cands.length) continue;
    // המספר נמדד מול גודל המבנה המקורי - משותף לכל חלקי המבנה המפוצל
    const idx = formationIndexOf(t.cs, Math.max(...cands.map(s => s.formationSize)));
    if (idx == null) continue;
    const holders = cands.filter(s => !s.indices || s.indices.includes(idx));
    if (!holders.length) continue;
    if (holders.length > 1) { for (const h of holders) ambiguous.add(aircraftKey(h.stripId, idx)); continue; }
    const key = aircraftKey(holders[0].stripId, idx);
    if (byKey.has(key)) ambiguous.add(key); else byKey.set(key, t.id);
  }
  for (const k of ambiguous) byKey.delete(k);
  return { byKey, ambiguous };
}

/** כמה מטוסים צפויים בפ"מ - אותו כלל בשרת ובעמדה (shared). */
export { expectedFormationCount };

// ── §4 גאומטריה ──────────────────────────────────────────────────────────────

/** היטל על קטע: המרחק במייל ימי, והשבר לאורכו (0 = תחילת הקטע). היטל מקומי שטוח. */
function projectOnSegment(p: GeoPt, a: GeoPt, b: GeoPt): { d: number; u: number } {
  const kx = 60 * Math.cos(p.lat * Math.PI / 180);
  const ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * 60;
  const bx = (b.lon - p.lon) * kx, by = (b.lat - p.lat) * 60;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const u = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return { d: Math.hypot(ax + u * dx, ay + u * dy), u };
}

/** מרחק מנקודה לקטע, במייל ימי. היטל מקומי שטוח - שגיאה זניחה במרחקי הקפה. */
export function distToSegmentNm(p: GeoPt, a: GeoPt, b: GeoPt): number {
  return projectOnSegment(p, a, b).d;
}

/** כיוון מ-a ל-b במעלות (0 = צפון), בהיטל המקומי. */
function bearingOf(a: GeoPt, b: GeoPt): number {
  const kx = Math.cos(a.lat * Math.PI / 180);
  const deg = Math.atan2((b.lon - a.lon) * kx, b.lat - a.lat) * 180 / Math.PI;
  return (deg + 360) % 360;
}

const angleDiff = (x: number, y: number) => { const d = Math.abs(((x - y) % 360 + 360) % 360); return d > 180 ? 360 - d : d; };

const nmBetween = (a: GeoPt, b: GeoPt) => haversineNm(a.lat, a.lon, b.lat, b.lon);

function nearestLeg(p: GeoPt, patterns: PatternGeo[]): { pattern: PatternGeo; leg: AutoLeg; d: number } | null {
  // "הקרובה ביותר" - לבחירת הקפה ליציאה מהנקודה, בלי סף
  let best: { pattern: PatternGeo; leg: AutoLeg; d: number } | null = null;
  for (const pattern of patterns) {
    for (const leg of LEGS) {
      const [a, b] = pattern.legs[leg];
      const d = distToSegmentNm(p, a, b);
      if (!best || d < best.d) best = { pattern, leg, d };
    }
  }
  return best;
}

/**
 * הצלע שהמטוס עליה, הקרובה מביניהן בפינה. שלושה תנאים, וכולם של **ההקפה**:
 *
 *  1. מרחק מהצלע עד `legTolNm` (פרמטרי השדה; ברירת מחדל `LEG_NM`).
 *  2. גובה בין `altBelowFt` מתחת ל-`altAboveFt` מעל הגובה המתוכנן **באותה נקודה לאורך
 *     הצלע**. כל גבול לעצמו - גבול שלא נמסר אינו נבדק באותו כיוון.
 *  3. כיוון טיסה עד `HDG_MATCH_DEG` מכיוון הצלע - אם ידוע. זה מה שהופך את הפנייה
 *     לבסיס למיידית: בפינה המטוס עדיין **על** קו עם הרוח, אבל כבר טס בכיוון הבסיס.
 *
 * `preferId` - ההקפה שכבר נקבעה למטוס: אז **רק** היא נבדקת, כדי שהקפה של
 * מסלול סמוך לא "תחטוף" את המטוס בחצייה.
 */
export function detectLeg(
  p: GeoPt, patterns: PatternGeo[], preferId?: number | null,
  opts: { altFt?: number | null; hdg?: number | null } = {},
): { patternId: number; leg: AutoLeg } | null {
  const pool = preferId != null ? patterns.filter(x => Number(x.id) === Number(preferId)) : patterns;
  let best: { patternId: number; leg: AutoLeg; d: number } | null = null;
  for (const pattern of pool) {
    const tol = Number(pattern.legTolNm) > 0 ? Number(pattern.legTolNm) : LEG_NM;
    for (const leg of LEGS) {
      const [a, b] = pattern.legs[leg];
      const { d, u } = projectOnSegment(p, a, b);
      if (d > tol || (best && d >= best.d)) continue;
      if (opts.hdg != null && Number.isFinite(opts.hdg) && angleDiff(opts.hdg, bearingOf(a, b)) > HDG_MATCH_DEG) continue;
      if (pattern.plannedAltFt && opts.altFt != null && Number.isFinite(opts.altFt)) {
        const diff = opts.altFt - pattern.plannedAltFt(leg, u);   // חיובי = מעל
        const above = pattern.altAboveFt, below = pattern.altBelowFt;
        if (above != null && Number.isFinite(above) && diff > above) continue;
        if (below != null && Number.isFinite(below) && -diff > below) continue;
      }
      best = { patternId: pattern.id, leg, d };
    }
  }
  return best ? { patternId: best.patternId, leg: best.leg } : null;
}

/** ההקפה של מטוס שיוצא מהנקודה: שלו, של המסלול שלו, או הקרובה. */
function resolvePattern(a: AutoAircraft, p: GeoPt | null, patterns: PatternGeo[]): PatternGeo | null {
  if (a.patternId != null) {
    const own = patterns.find(x => Number(x.id) === Number(a.patternId));
    if (own) return own;
  }
  if (a.runwayIdent) {
    const byRwy = patterns.find(x => x.runwayIdent === a.runwayIdent);
    if (byRwy) return byRwy;
  }
  return p ? nearestLeg(p, patterns)?.pattern ?? null : null;
}

// ── §5 מכונת המצבים ──────────────────────────────────────────────────────────

const fresh = (): KeyState => ({
  wasNear: false, left: false, outSince: null, cand: null, candSince: 0,
  leg: null, landSince: null, landed: false, lastSeen: null,
});

export function tickPatternAutotrack(
  prev: PatternTrackState,
  input: { strips: AutoStrip[]; aircraft: AutoAircraft[]; tracks: AutoTrack[]; patterns: PatternGeo[]; now: number },
): {
  state: PatternTrackState;
  actions: AutoAction[];
  nearPoint: Set<string>;
  trackIdByKey: Map<string, string>;
} {
  const { strips, aircraft, tracks, patterns, now } = input;
  const gap = prev.lastTick != null && now - prev.lastTick > TICK_GAP_MS;
  const keys: Record<string, KeyState> = {};
  const actions: AutoAction[] = [];
  const nearPoint = new Set<string>();
  const trackIdByKey = new Map<string, string>();

  const mine = new Set(strips.map(s => String(s.stripId)));
  const match = matchFormationTracks(strips, tracks);
  const byId = new Map(tracks.map(t => [t.id, t]));

  for (const a of aircraft) {
    const sid = String(a.stripId);
    if (!mine.has(sid) || a.flightStatus === 'landed') continue;
    const key = aircraftKey(sid, a.idx);
    const ks: KeyState = { ...(prev.keys[key] ?? fresh()) };
    keys[key] = ks;
    if (gap) { ks.outSince = null; ks.cand = null; ks.landSince = null; }
    if (match.ambiguous.has(key)) continue;

    const tid = match.byKey.get(key);
    const t = tid ? byId.get(tid) : undefined;
    const p: GeoPt | null = t ? { lat: t.lat, lon: t.lon } : null;
    if (t && p) { ks.lastSeen = p; trackIdByKey.set(key, t.id); }

    // ── נקודת ההצטרפות ──
    if (p && !a.inPattern && a.pointGeo && !ks.left) {
      const d = nmBetween(p, a.pointGeo);
      if (d <= JOIN_ENTER_NM) {
        ks.wasNear = true; ks.outSince = null; nearPoint.add(key);
      } else if (d > JOIN_EXIT_NM && ks.wasNear) {
        ks.outSince ??= now;
        if (now - ks.outSince >= DWELL_MS) {
          const pat = resolvePattern(a, p, patterns);
          actions.push({ kind: 'leave-point', stripId: sid, idx: a.idx, patternId: pat?.id ?? null, runwayIdent: pat?.runwayIdent ?? a.runwayIdent });
          ks.left = true;
        }
      } else {
        ks.outSince = null;
      }
    }

    // ── צלעות ──
    if (p) {
      const det = detectLeg(p, patterns, a.patternId, { altFt: t?.alt, hdg: t?.hdg });
      const leg = det?.leg ?? null;
      if (leg !== ks.cand) { ks.cand = leg; ks.candSince = now; }
      // "כשפונה לבסיס - מיד לבסיס": ההשהיה נועדה נגד ריצוד בגבול, ובבסיס הכיוון
      // כבר מבטל אותו (מטוס שפנה אינו טס את קו עם הרוח). כל שנייה שם היא שנייה
      // שבה הבאנר, הטבלה וההתראה על ירוקים עוד לא יודעים שהוא בבסיס.
      const dwell = ks.cand === 'base' ? 0 : DWELL_MS;
      if (det && ks.cand && now - ks.candSince >= dwell && ks.cand !== ks.leg) {
        ks.leg = ks.cand;
        if (a.flightStatus !== ks.leg || !a.inPattern) {
          const pat = patterns.find(x => x.id === det.patternId)!;
          actions.push({ kind: 'set-leg', stripId: sid, idx: a.idx, leg: ks.leg, patternId: pat.id, runwayIdent: pat.runwayIdent, inPattern: a.inPattern });
          ks.left = true;
        }
      }
    }

    // ── נחת ──
    if (a.flightStatus === 'final' && !ks.landed) {
      const pat = patterns.find(x => Number(x.id) === Number(a.patternId));
      const near = (q: GeoPt | null) => !!pat && !!q && distToSegmentNm(q, pat.runway[0], pat.runway[1]) <= THRESHOLD_NM;
      const rolling = t ? t.spd < LANDED_SPD_KT && near(p) : near(ks.lastSeen);
      if (rolling) {
        ks.landSince ??= now;
        if (now - ks.landSince >= LANDED_HOLD_MS) {
          actions.push({ kind: 'landed', stripId: sid, idx: a.idx });
          ks.landed = true;
        }
      } else {
        ks.landSince = null;
      }
    }
  }

  return { state: { keys, lastTick: now }, actions, nearPoint, trackIdByKey };
}

// ── §10 קונפליקט: רכיב אווירי זר בטווח ההקפה ────────────────────────────────
//
// "אם מטוס נמצא בהקפה ורכיב אווירי אחר נכנס לטווח הגבהים של ההקפה (לפי פרמטרי
// השדה) - להקפיץ התראה ולהבהב את מי שבקונפליקט" (2026-09-15).
//
// **טווח ההקפה = אותה הגדרה שבה מטוס נחשב על הצלע** (`detectLeg`): הסטייה מהצלע
// והסטייה מעל/מתחת לגובה המתוכנן של ההקפה. **בלי** תנאי כיוון טיסה - פולש שחוצה
// את ההקפה בניצב נמצא בה בדיוק כמו מי שטס לאורכה.
//
// **"זר"** = רכיב שאינו שייך לתנועת השדה (`fieldTrackIds`). בלי זה מטוס מבנה
// שמצטרף מהנקודה לעם הרוח היה מתריע על עצמו ב-3 השניות שלפני שהמנוע מעביר אותו.

/** מפתח קונפליקט: הקפה + רכיב. */
const conflictKey = (patternId: number, trackId: string) => `${patternId}|${trackId}`;

export interface PatternConflict {
  patternId: number;
  trackId: string;
  cs: string;
  alt: number;
  /** `aircraftKey` של המטוסים שבהקפה - מי שמהבהב יחד עם הפולש. */
  aircraftKeys: string[];
}

export interface IntrusionState {
  /** מתי הרכיב נכנס לטווח (ממתין להשהיה). */
  cand: Record<string, number>;
  /** קונפליקט פעיל: מתי הרכיב נראה בטווח לאחרונה. */
  active: Record<string, number>;
}

export const emptyIntrusionState = (): IntrusionState => ({ cand: {}, active: {} });

/**
 * הרכיבים ששייכים לתנועת השדה: שמם דומה לפ"מ כלשהו בנקודות או בהקפה, **מכל
 * עמדה**. במכוון לפי שם בלבד ולא לפי שידוך מלא - רכיב "בננה 9" ברביעייה אינו
 * משודך למטוס, אבל הוא בוודאות לא זר להקפה של בננה.
 */
export function fieldTrackIds(strips: AutoStrip[], tracks: { id: string; cs: string }[]): Set<string> {
  const out = new Set<string>();
  for (const t of tracks) {
    if (strips.some(s => callsignSimilarity(s.callSign, t.cs) >= CALLSIGN_MATCH_MIN)) out.add(t.id);
  }
  return out;
}

export function tickPatternIntrusions(
  prev: IntrusionState,
  input: {
    patterns: PatternGeo[];
    /** מטוסים בהקפה (לא נחתו), לפי הקפה. הקפה ריקה אינה נבדקת. */
    occupants: Map<number, string[]>;
    tracks: AutoTrack[];
    knownTrackIds: Set<string>;
    now: number;
  },
): { state: IntrusionState; conflicts: PatternConflict[] } {
  const { patterns, occupants, tracks, knownTrackIds, now } = input;
  const cand: Record<string, number> = {};
  const active: Record<string, number> = {};
  const conflicts: PatternConflict[] = [];

  for (const pattern of patterns) {
    const aircraftKeys = occupants.get(Number(pattern.id)) || [];
    if (!aircraftKeys.length) continue;
    for (const t of tracks) {
      if (knownTrackIds.has(t.id)) continue;
      const key = conflictKey(pattern.id, t.id);
      const inside = !!detectLeg({ lat: t.lat, lon: t.lon }, [pattern], pattern.id, { altFt: t.alt });
      if (inside) {
        cand[key] = prev.cand[key] ?? now;
        if (prev.active[key] != null || now - cand[key] >= DWELL_MS) active[key] = now;
      } else if (prev.active[key] != null && now - prev.active[key] < DWELL_MS) {
        active[key] = prev.active[key];   // יצא - נשאר עד תום ההשהיה, בלי ריצוד בגבול
      }
      if (active[key] != null) conflicts.push({ patternId: pattern.id, trackId: t.id, cs: t.cs, alt: t.alt, aircraftKeys });
    }
  }
  return { state: { cand, active }, conflicts };
}
