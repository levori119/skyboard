/**
 * **המלצת גובה בכניסת פ"מ לעמדה** - הלוגיקה הטהורה.
 *
 * כשפ"מ נגרר לטבלת העמדה, המערכת מציעה לו בלוק (או בלוקים) מטבלת הבלוקים של
 * העמדה, ובוחרת אותם מראש בחלון ההמלצה. הפקח מאשר בלחיצה או משנה.
 *
 * | כלל | |
 * |---|---|
 * | **כמה בלוקים** | עד שלישייה - בלוק אחד. מרביעייה - בלוק לכל זוג, **סמוכים** (4 = 2 בלוקים) |
 * | **פנוי** | בלוק שאף פ"מ אחר בעמדה אינו בגובה שלו |
 * | **חוק חימוש** | בהגדרות העמדה (`alt_armament_rules`): חימוש ← נמוך/בינוני/גבוה (שליש מבלוקי העמדה), גובה פיזי, או טווח |
 * | **אין חוק** | הקרוב לגובה הנוכחי של הפ"מ, ואם אין לו - הנמוך הפנוי |
 * | **אין רצף פנוי** | מחפשים פ"מ **אחד** שמפריע לרצף ויכול לעבור לבלוק פנוי אחר - ומציעים להטפיס/להנמיך אותו |
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
  kind: 'band' | 'alt' | 'range';
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

export interface AltRecommendation {
  /** כמה בלוקים נדרשים */
  needed: number;
  /** הבלוקים המומלצים, מהנמוך לגבוה. ריק = אין המלצה */
  blockIds: number[];
  /** הגובה שייכתב לפ"מ באישור */
  alt: string;
  reason: 'rule' | 'nearest' | 'lowest' | 'none';
  rule?: AltArmamentRule;
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

const overlaps = (r: { lo: number; hi: number }, b: RecBlock) => r.lo <= b.alt_to && r.hi >= b.alt_from;

/** החוק הראשון (לפי סדר ההגדרה) שהחימוש שלו נמצא על הפ"מ */
export function matchRule(armaments: string[], rules: AltArmamentRule[] | null | undefined): AltArmamentRule | undefined {
  const have = new Set(armaments.map(a => a.trim()).filter(Boolean));
  return (rules || []).find(r => r && have.has(String(r.armament || '').trim()));
}

const blocksAlt = (bs: RecBlock[]) => `${bs[0].alt_from}-${bs[bs.length - 1].alt_to}`;

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

  const occupants: Record<number, string[]> = {};
  const occIds: Record<number, string[]> = {};
  for (const b of blocks) {
    const hit = others.filter(o => overlaps(o.r, b));
    occupants[b.id] = hit.map(o => o.label);
    occIds[b.id] = hit.map(o => o.id);
  }
  const empty: AltRecommendation = { needed, blockIds: [], alt: '', reason: 'none', occupants };
  if (blocks.length < needed) return empty;

  const rule = matchRule(args.armaments, args.rules);
  const cur = parseAltHundreds(args.currentAlt);
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

  const windows = Array.from({ length: n - needed + 1 }, (_, i) => i);
  const freeWins = windows.filter(i => blocks.slice(i, i + needed).every(b => occIds[b.id].length === 0));
  if (freeWins.length) {
    const best = freeWins.reduce((a, b) => (score(b) < score(a) ? b : a));
    const win = blocks.slice(best, best + needed);
    return { needed, blockIds: win.map(b => b.id), alt: blocksAlt(win), reason, rule, occupants };
  }

  // אין רצף פנוי: פ"מ אחד בלבד מפריע לחלון, ויש לו בלוק פנוי מחוץ לחלון
  let bestMove: { i: number; move: AltMove; cost: number } | null = null;
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
    for (const to of blocks) {
      if (inWin.has(to.id) || occIds[to.id].length) continue;
      const cost = score(i) * 1000 + Math.abs(to.alt_from - from.alt_from);
      if (bestMove && cost >= bestMove.cost) continue;
      // שומרים על מיקום הפ"מ בתוך הבלוק; טווח עובר לטווח הבלוק החדש
      const newAlt = blocker.r.lo === blocker.r.hi
        ? String(Math.min(to.alt_to, to.alt_from + (blocker.r.lo - from.alt_from)))
        : `${to.alt_from}-${to.alt_to}`;
      bestMove = {
        i, cost,
        move: {
          stripId: blocker.id, label: blocker.label, fromBlockId: from.id, toBlockId: to.id,
          direction: to.alt_from > from.alt_from ? 'climb' : 'descend', newAlt,
        },
      };
    }
  }
  if (bestMove) {
    const win = blocks.slice(bestMove.i, bestMove.i + needed);
    return { needed, blockIds: win.map(b => b.id), alt: blocksAlt(win), reason, rule, move: bestMove.move, occupants };
  }
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
    return [];
  });
}
