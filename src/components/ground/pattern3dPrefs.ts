// מצב התצוגה והגאומטריה של ההקפה התלת מימדית בעמדה - **בסשן, לא ב-DB**.
//
// אותה תבנית של `airPicture/prefs.ts` ושל `data_windows`: ה-DB מחזיק את ברירת
// המחדל של העמדה, והפקח מזיז/מגדיל/מפצל בסשן שלו בלי לשנות אותה. חלון שמאבד
// את גודלו בכל רענון הוא חלון שהפקח מכוונן מחדש בכל רענון, ולכן הגאומטריה
// נשמרת - אבל **בסשן**: זו הכוונה של משמרת, לא הגדרת עמדה.
//
// ── שלושת המצבים ────────────────────────────────────────────────────────────
//   overlay - התנהגות היסוד: הסצנה מכסה את שטח המפה. ברירת המחדל.
//   window  - חלון צף נגרר וניתן להגדלה, עם סרגל הבקרה בתוכו.
//   split   - חלונית נוספת לצד המפה השטוחה, עם ספליטר נגרר.
//
// ── למה `x` הוא היסט **inline-start** ולא `left` ────────────────────────────
// המערכת דו-לשונית. חלון שמעוגן ב-`left` וידית ההגדלה שלו ב-`insetInlineEnd`
// נשבר בעברית: הידית יושבת בפינה השמאלית - הפינה ש**אינה** זזה כשהרוחב גדל -
// וגרירתה מזיזה את הקצה הלא נכון. כאן החלון מעוגן תמיד ב-inline-start, ולכן
// הפינה ההפוכה (inline-end) היא הפינה שזזה, בשתי השפות. ההמרה מהיסט פיזי
// (`clientX`) להיסט לוגי היא `inlineDelta`.

export type Pattern3DMode = 'overlay' | 'window' | 'split';
export type SplitOrient = 'h' | 'v';

export const PATTERN3D_MODES: readonly Pattern3DMode[] = ['overlay', 'window', 'split'] as const;
const SPLIT_ORIENTS: readonly SplitOrient[] = ['h', 'v'] as const;

export interface Pattern3DWinGeom {
  /** היסט מקצה ה-inline-start של החלון. `null` = טרם מוקם, נפתח בפינת ברירת המחדל. */
  x: number | null;
  y: number | null;
  w: number;
  h: number;
}

export interface Pattern3DPrefs {
  mode: Pattern3DMode;
  win: Pattern3DWinGeom;
  split: { ratio: number; orient: SplitOrient };
}

/**
 * מתחת לזה הסצנה מפסיקה להיות שמישה: ציר הגבהים, חץ הצפון וסרגל הבקרה
 * מתחילים לחפוף. נמדד מול הסצנה בפועל, לא מספר עגול.
 */
export const MIN_WIN_W = 340;
export const MIN_WIN_H = 260;

/** מעבר לטווח הזה אחת משתי התצוגות מצטמצמת עד שאי אפשר לעבוד בה. */
export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.8;

/**
 * תקרת הגובה של סרגל הבקרה **המעוגן** (בחלון הצף ובחלונית הפיצול).
 *
 * הנקודה של חלון או של חלונית היא **הסצנה**; הפקדים הם איך מכווננים אותה, לא
 * מה שמסתכלים עליו. בלי תקרה הסרגל נשבר לשלוש שורות - שתיים מהן טקסט עזרה וחץ
 * צפון מנופח בתוך עיגול גדול - ובלע שליש מחלון 430x330, ויותר ממחצית בחלון
 * המינימלי. בפיצול אנכי, שבו החלונית נמוכה מלכתחילה, הוא לא השאיר להקפה גובה
 * שאפשר לקרוא בו.
 *
 * התקרה היא **מיעוט מוצהר** מהחלון המינימלי (`DOCKED_BAR_MAX_H * 2 < MIN_WIN_H`),
 * ולכן הרוב שייך לסצנה תמיד - גם בגודל הקטן ביותר שאפשר להגיע אליו.
 * `overflowY:'auto'` הוא שסתום הביטחון: גם ברוחב פתולוגי אף פקד אינו נמחק,
 * לכל היותר נגללים אליו.
 */
export const DOCKED_BAR_MAX_H = 88;

/** כמה מהחלון חייב להישאר על המסך - אותם ערכים של `useDragPosition`. */
const KEEP_VISIBLE_X = 90;
const KEEP_VISIBLE_Y = 40;

