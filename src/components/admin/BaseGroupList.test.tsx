// אין jsdom בפרויקט, ולכן renderToStaticMarkup (ראה component-tests-no-dom).
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BaseGroupList } from './BaseGroupList';
import type { BaseItemGroup } from '../../utils/presetGroups';

const groups = [
  { key: 'b1', baseId: 1, baseName: 'רמת דוד', items: ['ITEM-A'] },
  { key: 'b2', baseId: 2, baseName: 'חצרים', items: ['ITEM-B'] },
] as unknown as BaseItemGroup<string>[];

const render = (props: { defaultOpen?: boolean }) => renderToStaticMarkup(
  <BaseGroupList groups={groups} {...props} renderItems={items => <span>{items.join(',')}</span>} />,
);

describe('BaseGroupList - מצב פתיחה ראשוני', () => {
  it('ברירת מחדל - הקבוצות פתוחות (מפות, בלוקים)', () => {
    const html = render({});
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('ITEM-A');
  });

  it('defaultOpen=false - כל הבסיסים מכווצים והפריטים לא מרונדרים', () => {
    const html = render({ defaultOpen: false });
    expect(html).not.toContain('aria-expanded="true"');
    expect(html.match(/aria-expanded="false"/g)?.length).toBe(2);
    expect(html).not.toContain('ITEM-A');
    expect(html).not.toContain('ITEM-B');
    expect(html).toContain('data-base-name="רמת דוד"');
  });

  it('בסיס יחיד - אין כותרת לקפל, הפריטים מוצגים גם כש-defaultOpen=false', () => {
    const html = renderToStaticMarkup(
      <BaseGroupList groups={[groups[0]]} defaultOpen={false} renderItems={items => <span>{items.join(',')}</span>} />,
    );
    expect(html).toContain('ITEM-A');
  });
});
