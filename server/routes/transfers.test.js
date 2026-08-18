// קבלת פ"מ - הנתיב הקריטי במערכת, ועד כה בלי כיסוי.
// שלושה מסלולים מריצים את אותו קוד: קבלה ידנית, קבלה אוטומטית בנקודת מעבר
// (runAutoAcceptOnce) וקבלה-למפה. הבדיקות כאן נועלות את ההתנהגות המשותפת,
// ובראשה שהמיזוג רץ **פעם אחת** - הרגרסיה שמיזוג ענפים עלול להחזיר.
import { describe, it, expect } from 'vitest';
import { mergeWithSiblingIfAny, acceptTransferTx } from './transfers.js';

/** client מזויף: עונה לשלוש השאילתות שהקוד קורא, ומתעד כל קריאה. */
function makeClient({ incoming = null, sibling = null, transfer = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: text, params });
      if (text.includes('FROM strip_transfers WHERE id')) return { rows: transfer ? [transfer] : [] };
      if (text.includes('FROM strips WHERE parent_strip_id')) return { rows: sibling ? [sibling] : [] };
      if (text.includes('FROM strips WHERE id=$1')) return { rows: incoming ? [incoming] : [] };
      return { rows: [] };
    },
  };
}

const count = (client, needle) => client.calls.filter(c => c.sql.includes(needle)).length;
const find = (client, needle) => client.calls.find(c => c.sql.includes(needle));

const strip = (over = {}) => ({ id: 5, parent_strip_id: null, aircraft_indices: null, number_of_formation: '1', original_formation_count: null, notes: null, ...over });

describe('mergeWithSiblingIfAny', () => {
  it('פ"מ שאינו מפוצל - לא מחפש אח בכלל', async () => {
    const c = makeClient({ incoming: strip() });
    expect(await mergeWithSiblingIfAny(c, 5, 9)).toBeNull();
    expect(count(c, 'FROM strips WHERE parent_strip_id')).toBe(0);
  });

  it('פ"מ מפוצל בלי אח בעמדה המקבלת - לא ממזג ולא מוחק', async () => {
    const c = makeClient({ incoming: strip({ parent_strip_id: 1 }) });
    expect(await mergeWithSiblingIfAny(c, 5, 9)).toBeNull();
    expect(count(c, 'DELETE FROM strips')).toBe(0);
    expect(count(c, 'UPDATE strips SET number_of_formation')).toBe(0);
  });

  it('אח בעמדה - ממזג את המספרים, מוחק את הנכנס ומחזיר את המאוחד', async () => {
    const c = makeClient({
      incoming: strip({ id: 5, parent_strip_id: 1, aircraft_indices: '[3]', original_formation_count: 4, notes: 'ב' }),
      sibling: strip({ id: 7, parent_strip_id: 1, aircraft_indices: '[1,2]', original_formation_count: 4, notes: 'א' }),
    });
    expect(await mergeWithSiblingIfAny(c, 5, 9)).toEqual({ mergedIntoId: 's7', sibId: 7 });
    const upd = find(c, 'UPDATE strips SET number_of_formation');
    expect(upd.params[0]).toBe('3');              // מצבה מאוחדת
    expect(upd.params[1]).toBe('[1,2,3]');        // המספרים המקוריים נשמרים
    expect(upd.params[4]).toBe('א\n---\nב');      // ההערות של שני החלקים
    expect(upd.params[5]).toBe(7);                // נכתב על האח, לא על הנכנס
    expect(find(c, 'DELETE FROM strips').params).toEqual([5]);
  });

  it('מיזוג שמשלים את המצבה המקורית - הפ"מ חוזר להיות שלם', async () => {
    const c = makeClient({
      incoming: strip({ id: 5, parent_strip_id: 1, aircraft_indices: '[3]', original_formation_count: 3 }),
      sibling: strip({ id: 7, parent_strip_id: 1, aircraft_indices: '[1,2]', original_formation_count: 3 }),
    });
    await mergeWithSiblingIfAny(c, 5, 9);
    const upd = find(c, 'UPDATE strips SET number_of_formation');
    expect(upd.params[1]).toBeNull();  // aircraft_indices
    expect(upd.params[2]).toBeNull();  // original_formation_count
    expect(upd.params[3]).toBeNull();  // parent_strip_id - כבר לא חלק מפיצול
  });

  it('אין מצבה מקורית ידועה - נגזרת מכמות המטוסים', async () => {
    const c = makeClient({
      incoming: strip({ id: 5, parent_strip_id: 1, number_of_formation: '2' }),
      sibling: strip({ id: 7, parent_strip_id: 1, number_of_formation: '2' }),
    });
    await mergeWithSiblingIfAny(c, 5, 9);
    // שני הצדדים נגזרים ל-[1,2] ולכן האיחוד הוא [1,2] - לא [1,2,1,2]
    expect(find(c, 'UPDATE strips SET number_of_formation').params[0]).toBe('2');
  });
});

