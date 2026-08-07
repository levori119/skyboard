// AirTrafficAPI - חוזה מאגר התמונ"א.
//
// למה כאן ולא בתוך atsim/ או בתוך src/: **שלושה** צרכנים חייבים את אותו חוזה -
// מאגר התמונ"א (atsim), שכבת התצוגה בעמדה, והבדיקות. אותו היגיון של
// shared/sanitizeHtml.js: מקור אמת אחד, ESM רגיל שגם Node (JS) וגם הלקוח
// (TS/Vite) מייבאים כמו שהוא, בלי שכפול ובלי build step.
//
// זכור את ההבחנה (AIR_PICTURE_SPEC.md §0): מה שעובר כאן הוא **המטוס הפיזי
// בשמיים**, לא הפ"מ. הפ"מ הוא הרישום ויושב ב-DB של SKY-KING. השדה `cs` הוא
// שם הפ"מ שהמטוס שייך לו - כלומר הגשר בין השניים, לא הישות עצמה.

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
  return { t: tMs, seq: Math.floor(tMs / 1000), tracks: list };
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
  return { t, seq: num(obj.seq) ?? Math.floor(t / 1000), tracks };
}
