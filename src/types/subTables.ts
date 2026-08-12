// טבלאות הבן של הפ"מ - רישום מרכזי.
//
// **מה זו טבלת בן:** ישות שיושבת *מתחת* לפ"מ ויש לה **כמה שורות** לכל פ"מ, בניגוד
// לשדה רגיל שיש לו ערך אחד. טבלת נקודות המכוון היא הראשונה: לפ"מ אחד יש כמה נ"צי
// תקיפה, ולכל נ"צ יש 15 שדות משלו.
//
// **למה רישום ולא טיפול נקודתי:** שדה של טבלת בן לא יכול לחיות בבורר השדות של
// הפ"מ - הוא היה מנסה לדחוס N שורות לתא אחד, וגם היה מציף את הבורר בעשרות שורות
// (בדיוק מה שקרה). במקומו, בהגדרת מוד הטבלה יש כפתור **"הוסף טבלה"** שפותח את
// הרישום הזה, והטבלה שנבחרה מקבלת **בוחר שדות משלה** - בדיוק כמו זה שברמת הפ"מ.
//
// **הוספת טבלת בן חדשה בעתיד:** להוסיף כאן רשומה אחת. תפריט "הוסף טבלה", הבוחר
// המקונן והרינדור נגזרים מהרישום ולא דורשים נגיעה.
//
// > הערה למבנה: ב-DB של SKY-KING טבלת נקודות המכוון נשמרת כ-JSONB תחת הפ"מ
// > (`strips.targets`) ולא כטבלה נפרדת - שמירה אחת של כל הטבלה, בלי שורות
// > יתומות. **המודל הלוגי** הוא טבלת בן, וכך היא מוצגת, מקונפגת ונשלחת ב-GAPI.
//
// **שתי הטבלאות הרשומות ושתי דרכי האחסון שלהן:**
//
// | טבלה | מקור | עריכה בטבלה |
// |---|---|---|
// | נקודות מכוון | `strips.targets` (JSONB על הפ"מ) | כן - המערך **הוא** השדה, ונשמר בכתיבה אחת |
// | מטוסים | `strip_aircraft` (טבלת DB), מקוננת על הפ"מ ב-`GET /api/strips/global` | לא (`readOnly`) - כל שורה היא רשומה עם מפתח משלה, ונערכת במסלול שלה |
//
// לכן `toRows` הוא חלק מההגדרה: הצרכן לא מניח שהערך הגולמי הוא כבר שורות.

import { AIM_POINT_COLUMNS, AIM_POINTS_FIELD_KEY, AIM_POINTS_FIELD_LABEL, toAimPoints, type AimPointColumn } from './aimPoints';
import {
  STRIP_AIRCRAFT_COLUMNS, STRIP_AIRCRAFT_TABLE_KEY, STRIP_AIRCRAFT_TABLE_LABEL,
  toStripAircraftRows, type StripAircraftColumn,
} from './stripAircraft';

/** עמודה בתוך טבלת בן, כפי שהיא מופיעה בבוחר השדות שלה */
export interface SubTableColumnDef {
  /** המפתח בתוך שורת הטבלה */
  key: string;
  /** תווית עברית קבועה (גיבוי לצרכנים שקוראים `label` גולמי) */
  label: string;
  /** מפתח i18n - זה מה שמוצג */
  labelKey: string;
  /** אילו מצבי עריכה מותרים לעמודה זו בתא */
  editableOptions: string[];
  /** רוחב בסיס בפיקסלים (לפני זום המסך) */
  width: number;
}

export interface SubTableDef {
  /** מזהה הטבלה, נשמר ב-`tableKey` של העמודה במוד הטבלה */
  key: string;
  label: string;
  labelKey: string;
  /** השדה ב-`strip` שמחזיק את שורות הטבלה */
  stripField: string;
  columns: SubTableColumnDef[];
  /**
   * **קריאה בלבד בטבלה.** נכון לטבלה ששורותיה הן רשומות DB עם מפתח משלהן
   * (טבלת המטוסים), ולכן אי אפשר לשמור אותן בכתיבה אחת של המערך אל שדה הפ"מ -
   * כפי שנעשה בנקודות המכוון, שם המערך **הוא** השדה (`strips.targets`).
   * העריכה שלהן נעשית במסלולים הייעודיים שלהן.
   */
  readOnly?: boolean;
  /** מפתח i18n להודעה כשאין שורות */
  emptyKey: string;
  /** מנרמל את הערך הגולמי שעל הפ"מ לשורות מוכנות לתצוגה */
  toRows: (raw: unknown) => Record<string, unknown>[];
}

/** עמודה של נקודת מכוון → עמודה בבוחר השדות של טבלת הבן */
function fromAimColumn(c: AimPointColumn): SubTableColumnDef {
  return {
    key: c.key,
    label: c.label,
    labelKey: c.labelKey,
    // דגל נערך במתג ולא במקלדת; שאר השדות בטקסט חופשי
    editableOptions: c.kind === 'flag' ? ['none', 'toggle'] : ['none', 'keyboard'],
    width: c.width,
  };
}

