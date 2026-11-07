/**
 * סדר המיון של מוד טבלה - נקבע בניהול (מוד טבלה - "סדר מיון") ונשמר על המוד
 * (`table_modes.sort_spec`).
 *
 * רשימה לפי עדיפות: הרמה הראשונה קובעת, השנייה מכריעה רק בין פ"מים ששווים
 * בראשונה, וכן הלאה. בעמדה זה סדר **ברירת המחדל** של הלוח: לחיצה של הפקח על
 * כותרת עמודה גוברת עליו, וביטול המיון שלו מחזיר אליו.
 */
export type TableSortDir = 'asc' | 'desc';
export interface TableSortLevel { key: string; dir: TableSortDir }

/** ערך ריק בתא - '—' הוא מה ש-getStripFieldValue מחזיר כשאין ערך */
const isEmpty = (v: unknown): boolean => v == null || String(v).trim() === '' || String(v).trim() === '—';

/** רשימה נקייה: בלי רמות בלי שדה, בלי שדה שחוזר פעמיים, וכיוון תקין בלבד */
export function normalizeSortSpec(raw: unknown): TableSortLevel[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: TableSortLevel[] = [];
  for (const r of arr) {
    const key = String((r as any)?.key ?? '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, dir: (r as any)?.dir === 'desc' ? 'desc' : 'asc' });
  }
  return out;
}

/**
 * השוואה לפי כל רמות המיון. מספרים בתוך הטקסט מושווים כמספרים (90 לפני 120),
 * וערך ריק תמיד **בסוף** - גם בסדר יורד, כדי שפ"מ בלי ערך לא יקפוץ לראש הלוח.
 */
export function compareBySortSpec<T>(spec: TableSortLevel[], valueOf: (item: T, key: string) => unknown) {
  return (a: T, b: T): number => {
    for (const { key, dir } of spec) {
      const av = valueOf(a, key), bv = valueOf(b, key);
      const ae = isEmpty(av), be = isEmpty(bv);
      if (ae || be) {
        if (ae && be) continue;
        return ae ? 1 : -1;
      }
      const cmp = String(av).localeCompare(String(bv), 'he', { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  };
}
