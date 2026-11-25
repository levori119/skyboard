import { describe, it, expect } from 'vitest';
import { compareStripsBy, stripZoneSortName, stepStripListScale, parseStripListScale, isStripListSort } from './stripListSort';

const s = (callSign: string, takeoff: string | null, extra: any = {}) => ({ callSign, takeoff_time: takeoff, airborne: false, ...extra });

describe('compareStripsBy', () => {
  const a = s('ע10', '2026-11-26T09:10:00Z', { planned_zones: '711' });
  const b = s('ע9', '2026-11-26T09:05:00Z', { planned_zones: '703, 711' });
  const c = s('ע2', '2026-11-26T09:00:00Z');
  it('א"ב - מספרים טבעיים (ע2 < ע9 < ע10)', () => {
    expect([a, b, c].sort((x, y) => compareStripsBy('alpha', x, y)).map(x => x.callSign)).toEqual(['ע2', 'ע9', 'ע10']);
  });
  it('זמן המראה - מהמוקדם', () => {
    expect([a, b, c].sort((x, y) => compareStripsBy('takeoff', x, y)).map(x => x.callSign)).toEqual(['ע2', 'ע9', 'ע10']);
  });
  it('אזור - לפי האזור (מתוכנן כשאין שיוך), בלי אזור בסוף', () => {
    const zoneOf = (x: any) => stripZoneSortName(x, null);
    expect([a, c, b].sort((x, y) => compareStripsBy('zone', x, y, zoneOf)).map(x => x.callSign)).toEqual(['ע9', 'ע10', 'ע2']);
  });
});

describe('stripZoneSortName', () => {
  it('המשויך גובר על המתוכנן', () => {
    expect(stripZoneSortName({ planned_zones: '711' }, '705')).toBe('705');
    expect(stripZoneSortName({ planned_zones: '711, 703' }, null)).toBe('711');
    expect(stripZoneSortName({}, '')).toBe('');
  });
});

describe('גודל גופן הלוח', () => {
  it('צעד עשירית, בגבולות 0.8-1.8', () => {
    expect(stepStripListScale(1, 1)).toBe(1.1);
    expect(stepStripListScale(1.8, 1)).toBe(1.8);
    expect(stepStripListScale(0.8, -1)).toBe(0.8);
  });
  it('ערך שמור לא תקין - 1', () => {
    expect(parseStripListScale(null)).toBe(1);
    expect(parseStripListScale('abc')).toBe(1);
    expect(parseStripListScale('1.34')).toBe(1.3);
    expect(parseStripListScale('9')).toBe(1.8);
  });
  it('isStripListSort', () => { expect(isStripListSort('zone')).toBe(true); expect(isStripListSort('x')).toBe(false); });
});
