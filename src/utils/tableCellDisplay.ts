// תצוגת תא במוד טבלה - שלוש יכולות של הגדרת העמודה (table_modes.columns):
//
//   1. **שורה שנייה** (`second`) - שדה נוסף שמוצג מתחת לשדה העמודה באותו תא,
//      למשל או"ק ומתחתיו טייסת. כותרת העמודה נערמת באותו אופן.
//   2. **עיצוב תצוגה** (`decor`) - כללים לפי ערך התא: הקפה במשבצת / עיגול /
//      קו תחתון / מסגרת כפולה / רקע מלא, בצבע שנבחר, עם הדגשה והגדלה.
//      הכלל הראשון שמתאים מנצח - סדר הכללים בעורך הוא סדר העדיפות.
//   3. **תצוגה כאייקון** (`display` + `iconMap`) - ערך → אייקון מטבלת האייקונים
//      (מובנים: צלליות המטוסים של המערכת; ותמונות שהועלו בניהול).
//
// הכל נשמר בתוך JSON העמודה, ולכן אין כאן מיגרציה - עמודה ישנה בלי השדות
// האלה מוצגת בדיוק כמו קודם. ראה TABLE_MODE_DISPLAY_SPEC.md
import type React from 'react';
import { controlValueMatches } from './stripControls';
import { CONTROL_MATCH_ANY } from '../types/stripControls';
import type { AircraftIconType } from '../types';

export type CellShape = 'none' | 'box' | 'rounded' | 'circle' | 'underline' | 'double' | 'fill';

/** הצורות שהעורך מציע, לפי הסדר שבו הן מוצגות */
export const CELL_SHAPES: CellShape[] = ['box', 'rounded', 'circle', 'underline', 'double', 'fill', 'none'];

export interface CellDecorRule {
  id: string;
  /** ערך מפורש, `*` = כל ערך שאינו ריק, `''` = ריק. אותם כללים של העיצוב המותנה בפקדים */
  match: string;
  shape: CellShape;
  /** צבע הצורה (מסגרת / קו / רקע) */
  color: string;
  /** צבע טקסט נפרד. ריק = לפי הצורה (ברקע מלא - לבן, אחרת צבע התא) */
  textColor?: string;
  bold?: boolean;
  /** הגדלת גופן יחסית לתא (1 = ללא שינוי) */
  scale?: number;
}

export type CellDisplayMode = 'text' | 'icon' | 'iconText';
export const CELL_DISPLAY_MODES: CellDisplayMode[] = ['text', 'icon', 'iconText'];

/** החלק של הגדרת העמודה שהקובץ הזה קורא. שאר השדות (label, editable...) עוברים כמו שהם */
export interface ColumnDisplayConfig {
  key?: string;
  field?: string;
  isTable?: boolean;
  second?: ColumnDisplayConfig | null;
  decor?: CellDecorRule[];
  display?: CellDisplayMode;
  /** ערך → הפניית אייקון (`builtin:f16` / `img:12`). `*` = ברירת מחדל לכל ערך */
  iconMap?: Record<string, string>;
}

export const CELL_SCALES = [1, 1.25, 1.5, 2];

/** פלטת צבעים מהירה בעורך. צבעי סטטוס - זהים בכל התמות, כמו צבעי הסטטוס במערכת */
export const DECOR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#ffffff', '#000000'];

/** האייקונים המובנים - צלליות המטוסים שהמערכת כבר מציירת על המפה */
export const BUILTIN_DISPLAY_ICONS: { id: AircraftIconType; label: string }[] = [
  { id: 'f15', label: 'F-15' },
  { id: 'f16', label: 'F-16' },
  { id: 'f35', label: 'F-35' },
  { id: 'b707', label: 'B-707' },
  { id: 'gulfstream', label: 'Gulfstream' },
  { id: 'c130', label: 'C-130' },
  { id: 'uav', label: 'UAV' },
  { id: 'yasur', label: 'CH-53' },
  { id: 'apache', label: 'AH-64' },
  { id: 'blackhawk', label: 'UH-60' },
  { id: 'naval-blackhawk', label: 'SH-60' },
  { id: 'jet', label: 'JET' },
];
const BUILTIN_IDS = new Set<string>(BUILTIN_DISPLAY_ICONS.map(b => b.id));

/** הסנטינלים ש-getStripFieldValue מחזיר כשאין ערך - אינם ערך לצורך התאמה */
const EMPTY_SENTINELS = new Set(['—', '–', '-']);

