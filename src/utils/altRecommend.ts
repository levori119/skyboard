/**
 * **המלצת גובה בכניסת פ"מ לעמדה** - הלוגיקה הטהורה.
 *
 * כשפ"מ נגרר לטבלת העמדה, המערכת מציעה לו בלוק (או בלוקים) מטבלת הבלוקים של
 * העמדה, ובוחרת אותם מראש בחלון ההמלצה. הפקח מאשר בלחיצה או משנה.
 *
 * | כלל | |
 * |---|---|
 * | **כמה בלוקים** | עד שלישייה - בלוק אחד. מרביעייה - בלוק לכל זוג, **סמוכים** (4 = 2 בלוקים) |
 * | **פנוי** | בלוק שיש בו **גובה פנוי** בהפרדה של 1000 רגל מכל פ"מ אחר בעמדה (גם בבלוק סמוך) - לא בלוק ריק. קודם נדרש בלוק ריק, ובלוק עם פ"מ אחד בתחתיתו נחשב תפוס |
 * | **חוק חימוש** | בהגדרות העמדה (`alt_armament_rules`): חימוש ← נמוך/בינוני/גבוה (שליש מבלוקי העמדה), גובה פיזי, טווח, או **טבלת עדיפויות גבהים** |
 * | **עדיפות גבהים** | "עדיפות חימושים" בהגדרות המבצעיות של העמדה: הגבהים המועדפים ליציאה לתקיפה לפי הסדר. הראשון שפנוי **בדיוק** בבלוקים שלי; אחרת הגובה הפנוי הקרוב לעדיפות הראשונה שבבלוקים שלי; ואם אף גובה מהטבלה אינו בבלוקים שלי - הבלוק עם הגובה הקרוב לגובה הנדרש (העדיפות הראשונה) |
 * | **אין חוק** | הקרוב לגובה הנוכחי של הפ"מ, ואם אין לו - הנמוך הפנוי |
 * | **הגובה** | הנמוך הפנוי בבלוק (בחוק בגובה פיזי / גובה נוכחי - הקרוב אליו) |
 * | **אין גובה פנוי** | מחפשים פ"מ **אחד** שמפריע לרצף ויכול לעבור לגובה פנוי בבלוק אחר - ומציעים להטפיס/להנמיך אותו |
 *
 * גבהים בבלוקים הם ב**מאות רגל** (`alt_from`/`alt_to`, כמו FL), ובחוקים ב**רגל** -
 * כפי שהם מוקלדים בהגדרות.
 */

export interface RecBlock {
  id: number;
  /** מאות רגל */
  alt_from: number;
  alt_to: number;
  mission?: string | null;
  /** מרחב החלוקה של הבלוק (ריק = כל המרחבים) */
  space_id?: number | null;
  block_table_id?: number;
}

/**
 * הבלוקים שהעמדה רשאית להמליץ עליהם: מטבלאות העמדה (או בלוק שהעמדה רשומה
 * עליו), **בלי** בלוק ששויך לעמדות אחרות. כשלעמדה יש בלוקים משויכים - **רק**
 * הם (בלוק בלי עמדות אינו שלה, כמו בחריגה מבלוק - `computeBlockDeviation`);
 * כשאין לה אף אחד - הבלוקים שלא שויכו לאף עמדה.
 * קודם הוצעו גם בלוקים של עמדות אחרות - ההמלצה "חרגה" לבלוק של שכן.
 */
