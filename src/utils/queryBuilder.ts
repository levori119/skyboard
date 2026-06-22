// ─── Query Builder DSL (extracted from App.tsx lines 131-321) ─────────────────
import { QOperator, QCompare, QLeaf, QGroup, QNode } from '../types';

// Re-export types for convenience
export type { QOperator, QCompare, QLeaf, QGroup, QNode };

// ─── Utilities ────────────────────────────────────────────────────────────────

export const qGenId = () => Math.random().toString(36).slice(2, 10);

export function clampMenuPos(x: number, y: number, menuW: number, menuH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    left: Math.max(4, Math.min(x, vw - menuW - 4)),
    top: Math.max(4, Math.min(y, vh - menuH - 4)),
  };
}

export const emptyQGroup = (): QGroup => ({ id: qGenId(), type: 'group', operator: 'all', children: [] });

export const hasConditions = (node: QNode | null): boolean => {
  if (!node) return false;
  if (node.type === 'leaf') return true;
  return node.children.some(c => hasConditions(c));
};

// ─── Field Definitions ────────────────────────────────────────────────────────

export const Q_FIELDS: { key: string; label: string; ftype: 'text' | 'bool' | 'preset_select' }[] = [
  // ── שדות פמם בסיסיים ──
  { key: 'callSign',                label: 'או"ק',              ftype: 'text' },
  { key: 'sq',                      label: 'טייסת',             ftype: 'text' },
  { key: 'squadron',                label: 'טייסת (מורחב)',     ftype: 'text' },
  { key: 'numberOfFormation',       label: 'מס׳ גיחה',          ftype: 'text' },
  { key: 'original_formation_count',label: 'מצבה מקורית',       ftype: 'text' },
  { key: 'task',                    label: 'משימה',             ftype: 'text' },
  { key: 'alt',                     label: 'גובה',              ftype: 'text' },
  { key: 'status',                  label: 'מצב',               ftype: 'text' },
  { key: 'sector',                  label: 'אזור',              ftype: 'text' },
  { key: 'takeoff_time',            label: 'זמן המראה',         ftype: 'text' },
  // ── שדות זהות ופ"מ ──
  { key: 'erka',                    label: 'ערכה',              ftype: 'text' },
  { key: 'mivtza',                  label: 'מבצע',              ftype: 'text' },
  { key: 'koteret',                 label: 'כותרת',             ftype: 'text' },
  { key: 'tzevet_shilta',           label: 'צוות שליטה',        ftype: 'text' },
  { key: 'ta_shilta',               label: 'תא שליטה',          ftype: 'text' },
  { key: 'parent_callsign',         label: 'או"ק פמ מקורי',     ftype: 'text' },
  { key: 'formation_notes',         label: 'הערה לפמ',          ftype: 'text' },
  // ── שדות ניווט ──
  { key: 'takeoff_airfield',        label: 'שדה המראה',         ftype: 'text' },
  { key: 'landing_airfield',        label: 'שדה נחיתה',         ftype: 'text' },
  { key: 'sid',                     label: 'SID',               ftype: 'text' },
  { key: 'star',                    label: 'STAR',              ftype: 'text' },
  // ── שדות ציוד ──
  { key: 'weapons',                 label: 'חימושים',           ftype: 'text' },
  { key: 'targets',                 label: 'מטרות',             ftype: 'text' },
  { key: 'systems',                 label: 'מערכות',            ftype: 'text' },
  { key: 'shkadia',                 label: 'שקדיה',             ftype: 'text' },
  // ── שדות הערות ──
  { key: 'notes',                   label: 'הערות',             ftype: 'text' },
  // ── שדות קרקע ──
  { key: 'ground_status',           label: 'מצב קרקע',          ftype: 'text' },
  // ── שדות אזרחי ──
  { key: 'civ_status',              label: 'סטטוס (אז׳)',        ftype: 'text' },
  { key: 'civ_stand',               label: 'פיר',               ftype: 'text' },
  { key: 'civ_dest',                label: 'יעד',               ftype: 'text' },
  { key: 'civ_ssr',                 label: 'SSR',               ftype: 'text' },
  // ── שדות מערכת פנימיים ──
  { key: 'airborne',                label: 'באוויר',            ftype: 'bool' },
  { key: 'in_table',                label: 'הועבר אלי',         ftype: 'bool' },
  { key: 'on_map',                  label: 'על המפה',           ftype: 'bool' },
  { key: 'block_deviation',         label: 'חריגה מבלוק',       ftype: 'bool' },
  { key: 'created_by_me',           label: 'פ"מ שיצרתי',        ftype: 'bool' },
  { key: 'created_by_preset',       label: 'נוצר ע"י עמדה',     ftype: 'preset_select' },
  { key: 'workstation_preset_name', label: 'הועבר לעמדה',       ftype: 'text' },
  { key: 'creator_preset_name',     label: 'עמדה יוצרת',        ftype: 'text' },
  { key: 'flight_direction',        label: 'כיוון פ"מ',         ftype: 'text' },
  { key: 'created_at',              label: 'זמן יצירה',         ftype: 'text' },
  { key: 'id',                      label: 'מזהה פנימי',        ftype: 'text' },
];