/** עמודה של מטוס → עמודה בבוחר השדות. תמיד `none`: הטבלה לקריאה בלבד */
function fromAircraftColumn(c: StripAircraftColumn): SubTableColumnDef {
  return { key: c.key, label: c.label, labelKey: c.labelKey, editableOptions: ['none'], width: c.width };
}

export const STRIP_SUB_TABLES: SubTableDef[] = [
  {
    key: AIM_POINTS_FIELD_KEY,
    label: AIM_POINTS_FIELD_LABEL,
    labelKey: 'strips.aimPointsTable',
    stripField: 'targets',
    columns: AIM_POINT_COLUMNS.map(fromAimColumn),
    emptyKey: 'strips.noAimPoints',
    toRows: raw => toAimPoints(raw) as unknown as Record<string, unknown>[],
  },
  {
    key: STRIP_AIRCRAFT_TABLE_KEY,
    label: STRIP_AIRCRAFT_TABLE_LABEL,
    labelKey: 'strips.aircraftTable',
    // מגיע מקונן על הפ"מ ב-GET /api/strips/global (תת-שאילתה מ-strip_aircraft),
    // ולא בקריאה נפרדת - כך אותו מנגנון של טבלאות בן מוצא אותו בלי צינור משלו.
    stripField: 'aircraft',
    columns: STRIP_AIRCRAFT_COLUMNS.map(fromAircraftColumn),
    readOnly: true,
    emptyKey: 'strips.noAircraftRows',
    toRows: raw => toStripAircraftRows(raw) as unknown as Record<string, unknown>[],
  },
];

/** שורות טבלת הבן של פ"מ מסוים, מנורמלות לתצוגה */
export function subTableRows(def: SubTableDef, strip: unknown): Record<string, unknown>[] {
  const s = (strip && typeof strip === 'object') ? strip as Record<string, unknown> : {};
  return def.toRows(s[def.stripField]);
}

export const SUB_TABLE_BY_KEY: Record<string, SubTableDef> =
  Object.fromEntries(STRIP_SUB_TABLES.map(t => [t.key, t]));

export function getSubTable(key: string): SubTableDef | null {
  return SUB_TABLE_BY_KEY[key] || null;
}

/** האם עמודה במוד הטבלה היא טבלת בן */
export function isSubTableColumn(col: { isTable?: boolean; tableKey?: string } | null | undefined): boolean {
  return !!(col && col.isTable && col.tableKey && SUB_TABLE_BY_KEY[col.tableKey]);
}

/**
 * ברירת המחדל של עמודות טבלת בן שזה עתה נוספה למוד טבלה.
 *
 * לא כל 15 העמודות: טבלה שנפתחת עם הכל דוחקת את שאר הפ"מ מהמסך, והמקנפג ממילא
 * מוסיף בדיוק את מה שהעמדה שלו צריכה. אלה השדות שמזהים נ"צ תקיפה.
 */
export const SUB_TABLE_DEFAULT_KEYS: Record<string, string[]> = {
  [AIM_POINTS_FIELD_KEY]: ['name', 'aim_point', 'coord', 'alt_ft'],
  // מטוס: מי הוא (מספר ומספר זנב), מי טס בו, ואיפה הוא חונה. החימושים,
  // המערכות והתקלה נוספים במקנפג לעמדה שצריכה אותם.
  [STRIP_AIRCRAFT_TABLE_KEY]: ['idx', 'tail_number', 'pilot_name', 'datk'],
};

export function defaultSubTableColumns(tableKey: string): { key: string; label: string; editable: string }[] {
  const def = getSubTable(tableKey);
  if (!def) return [];
  const wanted = SUB_TABLE_DEFAULT_KEYS[tableKey] || def.columns.slice(0, 4).map(c => c.key);
  return def.columns
    .filter(c => wanted.includes(c.key))
    .map(c => ({ key: c.key, label: c.label, editable: 'none' }));
}

/**
 * צבע הזיהוי של טבלת בן בעמדה - ה-+, הפס האנכי של השורה הפרוסה וכותרתה נושאים
 * את אותו צבע, כדי שהעין תקשר ביניהם ולא תקרא את השורה הפרוסה כפ"מ נוסף.
 * תורכיז ולא צבע סטטוס, כי הוא מזהה **מבנה** ולא מצב תפעולי.
 *
 * **מותאם תמה:** התורכיז הבהיר קריא על רקע כהה, אבל על הרקע הבהיר הוא יורד
 * לניגודיות ~1.7:1 - מתחת לסף 3:1. באור נלקח תורכיז כהה.
 */
export function subTableAccent(themeMode: 'light' | 'dark' | 'ocean' = 'dark'): string {
  return themeMode === 'light' ? '#0e7490' : '#22d3ee';
}
