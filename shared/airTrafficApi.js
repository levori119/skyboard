// AirTrafficAPI - חוזה מאגר התמונ"א.
//
// זהו עותק ה**עמדה** של החוזה. מאגר התמונ"א חי בריפו נפרד
// (github.com/levori119/atsim) ומחזיק עותק זהה משלו - ראה AIR_TRAFFIC_API_VERSION
// למה זה בסדר ואיך זה נאכף.
//
// בתוך SKY-KING הקובץ הוא מקור אמת אחד לשרת (JS) וללקוח (TS/Vite), ESM רגיל
// שהשניים מייבאים כמו שהוא - אותו היגיון של shared/sanitizeHtml.js.
//
// זכור את ההבחנה (AIR_PICTURE_SPEC.md §0): מה שעובר כאן הוא **המטוס הפיזי
// בשמיים**, לא הפ"מ. הפ"מ הוא הרישום ויושב ב-DB של SKY-KING. השדה `cs` הוא
// שם הפ"מ שהמטוס שייך לו - כלומר הגשר בין השניים, לא הישות עצמה.

/**
 * גרסת החוזה. **הסיבה שהיא קיימת:** מאגר התמונ"א ו-SKY-KING הם שני ריפואים
 * נפרדים, ולכן לכל אחד עותק משלו של הקובץ הזה. משמעת אנושית אינה מנגנון -
 * הדרך היחידה לדעת שהעותקים לא נפרדו היא **בדיקת זמן ריצה**: המאגר מחזיר את
 * הגרסה בכל סנאפשוט, והעמדה מתריעה כשהיא אינה מכירה אותה.
 *
 * מעלים MINOR בתוספת שדה (תאימות לאחור), ו-MAJOR בשינוי שובר.
 */
export const AIR_TRAFFIC_API_VERSION = '1.0';

/** תקרת התכנון. נאכפת בעמדה (capNearest) וגם כאן, כדי שהמאגר לא יחרוג מלכתחילה. */
export const MAX_TRACKS = 300;

/**
 * סיווג - **קוד** ולא טקסט מתורגם. התרגום נעשה בעמדה (`t('airPicture.cls.*')`),
 * בדיוק כמו `debriefs.severity`. מאגר שמחזיר עברית היה כופה שפה על כל צרכן.
 */
export const CLASSIFICATIONS = ['friend', 'hostile', 'unknown', 'civil'];

/** תוויות עבריות - לשימוש ה-FRONT של המאגר בלבד, לא חלק מהחוזה על הרשת. */
export const CLASSIFICATION_HE = {
  friend: 'עמית',
  hostile: 'טורף',
  unknown: 'בלמ"ז',
  civil: 'אזרח',
};

/** צבע הסיווג. צבע **סטטוס** ולכן קבוע ולא נגזר מהתמה (CLAUDE.md). */
export const CLASSIFICATION_COLOR = {
  friend: '#38bdf8',
  hostile: '#ef4444',
  unknown: '#facc15',
  civil: '#22c55e',
};

/**
 * סוגי המטוסים - אותם מפתחות של `src/utils/aircraft.ts` (AircraftIconType),
 * כדי שהעמדה תצייר את התמונ"א באותם אייקונים שכבר קיימים בה ולא תחזיק
 * ספריית אייקונים שנייה.
 */
export const AIRCRAFT_TYPES = [
  'f15', 'f16', 'f35', 'b707', 'gulfstream', 'c130',
  'yasur', 'apache', 'blackhawk', 'naval-blackhawk', 'uav', 'jet',
];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** כיוון מנורמל ל-0..359. -10 ו-350 הם אותו כיוון, ו-NaN אינו כיוון. */
export function normHeading(deg) {
  const n = num(deg);
  if (n === null) return 0;
  return ((n % 360) + 360) % 360;
}

/**
 * מטוס יחיד כפי שהוא יוצא על הרשת.
 * מחזיר `null` על רשומה שאי אפשר לצייר - חסר מזהה או חסר נ"צ. שאר השדות
 * נופלים לברירת מחדל בטוחה במקום להפיל את הסנאפשוט כולו: תמונה חלקית שווה
 * יותר מ-500 בעמדה.
 */
export function normalizeTrack(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id != null ? String(raw.id) : '';
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  if (!id || lat === null || lon === null) return null;
  return {
    id,
    cs: raw.cs != null ? String(raw.cs) : id,
    lat,
    lon,
    alt: Math.round(num(raw.alt) ?? 0),
    spd: Math.round(num(raw.spd) ?? 0),
    hdg: Math.round(normHeading(raw.hdg)),
    cls: CLASSIFICATIONS.includes(raw.cls) ? raw.cls : 'unknown',
    typ: AIRCRAFT_TYPES.includes(raw.typ) ? raw.typ : 'jet',
    resp: raw.resp != null ? String(raw.resp) : '',
  };
}

/**
 * סנאפשוט מלא. **תמיד תמונה שלמה** ולא דלתא - מטוס שאינו ברשימה כבר לא באוויר.
 * `t` הוא שעון **המאגר** (ולא של העמדה): חיווי "מעודכן לפני X" חייב להימדד מול
 * המקור, אחרת שעון עמדה שסטה מציג תמונה ישנה כאילו היא חיה.
 * `seq` הוא טיק של 1Hz שנגזר מהזמן - מונוטוני, דטרמיניסטי, ושורד אתחול של
 * המאגר. פער גדול מהצפוי בין שתי דגימות = הדגימה מאחרת, ולא "המאגר תקוע".
 */
export function buildSnapshot(tMs, tracks) {
  const list = [];
  for (const raw of tracks || []) {
    const t = normalizeTrack(raw);
    if (t) list.push(t);
    if (list.length >= MAX_TRACKS) break;
  }
  return { v: AIR_TRAFFIC_API_VERSION, t: tMs, seq: Math.floor(tMs / 1000), tracks: list };
}

/** אימות סנאפשוט נכנס בצד העמדה. מחזיר סנאפשוט תקין או `null`. */
export function parseSnapshot(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const t = num(obj.t);
  if (t === null) return null;
  if (!Array.isArray(obj.tracks)) return null;
  const tracks = [];
  for (const raw of obj.tracks) {
    const track = normalizeTrack(raw);
    if (track) tracks.push(track);
    if (tracks.length >= MAX_TRACKS) break;
  }
  // הגרסה נבדקת אבל **אינה חוסמת**: מאגר ישן שלא שולח `v` עדיין מציג תמונה,
  // ומאגר עם MINOR חדש מציג את השדות שהעמדה מכירה. רק MAJOR שונה הוא שבר
  // אמיתי - ואז עדיף להתריע ולהציג מאשר להשאיר מסך ריק בלי הסבר.
  const v = typeof obj.v === 'string' ? obj.v : null;
  return { v, t, seq: num(obj.seq) ?? Math.floor(t / 1000), tracks };
}

/**
 * האם גרסת המאגר תואמת לעמדה. `null` (מאגר שלא מדווח גרסה) נחשב תואם -
 * זו התנהגות של מאגר ותיק, לא של מאגר שבור.
 */
export function versionCompatible(v) {
  if (!v) return true;
  return String(v).split('.')[0] === AIR_TRAFFIC_API_VERSION.split('.')[0];
}
