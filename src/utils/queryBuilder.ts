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

export const Q_FIELDS: { key: string; label: string; ftype: 'text' | 'bool' | 'preset_select' | 'time' }[] = [
  // ── שדות פמם בסיסיים ──
  { key: 'callSign',                label: 'או"ק',              ftype: 'text' },
  { key: 'sq',                      label: 'טייסת',             ftype: 'text' },
  { key: 'squadron',                label: 'טייסת (מורחב)',     ftype: 'text' },
  { key: 'numberOfFormation',       label: 'מס׳ גיחה',          ftype: 'text' },
  { key: 'original_formation_count',label: 'מצבה מקורית',       ftype: 'text' },
  { key: 'strip_type',              label: 'סוג פ"מ',           ftype: 'text' },
  { key: 'task',                    label: 'משימה',             ftype: 'text' },
  { key: 'alt',                     label: 'גובה',              ftype: 'text' },
  { key: 'status',                  label: 'מצב',               ftype: 'text' },
  { key: 'sector',                  label: 'אזור',              ftype: 'text' },
  { key: 'takeoff_time',            label: 'זמן המראה',         ftype: 'time' },
  { key: 'planned_landing_time',    label: 'זמן נחיתה מתוכנן',  ftype: 'time' },
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
  { key: 'lands_at_my_base',        label: 'נוחת אצלי',         ftype: 'bool' },
  { key: 'takes_off_from_my_base',  label: 'ממריא אצלי',        ftype: 'bool' },
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
  { key: 'at_preset',               label: 'נמצא בעמדה',        ftype: 'preset_select' },
  // נשאר לצד "נמצא בעמדה" בשביל שאילתות שמורות שמקלידות שם חופשי
  { key: 'workstation_preset_name', label: 'הועבר לעמדה (טקסט)', ftype: 'text' },
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

/** שדות בחירת עמדה: הבחירה עצמה היא מהתפריט, וכאן רק הכיוון */
export const Q_PRESET_OPS: { key: QCompare; label: string }[] = [
  { key: 'in',     label: 'אחד מ' },
  { key: 'not_in', label: 'לא אחד מ' },
];

// ─── שדות זמן ─────────────────────────────────────────────────────────────────
// על שדה זמן ההשוואה היא **יחסית לעכשיו, בדקות** ולא השוואת מחרוזות: "נוחת
// בעוד פחות מ-15 דקות" חייב להישאר נכון גם דקה אחר כך. `parseFloat` על חותמת
// ISO היה מחזיר את השנה (2026) - כלומר gt/lt על שדות האלה היו חסרי משמעות.

/** שדות שערכם חותמת זמן */
export const Q_TIME_FIELDS = new Set(['takeoff_time', 'planned_landing_time']);

/** האופרטורים שנמדדים בדקות מעכשיו. שאר האופרטורים נופלים להשוואת טקסט */
const Q_TIME_COMPARES = new Set<QCompare>(['lt', 'gt', 'eq', 'neq', 'passed']);

export const Q_TIME_OPS: { key: QCompare; label: string }[] = [
  { key: 'lt',        label: 'פחות מ (דקות מעכשיו)' },
  { key: 'gt',        label: 'יותר מ (דקות מעכשיו)' },
  { key: 'eq',        label: 'שווה ל (דקות מעכשיו)' },
  { key: 'neq',       label: 'לא שווה ל (דקות מעכשיו)' },
  { key: 'passed',    label: 'כבר עבר' },
  { key: 'empty',     label: 'ריק' },
  { key: 'not_empty', label: 'לא ריק' },
];

/** דקות מעכשיו עד הזמן שבשדה. שלילי = כבר עבר. null = אין זמן תקין */
export const qMinutesFromNow = (raw: unknown, now?: number): number | null => {
  if (raw == null || raw === '') return null;
  const t = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  if (!isFinite(t)) return null;
  return (t - (now ?? Date.now())) / 60000;
};

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
  /** "עכשיו" להשוואות זמן. ברירת מחדל `Date.now()` - נמסר במפורש כדי שהחישוב יהיה נשלט וניתן לבדיקה */
  now?: number;
  /** הבסיס של העמדה (`workstation_presets.parent_base_id`) - המשמעות של "אצלי" */
  myBaseId?: number | string | null;
  /**
   * מזהה עמדה → שם, לפ"מים שמגיעים בלי `workstation_preset_name`.
   * חלק מהמסלולים מחזירים רק את המזהה, ובלעדיו "נמצא בעמדה" היה יוצא ריק.
   */
  presetNamesById?: Record<string | number, string>;
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
  // "אצלי" = הבסיס של העמדה. בלי בסיס אב אין משמעות ל"אצלי", ולכן false
  // (ולא true) - תנאי שלא ניתן להכריע לא יכול להכניס פ"מ לחלון.
  if (field === 'lands_at_my_base') {
    if (ctx?.myBaseId == null || strip.landing_airfield_id == null) return false;
    return String(strip.landing_airfield_id) === String(ctx.myBaseId);
  }
  if (field === 'takes_off_from_my_base') {
    if (ctx?.myBaseId == null || strip.takeoff_airfield_id == null) return false;
    return String(strip.takeoff_airfield_id) === String(ctx.myBaseId);
  }
  if (field === 'workstation_preset_name') return strip.workstation_preset_name || '';
  // העמדות שהפ"מ נמצא בהן **כרגע**: כל גרירה לדסק או חיבור לאזור מוסיפים
  // עמדה, והסרה משם גורעת אותה. לכן זו **רשימה** ולא ערך יחיד - השרת מחזיר
  // אותה ב-`at_preset_names`. הנפילות-לאחור הן למסלולים שלא עוברים בה.
  if (field === 'at_preset') {
    if (Array.isArray(strip.at_preset_names)) return strip.at_preset_names;
    if (strip.workstation_preset_name) return [strip.workstation_preset_name];
    const id = strip.workstation_preset_id;
    if (id == null) return [];
    const name = ctx?.presetNamesById?.[id] ?? ctx?.presetNamesById?.[String(id)] ?? '';
    return name ? [name] : [];
  }
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

/**
 * תנאי על שדה זמן, בדקות מעכשיו.
 * `null` = האופרטור אינו אופרטור זמן (מכיל / אחד מ / ...) ולכן הטיפול ממשיך
 * בהשוואת הטקסט הרגילה - כך שאילתות ותיקות על `takeoff_time` ממשיכות לעבוד.
 */
const evalQTimeLeaf = (strip: any, leaf: QLeaf, ctx?: QEvalCtx): boolean | null => {
  const mins = qMinutesFromNow(getQFieldValue(strip, leaf.field, ctx), ctx?.now);
  if (leaf.compare === 'empty')     return mins === null;
  if (leaf.compare === 'not_empty') return mins !== null;
  if (!Q_TIME_COMPARES.has(leaf.compare)) return null;
  // פ"מ בלי זמן (או עם זמן לא תקין) לא מתאים לאף תנאי זמן - גם לא ל"לא שווה"
  if (mins === null) return false;
  if (leaf.compare === 'passed') return mins < 0;
  const x = parseFloat(leaf.value);
  if (!isFinite(x)) return false;
  switch (leaf.compare) {
    case 'lt':  return mins < x;
    case 'gt':  return mins > x;
    case 'eq':  return Math.round(mins) === Math.round(x);
    case 'neq': return Math.round(mins) !== Math.round(x);
    default:    return null;
  }
};

export const evalQLeaf = (strip: any, leaf: QLeaf, ctx?: QEvalCtx): boolean => {
  if (Q_TIME_FIELDS.has(leaf.field)) {
    const timeResult = evalQTimeLeaf(strip, leaf, ctx);
    if (timeResult !== null) return timeResult;
  }
  // שדות בחירת עמדה: הערך הוא רשימת שמות שנבחרו בתפריט, מופרדת בפסיקים.
  // בחירה ריקה = "לא סיננתי לפי עמדה", ולכן מתקיים תמיד.
  if (leaf.field === 'created_by_preset' || leaf.field === 'at_preset') {
    const raw = getQFieldValue(strip, leaf.field, ctx);
    // "נמצא בעמדה" מחזיר רשימה (פ"מ יכול להיות בכמה דסקים), "נוצר ע"י" ערך יחיד
    const actual = (Array.isArray(raw) ? raw : [raw])
      .map(v => String(v ?? '').trim().toLowerCase()).filter(Boolean);
    const selected = (leaf.value || '').split(',').map((v: string) => v.trim().toLowerCase()).filter(Boolean);
    if (selected.length === 0) return true;
    const hit = actual.some(a => selected.includes(a));
    return leaf.compare === 'not_in' || leaf.compare === 'neq' ? !hit : hit;
  }
  const raw = getQFieldValue(strip, leaf.field, ctx);
  const val = String(raw).toLowerCase();
  const cmp = (leaf.value || '').toLowerCase().trim();
  const isBool =
    leaf.field === 'airborne' ||
    leaf.field === 'in_table' ||
    leaf.field === 'created_by_me' ||
    leaf.field === 'on_map' ||
    leaf.field === 'block_deviation' ||
    leaf.field === 'lands_at_my_base' ||
    leaf.field === 'takes_off_from_my_base';
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
