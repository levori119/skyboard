// Context resolver for offline handwriting recognition.
// The recognizer produces a rough string; this layer matches it against the
// KNOWN candidate set for the active context (e.g. current strip callsigns,
// base names) using fuzzy string distance. A small, known candidate set makes
// imperfect recognition resolve to the correct entity. Pure, offline, testable.

/** Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Normalize a token for comparison: strip gershayim/quotes/geresh, whitespace,
 * and fold Hebrew final (sofit) forms to their base letter so e.g. a handwritten
 * "ך" matches "כ". Case-folds Latin. Does NOT mutate meaning of the source data.
 */
export function normalizeToken(s: string): string {
  const finals: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  return (s || '')
    .replace(/["'`׳״]/g, '')      // gershayim, geresh, quotes
    .replace(/\s+/g, '')
    .split('')
    .map(ch => finals[ch] ?? ch)
    .join('')
    .toLowerCase();
}

/** Similarity 0..1 (1 = identical) based on normalized edit distance. */
export function similarity(a: string, b: string): number {
  const x = normalizeToken(a), y = normalizeToken(b);
  if (!x && !y) return 1;
  const maxLen = Math.max(x.length, y.length) || 1;
  return 1 - levenshtein(x, y) / maxLen;
}

export interface ContextMatch { value: string; score: number }

/**
 * Resolve recognized text against a known candidate set.
 * @param recognized  rough recognizer output
 * @param candidates  known values for this context (callsigns, base names…)
 * @param opts.threshold  minimum similarity to accept (default 0.5)
 * @param opts.limit      max candidates returned (default 5)
 * @returns ranked matches above threshold; `best` is the top one (or null).
 */
export function resolveContext(
  recognized: string,
  candidates: string[],
  opts: { threshold?: number; limit?: number } = {}
): { best: ContextMatch | null; matches: ContextMatch[]; ambiguous: boolean } {
  const threshold = opts.threshold ?? 0.5;
  const limit = opts.limit ?? 5;
  const matches = candidates
    .map(value => ({ value, score: similarity(recognized, value) }))
    .filter(m => m.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const best = matches[0] ?? null;
  // ambiguous when the top two are within a small margin → ask the user
  const ambiguous = matches.length > 1 && matches[0].score - matches[1].score < 0.15;
  return { best, matches, ambiguous };
}
