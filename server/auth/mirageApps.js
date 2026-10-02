// רשומת האפליקציה של משתמש מיראז' - פענוח אחד לכל מי שקורא אותה.
//
// שני קוראים: כניסה מקוונת (routes/mirage.js, מול תשובת המיראז') וכניסה בנתק
// (auth/mirageReplica.js, מול ההעתק במאגר המקומי). פענוח שונה בשניהם היה
// נותן לאותו משתמש הרשאות שונות לפי מצב הקשר.

// תפקידים מקצועיים במיראז' (ציר נפרד מ-roles שהוא ציר ההרשאה).
// bakar = בקר (יב"א) · pakach = פקח (מגדל) — שני מקצועות נפרדים.
export const MIRAGE_POSITIONS = ['bakar', 'pakach', 'mashak', 'mefale'];

/**
 * פורמט ישן (מערך תפקידים) או מורחב ({ roles, workstations, positions }).
 * @param {object} apps `user.apps` של המיראז'
 */
export function mirageAppEntry(apps, appName) {
  const entry = (apps || {})[appName];
  if (Array.isArray(entry)) return { roles: entry, workstations: [], positions: [] };
  if (entry && typeof entry === 'object') {
    return {
      roles: Array.isArray(entry.roles) ? entry.roles : [],
      workstations: Array.isArray(entry.workstations) ? entry.workstations : [],
      positions: Array.isArray(entry.positions)
        ? entry.positions.filter(p => MIRAGE_POSITIONS.includes(p))
        : [],
    };
  }
  return { roles: [], workstations: [], positions: [] };
}
