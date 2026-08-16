// הצהרות טיפוסים ל-shared/sanitizeHtml.js — המימוש הוא ESM רגיל כדי ששרת
// Node (JS) והלקוח (TS/Vite) יוכלו לייבא את **אותו קובץ**, בלי שכפול הכלל.
// ראה ההסבר בראש המימוש.

/** מסנן מחרוזת style למאפייני CSS ולערכים המותרים בלבד. */
export declare function sanitizeStyle(style: unknown): string;

/** תוכן עשיר של פריט/כותרת בד"ח — עיצוב טקסט וצבע בלבד (SK-03). */
export declare function sanitizeRichText(html: unknown): string;

/** גוף אייקון SVG — צורות בלבד (SK-44). */
export declare function sanitizeSvgBody(svg: unknown): string;

/** מסיר כל תגית ומחזיר טקסט נקי. */
export declare function stripTags(html: unknown): string;
