// הקלטת פעולות במסך - הלוגיקה הטהורה. אפיון: SCREEN_RECORDING_SPEC.md
//
// **מקור אמת יחיד** לארבעה צדדים שחייבים להסכים על אותם כללים:
//   שרת              - אימות הנתיב בשמירה מניהול טכני (routes/screenRecording.js)
//   תהליך ה-Electron - שם הקובץ, אימות הנתיב ומחיקה לפי תקופת שמירה
//                      (electron/screenRecorder.cjs)
//   העמדה            - בחירת הקודק, אורך הקטע והצגת *הסיבה* שההקלטה כבויה
//                      (src/utils/screenRecording.ts)
//   מסך הניהול       - אומדן הנפח שההגדרה תייצר בדיסק
//
// שלוש נקודות שבהן עותק שני היה הופך לתקלה שקטה:
//   1. **שם הקובץ** - התהליך הראשי בונה אותו, והמחיקה האוטומטית מפרשת אותו
//      חזרה. פורמט שנשתנה בצד אחד = קבצים שלא נמחקים לעולם, או גרוע - קבצים
//      שכן נמחקים כי `isRecordingFile` תפסה שם זר.
//   2. **אימות הנתיב** - השרת מאמת בכתיבה, והתהליך הראשי מאמת שוב לפני
//      הכתיבה עצמה. העמוד לעולם אינו מוסר נתיב (ראה electron-preload.cjs),
//      אבל נתיב שנשמר ב-DB לפני הכלל הזה כן יכול להגיע משם.
//   3. **הגבלת הערכים** - עמדה שתקליט ב-30 fps באיכות גבוהה תמלא דיסק רשת
//      בשעות. הקיצוץ נעשה פעם אחת, כאן.
//
// ES module בלי תלויות: נטען ב-Node (שרת), ב-vitest, ב-Vite (לקוח)
// וב-dynamic import מתוך ה-CJS של Electron.

/** תחילית שם הקובץ. **המחיקה האוטומטית נשענת עליה** - היא לא נוגעת בשום
 *  קובץ שאינו נושא אותה, כדי שחומר תחקיר שמישהו שם באותה תיקייה לא ייעלם. */
export const RECORDING_PREFIX = 'SKYKING';

/** תיקיית המשנה של קטעים שסומנו "שמור" - המחיקה האוטומטית מדלגת עליה כליל */
export const KEEP_DIR = 'keep';

/** קצב סיביות לפי איכות. medium = מסך עמדה קריא לתחקיר בנפח סביר. */
export const QUALITY_BITRATE = {
  low: 600_000,
  medium: 1_500_000,
  high: 4_000_000,
};

/** ברירות המחדל של ההקלטה. 5 fps: מסך עמדה כמעט סטטי, וזה חוסך פי 5 דיסק. */
export const RECORDING_DEFAULTS = {
  enabled: false,
  path: '',
  segmentMinutes: 15,
  retentionDays: 7,
  fps: 5,
  quality: 'medium',
};

/** גבולות ההגדרה בניהול טכני. חריגה נקצצת ולא נדחית - הגדרה לא תפיל הקלטה. */
export const RECORDING_LIMITS = {
  segmentMinutes: { min: 1, max: 120 },
  retentionDays: { min: 0, max: 365 },
  fps: { min: 1, max: 30 },
};

