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
  it('במצב רגיל לשורת הפ"מ יש ידית נפרדת מהמטוסים, ואין HTML5 draggable', () => {
    const html = render(point());
    expect(count(html, 'joining-formation-handle')).toBe(1);
    expect(html.includes('draggable="true"')).toBe(false);
  });
});

describe('JoiningPointPanel - מטוסים בלבד (expand_aircraft)', () => {
  it('אין שורת פ"מ - רק שורות המטוסים', () => {
    const html = render(point({ expand_aircraft: true }));
    expect(count(html, 'joining-formation-handle')).toBe(0);
    expect(count(html, 'joining-aircraft')).toBe(2);
    expect(count(html, 'joining-expand-toggle')).toBe(0);
  });

  it('פעולות הפ"מ (תפריט והסרה) נשארות זמינות - פעם אחת למבנה', () => {
    const html = render(point({ expand_aircraft: true }));
    expect(count(html, 'joining-formation-menu')).toBe(1);
    expect(count(html, 'joining-formation-remove')).toBe(1);
  });

  it('פ"מ בלי מספר מטוסים ידוע לא נעלם - נשארת שורת הפ"מ', () => {
    const html = renderToStaticMarkup(
      <JoiningPointPanel
        point={point({ expand_aircraft: true })} incoming={[]} aircraft={[]} landingRunways={[]}
        assigned={[{ strip_id: 9, alt: '050', planned_alt: '050', callsign: 'X', number_of_formation: null }] as any}
        onAcceptIncoming={noop} onAssign={noop} onRemoveStrip={noop} onCoordinate={noop}
        onUpdateAircraft={noop} onFlightStatus={noop} onCollapse={noop}
      />,
    );
    expect(count(html, 'joining-formation-handle')).toBe(1);
  });
});

describe('JoiningPointPanel - תפריט המצב במקום "שים בהקפה"', () => {
  it('אין כפתור "שים בהקפה" - התפריט מחזיק את "הצטרפות" כברירת מחדל', () => {
    const html = render(point({ expand_aircraft: true }));
    expect(html.includes('שים בהקפה')).toBe(false);
    expect(count(html, 'flight-leg')).toBe(2);
    // תווית קצרה: השורה צפופה, והבורר צריך להיות צר
    expect(html).toMatch(/<option value="none" selected="">הצטרפות<\/option>/);
  });

  it('בורר המסלול: "מסלול" ולא "בחר מסלול" - תווית קצרה לשדה צר', () => {
    const html = renderToStaticMarkup(
      <JoiningPointPanel
        point={point({ expand_aircraft: true })} incoming={[]} assigned={assigned as any} aircraft={[]}
        landingRunways={[{ ident: '36' }]}
        onAcceptIncoming={noop} onAssign={noop} onRemoveStrip={noop} onCoordinate={noop}
        onUpdateAircraft={noop} onFlightStatus={noop} onCollapse={noop}
      />,
    );
    expect(html).toMatch(/<option value=""[^>]*>מסלול<\/option>/);
    expect(html).not.toMatch(/<option value=""[^>]*>בחר מסלול<\/option>/);
  });

  it('בלי מסלול - צלעות ההקפה נעולות, "נחת" לא', () => {
    const html = render(point({ expand_aircraft: true }));
    expect(html).toMatch(/<option value="downwind" disabled="">/);
    expect(html).not.toMatch(/<option value="landed" disabled="">/);
  });

  it('קו מפריד עבה בין בלוקים', () => {
    expect(render(point())).toContain('border-bottom:2px solid #64748b');
  });
});

describe('JoiningPointPanel - מאפייני הנקודה בעמדה', () => {
  const renderWith = (extra: Record<string, unknown>) => renderToStaticMarkup(
    <JoiningPointPanel
      point={point()} incoming={[]} assigned={assigned as any} aircraft={[]} landingRunways={[]}
      onAcceptIncoming={noop} onAssign={noop} onRemoveStrip={noop} onCoordinate={noop}
      onUpdateAircraft={noop} onFlightStatus={noop} onCollapse={noop}
      {...extra}
    />,
  );

  it('כפתור המאפיינים מופיע כשהעמדה יכולה לשמור בחירה', () => {
    expect(count(renderWith({ onSetAircraftOnly: noop }), 'joining-props-toggle')).toBe(1);
  });

  it('בלי יכולת שמירה - אין כפתור שנדלק בלי שקורה משהו', () => {
    expect(count(renderWith({}), 'joining-props-toggle')).toBe(0);
  });

  it('המאפיינים סגורים כברירת מחדל - לא גוזלים שטח מהטבלה', () => {
    expect(count(renderWith({ onSetAircraftOnly: noop }), 'joining-props')).toBe(0);
  });
});

describe('JoiningPointPanel - מסלול אוטומטי מול ידני, וסידור מחדש לפי דת"קים', () => {
  const renderWith = (aircraft: any[], extra: Record<string, unknown> = {}) => renderToStaticMarkup(
    <JoiningPointPanel
      point={point({ expand_aircraft: true })} incoming={[]} assigned={assigned as any} aircraft={aircraft}
      landingRunways={[{ ident: '26' }, { ident: '33' }]}
      onAcceptIncoming={noop} onAssign={noop} onRemoveStrip={noop} onCoordinate={noop}
      onUpdateAircraft={noop} onFlightStatus={noop} onCollapse={noop} {...extra}
    />,
  );

  it('כל בורר מסלול מסומן לפי המקור: אוטומטי, ידני, או בלי מסלול', () => {
    const html = renderWith([
      { strip_id: 7, aircraft_idx: 1, runway_ident: '26', runway_auto: true },
      { strip_id: 7, aircraft_idx: 2, runway_ident: '33', runway_auto: false },
    ]);
    expect([...html.matchAll(/data-runway-source="([a-z]+)"/g)].map(m => m[1])).toEqual(['auto', 'manual']);
    expect(count(html, 'joining-runway-auto')).toBe(1);
    expect(count(html, 'joining-runway-manual')).toBe(1);
  });

  it('מטוס בלי מסלול - אין תג', () => {
    const html = renderWith([]);
    expect(html.includes('data-runway-source=')).toBe(false);
  });

  it('כפתור "סדר מחדש לפי דת"קים" בכותרת רק כשיש פעולה', () => {
    expect(count(renderWith([]), 'joining-reorder-runways')).toBe(0);
    expect(count(renderWith([], { onReorderRunways: noop }), 'joining-reorder-runways')).toBe(1);
  });
});
