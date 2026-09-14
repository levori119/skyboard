// למי אלמנט בבסיס רלוונטי - רכבים, מטוסים או שניהם (airfield_elements.relevant_for).
//
// **מקור אמת יחיד** לשרת (חישוב נתיב לרכב, מעקב נסיעה חי, רשימת האלמנטים לנהג),
// לניהול ולמגדל. אלמנט שרלוונטי רק למטוסים (תאורת מסלול, סימון הסעה) אינו
// עוצר רכב ואינו מופיע לנהג.
//
// ES module בלי תלויות: נטען ב-Node, ב-vitest ובאפליקציה (Vite).

/** הקהלים, בסדר התצוגה הקבוע */
export const ELEMENT_AUDIENCES = Object.freeze(['vehicles', 'aircraft']);

/**
 * ברירת המחדל - שניהם. אלמנט שנוצר לפני השדה (או שהערך שלו פגום) ממשיך להופיע
 * לנהג ולעצור את הנתיב כמו קודם, ולא נעלם בשקט.
 */
export const DEFAULT_RELEVANT_FOR = Object.freeze(['vehicles', 'aircraft']);

/** קלט (מערך או JSON) → הקהלים התקינים בסדר קבוע, או null כשאין אף אחד */
export function parseRelevantFor(value) {
  let v = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!Array.isArray(v)) return null;
  const out = ELEMENT_AUDIENCES.filter(a => v.includes(a));
  return out.length ? out : null;
}

/** הקהלים של אלמנט */
export function relevantFor(el) {
  return parseRelevantFor(el?.relevant_for) ?? [...DEFAULT_RELEVANT_FOR];
}

/** האם האלמנט רלוונטי ל-'vehicles' / 'aircraft' */
export function isRelevantFor(el, audience) {
  return relevantFor(el).includes(audience);
}

/** רק האלמנטים שרלוונטיים לקהל */
export function onlyRelevantFor(elements, audience) {
  return Array.isArray(elements) ? elements.filter(el => isRelevantFor(el, audience)) : [];
}
