// ניהול נהגים: הנהג נבחר מרשימת המורשים במיראז' לבסיס של השדה.
//
// למה חובה ולא הקלדה: אישור כניסה נרשם לת"ז, ומאותה ת"ז הנהג מתחבר לאפליקציה.
// ת"ז שהוקלדה ביד (או נהג שאין לו הרשאת SKY-KING DRIVER לבסיס) היא אישור לאדם
// שלא יוכל להיכנס ולראות את הנסיעות שלו - והפקח לא יודע על כך עד שהנהג בשער.
// הרשימה מגיעה מ-GET /api/auth/mirage-drivers (routes/mirage.js).

export interface MirageDriver {
  nationalId: string;
  firstName: string;
  lastName: string;
  fullName: string;
}

/** ת"ז בצורה אחידה - אותו כלל כמו בשרת (server/auth/driverIdentity.js). */
export function normalizeNationalId(v: unknown): string {
  const digits = String(v ?? '').replace(/[^0-9]/g, '');
  if (digits.length < 5 || digits.length > 9) return '';
  return digits.padStart(9, '0');
}

/**
 * הנהגים שמוצעים בבורר: המורשים במיראז', בלי מי שכבר רשום בשדה (חוץ מהנהג
 * שנערך עכשיו). `currentMissing` - הנהג שנערך אינו ברשימת המורשים: נרשם לפני
 * החובה, או שהרשאתו הוסרה - מסמנים זאת במקום להעלים אותו.
 */
export function driverChoices(
  mirage: MirageDriver[],
  registered: { id: number; national_id: string }[],
  current: { id?: number; national_id: string } | null,
): { choices: MirageDriver[]; currentMissing: boolean } {
  const taken = new Set(registered
    .filter(r => !current || r.id !== current.id)
    .map(r => normalizeNationalId(r.national_id))
    .filter(Boolean));
  const choices = mirage.filter(m => !taken.has(m.nationalId));
  const currentNid = current ? normalizeNationalId(current.national_id) : '';
  return { choices, currentMissing: !!currentNid && !mirage.some(m => m.nationalId === currentNid) };
}

/**
 * האם אפשר לשמור. `original` - הת"ז השמורה (null בנהג חדש); `mirage` - הרשימה,
 * או null כשהמיראז' לא זמין.
 *
 * נהג שלא הוחלף נשמר תמיד, גם אם אינו במיראז' - אחרת נהג ותיק היה ננעל ואי
 * אפשר היה לעדכן לו אפילו הערה או תוקף. **הוספה או החלפה** מחייבות נהג מהרשימה.
 */
export function pickDriverError(args: {
  nationalId: string;
  original: string | null;
  mirage: MirageDriver[] | null;
}): 'pick' | 'unavailable' | null {
  const nid = normalizeNationalId(args.nationalId);
  const original = args.original === null ? '' : normalizeNationalId(args.original);
  if (args.original !== null && nid && nid === original) return null;
  if (!args.mirage) return 'unavailable';
  return nid && args.mirage.some(m => m.nationalId === nid) ? null : 'pick';
}
