// ─── עדכון מיידי בעמדה ───────────────────────────────────────────────────────
//
// מה שהפקח שינה נראה בעמדה **ברגע הלחיצה**, עוד לפני שהשרת וה-DB ענו. העדכון
// המקומי לבדו אינו מספיק: הפולינג שולף תמונה מלאה כל כמה שניות, ותמונה שיצאה
// **לפני** הלחיצה וחוזרת **אחריה** מחזירה את הערך הישן למסך. אז הכפתור "קופץ
// אחורה" ומתקן את עצמו רק בפולינג הבא - וזה בדיוק מה שנראה למפעיל כ"לוקח זמן
// להתרפרש".
//
// כאן נשמרים העדכונים ה**פתוחים** (נלחצו, טרם התקבלה עליהם תמונה מהשרת), והם
// מוחלים מחדש על כל תמונה שמגיעה - עד שהשרת מאשר ומגיעה תמונה שנשלפה **אחרי**
// האישור. משם והלאה השרת הוא האמת.
//
// `seq` מבדיל בין לחיצות: לחיצה שנייה על אותו מטוס פותחת עדכון חדש, והתשובה
// (הצלחה או כשל) של הראשונה כבר לא נוגעת בו.

export interface OptimisticOverlay<P extends Record<string, any>> {
  /** הפקח שינה - הערך נכנס מיד. מחזיר `seq` לזיהוי התשובה שתגיע עליו. */
  set(key: string, patch: P): number;
  /** השרת אישר - מכאן תמונה שנשלפה אחרי האישור גוברת על העדכון. */
  confirm(key: string, seq: number): void;
  /** הבקשה נכשלה - העדכון יורד. `false` = לחיצה חדשה יותר כבר מחזיקה את הערך. */
  drop(key: string, seq: number): boolean;
  /**
   * החלת העדכונים הפתוחים על תמונה שהגיעה מהשרת.
   * `fetchedAt` - הרגע שבו הבקשה **יצאה**, לא שבו חזרה. זה מה שמבדיל תמונה
   * ישנה שחוזרת באיחור מתמונה שבאמת יודעת על השינוי.
   */
  apply<R extends Record<string, any>>(rows: R[], keyOf: (row: R) => string, fetchedAt: number): R[];
  /** כמה עדכונים פתוחים (לבדיקות ולניפוי). */
  pending(): number;
}

interface Entry<P> { patch: P; seq: number; confirmedAt: number | null; until: number }

/**
 * @param ttlMs כמה זמן עדכון שלא אושר מחזיק מעמד. אחריו השרת גובר - עדכון
 *              שנתקע לנצח מציג לפקח מצב שאינו קיים באף עמדה אחרת.
 */
export function createOptimisticOverlay<P extends Record<string, any>>(
  opts: { ttlMs?: number; now?: () => number } = {},
): OptimisticOverlay<P> {
  const ttl = opts.ttlMs ?? 15000;
  const now = opts.now ?? (() => Date.now());
  const map = new Map<string, Entry<P>>();
  let nextSeq = 1;

  const sweep = (fetchedAt: number) => {
    const t = now();
    for (const [key, e] of [...map]) {
      if (t > e.until || (e.confirmedAt != null && fetchedAt > e.confirmedAt)) map.delete(key);
    }
  };

  return {
    set(key, patch) {
      const prev = map.get(key);
      const seq = nextSeq++;
      // מיזוג עם עדכון פתוח קודם: סימון ירוקים וקביעת צלע הם שני שדות של אותו
      // מטוס, והשני לא מוחק את הראשון.
      map.set(key, { patch: { ...(prev?.patch as object), ...patch } as P, seq, confirmedAt: null, until: now() + ttl });
      return seq;
    },
    confirm(key, seq) {
      const e = map.get(key);
      if (e && e.seq === seq) e.confirmedAt = now();
    },
    drop(key, seq) {
      const e = map.get(key);
      if (!e || e.seq !== seq) return false;
      map.delete(key);
      return true;
    },
    apply(rows, keyOf, fetchedAt) {
      if (map.size === 0) return rows;
      sweep(fetchedAt);
      if (map.size === 0) return rows;
      return rows.map(r => {
        const e = map.get(keyOf(r));
        return e ? { ...r, ...e.patch } : r;
      });
    },
    pending: () => map.size,
  };
}
