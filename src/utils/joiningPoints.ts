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
  /** המסלול נקבע בחלוקה האוטומטית לפי סדר העדיפויות של הדת"ק. FALSE = נבחר ידנית. */
  runway_auto?: boolean;
  [k: string]: unknown;
}

/**
 * איך נבחר מסלול הנחיתה של המטוס - כדי שהפקח יבדיל במבט בין מה שהמערכת קבעה
 * לבין מה שהוא עצמו בחר. `null` = אין מסלול, אין מה לסמן.
 */
export function runwaySource(row: JoiningAircraftRow | null | undefined): 'auto' | 'manual' | null {
  if (!String(row?.runway_ident ?? '').trim()) return null;
  return row?.runway_auto === true ? 'auto' : 'manual';
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

// ─── גרירה בתוך הטבלה ─────────────────────────────────────────────────────────
//
// גרירת **הפ"מ** מעבירה את כל המבנה; גרירת **מטוס** (אחרי פריסה) מעבירה רק
// אותו. שתיהן מיידיות ובלי טופס - הטופס נשאר לתפריט ⋯, שבו בוחרים כמה מטוסים.

/** הגובה (רגל) של כל מטוס בפ"מ, לפי הבלוק שהוא מצויר בו כרגע. */
export function stripAircraftAlts(map: Map<number, BlockEntry[]>, stripId: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const [ft, entries] of map) {
    for (const e of entries) {
      if (String(e.strip.strip_id) !== String(stripId)) continue;
      for (const idx of e.indices) out.set(idx, ft);
    }
  }
  return out;
}

/**
 * מה נשלח לשרת כששחררו מטוסים של פ"מ על בלוק.
 *
 * @returns `null` = אין מה לעשות (כבר שם) · `[]` = כל המבנה · אחרת - רק המטוסים שנגררו.
 *
 * כשהגרירה משאירה את **כל** המבנה באותו גובה היא נשלחת כ"כל המבנה", כדי
 * שהשרת יאפס את החריגים: אחרת המבנה נראה מאוחד אבל נשאר מפוצל ב-DB, ומעבר
 * הבא של הפ"מ השאיר מטוסים מאחור.
 */
export function dropIndices(
  all: number[], alts: Map<number, number>, moving: number[], targetFt: number,
): number[] | null {
  const list = all.length ? all : moving;
  const movingSet = new Set(moving.length ? moving : list);
  if (list.length && [...movingSet].every(i => alts.get(i) === targetFt)) return null;
  if (list.length <= 1) return [];
  const after = list.map(i => (movingSet.has(i) ? targetFt : alts.get(i)));
  if (after.every(ft => ft === targetFt)) return [];
  return [...movingSet].sort((a, b) => a - b);
}

/**
 * העדכון המיידי של המצב החי אחרי גרירה - אותה פעולה שהשרת עושה ב-`/split`,
 * כדי שהפ"מ יקפוץ לבלוק ברגע השחרור ולא אחרי סבב רשת.
 * פונקציה טהורה: מחזירה מערכים חדשים ולא נוגעת בקלט.
 */
export function applyJoiningMove<S extends Record<string, any>, A extends Record<string, any>>(
  strips: S[], aircraft: A[], pointId: number, stripId: string, indices: number[], alt: string,
): { strips: S[]; aircraft: A[] } {
  const sid = String(stripId).replace(/^s/, '');
  const same = (v: unknown) => String(v) === sid;
  if (!indices.length) {
    return {
      strips: strips.map(s => (same(s.strip_id) && Number(s.joining_point_id) === Number(pointId) ? { ...s, planned_alt: alt } : s)),
      aircraft: aircraft.map(a => (same(a.strip_id) ? { ...a, alt: null } : a)),
    };
  }
  const next = aircraft.map(a => (same(a.strip_id) && indices.includes(Number(a.aircraft_idx)) ? { ...a, alt } : a));
  for (const idx of indices) {
    if (!next.some(a => same(a.strip_id) && Number(a.aircraft_idx) === idx)) {
      next.push({ strip_id: Number(sid), aircraft_idx: idx, joining_point_id: pointId, alt } as unknown as A);
    }
  }
  return { strips, aircraft: next };
}

