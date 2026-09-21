// הצהרות טיפוסים ל-shared/tripTracking.js - המימוש ESM רגיל כדי שהשרת,
// אפליקציית הנהג (HTML סטטי) והמגדל (TS/Vite) יריצו את **אותו** קוד.
//
// מוצהר כאן מה שצד ה-TS צורך בפועל (כלל החסימה). שאר היצוא - הגאומטריה,
// הספים וההתרעות - נצרך מהשרת ומדף הנהג ב-JS, ויוצהר כשצרכן TS יזדקק לו.

type ElementLike = Record<string, unknown> | null | undefined;

/** המצב התפעולי (display_state) ← התווית שהמנהלן בוחר ב-blocking_statuses. */
export declare const DISPLAY_STATE_LABEL: Record<string, string>;

/** הסטטוסים שבהם האלמנט סוגר: המפורשים, אחרת ברירת המחדל לקטגוריה, אחרת המותר הראשון. */
export declare function effectiveBlockingStatuses(el: ElementLike): string[];

/** האם האלמנט סוגר את הדרך עכשיו ("לא שמיש" אינו סוגר). */
export declare function isElementBlocking(el: ElementLike): boolean;
