import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransferTakeoverCard, HeldElsewhereCard } from './TransferTakeoverDialog';
import type { TransferTakeoverRequest } from '../../utils/transferTakeover';

// ההתחייבויות של החלון, לא העיצוב:
//   1. בקשה פתוחה נסגרת רק בהכרעה - אין ✕.
//   2. כל צד רואה את הניסוח שלו ואת שני הכפתורים שלו.
//   3. תוצאה מוצגת לצד שלא הכריע עם כפתור אישור בלבד.

const REQ = (over: Partial<TransferTakeoverRequest> = {}): TransferTakeoverRequest => ({
  id: 1, strip_id: 5, callsign: 'ע101', existing_transfer_id: 40,
  holder_preset_id: 1, holder_name: 'צפון', existing_point_label: 'אלפא', existing_dest_name: 'מרכז',
  requester_preset_id: 2, requester_name: 'דרום', new_point_label: 'בראבו', new_dest_name: 'מערב',
  kind: 'sector', status: 'pending', decided_side: null, created_at: '2026-09-19T10:00:00Z', decided_at: null,
  ...over,
});
/** renderToStaticMarkup בורח מגרשיים - בלי זה בדיקות על "פ"מ" עוברות תמיד */
const esc = (t: string) => t.replace(/"/g, '&quot;');
const render = (over: Partial<TransferTakeoverRequest>, presetId: number) => renderToStaticMarkup(
  <TransferTakeoverCard request={REQ(over)} presetId={presetId} themeMode="dark" onDecide={() => {}} onAckOutcome={() => {}} />,
);

describe('TransferTakeoverCard', () => {
  it('גוררת - טופס תיאום עם שני הכפתורים של האפיון', () => {
    const html = render({}, 2);
    expect(html).toContain(esc('פ"מ ע101 נמצא בעמדה צפון ונגרר לנקודת העברה אלפא בדרך לעמדה מרכז'));
    expect(html).toContain('בוצע תיאום ומאושר להעביר');
    expect(html).toContain('לא אושר');
    expect(html).not.toContain('✕');
  });

  it('מחזיקה - מי גורר, לאן, ומה המצב אצלה', () => {
    const html = render({}, 1);
    expect(html).toContain(esc('פ"מ ע101 נמצא בעמדה דרום ונגרר לנקודת העברה בראבו בדרך לעמדה מערב'));
    expect(html).toContain('לנקודת העברה אלפא ולעמדה מרכז');
    expect(html).toContain('אל תאשר');
    expect(html).not.toContain('✕');
  });

  it('תוצאה לגוררת כשהמחזיקה דחתה - כפתור אישור בלבד', () => {
    const html = render({ status: 'denied', decided_side: 'holder' }, 2);
    expect(html).toContain('עמדה צפון לא אישרה');
    expect(html).not.toContain('בוצע תיאום ומאושר להעביר');
  });

  it('תוצאה למחזיקה כשהגוררת אישרה בתיאום - ההקצאה שלה בוטלה', () => {
    const html = render({ status: 'approved', decided_side: 'requester' }, 1);
    expect(html).toContain('ההקצאה שלך בנקודת העברה אלפא בוטלה');
  });

  it('העברה ישירה לעמדה - בלי נקודה ריקה', () => {
    const html = render({ new_point_label: '' }, 1);
    expect(html).toContain('העברה ישירה');
  });
});

describe('HeldElsewhereCard', () => {
  it('הנוסח של האפיון, עם כל העמדות', () => {
    const html = renderToStaticMarkup(
      <HeldElsewhereCard notices={[{ stripId: 's5', callsign: 'ע101', others: ['צפון', 'מרכז'] }]} themeMode="light" onDismiss={() => {}} />,
    );
    expect(html).toContain(esc('שים לב פ"מ ע101 נמצא גם בעמדה צפון, מרכז'));
  });
  it('אין הודעות - לא מרנדר כלום', () => {
    expect(renderToStaticMarkup(<HeldElsewhereCard notices={[]} themeMode="dark" onDismiss={() => {}} />)).toBe('');
  });
});
