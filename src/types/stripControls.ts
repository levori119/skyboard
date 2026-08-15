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

export interface StripControl {
  /** מזהה בעץ הפריסה (ייחודי למופע, לא לערך) */
  id: string;
  /** מפתח הערך - יציב, וזהה בין תבניות שחולקות את אותו פקד */
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
