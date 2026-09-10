// קיבוץ עמדות לפי בסיס אב ומיון לפי עדכון/יצירה - בדיקות לפני מימוש (TDD).
import { describe, it, expect } from 'vitest';
import {
  presetStamp, groupPresetsByBase, shouldShowGroupHeaders, formatStationTime,
  allowedBaseKeys, isBaseAllowed, filterByAllowedBases, groupItemsByBase,
  groupRecipientsByBase, groupCheckState, toggleGroupIds,
  type PresetLike,
} from './presetGroups';

const P = (id: number, name: string, parent_base_id: number | null, created_at?: string, updated_at?: string): PresetLike =>
  ({ id, name, parent_base_id, created_at: created_at ?? null, updated_at: updated_at ?? null });

const BASES = [{ id: 1, name: 'רמת דוד' }, { id: 2, name: 'חצור' }];

describe('presetStamp - החותמת הקובעת', () => {
  it('מעדיף updated_at על created_at', () => {
    const p = P(1, 'א', 1, '2026-01-01T10:00:00Z', '2026-05-01T10:00:00Z');
    expect(presetStamp(p)).toBe(new Date('2026-05-01T10:00:00Z').getTime());
  });

  it('נופל ל-created_at כשאין updated_at', () => {
    const p = P(1, 'א', 1, '2026-01-01T10:00:00Z');
    expect(presetStamp(p)).toBe(new Date('2026-01-01T10:00:00Z').getTime());
  });

  it('עמדה בלי חותמות כלל מקבלת 0 - יורדת לסוף ולא קופצת לראש', () => {
    expect(presetStamp(P(1, 'א', 1))).toBe(0);
    expect(presetStamp(P(1, 'א', 1, 'לא-תאריך'))).toBe(0);
  });
});

describe('groupPresetsByBase', () => {
  it('מקבץ לפי בסיס אב ונותן לקבוצה את שם הבסיס', () => {
    const groups = groupPresetsByBase([
      P(1, 'יב"א 1', 1, '2026-01-01T10:00:00Z'),
      P(2, 'מגדל', 2, '2026-02-01T10:00:00Z'),
      P(3, 'יב"א 2', 1, '2026-03-01T10:00:00Z'),
    ], BASES);
    expect(groups.map(g => g.baseName)).toEqual(['רמת דוד', 'חצור']);
    expect(groups[0].presets.map(p => p.id)).toEqual([3, 1]);
  });

  it('בתוך קבוצה - העדכני ביותר ראשון', () => {
    const [g] = groupPresetsByBase([
      P(1, 'ישנה', 1, '2026-01-01T10:00:00Z'),
      P(2, 'עודכנה עכשיו', 1, '2025-01-01T10:00:00Z', '2026-07-01T10:00:00Z'),
      P(3, 'בינונית', 1, '2026-03-01T10:00:00Z'),
    ], BASES);
    expect(g.presets.map(p => p.id)).toEqual([2, 3, 1]);
  });

  it('חותמת זהה - מיון לפי שם', () => {
    const [g] = groupPresetsByBase([
      P(2, 'ב', 1, '2026-01-01T10:00:00Z'),
      P(1, 'א', 1, '2026-01-01T10:00:00Z'),
    ], BASES);
    expect(g.presets.map(p => p.name)).toEqual(['א', 'ב']);
  });

  it('הקבוצות מסודרות לפי העמדה העדכנית ביותר שבהן', () => {
    const groups = groupPresetsByBase([
      P(1, 'ותיקה', 1, '2026-01-01T10:00:00Z'),
      P(2, 'טרייה', 2, '2026-06-01T10:00:00Z'),
    ], BASES);
    expect(groups.map(g => g.baseName)).toEqual(['חצור', 'רמת דוד']);
  });

  it('קבוצת "ללא בסיס אב" תמיד אחרונה גם כשהיא העדכנית ביותר', () => {
    const groups = groupPresetsByBase([
      P(1, 'עם בסיס', 1, '2026-01-01T10:00:00Z'),
      P(2, 'בלי בסיס', null, '2026-09-01T10:00:00Z'),
    ], BASES);
    expect(groups.map(g => g.baseId)).toEqual([1, null]);
    expect(groups[1].baseName).toBeNull();
  });

  it('בסיס אב שנמחק (אין ברשימת הבסיסים ואין שם) מאוחד ל"ללא בסיס" - לא מציגים מזהה גולמי', () => {
    const groups = groupPresetsByBase([
      P(1, 'יתומה', 99, '2026-01-01T10:00:00Z'),
      P(2, 'בלי בסיס', null, '2026-01-02T10:00:00Z'),
    ], BASES);
    expect(groups).toHaveLength(1);
    expect(groups[0].baseId).toBeNull();
    expect(groups[0].presets.map(p => p.id)).toEqual([2, 1]);
  });

  it('משתמש ב-parent_base_name מהשרת כשהבסיס לא ברשימה המקומית', () => {
    const groups = groupPresetsByBase(
      [{ id: 1, name: 'עמדה', parent_base_id: 7, parent_base_name: 'נבטים', created_at: '2026-01-01T10:00:00Z' }],
      BASES
    );
    expect(groups[0].baseName).toBe('נבטים');
  });

  it('רשימה ריקה → אין קבוצות', () => {
    expect(groupPresetsByBase([], BASES)).toEqual([]);
  });
});

