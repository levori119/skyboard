// ─── טבלת האלמנטים: סינון ומיון ──────────────────────────────────────────────
//
// הלוגיקה יושבת כאן ולא בתוך החלון, כי זו השאלה שהפקח באמת שואל - "מה לא שמיש
// עכשיו", "מה מהבהב", "מה מוסתר מהמפה" - ופילטר ששוגה בשקט גרוע מפילטר שאינו
// קיים. בנפרד מה-DOM אפשר לבדוק אותו באמת.

export type ElementRow = {
  id: number;
  name?: string | null;
  category?: string | null;
  type_name?: string | null;
  status?: string | null;
  display_state?: string | null;
  hidden_on_map?: boolean | null;
  airfield_id?: number | null;
  airfield_name?: string | null;
  [k: string]: unknown;
};

export type OnMapFilter = 'all' | 'yes' | 'no';

export type ElementFilters = {
  search: string;
  airfieldId: number | null;
  category: string;
  type: string;
  status: string;
  displayState: string;
  onMap: OnMapFilter;
};

export const EMPTY_ELEMENT_FILTERS: ElementFilters = {
  search: '', airfieldId: null, category: '', type: '', status: '', displayState: '', onMap: 'all',
};

const txt = (v: unknown) => String(v ?? '').trim();
const uniqSorted = (values: unknown[]) =>
  [...new Set(values.map(txt).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));

/**
 * אפשרויות הבוררים **נגזרות מהנתונים** ולא מרשימה קבועה: כך גם ערך כשירות ישן
 * ('חלקי') שיושב בפועל על אלמנט ניתן לסינון, במקום להיות בלתי נגיש.
 */
export function elementFilterOptions(rows: ElementRow[]) {
  const airfields = new Map<number, string>();
  for (const r of rows) {
    if (r.airfield_id != null) airfields.set(Number(r.airfield_id), txt(r.airfield_name));
  }
  return {
    airfields: [...airfields.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he')),
    categories: uniqSorted(rows.map(r => r.category)),
    types: uniqSorted(rows.map(r => r.type_name)),
    statuses: uniqSorted(rows.map(r => r.status)),
    displayStates: uniqSorted(rows.map(r => r.display_state)),
  };
}

/** הבוררים **מצטברים** (AND): כל אחד מצמצם, ואף אחד לא מבטל את השני. */
export function filterElements(rows: ElementRow[], f: ElementFilters): ElementRow[] {
  const needle = txt(f.search).toLowerCase();
  return rows.filter(r => {
    if (needle) {
      const hay = [r.name, r.category, r.type_name, r.status, r.airfield_name, r.note]
        .map(v => txt(v).toLowerCase()).join(' ');
      if (!hay.includes(needle)) return false;
    }
    if (f.airfieldId != null && Number(r.airfield_id) !== Number(f.airfieldId)) return false;
    // השוואה מדויקת ולא הכלה - אחרת 'שמיש' היה תופס גם 'לא שמיש'
    if (f.category && txt(r.category) !== f.category) return false;
    if (f.type && txt(r.type_name) !== f.type) return false;
    if (f.status && txt(r.status) !== f.status) return false;
    if (f.displayState && txt(r.display_state) !== f.displayState) return false;
    if (f.onMap === 'yes' && r.hidden_on_map) return false;
    if (f.onMap === 'no' && !r.hidden_on_map) return false;
    return true;
  });
}

export type SortDir = 'asc' | 'desc';

/** מיון עברי, על עותק. ערך חסר יורד תמיד לסוף - בשני הכיוונים. */
export function sortElements(rows: ElementRow[], key: string, dir: SortDir): ElementRow[] {
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = txt(a[key]), bv = txt(b[key]);
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    return sign * av.localeCompare(bv, 'he', { numeric: true });
  });
}