export const DEFAULT_PATTERN3D_PREFS: Pattern3DPrefs = {
  // **overlay ולא window**: זו ההתנהגות שהפקח מכיר, וכפתור התלת מימד חייב
  // להמשיך לעשות בדיוק את מה שהוא עשה עד היום עד שהפקח יבחר אחרת.
  mode: 'overlay',
  win: { x: null, y: null, w: 560, h: 420 },
  split: { ratio: 0.6, orient: 'h' },
};

const KEY = (presetId: number | string) => `skyking.pattern3d.${presetId}`;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return typeof v !== 'boolean' && v !== null && v !== '' && v !== undefined && Number.isFinite(n) ? n : null;
};

export const isPattern3DMode = (v: unknown): v is Pattern3DMode =>
  typeof v === 'string' && (PATTERN3D_MODES as readonly string[]).includes(v);

const isSplitOrient = (v: unknown): v is SplitOrient =>
  typeof v === 'string' && (SPLIT_ORIENTS as readonly string[]).includes(v);

/** יחס הפיצול, חסום לטווח השמיש. ערך פגום חוזר לברירת המחדל ולא מעלים תצוגה. */
export function clampSplitRatio(v: unknown): number {
  const n = num(v);
  if (n === null) return DEFAULT_PATTERN3D_PREFS.split.ratio;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, n));
}

/**
 * גודל החלון: לא קטן מהמינימום הקריא, ולא גדול מהמסך (אחרת ידית ה-⇲ יוצאת
 * מהתצוגה ואי אפשר להקטין בחזרה). המינימום גובר על המסך - עדיף חלון שגולש
 * מעט על חלון שאי אפשר לקרוא בו דבר.
 */
export function clampWinSize(w: unknown, h: unknown, maxW = Infinity, maxH = Infinity): { w: number; h: number } {
  const rawW = num(w) ?? DEFAULT_PATTERN3D_PREFS.win.w;
  const rawH = num(h) ?? DEFAULT_PATTERN3D_PREFS.win.h;
  return {
    w: Math.max(MIN_WIN_W, Math.min(rawW, maxW)),
    h: Math.max(MIN_WIN_H, Math.min(rawH, maxH)),
  };
}

/**
 * מיקום החלון בתוך המסך. `vw`/`vh` **ביחידות מוגדלות** (אחרי חלוקה ב---s),
 * בדיוק כמו ההיסט שמחזיר `startPointerDrag`.
 */
export function clampWinPos(x: number, y: number, vw: number, vh: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 0), Math.max(vw - KEEP_VISIBLE_X, 0)),
    y: Math.min(Math.max(y, 0), Math.max(vh - KEEP_VISIBLE_Y, 0)),
  };
}

/** היסט פיזי (`clientX`) → היסט לוגי. בעברית (RTL) inline-start הוא ימין. */
export const inlineDelta = (dx: number, rtl: boolean): number => (rtl ? -dx : dx);

/** שוליים בין החלון הקטן לקצה שטח המפה - כדי שהמסגרת לא תישען על הקצה. */
export const SMALL_WIN_MARGIN = 10;

/**
 * הגאומטריה שבה נפתח החלון **הקטן** כשהפקח יוצא מהמצב המלא: רבע (חצי רוחב על
 * חצי גובה) בפינה התחתונה-שמאלית של שטח המפה, **כולו בתוכה**.
 *
 * למה לא פינת ברירת מחדל קבועה (`DEFAULT_INSET/DEFAULT_TOP`): החלון הוא
 * `position:fixed`, כלומר ממוקם מול **החלון** ולא מול המפה. שטח המפה מתחיל
 * מתחת לסרגלים ולעיתים נגמר מעל טבלת הפ"מים, ולכן פינה קבועה של המסך נחתה
 * חלקית מחוץ למפה - וגם כיסתה את פאנל השכבות שדרכו מכבים את התלת מימד.
 *
 * ── למה שמאל **פיזי** ולא inline-start ──────────────────────────────────────
 * המערכת דו-לשונית, אבל המפה היא **מרחב** ולא זרימת טקסט: הפקח מבקש את הפינה
 * שהעין שלו מוצאת, והיא אינה מתהפכת עם השפה (אותה הכרעה שנעשתה במיקום פקדי
 * המפה). ההיפוך היחיד הוא בייצוג: `x` נשמר כהיסט מקצה ה-inline-start, כי כך
 * מעוגן `Pattern3DWindow`, ולכן בעברית הוא נמדד מהקצה **הימני** של החלון.
 *
 * כל הקלט בפיקסלים פיזיים (`getBoundingClientRect`, `innerWidth`), הפלט
 * ביחידות מוגדלות - אלה שבהן נמדדים `left/top` תחת `zoom: var(--s)`.
 */
