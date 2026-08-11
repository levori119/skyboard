// טבלת נקודות מכוון (העברת מטרה לתקיפה) - מקור אמת יחיד.
//
// כל שורה בטבלה היא **נ"צ תקיפה אחד**: לאיזו מטרה הוא שייך, איך קוראים לנקודת
// המכוון, היכן היא, ובאילו נתוני תקיפה מגיעים אליה (גובה, כיוון, זווית חדירה,
// מרעום, חימוש וכמות).
//
// **למה כאן ולא בטבלת DB חדשה:** הנתון כבר חי ב-`strips.targets` (JSONB) בשתי
// עמודות - `{name, aim_point}` - ומוצג בפ"מ, בתצוגה הקלאסית, במוד הטבלה ובייבוא
// מקובץ. הרחבה של אותו מבנה שומרת על הנתונים הקיימים (שורה ישנה פשוט חסרה
// שדות), לא דורשת מיגרציה, ועוברת כמו שהיא בכל הצינורות שכבר מזרימים אותו -
// כולל GAPI. מכאן ש**זו אותה טבלה**, רק רחבה יותר.
//
// הקובץ הזה הוא המקור היחיד לרשימת השדות: ממנו נגזרים קטלוג העמודות של מוד
// הטבלה (`STRIP_FIELD_DEFS`), שדות הפ"מ הקלאסי (`CLASSIC_STRIP_FIELDS`), עורך
// הטבלה, הייבוא מקובץ, ומיפוי GAPI. שדה חדש נוסף **כאן בלבד**.

/**
 * שורה אחת בטבלת נקודות המכוון = נ"צ תקיפה אחד.
 *
 * כל השדות מחרוזות בכוונה: זהו אותו מבנה JSONB שכבר קיים (`{name, aim_point}`),
 * והמבנים האחיים לו בפ"מ (`weapons.quantity`) שומרים אף הם מחרוזות. מספר שנשמר
 * כמחרוזת עובר ללא שינוי דרך ה-DB, הייבוא מקובץ ו-GAPI, ולא הופך `0` ל-`''`
 * בדרך. הוולידציה נעשית בתצוגה (`validateAimPoint`) ולא חוסמת הקלדה.
 */
export interface AimPoint {
  /** שם מטרה */
  name: string;
  /** שם נקודת מכוון */
  aim_point: string;
  /** נ"צ - 17 ספרות, `NDDMM.mmmm/EDDDMM.mmmm` */
  coord: string;
  /** גובה ברגליים */
  alt_ft: string;
  /** HD - כיוון במעלות */
  hd: string;
  /** AN - זווית חדירה במעלות */
  an: string;
  /** AN מזערי - זווית חדירה מזערית במעלות */
  an_min: string;
  /** מרעום בשניות. 0.02 = 20 מילי-שניות */
  fuze: string;
  /** הערה - טקסט חופשי */
  note: string;
  /** חימוש - מתוך קטלוג `default_armament_names` */
  armament: string;
  /** כמות פצצות */
  bombs: string;

  // ── דגלי אישור לתקיפה ──────────────────────────────────────────────────────
  // בוליאניים ולא מחרוזות: אלה מצבי כן/לא שהעמדה מקישה עליהם ושה-API קורא, ולכן
  // `"false"` (מחרוזת שהיא truthy) היה תקלה שקטה שמאשרת תקיפה במקום לעצור אותה.

  /** מאומת אווירי */
  air_verified: boolean;
  /** רשאי לצאת כיוון */
  cleared_heading: boolean;
  /** עצור תקיפה */
  abort_attack: boolean;
  /** מאומת קרקעי */
  ground_verified: boolean;
}

export type AimPointKind = 'text' | 'coord' | 'number' | 'armament' | 'flag';

/** מפתחות הדגלים - הערך שלהם בוליאני ולא מחרוזת */
export type AimPointFlagKey = 'air_verified' | 'cleared_heading' | 'abort_attack' | 'ground_verified';