export function normalizeCellValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return EMPTY_SENTINELS.has(s) ? '' : s;
}

/** כלל בלי צורה, בלי הדגשה, בלי הגדלה ובלי צבע טקסט - אינו משנה דבר */
function isNoopRule(r: CellDecorRule): boolean {
  return (r.shape === 'none' || !r.shape) && !r.bold && !(r.scale && r.scale !== 1) && !r.textColor;
}

export function resolveCellDecor(rules: CellDecorRule[] | null | undefined, rawValue: unknown): CellDecorRule | null {
  if (!Array.isArray(rules) || rules.length === 0) return null;
  const value = normalizeCellValue(rawValue);
  for (const rule of rules) {
    if (!rule || isNoopRule(rule)) continue;
    if (controlValueMatches('button', value, rule.match ?? CONTROL_MATCH_ANY)) return rule;
  }
  return null;
}

export function cellDecorStyle(rule: CellDecorRule): React.CSSProperties {
  const c = rule.color || '#ef4444';
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 5px', lineHeight: 1.25, boxSizing: 'border-box',
  };
  switch (rule.shape) {
    case 'box': style.border = `2px solid ${c}`; style.borderRadius = 0; break;
    case 'rounded': style.border = `2px solid ${c}`; style.borderRadius = '6px'; break;
    // עיגול: גם לערך קצר (מספר) וגם לארוך - אליפסה שמתמתחת לתוכן
    case 'circle': style.border = `2px solid ${c}`; style.borderRadius = '999px'; style.padding = '1px 8px'; style.minWidth = '1.9em'; break;
    case 'underline': style.borderBottom = `3px solid ${c}`; style.padding = '0 2px'; break;
    case 'double': style.border = `4px double ${c}`; style.borderRadius = '2px'; break;
    case 'fill': style.background = c; style.color = readableOn(c); style.borderRadius = '4px'; break;
    default: style.padding = 0; break;
  }
  if (rule.textColor) style.color = rule.textColor;
  if (rule.bold) style.fontWeight = 'bold';
  if (rule.scale && rule.scale !== 1) style.fontSize = `${rule.scale}em`;
  return style;
}

/** צבע טקסט קריא על רקע מלא - לפי בהירות הרקע */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#0f172a' : '#ffffff';
}

export function columnDisplayMode(col: ColumnDisplayConfig | null | undefined): CellDisplayMode {
  const d = col?.display;
  return d && (CELL_DISPLAY_MODES as string[]).includes(d) ? d : 'text';
}

/** הפניית האייקון לערך התא, או null כשהתצוגה טקסט / הערך ריק / אין מיפוי */
export function resolveCellIcon(col: ColumnDisplayConfig | null | undefined, rawValue: unknown): string | null {
  if (!col || columnDisplayMode(col) === 'text') return null;
  const value = normalizeCellValue(rawValue);
  if (!value) return null;
  const map = col.iconMap || {};
  const lower = value.toLowerCase();
  for (const [k, ref] of Object.entries(map)) {
    if (k === CONTROL_MATCH_ANY || !ref) continue;
    if (k.trim().toLowerCase() === lower) return ref;
  }
  return map[CONTROL_MATCH_ANY] || null;
}

export type ParsedIconRef = { kind: 'builtin'; id: AircraftIconType } | { kind: 'image'; id: string };

export function parseIconRef(ref: string | null | undefined): ParsedIconRef | null {
  if (!ref) return null;
  const i = ref.indexOf(':');
  if (i <= 0) return null;
  const kind = ref.slice(0, i);
  const id = ref.slice(i + 1);
  if (!id) return null;
  if (kind === 'builtin') return BUILTIN_IDS.has(id) ? { kind: 'builtin', id: id as AircraftIconType } : null;
  if (kind === 'img') return { kind: 'image', id };
  return null;
}

export function hasSecondLine(col: ColumnDisplayConfig | null | undefined): boolean {
  if (!col || col.isTable) return false;
  return !!(col.second && (col.second.key || col.second.field));
}

let ruleSeq = 0;
export function newDecorRule(): CellDecorRule {
  ruleSeq += 1;
  return { id: `dr_${Date.now().toString(36)}_${ruleSeq}`, match: CONTROL_MATCH_ANY, shape: 'box', color: '#ef4444' };
}
