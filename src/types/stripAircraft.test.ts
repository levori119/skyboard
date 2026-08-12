import { describe, it, expect } from 'vitest';
import {
  STRIP_AIRCRAFT_COLUMNS, STRIP_AIRCRAFT_TABLE_KEY,
  toStripAircraftRow, toStripAircraftRows,
} from './stripAircraft';
import {
  STRIP_SUB_TABLES, getSubTable, isSubTableColumn, defaultSubTableColumns, subTableRows,
} from './subTables';

describe('טבלת המטוסים - נרמול שורה', () => {
  it('כל השדות מגיעים כמחרוזות, והתקלה כבוליאני', () => {
    const r = toStripAircraftRow({
      idx: 1, tail_number: '077', pilot_name: 'רון', navigator_name: 'דנה',
      sagol_1: '412', sagol_2: '518', datk: 3, kipa: '4',
      has_fault: true, fault_type: 'מנוע', fault_details: 'רעש חריג',
    });
    expect(r.idx).toBe('1');
    expect(r.tail_number).toBe('077');       // אפס מוביל שורד - השדה מחרוזת
    expect(r.datk).toBe('3');                // מספר ב-DB, מחרוזת בתצוגה
    expect(r.has_fault).toBe(true);
    expect(r.fault_type).toBe('מנוע');
  });

  it('שורה חלקית או ערך שאינו אובייקט - שדות ריקים ולא קריסה', () => {
    const r = toStripAircraftRow({ idx: 2 });
    expect(r.pilot_name).toBe('');
    expect(r.has_fault).toBe(false);
    expect(toStripAircraftRow(null).idx).toBe('');
  });

  it('חימושים ומערכות משוטחים לטקסט אחד - תא לא פורס טבלה שלישית', () => {
    const r = toStripAircraftRow({
      armaments: [{ name: 'פצצה', quantity: 2 }, { name: 'טיל', quantity: 1 }, { name: '  ' }],
      systems: [{ name: 'ראדאר', status: 'שמיש' }, { name: 'מכ"ם', status: 'לא שמיש' }],
    });
    expect(r.armaments).toBe('פצצה x2, טיל');           // כמות 1 אינה רעש על המסך
    expect(r.systems).toBe('ראדאר, מכ"ם (לא שמיש)');    // "שמיש" הוא הצפוי ולא מוצג
  });

  it('המערך ממוין לפי מספר המטוס, וערך שאינו מערך נקרא כריק', () => {
    const rows = toStripAircraftRows([{ idx: 3 }, { idx: 1 }, { idx: 2 }]);
    expect(rows.map(r => r.idx)).toEqual(['1', '2', '3']);
    expect(toStripAircraftRows(null)).toEqual([]);
    expect(toStripAircraftRows({})).toEqual([]);
  });
});

describe('טבלת המטוסים ברישום טבלאות הבן', () => {
  it('רשומה ברישום, ולכן מופיעה בתפריט "הוסף טבלה" של מוד הטבלה', () => {
    expect(STRIP_SUB_TABLES.map(t => t.key)).toContain(STRIP_AIRCRAFT_TABLE_KEY);
    const def = getSubTable(STRIP_AIRCRAFT_TABLE_KEY)!;
    expect(def).toBeTruthy();
    expect(def.stripField).toBe('aircraft');
    expect(def.columns).toHaveLength(STRIP_AIRCRAFT_COLUMNS.length);
    expect(isSubTableColumn({ isTable: true, tableKey: STRIP_AIRCRAFT_TABLE_KEY })).toBe(true);
  });

  it('כל עמודותיה לקריאה בלבד - שורה היא רשומת DB עם מפתח משלה', () => {
    const def = getSubTable(STRIP_AIRCRAFT_TABLE_KEY)!;
    expect(def.readOnly).toBe(true);
    for (const c of def.columns) expect(c.editableOptions).toEqual(['none']);
  });

  it('ברירת המחדל היא ארבע עמודות הזיהוי, ולא כל הטבלה', () => {
    const cols = defaultSubTableColumns(STRIP_AIRCRAFT_TABLE_KEY);
    expect(cols.map(c => c.key)).toEqual(['idx', 'tail_number', 'pilot_name', 'datk']);
  });

  it('subTableRows קורא את השורות מהשדה שעל הפ"מ, לכל טבלה בדרכה', () => {
    const def = getSubTable(STRIP_AIRCRAFT_TABLE_KEY)!;
    const strip = { aircraft: [{ idx: 1, tail_number: '812' }], targets: [{ name: 'אלפא' }] };
    expect(subTableRows(def, strip)).toHaveLength(1);
    expect(subTableRows(def, strip)[0].tail_number).toBe('812');
    // פ"מ בלי מטוסים - טבלה ריקה ולא קריסה
    expect(subTableRows(def, { targets: [] })).toEqual([]);
    // טבלת נקודות המכוון ממשיכה לקרוא מהשדה שלה
    expect(subTableRows(getSubTable('aim_points')!, strip)[0].name).toBe('אלפא');
  });

  it('לכל טבלה רשומה יש הודעת ריק משלה', () => {
    for (const t of STRIP_SUB_TABLES) expect(t.emptyKey).toMatch(/^[a-z]+\./);
  });
});
