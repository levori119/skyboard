// טבלת המטוסים של הפ"מ - מקור אמת יחיד לצד הלקוח.
//
// כל שורה בטבלה היא **מטוס אחד** במבנה: מי הוא (מספר זנב), מי טס בו (טייס,
// נווט, סגול 1, סגול 2), איפה הוא חונה (דת"ק, כיפה), מה הוא נושא (חימושים),
// מה תקין בו (מערכות), והאם יש בו תקלה.
//
// **כמות השורות היא המס"מ** (`number_of_formation`): מבנה של ארבעה = ארבע
// שורות, `idx` 1..4.
//
// הנתון מגיע מ-`strip_aircraft` ב-DB, מקונן על הפ"מ ב-`GET /api/strips/global`
// תחת `strip.aircraft` - בדיוק כמו `strips.targets` של נקודות המכוון. כך אותו
// מנגנון טבלאות-בן (מוד הטבלה, הפ"מ הקלאסי) מוצא אותה בלי צינור נתונים משלה.
//
// > **קריאה בלבד בטבלה.** שורת מטוס נערכת במסלולים ייעודיים
// > (`PUT /api/strip-aircraft/:stripId/:idx` לזהות ולצוות, `/fault` לתקלה),
// > ולא בכתיבה למערך שלם כמו נקודות המכוון - שם המערך **הוא** השדה
// > (`strips.targets`), וכאן כל שורה היא רשומת DB עם מפתח משלה.

/** חימוש בודד על מטוס */
export interface StripAircraftArmament { name?: string | null; quantity?: number | null }

/** מערכת בודדת על מטוס */
export interface StripAircraftSystem { name?: string | null; status?: string | null }

/** שורת מטוס כפי שהשרת מחזיר אותה ב-`strip.aircraft` */
export interface StripAircraftRaw {
  idx?: number | null;
  tail_number?: string | null;
  pilot_name?: string | null;
  navigator_name?: string | null;
  sagol_1?: string | null;
  sagol_2?: string | null;
  datk?: number | null;
  kipa?: string | null;
  has_fault?: boolean | null;
  fault_type?: string | null;
  fault_details?: string | null;
  armaments?: StripAircraftArmament[] | null;
  systems?: StripAircraftSystem[] | null;
}

/**
 * שורת מטוס **מוכנה לתצוגה**: כל תא הוא מחרוזת אחת.
 *
 * החימושים והמערכות הם טבלאות בן של המטוס, ולכן הם משוטחים כאן לטקסט אחד
 * ("פצצה x2, טיל"). תא בטבלה אינו יכול לפרוס טבלה שלישית, ומי שצריך את הפירוט
 * המלא פותח את המטוס במסך שלו.
 */
export interface StripAircraftRow {
  idx: string;
  tail_number: string;
  pilot_name: string;
  navigator_name: string;
  sagol_1: string;
  sagol_2: string;
  datk: string;
  kipa: string;
  armaments: string;
  systems: string;
  fault_type: string;
  fault_details: string;
  /** בוליאני ולא מחרוזת - מוצג כמתג/סימן, ו-`"false"` היה נקרא כ-truthy */
  has_fault: boolean;
}

/**
 * `text` נערך במקלדת · `flag` במתג · `derived` לקריאה בלבד.
 *
 * `derived` הוא לא "החלטנו שלא" אלא **אין לאן לכתוב**: `idx` הוא המפתח של
 * השורה, והחימושים והמערכות הם שיטוח של טבלאות בן שלמות לטקסט אחד - הקלדה
 * לתוכו לא ניתנת לפירוק חזרה לשורות.
 */
export type StripAircraftKind = 'text' | 'flag' | 'derived';

export interface StripAircraftColumn {
  key: keyof StripAircraftRow;
  /** מפתח i18n לכותרת - זה מה שמוצג */
  labelKey: string;
  /** תווית עברית קבועה, גיבוי לצרכנים שקוראים `label` גולמי */
  label: string;
  kind: StripAircraftKind;
  /** רוחב בסיס בפיקסלים (לפני זום המסך) */
  width: number;
}

