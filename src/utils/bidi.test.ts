import { describe, it, expect } from 'vitest';
import { bidiAuto, FSI, PDI } from './bidi';

describe('bidiAuto', () => {
  it('עוטף שם שמתחיל בספרה ומכיל עברית (המקרה ששבר את תצוגת האזורים)', () => {
    expect(bidiAuto('61 צפון')).toBe(`${FSI}61 צפון${PDI}`);
  });
  it('עוטף גם שם באנגלית - הכיוון נקבע לפי האות החזקה הראשונה, לא נכפה', () => {
    expect(bidiAuto('61 North')).toBe(`${FSI}61 North${PDI}`);
  });
  it('מחרוזת ריקה נשארת ריקה (כדי ש-filter(Boolean) ימשיך לעבוד)', () => {
    expect(bidiAuto('')).toBe('');
  });
  it('null / undefined מחזירים מחרוזת ריקה', () => {
    expect(bidiAuto(null)).toBe('');
    expect(bidiAuto(undefined)).toBe('');
  });
  it('אידמפוטנטי - לא עוטף פעמיים', () => {
    const once = bidiAuto('61 צפון');
    expect(bidiAuto(once)).toBe(once);
  });
  it('לא משנה את הטקסט הנראה - רק מוסיף תווי בקרה בלתי נראים', () => {
    expect(bidiAuto('61 צפון').replace(/[⁨⁩]/g, '')).toBe('61 צפון');
  });
  it('שומר על רווחים בקצוות כפי שהוזנו', () => {
    expect(bidiAuto(' 61 ')).toBe(`${FSI} 61 ${PDI}`);
  });
});