export function stationRecBlocks(
  allBlocks: unknown[], tableIds: number[], presetId: number | null, activeTableId?: number | null,
): RecBlock[] {
  const wsOf = (b: Record<string, unknown>): number[] => (Array.isArray(b.workstations) ? b.workstations.map(Number) : []);
  return (Array.isArray(allBlocks) ? allBlocks : [])
    .map(b => (b && typeof b === 'object' ? b as Record<string, unknown> : {}))
    .filter(b => {
      const ws = wsOf(b);
      const inTable = tableIds.includes(Number(b.block_table_id));
      const mine = presetId !== null && ws.includes(presetId);
      if (!inTable && !mine) return false;
      return !(ws.length > 0 && !mine); // בלוק של עמדה אחרת
    })
    // לעמדה יש בלוקים משויכים - הם, מכל טבלה (הטבלה המוצגת אינה משנה, כמו
    // ב-computeBlockDeviation). אחרת - הלא-משויכים של הטבלה הפעילה
    .filter((b, _i, all) => {
      const anyMine = presetId !== null && all.some(x => wsOf(x).includes(presetId));
      if (anyMine) return wsOf(b).includes(presetId as number);
      return !activeTableId || Number(b.block_table_id) === Number(activeTableId);
    })
    .map(b => ({
      id: Number(b.id), alt_from: Number(b.alt_from), alt_to: Number(b.alt_to),
      mission: (b.mission as string) || null, space_id: (b.space_id as number | null) ?? null, block_table_id: Number(b.block_table_id),
    }));
}

export type AltRuleBand = 'low' | 'mid' | 'high';

export interface AltArmamentRule {
  armament: string;
  kind: 'band' | 'alt' | 'range' | 'priority';
  /** עדיפות גבהים ברגל, לפי הסדר - הראשון הוא הגובה הנדרש */
  alts_ft?: number[];
  band?: AltRuleBand;
  /** גובה פיזי ברגל */
  alt_ft?: number | null;
  min_ft?: number | null;
  max_ft?: number | null;
}

export interface RecOtherStrip {
  id: string;
  label: string;
  alt: string;
}

export interface AltMove {
  stripId: string;
  label: string;
  fromBlockId: number;
  toBlockId: number;
  direction: 'climb' | 'descend';
  /** הגובה החדש של הפ"מ המוזז, באותו פורמט של `strips.alt` */
  newAlt: string;
}

/** גובה שפ"מ אחר תופס, במאות רגל */
export interface TakenAlt { lo: number; hi: number; label: string }

export interface AltRecommendation {
  /** כמה בלוקים נדרשים */
  needed: number;
  /** הבלוקים המומלצים, מהנמוך לגבוה. ריק = אין המלצה */
  blockIds: number[];
  /** הגובה שייכתב לפ"מ באישור (`assignedAltitude`) */
  alt: string;
  /** הגובה התחתון של ההקצאה (מאות רגל) - נקודת הפתיחה של ▲▼ בחלון */
  start?: number;
  /** הגבהים שפ"מים אחרים תופסים - כדי שגם בחירה ידנית תתחיל בגובה פנוי */
  taken: TakenAlt[];
  /** בלוק שאין בו גובה פנוי למבנה (לבדו) - "תפוס" באדום; אחר - רק מי נמצא בו */
  full: Record<number, boolean>;
  reason: 'rule' | 'nearest' | 'lowest' | 'none';
  rule?: AltArmamentRule;
  /** בעדיפות גבהים: הגובה מהטבלה (רגל) שלפיו הוקצה */
  ruleAlt?: number;
  /** בעדיפות גבהים: אף גובה מהטבלה אינו בבלוקים שלי - הוקצה הבלוק הקרוב */
  outOfBlocks?: boolean;
  /** כדי לפנות את הבלוקים המומלצים - פ"מ אחר צריך לעבור */
  move?: AltMove;
  /** אילו בלוקים תפוסים ועל ידי מי - לתצוגה */
  occupants: Record<number, string[]>;
}

/** גובה של פ"מ (`"120"`, `"FL120"`, `"100-140"`, `"12000"`) → טווח במאות רגל */
export function parseAltHundreds(alt: string | null | undefined): { lo: number; hi: number } | null {
  if (!alt) return null;
  const u = String(alt).trim().toUpperCase().replace(/,/g, '');
  const toH = (n: number) => (n >= 1000 ? Math.round(n / 100) : n);
  const range = u.match(/^(?:FL?)?(\d+)\s*[-–]\s*(?:FL?)?(\d+)/);
  if (range) {
    const a = toH(parseInt(range[1], 10)), b = toH(parseInt(range[2], 10));
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
  }
  const one = u.match(/^(?:FL?)?(\d+)/);
  if (!one) return null;
  const v = toH(parseInt(one[1], 10));
  return { lo: v, hi: v };
}

