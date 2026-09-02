// שכבת האימות וההרשאות של SKY-KING - ממצאי אבטחה SK-01 ו-SK-02.
//
// עיקרון: **deny by default**. ה-middleware יושב לפני כל ה-routers ב-app.js,
// ולכן router חדש מקבל הגנה אוטומטית בלי שאף אחד יזכור להוסיף אותה. זו הנקודה
// המרכזית: הסקר מצא 440 endpoints פתוחים כי ההגנה מעולם לא הייתה גלובלית.
// כל פתיחה היא **רשימת היתר מפורשת** למטה, ולכל אחת מהן יש נימוק כתוב.
//
// ההרשאה נגזרת מהאסימון החתום שהשרת הנפיק (server/auth/token.js) - לעולם לא
// מ-req.body ולא ממצב הלקוח. זה מה שסוגר את SK-02: הסתרת כפתור בלקוח נשארת
// כשיפור חוויה, והאכיפה עברה לכאן.

import { timingSafeEqual } from 'crypto';
import { bearerFrom, verifyToken } from '../auth/token.js';

/** רמות ההרשאה. הסדר משמעותי: כל רמה מכילה את זו שמתחתיה. */
export const ROLE = {
  ADMIN: 'admin',
  TEAM_LEAD: 'team_lead',
  USER: 'user',
  DRIVER: 'driver',
  /** שירות עמית (המיראז'), לא אדם. מוגבל ל-SERVICE_PATHS בלבד. */
  SERVICE: 'service',
};

/**
 * הכיוון ההפוך: **שירות עמית קורא ל-SKY-KING**.
 *
 * מסך הניהול במיראז' מציג את רשימת העמדות כדי לשייך אליהן משתמשים, והוא
 * שואב אותה מ-SKY-KING. כשנוספה שכבת האימות הקריאה הזו נחסמה, ומסך הניהול
 * הציג "SKY-KING לא זמין" בלי שום רמז לסיבה - פיצ'ר שנשבר בשקט, בדיוק מה
 * שהסקר מזהיר מפניו.
 *
 * הפתרון אינו לפתוח את הנתיבים לכולם אלא לתת לשירות העמית זהות משלו:
 * `MIRAGE_SERVICE_TOKEN` (או `SERVICE_TOKEN`), ורשימת היתר **סגורה ומפורשת**
 * של קריאות קריאה-בלבד. אסימון השירות אינו פותח שום דבר אחר, וכל נתיב אחר
 * יוחזר 403 גם עם אסימון תקף.
 *
 * **שתי הרשומות של המפות** נוספו עבור **מאגר התמונ"א (ATSIM)**: הוא מייבא
 * מפות מעוגנות שכבר עוגנו כאן, כדי שלא יעגנו את אותה מפה פעמיים. הייבוא הוא
 * העתקה חד-פעמית לצד המאגר - הוא **קורא בלבד**, ואין ולא יהיה כאן נתיב שבו
 * שירות עמית כותב לטבלת `maps`. שים לב שהרשימה משותפת לכל שירות עמית: על
 * רשת מבודדת שני העמיתים נחשבים באותה רמת אמון, וכולם קריאה-בלבד.
 */
const SERVICE_PATHS = [
  ['GET', '/api/workstation-presets'],
  ['GET', '/api/aviation-bases'],
  ['GET', '/api/maps'],
  // מפה בודדת **עם** `image_data`. תבנית ולא מחרוזת, כי המזהה בנתיב.
  ['GET', /^\/api\/maps\/\d+$/],
];