/** העמודות, לפי הסדר שבו הן נמסרו באפיון */
export const STRIP_AIRCRAFT_COLUMNS: StripAircraftColumn[] = [
  { key: 'idx',            labelKey: 'strips.acIdx',           label: 'מספר',        kind: 'derived', width: 44 },
  { key: 'tail_number',    labelKey: 'strips.acTailNumber',    label: 'מספר זנב',    kind: 'text',    width: 72 },
  { key: 'pilot_name',     labelKey: 'strips.acPilot',         label: 'שם טייס',     kind: 'text',    width: 110 },
  { key: 'navigator_name', labelKey: 'strips.acNavigator',     label: 'שם נווט',     kind: 'text',    width: 110 },
  { key: 'sagol_1',        labelKey: 'strips.acSagol1',        label: 'סגול 1',      kind: 'text',    width: 62 },
  { key: 'sagol_2',        labelKey: 'strips.acSagol2',        label: 'סגול 2',      kind: 'text',    width: 62 },
  { key: 'armaments',      labelKey: 'strips.acArmaments',     label: 'חימושים',     kind: 'derived', width: 150 },
  { key: 'systems',        labelKey: 'strips.acSystems',       label: 'מערכות',      kind: 'derived', width: 150 },
  { key: 'datk',           labelKey: 'strips.acDatk',          label: 'דת"ק',        kind: 'text',    width: 52 },
  { key: 'kipa',           labelKey: 'strips.acKipa',          label: 'כיפה',        kind: 'text',    width: 52 },
  { key: 'has_fault',      labelKey: 'strips.acHasFault',      label: 'תקלה',        kind: 'flag',    width: 48 },
  { key: 'fault_type',     labelKey: 'strips.acFaultType',     label: 'מהות התקלה',  kind: 'text',    width: 110 },
  { key: 'fault_details',  labelKey: 'strips.acFaultDetails',  label: 'פירוט התקלה', kind: 'text',    width: 170 },
];

/** שדות התקלה - נכתבים יחד, במסלול נפרד משאר שורת המטוס */
const FAULT_KEYS = ['has_fault', 'fault_type', 'fault_details'];

/** מפתח הטבלה ברישום טבלאות הבן ובשדה שנושא אותה על הפ"מ */
export const STRIP_AIRCRAFT_TABLE_KEY = 'aircraft';
export const STRIP_AIRCRAFT_TABLE_LABEL = 'טבלת מטוסים';
export const STRIP_AIRCRAFT_TABLE_LABEL_KEY = 'strips.aircraftTable';

const str = (v: unknown): string => (v === null || v === undefined) ? '' : String(v);

/** "פצצה x2, טיל" - כמות מוצגת רק כשהיא גדולה מ-1, אחרת היא רעש */
const armamentsText = (list: StripAircraftArmament[] | null | undefined): string =>
  (Array.isArray(list) ? list : [])
    .filter(a => a && str(a.name).trim())
    .map(a => {
      const q = Number(a.quantity);
      return str(a.name).trim() + (Number.isFinite(q) && q > 1 ? ` x${q}` : '');
    })
    .join(', ');

/** "ראדאר (לא שמיש)" - מערכת שמישה מוצגת בלי הסטטוס, כי שמיש הוא הצפוי */
const systemsText = (list: StripAircraftSystem[] | null | undefined): string =>
  (Array.isArray(list) ? list : [])
    .filter(s => s && str(s.name).trim())
    .map(s => {
      const st = str(s.status).trim();
      return str(s.name).trim() + (st && st !== 'שמיש' ? ` (${st})` : '');
    })
    .join(', ');