/** כמה בלוקים צריך מבנה בגודל הזה */
export function blocksNeeded(formation: number): number {
  const n = Number.isFinite(formation) && formation > 0 ? Math.floor(formation) : 1;
  return n <= 3 ? 1 : Math.ceil(n / 2);
}

/** הפרדה בין זוגות באותו מבנה - 1000 רגל (10 במאות רגל) */
export const PAIR_SEPARATION = 10;

/**
 * **הגובה שנרשם על הפ"מ בהקצאה** - לא כל הבלוק. ההמלצה בוחרת בלוק (או בלוקים
 * סמוכים), אבל הפ"מ מקבל גובה לכל זוג: זוג (או בודד) - גובה אחד; רביעייה - שני
 * גבהים בהפרדה של 1000 רגל ("זוג ב-240 וזוג ב-250"); שלישייה - זוג ובודד, שני
 * גבהים. נכתב כמו כל גובה בפ"מ: "240" או "240-250".
 *
 * `start` - הגובה התחתון שהפקח בחר בתוך הטווח (▲▼ בחלון). ברירת מחדל: תחתית
 * הטווח. נשמר בתוך הטווח כך שהזוג העליון לא חורג ממנו.
 */
export function assignedAltitude(from: number, to: number, formation: number, start?: number | null): string {
  const n = Number.isFinite(formation) && formation > 0 ? Math.floor(formation) : 1;
  const levels = Math.max(1, Math.ceil(n / 2));
  const span = PAIR_SEPARATION * (levels - 1);
  const maxStart = Math.max(from, to - span);
  const s = Math.min(maxStart, Math.max(from, start ?? from));
  return levels === 1 ? `${s}` : `${s}-${s + span}`;
}

const overlaps = (r: { lo: number; hi: number }, b: RecBlock) => r.lo <= b.alt_to && r.hi >= b.alt_from;

/** גובה (מאות רגל) מופרד 1000 רגל לפחות מכל הגבהים התפוסים */
const separated = (v: number, taken: { lo: number; hi: number }[]) =>
  taken.every(t => v <= t.lo - PAIR_SEPARATION || v >= t.hi + PAIR_SEPARATION);

/**
 * **הגובה הפנוי בטווח** - הגובה התחתון של הקצאה (גובה לכל זוג, כמו
 * `assignedAltitude`) כך שכל גבהי המבנה בתוך הטווח ובהפרדה של 1000 רגל מכל
 * פ"מ אחר. `prefer` - הגובה שאליו שואפים (ברירת מחדל: הנמוך). null = אין.
 */
export function freeStart(
  from: number, to: number, formation: number, taken: { lo: number; hi: number }[], prefer?: number | null,
): number | null {
  const n = Number.isFinite(formation) && formation > 0 ? Math.floor(formation) : 1;
  const span = PAIR_SEPARATION * (Math.max(1, Math.ceil(n / 2)) - 1);
  const maxStart = to - span;
  if (maxStart < from) return null;
  const want = Math.min(maxStart, Math.max(from, prefer ?? from));
  // מועמדים: גבהים עגולים מתחתית הטווח, ממש מעל/מתחת לכל פ"מ, והגובה המבוקש
  const cands = new Set<number>([want]);
  for (let v = from; v <= maxStart; v += PAIR_SEPARATION) cands.add(v);
  for (const t of taken) { cands.add(t.hi + PAIR_SEPARATION); cands.add(t.lo - PAIR_SEPARATION - span); }
  let best: number | null = null;
  for (const s of cands) {
    if (s < from || s > maxStart) continue;
    let ok = true;
    for (let k = 0; k <= span; k += PAIR_SEPARATION) if (!separated(s + k, taken)) { ok = false; break; }
    if (!ok) continue;
    if (best === null || Math.abs(s - want) < Math.abs(best - want) || (Math.abs(s - want) === Math.abs(best - want) && s < best)) best = s;
  }
  return best;
}

