// דסק משימה כללי — לוגיקה טהורה: עץ פריסה, נוסחאות טבלה חכמה, סיכומים,
// עיצוב מותנה, מצבי כפתור ו-fan-out שיתוף. ללא תלות ב-DOM/רשת (testable).
import type {
  MDNode, MDLeaf, MDTableConfig, MDTableRow, MDCellValue,
  MDTableRule, MDRowStyle, MDButton, MDSummaryKind, MDInkStroke,
} from '../types/missionDesk';

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
