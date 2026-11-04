import { describe, it, expect } from 'vitest';
import {
  getFormationDisplayName,
  getTransferLabel,
  getTransferSq,
  normalizeAlt,
  parseAltToFeet,
  parseAltRange,
  altRangeGap,
  computeBlockDeviation,
  mergeStripsWithPending,
} from './strips';

describe('normalizeAlt', () => {
  it('strips FL prefix from a single value', () => {
    expect(normalizeAlt('FL340')).toBe('340');
    expect(normalizeAlt('fl270')).toBe('270');
    expect(normalizeAlt('270')).toBe('270');
  });
  it('normalizes ranges with/without FL and spaces', () => {
    expect(normalizeAlt('FL340-FL360')).toBe('340-360');
    expect(normalizeAlt('340 - 360')).toBe('340-360');
    expect(normalizeAlt('FL270 - 280')).toBe('270-280');
  });
  it('returns empty/unknown unchanged', () => {
    expect(normalizeAlt('')).toBe('');
    expect(normalizeAlt('BLOCK')).toBe('BLOCK');
  });
});

describe('parseAltToFeet', () => {
  it('parses FL notation to feet', () => {
    expect(parseAltToFeet('FL270')).toBe(27000);
    expect(parseAltToFeet('F270')).toBe(27000);
  });
  it('treats 3-digit numbers as flight levels (x100)', () => {
    expect(parseAltToFeet('270')).toBe(27000);
    expect(parseAltToFeet('100')).toBe(10000);
  });
  it('treats small/large plain numbers as raw feet', () => {
    expect(parseAltToFeet('50')).toBe(50);
    expect(parseAltToFeet('1000')).toBe(1000);
  });
  it('returns null for empty/garbage', () => {
    expect(parseAltToFeet('')).toBeNull();
    expect(parseAltToFeet('abc')).toBeNull();
  });
});

describe('parseAltRange', () => {
  it('parses a single altitude to [v,v]', () => {
    expect(parseAltRange('320')).toEqual([320, 320]);
    expect(parseAltRange('FL270')).toEqual([270, 270]);
  });
  it('parses a multi-altitude block to [lo,hi]', () => {
    expect(parseAltRange('320-395')).toEqual([320, 395]);
    expect(parseAltRange('200-275')).toEqual([200, 275]);
    expect(parseAltRange('FL340-FL360')).toEqual([340, 360]);
  });
  it('orders low→high regardless of input order', () => {
    expect(parseAltRange('395-320')).toEqual([320, 395]);
  });
  it('returns null for empty/garbage', () => {
    expect(parseAltRange('')).toBeNull();
    expect(parseAltRange('abc')).toBeNull();
    expect(parseAltRange(null)).toBeNull();
  });
});

describe('altRangeGap', () => {
  it('is 0 when ranges overlap (incl. identical)', () => {
    expect(altRangeGap([320, 395], [320, 320])).toBe(0); // the reported bug: block vs single
    expect(altRangeGap([320, 395], [350, 400])).toBe(0);
    expect(altRangeGap([300, 300], [300, 300])).toBe(0);
  });
  it('is the vertical gap (FL) between separated ranges', () => {
    expect(altRangeGap([320, 395], [200, 275])).toBe(45); // 320 - 275
    expect(altRangeGap([100, 100], [130, 130])).toBe(30);
  });
});

describe('getFormationDisplayName', () => {
  it('returns base callsign when no aircraft_indices', () => {
    expect(getFormationDisplayName({ callsign: 'חנית' })).toBe('חנית');
    expect(getFormationDisplayName({ callSign: 'BAZ' })).toBe('BAZ');
  });
  it('appends sorted indices joined with +', () => {
    expect(getFormationDisplayName({ callsign: 'חנית', aircraft_indices: [3, 1, 2] })).toBe('חנית/1+2+3');
    expect(getFormationDisplayName({ callsign: 'חנית', aircraft_indices: [1] })).toBe('חנית/1');
  });
  it('parses stringified indices', () => {
    expect(getFormationDisplayName({ callsign: 'חנית', aircraft_indices: '[2,1]' })).toBe('חנית/1+2');
  });
  it('handles null/empty safely', () => {
    expect(getFormationDisplayName(null)).toBe('');
    expect(getFormationDisplayName({ callsign: 'חנית', aircraft_indices: [] })).toBe('חנית');
  });
});

