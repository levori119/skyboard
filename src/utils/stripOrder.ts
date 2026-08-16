// סדר רשימת הפ"ממים בחלונית (סרגל צד) - רכיב אחד לכל המצבים (טבלה / אזורי טיסה / רגיל):
//   1. קודם מי שבאוויר, לפי זמן ההמראה מהמוקדם למאוחר
//   2. אחריהם מי שעל הקרקע, לפי זמן ההמראה המתוכנן מהמוקדם למאוחר
// פ"מ בלי זמן המראה נדחף לסוף הקבוצה שלו (לא לתחילתה).
// ההפרדה בין השתיים היא ויזואלית בלבד (או"ק של מי שבאוויר מוצג בכחול) - אין קיבוץ.

type StripLike = { airborne?: boolean | null; takeoff_time?: string | null };

/** זמן המראה במילישניות; חסר/לא תקין → Infinity (בסוף הקבוצה). */
export const takeoffMs = (s: StripLike): number => {
  if (!s.takeoff_time) return Infinity;
  const t = new Date(s.takeoff_time).getTime();
  return isNaN(t) ? Infinity : t;
};

/** משווה לפי "באוויר קודם, ובכל קבוצה לפי זמן המראה עולה". */
export const compareAirborneThenTakeoff = (a: StripLike, b: StripLike): number => {
  if (a.airborne && !b.airborne) return -1;
  if (!a.airborne && b.airborne) return 1;
  return takeoffMs(a) - takeoffMs(b);
};
