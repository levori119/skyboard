import { describe, it, expect } from 'vitest';
import { DollarPRecognizer } from './dollarRecognizer';

// Synthetic strokes for distinct shapes (each = array of strokes of {x,y}).
const vline = [[{ x: 5, y: 0 }, { x: 5, y: 3 }, { x: 5, y: 6 }, { x: 5, y: 10 }]];
const hline = [[{ x: 0, y: 5 }, { x: 3, y: 5 }, { x: 6, y: 5 }, { x: 10, y: 5 }]];
const lshape = [
  [{ x: 0, y: 0 }, { x: 0, y: 5 }, { x: 0, y: 10 }],
  [{ x: 0, y: 10 }, { x: 5, y: 10 }, { x: 10, y: 10 }],
];
function circle(cx: number, cy: number, r: number, n = 16): { x: number; y: number }[][] {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return [pts];
}

function makeRecognizer() {
  const r = new DollarPRecognizer();
  r.add('vline', vline);
  r.add('hline', hline);
  r.add('L', lshape);
  r.add('O', circle(5, 5, 5));
  return r;
}

describe('DollarPRecognizer', () => {
  it('empty recognizer returns null', () => {
    expect(new DollarPRecognizer().recognize(vline).name).toBeNull();
  });

  it('tracks enrolled template count', () => {
    expect(makeRecognizer().size).toBe(4);
  });

  it('recognizes a noisy vertical line as vline (not hline)', () => {
    const noisy = [[{ x: 6, y: 0 }, { x: 5, y: 4 }, { x: 6, y: 7 }, { x: 5, y: 11 }]];
    const res = makeRecognizer().recognize(noisy);
    expect(res.name).toBe('vline');
    expect(res.score).toBeGreaterThan(0.5);
  });

  it('recognizes a noisy circle as O', () => {
    const noisy = circle(20, 20, 4, 20);
    expect(makeRecognizer().recognize(noisy).name).toBe('O');
  });

  it('distinguishes a multi-stroke L from a single line', () => {
    const noisyL = [
      [{ x: 1, y: 0 }, { x: 0, y: 6 }, { x: 1, y: 10 }],
      [{ x: 0, y: 10 }, { x: 6, y: 9 }, { x: 10, y: 10 }],
    ];
    expect(makeRecognizer().recognize(noisyL).name).toBe('L');
  });

  it('ranks candidates by score (best first)', () => {
    const res = makeRecognizer().recognize(vline);
    for (let i = 1; i < res.candidates.length; i++) {
      expect(res.candidates[i - 1].score).toBeGreaterThanOrEqual(res.candidates[i].score);
    }
  });

  it('best-per-label: personal template can outrank base for same label', () => {
    const r = new DollarPRecognizer();
    r.add('vline', hline);      // a poor "vline" template
    r.add('vline', vline);      // a good one (e.g. learned per-user)
    const res = r.recognize(vline);
    expect(res.name).toBe('vline');
    expect(res.candidates.find(c => c.name === 'vline')!.score).toBeGreaterThan(0.5);
  });
});
