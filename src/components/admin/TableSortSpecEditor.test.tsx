// אין jsdom בפרויקט, ולכן renderToStaticMarkup (ראה component-tests-no-dom).
// הבדיקות חיוביות בלבד (toContain / ספירה) - שלילה על פלט שבורח מגרשיים עוברת תמיד.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TableSortSpecEditor from './TableSortSpecEditor';

const fields = [{ key: 'task', label: 'משימה' }, { key: 'alt', label: 'גובה' }, { key: 'callSign', label: 'אוק' }];
const count = (html: string, s: string) => html.split(s).length - 1;

describe('TableSortSpecEditor', () => {
  it('בלי רמות - הודעה וכפתור הוספה', () => {
    const html = renderToStaticMarkup(<TableSortSpecEditor spec={[]} fields={fields} onChange={() => {}} />);
    expect(html).toContain('data-testid="table-mode-sort-add"');
    expect(count(html, 'data-testid="table-mode-sort-level"')).toBe(0);
  });

  it('רמה לכל שדה לפי הסדר, עם הכיוון שלה', () => {
    const html = renderToStaticMarkup(
      <TableSortSpecEditor spec={[{ key: 'task', dir: 'asc' }, { key: 'alt', dir: 'desc' }]} fields={fields} onChange={() => {}} />,
    );
    expect(count(html, 'data-testid="table-mode-sort-level"')).toBe(2);
    expect(html.indexOf('value="task" selected')).toBeLessThan(html.indexOf('value="alt" selected'));
    expect(html).toContain('↓');
    expect(html).toContain('↑');
  });

  it('כל השדות בשימוש - אין כפתור הוספה', () => {
    const all = fields.map(f => ({ key: f.key, dir: 'asc' as const }));
    const html = renderToStaticMarkup(<TableSortSpecEditor spec={all} fields={fields} onChange={() => {}} />);
    expect(count(html, 'data-testid="table-mode-sort-add"')).toBe(0);
  });

  it('שדה שהוסר מהמוד עדיין מוצג ברמה שלו (לא נעלם בשקט)', () => {
    const html = renderToStaticMarkup(<TableSortSpecEditor spec={[{ key: 'gone', dir: 'asc' }]} fields={fields} onChange={() => {}} />);
    expect(html).toContain('value="gone" selected');
  });
});