export interface AimPointColumn {
  /** המפתח בתוך שורת ה-JSONB */
  key: keyof AimPoint;
  /** מפתח i18n לכותרת - זה מה שמוצג למשתמש */
  labelKey: string;
  /**
   * תווית עברית קבועה. משמשת רק את צרכני קטלוגי השדות שקוראים `label` גולמי
   * (`STRIP_FIELD_DEFS`, `CLASSIC_STRIP_FIELDS`), כדי שלא ייווצר שם ריק אם
   * המפתח טרם קיים ב-registry. התצוגה בפועל עוברת דרך `labelKey`.
   */
  label: string;
  /** מפתח השדה בקטלוגי הפ"מ (מוד טבלה / פ"מ קלאסי) - עמודה משלו לכל שדה */
  fieldKey: string;
  kind: AimPointKind;
  /** רוחב בסיס בעורך (px, לפני זום המסך) */
  width: number;
  /** רמז מתחת לשדה בעורך */
  hintKey?: string;
}

/**
 * 11 העמודות, לפי הסדר שבו הן מוצגות בעורך ובסיכום.
 * `name` ו-`aim_point` ראשונים כי הם הזיהוי - וגם היחידים שכבר היו קיימים.
 */
export const AIM_POINT_COLUMNS: AimPointColumn[] = [
  { key: 'name',      labelKey: 'strips.aimTargetName', label: 'שם מטרה',          fieldKey: 'aim_target_name', kind: 'text',     width: 96 },
  { key: 'aim_point', labelKey: 'strips.aimPointName',  label: 'שם נקודת מכוון',   fieldKey: 'aim_point_name',  kind: 'text',     width: 96 },
  { key: 'coord',     labelKey: 'strips.aimCoord',      label: 'נ"צ',              fieldKey: 'aim_coord',       kind: 'coord',    width: 168, hintKey: 'strips.aimCoordHint' },
  { key: 'alt_ft',    labelKey: 'strips.aimAltFt',      label: 'גובה (רגל)',       fieldKey: 'aim_alt_ft',      kind: 'number',   width: 74 },
  { key: 'hd',        labelKey: 'strips.aimHd',         label: 'HD (כיוון)',       fieldKey: 'aim_hd',          kind: 'number',   width: 62 },
  { key: 'an',        labelKey: 'strips.aimAn',         label: 'AN (זווית חדירה)', fieldKey: 'aim_an',          kind: 'number',   width: 62 },
  { key: 'an_min',    labelKey: 'strips.aimAnMin',      label: 'AN מזערי',         fieldKey: 'aim_an_min',      kind: 'number',   width: 72 },
  { key: 'fuze',      labelKey: 'strips.aimFuze',       label: 'מרעום (שנ\')',     fieldKey: 'aim_fuze',        kind: 'number',   width: 78, hintKey: 'strips.aimFuzeHint' },
  { key: 'armament',  labelKey: 'strips.aimArmament',   label: 'חימוש',            fieldKey: 'aim_armament',    kind: 'armament', width: 118 },
  { key: 'bombs',     labelKey: 'strips.aimBombs',      label: 'כמות פצצות',       fieldKey: 'aim_bombs',       kind: 'number',   width: 62 },
  { key: 'note',      labelKey: 'strips.aimNote',       label: 'הערה',             fieldKey: 'aim_note',        kind: 'text',     width: 132 },
  // דגלי אישור לתקיפה - סדר הרשימה כפי שנמסר באפיון
  { key: 'air_verified',    labelKey: 'strips.aimAirVerified',    label: 'מאומת אווירי',    fieldKey: 'aim_air_verified',    kind: 'flag', width: 72 },
  { key: 'cleared_heading', labelKey: 'strips.aimClearedHeading', label: 'רשאי לצאת כיוון', fieldKey: 'aim_cleared_heading', kind: 'flag', width: 88 },
  { key: 'abort_attack',    labelKey: 'strips.aimAbortAttack',    label: 'עצור תקיפה',      fieldKey: 'aim_abort_attack',    kind: 'flag', width: 76 },
  { key: 'ground_verified', labelKey: 'strips.aimGroundVerified', label: 'מאומת קרקעי',     fieldKey: 'aim_ground_verified', kind: 'flag', width: 72 },
];

