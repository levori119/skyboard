import { describe, it, expect } from 'vitest';
import {
  recommendAltitude, blocksNeeded, parseAltHundreds, matchRule, stripArmaments, normalizeAltRules,
  type RecBlock, stationRecBlocks, assignedAltitude, freeStart, tooCloseTo } from './altRecommend';

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
  it('בלי חוק ובלי גובה - הגובה הפנוי הנמוך, גם בבלוק שיש בו פ"מ (1000 רגל ממנו)', () => {
    const r = recommendAltitude({ ...base, others: [{ id: 'a', label: 'רעם', alt: '50' }] });
    expect(r.blockIds).toEqual([1]);
    expect(r.alt).toBe('40');
    expect(r.start).toBe(40);
    expect(r.reason).toBe('lowest');
    expect(r.occupants[1]).toEqual(['רעם']);
    expect(r.full[1]).toBe(false);
  });

  it('המקרה מהשטח: שני בלוקים, פ"מ בכל אחד - יש גובה פנוי, לא "אין בלוקים פנויים"', () => {
    const blocks: RecBlock[] = [{ id: 1, alt_from: 340, alt_to: 390 }, { id: 2, alt_from: 210, alt_to: 250 }];
    const others = [{ id: 'a', label: 'ברק', alt: '340' }, { id: 'b', label: 'נשר', alt: '210' }];
    const r = recommendAltitude({ ...base, blocks, others });
    expect(r.blockIds).toEqual([2]);
    expect(r.alt).toBe('220');
    expect(r.move).toBeUndefined();
  });

  it('פחות מ-1000 רגל מפ"מ אחר אינו פנוי - עולים לגובה המופרד', () => {
    const blocks: RecBlock[] = [{ id: 1, alt_from: 210, alt_to: 250 }];
    const r = recommendAltitude({ ...base, blocks, others: [{ id: 'a', label: 'נשר', alt: '215' }] });
    expect(r.alt).toBe('225');
  });

  it('ההפרדה נבדקת גם מול פ"מ בבלוק סמוך', () => {
    const blocks: RecBlock[] = [{ id: 2, alt_from: 60, alt_to: 80 }];
    const r = recommendAltitude({ ...base, blocks, others: [{ id: 'a', label: 'רעם', alt: '55' }] });
    expect(r.alt).toBe('65');
  });

  it('רביעייה מקבלת 2 בלוקים סמוכים ושני גבהים מופרדים', () => {
    const r = recommendAltitude({ ...base, formation: 4, others: [{ id: 'a', label: 'רעם', alt: '70' }] });
    expect(r.needed).toBe(2);
    expect(r.blockIds).toEqual([1, 2]);
    expect(r.alt).toBe('40-50');
    expect(r.move).toBeUndefined();
  });

  it('חוק חימוש "גבוה" - השליש העליון', () => {
    const rules = [{ armament: 'ברד כבד 84', kind: 'band' as const, band: 'high' as const }];
    const r = recommendAltitude({ ...base, armaments: ['ברד כבד 84'], rules });
    expect(r.reason).toBe('rule');
    expect(r.blockIds).toEqual([5]); // השליש העליון = בלוקים 5-6, הנמוך שבו
  });

  it('חוק חימוש בגובה פיזי - הבלוק שמכיל אותו, ובגובה החוק', () => {
    const rules = [{ armament: 'קבי"ר', kind: 'alt' as const, alt_ft: 11000 }];
    const r = recommendAltitude({ ...base, armaments: ['קבי"ר'], rules });
    expect(r.blockIds).toEqual([4]);
    expect(r.alt).toBe('110');
  });

  it('חוק בטווח גבהים - בלוק בתוך הטווח, גם כשיש בו פ"מ ונשאר גובה פנוי', () => {
    const rules = [{ armament: 'חד', kind: 'range' as const, min_ft: 8000, max_ft: 10000 }];
    expect(recommendAltitude({ ...base, armaments: ['חד'], rules }).blockIds).toEqual([3]);
    const r = recommendAltitude({ ...base, armaments: ['חד'], rules, others: [{ id: 'x', label: 'בז', alt: '90' }] });
    expect(r.blockIds).toEqual([3]);
    expect(['80', '100']).toContain(r.alt);
  });

  it('חוק שאינו תואם את החימוש - לא משפיע', () => {
    const rules = [{ armament: 'מהיר', kind: 'band' as const, band: 'high' as const }];
    expect(recommendAltitude({ ...base, armaments: ['חד'], rules }).reason).toBe('lowest');
  });

  it('בלי חוק - קרוב לגובה הנוכחי של הפ"מ', () => {
    const r = recommendAltitude({ ...base, currentAlt: '125' });
    expect(r.reason).toBe('nearest');
    expect(r.blockIds).toEqual([5]);
    expect(r.alt).toBe('125');
  });

  it('אין גובה פנוי לרביעייה - ממליץ להטפיס/להנמיך פ"מ אחד, ושומר על מיקומו היחסי בבלוק', () => {
    // בלוקים של 1000 רגל: 40-50, 50-60, 60-70, 70-80. רעם ב-55 ובז ב-75 - אין רווח
    // של 2000 רגל לשני גבהי הרביעייה
    const blocks: RecBlock[] = [40, 50, 60, 70].map((f, i) => ({ id: i + 1, alt_from: f, alt_to: f + 10 }));
    const others = [{ id: 'a', label: 'רעם', alt: '55' }, { id: 'b', label: 'בז', alt: '75' }];
    const r = recommendAltitude({ ...base, blocks, formation: 4, others });
    expect(r.move).toBeDefined();
    const win = new Set(r.blockIds);
    expect(win.has(r.move!.toBlockId)).toBe(false);
    expect(win.has(r.move!.fromBlockId)).toBe(true);
    expect(r.move!.label).toBe('רעם');
    expect(r.move!.newAlt).toBe('65');
    expect(r.move!.direction).toBe('climb');
    expect(r.alt).toBe('40-50');
  });

  it('כל הבלוקים מלאים - אין המלצה, ואין הזזה שיכולה לעזור', () => {
    const others = B.map((b, i) => ({ id: String(i), label: `פ${i}`, alt: `${b.alt_from}-${b.alt_to}` }));
    const r = recommendAltitude({ ...base, others });
    expect(r.blockIds).toEqual([]);
    expect(r.reason).toBe('none');
    expect(r.full[1]).toBe(true);
  });

  it('פחות בלוקים מהנדרש - אין המלצה', () => {
    expect(recommendAltitude({ ...base, blocks: [B[0]], formation: 4 }).blockIds).toEqual([]);
  });
});

