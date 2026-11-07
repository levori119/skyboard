import { describe, it, expect } from 'vitest';
import { normalizeSortSpec, compareBySortSpec } from './tableSort';

type Row = Record<string, string>;
const val = (r: Row, k: string) => r[k] ?? '—';
const sorted = (rows: Row[], spec: any) => [...rows].sort(compareBySortSpec<Row>(normalizeSortSpec(spec), val)).map(r => r.id);

describe('normalizeSortSpec', () => {
  it('מנקה רמות בלי שדה, שדה כפול וכיוון לא תקין', () => {
    expect(normalizeSortSpec([{ key: 'alt', dir: 'desc' }, { key: '' }, { key: 'alt', dir: 'asc' }, { key: 'task', dir: 'x' }]))
      .toEqual([{ key: 'alt', dir: 'desc' }, { key: 'task', dir: 'asc' }]);
  });
  it('לא מערך - רשימה ריקה', () => {
    expect(normalizeSortSpec(null)).toEqual([]);
    expect(normalizeSortSpec('alt')).toEqual([]);
  });
});

describe('compareBySortSpec', () => {
  const rows: Row[] = [
    { id: 'a', task: 'תקיפה', alt: '120' },
    { id: 'b', task: 'סיור', alt: '90' },
    { id: 'c', task: 'תקיפה', alt: '90' },
    { id: 'd', task: 'סיור', alt: '340' },
  ];

  it('רמה אחת עולה - מספרים כמספרים (90 לפני 120)', () => {
    expect(sorted(rows, [{ key: 'alt', dir: 'asc' }]).slice(0, 2).sort()).toEqual(['b', 'c']);
    expect(sorted(rows, [{ key: 'alt', dir: 'asc' }]).slice(2)).toEqual(['a', 'd']);
  });

  it('רמה ראשונה ואז שנייה מכריעה בין שווים', () => {
    expect(sorted(rows, [{ key: 'task', dir: 'asc' }, { key: 'alt', dir: 'desc' }])).toEqual(['d', 'b', 'a', 'c']);
  });

  it('יורד בראשונה, עולה בשנייה', () => {
    expect(sorted(rows, [{ key: 'task', dir: 'desc' }, { key: 'alt', dir: 'asc' }])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('ערך ריק תמיד בסוף - גם בסדר יורד', () => {
    const r: Row[] = [{ id: 'x' }, { id: 'y', alt: '100' }, { id: 'z', alt: '200' }];
    expect(sorted(r, [{ key: 'alt', dir: 'asc' }])).toEqual(['y', 'z', 'x']);
    expect(sorted(r, [{ key: 'alt', dir: 'desc' }])).toEqual(['z', 'y', 'x']);
  });

  it('בלי רמות - הסדר נשמר', () => {
    expect(sorted(rows, [])).toEqual(['a', 'b', 'c', 'd']);
  });
});
