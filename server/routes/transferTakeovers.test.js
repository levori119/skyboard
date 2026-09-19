// לקיחת פ"מ שכבר בנקודת העברה - ההתחייבויות שאסור לשבור בשקט:
//   1. העברה של העמדה עצמה (או של עמדה שהיא מכסה) אינה התנגשות.
//   2. אישור מבטל את ההעברה הקיימת **ואז** שולח את החדשה - אף פעם לא שתיהן פתוחות.
//   3. דחייה לא נוגעת בשום העברה.
//   4. ההעברה הקיימת נסגרה בינתיים (התקבלה) - לא לוקחים, הבקשה "stale".
//   5. רק שני הצדדים מכריעים, ורק פעם אחת.
import { describe, it, expect } from 'vitest';
import { findConflictingTransfer, decideTakeoverTx, transferHolderPresetId } from './transferTakeovers.js';

function makeClient({ transfer = null, request = null, openTransfer = undefined } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: text, params });
      if (text.startsWith('SELECT * FROM strip_transfers WHERE strip_id')) return { rows: transfer ? [transfer] : [] };
      if (text.includes('FROM transfer_takeover_requests r WHERE r.id')) return { rows: request ? [request] : [] };
      if (text.startsWith('SELECT * FROM strip_transfers WHERE id')) {
        const t = openTransfer === undefined ? transfer : openTransfer;
        return { rows: t ? [t] : [] };
      }
      if (text.startsWith('UPDATE transfer_takeover_requests SET status')) return { rows: [{ ...request, status: params[0], decided_side: params[2] }] };
      if (text.startsWith('INSERT INTO strip_transfers')) return { rows: [{ id: 99, strip_id: params[0] }] };
      if (text.startsWith('SELECT * FROM strips WHERE id')) return { rows: [{ id: 5, sector_id: 3 }] };
      return { rows: [] };
    },
  };
}
const has = (c, needle) => c.calls.some(x => x.sql.includes(needle));
const idx = (c, needle) => c.calls.findIndex(x => x.sql.includes(needle));

const T = { id: 40, strip_id: 5, status: 'pending', from_workstation_id: 1, from_preset_id: null, to_sector_id: 8 };
const REQ = (over = {}) => ({
  id: 7, strip_id: 5, status: 'pending', expired: false, existing_transfer_id: 40,
  holder_preset_id: 1, requester_preset_id: 2, kind: 'sector',
  payload: { toSectorId: 9, fromWorkstationId: 2, workstationId: 2 }, ...over,
});

describe('findConflictingTransfer', () => {
  it('אין העברה פתוחה - אין התנגשות', async () => {
    expect(await findConflictingTransfer(makeClient(), 5, [2])).toBeNull();
  });
  it('העברה פתוחה מעמדה אחרת - התנגשות', async () => {
    expect(await findConflictingTransfer(makeClient({ transfer: T }), 5, [2])).toEqual(T);
  });
  it('העברה שלי (או של עמדה שאני מכסה) - לא התנגשות', async () => {
    expect(await findConflictingTransfer(makeClient({ transfer: T }), 5, [2, 1])).toBeNull();
  });
  it('העברה ישירה לעמדה - המחזיקה היא from_preset_id', () => {
    expect(transferHolderPresetId({ from_preset_id: 4, from_workstation_id: null })).toBe(4);
  });
});

describe('decideTakeoverTx', () => {
  it('אישור - מבטל את הקיימת לפני שליחת החדשה', async () => {
    const c = makeClient({ transfer: T, request: REQ() });
    const r = await decideTakeoverTx(c, 7, { decision: 'approve', presetId: 2 });
    expect(r.status).toBe('approved');
    const cancel = idx(c, "UPDATE strip_transfers SET status = 'cancelled'");
    const insert = idx(c, 'INSERT INTO strip_transfers');
    expect(cancel).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(cancel);
    expect(r.newTransfer.id).toBe(99);
  });

  it('אישור מהעמדה המחזיקה - אותו מסלול', async () => {
    const c = makeClient({ transfer: T, request: REQ() });
    const r = await decideTakeoverTx(c, 7, { decision: 'approve', presetId: 1 });
    expect(r.status).toBe('approved');
    expect(r.request.decided_side).toBe('holder');
  });

  it('העברה ישירה לעמדה - נשלחת כ-preset', async () => {
    const c = makeClient({ transfer: T, request: REQ({ kind: 'preset', payload: { fromPresetId: 2, toPresetId: 6 } }) });
    await decideTakeoverTx(c, 7, { decision: 'approve', presetId: 2 });
    const ins = c.calls.find(x => x.sql.startsWith('INSERT INTO strip_transfers'));
    expect(ins.sql).toContain('from_preset_id, to_preset_id');
    expect(ins.params).toEqual([5, 2, 6]);
  });

  it('דחייה - אף העברה לא נוגעים בה', async () => {
    const c = makeClient({ transfer: T, request: REQ() });
    const r = await decideTakeoverTx(c, 7, { decision: 'deny', presetId: 1 });
    expect(r.status).toBe('denied');
    expect(has(c, 'UPDATE strip_transfers')).toBe(false);
    expect(has(c, 'INSERT INTO strip_transfers')).toBe(false);
  });

  it('ההעברה הקיימת כבר נסגרה - stale, לא לוקחים', async () => {
    const c = makeClient({ transfer: T, request: REQ(), openTransfer: null });
    const r = await decideTakeoverTx(c, 7, { decision: 'approve', presetId: 2 });
    expect(r.code).toBe(409);
    expect(r.error).toBe('stale');
    expect(has(c, 'INSERT INTO strip_transfers')).toBe(false);
  });

  it('בקשה שפגה - לא מבצעת', async () => {
    const c = makeClient({ transfer: T, request: REQ({ expired: true }) });
    const r = await decideTakeoverTx(c, 7, { decision: 'approve', presetId: 2 });
    expect(r.error).toBe('expired');
    expect(has(c, 'INSERT INTO strip_transfers')).toBe(false);
  });

  it('עמדה שלישית - לא יכולה להכריע', async () => {
    const c = makeClient({ transfer: T, request: REQ() });
    const r = await decideTakeoverTx(c, 7, { decision: 'approve', presetId: 3 });
    expect(r.code).toBe(403);
  });

  it('הוכרעה כבר - לא מכריעים פעמיים', async () => {
    const c = makeClient({ transfer: T, request: REQ({ status: 'denied' }) });
    const r = await decideTakeoverTx(c, 7, { decision: 'approve', presetId: 2 });
    expect(r.error).toBe('already_decided');
    expect(has(c, 'INSERT INTO strip_transfers')).toBe(false);
  });
});
