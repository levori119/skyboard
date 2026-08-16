import { describe, it, expect } from 'vitest';
import { faultAircraftIndices, formatFaultsText, formatFaultsHint, hasAnyFault, formatFaultNumbers, faultRedFor } from './faults';

// התקלה יושבת על **המטוס** (strip_aircraft), והפ"מ מציג את שרשור התקלות של
// מטוסיו: הטקסט אומר *למי* יש תקלה, וה-HINT אומר *מה* התקלה.

describe('faults - שרשור תקלות המטוסים לרמת הפ"מ', () => {
  it('פ"מ בלי תקלות - טקסט ריק, HINT ריק, אין תקלה', () => {
    expect(formatFaultsText([])).toBe('');
    expect(formatFaultsHint([])).toBe('');
    expect(hasAnyFault([])).toBe(false);
    expect(formatFaultsText(null)).toBe('');
    expect(formatFaultsText(undefined)).toBe('');
    expect(hasAnyFault(undefined)).toBe(false);
  });

  it('מטוס אחד בתקלה - "תקלה למספר X"', () => {
    expect(formatFaultsText([{ idx: 2, fault_type: 'מנוע', fault_details: 'רעש חריג' }])).toBe('תקלה למספר 2');
    expect(hasAnyFault([{ idx: 2 }])).toBe(true);
  });

  it('כמה מטוסים בתקלה - שרשור לפי מספר המטוס, גם כשהקלט לא ממוין', () => {
    const faults = [{ idx: 4 }, { idx: 2 }];
    expect(formatFaultsText(faults)).toBe('תקלה למספר 2, תקלה למספר 4');
    expect(faultAircraftIndices(faults)).toEqual([2, 4]);
  });

  it('HINT - שורה למטוס: המהות והפירוט', () => {
    const hint = formatFaultsHint([
      { idx: 2, fault_type: 'מנוע', fault_details: 'רעש חריג' },
      { idx: 3, fault_type: 'מכ"ם', fault_details: 'לא נועל' },
    ]);
    expect(hint).toBe('מספר 2: מנוע - רעש חריג\nמספר 3: מכ"ם - לא נועל');
  });

  it('HINT - מהות בלי פירוט, פירוט בלי מהות, ותקלה בלי שניהם', () => {
    expect(formatFaultsHint([{ idx: 1, fault_type: 'מנוע' }])).toBe('מספר 1: מנוע');
    expect(formatFaultsHint([{ idx: 1, fault_details: 'רעש חריג' }])).toBe('מספר 1: רעש חריג');
    expect(formatFaultsHint([{ idx: 1 }])).toBe('מספר 1: ללא פירוט');
    expect(formatFaultsHint([{ idx: 1, fault_type: '  ', fault_details: null }])).toBe('מספר 1: ללא פירוט');
  });

  it('שורות בלי מספר מטוס לא נספרות (נתון פגום לא שובר את הפ"מ)', () => {
    const faults = [{ idx: null as any }, { idx: 2 }];
    expect(formatFaultsText(faults)).toBe('תקלה למספר 2');
    expect(faultAircraftIndices(faults)).toEqual([2]);
  });
});

// התג (`FaultBadge`) יושב לצד האו"ק במפה, בטבלה, בנקודת המעבר, במוד האזרחי
// ובנקודת ההצטרפות - מקומות צרים שבהם רק המספר נכנס.
describe('formatFaultNumbers - תווית התג הקצר', () => {
  it('בלי תקלות - מחרוזת ריקה, כדי שהתג לא ירונדר בכלל', () => {
    expect(formatFaultNumbers([])).toBe('');
    expect(formatFaultNumbers(null)).toBe('');
    expect(formatFaultNumbers(undefined)).toBe('');
  });

  it('מטוס אחד - המספר בלבד', () => {
    expect(formatFaultNumbers([{ idx: 2, fault_type: 'מנוע' }])).toBe('2');
  });

  it('כמה מטוסים - ממוינים ומופרדים בפסיק, בלי רווח (התג צר)', () => {
    expect(formatFaultNumbers([{ idx: 4 }, { idx: 2 }])).toBe('2,4');
  });

  it('נתון פגום לא נספר', () => {
    expect(formatFaultNumbers([{ idx: undefined as any }, { idx: 3 }])).toBe('3');
  });
});

describe('faultRedFor - אדום סטטוס, לא צבע תמה', () => {
  it('גוון כהה לרקע בהיר ובהיר לרקע כהה - שני מקורות אמת היו יוצרים שני אדומים במסך אחד', () => {
    expect(faultRedFor(true)).toBe('#dc2626');
    expect(faultRedFor(false)).toBe('#f87171');
  });
});