describe('freeStart / tooCloseTo', () => {
  it('הנמוך הפנוי, הקרוב למבוקש, ו-null כשאין', () => {
    expect(freeStart(340, 390, 2, [{ lo: 340, hi: 340 }])).toBe(350);
    expect(freeStart(340, 390, 2, [{ lo: 340, hi: 340 }], 372)).toBe(372);
    expect(freeStart(340, 390, 4, [{ lo: 350, hi: 350 }])).toBe(360); // 360-370
    expect(freeStart(340, 350, 2, [{ lo: 345, hi: 345 }])).toBeNull();
  });

  it('מי קרוב פחות מ-1000 רגל לגובה שנבחר', () => {
    const taken = [{ lo: 340, hi: 340, label: 'ברק' }, { lo: 210, hi: 210, label: 'נשר' }];
    expect(tooCloseTo('345', taken)).toEqual(['ברק']);
    expect(tooCloseTo('350', taken)).toEqual([]);
    expect(tooCloseTo('200-210', taken)).toEqual(['נשר']);
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

// ── עדיפות חימושים: טבלת עדיפויות גבהים ליציאה לתקיפה (kind: 'priority') ──
describe('recommendAltitude - עדיפות גבהים לחימוש', () => {
  const pr = (alts_ft: number[]) => [{ armament: 'ברד כבד 84', kind: 'priority' as const, alts_ft }];
  const arm = ['ברד כבד 84'];

  it('העדיפות הראשונה בבלוק שלי ופנויה - בדיוק בה', () => {
    const r = recommendAltitude({ ...base, armaments: arm, rules: pr([13000, 9000]) });
    expect(r.blockIds).toEqual([5]);
    expect(r.alt).toBe('130');
    expect(r.reason).toBe('rule');
    expect(r.ruleAlt).toBe(13000);
    expect(r.outOfBlocks).toBeFalsy();
  });

  it('העדיפות הראשונה תפוסה - השנייה, גם כשיש גובה פנוי ליד הראשונה', () => {
    const others = [{ id: 'a', label: 'רעם', alt: '130' }];
    const r = recommendAltitude({ ...base, armaments: arm, rules: pr([13000, 9000]), others });
    expect(r.alt).toBe('90');
    expect(r.blockIds).toEqual([3]);
    expect(r.ruleAlt).toBe(9000);
  });

  it('אף עדיפות לא פנויה בדיוק - הגובה הפנוי הקרוב לעדיפות הראשונה שבבלוקים שלי', () => {
    const others = [{ id: 'a', label: 'רעם', alt: '130' }, { id: 'b', label: 'ברק', alt: '90' }];
    const r = recommendAltitude({ ...base, armaments: arm, rules: pr([13000, 9000]), others });
    expect(r.blockIds).toEqual([5]);
    expect(r.alt).toBe('120');
    expect(r.ruleAlt).toBe(13000);
  });

  it('אף גובה מהטבלה אינו בבלוקים שלי - הבלוק עם הגובה הקרוב לגובה הנדרש', () => {
    const r = recommendAltitude({ ...base, armaments: arm, rules: pr([25000, 30000]) });
    expect(r.blockIds).toEqual([6]);
    expect(r.alt).toBe('160');
    expect(r.outOfBlocks).toBe(true);
    expect(r.ruleAlt).toBe(25000);
  });

  it('מתחת לכל הבלוקים - הבלוק הנמוך, בתחתיתו', () => {
    const r = recommendAltitude({ ...base, armaments: arm, rules: pr([2000]) });
    expect(r.blockIds).toEqual([1]);
    expect(r.alt).toBe('40');
    expect(r.outOfBlocks).toBe(true);
  });

  it('רביעייה - שני בלוקים סמוכים שמכילים את העדיפות, הזוג התחתון בה', () => {
    const r = recommendAltitude({ ...base, formation: 4, armaments: arm, rules: pr([10000]) });
    expect(r.alt).toBe('100-110');
    expect(r.blockIds).toContain(4);
  });

  it('normalizeAltRules - עדיפות נשמרת, גבהים במאות הופכים לרגל, ריקה נזרקת', () => {
    expect(normalizeAltRules([
      { armament: 'ברד', kind: 'priority', alts_ft: [24000, '200', '', 'x'] },
      { armament: 'ריק', kind: 'priority', alts_ft: [] },
    ])).toEqual([{ armament: 'ברד', kind: 'priority', alts_ft: [24000, 20000] }]);
  });
});
