import { describe, it, expect } from 'vitest';
import {
  zoneRestrictionOf, isRestricted, altRangesOverlap, restrictionCoversAllAltitudes,
  bandRestricted, altitudeRestricted, assignmentRestriction, closedForAllBands, restrictionRangeLabel,
  restrictedBandIds, bandRestrictionKind, bandLabel, openBands,
  type RestrictableZone,
} from './zoneRestriction';

const zone = (over: Partial<RestrictableZone> = {}): RestrictableZone => ({
  restriction: '', restriction_alt_min: null, restriction_alt_max: null, ...over,
});

describe('המצב התפעולי של האזור', () => {
  it('רק closed ו-restricted הם הגבלה - כל השאר פתוח', () => {
    expect(zoneRestrictionOf(zone({ restriction: 'closed' }))).toBe('closed');
    expect(zoneRestrictionOf(zone({ restriction: 'restricted' }))).toBe('restricted');
    expect(zoneRestrictionOf(zone({ restriction: '' }))).toBe('');
    expect(zoneRestrictionOf(zone({ restriction: null }))).toBe('');
    expect(zoneRestrictionOf(zone({ restriction: 'סגור' }))).toBe('');
    expect(zoneRestrictionOf(null)).toBe('');
    expect(zoneRestrictionOf(undefined)).toBe('');
  });

  it('isRestricted הוא קיצור ל"יש הגבלה כלשהי"', () => {
    expect(isRestricted(zone({ restriction: 'closed' }))).toBe(true);
    expect(isRestricted(zone({ restriction: 'restricted' }))).toBe(true);
    expect(isRestricted(zone())).toBe(false);
  });
});

describe('חפיפת טווחי גובה', () => {
  it('טווחים נפרדים לא חופפים', () => {
    expect(altRangesOverlap(100, 140, 150, 200)).toBe(false);
    expect(altRangesOverlap(150, 200, 100, 140)).toBe(false);
  });

  it('הגבולות כלולים - נגיעה בגבול היא חפיפה', () => {
    expect(altRangesOverlap(100, 140, 140, 200)).toBe(true);
    expect(altRangesOverlap(140, 200, 100, 140)).toBe(true);
  });

  it('טווחים חופפים חלקית', () => {
    expect(altRangesOverlap(100, 160, 150, 200)).toBe(true);
  });

  it('טווח מוכל בתוך טווח', () => {
    expect(altRangesOverlap(100, 400, 150, 200)).toBe(true);
    expect(altRangesOverlap(150, 200, 100, 400)).toBe(true);
  });

  it('גבולות הפוכים (max<min) מנורמלים ולא שוברים את ההשוואה', () => {
    expect(altRangesOverlap(140, 100, 200, 150)).toBe(false);
    expect(altRangesOverlap(140, 100, 130, 110)).toBe(true);
  });

  it('צד פתוח (null) נמשך עד אין-סוף באותו כיוון', () => {
    expect(altRangesOverlap(200, null, 100, 140)).toBe(false); // "מ-200 ומעלה" מול 100-140
    expect(altRangesOverlap(200, null, 100, 250)).toBe(true);
    expect(altRangesOverlap(200, null, 300, 400)).toBe(true);  // "מ-200 ומעלה" כולל 300-400
    expect(altRangesOverlap(null, 140, 150, 200)).toBe(false); // "עד 140" מול 150-200
    expect(altRangesOverlap(null, 140, 120, 200)).toBe(true);
  });

  it('שני צדדים פתוחים - חופף לכל דבר', () => {
    expect(altRangesOverlap(null, null, 100, 140)).toBe(true);
    expect(altRangesOverlap(null, null, null, null)).toBe(true);
  });
});

describe('טווח ריק = כל הגבהים', () => {
  it('בלי min ובלי max ההגבלה גורפת', () => {
    expect(restrictionCoversAllAltitudes(zone({ restriction: 'closed' }))).toBe(true);
  });

  it('גבול אחד מספיק כדי שהיא תהיה טווחית', () => {
    expect(restrictionCoversAllAltitudes(zone({ restriction: 'closed', restriction_alt_min: 100 }))).toBe(false);
    expect(restrictionCoversAllAltitudes(zone({ restriction: 'closed', restriction_alt_max: 140 }))).toBe(false);
  });
});

