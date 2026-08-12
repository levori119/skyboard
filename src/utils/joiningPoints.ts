// ─── נקודות הצטרפות (STAR) - לוגיקת הבלוקים ───────────────────────────────────
//
// נקודת הצטרפות נפרסת ל**טבלת בלוקי גבהים**, ופ"מ יושב בבלוק לפי גובהו. הגובה
// נשמר **ברגל** (4000) ומוצג **במאות** (040) - בדיוק כמו שנכתב על הסדק.
//
// ההפרש בין בלוקים **אינו קבוע לאורך הטווח**: אפשר 1000 רגל בין 4000 ל-7000
// ו-500 רגל בין 7000 ל-10000. לכן בניית השורות אינה לולאה אחת אלא חלוקה
// לקטעים, כשקטע שלא כוסה בהגדרה נופל להפרש ברירת המחדל של הנקודה.
//
// כל הקובץ הוא לוגיקה טהורה כדי שאפשר יהיה לבדוק אותו ב-vitest בלי DOM ובלי DB:
// טעות בבניית הבלוקים היא טעות **בטיחותית** (בלוק חסר = מטוס שלא נראה).

/** טווח עם הפרש גבהים משלו, כפי שהוא ב-`joining_point_alt_steps`. */
export interface AltStep { from_ft: number; to_ft: number; step_ft: number }

/** הנקודה כפי שהיא ב-`airfield_joining_points` - רק מה שנדרש לבניית הטבלה. */
export interface JoiningPoint {
  id: number;
  name: string;
  alt_min_ft: number;
  alt_max_ft: number;
  default_step_ft: number;
  steps: AltStep[];
}

/** פ"מ שיושב בנקודה. `alt` מגיע מ-`strips.alt` ולכן הוא **במאות רגל**. */
export interface JoiningPointStripRow {
  strip_id: number | string;
  alt: string | null | undefined;
  /** הגובה שהפקח תכנן בבלוק. גובר על `alt`, וגם קיים לפני שהפ"מ התקבל. */
  planned_alt?: string | null;
  is_coordinated?: boolean;
  number_of_formation?: number | string | null;
  [k: string]: unknown;
}

/** מצב מטוס בודד, מ-`joining_point_aircraft`. */
export interface JoiningAircraftRow {
  aircraft_idx: number;
  strip_id?: number | string;
  joining_point_id?: number | null;
  runway_ident?: string | null;
  pattern_id?: number | null;
  in_pattern?: boolean;
  pattern_frac?: number | null;
  /** גובה חריג למטוס הבודד - פיצול המבנה. NULL = הולך עם הפ"מ. */
  alt?: string | null;
  [k: string]: unknown;
}

/** תקרת ביטחון מול הגדרה שגויה (טווח ענק עם הפרש זעיר) - לא לתלות את הדפדפן. */
const MAX_BLOCKS = 400;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** גובה ברגל -> תצוגה תלת-ספרתית במאות: 4000 -> `040`, 10000 -> `100`. */
export function altToDisplay(ft: number): string {
  return String(Math.round(num(ft) / 100)).padStart(3, '0');
}

/** תצוגה במאות -> רגל: `040` -> 4000. מחזיר null כשאין מספר. */
export function displayToAlt(alt: string | null | undefined): number | null {
  const m = String(alt ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) * 100 : null;
}

const range = (p: Pick<JoiningPoint, 'alt_min_ft' | 'alt_max_ft'>) => {
  const a = num(p?.alt_min_ft), b = num(p?.alt_max_ft);
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
};

/**
 * שורות הטבלה: כל גבהי הבלוקים **מלמעלה למטה** (הגבוה ראשון, כמו בטבלה על הסדק).
 * גבולות הטווח תמיד נכללים, גם כשההפרש אינו מתחלק בהם.
 */
export function buildBlocks(point: JoiningPoint): number[] {
  const { lo, hi } = range(point);
  if (hi <= lo) return [lo];

  const def = num(point?.default_step_ft);
  // רק טווחים חוקיים ובתוך הגבולות, ממוינים - כדי שהחלוקה לקטעים תהיה רציפה.
  const steps = (point?.steps || [])
    .map(s => {
      const a = num(s?.from_ft), b = num(s?.to_ft);
      return { from: Math.max(lo, Math.min(a, b)), to: Math.min(hi, Math.max(a, b)), step: num(s?.step_ft) };
    })
    .filter(s => s.to > s.from)
    .sort((a, b) => a.from - b.from);

  const segments: { from: number; to: number; step: number }[] = [];
  let cur = lo;
  for (const s of steps) {
    if (s.to <= cur) continue;                                   // נבלע בקטע קודם
    if (s.from > cur) segments.push({ from: cur, to: s.from, step: def });
    segments.push({ from: Math.max(s.from, cur), to: s.to, step: s.step });
    cur = s.to;
    if (cur >= hi) break;
  }
  if (cur < hi) segments.push({ from: cur, to: hi, step: def });

  const out = new Set<number>();
  for (const seg of segments) {
    out.add(seg.from);
    // הפרש 0 או שלילי הוא הגדרה שבורה, לא סיבה ללולאה אינסופית: הקטע מיוצג
    // בגבולותיו בלבד, וההגדרה נראית שבורה למשתמש במקום להקפיא את העמדה.
    if (seg.step > 0) {
      for (let a = seg.from + seg.step; a < seg.to && out.size < MAX_BLOCKS; a += seg.step) out.add(a);
    }
    out.add(seg.to);
  }
  return [...out].sort((a, b) => b - a);
}

