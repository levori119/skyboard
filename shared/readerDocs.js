// חלון קריאה - הלוגיקה הטהורה, מקור אמת אחד לשרת (JS) וללקוח (TS/Vite).
//
// למה כאן ולא בכל שכבה בנפרד: **שתי השכבות מכריעות את אותה הכרעה**. השרת חייב
// לדעת אם קובץ שהועלה טעון המרה (LibreOffice) ואיזו כתובת מנורמלת מאחדת שני
// קישורים לאותו עזר; הלקוח חייב לדעת באיזה מנוע לפרוס את אותו עזר. אותו היגיון
// בשני מימושים היה נפרד ביום שיתווסף סוג קובץ - אותו שיקול של shared/sanitizeHtml.js.
//
// שלוש ההכרעות שכאן:
//   1. **סוג העזר** (docKindOf)   - PDF / תמונה / גיליון / אופיס / אחר
//   2. **מנוע התצוגה** (readerEngine) - מטריצת המקרים המלאה, כולל מצבי הכשל
//   3. **איפה נפתח** (resolveOpenMode) - חלון הקריאה או האפליקציה החיצונית

/** איפה נפתח עזר: בחלון הקריאה שבתוך המערכת, או באפליקציה החיצונית (כמו היום). */
export const READER_OPEN_MODES = ['window', 'external'];
export const DEFAULT_OPEN_MODE = 'external';   // ברירת מחדל = ההתנהגות הקיימת

/**
 * איך מטופל קובץ אופיס שאי-אפשר לפרוס בדפדפן כמו שהוא (PowerPoint / Word):
 *   'pdf'      - נדרשת גרסת PDF שהועלתה בניהול. בלי תלות בשום תוכנה חיצונית.
 *   'server'   - השרת ממיר ל-PDF (LibreOffice headless). דורש שהתוכנה מותקנת.
 *   'external' - נפתח באפליקציה החיצונית, וחלון הקריאה משמש לסימניות בלבד.
 *
 * שים לב: **גיליון** (Excel/CSV) נפרס בחלון בכל מצב פרט ל-'external' - הספרייה
 * (xlsx) כבר בפרויקט, ולכן אין סיבה לדרוש עבורו המרה.
 */
export const READER_OFFICE_MODES = ['pdf', 'server', 'external'];
// ברירת מחדל: המרה בשרת (2026-10-11). קודם 'pdf' - ומצגת שהועלתה לא נפתחה עד
// שמישהו העלה לה גרסת PDF ידנית, בלי שאיש ידע שזה הצעד החסר.
export const DEFAULT_OFFICE_MODE = 'server';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
const SHEET_EXT = ['xlsx', 'xls', 'xlsm', 'csv'];
const OFFICE_EXT = ['pptx', 'ppt', 'docx', 'doc', 'odp', 'odt', 'ods', 'rtf'];

