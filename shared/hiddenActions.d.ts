// הצהרות טיפוסים ל-shared/hiddenActions.js - ראה ההסבר בראש המימוש.

export declare const HIDDEN_ACTIONS_KEY: string;

/** סדר הקבוצות במסך הניהול. התווית: actions.group_<id> */
export declare const ACTION_GROUPS: string[];

/** קטלוג הכפתורים והפעולות. התווית: actions.<id> */
export declare const ACTIONS: { id: string; group: string }[];

/** ערך גולמי -> רשימת id מוסתרים, מנוקה (רק מהקטלוג, בלי כפילויות). */
export declare function parseHiddenActions(value: unknown): string[];
