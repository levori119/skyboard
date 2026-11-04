import { describe, it, expect } from 'vitest';
import { disabledPresetIds, isPointDisabledFor, toggleDisabled, presetSectorIds, transfersToReturn, pointStationIds, stationDirection, canSendVia, canReceiveVia, setDirection, transfersToReturnOnDirection } from './transferPointStations.js';

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

describe('pointStationIds - העמדות של נקודה לתפריט "עמדה"', () => {
  const presets = [
    { id: 21, relevant_sectors: [], classic_transfer_points: [{ sector_id: 2742 }] },
    { id: 26, relevant_sectors: [2742] },
    { id: 2, relevant_sectors: [99] },
    { id: 5, classic_receive_points: [{ sector_id: 2742 }] },
  ];
  it('כל עמדה שמשתמשת בנקודה, מורכבת או קלאסית', () => {
    expect(pointStationIds(presets, { id: 2742 })).toEqual([21, 26, 5]);
  });
  it('עמדה שהנקודה כבויה אצלה יוצאת', () => {
    expect(pointStationIds(presets, { id: 2742, disabled_preset_ids: [5] })).toEqual([21, 26]);
  });
  it('בלי נקודה - ריק', () => {
    expect(pointStationIds(presets, null)).toEqual([]);
  });
});

describe('כיוון עמדה בנקודה - מוסרת / מקבלת / שניהם', () => {
  const sec = { id: 2742, station_directions: { 26: 'send', 21: 'receive', 5: 'junk' }, disabled_preset_ids: [9] };
  it('ברירת מחדל שניהם; ערך שבור נחשב שניהם', () => {
    expect(stationDirection(sec, 26)).toBe('send');
    expect(stationDirection(sec, 21)).toBe('receive');
    expect(stationDirection(sec, 5)).toBe('both');
    expect(stationDirection({ station_directions: '{"3":"send"}' }, 3)).toBe('send');
    expect(stationDirection(null, 3)).toBe('both');
  });
  it('שליחה וקבלה לפי הכיוון, ונקודה כבויה חוסמת את שתיהן', () => {
    expect([canSendVia(sec, 26), canReceiveVia(sec, 26)]).toEqual([true, false]);
    expect([canSendVia(sec, 21), canReceiveVia(sec, 21)]).toEqual([false, true]);
    expect([canSendVia(sec, 5), canReceiveVia(sec, 5)]).toEqual([true, true]);
    expect([canSendVia(sec, 9), canReceiveVia(sec, 9)]).toEqual([false, false]);
  });
  it('setDirection - "שניהם" נמחק מהמפה', () => {
    expect(setDirection(sec, 26, 'both')).toEqual({ 21: 'receive' });
    expect(setDirection(sec, 7, 'receive')).toEqual({ 26: 'send', 21: 'receive', 7: 'receive' });
  });
  it('העברות שחוזרות בשינוי כיוון', () => {
    const open = [
      { id: 'a', to_sector_id: 2742, from_preset_id: 26, to_preset_id: 21 },
      { id: 'b', to_sector_id: 2742, from_preset_id: 21, to_preset_id: 26 },
      { id: 'c', to_sector_id: 2742, from_preset_id: 21, to_preset_id: null },
      { id: 'd', to_sector_id: 99, from_preset_id: 26, to_preset_id: null },
    ];
    expect(transfersToReturnOnDirection(open, 2742, 26, 'receive', [21, 26]).map(t => t.id)).toEqual(['a']);
    // 26 הופכת ל"מוסרת": מה שמיועד אליה חוזר; בלי יעד - חוזר רק אם אין מקבל אחר
    expect(transfersToReturnOnDirection(open, 2742, 26, 'send', [21]).map(t => t.id)).toEqual(['b', 'c']);
    expect(transfersToReturnOnDirection(open, 2742, 26, 'send', [21, 30]).map(t => t.id)).toEqual(['b']);
    expect(transfersToReturnOnDirection(open, 2742, 26, 'both', [21])).toEqual([]);
  });
});
