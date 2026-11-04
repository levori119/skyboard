import { describe, it, expect } from 'vitest';
import {
  recommendAltitude, blocksNeeded, parseAltHundreds, matchRule, stripArmaments, normalizeAltRules,
  type RecBlock, stationRecBlocks, assignedAltitude } from './altRecommend';

// שישה בלוקים של 2000 רגל: 40-60, 60-80 ... 140-160
const B: RecBlock[] = [40, 60, 80, 100, 120, 140].map((f, i) => ({ id: i + 1, alt_from: f, alt_to: f + 20 }));
const base = { blocks: B, formation: 2, armaments: [] as string[], others: [] as { id: string; label: string; alt: string }[] };

describe('parseAltHundreds', () => {
  it('מאות רגל, FL, טווח ורגל מלאה', () => {
    expect(parseAltHundreds('120')).toEqual({ lo: 120, hi: 120 });
    expect(parseAltHundreds('FL120')).toEqual({ lo: 120, hi: 120 });
    expect(parseAltHundreds('140-100')).toEqual({ lo: 100, hi: 140 });
    expect(parseAltHundreds('12000')).toEqual({ lo: 120, hi: 120 });
    expect(parseAltHundreds('')).toBeNull();
    expect(parseAltHundreds('נמוך')).toBeNull();
  });
});

describe('blocksNeeded - בלוק לכל זוג מרביעייה', () => {
  it('1-3 = בלוק אחד, 4 = שניים, 6 = שלושה', () => {
    expect([1, 2, 3, 4, 5, 6, 0].map(blocksNeeded)).toEqual([1, 1, 1, 2, 3, 3, 1]);
  });
});

describe('recommendAltitude', () => {
  it('בלי חוק ובלי גובה - הבלוק הפנוי הנמוך', () => {
    const r = recommendAltitude({ ...base, others: [{ id: 'a', label: 'רעם', alt: '50' }] });
    expect(r.blockIds).toEqual([2]);
    expect(r.alt).toBe('60-80');
    expect(r.reason).toBe('lowest');
    expect(r.occupants[1]).toEqual(['רעם']);
  });

  it('רביעייה מקבלת 2 בלוקים סמוכים ופנויים', () => {
    const r = recommendAltitude({ ...base, formation: 4, others: [{ id: 'a', label: 'רעם', alt: '70' }] });
    expect(r.needed).toBe(2);
    expect(r.blockIds).toEqual([3, 4]); // 1 פנוי לבד, 2 תפוס - הרצף הראשון הוא 3+4
    expect(r.alt).toBe('80-120');
    expect(r.move).toBeUndefined();
  });

  it('חוק חימוש "גבוה" - השליש העליון', () => {
    const rules = [{ armament: 'ברד כבד 84', kind: 'band' as const, band: 'high' as const }];
    const r = recommendAltitude({ ...base, armaments: ['ברד כבד 84'], rules });
    expect(r.reason).toBe('rule');
    expect(r.blockIds).toEqual([5]); // השליש העליון = בלוקים 5-6, הנמוך שבו
  });

  it('חוק חימוש בגובה פיזי - הבלוק שמכיל אותו', () => {
    const rules = [{ armament: 'קבי"ר', kind: 'alt' as const, alt_ft: 11000 }];
    expect(recommendAltitude({ ...base, armaments: ['קבי"ר'], rules }).blockIds).toEqual([4]);
  });

  it('חוק בטווח גבהים - בלוק בתוך הטווח, ואם הוא תפוס - הקרוב', () => {
    const rules = [{ armament: 'חד', kind: 'range' as const, min_ft: 8000, max_ft: 10000 }];
    expect(recommendAltitude({ ...base, armaments: ['חד'], rules }).blockIds).toEqual([3]);
    const r = recommendAltitude({ ...base, armaments: ['חד'], rules, others: [{ id: 'x', label: 'בז', alt: '90' }] });
    expect(r.blockIds).not.toContain(3);
    expect([2, 4]).toContain(r.blockIds[0]);
  });

  it('חוק שאינו תואם את החימוש - לא משפיע', () => {
    const rules = [{ armament: 'מהיר', kind: 'band' as const, band: 'high' as const }];
    expect(recommendAltitude({ ...base, armaments: ['חד'], rules }).reason).toBe('lowest');
  });

  it('בלי חוק - קרוב לגובה הנוכחי של הפ"מ', () => {
    const r = recommendAltitude({ ...base, currentAlt: '125' });
    expect(r.reason).toBe('nearest');
    expect(r.blockIds).toEqual([5]);
  });

  it('אין רצף פנוי לרביעייה - ממליץ להטפיס/להנמיך פ"מ אחד כדי לפנות', () => {
    // 1 פנוי, 2 תפוס, 3 פנוי, 4 תפוס, 5 פנוי, 6 תפוס - אין שני פנויים סמוכים
    const others = [
      { id: 'a', label: 'רעם', alt: '70' }, { id: 'b', label: 'בז', alt: '110' }, { id: 'c', label: 'חץ', alt: '150' },
    ];
    const r = recommendAltitude({ ...base, formation: 4, others });
    expect(r.blockIds).toHaveLength(2);
    expect(r.move).toBeDefined();
    const win = new Set(r.blockIds);
    // הבלוק שאליו מזיזים פנוי ומחוץ לחלון, והפ"מ המוזז יושב בתוך החלון
    expect(win.has(r.move!.toBlockId)).toBe(false);
    expect(win.has(r.move!.fromBlockId)).toBe(true);
    expect(r.move!.direction).toMatch(/climb|descend/);
  });

  it('הגובה החדש של הפ"מ המוזז שומר על מיקומו היחסי בבלוק', () => {
    const blocks = B.slice(0, 3); // 40-60, 60-80, 80-100
    const r = recommendAltitude({ ...base, blocks, formation: 4, others: [{ id: 'a', label: 'רעם', alt: '65' }] });
    // החלון היחיד הפנוי-אחרי-הזזה: 1+2 (רעם עולה ל-3) או 2+3 (רעם יורד ל-1)
    expect(r.move).toBeDefined();
    expect(['45', '85']).toContain(r.move!.newAlt);
  });

  it('כל הבלוקים תפוסים - אין המלצה, ואין הזזה שיכולה לעזור', () => {
    const others = B.map((b, i) => ({ id: String(i), label: `פ${i}`, alt: String(b.alt_from + 5) }));
    const r = recommendAltitude({ ...base, others });
    expect(r.blockIds).toEqual([]);
    expect(r.reason).toBe('none');
  });

  it('פחות בלוקים מהנדרש - אין המלצה', () => {
    expect(recommendAltitude({ ...base, blocks: [B[0]], formation: 4 }).blockIds).toEqual([]);
  });
});

