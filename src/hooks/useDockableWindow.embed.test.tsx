// חלון צף שמוצג **בתוך** משבצת של דסק משימה (שירות "טבלאות מתצוגה").
//
// אותו רכיב חלון בדיוק - בלי גרסה מקבילה לתחזק - ורק ה-hook משנה את אופיו:
// ממלא את המשבצת, לא נגרר, לא נכנס לקונטיינר ולא נשלח ב-portal ל-body.
// אין jsdom בפרויקט, ולכן renderToStaticMarkup (ראה component-tests-no-dom).

import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmbeddedWindow, useDockableWindow, type Dockable } from './useDockableWindow';
import { useDragPosition } from './useDragPosition';
import ElementsTableWindow from '../components/ground/ElementsTableWindow';

const Probe: React.FC<{ onDock: (d: Dockable, drag: ReturnType<typeof useDragPosition>) => void }> = ({ onDock }) => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(ref);
  const dock = useDockableWindow('probe', 'Probe');
  onDock(dock, drag);
  return dock.render(<div ref={ref} data-probe="1" style={{ position: 'fixed', left: 10, ...dock.rootStyle }} />);
};

describe('EmbeddedWindow', () => {
  it('מחוץ לדסק - החלון צף כרגיל', () => {
    let seen: Dockable | null = null;
    const html = renderToStaticMarkup(<Probe onDock={d => { seen = d; }} />);
    expect(seen!.embedded).toBe(false);
    expect(seen!.rootStyle).toBeUndefined();
    expect(html).toContain('position:fixed');
  });

  it('בתוך משבצת - ממלא אותה, לא עגין ולא צף', () => {
    let seen: Dockable | null = null;
    const html = renderToStaticMarkup(<EmbeddedWindow><Probe onDock={d => { seen = d; }} /></EmbeddedWindow>);
    expect(seen!.embedded).toBe(true);
    expect(seen!.docked).toBe(false);
    expect(seen!.dockAvailable).toBe(false);
    expect(seen!.slotEl).toBeNull();
    expect(html).toContain('position:relative');
    expect(html).toContain('width:100%');
    expect(html).toContain('height:100%');
    expect(html).not.toContain('position:fixed');
  });

  it('בתוך משבצת - ידית הגרירה אינה גוררת', () => {
    let drag: ReturnType<typeof useDragPosition> | null = null;
    renderToStaticMarkup(<EmbeddedWindow><Probe onDock={(_, g) => { drag = g; }} /></EmbeddedWindow>);
    expect(drag!.handleProps.style.cursor).not.toBe('move');
    // לחיצה על הידית לא זורקת ולא מתחילה גרירה
    expect(() => drag!.startDrag({ button: 0, clientX: 1, clientY: 1, pointerId: 1, currentTarget: {} } as any)).not.toThrow();
  });

  // טבלת האלמנטים מרונדרת תמיד ב-portal ל-body. בתוך משבצת זה היה מוציא
  // אותה מהדסק ומשאיר את המשבצת ריקה.
  it('טבלת האלמנטים נשארת בתוך המשבצת ובלי כפתור סגירה', () => {
    const html = renderToStaticMarkup(
      <EmbeddedWindow>
        <ElementsTableWindow rows={[]} themeMode="dark" onClose={() => {}} onUpdateStatus={() => {}} onUpdateDisplayState={() => {}} />
      </EmbeddedWindow>,
    );
    expect(html).toContain('data-testid="elements-table-window"');
    expect(html).toContain('position:relative');
    expect(html).not.toContain('✕');
  });
});