/**
 * זוגות אינדקסים של טווחי הפרשים **חופפים**. טווחים צמודים (7000 כסוף האחד
 * ותחילת השני) אינם חפיפה - זו הדרך הרגילה להגדיר שני הפרשים.
 */
export function findStepOverlaps(steps: AltStep[]): [number, number][] {
  const norm = (steps || []).map(s => {
    const a = num(s?.from_ft), b = num(s?.to_ft);
    return { from: Math.min(a, b), to: Math.max(a, b) };
  });
  const out: [number, number][] = [];
  for (let i = 0; i < norm.length; i++) {
    for (let j = i + 1; j < norm.length; j++) {
      if (Math.max(norm[i].from, norm[j].from) < Math.min(norm[i].to, norm[j].to)) out.push([i, j]);
    }
  }
  return out;
}

/** הבלוק שהגובה יושב עליו **בדיוק**, או null. */
export function blockOf(blocks: number[], ft: number): number | null {
  return (blocks || []).includes(ft) ? ft : null;
}

/** הבלוק הקרוב ביותר - לגרירה. בתיקו מצמידים **כלפי מעלה** (הצד הבטוח). */
export function nearestBlock(blocks: number[], ft: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const b of blocks || []) {
    const d = Math.abs(b - ft);
    if (d < bestD || (d === bestD && best !== null && b > best)) { best = b; bestD = d; }
  }
  return best;
}

/** האם הגובה בתוך טווח הנקודה - טופס הגובה מציע רק גבהים מהטווח. */
export function isAltInPoint(point: JoiningPoint, ft: number): boolean {
  const { lo, hi } = range(point);
  return ft >= lo && ft <= hi;
}

/** רשומה אחת בתוך בלוק: פ"מ, ואילו ממטוסיו יושבים דווקא כאן. */
export interface BlockEntry<T extends JoiningPointStripRow = JoiningPointStripRow> {
  strip: T;
  /** מספרי המטוסים במבנה שנמצאים בבלוק הזה. ריק = לא ידוע מספר המטוסים. */
  indices: number[];
  /** האם זו רק **חלק** מהמבנה - כלומר המבנה מפוצל בין בלוקים. */
  partial: boolean;
}

/** הגובה שקובע את מיקום הפ"מ בטבלה: המתוכנן גובר על מה שנשלח. */
export const effectiveStripAlt = (r: JoiningPointStripRow): string | null | undefined =>
  (r?.planned_alt ?? null) || r?.alt;

/**
 * מיפוי בלוק -> מה יושב עליו.
 *
 * **פיצול מבנה:** מטוס בודד יכול לשאת גובה משלו (`joining_point_aircraft.alt`),
 * ואז אותו פ"מ מופיע בשני בלוקים - חלק מהמטוסים כאן וחלק שם - בלי שהמבנה
 * יפוצל לשתי רשומות. זו הכתיבה שעל הסדק: "בננה 1,2" בגובה אחד ו"בננה 3,4" באחר.
 *
 * גובה שאינו נופל על אף בלוק אינו מוצג - לא בשורה שגויה ולא בשקט על בלוק אחר.
 */