export const Q_TEXT_OPS: { key: QCompare; label: string }[] = [
  { key: 'contains',     label: 'מכיל' },
  { key: 'not_contains', label: 'לא מכיל' },
  { key: 'eq',          label: 'שווה ל' },
  { key: 'neq',         label: 'לא שווה ל' },
  { key: 'in',          label: 'אחד מ (פסיק)' },
  { key: 'not_in',      label: 'לא אחד מ' },
  { key: 'gt',          label: 'גדול מ' },
  { key: 'lt',          label: 'קטן מ' },
  { key: 'empty',       label: 'ריק' },
  { key: 'not_empty',   label: 'לא ריק' },
];

export const Q_BOOL_OPS: { key: QCompare; label: string }[] = [
  { key: 'eq',  label: 'שווה ל' },
  { key: 'neq', label: 'לא שווה ל' },
];

export const Q_OPERATOR_LABELS: Record<QOperator, string> = {
  all:  'כל התנאים מתקיימים',
  any:  'לפחות אחד מתקיים',
  none: 'אף אחד לא מתקיים',
};

// ─── Evaluation Context ───────────────────────────────────────────────────────

export interface QEvalCtx {
  presetId?: number | string | null;
  presetName?: string | null;
  aviationBases?: any[];
}

// ─── Field Value Accessor ─────────────────────────────────────────────────────

