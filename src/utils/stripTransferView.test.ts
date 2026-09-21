import { describe, it, expect } from 'vitest';
import { projectStripsForStation } from './stripTransferView';

// המקרה שנשבר בשטח (2026-09-21): או"ק "דחליל" הוחזק גם בבת"ק אריק וגם בבת"ק בגין.
// אריק שלח אותו לנקודת העברה - והוא **נעלם גם מבגין**, כי `status='pending_transfer'`
// הוא גלובלי בזמן שההחזקה היא פר-עמדה.

const ARIK = 1, BEGIN = 2, DEST = 3;
const strip = (over = {}) => ({
  id: 's7', status: 'pending_transfer', on_map: false, in_table: true,
  workstation_preset_id: DEST, table_preset_ids: [ARIK, BEGIN], at_preset_names: ['אריק', 'בגין'],
  ...over,
});
const T = [{ strip_id: 7, from_workstation_id: ARIK, to_workstation_id: DEST, from_preset_id: null, to_preset_id: null }];
const project = (ids: number[], names: string[], rows = [strip()], transfers = T) =>
  projectStripsForStation(rows as any, ids, names, transfers as any)[0] as any;

describe('projectStripsForStation', () => {
  it('בגין - מחזיקה ואינה צד: פ"מ רגיל לגמרי, כאילו לא נשלח', () => {
    const s = project([BEGIN], ['בגין']);
    expect(s.status).toBe('queued');
    expect(s.workstation_preset_id).toBe(BEGIN);
    expect(s.raw_status).toBe('pending_transfer');
    expect(s.raw_workstation_preset_id).toBe(DEST);
  });

  it('בגין, והפ"מ על המפה - חוזר כ-active ולא כ-queued', () => {
    const s = project([BEGIN], ['בגין'], [strip({ on_map: true, in_table: false })]);
    expect(s.status).toBe('active');
  });

  it('אריק - השולח: נשאר "בהעברה" (יוצא מהדסק עד קבלה או דחייה)', () => {
    expect(project([ARIK], ['אריק']).status).toBe('pending_transfer');
  });

  it('עמדה שמכסה את אריק באיחוד - נחשבת השולח', () => {
    expect(project([9, ARIK], ['מכסה', 'אריק']).status).toBe('pending_transfer');
  });

  it('העמדה המקבלת - נשאר "בהעברה" (כרטיס נכנס)', () => {
    expect(project([DEST], ['יעד']).status).toBe('pending_transfer');
  });

  it('עמדה שכלל אינה מחזיקה - לא נוגעים', () => {
    const s = project([8], ['זרה'], [strip({ table_preset_ids: [ARIK], at_preset_names: ['אריק'] })]);
    expect(s.status).toBe('pending_transfer');
  });

  it('מחזיקה דרך אזור בלבד (בלי שורת דסק) - גם היא ממשיכה לראות', () => {
    const s = project([BEGIN], ['בגין'], [strip({ table_preset_ids: [ARIK] })]);
    expect(s.status).toBe('queued');
  });

  it('ההעברה עוד לא ברשימה - לא מנחשים, משאירים כמו שהוא', () => {
    expect(project([BEGIN], ['בגין'], [strip()], []).status).toBe('pending_transfer');
  });

  it('העברה ישירה לעמדה (from_preset_id) - אותה הכרעה', () => {
    const t = [{ strip_id: 7, from_preset_id: ARIK, to_preset_id: DEST }];
    expect(project([ARIK], ['אריק'], [strip()], t).status).toBe('pending_transfer');
    expect(project([BEGIN], ['בגין'], [strip()], t).status).toBe('queued');
  });

  it('פ"מ שאינו בהעברה - מוחזר כמו שהוא, בלי העתקה', () => {
    const rows = [strip({ status: 'active' })];
    expect(projectStripsForStation(rows as any, [BEGIN], ['בגין'], T as any)[0]).toBe(rows[0]);
  });

  it('אין עמדה (סשן אד-הוק) - הרשימה חוזרת כמו שהיא', () => {
    const rows = [strip()];
    expect(projectStripsForStation(rows as any, [], [], T as any)).toBe(rows);
  });
});
