// ─── מצב אלמנט בשדה: מקור אמת יחיד ───────────────────────────────────────────
//
// לאלמנט שני מצבים נפרדים, ושניהם נקבעים ב-**POPUP שעל המפה** - הוא הקובע:
//
//   כשירות (`status`)        - 'שמיש' / 'לא שמיש'. שאלה על האלמנט עצמו.
//   סטטוס תפעולי (`display_state`) - פתוח/סגור/מנצנץ/כבוי. שאלה על מה שהוא עושה
//                              עכשיו, ומוגבל ל-`allowed_statuses` של **סוג** האלמנט.
//
// ── למה הקובץ הזה קיים ───────────────────────────────────────────────────────
// הפאנל הצדדי החזיק רשימת כשירויות **משלו** ('תקין', 'שמיש', 'חלקי', 'לא תקין',
// 'תקול') שהפופאפ לא ידע עליה. לחיצה על התג בפאנל הכניסה את האלמנט לערך שאי
// אפשר להגיע אליו - ולא לצאת ממנו - מהמפה, וכך מחסום נתקע על "חלקי" בלי שום
// דרך להחזירו. מיפוי התוויות לסטטוס התפעולי ישב אף הוא משוכפל בתוך הפופאפ.
//
// כאן שניהם יושבים במקום אחד: הפאנל והפופאפ קוראים מאותו מקור, ולכן אינם
// יכולים להיפרד שוב.

export const SERVICEABLE = 'שמיש';
export const UNSERVICEABLE = 'לא שמיש';

/** הכשירויות הבנות-בחירה - בדיוק אלה שהפופאפ שעל המפה מציע, ובאותו סדר. */
export const ELEMENT_SERVICEABILITY: { value: string; color: string; bg: string }[] = [
  { value: SERVICEABLE, color: '#22c55e', bg: '#14532d' },
  { value: UNSERVICEABLE, color: '#ef4444', bg: '#7f1d1d' },
];

/**
 * ערכי כשירות שיצאו משימוש ועדיין יושבים ב-DB על אלמנטים ותיקים.
 * הם **מוצגים** (הפקח לא אמור לראות תג ריק), אבל אי אפשר לבחור בהם יותר.
 */
const LEGACY_SERVICEABILITY: Record<string, { color: string; bg: string }> = {
  'תקין': { color: '#22c55e', bg: '#14532d' },
  'לא תקין': { color: '#ef4444', bg: '#7f1d1d' },
  'תקול': { color: '#ef4444', bg: '#7f1d1d' },
  'חלקי': { color: '#f97316', bg: '#431407' },
};

/** צבע התג של הכשירות. `isLegacy` מאפשר לסמן ערך שיצא משימוש. */
export function serviceabilityStyle(status?: string | null): { color: string; bg: string; isLegacy: boolean } {
  const known = ELEMENT_SERVICEABILITY.find(s => s.value === status);
  if (known) return { color: known.color, bg: known.bg, isLegacy: false };
  const legacy = status ? LEGACY_SERVICEABILITY[status] : undefined;
  if (legacy) return { ...legacy, isLegacy: true };
  return { color: '#94a3b8', bg: '#334155', isLegacy: Boolean(status) };
}

/**
 * הכשירות הבאה בלחיצה על התג.
 *
 * ערך שאינו בר-בחירה (ישן, ריק) נחלץ ב**לחיצה אחת** ל'שמיש' במקום להמשיך
 * במחזור שלו - אחרת אלמנט שתקוע על 'חלקי' היה נשאר תקוע.
 */
export function nextServiceability(status?: string | null): string {
  return status === SERVICEABLE ? UNSERVICEABLE : SERVICEABLE;
}

/** תווית עברית של סטטוס תפעולי -> המפתח שנשמר ב-`display_state`, עם צבעו. */
export const ALLOWED_STATUS_TO_DISPLAY_STATE: Record<string, { key: string; color: string }> = {
  'פתוח': { key: 'open', color: '#22c55e' },
  'סגור': { key: 'close', color: '#ef4444' },
  'מנצנץ': { key: 'blink', color: '#f59e0b' },
  'כבוי': { key: 'off', color: '#64748b' },
  'עצור': { key: 'stop', color: '#ef4444' },
  'עבור': { key: 'go', color: '#22c55e' },
  'דולק': { key: 'open', color: '#22c55e' },
  'עומד': { key: 'normal', color: '#a855f7' },
  'נוסע': { key: 'normal', color: '#3b82f6' },
  'רגיל': { key: 'normal', color: '#94a3b8' },
};

export type DisplayStateOption = { key: string; label: string; color: string };

/** `allowed_statuses` חוזר מ-jsonb ולכן לפעמים כמערך ולפעמים כמחרוזת JSON. */
function parseAllowed(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

/**
 * הסטטוסים התפעוליים שמותר להציג לאלמנט, לפי מה שהוגדר ל**סוג** שלו.
 *
 * תווית שאין לה מיפוי **נופלת**: עדיף להציג פחות אפשרויות מאשר לכתוב מפתח
 * שהמפה לא יודעת לצייר. סוג בלי הגדרה נופל ל-`fallback` (ברירת המחדל לפי
 * האייקון, מ-`getElemDisplayStateOpts`).
 */
/**
 * מילוי ניטרלי לסמל אלמנט על מפת השדה.
 *
 * צבע ה**סוג** בלבל על הסמל: כתום היה ברירת המחדל לכל סוג בלי צבע, וכך
 * כתום-עם-טבעת-ירוקה נקרא כ"אזהרה" בזמן שהאלמנט תקין. המילוי ניטרלי, והצבע
 * היחיד על הסמל הוא הסטטוס (הטבעת) - חוץ מתקלה, שממלאת באדום כדי שלא תוחמץ.
 */
export const ELEMENT_NEUTRAL_FILL = '#1e293b';

/**
 * האם לסוג האלמנט יש סטטוס תפעולי שהפקח יכול לשנות.
 *
 * מקור אמת **יחיד**: הפאנל הצדדי, טבלת האלמנטים והפופאפ שעל המפה שאלו את זה
 * כל אחד בעצמו, והפופאפ פשוט לא שאל - כך שאלמנט קבוע קיבל שם כפתורי סטטוס
 * שהפאנל הסתיר. הערך מגיע מה-DB לפעמים כבוליאני ולפעמים כמחרוזת.
 */
// object ולא טיפוס מדויק: שורות אלמנט מגיעות כ-ElementRow (עם index signature)
// וכ-any מהמפה, ו-TS דוחה טיפוס שכל שדותיו אופציונליים מול שורה שאינה מצהירה עליו.
export function canChangeElementStatus(el: object): boolean {
  const v = (el as { type_can_change_status?: unknown }).type_can_change_status;
  return v === true || v === 'true';
}

export function displayStateOptions(rawAllowed: unknown, fallback: DisplayStateOption[]): DisplayStateOption[] {
  const allowed = parseAllowed(rawAllowed);
  if (allowed.length === 0) return fallback;
  const mapped = allowed
    .map(label => {
      const d = ALLOWED_STATUS_TO_DISPLAY_STATE[label];
      return d ? { key: d.key, label, color: d.color } : null;
    })
    .filter(Boolean) as DisplayStateOption[];
  return mapped.length > 0 ? mapped : fallback;
}