describe('shouldShowGroupHeaders - בסיס אב יחיד בלי כותרת', () => {
  it('בסיס אב אחד בלבד → אין כותרת', () => {
    const groups = groupPresetsByBase([P(1, 'א', 1), P(2, 'ב', 1)], BASES);
    expect(shouldShowGroupHeaders(groups)).toBe(false);
  });

  it('שני בסיסים → יש כותרות', () => {
    const groups = groupPresetsByBase([P(1, 'א', 1), P(2, 'ב', 2)], BASES);
    expect(shouldShowGroupHeaders(groups)).toBe(true);
  });

  it('רק עמדות בלי בסיס אב → אין כותרת', () => {
    const groups = groupPresetsByBase([P(1, 'א', null), P(2, 'ב', null)], BASES);
    expect(shouldShowGroupHeaders(groups)).toBe(false);
  });

  it('בסיס אחד + עמדות בלי בסיס → כן כותרות (שתי קבוצות)', () => {
    const groups = groupPresetsByBase([P(1, 'א', 1), P(2, 'ב', null)], BASES);
    expect(shouldShowGroupHeaders(groups)).toBe(true);
  });
});

describe('formatStationTime', () => {
  const now = new Date(2026, 7, 2, 15, 0); // 02/08/2026 15:00 מקומי

  it('אותו יום → שעה בלבד', () => {
    expect(formatStationTime(new Date(2026, 7, 2, 9, 5).toISOString(), now)).toBe('09:05');
  });

  it('אותה שנה → יום/חודש + שעה', () => {
    expect(formatStationTime(new Date(2026, 5, 22, 14, 32).toISOString(), now)).toBe('22/06 14:32');
  });

  it('שנה אחרת → כולל שנה', () => {
    expect(formatStationTime(new Date(2025, 5, 22, 14, 32).toISOString(), now)).toBe('22/06/25 14:32');
  });

  it('ריק / לא תקין → מחרוזת ריקה', () => {
    expect(formatStationTime(null, now)).toBe('');
    expect(formatStationTime('לא-תאריך', now)).toBe('');
  });
});