describe('acceptTransferTx', () => {
  const transfer = (over = {}) => ({ strip_id: 5, to_sector_id: 3, to_workstation_id: null, target_x: 10, target_y: 20, to_preset_id: null, ...over });

  it('העברה שאינה קיימת - notFound, בלי לגעת בשום סטריפ', async () => {
    const c = makeClient({});
    expect(await acceptTransferTx(c, 42, 9)).toEqual({ notFound: true, mergedIntoId: null });
    expect(count(c, 'UPDATE strips')).toBe(0);
    expect(count(c, 'UPDATE strip_transfers')).toBe(0);
  });

  it('קבלה רגילה - מעבירה את הסטריפ, מסמנת accepted ורושמת לטבלת העמדה', async () => {
    const c = makeClient({ transfer: transfer(), incoming: strip() });
    const r = await acceptTransferTx(c, 42, 9);
    expect(r).toEqual({ notFound: false, mergedIntoId: null });
    expect(find(c, 'UPDATE strips SET sector_id')).toBeTruthy();
    expect(find(c, 'UPDATE strip_transfers').params[0]).toBe('accepted');
    expect(count(c, 'INSERT INTO strip_table_assignments')).toBe(1);
  });

  it('קבלה למוד טבלה (to_preset_id) - הסטריפ נעשה active ולא נשלח לסקטור', async () => {
    const c = makeClient({ transfer: transfer({ to_preset_id: 9 }), incoming: strip() });
    await acceptTransferTx(c, 42, null);
    expect(find(c, 'UPDATE strips SET status=$1, workstation_preset_id')).toBeTruthy();
    expect(count(c, 'UPDATE strips SET sector_id')).toBe(0);
  });

  it('קבלה שממזגת אח - לא מזיזה את הנכנס (הוא נמחק) ולא רושמת אותו לטבלה', async () => {
    const c = makeClient({
      transfer: transfer(),
      incoming: strip({ id: 5, parent_strip_id: 1, aircraft_indices: '[3]', original_formation_count: 4 }),
      sibling: strip({ id: 7, parent_strip_id: 1, aircraft_indices: '[1,2]', original_formation_count: 4 }),
    });
    const r = await acceptTransferTx(c, 42, 9);
    expect(r.mergedIntoId).toBe('s7');
    expect(count(c, 'UPDATE strips SET sector_id')).toBe(0);
    expect(count(c, 'INSERT INTO strip_table_assignments')).toBe(0);
    expect(find(c, 'UPDATE strip_transfers').params[0]).toBe('accepted');
  });

  // רגרסיה: מיזוג ענפים שמשאיר את לוגיקת הקבלה גם inline וגם בפונקציה המשותפת
  // היה מריץ את המיזוג פעמיים - מוחק סטריפ שכבר נמחק ומכפיל את המספרים.
  it('המיזוג רץ בדיוק פעם אחת בקבלה', async () => {
    const c = makeClient({
      transfer: transfer(),
      incoming: strip({ id: 5, parent_strip_id: 1, aircraft_indices: '[3]', original_formation_count: 4 }),
      sibling: strip({ id: 7, parent_strip_id: 1, aircraft_indices: '[1,2]', original_formation_count: 4 }),
    });
    await acceptTransferTx(c, 42, 9);
    expect(count(c, 'DELETE FROM strips')).toBe(1);
    expect(count(c, 'UPDATE strips SET number_of_formation')).toBe(1);
    expect(count(c, 'UPDATE strip_transfers')).toBe(1);
  });
});