describe('בלוק גובה מול ההגבלה', () => {
  const closed100to140 = zone({ restriction: 'closed', restriction_alt_min: 100, restriction_alt_max: 140 });

  it('אזור פתוח - שום בלוק אינו מוגבל', () => {
    expect(bandRestricted(zone(), { lo: 100, hi: 140 })).toBe(false);
  });

  it('סגירה גורפת - כל בלוק מוגבל', () => {
    expect(bandRestricted(zone({ restriction: 'closed' }), { lo: 300, hi: 400 })).toBe(true);
  });

  it('רק הבלוק שנופל בטווח הסגירה מוגבל', () => {
    expect(bandRestricted(closed100to140, { lo: 100, hi: 140 })).toBe(true);
    expect(bandRestricted(closed100to140, { lo: 150, hi: 400 })).toBe(false);
  });

  it('בלוק שחופף חלקית לטווח - מוגבל (חלק ממנו סגור)', () => {
    expect(bandRestricted(closed100to140, { lo: 120, hi: 300 })).toBe(true);
  });

  it('בלוק בלי גבהים מוגדרים - מוגבל (אין לפי מה להכריע)', () => {
    expect(bandRestricted(closed100to140, { lo: null, hi: null })).toBe(true);
  });
});

describe('גובה נקודתי מול ההגבלה', () => {
  const closed100to140 = zone({ restriction: 'restricted', restriction_alt_min: 100, restriction_alt_max: 140 });

  it('גובה בתוך הטווח - מוגבל', () => {
    expect(altitudeRestricted(closed100to140, 120)).toBe(true);
    expect(altitudeRestricted(closed100to140, 100)).toBe(true);
    expect(altitudeRestricted(closed100to140, 140)).toBe(true);
  });

  it('גובה מחוץ לטווח - לא מוגבל', () => {
    expect(altitudeRestricted(closed100to140, 90)).toBe(false);
    expect(altitudeRestricted(closed100to140, 200)).toBe(false);
  });

  it('בלי גובה - ברירת המחדל הבטוחה היא שההגבלה חלה', () => {
    expect(altitudeRestricted(closed100to140, null)).toBe(true);
  });

  it('אזור פתוח - לא מוגבל גם בלי גובה', () => {
    expect(altitudeRestricted(zone(), null)).toBe(false);
  });
});

describe('ההגבלה שחלה על הקצאה - מטריצת המקרים', () => {
  it('אזור פתוח - אין הגבלה, לא משנה מה הגובה', () => {
    expect(assignmentRestriction(zone(), [{ lo: 100, hi: 140 }], 120)).toBe('');
    expect(assignmentRestriction(zone(), [], null)).toBe('');
  });

  it('אזור סגור גורף - סגור לכל פ"מ', () => {
    const z = zone({ restriction: 'closed' });
    expect(assignmentRestriction(z, [{ lo: 300, hi: 400 }], 350)).toBe('closed');
    expect(assignmentRestriction(z, [], null)).toBe('closed');
  });

  it('אזור מוגבל גורף - מחזיר restricted ולא closed', () => {
    expect(assignmentRestriction(zone({ restriction: 'restricted' }), [], 200)).toBe('restricted');
  });

  it('אזור מפוצל שסגור רק בבלוק הנמוך - הבלוק הגבוה פתוח', () => {
    const z = zone({ restriction: 'closed', restriction_alt_min: 100, restriction_alt_max: 140 });
    expect(assignmentRestriction(z, [{ lo: 100, hi: 140 }], 120)).toBe('closed');
    expect(assignmentRestriction(z, [{ lo: 150, hi: 400 }], 200)).toBe('');
  });

  it('פ"מ בכמה בלוקים - די בבלוק אחד סגור', () => {
    const z = zone({ restriction: 'closed', restriction_alt_min: 100, restriction_alt_max: 140 });
    expect(assignmentRestriction(z, [{ lo: 150, hi: 400 }, { lo: 100, hi: 140 }], 200)).toBe('closed');
  });

  it('הבלוק שהוקצה גובר על הגובה הרשום בפ"מ', () => {
    const z = zone({ restriction: 'closed', restriction_alt_min: 100, restriction_alt_max: 140 });
    // הפ"מ רשום 120 (בתוך הסגירה) אבל הוקצה לבלוק הגבוה - כוונת המפעיל גוברת
    expect(assignmentRestriction(z, [{ lo: 150, hi: 400 }], 120)).toBe('');
    // וההפך: רשום 200 אבל הוקצה לבלוק הסגור
    expect(assignmentRestriction(z, [{ lo: 100, hi: 140 }], 200)).toBe('closed');
  });

  it('אזור לא מפוצל - נשפט לפי הגובה הרשום בפ"מ', () => {
    const z = zone({ restriction: 'restricted', restriction_alt_min: 100, restriction_alt_max: 140 });
    expect(assignmentRestriction(z, [], 120)).toBe('restricted');
    expect(assignmentRestriction(z, [], 200)).toBe('');
  });

  it('אין בלוק ואין גובה - ברירת המחדל הבטוחה: מתריעים', () => {
    const z = zone({ restriction: 'closed', restriction_alt_min: 100, restriction_alt_max: 140 });
    expect(assignmentRestriction(z, [], null)).toBe('closed');
  });

  it('אזור חסר לגמרי - אין הגבלה', () => {
    expect(assignmentRestriction(null, [], 120)).toBe('');
    expect(assignmentRestriction(undefined, [{ lo: 100, hi: 140 }], 120)).toBe('');
  });
});

