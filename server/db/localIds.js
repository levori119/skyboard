// טווח מזהים מקומי — למה פ"מ שנוצר בנתק אינו מתנגש בפ"מ שנוצר במרכז.
//
// הבעיה: `strips.id` הוא `SERIAL`. עמדה מנותקת שיוצרת פ"מ מקבלת את המזהה הבא
// **ברצף שלה**, והמרכז מחלק בדיוק את אותם מספרים לפ"מים של עמדות אחרות. בסנכרון
// חזרה שני פ"מים שונים לגמרי נושאים את אותו `id` — ואחד מהם היה נדרס בשקט.
//
// הפתרון: לכל עמדה **גוש מזהים משלה**, גבוה מכל מה שהמרכז יחלק אי פעם. הרצפים
// המקומיים מוזזים לתחילת הגוש בעליית המאגר המקומי, ולכן מזהה שנולד בנתק הוא
// ייחודי מלידתו ואינו צריך מיפוי בסנכרון.
//
// **למה לא מיפוי `local id → remote id`:** עמדה שיוצרת פ"מ יוצרת איתו שורות
// בנות (`strip_aircraft`, `strip_aircraft_armaments`) שאינן ביומן הסנכרון.
// מיפוי היה מתקן את ה-FK של מי שנרשם ביומן, ומשאיר את השאר מצביע למזהה שכבר
// שייך לפ"מ אחר. הזזת רצף פותרת את כולם בבת אחת, כי היא פועלת בלידה.
//
// חשבון הטווח (int4 מגיע עד 2,147,483,647):
//   1,500,000,000 + 6,000 גושים × 100,000 = 2,100,000,000  ✓
// כלומר 6,000 עמדות, ו-100,000 שורות שנוצרות בנתק בכל אחת. נתק של משמרת שלמה
// מייצר מאות שורות, לא עשרות אלפים.

/** תחילת הטווח המקומי. כל מזהה ≥ הערך הזה נולד בעמדה מנותקת. */
export const LOCAL_ID_BASE = 1_500_000_000;

/** גודל הגוש של עמדה בודדת. */
export const LOCAL_ID_BLOCK = 100_000;

/** כמה גושים יש. ראה חשבון הטווח למעלה. */
export const LOCAL_ID_BLOCKS = 6_000;

/** האם המזהה נולד בעמדה מנותקת. */
export const isLocalId = (id) => Number.isFinite(Number(id)) && Number(id) >= LOCAL_ID_BASE;

/**
 * FNV-1a — פיזור יציב של מפתח העמדה לגוש.
 *
 * יציב בכוונה: אותה עמדה חייבת לקבל את אותו גוש בכל עלייה, אחרת מזהים שנוצרו
 * אתמול והמזהים של היום היו נופלים בגושים שונים ורצף הסנכרון היה משתבש.
 */
export function blockIndexOf(stationKey) {
  let h = 0x811c9dc5;
  for (const ch of String(stationKey || 'station')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % LOCAL_ID_BLOCKS;
}

/**
 * המזהה הראשון שהעמדה הזו תחלק.
 *
 * `SKYKING_STATION_ORDINAL` גובר על הגיבוב: בפריסה שבה מספרים את העמדות מראש
 * זו הדרך להבטיח שאין שתי עמדות באותו גוש. בלעדיו הגיבוב מפזר, וההסתברות
 * להתנגשות היא של שתי עמדות שמנותקות **בו-זמנית** ונופלות לאותו גוש מתוך 6,000.
 */
export function localIdStart(stationKey) {
  const explicit = Number(process.env.SKYKING_STATION_ORDINAL);
  const block = Number.isInteger(explicit) && explicit >= 0 && explicit < LOCAL_ID_BLOCKS
    ? explicit
    : blockIndexOf(stationKey);
  return LOCAL_ID_BASE + block * LOCAL_ID_BLOCK;
}

/**
 * מזיז את **כל** רצפי המפתח הראשי במאגר המקומי לתחילת הגוש.
 *
 * למה כל הרצפים ולא רק חמש הטבלאות המסונכרנות: שורה בת שנוצרת בנתק
 * (`strip_aircraft`) אינה מסונכרנת בעצמה, אבל היא כן מגיעה למרכז ביום שבו
 * מישהו ידחוף גם אותה — ועד אז היא חייבת לא להתנגש עם מה שקיים.
 *
 * `setval(..., false)` ולא `ALTER SEQUENCE RESTART`: הצורה הזו אידמפוטנטית
 * ואינה דורסת רצף שכבר חילק מזהים בגוש. הזזה אחורה הייתה מחלקת שוב מזהה
 * שכבר תפוס — כלומר בדיוק ההתנגשות שהקובץ הזה בא למנוע.
 *
 * @returns {Promise<number>} כמה רצפים הוזזו
 */
export async function applyLocalIdRange(pool, stationKey, schema = 'public') {
  const start = localIdStart(stationKey);
  const { rows } = await pool.query(
    `SELECT pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = $1 AND c.relkind = 'r'
        AND pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) IS NOT NULL`,
    [schema],
  );
  let moved = 0;
  for (const { seq } of rows) {
    if (!seq) continue;
    const cur = await pool.query(`SELECT last_value, is_called FROM ${seq}`);
    const last = Number(cur.rows[0]?.last_value ?? 0);
    if (last >= start) continue; // כבר בגוש — לא נוגעים
    await pool.query(`SELECT setval($1, $2, false)`, [seq, start]);
    moved++;
  }
  return moved;
}
