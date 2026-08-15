// ─── פקדים על הסטריפ ─────────────────────────────────────────────────────────
// המנהל מגדיר פקד, והפקח/בקר משנה את **ערכו** בלחיצה. הערך הוא שמשפיע על
// השאילתות, על העיצוב המותנה ועל המעבר בין עמדות. האפיון המלא, כולל מטריצת
// המקרים: CIV_STRIP_CONTROLS.md
//
// **המפתח (`key`) הוא הזהות.** שני פקדים באותו מפתח בשתי תבניות הם אותו פקד
// לוגי וחולקים ערך - וזה מה שמאפשר לפקד גלובלי לשמור על ערכו "לא משנה באיזה
// מקום הוא נמצא".

export type StripControlType = 'button' | 'field' | 'flag' | 'select' | 'multiselect';

/**
 * `window` - הערך יושב על **(פ"מ, עמדה)** ולכן בלוח אזרחי אחר הפקד מתאפס לב"מ.
 * `global` - הערך יושב על הפ"מ (`strips.custom_fields`) ונוסע איתו לכל מקום.
 */
export type StripControlScope = 'window' | 'global';

/** מצב הקלט של פקד מסוג שדה */
export type StripControlInput = 'keyboard' | 'handwriting' | 'both';

/** מחרוזת (כפתור/שדה/תפריט יחיד), בוליאני (דגל) או מערך (תפריט מרובה) */
export type StripControlValue = string | boolean | string[];

/** התאמה של "כל ערך שאינו ריק" בכלל עיצוב */
export const CONTROL_MATCH_ANY = '*';

/**
 * כלל עיצוב מותנה על **ערכו של הפקד עצמו**.
 * `match`: ערך מפורש | `''` (ריק) | `'*'` (לא ריק) | `'true'`/`'false'` (דגל).
 * הכלל הראשון שמתאים מנצח, כדי שסדר הכללים בעורך יהיה גם סדר העדיפות.
 */
export interface StripControlStyleRule {
  id: string;
  match: string;
  bg?: string;
  text?: string;
  bold?: boolean;
  blink?: boolean;
  blinkColor?: string;
  blinkRate?: number;
}

/**
 * **הצבה** של שדה מהקטלוג בתוך משבצת. ההגדרה עצמה (סוג, ערכים, ב"מ, היקף,
 * עיצוב מותנה) חיה בקטלוג ב-DB ולא כאן - כך שדה שנערך פעם אחת משתנה בכל מקום
 * שבו הוא מוצג, וגם במוד הטבלה. כאן רק מה ש**מקומי למקום ההצבה**: הרוחב שהוא
 * תופס בשורה והגופן.
 */
export interface StripControlRef {
  id: string;
  fieldKey: string;
  flex?: number;
  fontSize?: number;
  bold?: boolean;
  /**
   * **מיקום חופשי במשבצת**, באחוזי התא, לפי **מרכז** הפקד. נקבע בגרירה בעורך.
   * `x`/`y` שאינם קיימים = הפקד יושב בשורת הפקדים לפי סדרו (התנהגות ברירת
   * המחדל, וגם מה שקורה כשמאפסים מיקום).
   *
   * מכוון פיזי (`left`/`top`) ולא לוגי: זהו מישור גרירה חופשי כמו סימון על
   * מפה, ולא זרימת טקסט - ומכיוון שהעורך והכרטיס מציירים את אותו מספר, מה
   * שהמנהל רואה הוא מה שהפקח מקבל.
   */
  x?: number;
  y?: number;
  /** רוחב הפקד באחוזי התא כשהוא במיקום חופשי */
  w?: number;
}

/** ההגדרה המלאה של שדה מותאם, כפי שהיא יושבת בקטלוג (`strip_field_defs`) */
export interface StripControl {
  /** מזהה השורה בקטלוג (או מזהה מקומי לפני שמירה) */
  id: string;
  /** מפתח הערך. **נוצר בשרת ואינו נחשף למנהל** - מזהה טכני, לא תוכן */
  key: string;
  type: StripControlType;
  /** תווית קבועה שמוצגת על הפקד (בדגל היא הטקסט; בשאר - כותרת לצדו) */
  label?: string;
  /** רשימת הערכים: המחזור של כפתור, או האפשרויות של תפריט */
  values?: string[];
  /** שדה בלבד: מקלדת / כתב יד / שניהם */
  input?: StripControlInput;
  /** ב"מ - הערך שהפקד מציג כשאין לו ערך שמור */
  defaultValue?: StripControlValue;
  scope: StripControlScope;
  styles?: StripControlStyleRule[];
  /** חלוקת הרוחב בין הפקדים שבאותה משבצת */
  flex?: number;
  fontSize?: number;
  bold?: boolean;
}

export const STRIP_CONTROL_TYPES: { type: StripControlType; labelKey: string; fallback: string }[] = [
  { type: 'button',      labelKey: 'admin.controlTypeButton',      fallback: 'כפתור' },
  { type: 'field',       labelKey: 'admin.controlTypeField',       fallback: 'שדה' },
  { type: 'flag',        labelKey: 'admin.controlTypeFlag',        fallback: 'דגל' },
  { type: 'select',      labelKey: 'admin.controlTypeSelect',      fallback: 'תפריט (בחירה בודדת)' },
  { type: 'multiselect', labelKey: 'admin.controlTypeMultiSelect', fallback: 'תפריט (בחירה מרובה)' },
];

/** סוגים שרשימת הערכים שלהם היא חלק מההגדרה */
export const CONTROL_TYPES_WITH_VALUES: StripControlType[] = ['button', 'select', 'multiselect'];

/** קידומת מפתח השדה שדרכו פקד **גלובלי** נחשף לשאילתות ולעיצוב המותנה */
export const CONTROL_FIELD_PREFIX = 'ctl__';
