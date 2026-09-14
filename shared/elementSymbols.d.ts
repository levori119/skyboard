// הצהרות טיפוסים ל-shared/elementSymbols.js - המימוש ESM רגיל כדי שהאפליקציה
// הראשית (TS/Vite) ואפליקציית הנהג (HTML סטטי) ישתמשו באותו קובץ.

/** גוף סמל האלמנט (בלי תגית svg החיצונית), או '' לסמל לא מוכר. */
export declare function groundSvgIconBody(iconKey: string, status?: string, displayState?: string): string;

/** אנימציות ההבהוב, כמו ב-App.css - לסמל שנטען כתמונה. */
export declare const ELEMENT_BLINK_CSS: string;

type ElementLike = Record<string, unknown> | null | undefined;

/** איזה סמל מציגים לאלמנט לפי המצב התפעולי והכשירות. */
export declare function elementSymbolKey(el: ElementLike): string;

/** צבע המסגרת לפי המצב התפעולי. */
export declare function elementStateColor(el: ElementLike): string;

/** צבע הלוחית שמאחורי הסמל בטלפון. */
export declare const MARKER_PLATE_FILL: string;

/** האם האלמנט לא כשיר (X אדום). */
export declare function isElementBroken(el: ElementLike): boolean;

/** סמל אלמנט שלם כ-SVG עצמאי (מסגרת, סיבוב, הבהוב, X). */
export declare function elementMarkerSvg(el: ElementLike, size?: number): string;
