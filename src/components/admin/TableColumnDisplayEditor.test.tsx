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
  // 🎨 מעצב את השורה הראשונה: עיצוב והצגת הערך פתוחים, והשורה השנייה מקופלת לכפתור
  it('עמודה רגילה - עיצוב והצגת הערך, והשורה השנייה מקופלת עד שפותחים אותה', () => {
    const html = renderToStaticMarkup(<TableColumnDisplayEditor col={{ key: 'callSign' }} onChange={noop} catalogFields={[]} />);
    expect(html).toContain('data-sk="decor"');
    expect(html).toContain('data-sk="display"');
    expect(html).toContain('data-testid="second-line-toggle"');
    expect(html.includes('data-sk="second"')).toBe(false);
  });
  it('עמודה עם שורה שנייה - הכפתור המקופל מציג את שמה, בלי לפתוח את העורך שלה', () => {
    const html = renderToStaticMarkup(<TableColumnDisplayEditor col={{ key: 'callSign', second: { key: 'sq', label: 'טייסת' } }} onChange={noop} catalogFields={[]} />);
    expect(html).toContain('טייסת');
    expect(html.includes('data-sk="second"')).toBe(false);
  });
  it('עורך השורה השנייה עצמה - בלי שורה שלישית', () => {
    const html = renderToStaticMarkup(<TableColumnDisplayEditor col={{ key: 'sq' }} onChange={noop} catalogFields={[]} allowSecond={false} />);
    expect(html).toContain('data-sk="decor"');
    expect(html.includes('data-sk="second"')).toBe(false);
    expect(html.includes('second-line-toggle')).toBe(false);
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

describe('TableColumnDisplayEditor - כלל "זמן מעכשיו"', () => {
  it('כל כלל מציע בורר בין התאמת ערך לזמן מעכשיו', () => {
    const html = renderToStaticMarkup(
      <TableColumnDisplayEditor col={{ key: 'takeoffTime', decor: [{ id: 'r1', match: '*', shape: 'box', color: '#ef4444' }] }} onChange={noop} catalogFields={[]} />,
    );
    expect(html).toContain('data-sk="decor-cond"');
    expect(html).toContain('value="timeFromNow"');
  });
  it('כלל זמן - יותר/פחות מ, כמות ויחידה במקום שדה הערך', () => {
    const html = renderToStaticMarkup(
      <TableColumnDisplayEditor col={{ key: 'takeoffTime', decor: [{ id: 'r1', match: '*', cond: 'timeFromNow', cmp: 'gt', amount: 45, unit: 'h', shape: 'box', color: '#ef4444' }] }} onChange={noop} catalogFields={[]} />,
    );
    expect(html).toContain('data-sk="decor-time"');
    expect(html).toContain('value="45"');
    expect(html).toContain('<option value="gt" selected="">');
    expect(html).toContain('<option value="h" selected="">');
  });
});