/** השוואה בזמן קבוע. `false` גם כשהאסימון כלל אינו מוגדר בשרת. */
function serviceTokenOk(req) {
  // `SERVICE_TOKEN` הוא השם הכללי (יש יותר משירות עמית אחד), והשם הישן נשאר
  // כדי שהתקנה קיימת של המיראז' לא תישבר.
  const expected = process.env.SERVICE_TOKEN || process.env.MIRAGE_SERVICE_TOKEN || '';
  if (!expected) return false;
  const a = Buffer.from(String(req.get?.('X-Service-Token') || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** דרישות שכלל יכול לבקש. */
const NEED = {
  PUBLIC: 'public',   // ללא אסימון
  USER: 'user',       // כל מזוהה (בקר / פקח / ראש צוות / מנהל)
  STAFF: 'staff',     // ראש צוות או מנהל - מסכי הניהול
  ADMIN: 'admin',     // מנהל בלבד - הרסני או כלל-מערכתי
  DRIVER: 'driver',   // אפליקציית הנהג (או כל מזוהה אחר)
};

const WRITE = ['POST', 'PUT', 'PATCH', 'DELETE'];
const ALL = null; // כל השיטות

/**
 * טבלת המדיניות - **הכלל הראשון שמתאים מנצח**, ולכן הסדר הוא חלק מהנכונות:
 * חריגים תפעוליים חייבים להופיע *לפני* התחיליות הרחבות של הניהול.
 * למשל `/api/bdh-alerts` (התראה שפקח מסמן) לפני `/api/bdh` (עריכת הבד"ח עצמו),
 * ו-`/api/airfield-element-types` (הגדרת סוג) לפני `/api/airfield-elements`
 * (שינוי סטטוס בשטח).
 *
 * @type {Array<{m: string[]|null, p: string|RegExp, need: string, why: string}>}
 */
const RULES = [
  // ── ציבורי ────────────────────────────────────────────────────────────────
  { m: ['GET'], p: '/api/health', need: NEED.PUBLIC, why: 'liveness - הפלטפורמה מנטרת אותו לפני שיש בכלל משתמש' },
  { m: ['GET'], p: '/api/ready', need: NEED.PUBLIC, why: 'readiness - load balancer, ללא זהות' },
  { m: ['POST'], p: '/api/auth/mirage-login', need: NEED.PUBLIC, why: 'זו נקודת ההזדהות עצמה' },
  { m: ['POST'], p: '/api/auth/driver', need: NEED.PUBLIC, why: 'הזדהות אפליקציית הנהג (קוד גישה)' },
  // נקרא ע"י שרת העמדה עצמו מיד אחרי כניסה מוצלחת, כדי לאפשר כניסה בנתק.
  // אינו ציבורי בפועל: הנתיב קיים רק כשהשרת רץ על המאגר המקומי (isLocalDbMode)
  // והוא דוחה כל מקור שאינו loopback. ראה routes/mirage.js.
  { m: ['POST'], p: '/api/auth/cache-credential', need: NEED.PUBLIC, why: 'שמירת אסמכתא לכניסה בנתק - מוגבל למאגר מקומי ול-loopback' },
  { m: ['GET'], p: '/api/environments', need: NEED.PUBLIC, why: 'בורר הסביבה במסך הכניסה, לפני ההזדהות. מחזיר מספר וסטטוס בלבד' },
  { m: ['GET'], p: '/api/translations', need: NEED.PUBLIC, why: 'מחרוזות ממשק, נטענות לפני הרינדור הראשון. אינן מידע תפעולי' },
  // סמלים ארגוניים נטענים כ-<img src> (utils/emblemSource.ts) - תגית img **אינה
  // יכולה** לשאת כותרת Authorization. חשיפה מודעת: לוגו, קריאה בלבד. הכתיבה
  // אליהם מוגבלת למנהל בכלל שלמטה, וזה מה ש-SK-45 ביקש.
  { m: ['GET'], p: /^\/api\/emblems\//, need: NEED.PUBLIC, why: 'נטען כ-img src, לא ניתן לצרף כותרת. לוגו בלבד' },

  // ── מנהל בלבד - הרסני או כלל-מערכתי ───────────────────────────────────────
  { m: ['GET'], p: '/api/_diag/env', need: NEED.ADMIN, why: 'SK-13 - חושף תשתית ו-DB' },
  { m: ['DELETE'], p: '/api/activity-log', need: NEED.ADMIN, why: 'SK-18 - מחיקת יומן ביקורת' },
  { m: ['POST'], p: /^\/api\/environments\/\d+\/reset$/, need: NEED.ADMIN, why: 'SK-12 - DROP SCHEMA' },
  { m: WRITE, p: /^\/api\/translations/, need: NEED.ADMIN, why: 'משנה מחרוזות בכל המסכים בכל העמדות' },
  { m: WRITE, p: /^\/api\/emblems\//, need: NEED.ADMIN, why: 'SK-45 - משנה את הסמל בכל עמדה' },
  { m: WRITE, p: /^\/api\/air-picture\/config$/, need: NEED.ADMIN, why: 'מפנה את התמונ"א למאגר אחר ומחזיק את הטוקן שלו - הגדרה כלל-מערכתית' },
  { m: ['GET'], p: '/api/air-picture/admin-config', need: NEED.STAFF, why: 'מסך הניהול - חושף את כתובת המאגר' },
  { m: WRITE, p: /^\/api\/serials\//, need: NEED.ADMIN, why: 'ייבוא ומחיקה גורפת של סדרות' },
  { m: ['PATCH', 'DELETE'], p: /^\/api\/suggestions\//, need: NEED.ADMIN, why: 'טיפול בהצעות - טאב מנהל בלבד' },

  // ── חריגים תפעוליים - חייבים לקדום לתחיליות הניהול שמתחתיהם ────────────────
  // ביטול פעולה (CTRL+Z). USER ולא STAFF: זו פעולה תפעולית של הבקר/הפקח על
  // **מה שהוא עצמו** עשה. ההגבלה האמיתית אינה כאן אלא בשאילתה - הפעולות
  // מסוננות לפי הזהות שבאסימון ולפי העמדה. ראה UNDO_SPEC.md §2.
  { m: ALL, p: /^\/api\/undo(\/|$)/, need: NEED.USER, why: 'ביטול הפעולה האחרונה של המפעיל עצמו' },
  { m: ALL, p: /^\/api\/bdh-alerts/, need: NEED.USER, why: 'התראת בד"ח שפקח מסמן בזמן אמת' },
  { m: ALL, p: /^\/api\/bdh-preset-assignments/, need: NEED.USER, why: 'קריאת שיוך בלבד' },
  { m: ['PUT'], p: /^\/api\/sectors\/\d+\/notes$/, need: NEED.USER, why: 'הערת סקטור - כתיבה תפעולית של הבקר' },
  { m: ALL, p: /^\/api\/airfield-elements(\/|$)/, need: NEED.USER, why: 'שינוי סטטוס אלמנט בשטח - פעולה תפעולית של הפקח' },
  { m: ALL, p: /^\/api\/strip-serial-(selections|dismissals)/, need: NEED.USER, why: 'בחירת סדרה לפ"מ - תפעולי' },
  { m: ALL, p: /^\/api\/mission-desk-state/, need: NEED.USER, why: 'מצב שירות בדסק - תפעולי' },
  { m: ALL, p: /^\/api\/workstation-personal-filters/, need: NEED.USER, why: 'פילטר אישי של המפעיל' },
  { m: ALL, p: /^\/api\/crew-members\/\d+\/preferences/, need: NEED.USER, why: 'העדפות תצוגה אישיות' },
  { m: ALL, p: /^\/api\/blocks(\/|$)/, need: NEED.USER, why: 'שיבוץ בלוקים - תפעולי (להבדיל מ-block-tables/spaces)' },
  // נקודות הצטרפות: שיבוץ פ"מ לבלוק גובה, אישור קונפליקט מתואם, מסלול והקפה
  // למטוס - כולן פעולות הפקח בזמן אמת, להבדיל מ-/api/joining-points שהיא ההגדרה.
  { m: ALL, p: /^\/api\/joining-point-(strips|aircraft)(\/|$)/, need: NEED.USER, why: 'מצב חי של נקודת הצטרפות - תפעולי' },
  { m: ALL, p: /^\/api\/strip-aircraft\/[^/]+\/\d+\/flight-status$/, need: NEED.USER, why: 'ירוקים / אישור לנחות / נחיתה - דיווח הפקח' },
  { m: ALL, p: /^\/api\/strip-aircraft\/[^/]+\/\d+\/fault$/, need: NEED.USER, why: 'סימון תקלה במטוס - דיווח תפעולי של הבקר/הפקח (התפריט עצמו הוא ניהול)' },
  { m: ALL, p: /^\/api\/strip-zone-/, need: NEED.USER, why: 'שיוך פ"מ לאזור - תפעולי' },
  { m: ['PATCH'], p: /^\/api\/strips\/\d+\/block-(space|deviation)$/, need: NEED.USER, why: 'תפעולי' },
  // פקדים על הסטריפ: ה**הגדרה** שלהם היא ניהול (נשמרת עם התבנית, ולכן נופלת
  // תחת /api/classic-strip-tables ודורשת STAFF), אבל **הערך** הוא לחיצה של
  // הפקח בזמן אמת - בדיוק כמו סטטוס או הערה. ראה CIV_STRIP_CONTROLS.md
  { m: ALL, p: /^\/api\/strip-control-values(\/|$)/, need: NEED.USER, why: 'ערך פקד בלוח - תפעולי' },
  // הקטלוג נקרא בכל עמדה (בלעדיו אי-אפשר לצייר פקד), אבל **הגדרת** שדה היא
  // ניהול - היא משנה מה כל עמדה רואה. לכן קריאה USER וכתיבה STAFF.
  { m: ['GET'], p: /^\/api\/strip-field-defs(\/|$)/, need: NEED.USER, why: 'קטלוג השדות - נדרש לציור כל פקד' },
  { m: WRITE, p: /^\/api\/strip-field-defs(\/|$)/, need: NEED.STAFF, why: 'הגדרת שדה מותאם - משנה את התצוגה בכל העמדות' },
  { m: ['PUT'], p: /^\/api\/strips\/\d+\/control-field$/, need: NEED.USER, why: 'ערך פקד גלובלי על הפ"מ - תפעולי' },

  // ── מסכי הניהול - ראש צוות או מנהל ────────────────────────────────────────
  // הרשימה מקבילה ל-teamLeadTabs ב-ManagementPage.tsx: אותה חלוקת תפקידים
  // בשרת ובלקוח, לפי עקרון הרכיב המשותף. שינוי כאן מחייב שינוי שם.
  { m: WRITE, p: /^\/api\/(sectors|sub-sectors)(\/|$)/, need: NEED.STAFF, why: 'טופולוגיית סקטורים' },
  { m: WRITE, p: /^\/api\/(maps|map-zones|map-transfer-points|zone-altitude-ranges|closures)(\/|$)/, need: NEED.STAFF, why: 'מפות ואזורים' },
  { m: WRITE, p: /^\/api\/(workstation-presets|preset-view-stations|presets)(\/|$)/, need: NEED.STAFF, why: 'הגדרת עמדות' },
  { m: WRITE, p: /^\/api\/(bdh|bdh-items)(\/|$)/, need: NEED.STAFF, why: 'עריכת מסמכי בד"ח' },
  { m: WRITE, p: /^\/api\/(aid-groups|aid-items)(\/|$)/, need: NEED.STAFF, why: 'עזרים' },
  { m: WRITE, p: /^\/api\/(table-modes|units|defaults|value-lists|default-names|work-groups|base-groups)(\/|$)/, need: NEED.STAFF, why: 'רשימות ערכים ומצבי טבלה' },
  // התפריט עצמו הוא הגדרה (מסך ניהול מערכת); **סימון** התקלה על המטוס תפעולי
  // ומוגדר למעלה. הקריאה נשארת USER - כל עמדה צריכה את התפריט כדי לסמן תקלה.
  { m: WRITE, p: /^\/api\/fault-types(\/|$)/, need: NEED.STAFF, why: 'תפריט מהויות התקלה - רשימת ערכים במסך הניהול' },
  // הגנ"ש: הקטלוג הוא **הגדרה טכנית** ולכן כתיבה היא STAFF. הקריאה נשארת USER -
  // העמדה צריכה את הדגמים כדי להציג את הפריסה על המפה (שלב ג).
  { m: WRITE, p: /^\/api\/air-defense(\/|$)/, need: NEED.STAFF, why: 'הגנ"ש - קטלוג מערכות אש וגילוי' },
  { m: WRITE, p: /^\/api\/(airfields|airfield-points|airfield-element-types)(\/|$)/, need: NEED.STAFF, why: 'הגדרת שדה התעופה' },
  { m: WRITE, p: /^\/api\/joining-points(\/|$)/, need: NEED.STAFF, why: 'הגדרת נקודת הצטרפות - שייכת לשדה' },
  { m: WRITE, p: /^\/api\/(classic-strip-tables|strip-window-layouts|strip-window-columns|strip-window-cells)(\/|$)/, need: NEED.STAFF, why: 'פריסות טבלה וחלונות' },
  { m: WRITE, p: /^\/api\/(mission-desks|mission-desk-services)(\/|$)/, need: NEED.STAFF, why: 'דסקי משימה' },
  { m: WRITE, p: /^\/api\/(block-spaces|block-tables)(\/|$)/, need: NEED.STAFF, why: 'הגדרת מרחבי בלוקים' },
  { m: WRITE, p: /^\/api\/(aviation-bases|base-statuses|base-routes|preset-links|contacts)(\/|$)/, need: NEED.STAFF, why: 'בסיסים, מסלולים ואנשי קשר' },
  { m: WRITE, p: /^\/api\/crew-members(\/|$)/, need: NEED.STAFF, why: 'רשומת איש צוות (הזהות עצמה מנוהלת במיראז)' },

  // ── אפליקציית הנהג ────────────────────────────────────────────────────────
  { m: ALL, p: /^\/api\/(vehicle-requests|vehicle-messages|vehicle-gps|route-plan)(\/|$)/, need: NEED.DRIVER, why: 'זימון וניווט רכב - נהג או עמדה' },
  { m: ['GET'], p: /^\/api\/(airfields|airfield-points|airfield-elements)\/by-base\//, need: NEED.DRIVER, why: 'מפת הבסיס לנהג' },
  { m: ['GET'], p: /^\/api\/maps\/\d+\/imagedata$/, need: NEED.DRIVER, why: 'תמונת המפה לנהג' },
  { m: ['GET'], p: '/api/aviation-bases', need: NEED.DRIVER, why: 'בחירת בסיס בנהג' },
  { m: ['GET'], p: '/api/google-maps-key', need: NEED.DRIVER, why: 'SK-14 - נדרש לניווט; לפחות לא לאנונימי' },
];

const roleRank = { [ROLE.ADMIN]: 3, [ROLE.TEAM_LEAD]: 2, [ROLE.USER]: 1, [ROLE.DRIVER]: 0 };

function satisfies(need, role) {
  switch (need) {
    case NEED.PUBLIC: return true;
    case NEED.ADMIN: return role === ROLE.ADMIN;
    case NEED.STAFF: return role === ROLE.ADMIN || role === ROLE.TEAM_LEAD;
    case NEED.USER: return roleRank[role] >= roleRank[ROLE.USER];
    // נהג: גם כל מזוהה אחר (עמדה שמזמינה רכב היא אותו זרם)
    case NEED.DRIVER: return role in roleRank;
    default: return false;
  }
}

const pathMatches = (pattern, path) =>
  typeof pattern === 'string' ? path === pattern : pattern.test(path);

/** מחזיר את הדרישה החלה על הבקשה. ברירת המחדל היא USER - אף פעם לא PUBLIC. */
export function requirementFor(method, path) {
  const m = String(method || 'GET').toUpperCase();
  for (const rule of RULES) {
    if (rule.m && !rule.m.includes(m)) continue;
    if (!pathMatches(rule.p, path)) continue;
    return rule.need;
  }
  return NEED.USER; // deny by default - נתיב שלא סווג דורש זהות
}

/** גוזר את התפקיד מתוך ה-claims. לא מסתמך על שום דבר שהלקוח שלח. */
export function roleOf(claims) {
  if (!claims) return null;
  if (claims.role === ROLE.DRIVER) return ROLE.DRIVER;
  if (claims.isAdmin) return ROLE.ADMIN;
  if (claims.isTeamLead) return ROLE.TEAM_LEAD;
  return ROLE.USER;
}

/**
 * ה-middleware הגלובלי. חל על כל בקשה שמתחילה ב-/api.
 * נתיבים שאינם /api (נכסים סטטיים, /driver, ה-SPA) עוברים כמו שהם.
 */
export function authMiddleware(req, res, next) {
  const path = req.path || '/';
  if (!path.startsWith('/api')) return next();

  const need = requirementFor(req.method, path);
  if (need === NEED.PUBLIC) return next();

  // שירות עמית (המיראז'): זהות משלו, ורשימת היתר סגורה. נבדק לפני האסימון
  // האישי כי אין לו אסימון כזה - הוא אינו אדם.
  if (serviceTokenOk(req)) {
    // `pathMatches` ולא השוואת מחרוזות: חלק מהנתיבים המותרים נושאים מזהה
    // (`/api/maps/17`) ואינם ניתנים לביטוי כמחרוזת קבועה.
    const allowed = SERVICE_PATHS.some(([m, p]) => m === req.method && pathMatches(p, path));
    if (!allowed) {
      return res.status(403).json({ error: 'forbidden', message: 'אסימון שירות אינו מורשה לנתיב זה' });
    }
    req.user = { crewMemberId: null, personalId: null, name: 'mirage', role: ROLE.SERVICE, isAdmin: false, isTeamLead: false, approvedWorkstations: [] };
    return next();
  }

  const claims = verifyToken(bearerFrom(req));
  if (!claims) {
    return res.status(401).json({ error: 'unauthenticated', message: 'נדרשת הזדהות' });
  }

  const role = roleOf(claims);
  if (!satisfies(need, role)) {
    return res.status(403).json({ error: 'forbidden', message: 'אין הרשאה לפעולה זו' });
  }

  // מכאן והלאה ה-handlers יכולים לסמוך על req.user. זה גם המקור לזהות
  // ביומן הביקורת (SK-18) - במקום crew_member_id שהלקוח שולח.
  req.user = {
    crewMemberId: claims.crewMemberId ?? null,
    personalId: claims.personalId ?? null,
    name: claims.name ?? null,
    role,
    isAdmin: role === ROLE.ADMIN,
    isTeamLead: role === ROLE.TEAM_LEAD || role === ROLE.ADMIN,
    approvedWorkstations: Array.isArray(claims.approvedWorkstations) ? claims.approvedWorkstations : [],
  };
  return next();
}

/** שומר נקודתי ל-handler שצריך מנהל בלי להסתמך על הטבלה. */
export function requireAdmin(req, res, next) {
  if (req.user?.isAdmin) return next();
  return res.status(403).json({ error: 'forbidden', message: 'נדרשת הרשאת מנהל' });
}

export { NEED };
