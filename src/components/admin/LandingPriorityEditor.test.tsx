// אין jsdom בפרויקט, ולכן renderToStaticMarkup (ראה component-tests-no-dom).
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPriorityEditor, runwayEndsOf } from './LandingPriorityEditor';

const noop = () => {};

describe('runwayEndsOf - קצוות המסלולים של השדה', () => {
  it('שני הקצוות של כל מסלול, בסדר המסלולים, בלי ריקים ובלי כפילויות', () => {
    expect(runwayEndsOf([
      { heading_a: '08', heading_b: '26' },
      { heading_a: '15', heading_b: '' },
      { heading_a: '26', heading_b: '33' },
    ])).toEqual(['08', '26', '15', '33']);
  });
  it('בלי מסלולים - רשימה ריקה', () => {
    expect(runwayEndsOf(undefined)).toEqual([]);
  });
});

describe('LandingPriorityEditor', () => {
  it('הרשימה בסדר רץ עם מספר עדיפות, והמסלולים שנותרו להוספה', () => {
    const html = renderToStaticMarkup(
      <LandingPriorityEditor value={['26', '08']} runwayEnds={['08', '26', '15', '33']} onChange={noop} />,
    );
    const ranks = [...html.matchAll(/data-rank="(\d+)" data-runway="([^"]+)"/g)].map(m => `${m[1]}:${m[2]}`);
    expect(ranks).toEqual(['1:26', '2:08']);
    const addable = [...html.matchAll(/data-add-runway="([^"]+)"/g)].map(m => m[1]);
    expect(addable).toEqual(['15', '33']);
  });

  it('מסלול ברשימה שכבר לא קיים בשדה נשאר מוצג - לא נמחק בשקט', () => {
    const html = renderToStaticMarkup(
      <LandingPriorityEditor value={['27']} runwayEnds={['08', '26']} onChange={noop} />,
    );
    expect(html).toContain('data-runway="27"');
    expect(html).toContain('data-missing="true"');
  });

  it('שדה בלי מסלולים - הסבר במקום כפתורים ריקים', () => {
    const html = renderToStaticMarkup(<LandingPriorityEditor value={[]} runwayEnds={[]} onChange={noop} />);
    expect(html).toContain('data-no-runways="true"');
    expect(html).not.toContain('data-add-runway=');
  });
});