/** הסיומת בלי הנקודה, באותיות קטנות. עובד על שם קובץ ועל כתובת עם query. */
export function docExtOf(nameOrUrl) {
  const raw = String(nameOrUrl || '').split(/[?#]/)[0];
  const base = raw.split(/[/\\]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot < 1 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/**
 * סוג העזר. ה-mime גובר על הסיומת כשהוא מפורש - כתובת בלי סיומת
 * (`/download?id=7`) מגיעה עם Content-Type ובלעדיו לא היינו יודעים כלום.
 */
export function docKindOf(ext, mime) {
  const m = String(mime || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';

  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (e === 'pdf') return 'pdf';
  if (IMAGE_EXT.includes(e)) return 'image';
  if (SHEET_EXT.includes(e)) return 'sheet';
  if (OFFICE_EXT.includes(e)) return 'office';

  if (m.includes('spreadsheet') || m === 'text/csv') return 'sheet';
  if (m.includes('presentation') || m.includes('wordprocessing') || m.includes('msword') || m.includes('powerpoint')) return 'office';
  return 'other';
}

/** האם הדפדפן/השרת יכולים בכלל למשוך את התוכן. UNC ו-file:// - לא. */
export function isFetchableUrl(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  return /^https?:\/\//i.test(u);
}

/**
 * הכתובת המנורמלת - מפתח האיחוד בין שני קישורים לאותו קובץ.
 * מנורמלים: רווחים, סכמה ו-host באותיות קטנות, `/` מיותר בסוף, ו-fragment.
 * ה-query **נשאר**: ברוב מערכות המסמכים הוא חלק מזהות הקובץ (`?id=7`).
 */
export function normalizeDocUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const noHash = raw.split('#')[0];
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/?]*)(.*)$/.exec(noHash);
  if (!m) return noHash.replace(/\/+$/, '');
  const [, scheme, host, rest] = m;
  const tail = (rest || '').replace(/\/+$/, '');
  return `${scheme.toLowerCase()}${host.toLowerCase()}${tail}`;
}

/**
 * ההגדרה הפעילה: עקיפת העמדה גוברת על ברירת המחדל של המערכת.
 * ערך ריק או לא מוכר = ירושה, ולא "כבוי" - הגדרה שגויה לא משנה התנהגות בשקט.
 */
export function resolveOpenMode(globalMode, presetMode, linkMode) {
  // שלוש רמות (2026-10-12): העזר עצמו > העמדה > המערכת
  if (READER_OPEN_MODES.includes(linkMode)) return linkMode;
  if (READER_OPEN_MODES.includes(presetMode)) return presetMode;
  if (READER_OPEN_MODES.includes(globalMode)) return globalMode;
  return DEFAULT_OPEN_MODE;
}

export function resolveOfficeMode(mode) {
  return READER_OFFICE_MODES.includes(mode) ? mode : DEFAULT_OFFICE_MODE;
}

/**
 * מטריצת המקרים המלאה של חלון הקריאה.
 *
 * @param {object} doc      - { kind, hasFile, hasPdf, url, convertError }
 * @param {string} officeMode
 * @returns {{engine: 'pdf'|'image'|'sheet'|'notes', reason: string, canConvert: boolean}}
 *
 * `engine` הוא מה שנפרס בחלון; `reason` מסביר למשתמש **למה** כשהמנוע הוא
 * 'notes' (סימניות והערות בלבד, בלי תצוגת התוכן). `canConvert` מסמן שהמרה
 * בשרת עשויה לפתור את המצב - ורק אז הלקוח מבקש אותה.
 */
export function readerEngine(doc, officeMode) {
  const kind = String(doc?.kind || 'other');
  const hasFile = !!doc?.hasFile;
  const hasPdf = !!doc?.hasPdf;
  const office = resolveOfficeMode(officeMode);
  // תוכן זמין = הקובץ יושב אצלנו, או שהכתובת ניתנת למשיכה
  const reachable = hasFile || isFetchableUrl(doc?.url);
  const none = { canConvert: false };

  // גרסת PDF שהומרה קודמת לכל שיקול אחר - היא כבר כאן וניתנת לפריסה
  if (hasPdf) return { engine: 'pdf', reason: '', ...none };

  if (!reachable) return { engine: 'notes', reason: 'unreachable', ...none };

  switch (kind) {
    case 'pdf':   return { engine: 'pdf', reason: '', ...none };
    case 'image': return { engine: 'image', reason: '', ...none };
    case 'sheet':
      // גיליון נפרס בחלון תמיד - פרט למצב שבו הוגדר שאופיס נפתח בחוץ
      return office === 'external'
        ? { engine: 'notes', reason: 'office-external', ...none }
        : { engine: 'sheet', reason: '', ...none };
    case 'office':
      if (office === 'external') return { engine: 'notes', reason: 'office-external', ...none };
      if (office === 'server') {
        return doc?.convertError
          ? { engine: 'notes', reason: 'convert-failed', canConvert: true }
          : { engine: 'notes', reason: 'convert-pending', canConvert: true };
      }
      return { engine: 'notes', reason: 'office-needs-pdf', ...none };
    default:
      return { engine: 'notes', reason: 'unsupported', ...none };
  }
}

/** האם עזר זה טעון המרה בשרת (נקרא גם בהעלאה, לפני שיש מי שיפתח אותו). */
export function needsServerConvert(doc, officeMode) {
  const r = readerEngine(doc, officeMode);
  return r.engine === 'notes' && r.canConvert;
}