/**
 * המצב **הסופי** של "קבל" לנקודה - מוחל על המסך לפני שהשרת עונה.
 *
 * הקבלה היא כמה בקשות ברצף (accept -> שיבוץ -> פיצול לכל קבוצת גובה), וכל שלב
 * החיל קודם עדכון מיידי משלו על **תמונה ישנה** של הנקודה, מלפני שהפ"מ שובץ בה.
 * התוצאה: הפ"מ הופיע, נעלם, חזר ונעלם שוב בין השלבים. כאן מחושבת התוצאה
 * שהשרת יגיע אליה בסוף, פעם אחת, כך שהפ"מ נוחת בבלוקים שלו ברגע הלחיצה.
 *
 * `groups` - רק כשהמבנה חולק בטופס לכמה גבהים; קבוצת המוביל ראשונה.
 * פונקציה טהורה: שורות שאינן הפ"מ הזה חוזרות כמות שהן.
 */
export function applyJoiningAccept<S extends Record<string, any>, A extends Record<string, any>>(
  strips: S[], aircraft: A[], pointId: number, transfer: Record<string, any>, alt: string,
  groups?: { alt: string; indices: number[] }[],
): { strips: S[]; aircraft: A[] } {
  const sid = String(transfer?.strip_id ?? '').replace(/^s/, '');
  const same = (v: unknown) => String(v) === sid;
  const prev = strips.find(s => same(s.strip_id) && Number(s.joining_point_id) === Number(pointId));
  const row = {
    ...(prev || {}),
    joining_point_id: pointId,
    strip_id: prev?.strip_id ?? (Number.isFinite(Number(sid)) ? Number(sid) : sid),
    planned_alt: alt,
    alt,
    callsign: transfer?.callsign ?? prev?.callsign,
    sq: transfer?.sq ?? prev?.sq,
    squadron: transfer?.squadron ?? prev?.squadron,
    number_of_formation: transfer?.number_of_formation ?? prev?.number_of_formation,
    notes: transfer?.notes ?? prev?.notes,
  } as unknown as S;
  // פ"מ מצטרף דרך נקודה אחת בלבד - שיבוץ כאן מוריד אותו מכל נקודה אחרת (כמו בשרת)
  const nextStrips = [...strips.filter(s => !same(s.strip_id)), row];

  const split = (groups || []).filter(g => g.indices?.length);
  if (split.length <= 1) {
    return { strips: nextStrips, aircraft: aircraft.map(a => (same(a.strip_id) && a.alt != null ? { ...a, alt: null } : a)) };
  }
  let next = aircraft;
  for (const g of split) next = applyJoiningMove([], next, pointId, sid, g.indices, g.alt).aircraft;
  return { strips: nextStrips, aircraft: next };
}

/**
 * שער סנכרון בין הפולינג לבין פעולות הפקח בנקודה.
 *
 * הפולינג (5 שניות) שולף תמונה מלאה. תמונה שיצאה **לפני** פעולה וחזרה **אחריה**,
 * או כזו שחוזרת באמצע פעולה רב-שלבית, מחזירה את המצב הישן על המסך - והפ"מ
 * "קופץ אחורה" לרגע. `begin` פותח פעולה ומחזיר את סגירתה; `canApply` מקבל את
 * החותמת מרגע יציאת הבקשה.
 */
export function createJoiningSyncGate() {
  let gen = 0;
  let busy = 0;
  return {
    begin(): () => void {
      gen++;
      busy++;
      let open = true;
      return () => { if (open) { open = false; busy--; } };
    },
    stamp: () => gen,
    canApply: (stamp: number) => busy === 0 && stamp === gen,
  };
}

/**
 * האם מטוסי הפ"מ פרוסים. `toggled` מחזיק את מה שהפקח **שינה** מברירת המחדל,
 * כך שהגדרת הנקודה ("פרוס כברירת מחדל") והלחיצה על +/− לא מתנגשות.
 */