/** מפתחות הדגלים, נגזרים מהקטלוג - אין רשימה שנייה שיכולה להתיישן */
export const AIM_POINT_FLAG_KEYS: AimPointFlagKey[] =
  AIM_POINT_COLUMNS.filter(c => c.kind === 'flag').map(c => c.key as AimPointFlagKey);

/** השדה המצרפי - העמודה שמציגה את כל הטבלה ופותחת את עורך נקודות המכוון */
export const AIM_POINTS_FIELD_LABEL = 'טבלת נקודות מכוון';
export const AIM_POINTS_FIELD_LABEL_KEY = 'strips.aimPointsTable';

/** מפתח השדה המצרפי - עמודה אחת שמציגה את כל הטבלה ופותחת את העורך */
export const AIM_POINTS_FIELD_KEY = 'aim_points';

/** `aim_coord` → העמודה שלה. משמש את תאי מוד הטבלה ואת הפ"מ הקלאסי. */
export const AIM_POINT_COLUMN_BY_FIELD: Record<string, AimPointColumn> =
  Object.fromEntries(AIM_POINT_COLUMNS.map(c => [c.fieldKey, c]));

export const EMPTY_AIM_POINT: AimPoint = {
  name: '', aim_point: '', coord: '', alt_ft: '', hd: '',
  an: '', an_min: '', fuze: '', note: '', armament: '', bombs: '',
  air_verified: false, cleared_heading: false, abort_attack: false, ground_verified: false,
};

/**
 * דגל מכל צורה שבה הוא עשוי להגיע - בוליאני מ-GAPI, `"true"`/`"1"` מקובץ ייבוא,
 * או מספר. **ברירת המחדל היא `false`**: ערך שלא מובן אינו אישור.
 */
export function toAimFlag(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'v' || s === 'כן' || s === 'yes';
  }
  return false;
}

/**
 * שורה מה-DB → שורה מלאה. שורה שנשמרה לפני ההרחבה נושאת רק `name`/`aim_point`,
 * ולכן כל שדה חסר מתמלא בערך ריק (מחרוזת / `false`) במקום `undefined` שישבור
 * קלט מבוקר.
 */
export function toAimPoint(raw: unknown): AimPoint {
  const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const str = (v: unknown) => (v === null || v === undefined) ? '' : String(v);
  return {
    name: str(r.name), aim_point: str(r.aim_point), coord: str(r.coord),
    alt_ft: str(r.alt_ft), hd: str(r.hd), an: str(r.an), an_min: str(r.an_min),
    fuze: str(r.fuze), note: str(r.note), armament: str(r.armament), bombs: str(r.bombs),
    air_verified: toAimFlag(r.air_verified), cleared_heading: toAimFlag(r.cleared_heading),
    abort_attack: toAimFlag(r.abort_attack), ground_verified: toAimFlag(r.ground_verified),
  };
}

/** `strips.targets` → טבלת נקודות מכוון. עמיד לערך שאינו מערך. */
export function toAimPoints(raw: unknown): AimPoint[] {
  return Array.isArray(raw) ? raw.map(toAimPoint) : [];
}

/**
 * ערך שדה כטקסט לתצוגה. דגל מוצג כ-✓ / ריק, ולא כ-`"false"` שהיה נראה למשתמש
 * כטקסט וגם נספר כשדה מלא.
 */
export function aimFieldText(p: AimPoint, key: keyof AimPoint): string {
  const v = p[key];
  if (typeof v === 'boolean') return v ? '✓' : '';
  return String(v ?? '');
}

/** שורה ריקה לגמרי - לא נשמרת, ולא נספרת בסיכום */
export function isEmptyAimPoint(p: AimPoint): boolean {
  return AIM_POINT_COLUMNS.every(c => !aimFieldText(p, c.key).trim());
}

