import { describe, it, expect } from 'vitest';
import {
  takeoverRole, pickTakeoverToShow, isHeldByMe, otherHolders, diffHeldElsewhere, stripKeyOfTransfer,
  type TransferTakeoverRequest,
} from './transferTakeover';

const REQ = (over: Partial<TransferTakeoverRequest> = {}): TransferTakeoverRequest => ({
  id: 1, strip_id: 5, callsign: 'ע101', existing_transfer_id: 40,
  holder_preset_id: 1, holder_name: 'צפון', existing_point_label: 'אלפא', existing_dest_name: 'מרכז',
  requester_preset_id: 2, requester_name: 'דרום', new_point_label: 'בראבו', new_dest_name: 'מערב',
  kind: 'sector', status: 'pending', decided_side: null, created_at: '2026-09-19T10:00:00Z', decided_at: null,
  ...over,
});

describe('takeoverRole', () => {
  it('מזהה גוררת ומחזיקה', () => {
    expect(takeoverRole(REQ(), 2)).toBe('requester');
    expect(takeoverRole(REQ(), 1)).toBe('holder');
    expect(takeoverRole(REQ(), 3)).toBeNull();
    expect(takeoverRole(REQ(), null)).toBeNull();
  });
});

describe('pickTakeoverToShow', () => {
  it('בקשה פתוחה קודמת לתוצאה, גם אם התוצאה ותיקה יותר', () => {
    const list = [REQ({ id: 1, status: 'denied' }), REQ({ id: 2 })];
    const { current, queued } = pickTakeoverToShow(list, 2);
    expect(current?.id).toBe(2);
    expect(queued).toBe(1);
  });
  it('מסתיר את מה שכבר טופל מקומית', () => {
    expect(pickTakeoverToShow([REQ({ id: 1 })], 2, new Set([1])).current).toBeNull();
  });
});

describe('isHeldByMe / otherHolders', () => {
  it('בדסק שלי - לפי table_preset_ids', () => {
    expect(isHeldByMe({ id: 's5', table_preset_ids: [2] }, 2, 'דרום')).toBe(true);
  });
  it('פ"מ שממתין בנקודת העברה אליי - עוד לא אצלי', () => {
    expect(isHeldByMe({ id: 's5', status: 'pending_transfer', workstation_preset_id: 2 }, 2, 'דרום')).toBe(false);
  });
  it('העמדות האחרות - בלי אני ובלי כפילויות', () => {
    expect(otherHolders({ id: 's5', at_preset_names: ['דרום', 'צפון', 'צפון'] }, 'דרום')).toEqual(['צפון']);
  });
});

describe('diffHeldElsewhere', () => {
  const strip = { id: 's5', callSign: 'ע101', table_preset_ids: [2], at_preset_names: ['דרום', 'צפון'] };

  it('סבב ראשון - לומד בלי הודעות', () => {
    const r = diffHeldElsewhere(null, [strip], 2, 'דרום');
    expect(r.held.has('s5')).toBe(true);
    expect(r.notices).toEqual([]);
  });

  it('פ"מ חדש אצלי שמוחזק גם בעמדה אחרת - הודעה', () => {
    const r = diffHeldElsewhere(new Set(), [strip], 2, 'דרום');
    expect(r.notices).toEqual([{ stripId: 's5', callsign: 'ע101', others: ['צפון'] }]);
  });

  it('פ"מ שכבר היה אצלי - אין הודעה חוזרת', () => {
    expect(diffHeldElsewhere(new Set(['s5']), [strip], 2, 'דרום').notices).toEqual([]);
  });

  it('הגיע דרך קבלת העברה - אין הודעה', () => {
    expect(diffHeldElsewhere(new Set(), [strip], 2, 'דרום', new Set(['s5'])).notices).toEqual([]);
  });

  it('רק אצלי - אין הודעה', () => {
    const solo = { ...strip, at_preset_names: ['דרום'] };
    expect(diffHeldElsewhere(new Set(), [solo], 2, 'דרום').notices).toEqual([]);
  });

  it('עמדה אחרת גררה פ"מ שלי - ההודעה אצלה, לא אצלי', () => {
    // אצלי הוא כבר היה; עכשיו at_preset_names גדל - לא "חדש אצלי"
    expect(diffHeldElsewhere(new Set(['s5']), [strip], 2, 'דרום').notices).toEqual([]);
  });
});

describe('stripKeyOfTransfer', () => {
  it('מספר -> s-מפתח, ומפתח נשאר', () => {
    expect(stripKeyOfTransfer({ strip_id: 5 })).toBe('s5');
    expect(stripKeyOfTransfer({ strip_id: 's5' })).toBe('s5');
  });
});
