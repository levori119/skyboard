// ─── תקלות המטוסים של הפ"מ - קטע SQL משותף ───────────────────────────────────
//
// התקלה נרשמת על ה**מטוס** (`strip_aircraft`), והפ"מ מציג את שרשור התקלות של
// מטוסיו. אותה תת-שאילתה נדרשת בארבעה מסלולים שונים - הפ"מים הגלובליים, נקודת
// המעבר, המוד האזרחי ונקודת ההצטרפות - ולכן היא יושבת כאן ולא משוכפלת בכל אחד.
//
// **תת-שאילתה ולא JOIN:** JOIN אל `strip_aircraft` היה מכפיל את שורת הפ"מ פעם
// לכל מטוס.
//
// ─── הסינון לפי `aircraft_indices` (פיצול מבנה) ───────────────────────────────
//
// כשמבנה מתפצל, `partial-create` מעתיק את שורות המטוסים לפ"מ החדש אבל **משאיר**
// אותן גם על המקור (הן דרושות למיזוג חזרה). בלי הסינון, תקלה של מטוס שעבר לפ"מ
// אחר הייתה ממשיכה להופיע גם על הפ"מ שהוא עזב - שני מסכים מראים את אותה תקלה
// בשני מקומות, ולפקח אין דרך לדעת איפה המטוס באמת נמצא.
//
// `aircraft_indices` הוא מקור האמת ל"אילו מטוסים שייכים לפ"מ הזה עכשיו":
// מערך JSONB בפ"מ מפוצל, ו-NULL בפ"מ שלם (שאז אין מה לסנן).
//
// @param {string} stripAlias - הכינוי של טבלת `strips` בשאילתה הקוראת ('s')
// @returns {string} תת-שאילתה שמחזירה מערך JSONB, מוכנה ל-`SELECT ... AS aircraft_faults`
export function aircraftFaultsSubquery(stripAlias = 's') {
  return `(SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'idx', sa.idx, 'fault_type', sa.fault_type, 'fault_details', sa.fault_details
            ) ORDER BY sa.idx), '[]'::jsonb)
       FROM strip_aircraft sa
      WHERE sa.strip_id = ${stripAlias}.id
        AND sa.has_fault = TRUE
        AND ${belongsToStrip(stripAlias)})`;
}

/**
 * "המטוס `sa.idx` שייך לפ"מ הזה **עכשיו**" - התנאי שמכבד פיצול מבנה.
 *
 * מיוצא בנפרד כי גם טבלת המטוסים המלאה (`strip.aircraft`) חייבת אותו: אחרת
 * הטבלה בפ"מ מפוצל הייתה מציגה גם את המטוסים שכבר עזבו אותו.
 */
export function belongsToStrip(stripAlias = 's', idxExpr = 'sa.idx') {
  return `(${stripAlias}.aircraft_indices IS NULL OR ${stripAlias}.aircraft_indices @> to_jsonb(${idxExpr}))`;
}

/**
 * עמודות התקלה שנוסעות **עם המטוס** בפיצול, במיזוג ובהוצאת מטוס בודד.
 *
 * מטוס שיצא מהמבנה לוקח את תקלתו איתו - התקלה היא תכונה שלו, לא של המבנה
 * שממנו יצא. בלי זה הפ"מ החדש היה נוצר "תקין" והתקלה נעלמת מהמסך.
 */
export const FAULT_CARRY_COLUMNS = ['has_fault', 'fault_type', 'fault_details'];