// ── נ"צ ──────────────────────────────────────────────────────────────────────
//
// הפורמט: `NDDMM.mmmm/EDDDMM.mmmm` - 17 ספרות. קו רוחב במעלות+דקות (4 ספרות)
// ועוד 4 ספרות של שברי דקה; קו אורך במעלות+דקות (5 ספרות) ועוד 4 שברי דקה.

export const COORD_RE = /^([NS])(\d{2})(\d{2})\.(\d{4})\/([EW])(\d{3})(\d{2})\.(\d{4})$/;

/** מספר הספרות בנ"צ תקין - 4+4+5+4 */
export const COORD_DIGITS = 17;

/**
 * מנרמל קלט חופשי לפורמט הנ"צ.
 *
 * הפקח בעמדה מקליד בעט על Cintiq ומעתיק מסמך - ולכן מתקבל גם נ"צ שהודבק בלי
 * מפרידים (17 ספרות רצופות) וגם כזה שהוקלד עם רווחים או במקום סימני N/E. אם יש
 * בדיוק 17 ספרות, הן מסודרות לפורמט; אחרת הקלט חוזר כמות שהוא כדי לא לאבד
 * הקלדה באמצע.
 */
export function normalizeCoord(input: string): string {
  const raw = String(input || '').trim().toUpperCase();
  if (!raw) return '';
  const latHemi = /S/.test(raw) ? 'S' : 'N';
  const lonHemi = /W/.test(raw) ? 'W' : 'E';
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== COORD_DIGITS) return raw;
  return `${latHemi}${digits.slice(0, 4)}.${digits.slice(4, 8)}/${lonHemi}${digits.slice(8, 13)}.${digits.slice(13, 17)}`;
}

/** נ"צ תקין? ריק נחשב תקין - שורה יכולה להיות חלקית בזמן מילוי. */
export function isValidCoord(coord: string): boolean {
  const v = String(coord || '').trim();
  if (!v) return true;
  const m = COORD_RE.exec(v.toUpperCase());
  if (!m) return false;
  const latDeg = Number(m[2]), latMin = Number(m[3]);
  const lonDeg = Number(m[6]), lonMin = Number(m[7]);
  return latMin < 60 && lonMin < 60 && latDeg <= 90 && lonDeg <= 180;
}

/** נ"צ → מעלות עשרוניות, לחישוב או להצגה על מפה. `null` אם אינו תקין. */
export function coordToLatLon(coord: string): { lat: number; lon: number } | null {
  const m = COORD_RE.exec(String(coord || '').trim().toUpperCase());
  if (!m || !isValidCoord(coord)) return null;
  const lat = (Number(m[2]) + Number(`${m[3]}.${m[4]}`) / 60) * (m[1] === 'S' ? -1 : 1);
  const lon = (Number(m[6]) + Number(`${m[7]}.${m[8]}`) / 60) * (m[5] === 'W' ? -1 : 1);
  return { lat, lon };
}

/**
 * מרעום: הערך מוקלד ב**שניות** (0.02), ומוצג לצידו במילי-שניות (20 מ"ש) כדי
 * שלא יתפרש כ-0.02 מ"ש. `null` כשאין ערך מספרי.
 */
export function fuzeMs(fuze: string): number | null {
  const v = String(fuze || '').trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1000) : null;
}

/** אילו שדות בשורה שגויים - להדגשה בעורך. אינו חוסם שמירה. */
export function invalidAimPointFields(p: AimPoint): Set<keyof AimPoint> {
  const bad = new Set<keyof AimPoint>();
  if (!isValidCoord(p.coord)) bad.add('coord');
  const num = (v: string) => String(v || '').trim() === '' || Number.isFinite(Number(v));
  const range = (v: string, min: number, max: number) => {
    const s = String(v || '').trim();
    if (!s) return true;
    const n = Number(s);
    return Number.isFinite(n) && n >= min && n <= max;
  };
  if (!num(p.alt_ft)) bad.add('alt_ft');
  if (!range(p.hd, 0, 360)) bad.add('hd');
  if (!range(p.an, 0, 90)) bad.add('an');
  if (!range(p.an_min, 0, 90)) bad.add('an_min');
  if (!num(p.fuze)) bad.add('fuze');
  if (!num(p.bombs)) bad.add('bombs');
  return bad;
}

