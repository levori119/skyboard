// דסק משימה כללי — לוגיקה טהורה: עץ פריסה, נוסחאות טבלה חכמה, סיכומים,
// עיצוב מותנה, מצבי כפתור ו-fan-out שיתוף. ללא תלות ב-DOM/רשת (testable).
import type {
  MDNode, MDLeaf, MDTableConfig, MDTableRow, MDCellValue,
  MDTableRule, MDRowStyle, MDButton, MDSummaryKind, MDInkStroke,
  MDLabelRun, MDLabelConfig,
  MissionDeskService, MDStripsConfig, MDPresetMapConfig, MDPresetMapSettings,
} from '../types/missionDesk';
import { mdEmptyMapSettings } from '../types/missionDesk';

// ── עץ פריסה (BSP) — אותה תבנית כמו sgSplit/sgRemove, עם leaf של שירות ──────
export const mdGenId = (): string => Math.random().toString(36).slice(2, 9);
export const mdDefaultLeaf = (): MDLeaf => ({ id: mdGenId(), type: 'leaf', service_id: null });

export function mdUpdate(node: MDNode, id: string, fn: (n: any) => any): MDNode {
  if (node.id === id) return fn(node);
  if (node.type === 'split') return { ...node, children: node.children.map(c => mdUpdate(c, id, fn)) };
  return node;
}

export function mdSplit(node: MDNode, id: string, dir: 'h' | 'v'): MDNode {
  if (node.id === id && node.type === 'leaf') {
    return { id: mdGenId(), type: 'split', direction: dir, sizes: [50, 50], children: [node, mdDefaultLeaf()] };
  }
  if (node.type === 'split') return { ...node, children: node.children.map(c => mdSplit(c, id, dir)) };
  return node;
}

export function mdRemove(node: MDNode, id: string): MDNode {
  if (node.type === 'leaf') return node;
  const keep = node.children.filter(c => c.id !== id);
  if (keep.length === node.children.length) return { ...node, children: node.children.map(c => mdRemove(c, id)) };
  if (keep.length === 0) return mdDefaultLeaf();
  if (keep.length === 1) return mdRemove(keep[0], id);
  const keptIdx = node.children.reduce<number[]>((acc, c, i) => c.id !== id ? [...acc, i] : acc, []);
  const newSizes = keptIdx.map(i => node.sizes[i] ?? (100 / node.children.length));
  const total = newSizes.reduce((s, x) => s + x, 0);
  return { ...node, children: keep.map(c => mdRemove(c, id)), sizes: newSizes.map(s => (s / total) * 100) };
}

export function mdGetAllLeaves(node: MDNode): MDLeaf[] {
  if (node.type === 'leaf') return [node];
  return node.children.flatMap(c => mdGetAllLeaves(c));
}

// ── נוסחאות (טבלה חכמה) ─────────────────────────────────────────────────────
// פרסר מינימלי ל-+ - * / וסוגריים על מפתחות עמודה וליטרלים. בלי eval.
// כל כשל (מפתח חסר, ערך לא מספרי, חלוקה באפס, תחביר) → null.

const toNum = (v: MDCellValue | undefined): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
};

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'lp' } | { t: 'rp' };

function tokenize(formula: string, cells: Record<string, MDCellValue | undefined>): Tok[] | null {
  const toks: Tok[] = [];
  const re = /\s*([A-Za-z_֐-׿][A-Za-z0-9_֐-׿]*|\d+(?:\.\d+)?|[+\-*/()])\s*/y;
  let i = 0;
  while (i < formula.length) {
    re.lastIndex = i;
    const m = re.exec(formula);
    if (!m) return null;
    const s = m[1];
    if (s === '(') toks.push({ t: 'lp' });
    else if (s === ')') toks.push({ t: 'rp' });
    else if ('+-*/'.includes(s)) toks.push({ t: 'op', v: s });
    else if (/^\d/.test(s)) toks.push({ t: 'num', v: Number(s) });
    else {
      const n = toNum(cells[s]);
      if (n === null) return null;
      toks.push({ t: 'num', v: n });
    }
    i = re.lastIndex;
  }
  return toks.length ? toks : null;
}

