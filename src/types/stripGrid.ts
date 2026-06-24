// Strip Grid (SG) layout types + classic strip field catalog (extracted from App.tsx)
import type { QGroup } from './index';

export interface SGCell {
  id: string; type: 'cell'; fieldKey: string;
  // content style
  bgColor?: string; textColor?: string; textBgColor?: string; fontSize?: number; bold?: boolean; italic?: boolean; textAlign?: 'left'|'center'|'right';
  blink?: boolean; blinkColor?: string; blinkRate?: number;
  // optional field title (shown above the content; free text, has its own style)
  showTitle?: boolean; titleText?: string; titleBg?: string; titleColor?: string; titleFontSize?: number; titleBold?: boolean; titleAlign?: 'left'|'center'|'right';
  // free-text hover hint (tooltip)
  hint?: string;
}
export interface SGSplit { id: string; type: 'split'; direction: 'h'|'v'; sizes: number[]; children: SGNode[]; }
export type SGNode = SGCell | SGSplit;
export interface SGCondition { id: string; query: QGroup | null; target: 'cell'|'strip'|'all'; targetCellId?: string; styleBg?: string; styleText?: string; blink?: boolean; blinkColor?: string; blinkRate?: number; }

export const CLASSIC_STRIP_FIELDS = [
  { key: '', label: '— ריק —' },
  // ── שדות בסיסיים ──
  { key: 'callSign', label: 'או"ק' },
  { key: 'sq', label: 'טייסת' },
  { key: 'squadron', label: 'טייסת (מורחב)' },
  { key: 'numberOfFormation', label: 'מספר מצבה' },
  { key: 'original_formation_count', label: 'מצבה מקורית' },
  { key: 'alt', label: 'גובה' },
  { key: 'task', label: 'משימה' },
  { key: 'takeoff_time', label: 'שעת המראה' },
  { key: 'airborne', label: 'מאוויר/קרקע' },
  { key: 'status', label: 'סטטוס' },
  { key: 'sector', label: 'אזור (שם)' },
  // ── שדות זהות ופ"מ ──
  { key: 'erka', label: 'ערכה' },
  { key: 'mivtza', label: 'מבצע' },
  { key: 'koteret', label: 'כותרת' },
  { key: 'tzevet_shilta', label: 'צוות שליטה' },
  { key: 'ta_shilta', label: 'תא שליטה' },
  { key: 'parent_callsign', label: 'או"ק פמ מקורי' },
  { key: 'formation_notes', label: 'הערה לפמ' },
  // ── שדות ניווט/שדות תעופה ──
  { key: 'takeoff_airfield', label: 'שדה המראה' },
  { key: 'landing_airfield', label: 'שדה נחיתה' },
  { key: 'sid', label: 'SID' },
  { key: 'star', label: 'STAR' },
  // ── שדות ציוד ──
  { key: 'weapons', label: 'חימושים' },
  { key: 'targets', label: 'מטרות' },
  { key: 'systems', label: 'מערכות' },
  { key: 'shkadia', label: 'שקדיה' },
  // ── שדות הערות ──
  { key: 'notes', label: 'הערות' },
  // ── שדות קרקע / מגרש ──
  { key: 'ground_status', label: 'סטטוס קרקע' },
  // ── שדות אזרחי ──
  { key: 'civ_status', label: 'סטטוס (אז׳)' },
  { key: 'civ_stand', label: 'פיר' },
  { key: 'civ_dest', label: 'יעד' },
  { key: 'civ_ssr', label: 'SSR' },
  // ── שדות מערכת פנימיים ──
  { key: 'in_table', label: 'הועבר אלי' },
  { key: 'on_map', label: 'על המפה' },
  { key: 'block_deviation', label: 'חריגה מבלוק' },
  { key: 'workstation_preset_name', label: 'הועבר לעמדה' },
  { key: 'flight_direction', label: 'כיוון פ"מ' },
  { key: 'created_at', label: 'זמן יצירה' },
  { key: 'id', label: 'מזהה פנימי' },
];
