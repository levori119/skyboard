import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PatternFlipAlertCard, type FlipGroup } from './PatternFlipAlert';

// מה הפקח רואה בהתראה (PATTERN_FLIP_SPEC.md §4). renderToStaticMarkup בלבד - אין DOM.
const P33 = { id: 8, runway_ident: '33', color: '#a855f7' };
const P15L = { id: 5, runway_ident: '15', color: '#22d3ee' };
const P15R = { id: 6, runway_ident: '15', color: '#22d3ee' };
const ac = (idx: number) => ({ strip_id: 10, aircraft_idx: idx, pattern_id: 8, pattern_orphan: 'pending', label: `בננה${idx}` });
const render = (groups: FlipGroup[]) =>
  renderToStaticMarkup(<PatternFlipAlertCard groups={groups} themeMode="dark" onConfirm={() => {}} />);
const count = (m: string, re: RegExp) => (m.match(re) || []).length;

describe('PatternFlipAlertCard', () => {
  it('#1 בלי קבוצות - לא מרונדר', () => {
    expect(render([])).toBe('');
  });

  it('#2 שורה לכל מטוס, וברירת המחדל היא הקפת הקצה הנגדי', () => {
    const m = render([{ pattern: P33, aircraft: [ac(1), ac(2), ac(3)], targets: [P15L] }]);
    expect(count(m, /data-testid="pattern-flip-row"/g)).toBe(3);
    // היעד דלוק בכל השורות, "ממשיך" כבוי
    expect(count(m, /data-testid="flip-row-move" data-active="1"/g)).toBe(3);
    expect(count(m, /data-testid="flip-row-keep" data-active="1"/g)).toBe(0);
  });

  it('#11 לקצה עם שתי הקפות - שני יעדים שמובחנים במספר', () => {
    const m = render([{ pattern: P33, aircraft: [ac(1)], targets: [P15L, P15R] }]);
    expect(count(m, /data-testid="flip-row-move"/g)).toBe(2);
    expect(m).toContain('15 (1)');
    expect(m).toContain('15 (2)');
  });

  it('#10 אין יעד פעיל - רק "ממשיך", והוסבר למה', () => {
    const m = render([{ pattern: P33, aircraft: [ac(1)], targets: [] }]);
    expect(count(m, /data-testid="flip-row-move"/g)).toBe(0);
    expect(m).toContain('data-testid="flip-row-keep" data-active="1"');
    expect(m).toContain('אין הקפה פעילה להעברה');
  });
});