describe('תיאור טווח ההגבלה', () => {
  it('טווח מלא', () => {
    expect(restrictionRangeLabel(zone({ restriction_alt_min: 100, restriction_alt_max: 140 }))).toBe('100-140');
  });
  it('טווח ריק - בלי תיאור (ההגבלה גורפת)', () => {
    expect(restrictionRangeLabel(zone())).toBe('');
  });
  it('גבול תחתון בלבד', () => {
    expect(restrictionRangeLabel(zone({ restriction_alt_min: 200 }))).toBe('200+');
  });
  it('גבול עליון בלבד', () => {
    expect(restrictionRangeLabel(zone({ restriction_alt_max: 140 }))).toBe('-140');
  });
  it('גבול יחיד זהה - בלי מקף', () => {
    expect(restrictionRangeLabel(zone({ restriction_alt_min: 120, restriction_alt_max: 120 }))).toBe('120');
  });
});

describe('סגור לכל גובה שאפשר להקצות - האם בכלל לפתוח טופס', () => {
  it('אזור פתוח או מוגבל - לא סגור לכל, גם כשההגבלה גורפת', () => {
    expect(closedForAllBands(zone(), [{ lo: 100, hi: 140 }])).toBe(false);
    expect(closedForAllBands(zone({ restriction: 'restricted' }), [{ lo: 100, hi: 140 }])).toBe(false);
  });

  it('סגירה גורפת - סגור לכל, עם בלוקים ובלעדיהם', () => {
    const z = zone({ restriction: 'closed' });
    expect(closedForAllBands(z, [{ lo: 100, hi: 140 }, { lo: 150, hi: 400 }])).toBe(true);
    expect(closedForAllBands(z, [], 200)).toBe(true);
    expect(closedForAllBands(z, [], null)).toBe(true);
  });

  it('סגירה טווחית שמכסה את כל הבלוקים - סגור לכל', () => {
    const z = zone({ restriction: 'closed', restriction_alt_min: 100, restriction_alt_max: 400 });
    expect(closedForAllBands(z, [{ lo: 100, hi: 140 }, { lo: 150, hi: 400 }])).toBe(true);
  });

  it('סגירה טווחית שמכסה רק בלוק אחד - **לא** סגור לכל (הטופס כן נפתח)', () => {
    const z = zone({ restriction: 'closed', restriction_alt_min: 100, restriction_alt_max: 140 });
    expect(closedForAllBands(z, [{ lo: 100, hi: 140 }, { lo: 150, hi: 400 }])).toBe(false);
  });

  it('אזור לא מפוצל - נשפט לפי הגובה הרשום בפ"מ', () => {
    const z = zone({ restriction: 'closed', restriction_alt_min: 100, restriction_alt_max: 140 });
    expect(closedForAllBands(z, [], 120)).toBe(true);
    expect(closedForAllBands(z, [], 200)).toBe(false);
    expect(closedForAllBands(z, [], null)).toBe(true); // בלי גובה - ברירת המחדל הבטוחה
  });

  it('אזור חסר - לא סגור', () => {
    expect(closedForAllBands(null, [])).toBe(false);
  });
});

// ─── הגבלה לפי **סט בלוקים** ─────────────────────────────────────────────────
// המנגנון המועדף באזור מפוצל: הפקח מסמן בתפריט אילו גבהים סגורים, וזו הכרעה על
// הבלוקים עצמם. הטווח המספרי נשאר לאזור שאין לו בלוקים כלל.
const LOW = { id: 11, name: 'נמוך', lo: 90, hi: 130 };
const HIGH = { id: 22, name: 'גבוה', lo: 140, hi: 200 };