export function isFormationOpen(expandByDefault: boolean, toggled: Set<string>, key: string): boolean {
  return expandByDefault ? !toggled.has(key) : toggled.has(key);
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

// ─── קבלה לנקודה: גובה לכל מספר במבנה ────────────────────────────────────────
//
// לפני הקבלה הפקח בוחר גבהים - אחד או יותר - ומשייך לכל מטוס במבנה את הגובה
// שלו. גובה אחד = כל המבנה. אין יותר גבהים ממטוסים: בודד מקבל גובה אחד, זוג
// עד שניים. אחרי הקבלה המבנה נפרס בטבלה לפי השיוך, דרך מנגנון הפיצול הקיים.

/** כמה גבהים מותר לבחור לפ"מ - כמספר המטוסים במבנה (לפחות 1, חסם 16). */
export function acceptAltitudeLimit(numberOfFormation: unknown): number {
  const n = Math.floor(num(numberOfFormation)) || 0;
  return Math.max(1, Math.min(n, 16));
}

/**
 * לחיצה על גובה בטופס הקבלה. בודד מתנהג כרדיו (בחירה אחרת מחליפה), ובמבנה
 * שהגיע לתקרה גובה נוסף אינו נכנס - הטופס מציג אותו כנעול, לא כלחיצה שלא עשתה כלום.
 */
export function toggleAcceptAltitude(selected: number[], ft: number, limit: number): number[] {
  const cur = selected || [];
  if (cur.includes(ft)) return cur.filter(a => a !== ft);
  if (limit <= 1) return [ft];
  if (cur.length >= limit) return cur;
  return [...cur, ft];
}

/**
 * שיוך ברירת המחדל של מטוסים לגבהים: המוביל (#1) בנמוך ומשם כלפי מעלה, וכשיש
 * פחות גבהים ממטוסים - קבוצות רצופות ("1,2" בנמוך, "3,4" בגבוה). כל גובה שנבחר
 * מקבל לפחות מטוס אחד, כי k ≤ n.
 */
export function distributeAltitudes(indices: number[], altsFt: number[]): Record<number, number> {
  const alts = [...new Set(altsFt || [])].sort((a, b) => a - b);
  const list = [...(indices || [])].sort((a, b) => a - b);
  const out: Record<number, number> = {};
  if (!alts.length || !list.length) return out;
  list.forEach((idx, pos) => {
    out[idx] = alts[Math.min(alts.length - 1, Math.floor((pos * alts.length) / list.length))];
  });
  return out;
}

/**
 * השיוך כקבוצות לשליחה. **קבוצת המוביל ראשונה** - הגובה שלה הוא גובה הפ"מ
 * (`strips.alt`), והשאר נרשמות כגובה חריג למטוסים שלהן.
 */
export function altitudeGroups(mapping: Record<number, number>): { ft: number; indices: number[] }[] {
  const groups = new Map<number, number[]>();
  const entries = Object.entries(mapping || {})
    .map(([k, v]) => [Number(k), num(v)] as const)
    .sort((a, b) => a[0] - b[0]);
  for (const [idx, ft] of entries) {
    if (!groups.has(ft)) groups.set(ft, []);
    groups.get(ft)!.push(idx);
  }
  return [...groups].map(([ft, indices]) => ({ ft, indices }));
}

/**
 * בלוקים שכבר יושב בהם פ"מ **אחר** - בטופס הקבלה הם כתומים. הבחירה בהם
 * **מותרת** ורק מתריעה: ההכרעה נשארת אצל הפקח.
 */
export function occupiedBlocks<T extends JoiningPointStripRow>(
  map: Map<number, BlockEntry<T>[]>, exceptStripId?: string | number | null,
): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const [block, entries] of map || []) {
    const strips = new Map<string, T>();
    for (const e of entries) {
      const sid = String(e.strip.strip_id);
      if (exceptStripId != null && sid === String(exceptStripId)) continue;
      strips.set(sid, e.strip);
    }
    if (strips.size) out.set(block, [...strips.values()]);
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

// ─── תפריט המצב במקום "שים בהקפה" ─────────────────────────────────────────────
//
// כפתור "שים בהקפה / הוצא מההקפה" לצד תפריט שבו כבר יש עה"ר אמר את אותו דבר
// פעמיים - ויכול היה לסתור: "בהקפה" עם "ללא", או עה"ר בלי הקפה. עכשיו **התפריט
// הוא מקור ההחלטה**: צלע הקפה = בהקפה, "בנקודת הצטרפות" = מחוץ לה.

/** ערך ה"ללא" של `flight_status` - בתפריט הוא מוצג "בנקודת הצטרפות" (ברירת המחדל). */
export const JOINING_LEG = 'none' as const;
const PATTERN_LEGS = new Set<string>(['downwind', 'base', 'final']);

/** מה התפריט מציג: מטוס בהקפה בלי צלע (רשומה ישנה) הוא בעה"ר ולא "בנקודה". */
export function displayLeg(status: unknown, inPattern: boolean): FlightLeg | typeof JOINING_LEG {
  const leg = normalizeLeg(status);
  return leg === 'none' && inPattern ? DEFAULT_LEG : leg;
}

/**
 * בחירה בתפריט -> מה לכתוב. `inPattern` מופיע רק כשהוא **משתנה**.
 * צלע הקפה בלי מסלול חסומה (`null`): הקפה משויכת לקצה מסלול, ומטוס בהקפה בלי
 * מסלול הוא סימון על המפה שאינו אומר לאן הוא נכנס.
 */
export function legChange(
  cur: { inPattern: boolean; hasRunway: boolean }, leg: string,
): { status: string; inPattern?: boolean } | null {
  if (PATTERN_LEGS.has(leg)) {
    if (cur.inPattern) return { status: leg };
    return cur.hasRunway ? { status: leg, inPattern: true } : null;
  }
  if (leg === JOINING_LEG) return cur.inPattern ? { status: JOINING_LEG, inPattern: false } : { status: JOINING_LEG };
  return { status: leg };
}

/**
 * **מטוס בדרך לנחיתה ולא דיווח ירוקים.**
 * דיווח הירוקים (גלגלים) הוא התנאי לנחיתה בטוחה, והפקח חייב לתפוס את החסר
 * בעצמו. מעכשיו (2026-09-15, הכרעת הפקח) ההתראה נדלקת **מהבסיס**: בפיינל
 * המטוס כבר בקו הנחיתה, ושם מאוחר מדי לגלות. כלל אחד לבאנר, לטבלת "בהקפה",
 * להבהוב ולהתראה המתפרצת.
 */
export function greensAlert(status: unknown, greens: unknown): boolean {
  const leg = normalizeLeg(status);
  return (leg === 'base' || leg === 'final') && !greens;
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

/**
 * עדכון מיידי של שורת מטוס בהקפה (`joining_point_aircraft`) - ירוקים או סטטוס.
 *
 * טבלת "בהקפה", שכבת ההקפה והבאנר קוראים את השורות האלה, והן מתרעננות רק בפולינג
 * של 5 שניות. העדכון המקומי של `strip_aircraft` לא הגיע אליהן, ולכן לחיצה על
 * ירוקים בטבלה נראתה "לוקחת הרבה זמן" - הדיווח נשמר, והמסך חיכה לסבב הבא.
 * פונקציה טהורה: שורה שאינה המטוס הזה חוזרת **כמות שהיא** (אותו אובייקט).
 */
export function patchJoiningAircraft<A extends Record<string, any>>(
  rows: A[], stripId: string | number, idx: number, patch: Partial<A>,
): A[] {
  const sid = String(stripId).replace(/^s/, '');
  return rows.map(r => (String(r.strip_id) === sid && Number(r.aircraft_idx) === Number(idx) ? { ...r, ...patch } : r));
}

/**
 * התור של ההתראה המתפרצת: מי **נכנס** למצב מאז הטיק הקודם.
 *
 * פעם אחת לכל כניסה, לא בכל רענון - התראה מתפרצת שקופצת שוב כל 5 שניות על אותו
 * מטוס מלמדת את הפקח ללחוץ "אישור" בלי לקרוא. מטוס שיצא מהמצב (דיווח ירוקים,
 * נחת, חזר לעם הרוח) נמחק מ-`seen`, ולכן כניסה חוזרת מתריעה שוב.
 */
export function greensPopupQueue(
  seen: Set<string>, current: GreensAlertRow[],
): { fresh: GreensAlertRow[]; seen: Set<string> } {
  return freshEntries(seen, current, r => `${r.stripId}|${r.idx}`);
}

/**
 * אותו כלל לכל התראה מתפרצת (ירוקים, קונפליקט בהקפה): **פעם אחת לכל כניסה
 * למצב**, לפי מפתח שהקורא מגדיר. מי שיצא מהמצב נשכח, ולכן כניסה חוזרת מתריעה.
 */
export function freshEntries<T>(
  seen: Set<string>, current: T[], keyOf: (item: T) => string,
): { fresh: T[]; seen: Set<string> } {
  const next = new Set<string>();
  const fresh: T[] = [];
  for (const r of current) {
    const key = keyOf(r);
    if (next.has(key)) continue;
    next.add(key);
    if (!seen.has(key)) fresh.push(r);
  }
  return { fresh, seen: next };
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