/** הפ"מים שגובה ההקצאה (`alt`) קרוב אליהם פחות מ-1000 רגל - לאזהרה בחלון */
export function tooCloseTo(alt: string, taken: TakenAlt[]): string[] {
  const r = parseAltHundreds(alt);
  if (!r) return [];
  const levels: number[] = [];
  for (let v = r.lo; v <= r.hi; v += PAIR_SEPARATION) levels.push(v);
  return [...new Set(taken.filter(t => levels.some(v => !separated(v, [t]))).map(t => t.label))];
}

/** החוק הראשון (לפי סדר ההגדרה) שהחימוש שלו נמצא על הפ"מ */
export function matchRule(armaments: string[], rules: AltArmamentRule[] | null | undefined): AltArmamentRule | undefined {
  const have = new Set(armaments.map(a => a.trim()).filter(Boolean));
  return (rules || []).find(r => r && have.has(String(r.armament || '').trim()));
}


export function recommendAltitude(args: {
  blocks: RecBlock[];
  formation: number;
  armaments: string[];
  rules?: AltArmamentRule[] | null;
  currentAlt?: string | null;
  others: RecOtherStrip[];
}): AltRecommendation {
  const blocks = [...args.blocks].sort((a, b) => a.alt_from - b.alt_from);
  const needed = blocksNeeded(args.formation);
  const others = args.others
    .map(o => ({ ...o, r: parseAltHundreds(o.alt) }))
    .filter((o): o is RecOtherStrip & { r: { lo: number; hi: number } } => !!o.r);

  const taken: TakenAlt[] = others.map(o => ({ lo: o.r.lo, hi: o.r.hi, label: o.label }));
  const occupants: Record<number, string[]> = {};
  const occIds: Record<number, string[]> = {};
  const full: Record<number, boolean> = {};
  for (const b of blocks) {
    const hit = others.filter(o => overlaps(o.r, b));
    occupants[b.id] = hit.map(o => o.label);
    occIds[b.id] = hit.map(o => o.id);
    full[b.id] = freeStart(b.alt_from, b.alt_to, Math.min(args.formation, 3), taken) === null;
  }
  const empty: AltRecommendation = { needed, blockIds: [], alt: '', reason: 'none', occupants, taken, full };
  if (blocks.length < needed) return empty;

  const rule = matchRule(args.armaments, args.rules);
  const cur = parseAltHundreds(args.currentAlt);
  // הגובה שאליו שואפים בתוך החלון: גובה החוק / הגובה הנוכחי / תחתית טווח החוק / הנמוך
  const prefer: number | null = rule?.kind === 'alt' && rule.alt_ft != null ? rule.alt_ft / 100
    : rule?.kind === 'range' && rule.min_ft != null ? rule.min_ft / 100
    : !rule && cur ? cur.lo : null;
  const startIn = (win: RecBlock[], tk: { lo: number; hi: number }[] = taken) =>
    freeStart(win[0].alt_from, win[win.length - 1].alt_to, args.formation, tk, prefer);
  const n = blocks.length;
  const bandOf = (i: number): AltRuleBand => (i < n / 3 ? 'low' : i < (2 * n) / 3 ? 'mid' : 'high');

  /** ציון לחלון שמתחיל באינדקס i (נמוך = עדיף) */
  const score = (i: number): number => {
    const win = blocks.slice(i, i + needed);
    const lo = win[0].alt_from, hi = win[win.length - 1].alt_to;
    if (rule?.kind === 'band' && rule.band) {
      const order: AltRuleBand[] = ['low', 'mid', 'high'];
      const centre = i + (needed - 1) / 2;
      return Math.abs(order.indexOf(bandOf(Math.round(centre))) - order.indexOf(rule.band)) * 1e6 + i;
    }
    if (rule?.kind === 'alt' && rule.alt_ft != null) {
      const a = rule.alt_ft / 100;
      return a < lo ? lo - a : a > hi ? a - hi : 0;
    }
    if (rule?.kind === 'range' && (rule.min_ft != null || rule.max_ft != null)) {
      const rlo = (rule.min_ft ?? -Infinity) / 100, rhi = (rule.max_ft ?? Infinity) / 100;
      return Math.max(0, rlo - lo) + Math.max(0, hi - rhi);
    }
    if (cur) return Math.min(Math.abs(cur.lo - lo), Math.abs(cur.lo - hi)) + (cur.lo >= lo && cur.lo <= hi ? -1e6 : 0);
    return i;
  };
  const reason: AltRecommendation['reason'] = rule ? 'rule' : cur ? 'nearest' : 'lowest';
  const pick = (win: RecBlock[], s: number, extra: Partial<AltRecommendation> = {}): AltRecommendation => ({
    needed, blockIds: win.map(b => b.id), start: s,
    alt: assignedAltitude(win[0].alt_from, win[win.length - 1].alt_to, args.formation, s),
    reason, rule, occupants, taken, full, ...extra,
  });

  const windows = Array.from({ length: n - needed + 1 }, (_, i) => i);

  // ── עדיפות גבהים: הראשון שפנוי בדיוק, אחרת הקרוב לעדיפות שבבלוקים, אחרת הבלוק הקרוב ──
  if (rule?.kind === 'priority' && rule.alts_ft?.length) {
    const alts = rule.alts_ft;
    const winOf = (i: number) => blocks.slice(i, i + needed);
    const holds = (a: number) => windows.filter(i => { const w = winOf(i); return a >= w[0].alt_from && a <= w[w.length - 1].alt_to; });
    for (const ft of alts) {
      const a = ft / 100;
      for (const i of holds(a)) {
        const w = winOf(i);
        if (freeStart(w[0].alt_from, w[w.length - 1].alt_to, args.formation, taken, a) === a) return pick(w, a, { ruleAlt: ft });
      }
    }
    for (const ft of alts) {
      const a = ft / 100;
      let best: { i: number; s: number } | null = null;
      for (const i of holds(a)) {
        const w = winOf(i);
        const s = freeStart(w[0].alt_from, w[w.length - 1].alt_to, args.formation, taken, a);
        if (s !== null && (!best || Math.abs(s - a) < Math.abs(best.s - a))) best = { i, s };
      }
      if (best) return pick(winOf(best.i), best.s, { ruleAlt: ft });
    }
    // אף גובה מהטבלה לא פנוי בבלוקים שלי - הבלוק הקרוב לגובה הנדרש (כמו חוק גובה פיזי)
    const sub = recommendAltitude({ ...args, rules: [{ armament: rule.armament, kind: 'alt', alt_ft: alts[0] }] });
    return { ...sub, rule, ruleAlt: alts[0], outOfBlocks: !alts.some(ft => holds(ft / 100).length > 0) };
  }
  // חלון עם גובה פנוי בהפרדה - לא חייב להיות ריק
  const freeWins = windows.filter(i => startIn(blocks.slice(i, i + needed)) !== null);
  if (freeWins.length) {
    const best = freeWins.reduce((a, b) => (score(b) < score(a) ? b : a));
    const win = blocks.slice(best, best + needed);
    return pick(win, startIn(win)!);
  }

  // אין גובה פנוי: פ"מ אחד בלבד מפריע לחלון, ויש לו גובה פנוי בבלוק מחוץ לחלון
  let bestMove: { i: number; move: AltMove; cost: number; start: number } | null = null;
  for (const i of windows) {
    const win = blocks.slice(i, i + needed);
    const inWin = new Set(win.map(b => b.id));
    const blockers = new Set(win.flatMap(b => occIds[b.id]));
    if (blockers.size !== 1) continue;
    const [blockerId] = [...blockers];
    const blocker = others.find(o => o.id === blockerId)!;
    const its = blocks.filter(b => overlaps(blocker.r, b));
    if (its.length !== 1) continue; // פ"מ שתופס כמה בלוקים - הזזה שלו אינה החלטה פשוטה
    const from = its[0];
    const rest = taken.filter((_, k) => others[k].id !== blockerId);
    for (const to of blocks) {
      if (inWin.has(to.id)) continue;
      const cost = score(i) * 1000 + Math.abs(to.alt_from - from.alt_from);
      if (bestMove && cost >= bestMove.cost) continue;
      // שומרים על מיקום הפ"מ בתוך הבלוק - גם גובה בודד וגם גבהי זוגות ("240-250"):
      // הכל זז באותו הפרש לבלוק החדש, בלי לחרוג ממנו. טווח של בלוק שלם עובר לבלוק שלם
      const shift = (v: number) => Math.min(to.alt_to, Math.max(to.alt_from, to.alt_from + (v - from.alt_from)));
      const moved = { lo: shift(blocker.r.lo), hi: shift(blocker.r.hi) };
      // הפ"מ המוזז מופרד מכל השאר, והחלון מתפנה גם אחרי שהוא במקומו החדש
      if (!separated(moved.lo, rest) || !separated(moved.hi, rest)) continue;
      if (rest.some(t => moved.lo <= t.hi && moved.hi >= t.lo)) continue;
      const s = startIn(win, [...rest, moved]);
      if (s === null) continue;
      const newAlt = moved.lo === moved.hi ? String(moved.lo) : `${moved.lo}-${moved.hi}`;
      bestMove = {
        i, cost, start: s,
        move: {
          stripId: blocker.id, label: blocker.label, fromBlockId: from.id, toBlockId: to.id,
          direction: to.alt_from > from.alt_from ? 'climb' : 'descend', newAlt,
        },
      };
    }
  }
  if (bestMove) return pick(blocks.slice(bestMove.i, bestMove.i + needed), bestMove.start, { move: bestMove.move });
  return { ...empty, rule };
}