export function smallWinInArea(
  area: { left: number; top: number; width: number; height: number },
  viewport: { w: number; h: number },
  s: number,
  rtl: boolean,
): Pattern3DWinGeom {
  const sc = Number.isFinite(s) && s > 0 ? s : 1;
  const al = area.left / sc, at = area.top / sc;
  const aw = Math.max(area.width / sc, 0);
  // אזור המפה עשוי לגלוש מתחת לקצה החלון (טבלת פ"מים מתחתיו, גלילה) - ואז
  // "התחתית" היא מה שנראה, אחרת ידית ה-⇲ נוחתת מחוץ למסך ואי אפשר להקטין בחזרה.
  const bottom = Math.min(at + Math.max(area.height / sc, 0), viewport.h / sc);
  const ah = Math.max(bottom - at, 0);

  const { w, h } = clampWinSize(aw / 2, ah / 2, aw, ah);
  // מינימום הקריאות גובר על שטח המפה (clampWinSize), ולכן במפה צרה החלון עלול
  // להיות רחב ממנה. אז נצמדים לקצה במקום להוסיף שוליים שידחפו אותו החוצה.
  const left = Math.max(al, Math.min(al + SMALL_WIN_MARGIN, al + aw - w));
  const top = Math.max(at, bottom - SMALL_WIN_MARGIN - h);
  const x = rtl ? viewport.w / sc - (left + w) : left;
  return { x: Math.max(x, 0), y: top, w, h };
}

/**
 * גרירת הספליטר → יחס חדש. ההיסט **ביחידות מוגדלות** וה-`total` הוא
 * `clientWidth`/`clientHeight` של אזור המפה - שניהם באותו מרחב יחידות, ולכן
 * הספליטר נע בדיוק עם היד גם במסך 24" (CLAUDE.md §גרירה, מלכודת 3).
 */
export function nextSplitRatio(start: number, deltaLogical: number, total: number): number {
  if (!(total > 0)) return clampSplitRatio(start);
  return clampSplitRatio(start + deltaLogical / total);
}

/**
 * מיזוג של שלוש שכבות, מהחלשה לחזקה:
 * ברירת מחדל בקוד → ברירת המחדל של העמדה → מה שהפקח שינה בסשן.
 * כל שדה מנוקה בנפרד, כדי שערך פגום באחד מהם לא יפיל את כולם.
 */
export function mergePattern3DPrefs(
  stationDefaults?: Partial<Pattern3DPrefs> | null,
  sessionPrefs?: Partial<Pattern3DPrefs> | null,
): Pattern3DPrefs {
  const raw = { ...DEFAULT_PATTERN3D_PREFS, ...(stationDefaults || {}), ...(sessionPrefs || {}) };
  const win = { ...DEFAULT_PATTERN3D_PREFS.win, ...(raw.win || {}) };
  const split = { ...DEFAULT_PATTERN3D_PREFS.split, ...(raw.split || {}) };
  const size = clampWinSize(win.w, win.h);
  return {
    mode: isPattern3DMode(raw.mode) ? raw.mode : DEFAULT_PATTERN3D_PREFS.mode,
    win: { x: num(win.x), y: num(win.y), w: size.w, h: size.h },
    split: {
      ratio: clampSplitRatio(split.ratio),
      orient: isSplitOrient(split.orient) ? split.orient : DEFAULT_PATTERN3D_PREFS.split.orient,
    },
  };
}

export function loadPattern3DPrefs(
  presetId: number | string, stationDefaults?: Partial<Pattern3DPrefs> | null,
): Pattern3DPrefs {
  let session: Partial<Pattern3DPrefs> | null = null;
  try {
    const raw = sessionStorage.getItem(KEY(presetId));
    if (raw) session = JSON.parse(raw);
  } catch { /* sessionStorage חסום או JSON פגום - נופלים לברירת המחדל */ }
  return mergePattern3DPrefs(stationDefaults, session);
}

export function savePattern3DPrefs(presetId: number | string, prefs: Pattern3DPrefs): void {
  try { sessionStorage.setItem(KEY(presetId), JSON.stringify(prefs)); }
  catch { /* אין אחסון - הגאומטריה תחיה עד לרענון. לא שווה להפיל את העמדה */ }
}
