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
  is_coordinated?: boolean;
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

/** מיפוי בלוק -> הפ"ממים שיושבים עליו. פ"מ שגובהו אינו על בלוק אינו מוצג. */
export function formationsInBlocks<T extends JoiningPointStripRow>(
  blocks: number[], rows: T[],
): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const b of blocks || []) map.set(b, []);
  for (const r of rows || []) {
    const ft = displayToAlt(r?.alt);
    if (ft == null) continue;
    const b = blockOf(blocks, ft);
    if (b == null) continue;
    map.get(b)!.push(r);
  }
  return map;
}

/**
 * הבלוקים שבהם **שני פ"ממים או יותר** - קונפליקט.
 * קונפליקט ש**כל** משתתפיו סומנו כמתואמים יורד מהאדום; מספיק שאחד לא אושר
 * כדי שהבלוק יישאר אדום, כי התיאום הוא בין השניים ולא של אחד לבדו.
 */
export function conflictBlocks(map: Map<number, JoiningPointStripRow[]>): Set<number> {
  const out = new Set<number>();
  for (const [block, rows] of map) {
    if (rows.length > 1 && rows.some(r => !r.is_coordinated)) out.add(block);
  }
  return out;
}

/** שורת מטוס לפריסה בטבלה. `id` קיים רק כשהיא באמת מ-`strip_aircraft`. */
export interface FormationAircraftRow {
  id?: number;
  idx: number;
  datk: number | null;
  kipa: string | null;
  flight_status?: string | null;
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