// גרשיים בתוך תיבה עברית (בח"א, פ"מ) **נמחקים** ולא הופכים למפריד:
// "בח-א-8" אינו השם שמישהו יחפש לפיו ב-Explorer.
const QUOTE_CHARS = /["'\u05f3\u05f4\u2018\u2019\u201c\u201d]/g;
const ILLEGAL_FILE_CHARS = /[<>:/\\|?*\u0000-\u001f]/g;
const MAX_TOKEN_LEN = 40;

function clampInt(v, { min, max }, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * הופך שם בסיס / עמדה לרסיס בטוח בשם קובץ.
 * מסלק תווים שאסורים ב-Windows, רווחים, נקודות מובילות ומעבר תיקייה.
 * עברית נשמרת בכוונה: מי שמחפש את הקובץ ב-Explorer מחפש לפי השם שהוא מכיר.
 */
export function sanitizeFileToken(v) {
  if (typeof v !== 'string') return '';
  return v
    .replace(QUOTE_CHARS, '')
    .replace(ILLEGAL_FILE_CHARS, '-')
    .replace(/\s+/g, '-')
    // נקודה בשם קובץ מפרידה סיומת, ורצף נקודות הוא מעבר תיקייה
    .replace(/\.+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TOKEN_LEN)
    .replace(/-+$/, '');
}

/**
 * שורת `aviation_bases` → תצורת הקלטה מנורמלת. מקבל גם אובייקט מנורמל
 * (camelCase) כדי שהלקוח יוכל להעביר את מה שקיבל מה-API בלי מיפוי שני.
 */
export function normalizeRecordingConfig(row) {
  const r = row || {};
  const quality = String(r.recording_quality ?? r.quality ?? '').toLowerCase();
  return {
    enabled: Boolean(r.recording_enabled ?? r.enabled ?? false),
    path: String(r.recording_path ?? r.path ?? '').trim(),
    segmentMinutes: clampInt(r.recording_segment_minutes ?? r.segmentMinutes, RECORDING_LIMITS.segmentMinutes, RECORDING_DEFAULTS.segmentMinutes),
    retentionDays: clampInt(r.recording_retention_days ?? r.retentionDays, RECORDING_LIMITS.retentionDays, RECORDING_DEFAULTS.retentionDays),
    fps: clampInt(r.recording_fps ?? r.fps, RECORDING_LIMITS.fps, RECORDING_DEFAULTS.fps),
    quality: Object.hasOwn(QUALITY_BITRATE, quality) ? quality : RECORDING_DEFAULTS.quality,
  };
}

/**
 * *למה* ההקלטה לא רצה - `null` כשהיא יכולה לרוץ.
 * הפרדה בין 'disabled' / 'noPath' / 'badPath' היא דרישה ולא נוחות: פקד
 * שנדלק בלי שקורה משהו נראה למפעיל בדיוק כמו פיצ'ר שבור (ראה CLAUDE.md).
 * @returns {null | 'disabled' | 'noPath' | 'badPath'}
 */
export function recordingBlockReason(cfg) {
  const c = cfg || {};
  if (!c.enabled) return 'disabled';
  if (!String(c.path || '').trim()) return 'noPath';
  if (!isSafeRecordingPath(c.path)) return 'badPath';
  return null;
}

/** אורך קטע באלפיות שנייה */
export function recordingSegmentMs(cfg) {
  return normalizeRecordingConfig(cfg).segmentMinutes * 60_000;
}

/** קצב הסיביות של האיכות */
export function recordingBitrate(cfg) {
  return QUALITY_BITRATE[normalizeRecordingConfig(cfg).quality];
}

function two(n) { return String(n).padStart(2, '0'); }

/**
 * שם קובץ ההקלטה: `SKYKING_<בסיס>_<עמדה>_<תאריך>_<שעה>[_manual].<סיומת>`
 *
 * החותמת היא **שעה מקומית של העמדה** ולא UTC: מי שמחפש "מה קרה ב-14:32"
 * מחפש לפי השעון שעל הקיר. אותה בחירה חלה על המחיקה האוטומטית, שמשווה
 * חותמת מקומית לשעון מקומי.
 */
export function recordingFileName({ baseName, presetName, startedAt, ext = 'webm', manual = false } = {}) {
  const d = startedAt instanceof Date && !isNaN(startedAt.getTime()) ? startedAt : new Date();
  const base = sanitizeFileToken(baseName) || 'ללא-בסיס';
  const preset = sanitizeFileToken(presetName) || 'ללא-עמדה';
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
  const safeExt = /^(webm|mp4)$/.test(String(ext)) ? String(ext) : 'webm';
  return `${RECORDING_PREFIX}_${base}_${preset}_${stamp}${manual ? '_manual' : ''}.${safeExt}`;
}

// התחילית + חותמת הזמן בסוף הן החתימה. שם הבסיס והעמדה יכולים להכיל '_',
// ולכן הקיבוץ חמדני עד החותמת הקבועה שבסוף.
const FILE_RE = new RegExp(`^${RECORDING_PREFIX}_.*_(\\d{4})-(\\d{2})-(\\d{2})_(\\d{2})(\\d{2})(\\d{2})(?:_manual)?\\.(?:webm|mp4)$`);

/** האם זה קובץ שהמערכת שלנו יצרה. המחיקה האוטומטית נשענת על זה. */
export function isRecordingFile(name) {
  return typeof name === 'string' && FILE_RE.test(name);
}

/** זמן ההתחלה מתוך שם הקובץ (שעה מקומית), או null. */
export function recordingStartedAt(name) {
  if (typeof name !== 'string') return null;
  const m = name.match(FILE_RE);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * הקבצים שעברו את תקופת השמירה ולכן ניתן למחוק אותם.
 * `retentionDays: 0` = **לא מוחקים כלום** (שמירה ללא הגבלה), ולא "מחק הכל".
 */
export function expiredRecordingFiles(names, { now = new Date(), retentionDays = RECORDING_DEFAULTS.retentionDays } = {}) {
  const days = clampInt(retentionDays, RECORDING_LIMITS.retentionDays, RECORDING_DEFAULTS.retentionDays);
  if (days <= 0) return [];
  const cutoff = now.getTime() - days * 86_400_000;
  return (Array.isArray(names) ? names : []).filter(n => {
    const started = recordingStartedAt(n);
    return started !== null && started.getTime() < cutoff;
  });
}

/**
 * נתיב יעד קביל: מוחלט (`D:\...`), נתיב רשת (`\\srv\share`) או POSIX מוחלט.
 * נפסלים: יחסי, מעבר תיקייה, הרחבת משתני סביבה ותווים אסורים - נתיב כזה
 * מגיע ממסך ניהול, ואם הוא שגוי ההקלטה צריכה להיכבות **עם סיבה**, לא לכתוב
 * למקום מפתיע.
 */
export function isSafeRecordingPath(p) {
  const s = typeof p === 'string' ? p.trim() : '';
  if (!s) return false;
  if (/[\u0000-\u001f]/.test(s)) return false;
  if (/[<>"|?*]/.test(s)) return false;
  // %APPDATA% ו-${VAR} - הרחבה שהייתה מפנה את הכתיבה למקום אחר בכל עמדה.
  // '$' לבדו מותר: שיתוף רשת מוסתר (\srv\skyking$) הוא שגרה ברשת בסיס.
  if (/%/.test(s) || /\$\{/.test(s)) return false;
  if (s.split(/[\\/]/).some(seg => seg === '..')) return false;
  const unc = /^\\\\[^\\/]+[\\/][^\\/]+/.test(s);
  const drive = /^[A-Za-z]:[\\/]/.test(s);
  const posix = s.startsWith('/');
  if (!unc && !drive && !posix) return false;
  // ':' חוקי רק כאות הכונן
  if (s.indexOf(':', 2) !== -1) return false;
  // **שורש כונן אינו יעד הקלטה** (תקלה מהשדה, 2026-09-16: הוגדר `C:\`).
  // שתי סיבות, ושתיהן מספיקות:
  //   1. `mkdir` רקורסיבי על שורש כונן נכשל ב-EPERM **גם כשהוא קיים**, ולכן
  //      ההקלטה לא מתחילה - והמפעיל מקבל "הנתיב אינו נגיש" בלי לדעת למה.
  //   2. סריקת המחיקה השעתית הייתה סורקת את שורש כונן המערכת. גם אם היא נוגעת
  //      רק בקבצים שלנו, זה לא מקום שיש לנו עסק לסרוק בו.
  // שיתוף רשת (`\\srv\share`) כן קביל: שיתוף הוא ממילא מכל מיועד.
  if (drive || posix) {
    const rest = s.slice(drive ? 3 : 1).replace(/[\\/]+$/, '');
    if (!rest) return false;
  }
  return true;
}


/**
 * **שורש** הנתיב: `D:\` · `\\srv\share` · `/`. מחזיר '' לקלט שאינו נתיב.
 *
 * למה זה קיים (תקלה מהשדה, 2026-09-16): בניהול הטכני הוגדר
 * `D:\SKYKING\REC` במכונה שיש לה רק כונן C:. השגיאה ש-Windows מחזיר על
 * כונן שאינו קיים היא `ENOENT: ... mkdir '\\?'` - הודעה שאינה מזכירה אפילו
 * את הכונן. בדיקת השורש לפני הכתיבה היא מה שמאפשר לומר למפעיל
 * "הכונן D:\ אינו קיים בעמדה" במקום "אין הרשאה".
 */
export function recordingPathRoot(p) {
  const s = typeof p === 'string' ? p.trim() : '';
  if (!s) return '';
  const unc = s.match(/^\\\\([^\\/]+)[\\/]([^\\/]+)/);
  if (unc) return `\\\\${unc[1]}\\${unc[2]}`;
  const drive = s.match(/^([A-Za-z]):[\\/]/);
  if (drive) return `${drive[1].toUpperCase()}:\\`;
  return s.startsWith('/') ? '/' : '';
}

/**
 * קוד שגיאה של מערכת ההפעלה → **סיבה שאפשר להציג למפעיל**.
 * בלי זה "הנתיב אינו נגיש" הוא מסך חסום בלי דרך פעולה: הפקח לא יודע אם
 * הכונן חסר, אם אין הרשאה, או אם שרת הרשת נפל - ואלה שלושה טיפולים שונים.
 * @returns {'perm'|'missing'|'network'|'space'|'other'}
 */
export function recordingPathErrorKey(codeOrMessage) {
  const s = String(codeOrMessage || '');
  // התהליך הראשי מעביר לפעמים את ההודעה המלאה ("EPERM: operation not ...")
  const code = (s.match(/^[A-Z]{4,}/) || [''])[0];
  if (['EPERM', 'EACCES', 'EROFS'].includes(code)) return 'perm';
  if (['ENOENT', 'ENOTDIR', 'ENODEV', 'ENXIO'].includes(code)) return 'missing';
  if (['ENETUNREACH', 'ETIMEDOUT', 'EHOSTUNREACH', 'ECONNREFUSED', 'ENETDOWN'].includes(code)) return 'network';
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'space';
  return 'other';
}

/**
 * הקודק להקלטה, לפי מה שהדפדפן/Electron תומך בו בפועל.
 * MP4/H264 ראשון בכוונה: הוא נפתח בנגן המובנה של Windows בלי להתקין קודק -
 * בעמדה על רשת מבודדת זה ההבדל בין תחקיר שנצפה לתחקיר ש"לא נפתח".
 * @param {(mimeType: string) => boolean} isSupported
 */
export function pickRecordingMime(isSupported) {
  const candidates = [
    { mimeType: 'video/mp4;codecs="avc1.42E01E"', ext: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', ext: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', ext: 'webm' },
    { mimeType: 'video/webm', ext: 'webm' },
  ];
  for (const c of candidates) {
    try {
      if (isSupported(c.mimeType)) return c;
    } catch { /* בודק שזרק = לא נתמך */ }
  }
  return null;
}

/**
 * אומדן הנפח שההגדרה תייצר - מוצג בניהול הטכני, כי מי שקובע נתיב על דיסק
 * רשת צריך לדעת מה הוא מזמין לשם.
 * `retentionDays: 0` (שמירה ללא הגבלה) מוצג כיום אחד, שאחרת האומדן היה 0.
 */
export function estimateRecordingBytes({ quality = RECORDING_DEFAULTS.quality, hoursPerDay = 8, retentionDays = RECORDING_DEFAULTS.retentionDays } = {}) {
  const bitrate = QUALITY_BITRATE[String(quality).toLowerCase()] ?? QUALITY_BITRATE.medium;
  const days = Math.max(1, clampInt(retentionDays, RECORDING_LIMITS.retentionDays, RECORDING_DEFAULTS.retentionDays));
  const hours = Math.max(0, Number(hoursPerDay) || 0);
  return (bitrate / 8) * 3600 * hours * days;
}
