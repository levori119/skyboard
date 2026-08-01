// עמידות בנתק — מדיניות כתיבה כשאין קשר לשרת.
//
// העיקרון: פעולה ששתי עמדות יכולות לשנות **נחסמת** בנתק. פעולה ששייכת
// לעמדה/למשתמש בלבד נכנסת ל-outbox מקומי ונשלחת כשהקשר חוזר.
//
// למה לחסום ולא למזג: merge של העברת פ"מ אחרי נתק הוא בלתי פתיר בבטיחות —
// אם עמדה A "קיבלה" פ"מ בזמן שהייתה מנותקת, ובמקביל עמדה B העבירה אותו ל-C,
// אין רזולוציה נכונה, יש רק ניחוש. בקרת טיסה לא מנחשת.
//
// ברירת המחדל היא **shared (חסום)** — fail closed. נתיב שלא סווג במפורש
// כפרטי נחשב משותף, כך שנתיב חדש שנשכח לא נשלח בשקט אחרי נתק ארוך.

export type WritePolicy =
  | 'private' // שייך לעמדה/למשתמש בלבד → outbox מקומי, נשלח כשחוזר הקשר
  | 'shared'  // משפיע על עמדות אחרות → חסום בנתק
  | 'drop';   // חסר משמעות אחרי נתק (heartbeat) → נזרק בשקט

/** נתיבים שהכתיבה אליהם שייכת לעמדה/למשתמש בלבד ואינה נקראת ע"י עמדה אחרת. */
const PRIVATE_PATTERNS: RegExp[] = [
  /^\/api\/strokes(\/|$|\?)/,                        // תבניות כתב יד של המשתמש (learned_strokes)
  /^\/api\/digits(\/|$|\?)/,                         // ספרות נלמדות של המשתמש (learned_digits)
  /^\/api\/crew-members\/\d+\/preferences(\/|$|\?)/, // העדפות תצוגה אישיות
  /^\/api\/workstation-personal-filters(\/|$|\?)/,   // פילטר אישי בעמדה
  /^\/api\/activity-log(\/|$|\?)/,                   // יומן ביקורת — append-only, אין קונפליקט
];

/** נתיבים שאין טעם לשחזר אחרי נתק — מצב רגעי שכבר לא רלוונטי כשהקשר חוזר. */
const DROP_PATTERNS: RegExp[] = [
  /^\/api\/workstations\/\d+\/heartbeat(\/|$|\?)/,
];

/** מסיר origin ו-query כדי שההתאמה תהיה על ה-path בלבד. */
export function normalizePath(url: string): string {
  let p = url;
  const schemeEnd = p.indexOf('://');
  if (schemeEnd >= 0) {
    const slash = p.indexOf('/', schemeEnd + 3);
    p = slash >= 0 ? p.slice(slash) : '/';
  }
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  const h = p.indexOf('#');
  if (h >= 0) p = p.slice(0, h);
  return p || '/';
}

/** האם הבקשה מכוונת ל-API של SKY-KING (ולא לנכס סטטי / שירות חיצוני). */
export function isApiRequest(url: string): boolean {
  return normalizePath(url).startsWith('/api/');
}

export function isReadMethod(method: string): boolean {
  const m = (method || 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

/**
 * מסווג כתיבה לפי הנתיב. ברירת המחדל — `shared` (חסום בנתק).
 */
export function classifyWrite(url: string, method: string): WritePolicy {
  if (isReadMethod(method)) return 'private'; // קריאה לעולם אינה חסומה — היא נענית מה-cache
  const path = normalizePath(url);
  if (DROP_PATTERNS.some(re => re.test(path))) return 'drop';
  if (PRIVATE_PATTERNS.some(re => re.test(path))) return 'private';
  return 'shared';
}
