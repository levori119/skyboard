import { describe, it, expect } from 'vitest';
import { getSquadronAircraftType, isHeliAircraftType, getHeliPngSrc } from './aircraft';

describe('getSquadronAircraftType', () => {
  it('maps known squadrons to aircraft types', () => {
    expect(getSquadronAircraftType('133')).toBe('f15');
    expect(getSquadronAircraftType('101')).toBe('f16');
    expect(getSquadronAircraftType('140')).toBe('f35');
    expect(getSquadronAircraftType('118')).toBe('yasur');
    expect(getSquadronAircraftType('113')).toBe('apache');
    expect(getSquadronAircraftType('160')).toBe('uav');
  });
  it('strips leading zeros', () => {
    expect(getSquadronAircraftType('0133')).toBe('f15');
  });
  it('falls back to jet for unknown', () => {
    expect(getSquadronAircraftType('999')).toBe('jet');
    expect(getSquadronAircraftType('')).toBe('jet');
  });
});

describe('isHeliAircraftType', () => {
  it('identifies helicopters', () => {
    expect(isHeliAircraftType('yasur')).toBe(true);
    expect(isHeliAircraftType('apache')).toBe(true);
    expect(isHeliAircraftType('blackhawk')).toBe(true);
  });
  it('rejects fixed-wing', () => {
    expect(isHeliAircraftType('f15')).toBe(false);
    expect(isHeliAircraftType('uav')).toBe(false);
  });
});

describe('getHeliPngSrc', () => {
  it('returns yasur png for yasur, yanshuf otherwise', () => {
    expect(getHeliPngSrc('yasur')).toContain('yasur');
    expect(getHeliPngSrc('apache')).toContain('yanshuf');
  });
});
