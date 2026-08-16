// בניית הסקטורים הרלוונטיים לעמדה — נדרש בשני מקומות (כניסה לעמדה, ומסגרת
// צפייה בעמדה אחרת), ולכן חולץ לפונקציה אחת. בדיקות לפני מימוש (TDD).
import { describe, it, expect } from 'vitest';
import { buildRelevantSectors } from './session';

const sectors = [
  { id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }, { id: 4, name: 'D' },
] as any[];

describe('buildRelevantSectors', () => {
  it('עמדה רגילה — הסקטורים שהוגדרו לה', () => {
    const preset = { relevant_sectors: [1, 3] };
    expect(buildRelevantSectors(preset, sectors).map(s => s.id)).toEqual([1, 3]);
  });

  it('עמדה רגילה — מתווספים גם סקטורי נקודות המסירה והקבלה (לפאנל השכנים במפה)', () => {
    const preset = {
      relevant_sectors: [1],
      classic_transfer_points: [{ sector_id: 2 }],
      classic_receive_points: [{ sector_id: 4 }],
    };
    expect(buildRelevantSectors(preset, sectors).map(s => s.id)).toEqual([1, 2, 4]);
  });

  it('בלי כפילות כשאותו סקטור מופיע גם כנקודת מסירה', () => {
    const preset = { relevant_sectors: [1, 2], classic_transfer_points: [{ sector_id: 2 }] };
    expect(buildRelevantSectors(preset, sectors).map(s => s.id)).toEqual([1, 2]);
  });

  it('עמדה קלאסית — בלי הרחבה. היא נשענת על רשימה ריקה כדי לבחור את ענף הטעינה הנכון', () => {
    const preset = { preset_type: 'classic', relevant_sectors: [], classic_transfer_points: [{ sector_id: 2 }] };
    expect(buildRelevantSectors(preset, sectors)).toEqual([]);
  });

  it('display_mode קלאסי מזוהה גם הוא כעמדה קלאסית', () => {
    const preset = { display_mode: 'classic', relevant_sectors: [1], classic_receive_points: [{ sector_id: 3 }] };
    expect(buildRelevantSectors(preset, sectors).map(s => s.id)).toEqual([1]);
  });

  it('שדות חסרים — לא קורס, מחזיר []', () => {
    expect(buildRelevantSectors({}, sectors)).toEqual([]);
    expect(buildRelevantSectors({ relevant_sectors: [1] }, undefined as any)).toEqual([]);
  });

  it('sector_id ריק בנקודת מעבר — מסונן', () => {
    const preset = { relevant_sectors: [1], classic_transfer_points: [{ sector_id: null }, { sector_id: 3 }] };
    expect(buildRelevantSectors(preset, sectors).map(s => s.id)).toEqual([1, 3]);
  });
});