// ── בסיס אב כציר הרשאה + קיבוץ תוכן admin ────────────────────────────────────
describe('allowedBaseKeys - המכלולים שראש הצוות מורשה בהם', () => {
  const PRESETS = [
    P(1, 'יב"א 1', 1), P(2, 'יב"א 2', 1),
    P(3, 'מגדל', 2),
    P(4, 'כללית', null),
  ];

  it('רשימת אישורים ריקה = אין הגבלה (null)', () => {
    expect(allowedBaseKeys(PRESETS, [])).toBeNull();
    expect(allowedBaseKeys(PRESETS, null)).toBeNull();
    expect(allowedBaseKeys(PRESETS, undefined)).toBeNull();
  });

  it('אישור לעמדה אחת פותח את כל בסיס האב שלה', () => {
    const allowed = allowedBaseKeys(PRESETS, [1]);
    expect([...allowed!]).toEqual(['b1']);
    expect(filterByAllowedBases(PRESETS, allowed).map(p => p.id)).toEqual([1, 2, 4]);
  });

  it('אישור לעמדה בלי בסיס אב פותח את קבוצת "ללא בסיס אב" בלבד', () => {
    const allowed = allowedBaseKeys(PRESETS, [4]);
    expect([...allowed!]).toEqual(['none']);
    expect(filterByAllowedBases(PRESETS, allowed).map(p => p.id)).toEqual([4]);
  });

  it('[-1] (הגבלה שאף עמדה בה לא זוהתה) = אין בסיס מורשה', () => {
    const allowed = allowedBaseKeys(PRESETS, [-1]);
    expect(allowed!.size).toBe(0);
    expect(filterByAllowedBases(PRESETS, allowed).map(p => p.id)).toEqual([4]);
  });

  it('כמה בסיסים - כל העמדות שלהם', () => {
    const allowed = allowedBaseKeys(PRESETS, [2, 3]);
    expect(filterByAllowedBases(PRESETS, allowed).map(p => p.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('isBaseAllowed - תוכן בלי בסיס אב גלוי לכולם', () => {
  const allowed = new Set(['b1']);

  it('פריט של בסיס מורשה - גלוי', () => {
    expect(isBaseAllowed({ parent_base_id: 1 }, allowed)).toBe(true);
  });

  it('פריט של בסיס אחר - מוסתר', () => {
    expect(isBaseAllowed({ parent_base_id: 2 }, allowed)).toBe(false);
  });

  it('פריט לא משויך - גלוי (סל התוכן המשותף)', () => {
    expect(isBaseAllowed({ parent_base_id: null }, allowed)).toBe(true);
    expect(isBaseAllowed({}, allowed)).toBe(true);
  });

  it('בלי הגבלה (מנהל מערכת) - הכל גלוי', () => {
    expect(isBaseAllowed({ parent_base_id: 2 }, null)).toBe(true);
  });
});

describe('groupItemsByBase - קיבוץ תוכן admin', () => {
  const M = (id: number, name: string, parent_base_id: number | null) => ({ id, name, parent_base_id });

  it('מקבץ לפי בסיס, ממיין קבוצות ופריטים לפי שם, "ללא בסיס אב" אחרון', () => {
    const groups = groupItemsByBase(
      [M(1, 'ב', 1), M(2, 'א', 2), M(3, 'א', 1), M(4, 'ג', null)],
      BASES, m => m.name
    );
    expect(groups.map(g => g.baseName)).toEqual(['חצור', 'רמת דוד', null]);
    expect(groups[1].items.map(m => m.id)).toEqual([3, 1]);
    expect(groups[2].key).toBe('none');
  });

  it('בסיס שנמחק (לא ברשימת הבסיסים ובלי שם) מתאחד ל"ללא בסיס אב"', () => {
    const groups = groupItemsByBase([M(1, 'א', 99)], BASES, m => m.name);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('none');
  });

  it('רשימה ריקה → אין קבוצות', () => {
    expect(groupItemsByBase([], BASES, (m: any) => m.name)).toEqual([]);
  });
});

// ─── הפצה לנמענים: קיבוץ לפי בסיס אב ────────────────────────────────────────

const R = (id: number, name: string, parent_base_id: number | null, parent_base_name: string | null = null): PresetLike =>
  ({ id, name, parent_base_id, parent_base_name, created_at: null, updated_at: null });

describe('groupRecipientsByBase - קיבוץ נמענים לפי בסיס אב', () => {
  const list = [
    R(1, 'מגדל חצור', 2, 'חצור'),
    R(2, 'יב"א רמת דוד', 1, 'רמת דוד'),
    R(3, 'מגרש רמת דוד', 1, 'רמת דוד'),
    R(4, 'דסק חופשי', null),
    R(5, 'מגדל תל נוף', 3, 'תל נוף'),
  ];

  it('הבסיס שלי ראשון - הוא הקבוצה שנפתחת כברירת מחדל', () => {
    const g = groupRecipientsByBase(list, 3);
    expect(g[0].baseId).toBe(3);
    expect(g[0].isMine).toBe(true);
    expect(g.slice(1).every(x => !x.isMine)).toBe(true);
  });

  it('שאר הבסיסים ממוינים לפי שם, ו"ללא בסיס אב" תמיד אחרון', () => {
    const g = groupRecipientsByBase(list, 3);
    expect(g.map(x => x.baseName)).toEqual(['תל נוף', 'חצור', 'רמת דוד', null]);
  });

  it('בלי בסיס משלי - אין קבוצה מסומנת, והמיון לפי שם בלבד', () => {
    const g = groupRecipientsByBase(list, null);
    expect(g.some(x => x.isMine)).toBe(false);
    expect(g.map(x => x.baseName)).toEqual(['חצור', 'רמת דוד', 'תל נוף', null]);
  });

  it('סדר הקלט נשמר בתוך הקבוצה - הקורא ממיין (שכיחות/שם) לפני הקיבוץ', () => {
    const g = groupRecipientsByBase([R(3, 'מגרש', 1, 'רמת דוד'), R(2, 'יב"א', 1, 'רמת דוד')], 1);
    expect(g[0].presets.map(p => p.id)).toEqual([3, 2]);
  });

  it('בסיס בלי שם ידוע מתמזג ל"ללא בסיס אב" - לא מציגים מזהה גולמי', () => {
    const g = groupRecipientsByBase([R(9, 'עמדה', 77, null), R(4, 'דסק', null)], null);
    expect(g).toHaveLength(1);
    expect(g[0].baseId).toBeNull();
    expect(g[0].presets.map(p => p.id)).toEqual([9, 4]);
  });

  it('רשימה ריקה מחזירה אפס קבוצות ולא קורסת', () => {
    expect(groupRecipientsByBase([], 1)).toEqual([]);
    expect(groupRecipientsByBase(null as any, null)).toEqual([]);
  });

  it('הבסיס שלי ראשון גם כשהוא "ללא בסיס אב"', () => {
    const g = groupRecipientsByBase(list, null);
    expect(g[g.length - 1].baseId).toBeNull();
    // myBaseId=null אינו "הבסיס שלי" - סל שאריות לא נפתח כברירת מחדל
    expect(g[g.length - 1].isMine).toBe(false);
  });
});

describe('groupCheckState - סימון הבסיס משקף את העמדות שתחתיו', () => {
  it('כל העמדות מסומנות → all', () => {
    expect(groupCheckState([1, 2, 3], [3, 1, 2, 9])).toBe('all');
  });

  it('חלק מסומנות → some (המצב שמצייר את ה-indeterminate)', () => {
    expect(groupCheckState([1, 2, 3], [2])).toBe('some');
  });

  it('אף אחת לא מסומנת → none', () => {
    expect(groupCheckState([1, 2, 3], [7, 8])).toBe('none');
  });

  it('קבוצה ריקה היא none ולא all - אחרת תיבה ריקה נראית מסומנת', () => {
    expect(groupCheckState([], [1, 2])).toBe('none');
    expect(groupCheckState([], [])).toBe('none');
  });

  it('מקבלת גם Set (הקורא מחזיק Set לביצועים)', () => {
    expect(groupCheckState([1, 2], new Set([1, 2]))).toBe('all');
  });
});

describe('toggleGroupIds - סימון בסיס מסמן/מנקה את כל העמדות שתחתיו', () => {
  it('סימון מוסיף את כל עמדות הבסיס ושומר על מה שכבר נבחר', () => {
    expect(toggleGroupIds([2, 3], [9], true)).toEqual([9, 2, 3]);
  });

  it('סימון אינו משכפל עמדה שכבר נבחרה', () => {
    expect(toggleGroupIds([2, 3], [3], true)).toEqual([3, 2]);
  });

  it('ביטול סימון מסיר רק את עמדות הבסיס, ולא נמענים מבסיסים אחרים', () => {
    expect(toggleGroupIds([2, 3], [9, 2, 3, 4], false)).toEqual([9, 4]);
  });

  it('אינו משנה את המערך המקורי (immutable)', () => {
    const sel = [9];
    toggleGroupIds([2], sel, true);
    expect(sel).toEqual([9]);
  });
});
