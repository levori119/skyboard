// ─── לוגיקת הערך של פקדי הסטריפ ──────────────────────────────────────────────
// טהור ובלי React בכוונה: זו הלוגיקה שקובעת *מה הפקד מראה* ו*מה קורה בלחיצה*,
// ולכן היא נבדקת ישירות (`stripControls.test.ts`) ולא דרך רינדור.
// האפיון ומטריצת המקרים: CIV_STRIP_CONTROLS.md

import type {
  StripControl, StripControlRef, StripControlType, StripControlValue, StripControlStyleRule,
  StripControlInput, StripFieldDataType,
} from '../types/stripControls';
import { CONTROL_MATCH_ANY, CONTROL_FIELD_PREFIX, STRIP_FIELD_DATA_TYPES } from '../types/stripControls';
import type { SGNode, SGCell, SGSplit } from '../types/stripGrid';

/** השוואת ערכים: לא תלוית רישיות ורווחים, כדי שהגדרה ידנית לא תחטיא */
const sameText = (a: unknown, b: unknown) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/**
 * אפס-הסוג: מה שהפקד מראה כשאין לו ערך שמור **וגם** אין ב"מ.
 * דגל הוא `false` ולעולם לא `null` - דרישה מפורשת באפיון.
 */
export function controlZero(type: StripControlType): StripControlValue {
  if (type === 'flag') return false;
  if (type === 'multiselect') return [];
  return '';
}

/** ערכים שנחשבים אמת בדגל שנשמר בעבר בסוג אחר (מחרוזת, מספר) */
const TRUTHY = new Set(['true', '1', 'yes', 'כן']);

/** מביא ערך גולמי מה-DB לצורה שהסוג מבטיח */
export function normalizeControlValue(type: StripControlType, raw: unknown): StripControlValue {
  if (type === 'flag') {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw !== 0;
    return TRUTHY.has(String(raw ?? '').trim().toLowerCase());
  }
  if (type === 'multiselect') {
    if (Array.isArray(raw)) return raw.map(v => String(v)).filter(v => v.trim() !== '');
    const s = String(raw ?? '').trim();
    if (!s) return [];
    return s.split(',').map(v => v.trim()).filter(Boolean);
  }
  return raw == null ? '' : String(raw);
}

/**
 * הערך האפקטיבי: ערך שמור → ב"מ → אפס-הסוג.
 *
 * `undefined`/`null` הם "לא נקבע מעולם" ורק הם נופלים ל-ב"מ. ערך שנוקה
 * **במפורש** (`''`, `false`, `[]`) הוא ערך לכל דבר - אחרת דגל שכיבו היה נדלק
 * שוב בכל רענון, וזה שקר תפעולי.
 */
export function resolveControlValue(control: StripControl, stored: unknown): StripControlValue {
  if (stored !== undefined && stored !== null) return normalizeControlValue(control.type, stored);
  if (control.defaultValue !== undefined && control.defaultValue !== null)
    return normalizeControlValue(control.type, control.defaultValue);
  return controlZero(control.type);
}

/**
 * קריאת הערך לפי ההיקף:
 * `global` - מ-`strips.custom_fields`; `window` - ממפת ערכי הלוח הנוכחי.
 */
export function readControlValue(
  control: StripControl,
  strip: any,
  windowValues?: Record<string, unknown> | null,
): StripControlValue {
  const store = control.scope === 'global'
    ? (strip?.custom_fields && typeof strip.custom_fields === 'object' ? strip.custom_fields : {})
    : (windowValues || {});
  return resolveControlValue(control, (store as Record<string, unknown>)[control.key]);
}

/**
 * הערך הבא במחזור הכפתור. ערך שאינו ברשימה (המנהל ערך אותה אחרי שנקבע ערך)
 * קופץ לערך הראשון, ורשימה ריקה אינה משנה דבר.
 */
export function nextButtonValue(control: StripControl, current: unknown): string {
  const values = control.values || [];
  if (values.length === 0) return String(current ?? '');
  const idx = values.findIndex(v => sameText(v, current));
  if (idx < 0) return values[0];
  return values[(idx + 1) % values.length];
}

export function toggleFlagValue(current: unknown): boolean {
  return current !== true;
}

/**
 * בחירה מרובה: לחיצה מוסיפה או מסירה, וערך ריק מנקה הכל.
 * הסדר הוא **סדר ההגדרה** ולא סדר הלחיצות, כדי שאותו צירוף ייראה תמיד אותו דבר.
 * ערך שאינו ברשימה נשמר בסוף - לא מוחקים מידע תפעולי בשקט.
 */
