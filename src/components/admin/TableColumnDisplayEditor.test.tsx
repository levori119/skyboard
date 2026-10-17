// אין jsdom בפרויקט, ולכן renderToStaticMarkup (ראה component-tests-no-dom).
// הבדיקות כאן חיוביות בלבד (toContain) - שלילה על פלט שבורח מגרשיים עוברת תמיד.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TableColumnDisplayEditor from './TableColumnDisplayEditor';
import DisplayIcon from '../shared/DisplayIcon';

const noop = () => {};

describe('DisplayIcon', () => {
  it('אייקון מובנה - צללית SVG בצבע שנמסר ולא בלבן הקשיח של המפה', () => {
    const html = renderToStaticMarkup(<DisplayIcon iconRef="builtin:f16" icons={[]} color="#123456" size={20} />);
    expect(html).toContain('<svg');
    expect(html).toContain('fill="#123456"');
  });
  it('תמונה מטבלת האייקונים', () => {
    const html = renderToStaticMarkup(
      <DisplayIcon iconRef="img:5" icons={[{ id: 5, name: 'baz', image_data: 'data:image/png;base64,AAAA' }]} color="#000" />,
    );
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });
  it('אייקון שנמחק / הפניה פגומה - כלום (התא נופל לטקסט)', () => {
    expect(renderToStaticMarkup(<DisplayIcon iconRef="img:99" icons={[]} color="#000" />)).toBe('');
    expect(renderToStaticMarkup(<DisplayIcon iconRef="bogus" icons={[]} color="#000" />)).toBe('');
  });
});

describe('TableColumnDisplayEditor', () => {
  it('עמודה רגילה - שלושת החלקים: שורה שנייה, עיצוב, הצגת הערך', () => {
    const html = renderToStaticMarkup(<TableColumnDisplayEditor col={{ key: 'callSign' }} onChange={noop} catalogFields={[]} />);
    expect(html).toContain('data-sk="second"');
    expect(html).toContain('data-sk="decor"');
    expect(html).toContain('data-sk="display"');
  });
  it('עורך השורה השנייה עצמה - בלי שורה שלישית', () => {
    const html = renderToStaticMarkup(<TableColumnDisplayEditor col={{ key: 'sq' }} onChange={noop} catalogFields={[]} allowSecond={false} />);
    expect(html).toContain('data-sk="decor"');
    expect(html.includes('data-sk="second"')).toBe(false);
  });
  it('כלל עיצוב מוצג עם דוגמה חיה בצבע שלו', () => {
    const html = renderToStaticMarkup(
      <TableColumnDisplayEditor col={{ key: 'sq', decor: [{ id: 'r1', match: '119', shape: 'circle', color: '#ef4444' }] }} onChange={noop} catalogFields={[]} />,
    );
    expect(html).toContain('value="119"');
    expect(html).toContain('#ef4444');
  });
  it('תצוגת אייקון - שורות המיפוי מוצגות', () => {
    const html = renderToStaticMarkup(
      <TableColumnDisplayEditor col={{ key: 'sq', display: 'icon', iconMap: { 'F-16': 'builtin:f16' } }} onChange={noop} catalogFields={[]} />,
    );
    expect(html).toContain('value="F-16"');
    expect(html).toContain('<svg');
  });
});
