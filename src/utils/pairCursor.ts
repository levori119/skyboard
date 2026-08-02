/**
 * סמני העכבר/עט של מצב "שידוך בלחיצה" על מפת האזורים.
 *
 * שלושה סמנים שונים בעמדה, ולכל אחד משמעות אחרת - הבקר אמור לדעת מה תעשה
 * הלחיצה עוד לפני שלחץ:
 *   יד (grab)          - לוקח יישות (גרירה)
 *   כוונת עגולה        - מזיז את המפה (ראה MAP_PAN_CURSOR ב-mapPan.ts)
 *   **ריבוע** (כאן)    - משדך בלחיצה
 * הריבוע נבחר במכוון: הוא הצורה היחידה מבין השלוש, ולכן מזוהה בזווית העין
 * גם בלי להתמקד בו.
 *
 * שני מצבים:
 *   IDLE  - המצב דלוק אבל עוד לא נבחר פ"מ. ריבוע חלול אפור: "אפשר לבחור".
 *   ARMED - נבחר פ"מ. ריבוע ציאן מלא עם כוונת: "הלחיצה הבאה משייכת כאן".
 *
 * ה-SVG נכתב פעם אחת ומקודד ל-data-URI: `#` ו-`<` שוברים ערך ב-CSS, ולכן
 * encodeURIComponent חובה (נבדק ב-pairCursor.test.ts).
 */

const SIZE = 32;
const HOTSPOT = 16; // מרכז הריבוע - שם באמת תונח נקודת השיוך

/** קו מתאר שחור עבה מתחת לצורה - נקרא גם על מפה בהירה וגם על רקע כהה */
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>`;

const asCursor = (markup: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(markup)}") ${HOTSPOT} ${HOTSPOT}, crosshair`;

/** ריבוע חלול - "מצב שידוך דלוק, בחר פ"מ" */
const IDLE_SVG = svg(
  '<g fill="none" stroke="#000" stroke-width="4.5" stroke-linejoin="round" opacity="0.55">' +
  '<rect x="8.5" y="8.5" width="15" height="15" rx="2"/></g>' +
  '<g fill="none" stroke="#e2e8f0" stroke-width="2" stroke-linejoin="round">' +
  '<rect x="8.5" y="8.5" width="15" height="15" rx="2"/></g>'
);

/** ריבוע ציאן עם פינות וכוונת - "לחץ כאן כדי לשייך את הפ"מ שנבחר" */
const ARMED_SVG = svg(
  // מתאר שחור לכל הצורה
  '<g fill="none" stroke="#000" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.6">' +
  '<rect x="7.5" y="7.5" width="17" height="17" rx="2"/>' +
  '<path d="M16 2v5M16 25v5M2 16h5M25 16h5"/></g>' +
  // הריבוע עצמו + זרועות הכוונת
  '<g fill="none" stroke="#22d3ee" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="7.5" y="7.5" width="17" height="17" rx="2"/>' +
  '<path d="M16 2v5M16 25v5M2 16h5M25 16h5"/></g>' +
  // מילוי קלוש כדי שהריבוע ייקרא כ"שטח יעד" ולא כמסגרת ריקה
  '<rect x="9" y="9" width="14" height="14" rx="1.5" fill="#22d3ee" opacity="0.18"/>' +
  '<circle cx="16" cy="16" r="1.7" fill="#ecfeff"/>'
);

/** מצב שידוך דלוק, אין פ"מ נבחר */
export const FZ_PAIR_CURSOR_IDLE = asCursor(IDLE_SVG);
/** נבחר פ"מ - הלחיצה הבאה משייכת */
export const FZ_PAIR_CURSOR_ARMED = asCursor(ARMED_SVG);

/** שמות משתני ה-CSS שדרכם הסמנים מוזרקים ל-App.css (מוגדרים כאן, נצרכים שם) */
export const FZ_PAIR_CURSOR_VARS = {
  idle: '--fz-pair-cursor-idle',
  armed: '--fz-pair-cursor-armed',
} as const;