describe('getTransferLabel / getTransferSq', () => {
  it('builds label from callsign + count when no indices', () => {
    expect(getTransferLabel({ callsign: 'חנית', number_of_formation: '4' })).toBe('חנית/4');
    expect(getTransferLabel({ callsign: 'חנית' })).toBe('חנית');
  });
  it('builds label from indices when present', () => {
    expect(getTransferLabel({ callsign: 'חנית', aircraft_indices: [2, 1] })).toBe('חנית/1+2');
  });
  it('getTransferSq prefers sq then squadron', () => {
    expect(getTransferSq({ sq: '107' })).toBe('107');
    expect(getTransferSq({ squadron: '69' })).toBe('69');
    expect(getTransferSq({})).toBe('');
  });
});

describe('computeBlockDeviation', () => {
  const blocks = [
    { block_table_id: 1, alt_from: 200, alt_to: 300, workstations: [] },
  ];
  it('returns false when no active block table', () => {
    expect(computeBlockDeviation({ alt: '250', workstation_preset_id: 5 }, blocks, [], null, null)).toBe(false);
  });
  it('returns false when altitude is within a block', () => {
    expect(computeBlockDeviation({ alt: '250', workstation_preset_id: 5 }, blocks, [], 1, null)).toBe(false);
  });
  it('returns true when altitude is outside all applicable blocks', () => {
    expect(computeBlockDeviation({ alt: '350', workstation_preset_id: 5 }, blocks, [], 1, null)).toBe(true);
  });
  it('returns false when strip has no altitude', () => {
    expect(computeBlockDeviation({ workstation_preset_id: 5 }, blocks, [], 1, null)).toBe(false);
  });
});

// התקלה מהשטח (טבלת "בלוקים עזה", עמדה 26): רעם 330-360 ישב בבלוק 330-380
// שמוקצה לעמדה - וסומן כחורג, כי נמדד מול העמדה הרשומה על הפ"מ (2, שהיא גם
// יעד העברה). ובז 303-358 חצה לבלוק של עמדות אחרות - ולא סומן, כי נבדק רק
// הגובה הראשון בטווח.
describe('computeBlockDeviation - טווח גבהים ועמדה צופה', () => {
  const T = 9;
  const blocks = [
    { block_table_id: T, alt_from: 260, alt_to: 270, workstations: [26] },
    { block_table_id: T, alt_from: 280, alt_to: 310, workstations: [26] },
    { block_table_id: T, alt_from: 330, alt_to: 380, workstations: [21, 26] },
  ];
  it('פ"מ בתוך בלוק של העמדה הצופה - אין חריגה, גם אם רשום עליו עמדה אחרת', () => {
    expect(computeBlockDeviation({ alt: '330-360', workstation_preset_id: 2 }, blocks, [], T, 26)).toBe(false);
  });
  it('כמו בתקלה (שקד 290): בלוק שלא משויכת אליו אף עמדה אינו של העמדה - חריגה', () => {
    const real = [
      { block_table_id: T, alt_from: 280, alt_to: 310, workstations: {} },
      { block_table_id: T, alt_from: 330, alt_to: 380, workstations: [21, 26] },
      { block_table_id: T, alt_from: 120, alt_to: 240, workstations: [21, 26] },
    ];
    expect(computeBlockDeviation({ alt: '290' }, real, [], T, 26)).toBe(true);
    expect(computeBlockDeviation({ alt: '340' }, real, [], T, 26)).toBe(false);
  });
  it('כמו בתקלה (שקד 300 בבת"ק אריק): הבלוקים של העמדה מכל טבלה, לא של הטבלה המוצגת', () => {
    const real = [
      { block_table_id: 9, alt_from: 330, alt_to: 380, workstations: [21, 26] },
      { block_table_id: 9, alt_from: 120, alt_to: 240, workstations: [21, 26] },
      { block_table_id: 11, alt_from: 280, alt_to: 310, workstations: {} },
    ];
    expect(computeBlockDeviation({ alt: '300' }, real, [], 11, 26)).toBe(true);
    expect(computeBlockDeviation({ alt: '340' }, real, [], 11, 26)).toBe(false);
    // גם בלי טבלה פעילה בכלל
    expect(computeBlockDeviation({ alt: '300' }, real, [], null, 26)).toBe(true);
  });
  it('לעמדה אין אף בלוק משויך בטבלה - אין התראה', () => {
    expect(computeBlockDeviation({ alt: '290' }, [{ block_table_id: T, alt_from: 280, alt_to: 310, workstations: [] }], [], T, 26)).toBe(false);
  });
  it('טווח שיוצא מהבלוק לבלוק של עמדה אחרת - חריגה', () => {
    const b2 = [{ block_table_id: T, alt_from: 280, alt_to: 310, workstations: [2] }, { block_table_id: T, alt_from: 330, alt_to: 380, workstations: [21, 26] }];
    expect(computeBlockDeviation({ alt: '303-358', workstation_preset_id: 2 }, b2, [], T, 2)).toBe(true);
  });
  it('טווח שקצהו העליון מחוץ לכל בלוק - חריגה', () => {
    expect(computeBlockDeviation({ alt: '280-320' }, blocks, [], T, 26)).toBe(true);
  });
  it('טווח על פני שני בלוקים סמוכים של העמדה (רביעייה) - אין חריגה', () => {
    expect(computeBlockDeviation({ alt: '260-310' }, blocks, [], T, 26)).toBe(false);
  });
  it('בלי עמדה צופה - נמדד מול העמדה הרשומה על הפ"מ', () => {
    const b2 = [...blocks, { block_table_id: T, alt_from: 100, alt_to: 200, workstations: [2] }];
    expect(computeBlockDeviation({ alt: '340', workstation_preset_id: 2 }, b2, [], T, null)).toBe(true);
    expect(computeBlockDeviation({ alt: '340', workstation_preset_id: 26 }, blocks, [], T, null)).toBe(false);
  });
  it('כמו בתקלה (כד 303-358): קצוות בשני בלוקים של העמדה, אבל עובר בפער 320 - חריגה', () => {
    expect(computeBlockDeviation({ alt: '303-358' }, blocks, [], T, 26)).toBe(true);
  });
  it('בלי טבלה פעילה - הטבלה שהמרחב של הפ"מ הוא ממרחבי החלוקה שלה', () => {
    const tables = [{ id: T, split_space_ids: [7, 9] }, { id: 11, split_space_ids: [] }];
    expect(computeBlockDeviation({ alt: '303-358', block_space_id: 9 }, blocks, tables, null, 26)).toBe(true);
    expect(computeBlockDeviation({ alt: '330-360', block_space_id: 7 }, blocks, tables, null, 26)).toBe(false);
    // פ"מ בלי מרחב - העמדה משויכת לבלוקים, ולכן נמדד מולם גם בלי טבלה פעילה
    expect(computeBlockDeviation({ alt: '303-358' }, blocks, tables, null, 26)).toBe(true);
  });
});