/** שורת מטוס גולמית → שורה מוכנה לתצוגה */
export function toStripAircraftRow(raw: unknown): StripAircraftRow {
  const r = (raw && typeof raw === 'object') ? raw as StripAircraftRaw : {};
  return {
    idx: str(r.idx),
    tail_number: str(r.tail_number),
    pilot_name: str(r.pilot_name),
    navigator_name: str(r.navigator_name),
    sagol_1: str(r.sagol_1),
    sagol_2: str(r.sagol_2),
    datk: str(r.datk),
    kipa: str(r.kipa),
    armaments: armamentsText(r.armaments),
    systems: systemsText(r.systems),
    has_fault: r.has_fault === true,
    fault_type: str(r.fault_type),
    fault_details: str(r.fault_details),
  };
}

/** `strip.aircraft` → טבלת המטוסים. עמיד לערך שאינו מערך, וממוין לפי מספר המטוס. */
export function toStripAircraftRows(raw: unknown): StripAircraftRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(toStripAircraftRow)
    .sort((a, b) => (Number(a.idx) || 0) - (Number(b.idx) || 0));
}

// ─── כתיבה מהטבלה ────────────────────────────────────────────────────────────

/** מה לשלוח כדי לשמור תא בודד, ואיך תיראה השורה אחרי */
export interface StripAircraftWrite {
  /** נתיב יחסי ל-API (בלי `${API_URL}`) */
  path: string;
  body: Record<string, unknown>;
  /** השורה אחרי השינוי - לעדכון אופטימי בתצוגה */
  next: StripAircraftRow;
}

/**
 * תא בטבלה → הבקשה שתשמור אותו.
 *
 * **שני מסלולים ולא אחד**, כי כך הם ב-API: התקלה נכתבת ב-`/fault` (דגל, מהות
 * ופירוט **יחד**), וזהות המטוס והצוות ב-`PUT /strip-aircraft/:stripId/:idx`
 * בעדכון חלקי. הפרדה זו היא שמונעת מעמדה שמעדכנת דת"ק לדרוס תקלה שעמדה אחרת
 * רשמה באותו רגע.
 *
 * מחזיר `null` לעמודה שאין לאן לכתוב אותה (`derived`).
 */
export function aircraftRowWrite(
  stripId: string | number,
  row: StripAircraftRow,
  key: string,
  value: string | boolean,
): StripAircraftWrite | null {
  const col = STRIP_AIRCRAFT_COLUMNS.find(c => c.key === key);
  if (!col || col.kind === 'derived') return null;
  const idx = Number(row.idx);
  if (!Number.isInteger(idx) || idx < 1) return null;
  const base = `/strip-aircraft/${String(stripId).replace(/^s/, '')}/${idx}`;

  if (FAULT_KEYS.includes(key)) {
    const next: StripAircraftRow = { ...row };
    if (key === 'has_fault') {
      next.has_fault = value === true;
      // כיבוי הדגל מנקה מהות ופירוט - "אין תקלה" חייב להיות אין תקלה, אחרת
      // טקסט ישן היה צץ שוב בהדלקה הבאה. זו גם התנהגות השרת.
      if (!next.has_fault) { next.fault_type = ''; next.fault_details = ''; }
    } else {
      const v = String(value);
      (next as unknown as Record<string, string>)[key] = v;
      // הקלדת מהות/פירוט **מדליקה** את הדגל: השרת מתעלם משניהם כשהוא כבוי,
      // ובלי זה מה שהוקלד היה נעלם בשקט. כיבוי נעשה רק במתג עצמו.
      if (v.trim()) next.has_fault = true;
    }
    return {
      path: `${base}/fault`,
      body: {
        has_fault: next.has_fault,
        fault_type: next.fault_type || null,
        fault_details: next.fault_details || null,
      },
      next,
    };
  }

  const v = String(value);
  const next = { ...row, [key]: v } as StripAircraftRow;
  return { path: base, body: { [key]: v }, next };   // עדכון חלקי - רק העמודה הזו
}
