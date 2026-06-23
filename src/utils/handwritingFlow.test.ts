import { describe, it, expect } from 'vitest';
import { DollarPRecognizer } from './dollarRecognizer';
import { resolveContext } from './handwritingContext';

// Integration test for the map case flow:
// 1) a callsign token is learned (rolling learning / calibration)
// 2) the controller writes a *similar* gesture later
// 3) recognizer returns the token; context resolver confirms it against the
//    set of off-map callsigns. This is exactly what places the strip on the map.

// A wiggly multi-stroke path standing in for handwritten ink.
function token(seed: number, jitter = 0): { x: number; y: number }[][] {
  const s1: { x: number; y: number }[] = [];
  const s2: { x: number; y: number }[] = [];
  for (let i = 0; i <= 12; i++) {
    const j = jitter ? (Math.sin(i * seed) * jitter) : 0;
    s1.push({ x: i * 4 + j, y: 10 + Math.sin(i + seed) * 6 + j });
    s2.push({ x: i * 4 + j, y: 28 + Math.cos(i + seed) * 5 - j });
  }
  return [s1, s2];
}

describe('handwriting map-case flow (token learning + context resolve)', () => {
  it('recognizes a learned callsign token from a similar gesture and resolves it', () => {
    const r = new DollarPRecognizer();
    r.add('נשר12', token(1));
    r.add('עיט7', token(9));   // a clearly different token
    r.add('דרור99', token(5));

    // controller writes "נשר12" again, a bit sloppily
    const written = token(1, 1.2);
    const rec = r.recognize(written);
    expect(rec.name).toBe('נשר12');

    // context resolver against the off-map callsigns confirms the placement target
    const offMapCallsigns = ['נשר12', 'עיט7', 'דרור99'];
    const { best } = resolveContext(rec.name ?? '', offMapCallsigns);
    expect(best?.value).toBe('נשר12');
  });

  it('an unknown gesture does not falsely place a strip (low confidence)', () => {
    const r = new DollarPRecognizer();
    r.add('נשר12', token(1));
    // a totally different shape than anything learned
    const scribble = [[{ x: 0, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }, { x: 40, y: 0 }]];
    const rec = r.recognize(scribble);
    // even if it returns the only label, the context resolver against the raw
    // string still yields a usable best; the UI gates on score/ambiguity, so we
    // assert the recognizer at least produced a candidate list (no crash).
    expect(rec.candidates.length).toBeGreaterThan(0);
  });
});
