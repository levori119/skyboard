import { describe, it, expect } from 'vitest';
import { splitAltRange, joinAltRange } from './altRangeInput';

describe('splitAltRange', () => {
  it('טווח, ערך בודד וריק', () => {
    expect(splitAltRange('100-140')).toEqual({ from: '100', to: '140' });
    expect(splitAltRange('100 – 140')).toEqual({ from: '100', to: '140' });
    expect(splitAltRange('360')).toEqual({ from: '360', to: '' });
    expect(splitAltRange('')).toEqual({ from: '', to: '' });
    expect(splitAltRange(null)).toEqual({ from: '', to: '' });
  });
});

describe('joinAltRange', () => {
  it('שני שדות → טווח, אחד → ערך בודד', () => {
    expect(joinAltRange('100', '140')).toBe('100-140');
    expect(joinAltRange('100', '')).toBe('100');
    expect(joinAltRange('', '140')).toBe('140');
    expect(joinAltRange('', '')).toBe('');
  });

  it('מ גבוה מעד - מוחלף; שווים - ערך בודד', () => {
    expect(joinAltRange('140', '100')).toBe('100-140');
    expect(joinAltRange('120', '120')).toBe('120');
  });

  it('הלוך-חזור שומר על הערך', () => {
    for (const v of ['100-140', '360', '']) {
      const { from, to } = splitAltRange(v);
      expect(joinAltRange(from, to)).toBe(v);
    }
  });
});
