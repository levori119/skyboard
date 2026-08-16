// Shared admin/strip field catalogs (extracted from App.tsx)

import { tr } from '../i18n/tr';

// טבלאות הבן של הפ"מ (נקודות מכוון וכו') **אינן** בקטלוג הזה בכוונה: לשדה
// שלהן יש כמה שורות לכל פ"מ, ותא יחיד לא יכול להחזיק אותן. הן נוספות למוד
// הטבלה דרך כפתור **"הוסף טבלה"**, ומקבלות בוחר שדות משלהן.
// ראה `src/types/subTables.ts`.

/**
 * שם השדה כפי שמוצג בבורר. שדות ותיקים נושאים תווית עברית קבועה בקטלוג; שדות
 * חדשים נושאים `labelKey` ולכן מתורגמים. כך נוספים שדות חדשים בלי לקודד עברית
 * קשיח, ובלי להמיר את כל הקטלוג הוותיק במכה אחת.
 */
export function fieldDefLabel(f: { label: string; labelKey?: string }): string {
  return f.labelKey ? tr(f.labelKey) : f.label;
}

export const STRIP_FIELD_DEFS = [
  { key: 'callSign',          label: 'או"ק',         editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'airborne',          label: 'מאוויר',        editableOptions: ['none', 'toggle'] },
  { key: 'sq',                label: 'טייסת',          editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'numberOfFormation', label: "מ' מערך",       editableOptions: ['none', 'keyboard'] },
  { key: 'task',              label: 'משימה',         editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'alt',               label: 'גובה',          editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'takeoffTime',       label: 'זמן המראה',     editableOptions: ['none', 'keyboard'] },
  { key: 'weapons',           label: 'חימושים',       editableOptions: ['none', 'keyboard'] },
  { key: 'targets',           label: 'מטרות',         editableOptions: ['none', 'keyboard'] },
  { key: 'systems',           label: 'מערכות',        editableOptions: ['none', 'keyboard'] },
  { key: 'shkadia',           label: 'שקדיה',         editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'erka',              label: 'ערכה',          editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'koteret',           label: 'כותרת',         editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'mivtza',            label: 'מבצע',          editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'tzevet_shilta',     label: 'צוות שליטה',   editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'ta_shilta',         label: 'תא שליטה',     editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'block_space',       label: 'מרחב בלוקים',  editableOptions: ['none', 'dropdown'] },
  { key: 'notes',             label: 'הערות',         editableOptions: ['none', 'keyboard', 'both'] },
  // הערה פרטית לעמדה: שתי עמדות שמחזיקות את אותו פ"מ כל אחת רואה וכותבת את שלה
  { key: 'station_note',      label: 'הערת עמדה',     editableOptions: ['none', 'keyboard'] },
  // תקלות המטוסים בפ"מ ("תקלה למספר 2", באדום, המהות והפירוט ב-HINT).
  // **קריאה בלבד**: התקלה נערכת על ה**מטוס** - בחלון פרטי הפ"מ ובפאנל המגדל -
  // ולא בתא הטבלה, שאינו יודע על *איזה* מטוס במבנה מדובר. ראה utils/faults.ts.
  { key: 'faults',            label: 'תקלות',         labelKey: 'strips.faults', editableOptions: ['none'] as string[] },
  { key: 'sector',            label: 'אזור',          editableOptions: ['none', 'dropdown'] },
  { key: 'serials',           label: 'ספרורים',       editableOptions: ['none'] as string[] },
  { key: 'transfer',          label: 'העבר',          editableOptions: ['none'] as string[] },
  { key: 'transfer_to',       label: 'העבר אל (מ"מי)', editableOptions: ['none'] as string[] },
  { key: 'sid',               label: 'SID',           editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'star',              label: 'STAR',          editableOptions: ['none', 'keyboard', 'both'] },
];

export const CUSTOM_FIELD_EDITABLE_OPTIONS = ['none', 'keyboard', 'both'];

export const EDITABLE_LABELS: Record<string, string> = { none: 'קריאה בלבד', keyboard: 'מקלדת', handwriting: 'כתב יד', both: 'מקלדת+כתב יד', toggle: 'מתג', dropdown: 'רשימת בחירה' };

// --- פתקיות (Sticky Notes) ---
export const STICKY_COLORS = [
  { label: 'צהוב',   value: '#fef08a' },
  { label: 'ורוד',   value: '#fbcfe8' },
  { label: 'תכלת',   value: '#bae6fd' },
  { label: 'ירוק',   value: '#bbf7d0' },
  { label: 'לבנדר',  value: '#ddd6fe' },
  { label: 'כתום',   value: '#fed7aa' },
  { label: 'אדום',   value: '#fecaca' },
  { label: 'לבן',    value: '#f1f5f9' },
];