export const getQFieldValue = (strip: any, field: string, ctx?: QEvalCtx): any => {
  if (field === 'callSign') return strip.callSign || strip.callsign || '';
  if (field === 'airborne') return !!strip.airborne;
  if (field === 'in_table') {
    const isForMe = ctx?.presetId != null
      ? Number(strip.workstation_preset_id) === Number(ctx.presetId)
      : !!strip.workstation_preset_id;
    return isForMe && (!!strip.in_table || strip.status === 'pending_transfer');
  }
  if (field === 'sq') return strip.sq || strip.squadron || '';
  if (field === 'numberOfFormation') return strip.numberOfFormation || strip.number_of_formation || '';
  if (field === 'notes') return strip.notes || '';
  if (field === 'shkadia') return strip.shkadia || '';
  if (field === 'takeoff_airfield') {
    const bases = ctx?.aviationBases || [];
    const id = strip.takeoff_airfield_id;
    if (!id) return '';
    const base = bases.find((b: any) => b.id === id || b.id === Number(id));
    return base ? `${base.name || ''} ${base.code || ''}`.trim() : String(id);
  }
  if (field === 'landing_airfield') {
    const bases = ctx?.aviationBases || [];
    const id = strip.landing_airfield_id;
    if (!id) return '';
    const base = bases.find((b: any) => b.id === id || b.id === Number(id));
    return base ? `${base.name || ''} ${base.code || ''}`.trim() : String(id);
  }
  if (field === 'workstation_preset_name') return strip.workstation_preset_name || '';
  if (field === 'flight_direction') {
    const bases = ctx?.aviationBases || [];
    const taId = strip.takeoff_airfield_id;
    const laId = strip.landing_airfield_id;
    if (!taId || !laId) return '';
    const ta = bases.find((b: any) => b.id === taId || b.id === Number(taId));
    const la = bases.find((b: any) => b.id === laId || b.id === Number(laId));
    if (!ta || !la || ta.coord_n == null || la.coord_n == null) return '';
    const tLat = parseFloat(ta.coord_n), lLat = parseFloat(la.coord_n);
    if (isNaN(tLat) || isNaN(lLat)) return '';
    if (lLat < tLat) return 'דרומה';
    if (lLat > tLat) return 'צפונה';
    return '';
  }
  if (field === 'parent_callsign') return strip.parent_callsign || '';
  if (field === 'formation_notes') return strip.formation_notes || '';
  if (field === 'created_by_me') {
    if (ctx?.presetId != null && strip.creator_preset_id != null)
      return String(strip.creator_preset_id) === String(ctx.presetId);
    return ctx?.presetName != null && strip.creator_preset_name != null &&
      String(strip.creator_preset_name).trim() === String(ctx.presetName).trim();
  }
  if (field === 'created_by_preset') return strip.creator_preset_name || '';
  return strip[field] ?? '';
};

// ─── Leaf Evaluator ───────────────────────────────────────────────────────────

export const evalQLeaf = (strip: any, leaf: QLeaf, ctx?: QEvalCtx): boolean => {
  if (leaf.field === 'created_by_preset') {
    const creatorName = String(getQFieldValue(strip, 'created_by_preset', ctx) || '').trim().toLowerCase();
    const selected = (leaf.value || '').split(',').map((v: string) => v.trim().toLowerCase()).filter(Boolean);
    if (selected.length === 0) return true;
    return selected.includes(creatorName);
  }
  const raw = getQFieldValue(strip, leaf.field, ctx);
  const val = String(raw).toLowerCase();
  const cmp = (leaf.value || '').toLowerCase().trim();
  const isBool =
    leaf.field === 'airborne' ||
    leaf.field === 'in_table' ||
    leaf.field === 'created_by_me' ||
    leaf.field === 'on_map' ||
    leaf.field === 'block_deviation';
  const boolCmp =
    cmp === '' ? true : (cmp.includes('באוויר') || cmp === 'כן' || cmp === 'true' || cmp === '1' || cmp === 'yes');
  switch (leaf.compare) {
    case 'eq':          return isBool ? (!!raw) === boolCmp : val === cmp;
    case 'neq':         return isBool ? (!!raw) !== boolCmp : val !== cmp;
    case 'contains':    return val.includes(cmp);
    case 'not_contains':return !val.includes(cmp);
    case 'in':          return cmp.split(',').map(v => v.trim()).some(v => val === v);
    case 'not_in':      return !cmp.split(',').map(v => v.trim()).some(v => val === v);
    case 'gt':          return !isNaN(parseFloat(val)) && parseFloat(val) > parseFloat(cmp);
    case 'lt':          return !isNaN(parseFloat(val)) && parseFloat(val) < parseFloat(cmp);
    case 'empty':       return !raw || val === '';
    case 'not_empty':   return !!(raw && val !== '');
    default:            return true;
  }
};

// ─── Tree Evaluator ───────────────────────────────────────────────────────────

export const evaluateQuery = (strip: any, node: QNode, ctx?: QEvalCtx): boolean => {
  if (node.type === 'leaf') return evalQLeaf(strip, node, ctx);
  if (node.children.length === 0) return true;
  const results = node.children.map(c => evaluateQuery(strip, c, ctx));
  switch (node.operator) {
    case 'all':  return results.every(Boolean);
    case 'any':  return results.some(Boolean);
    case 'none': return results.every(r => !r);
    default:     return true;
  }
};