describe('matchRule / stripArmaments / normalizeAltRules', () => {
  it('החוק הראשון שתואם גובר', () => {
    const rules = [{ armament: 'חד', kind: 'band' as const, band: 'low' as const }, { armament: 'מהיר', kind: 'band' as const, band: 'high' as const }];
    expect(matchRule(['מהיר', 'חד'], rules)?.band).toBe('low');
    expect(matchRule([], rules)).toBeUndefined();
  });

  it('חימושים מטבלת המטוסים, מנקודות המכוון ומ-weapons - בלי כפילויות', () => {
    const s = {
      aircraft: [{ armaments: [{ name: 'ברד כבד 84', quantity: 2 }] }, { armaments: [{ name: 'ברד כבד 84' }] }],
      targets: [{ armament: 'קבי"ר' }, { armament: '' }],
      weapons: [{ name: 'חד' }],
    };
    expect(stripArmaments(s).sort()).toEqual(['ברד כבד 84', 'חד', 'קבי"ר'].sort());
    expect(stripArmaments(null)).toEqual([]);
  });

  it('חוק בלי חימוש או בלי ערך נזרק', () => {
    expect(normalizeAltRules([
      { armament: 'חד', kind: 'band', band: 'mid' },
      { armament: '', kind: 'band', band: 'mid' },
      { armament: 'מהיר', kind: 'alt', alt_ft: '' },
      { armament: 'מהיר', kind: 'range', min_ft: '5000', max_ft: '' },
      { armament: 'x', kind: 'band', band: 'xx' },
    ])).toEqual([
      { armament: 'חד', kind: 'band', band: 'mid' },
      { armament: 'מהיר', kind: 'range', min_ft: 5000, max_ft: null },
    ]);
    expect(normalizeAltRules('x')).toEqual([]);
  });
});

describe('stationRecBlocks - רק בלוקים שהעמדה רשאית להמליץ עליהם', () => {
  const blocks = [
    { id: 1, block_table_id: 9, alt_from: 330, alt_to: 380, workstations: [21, 26] },
    { id: 2, block_table_id: 9, alt_from: 280, alt_to: 310, workstations: {} },
    { id: 3, block_table_id: 9, alt_from: 210, alt_to: 250, workstations: [5] },
    { id: 4, block_table_id: 4, alt_from: 60, alt_to: 100, workstations: [26] },
    { id: 5, block_table_id: 4, alt_from: 0, alt_to: 50, workstations: [] },
  ];
  it('לעמדה יש בלוקים משויכים - רק הם; בלוק בלי עמדות ובלוק של אחרת יוצאים', () => {
    expect(stationRecBlocks(blocks, [9], 26).map(b => b.id)).toEqual([1, 4]);
  });
  it('הבלוקים של העמדה מכל טבלה, גם כשמוצגת טבלה אחרת', () => {
    expect(stationRecBlocks(blocks, [9, 4], 26, 4).map(b => b.id)).toEqual([1, 4]);
  });
  it('עמדה בלי בלוקים משויכים - טבלה פעילה מצמצמת לטבלה אחת', () => {
    expect(stationRecBlocks(blocks, [9, 4], 99, 4).map(b => b.id)).toEqual([5]);
  });
  it('לעמדה אין אף בלוק משויך - הבלוקים שלא שויכו לאף עמדה', () => {
    expect(stationRecBlocks(blocks, [9, 4], 99).map(b => b.id)).toEqual([2, 5]);
  });
});

describe('assignedAltitude - הגובה בהקצאה, לא כל הבלוק', () => {
  it('זוג - גובה אחד (תחתית הבלוק)', () => {
    expect(assignedAltitude(210, 250, 2)).toBe('210');
    expect(assignedAltitude(210, 250, 1)).toBe('210');
  });
  it('רביעייה - שני גבהים בהפרדה של 1000 רגל', () => {
    expect(assignedAltitude(210, 250, 4, 240)).toBe('240-250');
    expect(assignedAltitude(210, 250, 4)).toBe('210-220');
  });
  it('שלישייה - זוג ובודד: שני גבהים', () => {
    expect(assignedAltitude(340, 390, 3)).toBe('340-350');
  });
  it('הבחירה נשמרת בתוך הטווח - הזוג העליון לא חורג', () => {
    expect(assignedAltitude(210, 250, 4, 250)).toBe('240-250');
    expect(assignedAltitude(210, 250, 2, 100)).toBe('210');
  });
});