export function evalFormula(formula: string, cells: Record<string, MDCellValue | undefined>): number | null {
  const toks = tokenize(formula, cells);
  if (!toks) return null;
  let pos = 0;
  const peek = () => toks[pos];
  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (peek()?.t === 'op' && (peek() as any).v.match(/[+\-]/)) {
      const op = (toks[pos++] as any).v;
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left === null) return null;
    while (peek()?.t === 'op' && (peek() as any).v.match(/[*/]/)) {
      const op = (toks[pos++] as any).v;
      const right = parseFactor();
      if (right === null) return null;
      if (op === '/') {
        if (right === 0) return null;
        left = left / right;
      } else left = left * right;
    }
    return left;
  };
  const parseFactor = (): number | null => {
    const tok = peek();
    if (!tok) return null;
    if (tok.t === 'num') { pos++; return tok.v; }
    if (tok.t === 'op' && tok.v === '-') { pos++; const f = parseFactor(); return f === null ? null : -f; }
    if (tok.t === 'lp') {
      pos++;
      const inner = parseExpr();
      if (inner === null || peek()?.t !== 'rp') return null;
      pos++;
      return inner;
    }
    return null;
  };
  const result = parseExpr();
  if (result === null || pos !== toks.length) return null;
  return Number.isFinite(result) ? result : null;
}

// ── תאים מחושבים + סיכומים ──────────────────────────────────────────────────

export function computeCells(row: MDTableRow, config: MDTableConfig): Record<string, MDCellValue | undefined> {
  const cells: Record<string, MDCellValue | undefined> = { ...row.cells };
  for (const c of config.computed || []) {
    const v = evalFormula(c.formula, cells);
    if (v !== null) cells[c.key] = v;
    else delete cells[c.key];
  }
  return cells;
}

export function computeSummary(rows: MDTableRow[], config: MDTableConfig): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [key, kind] of Object.entries(config.summary || {})) {
    const all = rows.map(r => computeCells(r, config)[key]);
    if (kind === 'count') {
      const col = config.columns.find(c => c.key === key);
      if (col?.type === 'check') {
        // V/X: ברירת מחדל סופרים ✔ בלבד; countWhat:'x' סופר את מה שמוצג ✘
        // (עקבי לתצוגה: שורה שטרם סומנה מוצגת ✘ ולכן נספרת כ-✘)
        out[key] = col.countWhat === 'x'
          ? all.filter(v => v !== true).length
          : all.filter(v => v === true).length;
      } else {
        out[key] = all.filter(v => v !== undefined && v !== null && String(v).trim() !== '').length;
      }
      continue;
    }
    const nums = all.map(toNum).filter((n): n is number => n !== null);
    if (!nums.length) { out[key] = null; continue; }
    switch (kind) {
      case 'sum': out[key] = nums.reduce((s, n) => s + n, 0); break;
      case 'avg': out[key] = nums.reduce((s, n) => s + n, 0) / nums.length; break;
      case 'min': out[key] = Math.min(...nums); break;
      case 'max': out[key] = Math.max(...nums); break;
    }
  }
  return out;
}

const SUMMARY_LABELS: Record<MDSummaryKind, string> = {
  sum: 'סכום', avg: 'ממוצע', count: 'כמות', min: 'מינימום', max: 'מקסימום',
};
export const summaryLabel = (kind: MDSummaryKind): string => SUMMARY_LABELS[kind] || kind;

// ── עיצוב מותנה ─────────────────────────────────────────────────────────────

export function matchRule(rule: MDTableRule, cells: Record<string, MDCellValue | undefined>): boolean {
  const v = cells[rule.column];
  const empty = v === undefined || v === null || String(v).trim() === '';
  switch (rule.op) {
    case 'empty': return empty;
    case 'notEmpty': return !empty;
    case 'contains': return !empty && String(v).includes(rule.value ?? '');
    case 'eq': case 'neq': {
      let same: boolean;
      if (typeof v === 'boolean') same = String(v) === String(rule.value).toLowerCase();
      else {
        const n1 = toNum(v), n2 = toNum(rule.value ?? '');
        same = n1 !== null && n2 !== null ? n1 === n2 : String(v ?? '') === String(rule.value ?? '');
      }
      return rule.op === 'eq' ? same : !same;
    }
    case 'gt': case 'lt': case 'gte': case 'lte': {
      const n1 = toNum(v), n2 = toNum(rule.value ?? '');
      if (n1 === null || n2 === null) return false;
      if (rule.op === 'gt') return n1 > n2;
      if (rule.op === 'lt') return n1 < n2;
      if (rule.op === 'gte') return n1 >= n2;
      return n1 <= n2;
    }
    default: return false;
  }
}

