// מסך יישוב הסתירות - ההיגיון שקובע **מה** הבקר רואה.
//
// שתי ההחלטות שנבדקות כאן הן ההבדל בין מסך שאפשר להכריע לפיו לבין רשימת
// JSON: מה מזהה את השורה במבט אחד, ואילו שדות באמת שונים. שתיהן טהורות,
// ולכן נבדקות כיחידה ולא דרך רינדור.
import { describe, it, expect } from 'vitest';
import { titleOf, differingFields } from './SyncConflictsModal';
import type { SyncConflict } from '../../offline/syncClient';

const conflict = (mine: Record<string, unknown> | null, serverRow: Record<string, unknown> | null): SyncConflict => ({
  key: 'strips#k', table: 'strips', pk: { id: 5 }, at: '2026-09-21T10:00:00Z',
  reason: 'changed', mine, serverRow, journalIds: [1],
});

describe('titleOf', () => {
  it('הסימן הקריאה הוא מה שמזהה פ"מ - ולא מספר השורה', () => {
    expect(titleOf(conflict({ id: 5, callsign: 'ABC' }, { id: 5, callsign: 'ABC' }))).toBe('ABC (5)');
  });

  it('בלי סימן קריאה נופלים למפתח הראשי, ולא למחרוזת ריקה', () => {
    expect(titleOf(conflict({ id: 5 }, null))).toBe('5');
  });

  it('שורה שנמחקה במרכז - הזיהוי נלקח מהגרסה המקומית', () => {
    expect(titleOf(conflict({ id: 5, callsign: 'XYZ' }, null))).toBe('XYZ (5)');
  });

  it('מפתח מורכב מוצג במלואו', () => {
    const c = { ...conflict({ id: 5 }, null), pk: { strip_id: 5, zone_id: 9 } };
    expect(titleOf(c)).toBe('5/9');
  });
});

describe('differingFields', () => {
  it('רק מה ששונה באמת', () => {
    const c = conflict(
      { id: 5, callsign: 'ABC', alt: '250', task: 'x' },
      { id: 5, callsign: 'ABC', alt: '900', task: 'x' },
    );
    expect(differingFields(c)).toEqual(['alt']);
  });

  it('rev ו-updated_at מוסתרים - הם הבוכנה של המנגנון, לא מידע שדה', () => {
    // בלי ההסתרה כל סתירה הייתה מציגה שתי שורות רעש שמטביעות את ההבדל האמיתי
    const c = conflict(
      { id: 5, alt: '250', rev: 5, updated_at: 'a', created_at: 'c1' },
      { id: 5, alt: '900', rev: 9, updated_at: 'b', created_at: 'c2' },
    );
    expect(differingFields(c)).toEqual(['alt']);
  });

  it('שדה שקיים בצד אחד בלבד נחשב שונה', () => {
    expect(differingFields(conflict({ id: 5, note: 'הערה' }, { id: 5 }))).toEqual(['note']);
  });

  it('null מול חסר אינם הבדל - אותו מצב בשתי צורות', () => {
    expect(differingFields(conflict({ id: 5, note: null }, { id: 5 }))).toEqual([]);
  });

  it('ערכי JSONB מושווים לפי תוכן', () => {
    const same = conflict({ id: 5, weapons: [1, 2] }, { id: 5, weapons: [1, 2] });
    const diff = conflict({ id: 5, weapons: [1, 2] }, { id: 5, weapons: [2, 1] });
    expect(differingFields(same)).toEqual([]);
    expect(differingFields(diff)).toEqual(['weapons']);
  });

  it('שורה שנמחקה במרכז - כל שדותיה שונים, והמסך מציג הודעה ייעודית', () => {
    expect(differingFields(conflict({ id: 5, alt: '250' }, null))).toEqual(['alt', 'id']);
  });
});
