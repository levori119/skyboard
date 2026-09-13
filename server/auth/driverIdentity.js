// זהות הנהג באפליקציית DRIVER.
//
// הנהג מתחבר במיראז' עם **ת"ז** כשם משתמש, וזו הזהות שנחתמת באסימון
// (routes/mirage.js §/api/auth/driver). ממנה - ורק ממנה - נגזר מה הנהג רואה:
// הנסיעות שנרשמו לת"ז שלו ובקשות הכניסה שהוא עצמו שלח. ת"ז שהלקוח שולח
// בפרמטר אינה מקנה דבר, אחרת כל נהג היה שולף נסיעות של נהג אחר.

/**
 * ת"ז בצורה אחידה להשוואה: ספרות בלבד, משלימים אפסים מובילים ל-9.
 * "12345678" ו-"012345678" הם אותו אדם - הפקח מקליד פעם כך ופעם כך.
 * פחות מ-5 ספרות או יותר מ-9 אינו ת"ז, ומחזיר ריק (= אין זהות).
 */
export function normalizeNationalId(v) {
  const digits = String(v ?? '').replace(/[^0-9]/g, '');
  if (digits.length < 5 || digits.length > 9) return '';
  return digits.padStart(9, '0');
}

/**
 * אותו כלל נרמול, כביטוי SQL על עמודה. ריק נשאר NULL - השלמה ל-"000000000"
 * הייתה מתאימה כל נסיעה בלי ת"ז לכל נהג שהת"ז שלו אפסים.
 */
export const nationalIdSql = (col) =>
  `LPAD(NULLIF(REGEXP_REPLACE(COALESCE(${col}, ''), '[^0-9]', '', 'g'), ''), 9, '0')`;

/**
 * האם הבקשה מגיעה מאפליקציית הנהג, ומה הת"ז שלו.
 * `nationalId` ריק אצל נהג = אסימון בלי זהות (למשל אסימון ישן מקוד הגישה
 * המשותף שבוטל) - הוא אינו רואה דבר.
 */
export function driverScopeOf(user) {
  const isDriver = user?.role === 'driver';
  return { isDriver, nationalId: isDriver ? normalizeNationalId(user?.nationalId) : '' };
}