export function rowStyle(rules: MDTableRule[] | undefined, cells: Record<string, MDCellValue | undefined>): MDRowStyle | null {
  for (const rule of rules || []) {
    if (matchRule(rule, cells)) return { bg: rule.bg, text: rule.text, blink: rule.blink };
  }
  return null;
}

// ── כפתורים ─────────────────────────────────────────────────────────────────

export function cycleButtonState(btn: MDButton): number {
  if (!btn.states.length) return 0;
  return (btn.activeStateIdx + 1) % btn.states.length;
}

// ── שיתוף (fan-out) — משמש גם את השרת (מיובא לוגית, ממומש זהה ב-route) ──────
// mission_desk_sharing הוא JSONB עם מפתחות-מחרוזת: { "<service_id>": [preset_id,...] }

export function resolveFanout(
  sharing: Record<string, unknown> | null | undefined,
  serviceId: number,
  writerPresetId: number,
): number[] {
  const raw = sharing?.[String(serviceId)];
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    const n = typeof v === 'number' ? v
      : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    if (!Number.isInteger(n) || n === writerPresetId || out.includes(n)) continue;
    out.push(n);
  }
  return out;
}

// ── פלנלית — מחיקה לפי מיקום ────────────────────────────────────────────────
// מסיר strokes שהסמן (x,y בקואורדינטות יחסיות 0..1) נוגע בהם ברדיוס r.
// הבדיקה היא מרחק נקודה-מקטע (לא רק קודקודים) — קו ארוך עם 2 נקודות נתפס באמצעו.
// כשאין פגיעה מוחזר אותו מערך (reference equality → אין רנדור/שמירה מיותרים).

const distToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

export function eraseStrokesAt(strokes: MDInkStroke[], x: number, y: number, r: number): MDInkStroke[] {
  const hit = (s: MDInkStroke): boolean => {
    if (s.points.length === 1) return Math.hypot(x - s.points[0].x, y - s.points[0].y) <= r;
    for (let i = 1; i < s.points.length; i++) {
      if (distToSegment(x, y, s.points[i - 1].x, s.points[i - 1].y, s.points[i].x, s.points[i].y) <= r) return true;
    }
    return false;
  };
  const kept = strokes.filter(s => !hit(s));
  return kept.length === strokes.length ? strokes : kept;
}

// ── תמונה קבועה ─────────────────────────────────────────────────────────────
// מאשר data URL של פורמט raster בטוח בלבד. SVG נדחה בכוונה — הוא יכול להריץ
// סקריפט; print-screen/צילום קובץ הם ממילא raster.
export function isImageDataUrl(s: string | undefined | null): boolean {
  return typeof s === 'string' && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(s);
}

// ── טקסט קבוע — מקטעי rich-text (עיצוב פר-תו) ──────────────────────────────
const sameRunStyle = (a: MDLabelRun, b: MDLabelRun): boolean =>
  !!a.bold === !!b.bold && a.fontSize === b.fontSize && a.color === b.color && a.font === b.font;