// ─── מיזוג עדכון אופטימי מול הפולינג ─────────────────────────────────────────
// התקלה שהולידה את הבדיקה: לחיצה על כפתור החליפה ערך, ושתי שניות אחר כך
// הפולינג החזיר את הפ"מ מהשרת בלי הערך - ומהעמדה זה נראה כאילו "הכפתור לא
// מתקדם לערך הבא", כי כל לחיצה התחילה שוב מריק.
describe('mergeStripsWithPending', () => {
  const strip = (over: Record<string, unknown> = {}) => ({ id: 7, callSign: 'ELAL1', custom_fields: {}, ...over });

  it('ערך שנלחץ שורד רענון שהגיע לפניו מהשרת', () => {
    const pending = new Map<string | number, Record<string, any>>([[7, { custom_fields: { fld_3: 'ביקש' } }]]);
    const out = mergeStripsWithPending([strip()], pending);
    expect(out[0].custom_fields.fld_3).toBe('ביקש');
    expect(pending.has(7)).toBe(true); // עדיין ממתין - השרת טרם החזיר אותו
  });

  it('כשהשרת מחזיר את הערך, ההמתנה נגמרת', () => {
    const pending = new Map<string | number, Record<string, any>>([[7, { custom_fields: { fld_3: 'ביקש' } }]]);
    mergeStripsWithPending([strip({ custom_fields: { fld_3: 'ביקש' } })], pending);
    expect(pending.has(7)).toBe(false);
  });

  it('פקד שעמדה אחרת שינתה אינו נמחק על ידי ההמתנה שלי', () => {
    const pending = new Map<string | number, Record<string, any>>([[7, { custom_fields: { mine: 'א' } }]]);
    const out = mergeStripsWithPending([strip({ custom_fields: { other: 'ב' } })], pending);
    expect(out[0].custom_fields).toEqual({ other: 'ב', mine: 'א' });
  });

  it('לחיצה שנייה גוברת על הערך שהשרת עוד מחזיר', () => {
    const pending = new Map<string | number, Record<string, any>>([[7, { custom_fields: { fld_3: 'קיבל' } }]]);
    const out = mergeStripsWithPending([strip({ custom_fields: { fld_3: 'ביקש' } })], pending);
    expect(out[0].custom_fields.fld_3).toBe('קיבל');
    expect(pending.has(7)).toBe(true);
  });

  it('פ"מ בלי המתנה, ורשימה ריקה, עוברים כמו שהם', () => {
    const pending = new Map<string | number, Record<string, any>>();
    expect(mergeStripsWithPending([strip()], pending)[0].callSign).toBe('ELAL1');
    expect(mergeStripsWithPending([], pending)).toEqual([]);
  });
});
