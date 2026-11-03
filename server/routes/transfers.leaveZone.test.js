// קבלת העברה מורידה את שיוך "עוזב אזור" של העמדה המוסרת.
// בקבלה אוטומטית (נקודה פקטיבית, ETA) אף עמדה לא ניקתה את השיוך, והאייקון
// "↗ עוזב" נשאר על מפת המוסר אחרי שהפ"מ כבר עבר.
import { describe, it, expect } from 'vitest';
import { acceptTransferTx } from './transfers.js';

function makeClient(transfer) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: text, params });
      if (text.includes('FROM strip_transfers WHERE id')) return { rows: [transfer] };
      if (text.includes("to_regclass('strip_zone_assignments')")) return { rows: [{ t: 'strip_zone_assignments' }] };
      return { rows: [] };
    },
  };
}
const t = (over = {}) => ({ id: 42, strip_id: 5, status: 'pending', to_sector_id: 3, to_workstation_id: null, to_preset_id: null, from_workstation_id: 7, target_x: 0, target_y: 0, ...over });
const leaveDeletes = c => c.calls.filter(x => x.sql.startsWith('DELETE FROM strip_zone_assignments'));

describe('acceptTransferTx - שיוך "עוזב אזור" של המוסר', () => {
  it('קבלה אוטומטית (בלי עמדה מקבלת) - השיוך של המוסר נמחק', async () => {
    const c = makeClient(t());
    await acceptTransferTx(c, 42, null, { mode: 'auto' });
    const d = leaveDeletes(c);
    expect(d).toHaveLength(1);
    expect(d[0].params).toEqual([5, 7]);
    expect(d[0].sql).toMatch(/status = 'עוזב אזור'/);
  });
  it('קבלה בעמדה אחרת - נמחק; בעמדה המוסרת עצמה - לא', async () => {
    const c1 = makeClient(t());
    await acceptTransferTx(c1, 42, 9);
    expect(leaveDeletes(c1)).toHaveLength(1);
    const c2 = makeClient(t());
    await acceptTransferTx(c2, 42, 7);
    expect(leaveDeletes(c2)).toHaveLength(0);
  });
});