export function formationsInBlocks<T extends JoiningPointStripRow>(
  blocks: number[], rows: T[], aircraftRows: JoiningAircraftRow[] = [],
): Map<number, BlockEntry<T>[]> {
  const map = new Map<number, BlockEntry<T>[]>();
  for (const b of blocks || []) map.set(b, []);

  // גובה חריג לכל מטוס, לפי פ"מ
  const acAlt = new Map<string, Map<number, string>>();
  for (const a of aircraftRows || []) {
    const alt = (a?.alt ?? '') as string;
    if (!alt) continue;
    const key = String(a.strip_id ?? '');
    if (!acAlt.has(key)) acAlt.set(key, new Map());
    acAlt.get(key)!.set(num(a.aircraft_idx), alt);
  }

  for (const r of rows || []) {
    const baseFt = displayToAlt(effectiveStripAlt(r));
    const n = Math.max(0, Math.min(Math.floor(num(r.number_of_formation)) || 0, 16));
    const overrides = acAlt.get(String(r.strip_id)) || new Map<number, string>();

    // קיבוץ מטוסי המבנה לפי הגובה האפקטיבי שלהם
    const byFt = new Map<number, number[]>();
    for (let i = 1; i <= n; i++) {
      const ft = displayToAlt(overrides.get(i)) ?? baseFt;
      if (ft == null) continue;
      if (!byFt.has(ft)) byFt.set(ft, []);
      byFt.get(ft)!.push(i);
    }

    // פ"מ בלי מספר מטוסים ידוע - שורה אחת על גובה הפ"מ, בלי מספרים
    if (n === 0) {
      const b = baseFt != null ? blockOf(blocks, baseFt) : null;
      if (b != null) map.get(b)!.push({ strip: r, indices: [], partial: false });
      continue;
    }

    const split = byFt.size > 1;
    for (const [ft, indices] of byFt) {
      const b = blockOf(blocks, ft);
      if (b == null) continue; // גובה מחוץ לטבלה - לא מוצג
      map.get(b)!.push({ strip: r, indices, partial: split });
    }
  }
  return map;
}

/**
 * הבלוקים שבהם **שני פ"ממים או יותר** - קונפליקט.
 * נספרים פ"ממים **שונים** ולא רשומות: מבנה מפוצל אינו בקונפליקט עם עצמו.
 * קונפליקט ש**כל** משתתפיו סומנו כמתואמים יורד מהאדום; מספיק שאחד לא אושר
 * כדי שהבלוק יישאר אדום, כי התיאום הוא בין השניים ולא של אחד לבדו.
 */
export function conflictBlocks(map: Map<number, BlockEntry[]>): Set<number> {
  const out = new Set<number>();
  for (const [block, entries] of map) {
    const strips = new Map<string, JoiningPointStripRow>();
    for (const e of entries) strips.set(String(e.strip.strip_id), e.strip);
    if (strips.size > 1 && [...strips.values()].some(s => !s.is_coordinated)) out.add(block);
  }
  return out;
}

/**
 * האם הגובה שהעמדה המוסרת שלחה שונה מהגובה שתוכנן בבלוק.
 *
 * נקודת הצטרפות היא לעתים גם **נקודת העברה**: הפקח כבר שיבץ את הפ"מ לבלוק,
 * והעמדה השנייה שולחת אותו בגובה אחר. זו אינה שגיאה שצריך לתקן בשקט אלא
 * **התראה** - שני אנשים מחזיקים תמונה שונה על אותו מטוס.
 * ההשוואה מספרית: `070` ו-`70` הם אותו גובה, לא פער.
 */
export function altMismatch(plannedAlt: string | null | undefined, sentAlt: string | null | undefined): boolean {
  const p = displayToAlt(plannedAlt);
  const s = displayToAlt(sentAlt);
  if (p == null || s == null) return false;
  return p !== s;
}

// ─── מצב המטוס בהקפה ──────────────────────────────────────────────────────────
//
// שני דברים **נפרדים**, ולא עמודה אחת:
//   `flight_status` - **איפה** המטוס: עה"ר -> בסיס -> פיינל -> נחת. בלעדי.
//   `greens`        - **האם דיווח ירוקים**. דגל, ולא שלב בהקפה: הטייס יכול
//                     לדווח בכל צלע, והמטוס ממשיך להתקדם בלי קשר לדיווח.
//
// כשהם חיו באותה עמודה, סימון "ירוקים" מחק את הצלע - והמטוס נעלם מההקפה.

/** צלעות ההקפה לפי **סדר הטיסה**, וזה גם הסדר בתפריט. */
export const FLIGHT_LEGS = ['downwind', 'base', 'final', 'landed'] as const;
export type FlightLeg = (typeof FLIGHT_LEGS)[number];

/** הצלע שבה מטוס נכנס להקפה - "שים בהקפה" מתחיל בעה"ר. */
export const DEFAULT_LEG: FlightLeg = 'downwind';

/** `cleared_to_land` הוא השם ההיסטורי של פיינל - רשומות ותיקות לא נשברות. */
export function normalizeLeg(status: unknown): FlightLeg | 'none' {
  const s = String(status ?? '').trim();
  if (s === 'cleared_to_land') return 'final';
  // "ירוקים" היה מצב לפני שהופרד לדגל; רשומה כזו מתפרשת כמטוס בעה"ר
  if (s === 'greens') return 'downwind';
  return (FLIGHT_LEGS as readonly string[]).includes(s) ? (s as FlightLeg) : 'none';
}