// מאחד מקטעים סמוכים בעלי אותו עיצוב ומסיר ריקים — מקור אמת מנורמל ל-config.
export function normalizeLabelRuns(runs: MDLabelRun[] | undefined | null): MDLabelRun[] {
  const out: MDLabelRun[] = [];
  for (const r of runs || []) {
    if (!r || r.text === '') continue;
    const last = out[out.length - 1];
    if (last && sameRunStyle(last, r)) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

// טקסט רגיל (ללא עיצוב) — לזיהוי "ריק" ולנגישות. נופל ל-text ה-legacy.
export function labelPlainText(cfg: MDLabelConfig | undefined | null): string {
  if (cfg?.runs && cfg.runs.length) return cfg.runs.map(r => r.text).join('');
  return cfg?.text || '';
}

// ── חלונות מפה בדסק משימה ───────────────────────────────────────────────────
// דסק יכול להחזיק כמה חלונות מפה. כל חלון הוא שירות מסוג 'map', והגדרותיו
// (איזו מפה, אילו נקודות העברה) יושבות **בהגדרת העמדה** ולא בהגדרת הדסק -
// כי אותו דסק משרת עמדות שמסתכלות על מפות שונות.

const bySortOrder = (a: MissionDeskService, b: MissionDeskService): number =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;

/** חלונות המפה של הדסק, בסדר שבו הוגדרו (סדר קבוצות ההגדרה במסך הניהול). */
export function mdMapServices(services: MissionDeskService[] | undefined | null): MissionDeskService[] {
  return (services || []).filter(s => s.service_type === 'map').sort(bySortOrder);
}

/** חלונות הפ"ממים של הדסק. */
export function mdStripsServices(services: MissionDeskService[] | undefined | null): MissionDeskService[] {
  return (services || []).filter(s => s.service_type === 'strips').sort(bySortOrder);
}

const PIN_DISPLAYS = ['handwrite', 'icon', 'small', 'strip'] as const;

/** הגדרות חלון מפה פר-עמדה, עם ברירות מחדל לחלון שטרם הוגדר. */
export function mdMapSettings(cfg: MDPresetMapConfig | undefined | null, serviceId: number): MDPresetMapSettings {
  const raw = (cfg || {})[String(serviceId)];
  if (!raw) return mdEmptyMapSettings();
  return {
    map_id: Number.isFinite(Number(raw.map_id)) && Number(raw.map_id) > 0 ? Number(raw.map_id) : null,
    transfer_points: (Array.isArray(raw.transfer_points) ? raw.transfer_points : []).map(Number).filter(Number.isFinite),
    sector_maps_enabled: raw.sector_maps_enabled === true,
    sector_map_ids: (Array.isArray(raw.sector_map_ids) ? raw.sector_map_ids : []).map(Number).filter(Number.isFinite),
    flight_zones_mode: raw.flight_zones_mode === true,
    fz_pin_display: (PIN_DISPLAYS as readonly string[]).includes(String(raw.fz_pin_display))
      ? raw.fz_pin_display as MDPresetMapSettings['fz_pin_display']
      : 'handwrite',
  };
}

/**
 * חלונות המפה שטרם נבחרה להם מפה. אלה חוסמים שמירה של העמדה: חלון מפה בלי מפה
 * הוא אזור ריק על המסך בעמדה, והמפעיל אינו יכול לתקן זאת בעצמו.
 */
export function mdMissingMapServices(
  services: MissionDeskService[] | undefined | null,
  cfg: MDPresetMapConfig | undefined | null,
): MissionDeskService[] {
  return mdMapServices(services).filter(svc => mdMapSettings(cfg, svc.id).map_id == null);
}

/**
 * לאיזה חלון מפה שייך חלון פ"ממים. אם לא קושר במפורש ובדסק יש בדיוק חלון מפה
 * אחד - הוא היעד המובן מאליו; אחרת נדרשת בחירה מפורשת בהגדרת הדסק.
 */
export function mdStripsMapServiceId(
  strips: MissionDeskService,
  services: MissionDeskService[] | undefined | null,
): number | null {
  const maps = mdMapServices(services);
  const linked = Number((strips.config as MDStripsConfig | undefined)?.map_service_id);
  if (Number.isFinite(linked) && maps.some(m => m.id === linked)) return linked;
  return maps.length === 1 ? maps[0].id : null;
}

/** מנקה מההגדרה חלונות מפה שכבר אינם קיימים בדסק (נמחקו/הוחלף דסק). */
export function mdPruneMapConfig(
  cfg: MDPresetMapConfig | undefined | null,
  services: MissionDeskService[] | undefined | null,
): MDPresetMapConfig {
  const live = new Set(mdMapServices(services).map(s => String(s.id)));
  const out: MDPresetMapConfig = {};
  for (const [k, v] of Object.entries(cfg || {})) if (live.has(k)) out[k] = v;
  return out;
}
