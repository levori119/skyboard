import { describe, it, expect } from 'vitest';
import { disabledPresetIds, isPointDisabledFor, toggleDisabled, presetSectorIds, transfersToReturn } from './transferPointStations.js';

describe('רשימת העמדות הכבויות', () => {
  it('עמידה לערך שבור, מחרוזת JSON וכפילויות', () => {
    expect(disabledPresetIds({ disabled_preset_ids: [1, '2', 2] })).toEqual([1, 2]);
    expect(disabledPresetIds({ disabled_preset_ids: '[3]' })).toEqual([3]);
    expect(disabledPresetIds({ disabled_preset_ids: 'x' })).toEqual([]);
    expect(disabledPresetIds(null)).toEqual([]);
  });
  it('כיבוי והדלקה', () => {
    expect(toggleDisabled({ disabled_preset_ids: [1] }, 2, false)).toEqual([1, 2]);
    expect(toggleDisabled({ disabled_preset_ids: [1, 2] }, 2, true)).toEqual([1]);
    expect(toggleDisabled({ disabled_preset_ids: [2] }, 2, false)).toEqual([2]);
    expect(isPointDisabledFor({ disabled_preset_ids: [5] }, '5')).toBe(true);
    expect(isPointDisabledFor({ disabled_preset_ids: [5] }, null)).toBe(false);
  });
});

describe('presetSectorIds', () => {
  it('מורכבת + קלאסית', () => {
    expect([...presetSectorIds({ relevant_sectors: [1, 2], classic_transfer_points: [{ sector_id: 3 }], classic_receive_points: [{ sector_id: '4' }] })].sort())
      .toEqual([1, 2, 3, 4]);
    expect(presetSectorIds({}).size).toBe(0);
  });
});

describe('transfersToReturn - מה חוזר למוסר כשהנקודה כובתה לעמדה 7', () => {
  const S = 100;
  const t = (id, o) => ({ id, to_sector_id: S, ...o });
  it('העמדה שכובתה שלחה - חוזרת', () => {
    expect(transfersToReturn([t(1, { from_workstation_id: 7 })], S, 7, [8]).map(x => x.id)).toEqual([1]);
  });
  it('יעד מפורש: לעמדה שכובתה חוזרת, לעמדה אחרת לא', () => {
    const r = transfersToReturn([t(1, { from_workstation_id: 5, to_preset_id: 7 }), t(2, { from_workstation_id: 5, to_preset_id: 8 })], S, 7, [8]);
    expect(r.map(x => x.id)).toEqual([1]);
  });
  it('בלי יעד: חוזרת רק כשאין עמדה מקבלת אחרת', () => {
    const tr = [t(1, { from_workstation_id: 5 })];
    expect(transfersToReturn(tr, S, 7, [8])).toEqual([]);
    expect(transfersToReturn(tr, S, 7, [])).toHaveLength(1);
    // המוסר עצמו אינו "מקבל אחר"
    expect(transfersToReturn(tr, S, 7, [5])).toHaveLength(1);
  });
  it('העברה לנקודה אחרת - לא נוגעים', () => {
    expect(transfersToReturn([{ id: 9, to_sector_id: 200, from_workstation_id: 7 }], S, 7, [])).toEqual([]);
  });
});
