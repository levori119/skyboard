// ─── לוגיקת הערך של פקדי הסטריפ ──────────────────────────────────────────────
// טהור ובלי React בכוונה: זו הלוגיקה שקובעת *מה הפקד מראה* ו*מה קורה בלחיצה*,
// ולכן היא נבדקת ישירות (`stripControls.test.ts`) ולא דרך רינדור.
// האפיון ומטריצת המקרים: CIV_STRIP_CONTROLS.md

import type {
  StripControl, StripControlType, StripControlValue, StripControlStyleRule,
} from '../types/stripControls';
import { CONTROL_MATCH_ANY, CONTROL_FIELD_PREFIX } from '../types/stripControls';
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

/** הטקסט שמוצג על הפקד. כתב יד מוצג כתמונה ולכן מחזיר מחרוזת ריקה */
export function controlDisplayText(control: StripControl, value: StripControlValue): string {
  if (control.type === 'flag') {
    if (control.label) return control.label;
    return value === true ? '✓' : '–';
  }
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

/** כל הפקדים שבעץ הפריסה, לפי סדר הופעתם */
export function collectLayoutControls(node: SGNode | null | undefined): StripControl[] {
  if (!node) return [];
  if (node.type === 'cell') return (node as SGCell).controls || [];
  return (node as SGSplit).children.flatMap(c => collectLayoutControls(c));
}

export interface ControlKeyIssue {
  key: string;
  reason: 'empty' | 'type_conflict';
  types?: StripControlType[];
}

/**
 * תקלות מפתח שהעורך חוסם עליהן שמירה: מפתח ריק, או אותו מפתח בשני **סוגים**.
 * אותו מפתח באותו סוג הוא שיתוף ערך מכוון ולכן לגיטימי.
 */
export function controlKeyIssues(controls: StripControl[]): ControlKeyIssue[] {
  const issues: ControlKeyIssue[] = [];
  const byKey = new Map<string, Set<StripControlType>>();
  for (const c of controls) {
    const key = (c.key || '').trim();
    if (!key) {
      if (!issues.some(i => i.reason === 'empty')) issues.push({ key: '', reason: 'empty' });
      continue;
    }
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key)!.add(c.type);
  }
  for (const [key, types] of byKey) {
    if (types.size > 1) issues.push({ key, reason: 'type_conflict', types: [...types] });
  }
  return issues;
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
 * הפקדים ה**גלובליים** שבכל התבניות, אחד לכל מפתח - אלה שערכם יושב על הפ"מ
 * ולכן יש להם משמעות בכל המערכת (CIV_STRIP_CONTROLS.md §4.1). פקד פנימי ללוח
 * אינו כאן במכוון: ערכו חסר משמעות מחוץ ללוח שלו, ושאילתא עליו הייתה משקרת.
 */
export function globalControlsFromTables(tables: { layout_json?: SGNode | null }[] | null | undefined): StripControl[] {
  const byKey = new Map<string, StripControl>();
  for (const t of tables || []) {
    for (const c of collectLayoutControls(t?.layout_json)) {
      if (c.scope !== 'global') continue;
      const key = (c.key || '').trim();
      if (!key || byKey.has(key)) continue;
      byKey.set(key, c);
    }
  }
  return [...byKey.values()];
}
