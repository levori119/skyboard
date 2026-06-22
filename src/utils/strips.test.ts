import { describe, it, expect } from 'vitest';
import {
  getFormationDisplayName,
  getTransferLabel,
  getTransferSq,
  normalizeAlt,
  parseAltToFeet,
  computeBlockDeviation,
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
