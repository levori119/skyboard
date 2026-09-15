import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JoiningPointPanel, { type JoiningPointView } from './JoiningPointPanel';

// הגדרת הנקודה "הצג מטוסים פרוסים" קובעת איך הטבלה נפתחת בעמדה,
// והגרירה בטבלה היא Pointer Events בלבד (בלי HTML5 draggable שחוטף את העכבר).

const noop = () => {};
const point = (over: Partial<JoiningPointView> = {}): JoiningPointView => ({
  id: 3, name: 'STAR', alt_min_ft: 4000, alt_max_ft: 6000, default_step_ft: 1000, steps: [], ...over,
});
const assigned = [{ strip_id: 7, alt: '050', planned_alt: '050', callsign: 'BANANA', number_of_formation: 2 }];

const render = (p: JoiningPointView) => renderToStaticMarkup(
  <JoiningPointPanel
    point={p} incoming={[]} assigned={assigned as any} aircraft={[]} landingRunways={[]}
    onAcceptIncoming={noop} onAssign={noop} onRemoveStrip={noop} onCoordinate={noop}
    onUpdateAircraft={noop} onFlightStatus={noop} onCollapse={noop}
  />,
);

const count = (html: string, testId: string) => html.split(`data-testid="${testId}"`).length - 1;

describe('JoiningPointPanel - פריסת מטוסים כברירת מחדל', () => {
  it('ברירת מחדל: הפ"מ מכווץ, אין שורות מטוסים', () => {
    const html = render(point());
    expect(count(html, 'joining-formation')).toBe(1);
    expect(count(html, 'joining-aircraft')).toBe(0);
  });

  it('expand_aircraft: כל מטוסי המבנה פרוסים מיד', () => {
    const html = render(point({ expand_aircraft: true }));
    expect(count(html, 'joining-aircraft')).toBe(2);
  });
});

describe('JoiningPointPanel - ידיות הגרירה', () => {
  it('לשורת הפ"מ יש ידית נפרדת מהמטוסים, ואין HTML5 draggable', () => {
    const html = render(point({ expand_aircraft: true }));
    expect(count(html, 'joining-formation-handle')).toBe(1);
    expect(html.includes('draggable="true"')).toBe(false);
  });
});
