import { describe, it, expect } from 'vitest';
import { stripNumId, parseStripTrash, serializeStripTrash, addToTrash, removeFromTrash, isTrashed, parseTrashPos, clampTrashPos } from './stripTrash';

describe('stripTrash - הסתרת פ"מ מהעמדה, תצוגתית', () => {
  it('מזהה פ"מ: s12 / 12 / "12" → 12; לא תקין → null', () => {
    expect(stripNumId('s12')).toBe(12);
    expect(stripNumId(12)).toBe(12);
    expect(stripNumId('x')).toBeNull();
    expect(stripNumId(null)).toBeNull();
  });
  it('הוספה והסרה - בלי כפילויות, אותה הפניה כשאין שינוי', () => {
    const a = addToTrash(new Set(), 's5');
    expect(isTrashed(a, 5)).toBe(true);
    expect(addToTrash(a, '5')).toBe(a);
    const b = removeFromTrash(a, 's5');
    expect(isTrashed(b, 5)).toBe(false);
    expect(removeFromTrash(b, 5)).toBe(b);
  });
  it('שמירה וטעינה; ערך שמור פגום - רשימה ריקה', () => {
    expect([...parseStripTrash(serializeStripTrash(new Set([9, 3])))]).toEqual([3, 9]);
    expect(parseStripTrash('{oops').size).toBe(0);
    expect(parseStripTrash(null).size).toBe(0);
    expect([...parseStripTrash('["s4", 4, "x"]')]).toEqual([4]);
  });
  it('מיקום הפח הצף: נטען רק כשתקין, ומוצמד לגבולות המסך', () => {
    expect(parseTrashPos('{"x":10,"y":20}')).toEqual({ x: 10, y: 20 });
    expect(parseTrashPos('{"x":"a"}')).toBeNull();
    expect(parseTrashPos('oops')).toBeNull();
    expect(parseTrashPos(null)).toBeNull();
    expect(clampTrashPos({ x: 1900, y: 1200 }, 1000, 800, 50)).toEqual({ x: 950, y: 750 });
    expect(clampTrashPos({ x: -5, y: -5 }, 1000, 800, 50)).toEqual({ x: 0, y: 0 });
    expect(clampTrashPos({ x: 300, y: 400 }, 1000, 800, 50)).toEqual({ x: 300, y: 400 });
  });
});
