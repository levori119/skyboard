// ─── תקלות מטוס בפ"מ ──────────────────────────────────────────────────────────
//
// התקלה היא **תכונה של המטוס** ולא של הפ"מ: היא יושבת על `strip_aircraft`
// (דגל תקלה, מהות מתפריט מנוהל, ופירוט חופשי) - בדיוק כמו הדת"ק, הכיפה,
// החימושים והמערכות, שכולם פר-מטוס.
//
// ברמת ה**פ"מ** מוצג שרשור התקלות של מטוסיו:
//   הטקסט  → *למי* יש תקלה  ("תקלה למספר 2, תקלה למספר 4")
//   ה-HINT → *מה* התקלה     ("מספר 2: מנוע - רעש חריג")
// כך שדה צר בסטריפ נשאר קריא במבט אחד, והפרטים עולים בריחוף.
//
// המחרוזות מגיעות מה-registry (`strips.fault*`) ולא מהקוד, כדי שהשדה יעבוד גם
// באנגלית וניתן יהיה לשנות את הניסוח בלי build מחדש.

import { tr } from '../i18n/tr';

/** תקלה של מטוס בודד בפ"מ, כפי שהשרת מחזיר אותה ב-`strip.aircraft_faults` */
export interface AircraftFault {
  /** מספר המטוס בתוך הפ"מ (1, 2, 3...) */
  idx: number;
  /** מהות התקלה - מתפריט התקלות שמנוהל במסך ניהול מערכת */
  fault_type?: string | null;
  /** פירוט התקלה - טקסט חופשי */
  fault_details?: string | null;
}

/** רק שורות עם מספר מטוס תקין, ממוינות לפי מספר המטוס */
const sortedFaults = (faults: AircraftFault[] | null | undefined): AircraftFault[] =>
  (Array.isArray(faults) ? faults : [])
    .filter(f => f && f.idx != null && isFinite(Number(f.idx)))
    .map(f => ({ ...f, idx: Number(f.idx) }))
    .sort((a, b) => a.idx - b.idx);

/** מספרי המטוסים שבתקלה, ממוינים */
export const faultAircraftIndices = (faults: AircraftFault[] | null | undefined): number[] =>
  sortedFaults(faults).map(f => f.idx);

/** האם לפ"מ יש בכלל תקלה - הקובע אם השדה מוצג באדום */
export const hasAnyFault = (faults: AircraftFault[] | null | undefined): boolean =>
  sortedFaults(faults).length > 0;

/** שרשור התקלות לשדה הפ"מ: "תקלה למספר 2, תקלה למספר 4" */
export const formatFaultsText = (faults: AircraftFault[] | null | undefined): string =>
  sortedFaults(faults).map(f => tr('strips.faultForNumber', { n: f.idx })).join(', ');

/**
 * תווית התג הקצר: "2" או "2,4" - **המספרים בלבד**.
 *
 * התג יושב לצד האו"ק על המפה, בנקודת המעבר, בטבלה, במוד האזרחי ובנקודת
 * ההצטרפות - מקומות שבהם אין רוחב למשפט שלם. המספר עונה על "למי", וה-HINT
 * (`formatFaultsHint`) עונה על "מה".
 */
export const formatFaultNumbers = (faults: AircraftFault[] | null | undefined): string =>
  faultAircraftIndices(faults).join(',');

/**
 * אדום הוא צבע **סטטוס** ולכן אינו עובר דרך התמה - רק מותאם לרקע בהיר/כהה.
 * יושב כאן ולא ברכיב, כי גם `FaultBadge` וגם `AircraftFaultFields` צריכים אותו
 * ואסור שיהיו שני גוונים של "אדום תקלה" באותו מסך.
 */
export const faultRedFor = (lightMode: boolean): string => (lightMode ? '#dc2626' : '#f87171');

/**
 * ה"מה" של תקלה **בודדת**: "מנוע - רעש חריג".
 *
 * זהו אותו ניסוח שב-HINT, ולכן הוא יושב כאן ולא בכל מקום תצוגה בנפרד:
 * תפריט הפ"מ על המפה כותב אותו **בשורת הסימון עצמה**, כדי שלא יידרש ריחוף
 * כדי לדעת מה התקלה, וה-HINT מרכיב ממנו שורה לכל מטוס.
 */
export const formatFaultWhat = (fault: AircraftFault | null | undefined): string => {
  const parts = [fault?.fault_type, fault?.fault_details]
    .map(v => String(v ?? '').trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' - ') : tr('strips.faultUnspecified');
};

/** ה-HINT של השדה: שורה לכל מטוס - המהות והפירוט */
export const formatFaultsHint = (faults: AircraftFault[] | null | undefined): string =>
  sortedFaults(faults)
    .map(f => `${tr('strips.faultAircraft', { n: f.idx })}: ${formatFaultWhat(f)}`)
    .join('\n');