describe('סימון בלוקים - restriction_range_ids', () => {
  it('רשימה ריקה או חסרה = אין סימון', () => {
    expect(restrictedBandIds(zone())).toEqual([]);
    expect(restrictedBandIds(zone({ restriction_range_ids: null }))).toEqual([]);
    expect(restrictedBandIds(null)).toEqual([]);
  });

  it('רק הבלוק המסומן מוגבל', () => {
    const z = zone({ restriction: 'closed', restriction_range_ids: [LOW.id] });
    expect(bandRestricted(z, LOW)).toBe(true);
    expect(bandRestricted(z, HIGH)).toBe(false);
  });

  it('כמה בלוקים מסומנים - כולם מוגבלים', () => {
    const z = zone({ restriction: 'closed', restriction_range_ids: [LOW.id, HIGH.id] });
    expect(bandRestricted(z, LOW)).toBe(true);
    expect(bandRestricted(z, HIGH)).toBe(true);
  });

  it('סימון בלוקים גובר על טווח מספרי שנשאר', () => {
    // הטווח 90-200 מכסה את שני הבלוקים, אבל מסומן רק הגבוה
    const z = zone({ restriction: 'closed', restriction_range_ids: [HIGH.id], restriction_alt_min: 90, restriction_alt_max: 200 });
    expect(bandRestricted(z, LOW)).toBe(false);
    expect(bandRestricted(z, HIGH)).toBe(true);
  });

  it('בלוק בלי id אינו יכול להיות מסומן', () => {
    const z = zone({ restriction: 'closed', restriction_range_ids: [LOW.id] });
    expect(bandRestricted(z, { lo: 90, hi: 130 })).toBe(false);
  });

  it('סימון בלוקים אינו "כל הגבהים"', () => {
    expect(restrictionCoversAllAltitudes(zone({ restriction: 'closed', restriction_range_ids: [LOW.id] }))).toBe(false);
    expect(restrictionCoversAllAltitudes(zone({ restriction: 'closed' }))).toBe(true);
  });

  it('שיוך: די בבלוק מסומן אחד', () => {
    const z = zone({ restriction: 'closed', restriction_range_ids: [LOW.id] });
    expect(assignmentRestriction(z, [LOW], 120)).toBe('closed');
    expect(assignmentRestriction(z, [HIGH], 160)).toBe('');
    expect(assignmentRestriction(z, [HIGH, LOW], 160)).toBe('closed');
  });

  it('שיוך בלי בלוק כשההגבלה בבלוקים - ברירת המחדל הבטוחה', () => {
    const z = zone({ restriction: 'closed', restriction_range_ids: [LOW.id] });
    expect(assignmentRestriction(z, [], 160)).toBe('closed');
  });

  it('closedForAllBands: סגור רק כשכל הבלוקים מסומנים', () => {
    expect(closedForAllBands(zone({ restriction: 'closed', restriction_range_ids: [LOW.id] }), [LOW, HIGH])).toBe(false);
    expect(closedForAllBands(zone({ restriction: 'closed', restriction_range_ids: [LOW.id, HIGH.id] }), [LOW, HIGH])).toBe(true);
  });
});

describe('bandRestrictionKind - הרצועה שהפ"מ שוחרר עליה', () => {
  it('רצועה סגורה מחזירה closed, פתוחה מחזירה ריק', () => {
    const z = zone({ restriction: 'closed', restriction_range_ids: [LOW.id] });
    expect(bandRestrictionKind(z, LOW)).toBe('closed');
    expect(bandRestrictionKind(z, HIGH)).toBe('');
  });

  it('אזור מוגבל מחזיר restricted על הרצועה שסומנה', () => {
    const z = zone({ restriction: 'restricted', restriction_range_ids: [HIGH.id] });
    expect(bandRestrictionKind(z, HIGH)).toBe('restricted');
    expect(bandRestrictionKind(z, LOW)).toBe('');
  });

  it('אזור פתוח - שום רצועה', () => {
    expect(bandRestrictionKind(zone(), LOW)).toBe('');
  });
});

describe('הגבהים הפתוחים ותיאור ההגבלה', () => {
  it('openBands מחזיר את מה שלא מוגבל', () => {
    const z = zone({ restriction: 'restricted', restriction_range_ids: [LOW.id] });
    expect(openBands(z, [LOW, HIGH]).map(b => b.name)).toEqual(['גבוה']);
  });

  it('אזור פתוח - כל הבלוקים פתוחים', () => {
    expect(openBands(zone(), [LOW, HIGH]).map(b => b.name)).toEqual(['נמוך', 'גבוה']);
  });

  it('סגירה גורפת - אין בלוק פתוח', () => {
    expect(openBands(zone({ restriction: 'closed' }), [LOW, HIGH])).toEqual([]);
  });

  it('התיאור נוקב בשמות הבלוקים כשההגבלה הוגדרה בהם', () => {
    const z = zone({ restriction: 'closed', restriction_range_ids: [LOW.id, HIGH.id] });
    expect(restrictionRangeLabel(z, [LOW, HIGH])).toBe('נמוך, גבוה');
  });

  it('בלי בלוקים - התיאור נשאר הטווח המספרי', () => {
    expect(restrictionRangeLabel(zone({ restriction_alt_min: 100, restriction_alt_max: 140 }))).toBe('100-140');
  });

  it('bandLabel', () => {
    expect(bandLabel(LOW)).toBe('90-130');
    expect(bandLabel({ lo: null, hi: null })).toBe('');
    expect(bandLabel({ lo: 200, hi: null })).toBe('200+');
  });
});
