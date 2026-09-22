import { describe, it, expect } from 'vitest';
import { tabularCandidateColumns, resolveTabularColumn } from './subTables';
import { AIM_POINTS_FIELD_KEY } from './aimPoints';
import { STRIP_AIRCRAFT_TABLE_KEY } from './stripAircraft';

// מוד טבלאי - איזו טבלת בן עולה לרמה ראשונה במקום הפ"מ.
// הבחירה נעשית בעמדה (תפריט תצוגה), ולכן היא חייבת לשרוד החלפת מוד טבלה,
// קונפיג ישן וטבלה שנמחקה - בלי להשאיר את הפקח מול לוח ריק.

const aimCol = { key: 'table:' + AIM_POINTS_FIELD_KEY, isTable: true, tableKey: AIM_POINTS_FIELD_KEY, label: 'נקודות מכוון' };
const acCol = { key: 'table:' + STRIP_AIRCRAFT_TABLE_KEY, isTable: true, tableKey: STRIP_AIRCRAFT_TABLE_KEY, label: 'מטוסים' };
const plainCol = { key: 'callSign', label: 'או"ק' };

describe('מוד טבלאי - מועמדות', () => {
  it('רק עמודות שהן טבלת בן רשומה', () => {
    expect(tabularCandidateColumns([plainCol, aimCol, acCol]).map(c => c.tableKey))
      .toEqual([AIM_POINTS_FIELD_KEY, STRIP_AIRCRAFT_TABLE_KEY]);
  });

  it('עמודה עם tableKey שאינו רשום אינה מועמדת', () => {
    expect(tabularCandidateColumns([{ isTable: true, tableKey: 'no_such_table' }])).toEqual([]);
  });

  it('עמודה עם tableKey אך בלי isTable אינה מועמדת', () => {
    expect(tabularCandidateColumns([{ tableKey: AIM_POINTS_FIELD_KEY }])).toEqual([]);
  });

  it('מוד בלי עמודות כלל - אין מועמדות ואין קריסה', () => {
    expect(tabularCandidateColumns(undefined)).toEqual([]);
    expect(tabularCandidateColumns(null)).toEqual([]);
    expect(tabularCandidateColumns([])).toEqual([]);
  });
});

describe('מוד טבלאי - הכרעת העמודה הפעילה', () => {
  it('מפתח נבחר שקיים במוד - מחזיר את העמודה', () => {
    expect(resolveTabularColumn([plainCol, aimCol], AIM_POINTS_FIELD_KEY)).toBe(aimCol);
  });

  it('אין בחירה - המוד כבוי', () => {
    expect(resolveTabularColumn([aimCol], null)).toBeNull();
    expect(resolveTabularColumn([aimCol], undefined)).toBeNull();
    expect(resolveTabularColumn([aimCol], '')).toBeNull();
  });

  it('הטבלה שנבחרה אינה במוד הטבלה הפעיל - נופל לתצוגת הפ"מים ולא ללוח ריק', () => {
    expect(resolveTabularColumn([aimCol], STRIP_AIRCRAFT_TABLE_KEY)).toBeNull();
  });

  it('הבחירה חוזרת לעצמה כשחוזרים למוד שיש בו את הטבלה', () => {
    expect(resolveTabularColumn([plainCol], AIM_POINTS_FIELD_KEY)).toBeNull();
    expect(resolveTabularColumn([plainCol, aimCol], AIM_POINTS_FIELD_KEY)).toBe(aimCol);
  });
});
