import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollapsedStripsBadge } from './CollapsedStripsBadge';

// חלון הפ"מים המכווץ נראה אותו דבר בכל עמדה - גם בעמדת שדה (GroundView)
// וגם בסרגל הרגיל (SectorDashboard). לפני הרכיב המשותף עמדת השדה המשיכה לצייר
// את כרטיסי הפ"מים בתוך עמודה של 32px, והם יצאו מלבנים ריקים.
describe('CollapsedStripsBadge', () => {
  it('מציג את מספר הפ"מים במאגר', () => {
    const html = renderToStaticMarkup(<CollapsedStripsBadge count={4} onOpen={() => {}} />);
    expect(html).toContain('4');
    expect(html).toContain('vertical-rl');
  });

  it('לא מצייר כלום כשאין פ"מים', () => {
    expect(renderToStaticMarkup(<CollapsedStripsBadge count={0} onOpen={() => {}} />)).toBe('');
  });

  it('מציג ממתינים לקבלה רק כשיש כאלה', () => {
    const none = renderToStaticMarkup(<CollapsedStripsBadge count={2} onOpen={() => {}} />);
    const some = renderToStaticMarkup(<CollapsedStripsBadge count={2} incomingCount={3} onOpen={() => {}} />);
    expect(none.match(/vertical-rl/g)).toHaveLength(1);
    expect(some.match(/vertical-rl/g)).toHaveLength(2);
  });

  it('מציג ממתינים לקבלה גם כשהמאגר ריק - העברה נכנסת לא נעלמת בכיווץ', () => {
    const html = renderToStaticMarkup(<CollapsedStripsBadge count={0} incomingCount={1} onOpen={() => {}} />);
    expect(html.match(/vertical-rl/g)).toHaveLength(1);
  });
});