export function toggleMultiValue(control: StripControl, current: unknown, value: string): string[] {
  if (String(value ?? '').trim() === '') return [];
  const arr = (normalizeControlValue('multiselect', current) as string[]);
  const at = arr.findIndex(v => sameText(v, value));
  if (at >= 0) return arr.filter((_, i) => i !== at);
  const order = control.values || [];
  const rank = (v: string) => {
    const i = order.findIndex(o => sameText(o, v));
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...arr, value].sort((a, b) => rank(a) - rank(b));
}

export function isHandwritingValue(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('data:image');
}

/**
 * הטקסט שמוצג **על הפקד עצמו**: הערך שלו - כלומר הערך השמור, ובהיעדרו ה-ב"מ,
 * ובהיעדרו ריק. **התווית אינה כאן**: שם השדה הוא פריט נפרד שיושב לצד הפקד
 * (`showLabel`), ולא טקסט שמכסה את הערך בתוכו.
 * כתב יד מוצג כתמונה ולכן מחזיר מחרוזת ריקה.
 */
export function controlDisplayText(control: StripControl, value: StripControlValue): string {
  if (control.type === 'flag') return value === true ? '✓' : '–';
  if (control.type === 'multiselect') {
    return (normalizeControlValue('multiselect', value) as string[]).join(', ');
  }
  if (isHandwritingValue(value)) return '';
  return String(value ?? '');
}

/**
 * האם ערך הפקד מתאים להתאמה של כלל עיצוב.
 * `''` = ריק · `'*'` = כל ערך שאינו ריק · `'true'`/`'false'` = דגל.
 */
export function controlValueMatches(type: StripControlType, value: StripControlValue, match: string): boolean {
  const m = String(match ?? '').trim();
  if (type === 'flag') {
    const on = value === true;
    if (m.toLowerCase() === 'true') return on;
    if (m.toLowerCase() === 'false') return !on;
    if (m === CONTROL_MATCH_ANY) return on;
    if (m === '') return !on;
    return false;
  }
  if (type === 'multiselect') {
    const arr = normalizeControlValue('multiselect', value) as string[];
    if (m === '') return arr.length === 0;
    if (m === CONTROL_MATCH_ANY) return arr.length > 0;
    return arr.some(v => sameText(v, m));
  }
  const s = String(value ?? '');
  if (m === '') return s.trim() === '';
  if (m === CONTROL_MATCH_ANY) return s.trim() !== '';
  return sameText(s, m);
}

/** הכלל הראשון שמתאים מנצח, כדי שסדר הכללים בעורך יהיה סדר העדיפות */
export function resolveControlStyle(control: StripControl, value: StripControlValue): StripControlStyleRule | null {
  for (const rule of control.styles || []) {
    if (controlValueMatches(control.type, value, rule.match)) return rule;
  }
  return null;
}

/** כל **הפניות** הפקדים שבעץ הפריסה, לפי סדר הופעתן */
export function collectLayoutControls(node: SGNode | null | undefined): StripControlRef[] {
  if (!node) return [];
  if (node.type === 'cell') return (node as SGCell).controls || [];
  return (node as SGSplit).children.flatMap(c => collectLayoutControls(c));
}

/** קטלוג לפי מפתח, לחיפוש מהיר בזמן רינדור */
export function catalogByKey(catalog: StripControl[] | null | undefined): Record<string, StripControl> {
  const map: Record<string, StripControl> = {};
  for (const f of catalog || []) if (f?.key) map[f.key] = f;
  return map;
}

/**
 * הפניה + קטלוג → הפקד המלא לרינדור: ההגדרה מהקטלוג, ומעליה העיצוב המקומי
 * של מקום ההצבה. `null` כשהשדה נמחק מהקטלוג - הקורא פשוט לא מצייר אותו,
 * במקום לצייר פקד ריק שאיש אינו יודע מה הוא.
 */
export function resolveControlRef(
  ref: StripControlRef,
  byKey: Record<string, StripControl>,
): StripControl | null {
  const def = byKey[ref?.fieldKey];
  if (!def) return null;
  return {
    ...def,
    id: ref.id || def.key,
    ...(ref.flex != null ? { flex: ref.flex } : {}),
    ...(ref.fontSize != null ? { fontSize: ref.fontSize } : {}),
    ...(ref.bold != null ? { bold: ref.bold } : {}),
  };
}