/**
 * **מטוס נוחת ולא דיווח ירוקים.**
 * בפיינל המטוס כבר בקו הנחיתה, ודיווח הירוקים (גלגלים) הוא התנאי לנחיתה
 * בטוחה. פיינל בלי דיווח הוא בדיוק המצב שהפקח חייב לתפוס בעצמו - ולכן
 * ההתראה נדלקת שם, ולא ברגע הנחיתה שבו כבר מאוחר.
 */
export function greensAlert(status: unknown, greens: unknown): boolean {
  return normalizeLeg(status) === 'final' && !greens;
}

/** מטוס שההתראה חלה עליו, מוכן לתצוגה בבאנר. */
export interface GreensAlertRow { stripId: string; idx: number; label: string }

/**
 * כל המטוסים שבפיינל בלי דיווח ירוקים - מקור אחד לבאנר העליון ולסימון בטבלה.
 * הרשימה ממוינת (או"ק ואז מספר במבנה) כדי שהסדר לא יקפוץ בין רענוני הפולינג
 * ויהיה אפשר לקרוא אותה במבט חטוף.
 */
export function collectGreensAlerts(
  strips: { id: number | string; callsign?: string | null }[],
  byStrip: Record<string, { idx: number; flight_status?: string | null; greens?: boolean | null }[]>,
): GreensAlertRow[] {
  const out: GreensAlertRow[] = [];
  for (const s of strips || []) {
    const sid = String(s.id);
    for (const ac of byStrip?.[sid] || []) {
      if (!greensAlert(ac.flight_status, ac.greens)) continue;
      out.push({ stripId: sid, idx: ac.idx, label: `${s.callsign || ''}${ac.idx}` });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label) || a.idx - b.idx);
}

/** שורת מטוס לפריסה בטבלה. `id` קיים רק כשהיא באמת מ-`strip_aircraft`. */
export interface FormationAircraftRow {
  id?: number;
  idx: number;
  datk: number | null;
  kipa: string | null;
  /** איפה המטוס בהקפה. **אינו** נושא את דיווח הירוקים - ראה `greens`. */
  flight_status?: string | null;
  /** האם דיווח ירוקים. דגל עצמאי, נכון בכל צלע. */
  greens?: boolean | null;
}

/**
 * מטוסי הפ"מ לפריסה תחת ה-`+`.
 *
 * `strip_aircraft` נוצרות רק כשמישהו נגע במטוס הבודד (דת"ק/כיפה), ולכן פ"מ
 * שהגיע בהעברה יכול להיות **בלי שורות בכלל** - ואז הפריסה נפתחה לרשימה ריקה
 * והנראה היה כאילו הכפתור אינו עובד. הפריסה היא של ה**מבנה**, ולכן כשאין
 * שורות היא נגזרת ממספר המטוסים; חסם 16 מונע פריסה אינסופית מערך שגוי.
 */
export function formationAircraft(
  rows: FormationAircraftRow[] | undefined,
  numberOfFormation: unknown,
): FormationAircraftRow[] {
  if (rows && rows.length) return rows;
  const n = Math.max(0, Math.min(Math.floor(num(numberOfFormation)) || 0, 16));
  return Array.from({ length: n }, (_, i) => ({ idx: i + 1, datk: null, kipa: null, flight_status: 'none' }));
}

/**
 * האם **כל** מטוסי הפ"מ בהקפה - ואז הפ"מ כולו נעלם מנקודת ההצטרפות.
 * נבדק מול מספר המטוסים במבנה ולא מול השורות שהתקבלו: שורת מצב של מטוס
 * שכבר אינו במבנה (אחרי פיצול) לא תזייף "כולם בהקפה".
 */
export function allAircraftInPattern(aircraftCount: number, rows: JoiningAircraftRow[]): boolean {
  const n = num(aircraftCount);
  if (n <= 0) return false;
  const inPattern = new Set((rows || []).filter(r => r?.in_pattern).map(r => num(r.aircraft_idx)));
  for (let i = 1; i <= n; i++) if (!inPattern.has(i)) return false;
  return true;
}

/**
 * נקודת הירוקים של השדה - הנקודה שאליה מוצמד מטוס בסטטוס `greens`.
 *
 * מקור האמת הוא `point_type='greens'` שנקבע בעמדת הניהול. לשדות ותיקים שבהם
 * הנקודה כבר קיימת בשם בלבד יש נפילה לזיהוי לפי השם, כדי שלא יידרש מעבר ידני
 * על כל השדות - אבל הסוג המפורש גובר תמיד.
 */
export function greensPoint<T extends { point_type?: string | null; name?: string | null }>(points: T[]): T | null {
  const list = points || [];
  const byType = list.find(p => String(p.point_type ?? '').trim() === 'greens');
  if (byType) return byType;
  return list.find(p => /ירוק/.test(String(p.name ?? ''))) || null;
}
