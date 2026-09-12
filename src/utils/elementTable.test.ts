import { describe, it, expect } from 'vitest';
import { elementFilterOptions, EMPTY_ELEMENT_FILTERS, filterElements, sortElements } from './elementTable';

// ─── טבלת האלמנטים: הסינון והמיון ────────────────────────────────────────────
// הלוגיקה יושבת בנפרד מהחלון כדי שתהיה בדיקה אמיתית: הפקח מסנן כדי למצוא
// "מה לא שמיש עכשיו", ופילטר ששוגה בשקט גרוע מפילטר שאינו קיים.

const ROWS = [
  { id: 1, name: 'מחסום ראשי', category: 'מחסומים', type_name: 'מחסום עולה יורד', status: 'שמיש', display_state: 'open', hidden_on_map: false, airfield_id: 7, airfield_name: 'בחא 8 קרקעי' },
  { id: 2, name: 'מחסום כביש ראשי', category: 'מחסומים', type_name: 'רשת', status: 'חלקי', display_state: 'blink', hidden_on_map: false, airfield_id: 7, airfield_name: 'בחא 8 קרקעי' },
  { id: 3, name: 'רמזור חציה 33', category: 'רמזורים', type_name: 'רמזור', status: 'לא שמיש', display_state: 'blink', hidden_on_map: true, airfield_id: 7, airfield_name: 'בחא 8 קרקעי' },
  { id: 4, name: 'STOP BAR 33', category: 'STOP BAR', type_name: 'STOP BAR', status: 'שמיש', display_state: 'off', hidden_on_map: false, airfield_id: 16, airfield_name: 'בחא 8 אווירי' },
];

describe('elementFilterOptions - הבוררים נגזרים מהנתונים', () => {
  it('כל ערך מופיע פעם אחת, ממוין', () => {
    const o = elementFilterOptions(ROWS);
    // מיון עברי: עברית קודמת ללטינית. זו ההתנהגות הנכונה לממשק עברי.
    expect(o.categories).toEqual(['מחסומים', 'רמזורים', 'STOP BAR']);
    expect(o.airfields.map(a => a.name)).toEqual(['בחא 8 אווירי', 'בחא 8 קרקעי']);
  });

  it('כולל גם ערכי כשירות ישנים שיושבים בפועל - אחרת אי אפשר לסנן אותם', () => {
    expect(elementFilterOptions(ROWS).statuses).toContain('חלקי');
  });

  it('רשימה ריקה אינה מפילה', () => {
    const o = elementFilterOptions([]);
    expect(o.categories).toEqual([]);
    expect(o.airfields).toEqual([]);
  });
});

describe('filterElements', () => {
  it('בלי פילטרים - הכל עובר', () => {
    expect(filterElements(ROWS, EMPTY_ELEMENT_FILTERS)).toHaveLength(4);
  });

  it('חיפוש חופשי לפי שם, בלי תלות ברישיות ורווחים', () => {
    const out = filterElements(ROWS, { ...EMPTY_ELEMENT_FILTERS, search: '  stop bar ' });
    expect(out.map(r => r.id)).toEqual([4]);
  });

  it('חיפוש חופשי תופס גם קטגוריה וסוג', () => {
    expect(filterElements(ROWS, { ...EMPTY_ELEMENT_FILTERS, search: 'רמזור' }).map(r => r.id)).toEqual([3]);
  });

  it('סינון לפי כשירות', () => {
    expect(filterElements(ROWS, { ...EMPTY_ELEMENT_FILTERS, status: 'שמיש' }).map(r => r.id)).toEqual([1, 4]);
  });

  it('"שמיש" אינו תופס את "לא שמיש" - התאמה מדויקת ולא הכלה', () => {
    const out = filterElements(ROWS, { ...EMPTY_ELEMENT_FILTERS, status: 'שמיש' });
    expect(out.map(r => r.status)).not.toContain('לא שמיש');
  });

  it('סינון לפי שדה תעופה', () => {
    expect(filterElements(ROWS, { ...EMPTY_ELEMENT_FILTERS, airfieldId: 16 }).map(r => r.id)).toEqual([4]);
  });

  it('סינון לפי סטטוס תפעולי', () => {
    expect(filterElements(ROWS, { ...EMPTY_ELEMENT_FILTERS, displayState: 'blink' }).map(r => r.id)).toEqual([2, 3]);
  });

  it('סינון לפי מוצג על מפה', () => {
    expect(filterElements(ROWS, { ...EMPTY_ELEMENT_FILTERS, onMap: 'no' }).map(r => r.id)).toEqual([3]);
    expect(filterElements(ROWS, { ...EMPTY_ELEMENT_FILTERS, onMap: 'yes' }).map(r => r.id)).toEqual([1, 2, 4]);
  });

  it('פילטרים מצטברים (AND) ולא מחליפים זה את זה', () => {
    const out = filterElements(ROWS, { ...EMPTY_ELEMENT_FILTERS, category: 'מחסומים', status: 'שמיש' });
    expect(out.map(r => r.id)).toEqual([1]);
  });

  it('שילוב שאינו קיים מחזיר ריק, ולא את הכל', () => {
    expect(filterElements(ROWS, { ...EMPTY_ELEMENT_FILTERS, category: 'רמזורים', airfieldId: 16 })).toEqual([]);
  });
});

describe('sortElements', () => {
  it('לפי שם - עברית קודמת ללטינית, ושום שורה לא נעלמת', () => {
    const out = sortElements(ROWS, 'name', 'asc');
    expect(out.map(r => r.name)).toEqual(['מחסום כביש ראשי', 'מחסום ראשי', 'רמזור חציה 33', 'STOP BAR 33']);
    expect(out).toHaveLength(ROWS.length);
  });

  it('כיוון הפוך הופך את הסדר', () => {
    const asc = sortElements(ROWS, 'name', 'asc').map(r => r.id);
    const desc = sortElements(ROWS, 'name', 'desc').map(r => r.id);
    expect(desc).toEqual([...asc].reverse());
  });

  it('אינו משנה את המערך המקורי', () => {
    const before = ROWS.map(r => r.id);
    sortElements(ROWS, 'name', 'desc');
    expect(ROWS.map(r => r.id)).toEqual(before);
  });

  it('ערך חסר יורד לסוף ולא מפיל את המיון', () => {
    const withGap = [...ROWS, { id: 9, name: '', category: '', type_name: '', status: '', display_state: '', hidden_on_map: false, airfield_id: 7, airfield_name: '' }];
    const out = sortElements(withGap, 'status', 'asc');
    expect(out[out.length - 1].id).toBe(9);
  });
});