/**
 * "CLR, TXI, LUW" → `['CLR','TXI','LUW']`. רשימת הערכים של פקד נכתבת בעורך
 * כטקסט אחד, ולכן זו נקודת הפירוק היחידה.
 *
 * שים לב שהפירוק **הרסני** בכוונה (מסנן ריקים), ולכן הקלט בעורך חייב להחזיק
 * את הטקסט הגולמי בזמן ההקלדה - אחרת הפסיק נמחק ברגע שנכתב. ראה `CommaListInput`.
 */
export function parseCommaList(raw: string): string[] {
  return String(raw ?? '').split(',').map(v => v.trim()).filter(Boolean);
}

/** האם ההצבה במיקום חופשי (נגררה בעורך) או בשורת הפקדים */
export function isFreePlacement(ref: StripControlRef): boolean {
  return typeof ref?.x === 'number' && typeof ref?.y === 'number';
}

/**
 * נקודת מצביע → אחוזי התא, מוגבל ל-0..100. יחס בין שני גדלים באותה מערכת
 * קואורדינטות, ולכן נכון גם תחת ה-`zoom` של ה-root בלי חלוקה ב---s.
 */
export function pointToCellPercent(
  clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return {
    x: clamp(rect.width ? ((clientX - rect.left) / rect.width) * 100 : 0),
    y: clamp(rect.height ? ((clientY - rect.top) / rect.height) * 100 : 0),
  };
}

/** מפתח השדה שדרכו פקד גלובלי נחשף לשאילתות ולעיצוב המותנה */
export function controlFieldKey(key: string): string {
  return `${CONTROL_FIELD_PREFIX}${key}`;
}

/** ההפך: שם שדה בשאילתא → מפתח הפקד, או `null` אם אינו שדה של פקד */
export function controlKeyFromField(field: string): string | null {
  return field?.startsWith(CONTROL_FIELD_PREFIX) ? field.slice(CONTROL_FIELD_PREFIX.length) : null;
}

/**
 * השדות ה**גלובליים** שבקטלוג - אלה שערכם יושב על הפ"מ ולכן יש להם משמעות
 * בכל המערכת (CIV_STRIP_CONTROLS.md §4.1). שדה פנימי ללוח אינו כאן במכוון:
 * ערכו חסר משמעות מחוץ ללוח שלו, ושאילתא עליו הייתה משקרת.
 */
export function globalControls(catalog: StripControl[] | null | undefined): StripControl[] {
  return (catalog || []).filter(f => f?.scope === 'global' && f.key);
}

// ─── סוג הנתון של שדה (CIV_STRIP_CONTROLS.md §2.4) ───────────────────────────

const KNOWN_DATA_TYPES = new Set<string>(STRIP_FIELD_DATA_TYPES.map(t => t.type));

/**
 * סוג הנתון האפקטיבי. שדה ותיק בלי סוג, סוג לא מוכר, או פקד שאינו שדה
 * (סוג שנשאר מהגדרה קודמת) - כולם `text`, כלומר ההתנהגות של היום.
 */
export function fieldDataType(control: Pick<StripControl, 'type' | 'dataType'> | null | undefined): StripFieldDataType {
  if (control?.type !== 'field') return 'text';
  return control.dataType && KNOWN_DATA_TYPES.has(control.dataType) ? control.dataType : 'text';
}

export type FieldInputResult = { ok: true; value: string } | { ok: false };

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "1430" / "7:05" / "14.30" / "9" → "HH:MM", או `null` */
function parseTime(s: string): string | null {
  let h: number; let m: number;
  const sep = s.replace(/[.,h]/g, ':').match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (sep) { h = Number(sep[1]); m = Number(sep[2]); }
  else if (/^\d{3,4}$/.test(s)) { h = Number(s.slice(0, -2)); m = Number(s.slice(-2)); }
  else if (/^\d{1,2}$/.test(s)) { h = Number(s); m = 0; }
  else return null;
  if (h > 23 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}

/** "2026-11-07" / "7/11/2026" / "7.11.26" (יום-חודש-שנה) → "YYYY-MM-DD", או `null` */
function parseDate(s: string): string | null {
  let y: number; let mo: number; let d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})$/);
  if (iso) { y = Number(iso[1]); mo = Number(iso[2]); d = Number(iso[3]); }
  else if (dmy) { d = Number(dmy[1]); mo = Number(dmy[2]); y = Number(dmy[3]); if (dmy[3].length === 2) y += 2000; }
  else return null;
  // בדיקה מול לוח השנה עצמו: 31/11 ו-29/02 בשנה פשוטה "מתגלגלים" בחודש
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** מסיר אפסים מובילים מחלק שלם ("007" → "7", "" → "0") */
const trimIntZeros = (digits: string) => digits.replace(/^0+(?=\d)/, '') || '0';

