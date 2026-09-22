// איחוד שורות היומן — הלב הלוגי של הסנכרון, ולכן נבדק כיחידה טהורה.
import { describe, it, expect } from 'vitest';
import { coalesceJournal, rowKey } from './coalesce.js';

const entry = (id, op, pk, before, after, table = 'strips') => ({
  id, op, pk, before, after, table_schema: 'public', table_name: table,
});

describe('coalesceJournal', () => {
  it('שינוי יחיד - עובר כמו שהוא, והגרסה הבסיסית נלקחת מ-before', () => {
    const [op] = coalesceJournal([
      entry(1, 'U', { id: 5 }, { id: 5, alt: '100', rev: 7 }, { id: 5, alt: '200', rev: 8 }),
    ]);
    expect(op).toMatchObject({ op: 'U', baseRev: 7, journalIds: [1] });
    expect(op.row).toEqual({ id: 5, alt: '200', rev: 8 });
  });

  it('שני עדכונים לאותה שורה - פעולה אחת, הגרסה הבסיסית של הראשון', () => {
    const ops = coalesceJournal([
      entry(1, 'U', { id: 5 }, { id: 5, alt: '100', rev: 7 }, { id: 5, alt: '200', rev: 8 }),
      entry(2, 'U', { id: 5 }, { id: 5, alt: '200', rev: 8 }, { id: 5, alt: '300', rev: 9 }),
    ]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'U', baseRev: 7, journalIds: [1, 2] });
    expect(ops[0].row.alt).toBe('300');
  });

  it('נוצרה ואז עודכנה - הכנסה אחת עם הערך האחרון', () => {
    const ops = coalesceJournal([
      entry(1, 'I', { id: 1500000001 }, null, { id: 1500000001, callsign: 'ABC', rev: 0 }),
      entry(2, 'U', { id: 1500000001 }, { id: 1500000001, callsign: 'ABC', rev: 0 }, { id: 1500000001, callsign: 'XYZ', rev: 1 }),
    ]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'I', baseRev: null });
    expect(ops[0].row.callsign).toBe('XYZ');
  });

  it('נוצרה ונמחקה באותו נתק - לא נדחף דבר, אבל השורות מאושרות', () => {
    const ops = coalesceJournal([
      entry(1, 'I', { id: 1500000001 }, null, { id: 1500000001, rev: 0 }),
      entry(2, 'D', { id: 1500000001 }, { id: 1500000001, rev: 0 }, null),
    ]);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBeNull();
    expect(ops[0].journalIds).toEqual([1, 2]);
  });

  it('עודכנה ואז נמחקה - מחיקה עם הגרסה הבסיסית המקורית', () => {
    const ops = coalesceJournal([
      entry(1, 'U', { id: 5 }, { id: 5, rev: 3 }, { id: 5, rev: 4 }),
      entry(2, 'D', { id: 5 }, { id: 5, rev: 4 }, null),
    ]);
    expect(ops[0]).toMatchObject({ op: 'D', baseRev: 3 });
  });

  it('נמחקה ונוצרה מחדש באותו מפתח - כתיבה על השורה הקיימת', () => {
    const ops = coalesceJournal([
      entry(1, 'D', { id: 'a' }, { id: 'a', rev: 2 }, null, 'strip_transfers'),
      entry(2, 'I', { id: 'a' }, null, { id: 'a', rev: 0 }, 'strip_transfers'),
    ]);
    expect(ops[0]).toMatchObject({ op: 'U', baseRev: 2 });
  });

  it('שורות שונות - סדר ההופעה הראשונה נשמר', () => {
    const ops = coalesceJournal([
      entry(1, 'U', { id: 9 }, { id: 9, rev: 1 }, { id: 9, rev: 2 }),
      entry(2, 'U', { id: 4 }, { id: 4, rev: 1 }, { id: 4, rev: 2 }),
      entry(3, 'U', { id: 9 }, { id: 9, rev: 2 }, { id: 9, rev: 3 }),
    ]);
    expect(ops.map(o => o.pk.id)).toEqual([9, 4]);
  });

  it('הכנסות קודמות לתלויות בהן - פ"מ לפני ההעברה שמצביעה אליו', () => {
    const ops = coalesceJournal([
      entry(1, 'I', { id: 'tr' }, null, { id: 'tr', strip_id: 1500000001, rev: 0 }, 'strip_transfers'),
      entry(2, 'I', { id: 1500000001 }, null, { id: 1500000001, rev: 0 }, 'strips'),
    ]);
    expect(ops.map(o => o.table_name)).toEqual(['strips', 'strip_transfers']);
  });

  it('מחיקות אחרי ההכנסות - הבן נמחק לפני האב', () => {
    const ops = coalesceJournal([
      entry(1, 'D', { id: 5 }, { id: 5, rev: 1 }, null, 'strips'),
      entry(2, 'D', { id: 'tr' }, { id: 'tr', rev: 1 }, null, 'strip_transfers'),
    ]);
    expect(ops.map(o => o.table_name)).toEqual(['strip_transfers', 'strips']);
  });

  it('מפתח מורכב - מזוהה כשורה אחת בלי תלות בסדר המפתחות', () => {
    const k1 = rowKey({ table_schema: 'public', table_name: 't', pk: { a: 1, b: 2 } });
    const k2 = rowKey({ table_schema: 'public', table_name: 't', pk: { b: 2, a: 1 } });
    expect(k1).toBe(k2);
  });

  it('גרסה בסיסית חסרה (טבלה בלי rev) - null ולא NaN', () => {
    const ops = coalesceJournal([entry(1, 'U', { id: 1 }, { id: 1 }, { id: 1, x: 2 })]);
    expect(ops[0].baseRev).toBeNull();
  });
});

describe('localAt - הזמן שמכריע בסנכרון', () => {
  it('נלקח מהשינוי האחרון לאותה שורה', () => {
    const [op] = coalesceJournal([
      { id: 1, op: 'U', pk: { id: 5 }, table_schema: 'public', table_name: 'strips',
        before: { id: 5, rev: 1, updated_at: '2026-09-22T10:00:00Z' },
        after: { id: 5, rev: 2, updated_at: '2026-09-22T10:01:00Z' } },
      { id: 2, op: 'U', pk: { id: 5 }, table_schema: 'public', table_name: 'strips',
        before: { id: 5, rev: 2, updated_at: '2026-09-22T10:01:00Z' },
        after: { id: 5, rev: 3, updated_at: '2026-09-22T10:09:00Z' } },
    ]);
    // הראשון קובע את הגרסה הבסיסית, האחרון את הזמן - שני דברים שונים
    expect(op.baseRev).toBe(1);
    expect(op.localAt).toBe('2026-09-22T10:09:00Z');
  });

  it('במחיקה נלקח מה-before, כי אין after', () => {
    const [op] = coalesceJournal([
      { id: 1, op: 'D', pk: { id: 5 }, table_schema: 'public', table_name: 'strips',
        before: { id: 5, rev: 4, updated_at: '2026-09-22T10:00:00Z' }, after: null },
    ]);
    expect(op.localAt).toBe('2026-09-22T10:00:00Z');
  });

  it('טבלה בלי updated_at - נופל לזמן הרישום ביומן', () => {
    const [op] = coalesceJournal([
      { id: 1, at: '2026-09-22T10:02:00Z', op: 'U', pk: { id: 5 },
        table_schema: 'public', table_name: 'strips',
        before: { id: 5 }, after: { id: 5, x: 1 } },
    ]);
    expect(op.localAt).toBe('2026-09-22T10:02:00Z');
  });
});
