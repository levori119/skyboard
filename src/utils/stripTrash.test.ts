import { describe, it, expect } from 'vitest';
import { stripNumId, parseStripTrash, serializeStripTrash, addToTrash, removeFromTrash, isTrashed } from './stripTrash';

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
});
