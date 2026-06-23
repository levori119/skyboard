import { describe, it, expect } from 'vitest';
import { levenshtein, normalizeToken, similarity, resolveContext } from './handwritingContext';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => expect(levenshtein('abc', 'abc')).toBe(0));
  it('counts single substitution', () => expect(levenshtein('abc', 'abd')).toBe(1));
  it('counts insertions/deletions', () => {
    expect(levenshtein('abc', 'ab')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });
  it('classic kitten→sitting = 3', () => expect(levenshtein('kitten', 'sitting')).toBe(3));
});

describe('normalizeToken', () => {
  it('strips gershayim and quotes', () => expect(normalizeToken('או"ק')).toBe(normalizeToken('אוק')));
  it('folds Hebrew final forms to base', () => {
    expect(normalizeToken('מילון')).toBe(normalizeToken('מילונ'));
    expect(normalizeToken('ארץ')).toBe(normalizeToken('ארצ'));
  });
  it('removes whitespace and case-folds latin', () => expect(normalizeToken('AB 12')).toBe('ab12'));
});

describe('similarity', () => {
  it('is 1 for identical (after normalization)', () => expect(similarity('או"ק', 'אוק')).toBe(1));
  it('is high for one-char difference', () => expect(similarity('נשר', 'נשד')).toBeGreaterThan(0.6));
  it('is low for unrelated', () => expect(similarity('נשר', 'בוקר')).toBeLessThan(0.4));
});

describe('resolveContext', () => {
  const callsigns = ['נשר12', 'נשר34', 'עיט7', 'דרור99'];

  it('resolves a near-miss to the correct callsign', () => {
    const r = resolveContext('נשר1ם', callsigns); // sloppy recognition
    expect(r.best?.value).toBe('נשר12');
  });

  it('returns nothing below threshold', () => {
    const r = resolveContext('zzzz', callsigns, { threshold: 0.5 });
    expect(r.best).toBeNull();
    expect(r.matches).toHaveLength(0);
  });

  it('flags ambiguity between close candidates', () => {
    const r = resolveContext('נשר', ['נשר12', 'נשר34']); // equidistant
    expect(r.ambiguous).toBe(true);
    expect(r.matches.length).toBeGreaterThanOrEqual(2);
  });

  it('is not ambiguous when one clearly wins', () => {
    const r = resolveContext('דרור99', callsigns);
    expect(r.best?.value).toBe('דרור99');
    expect(r.ambiguous).toBe(false);
  });
});
