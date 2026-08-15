// Strip Grid (SG) layout types + classic strip field catalog (extracted from App.tsx)
import type { QGroup } from './index';
import type { StripControlRef } from './stripControls';
import { tr } from '../i18n/tr';
import { AIM_POINTS_FIELD_KEY, AIM_POINTS_FIELD_LABEL } from './aimPoints';

/** תא שמציג את נקודות המכוון כשורת תקציר אחת ולא כטבלה */
export const AIM_POINTS_SUMMARY_FIELD_KEY = 'aim_points_summary';

export interface SGCell {
  id: string; type: 'cell'; fieldKey: string;
  // content style
  bgColor?: string; textColor?: string; textBgColor?: string; fontSize?: number; bold?: boolean; italic?: boolean; textAlign?: 'left'|'center'|'right';
  blink?: boolean; blinkColor?: string; blinkRate?: number;
  // optional field title (shown above the content; free text, has its own style)
  showTitle?: boolean; titleText?: string; titleBg?: string; titleColor?: string; titleFontSize?: number; titleBold?: boolean; titleAlign?: 'left'|'center'|'right';
  // free-text hover hint (tooltip)
  hint?: string;
  /**
   * עמודות שנבחרו כשה-`fieldKey` הוא **טבלת בן** של הפ"מ (ראה `subTables.ts`).
   * התא מרנדר אז טבלה קטנה - שורה לכל נ"צ - במקום ערך יחיד. ריק/נעדר → עמודות
   * ברירת המחדל של אותה טבלה.
   */
  tableColumns?: { key: string; label?: string }[];
  /** כמה מהעמודות שנבחרו נשארות גלויות בגלילה אופקית */
  tableFrozenColumns?: number;
  /**
   * **פקדים** במשבצת: התא נפרס לשורת פקדים, וסדרם נקבע בגרירה בעורך. אלה
   * **הפניות** לשדות מהקטלוג (`strip_field_defs`) ולא עותקים של ההגדרה, ולכן
   * אותו שדה מוגדר פעם אחת ומופיע גם כאן וגם כעמודה במוד הטבלה. תא יכול לשאת
   * גם `fieldKey` וגם פקדים. ראה [`stripControls.ts`](stripControls.ts) ו-CIV_STRIP_CONTROLS.md
   */
  controls?: StripControlRef[];
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
  { key: 'planned_landing_time', label: 'זמן נחיתה מתוכנן' },
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
  // ── טבלת נקודות מכוון ──
  // שתי דרכים להציג אותה בפ"מ קלאסי: **טבלה** (התא נפרס לשורה לכל נ"צ, עם בוחר
  // עמודות משלו) או **שורת תקציר** אחת, לתא צר שאין בו מקום לטבלה.
  // 15 השדות הפרטניים אינם כאן - הם עמודות של הטבלה, לא שדות של הפ"מ.
  { key: AIM_POINTS_FIELD_KEY, label: AIM_POINTS_FIELD_LABEL, labelKey: 'strips.aimPointsTable' },
  { key: AIM_POINTS_SUMMARY_FIELD_KEY, label: 'נקודות מכוון (שורת תקציר)', labelKey: 'strips.aimPointsSummaryField' },
  // ── שדות הערות ──
  { key: 'notes', label: 'הערות' },
  // שרשור תקלות המטוסים בפ"מ ("תקלה למספר 2"), באדום. המהות והפירוט עולים
  // ב-HINT בריחוף. שדה **מחושב** - נערך על המטוס, לא על הפ"מ (utils/faults.ts)
  { key: 'faults', label: 'תקלות' },
  // ── שדות קרקע / מגרש ──
  { key: 'ground_status', label: 'סטטוס קרקע' },
  // ── שדות אזרחי ──
  { key: 'civ_status', label: 'סטטוס (אז׳)' },
  { key: 'civ_stand', label: 'פיר' },
  { key: 'civ_dest', label: 'יעד' },
  { key: 'civ_ssr', label: 'SSR' },
  // חמשת אלה קיימים ב-DB מאז שהלוח האזרחי נבנה, אבל לא היו בקטלוג כי הכרטיס
  // האזרחי היה קשיח. עם תבנית הסטריפ האזרחי הם נבחרים לתא ככל שדה אחר.
  { key: 'civ_fl', label: 'FL', labelKey: 'strips.civFl' },
  { key: 'civ_route', label: 'נתיב', labelKey: 'strips.civRoute' },
  { key: 'civ_time', label: 'שעה (אז׳)', labelKey: 'strips.civTime' },
  { key: 'civ_runway', label: 'מסלול (אז׳)', labelKey: 'strips.civRunway' },
  { key: 'unit', label: 'חברת תעופה', labelKey: 'strips.civAirline' },
  // ── שדות מערכת פנימיים ──
  { key: 'in_table', label: 'הועבר אלי' },
  { key: 'on_map', label: 'על המפה' },
  { key: 'block_deviation', label: 'חריגה מבלוק' },
  { key: 'workstation_preset_name', label: 'הועבר לעמדה' },
  { key: 'flight_direction', label: 'כיוון פ"מ' },
  { key: 'created_at', label: 'זמן יצירה' },
  { key: 'id', label: 'מזהה פנימי' },
];

/**
 * שם השדה כפי שמוצג בבורר ובכותרות התאים.
 *
 * שדות ותיקים נושאים תווית עברית קבועה בקטלוג; שדות חדשים נושאים `labelKey`
 * ולכן מתורגמים. כך נוסף שדה חדש בלי לקודד עברית קשיח, בלי להמיר את כל הקטלוג
 * הוותיק במכה אחת - ובלי שהבורר יציג מפתח גולמי.
 */
export function classicFieldLabel(f: { key: string; label: string; labelKey?: string }): string {
  return f.labelKey ? tr(f.labelKey) : f.label;
}

/** כמו `classicFieldLabel`, לפי מפתח השדה. מחרוזת ריקה כשאין שדה כזה. */
export function classicFieldLabelByKey(key: string): string {
  const f = CLASSIC_STRIP_FIELDS.find(x => x.key === key) as { key: string; label: string; labelKey?: string } | undefined;
  return f ? classicFieldLabel(f) : '';
}
