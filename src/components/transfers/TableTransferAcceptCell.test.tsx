import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableTransferAcceptCell } from './TableTransferAcceptCell';
import { tr } from '../../i18n/tr';

// מה שנבדק: מה המפעיל רואה בתא בכל מצב של הפ"מ - לא העיצוב.
const esc = (t: string) => t.replace(/"/g, '&quot;');
const POINTS = [{ id: 10, name: 'פלמח' }, { id: 11, name: 'גדרה' }];
const render = (state: any) => renderToStaticMarkup(
  <TableTransferAcceptCell state={state} transferPoints={POINTS} onAccept={() => {}} onPickPoint={() => {}} themeMode="dark" />,
);

describe('TableTransferAcceptCell', () => {
  it('בנקודת העברה אליי - כפתור קבל וזמן הגעה', () => {
    const html = render({ kind: 'accept', transfer: { id: 1, eta_minutes: 5, eta_set_at: new Date().toISOString() } });
    expect(html).toContain(esc(tr('transfers.tableAccept')));
    expect(html).toContain('⏱');
    expect(html).not.toContain(esc(tr('transfers.tableTransferToStation')));
  });

  it('בלי זמן מוגדר - קבל בלבד, בלי שעון', () => {
    const html = render({ kind: 'accept', transfer: { id: 1 } });
    expect(html).toContain(esc(tr('transfers.tableAccept')));
    expect(html).not.toContain('⏱');
  });

  it('פ"מ שאצלי - העבר לעמדה (הרשימה סגורה עד הלחיצה)', () => {
    const html = render({ kind: 'send' });
    expect(html).toContain(esc(tr('transfers.tableTransferToStation')));
    expect(html).not.toContain('פלמח');
  });

  it('בדרך ממני - ממתין לקבלה עם שם הנקודה', () => {
    const html = render({ kind: 'pending', transfer: { id: 3, to_sector_id: 11 } });
    expect(html).toContain(esc(tr('transfers.tableAwaitingAccept')));
    expect(html).toContain('גדרה');
  });

  it('נדחה - מסומן כנדחה', () => {
    const html = render({ kind: 'rejected', transfer: { id: 4, to_sector_id: 10 } });
    expect(html).toContain(esc(tr('transfers.tableTransferRejected')));
  });
});