/**
 * קלט גולמי (הקלדה, לוח ספרות, בורר הדפדפן) → הצורה השמורה של הסוג, או
 * דחייה. ריק הוא תמיד חוקי - זה ניקוי השדה. טקסט עובר כמות שהוא, כולל
 * רווחים: זו ההתנהגות של היום ואין סיבה לשנות אותה.
 */
export function normalizeFieldInput(dataType: StripFieldDataType, raw: unknown): FieldInputResult {
  const str = raw == null ? '' : String(raw);
  if (dataType === 'text') return { ok: true, value: str };
  const s = str.trim();
  if (s === '') return { ok: true, value: '' };

  if (dataType === 'integer') {
    const m = s.match(/^([+-]?)(\d+)$/);
    if (!m) return { ok: false };
    const digits = trimIntZeros(m[2]);
    return { ok: true, value: m[1] === '-' && digits !== '0' ? `-${digits}` : digits };
  }

  if (dataType === 'decimal') {
    const m = s.replace(',', '.').match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
    if (!m || (m[2] === '' && !m[3])) return { ok: false };
    const int = trimIntZeros(m[2]);
    const frac = m[3] || '';
    const body = frac ? `${int}.${frac}` : int;
    const zero = /^[0.]+$/.test(body);
    return { ok: true, value: m[1] === '-' && !zero ? `-${body}` : body };
  }

  if (dataType === 'time') {
    const t = parseTime(s);
    return t ? { ok: true, value: t } : { ok: false };
  }

  if (dataType === 'date') {
    const d = parseDate(s);
    return d ? { ok: true, value: d } : { ok: false };
  }

  // datetime: שני חלקים, תאריך ושעה - מופרדים ב-T (מה שבורר הדפדפן מחזיר) או ברווח
  const parts = s.split(/[T\s]+/);
  if (parts.length !== 2) return { ok: false };
  const d = parseDate(parts[0]);
  const t = parseTime(parts[1]);
  return d && t ? { ok: true, value: `${d} ${t}` } : { ok: false };
}

/**
 * ערך שמור → הצורה ש-`<input type="date|time|datetime-local">` מקבל. ערך ישן
 * שאינו בצורה החוקית (נכתב לפני שנקבע סוג) נפתח ריק - הדפדפן היה מתעלם ממנו
 * בכל מקרה, והערך עצמו לא נמחק עד שהפקח שומר ערך חדש.
 */
export function fieldNativeInputValue(dataType: StripFieldDataType, value: unknown): string {
  const s = value == null ? '' : String(value);
  if (dataType === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  if (dataType === 'time') return /^\d{2}:\d{2}$/.test(s) ? s : '';
  if (dataType === 'datetime') return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') : '';
  return s;
}

/**
 * מה נפתח בלחיצה על השדה:
 * `text` - עריכה במקום (היום) · `numpad` - לוח הספרות של העמדה ·
 * `inline` - קלט מספרי במקום, כשאין לוח ספרות (מחוץ לעמדה) ·
 * `date`/`datetime` - בורר הדפדפן.
 *
 * שעה עוברת בלוח הספרות ולא בבורר: "1430" בארבע הקשות מהיר מכל בורר, וזו
 * בדיוק הצורה שבה פקח כותב שעה.
 */
export function fieldEditKind(
  dataType: StripFieldDataType,
  numpadAvailable: boolean,
): 'text' | 'numpad' | 'inline' | 'date' | 'datetime' {
  if (dataType === 'date' || dataType === 'datetime') return dataType;
  if (dataType === 'integer' || dataType === 'decimal' || dataType === 'time') return numpadAvailable ? 'numpad' : 'inline';
  return 'text';
}

/** כתב יד נשמר כציור (`data:image`), ולכן סוג הנתון אינו נאכף בו */
export function dataTypeEnforcedIn(input: StripControlInput | undefined): boolean {
  return input !== 'handwriting';
}