// ── ייבוא/ייצוא מקובץ ────────────────────────────────────────────────────────
//
// עמודת `targets` בקובץ ה-CSV/Excel של הפ"מים: שורת נ"צ אחת מופרדת ב-`;`,
// והשדות בתוכה ב-`:` לפי סדר `AIM_POINT_COLUMNS`.
//
//   אלפא:א1:N3212.4500/E03456.8200:12000:270:45:30:0.02:MK84:2:הערה
//
// דגלים מיוצאים כ-`1`/ריק ונקראים גם מ-`true`/`כן`/`v` (ראה `toAimFlag`).
//
// הפורמט הקצר הישן (`שם מטרה:נקודת מכוון`) ממשיך להיקרא כמו שהוא, כי הוא בדיוק
// שני השדות הראשונים - קובץ שנבנה לפני ההרחבה נטען בלי שינוי.

export const AIM_POINT_ROW_SEP = ';';
export const AIM_POINT_FIELD_SEP = ':';

/** תא `targets` מקובץ → טבלת נקודות מכוון */
export function parseAimPointsCell(val: string): AimPoint[] {
  const raw = String(val || '').trim();
  if (!raw) return [];
  return raw.split(AIM_POINT_ROW_SEP).map(s => s.trim()).filter(Boolean).map(rowStr => {
    const parts = rowStr.split(AIM_POINT_FIELD_SEP);
    const row: AimPoint = { ...EMPTY_AIM_POINT };
    AIM_POINT_COLUMNS.forEach((col, i) => {
      const cell = (parts[i] || '').trim();
      if (col.kind === 'flag') (row[col.key] as boolean) = toAimFlag(cell);
      else (row[col.key] as string) = cell;
    });
    return row;
  });
}

/** טבלת נקודות מכוון → תא `targets` לייצוא. שדות ריקים בסוף נגזמים. */
export function formatAimPointsCell(rows: AimPoint[]): string {
  return rows.filter(p => !isEmptyAimPoint(p)).map(p => {
    const vals = AIM_POINT_COLUMNS.map(c =>
      c.kind === 'flag' ? (p[c.key] ? '1' : '') : String(p[c.key] ?? '').trim());
    while (vals.length > 2 && vals[vals.length - 1] === '') vals.pop();
    return vals.join(AIM_POINT_FIELD_SEP);
  }).join(AIM_POINT_ROW_SEP + ' ');
}

/**
 * תקציר שורה לשורה אחת - לתא בטבלה, לפ"מ הקלאסי ולפאנל הפרטים.
 *
 * **עצור תקיפה** מופיע ראשון ובולט: זה הדגל היחיד שאומר *לא לתקוף*, ובשורת
 * תקציר צרה הוא חייב להיקרא לפני שאר הפרטים ולא להיבלע ביניהם.
 */
export function formatAimPointSummary(p: AimPoint): string {
  const parts = [
    p.abort_attack ? '⛔ עצור תקיפה' : '',
    p.name,
    p.aim_point,
    p.coord,
    p.alt_ft ? `${p.alt_ft}'` : '',
    p.hd ? `HD${p.hd}` : '',
    p.an ? `AN${p.an}` : '',
    p.armament ? `${p.armament}${p.bombs ? ` ×${p.bombs}` : ''}` : (p.bombs ? `×${p.bombs}` : ''),
    [p.air_verified ? 'מאומת אווירי' : '', p.ground_verified ? 'מאומת קרקעי' : '',
     p.cleared_heading ? 'רשאי לצאת כיוון' : ''].filter(Boolean).join(', '),
  ].filter(Boolean);
  return parts.join(' · ');
}
