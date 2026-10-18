// מכונת המצבים של ההעברה (ביקורת קוד #3, ממצא 4).
//
// קבל / קבל-למפה / דחה / בטל קראו את ההעברה בלי לנעול אותה ובלי לבדוק את
// הסטטוס שלה. כמה עמדות רואות את אותה העברה (סקטור), ולכן:
//   - שתי עמדות שלחצו "קבל" כמעט יחד - **שתיהן** הצליחו. הפ"מ ישב בשתיהן.
//   - המוסר ביטל מכרטיס ישן העברה שכבר התקבלה - הפ"מ חזר אליו וגם נשאר אצל המקבל.
//   - קבלה של העברה שכבר נדחתה או בוטלה - עברה.
// התיקון: `SELECT ... FOR UPDATE` (העמדה השנייה ממתינה לראשונה ואז רואה את
// הסטטוס החדש), והעברה שכבר נסגרה אינה נוגעת בשום פ"מ.
import { describe, it, expect } from 'vitest';
import { acceptTransferTx, closeTransferTx, TRANSFER_OPEN_STATUSES } from './transfers.js';

/** client מזויף שמתעד כל קריאה. */
function makeClient({ transfer = null, strip = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: text, params });
      if (text.includes('FROM strip_transfers WHERE id')) return { rows: transfer ? [transfer] : [] };
      if (text.includes('FROM strips WHERE id')) return { rows: strip ? [strip] : [] };
      return { rows: [] };
    },
  };
}

const count = (c, needle) => c.calls.filter(x => x.sql.includes(needle)).length;
const find = (c, needle) => c.calls.find(x => x.sql.includes(needle));
const writes = c => c.calls.filter(x => /^(UPDATE|INSERT|DELETE)/.test(x.sql));

const transfer = (over = {}) => ({
  id: 42, strip_id: 5, status: 'pending',
  to_sector_id: 3, to_workstation_id: null, to_preset_id: null,
  from_workstation_id: 7, from_preset_id: null, target_x: 0, target_y: 0,
  ...over,
});

describe('הסטטוסים הפתוחים', () => {
  it('רק pending ו-acknowledged פתוחים לקבלה, דחייה וביטול', () => {
    expect([...TRANSFER_OPEN_STATUSES].sort()).toEqual(['acknowledged', 'pending']);
  });
});

describe('acceptTransferTx - נעילה וסטטוס', () => {
  it('ההעברה נקראת עם FOR UPDATE - קבלה מקבילה ממתינה לראשונה', async () => {
    const c = makeClient({ transfer: transfer() });
    await acceptTransferTx(c, 42, 9);
    expect(find(c, 'FROM strip_transfers WHERE id').sql).toMatch(/FOR UPDATE/);
  });

  for (const status of ['accepted', 'rejected', 'cancelled']) {
    it(`העברה שכבר ${status} - notOpen, ושום פ"מ לא זז`, async () => {
      const c = makeClient({ transfer: transfer({ status }) });
      const r = await acceptTransferTx(c, 42, 9);
      expect(r.notOpen).toBe(true);
      expect(r.status).toBe(status);
      expect(writes(c)).toEqual([]);
    });
  }

  it('acknowledged עדיין ניתנת לקבלה', async () => {
    const c = makeClient({ transfer: transfer({ status: 'acknowledged' }) });
    const r = await acceptTransferTx(c, 42, 9);
    expect(r.notOpen).toBeFalsy();
    expect(find(c, 'UPDATE strip_transfers').params[0]).toBe('accepted');
  });
});

describe('closeTransferTx - דחייה וביטול', () => {
  it('העברה שאינה קיימת - notFound, בלי כתיבה', async () => {
    const c = makeClient({});
    expect(await closeTransferTx(c, 42, 'rejected')).toMatchObject({ notFound: true });
    expect(writes(c)).toEqual([]);
  });

  it('נועלת את ההעברה (FOR UPDATE)', async () => {
    const c = makeClient({ transfer: transfer() });
    await closeTransferTx(c, 42, 'cancelled');
    expect(find(c, 'FROM strip_transfers WHERE id').sql).toMatch(/FOR UPDATE/);
  });

  it('דחייה של העברה פתוחה - הפ"מ חוזר למוסר וההעברה rejected עם ההערה', async () => {
    const c = makeClient({ transfer: transfer(), strip: { on_map: false, in_table: true } });
    const r = await closeTransferTx(c, 42, 'rejected', { note: 'אין מקום' });
    expect(r.notFound).toBe(false);
    expect(r.notOpen).toBeFalsy();
    expect(r.transfer.id).toBe(42);
    expect(find(c, 'UPDATE strips SET status').params).toEqual(['queued', 7, 5]);
    const upd = find(c, 'UPDATE strip_transfers');
    expect(upd.params).toContain('rejected');
    expect(upd.params).toContain('אין מקום');
  });

  it('ביטול של העברה פתוחה - ההעברה cancelled', async () => {
    const c = makeClient({ transfer: transfer(), strip: { on_map: true, in_table: false } });
    await closeTransferTx(c, 42, 'cancelled');
    expect(find(c, 'UPDATE strips SET status').params[0]).toBe('active');
    expect(find(c, 'UPDATE strip_transfers').params).toContain('cancelled');
  });

  // התרחיש שדווח בביקורת: המוסר מבטל מכרטיס ישן אחרי שהמקבל כבר קיבל
  for (const status of ['accepted', 'rejected', 'cancelled']) {
    it(`העברה שכבר ${status} - לא מחזירה את הפ"מ למוסר`, async () => {
      const c = makeClient({ transfer: transfer({ status }) });
      const r = await closeTransferTx(c, 42, 'cancelled');
      expect(r.notOpen).toBe(true);
      expect(r.status).toBe(status);
      expect(count(c, 'UPDATE strips')).toBe(0);
      expect(writes(c)).toEqual([]);
    });
  }

  it('סוג סגירה לא מוכר - נזרק, לא נכתב סטטוס שרירותי', async () => {
    const c = makeClient({ transfer: transfer() });
    await expect(closeTransferTx(c, 42, 'accepted')).rejects.toThrow();
    expect(writes(c)).toEqual([]);
  });
});
