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
 * האם הבקשה מגיעה מאפליקציית הנהג, מה הת"ז שלו ובאילו בסיסים הוא מורשה.
 *
 * הבסיסים נבחרים לנהג בהרשאת SKY-KING DRIVER במיראז' ונחתמים באסימון.
 * `nationalId` ריק אצל נהג = נהג **בלי זהות שמיש**: אסימון בלי ת"ז (קוד הגישה
 * המשותף שבוטל), או בלי אף בסיס מורשה (אסימון מלפני הרשאת הבסיסים). הוא אינו
 * רואה דבר, והאפליקציה מחזירה אותו למסך הכניסה.
 */
export function driverScopeOf(user) {
  const isDriver = user?.role === 'driver';
  if (!isDriver) return { isDriver, nationalId: '', baseIds: [] };
  const baseIds = (Array.isArray(user?.baseIds) ? user.baseIds : [])
    .map(Number).filter(n => Number.isInteger(n) && n > 0);
  const nationalId = baseIds.length ? normalizeNationalId(user?.nationalId) : '';
  return { isDriver, nationalId, baseIds };
}

/** עמדה - כל בסיס. נהג - רק בסיס שהוא מורשה אליו. */
export const driverMayUseBase = (scope, baseId) =>
  !scope.isDriver || (baseId != null && baseId !== '' && scope.baseIds.includes(Number(baseId)));

/**
 * middleware לנתיבי `/by-base/:baseId` (מפת הבסיס באפליקציית הנהג): נהג מקבל
 * 403 על בסיס שאינו מורשה אליו. עמדה עוברת תמיד.
 */
export function driverBaseGuard(req, res, next) {
  if (driverMayUseBase(driverScopeOf(req.user), req.params.baseId)) return next();
  return res.status(403).json({ error: 'base_not_permitted', message: 'אינך מורשה לבסיס זה' });
}