/** החימושים שעל הפ"מ - מטבלת המטוסים, מנקודות המכוון ומ-`weapons` */
export function stripArmaments(strip: unknown): string[] {
  const s = (strip && typeof strip === 'object') ? strip as Record<string, any> : {};
  const out: string[] = [];
  for (const a of Array.isArray(s.aircraft) ? s.aircraft : []) {
    for (const w of Array.isArray(a?.armaments) ? a.armaments : []) if (w?.name) out.push(String(w.name));
  }
  for (const t of Array.isArray(s.targets) ? s.targets : []) if (t?.armament) out.push(String(t.armament));
  for (const w of Array.isArray(s.weapons) ? s.weapons : []) {
    const name = w?.name ?? w?.type ?? (typeof w === 'string' ? w : null);
    if (name) out.push(String(name));
  }
  return [...new Set(out.map(x => x.trim()).filter(Boolean))];
}

/** חוקים מה-DB → רשימה תקינה. חוק בלי חימוש או בלי ערך נזרק */
export function normalizeAltRules(raw: unknown): AltArmamentRule[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  return raw.flatMap((r: any): AltArmamentRule[] => {
    const armament = String(r?.armament ?? '').trim();
    if (!armament) return [];
    if (r.kind === 'band' && ['low', 'mid', 'high'].includes(r.band)) return [{ armament, kind: 'band', band: r.band }];
    if (r.kind === 'alt' && num(r.alt_ft) != null) return [{ armament, kind: 'alt', alt_ft: num(r.alt_ft) }];
    if (r.kind === 'range' && (num(r.min_ft) != null || num(r.max_ft) != null)) {
      return [{ armament, kind: 'range', min_ft: num(r.min_ft), max_ft: num(r.max_ft) }];
    }
    if (r.kind === 'priority' && Array.isArray(r.alts_ft)) {
      // גובה שהוקלד במאות ("240") נשמר ברגל, כמו שאר החוקים
      const alts = [...new Set(r.alts_ft.map(num).filter((v: number | null): v is number => v != null && v > 0).map((v: number) => (v < 1000 ? v * 100 : v)))] as number[];
      if (alts.length) return [{ armament, kind: 'priority', alts_ft: alts }];
    }
    return [];
  });
}
