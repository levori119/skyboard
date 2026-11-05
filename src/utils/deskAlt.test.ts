import { describe, it, expect } from 'vitest';
import { isForeignToDesk, deskAltEntry, withDeskAlt, handoverAltOf, sameAlt, levelAllowed, receiveAltViolations } from './deskAlt';

const ME = 7;

describe('isForeignToDesk - הפ"מ אצל עמדה אחרת', () => {
  it('עמדה אחרת מחזיקה / בדרך אליי בהעברה - כן; אצלי או בלי מחזיק - לא', () => {
    expect(isForeignToDesk({ workstation_preset_id: 3, status: 'active' }, ME)).toBe(true);
    expect(isForeignToDesk({ workstation_preset_id: ME, status: 'pending_transfer' }, ME)).toBe(true);
    expect(isForeignToDesk({ workstation_preset_id: ME, status: 'active' }, ME)).toBe(false);
    expect(isForeignToDesk({ workstation_preset_id: null, status: 'active' }, ME)).toBe(false);
    expect(isForeignToDesk({ workstation_preset_id: 3 }, null)).toBe(false);
  });
});

describe('withDeskAlt - הגובה כפי שהדסק רואה אותו', () => {
  it('פ"מ של עמדה אחרת בלי גובה דסק - בלי גובה, וגובה הקבלה נשמר בצד', () => {
    const s: any = withDeskAlt({ id: 's1', alt: '340', workstation_preset_id: 3 }, ME);
    expect(s.alt).toBe('');
    expect(s._receiveAlt).toBe('340');
  });

  it('עם גובה דסק - הגובה של הדסק; של דסק אחר לא משפיע', () => {
    const base = { id: 's1', alt: '340', workstation_preset_id: 3, table_alts: { '7': { alt: '220', to_sender: true }, '9': { alt: '150' } } };
    expect(withDeskAlt(base, ME).alt).toBe('220');
    expect(withDeskAlt(base, 9).alt).toBe('150');
    expect(deskAltEntry(base, ME)).toEqual({ alt: '220', to_sender: true, receive_alt: null });
    expect(deskAltEntry(base, 11)).toBeNull();
  });

  it('גובה קבלה/מסירה - של הדסק כשנקבע, אחרת הגובה שעל הפ"מ; גובה המרחב נפרד ממנו', () => {
    const base = { id: 's1', alt: '340', workstation_preset_id: 3, table_alts: { '7': { alt: '220', receive_alt: '300' } } };
    const s = withDeskAlt(base, ME);
    expect(s.alt).toBe('220');
    expect(handoverAltOf(s)).toBe('300');
    expect(handoverAltOf(withDeskAlt({ ...base, table_alts: { '7': { alt: '220' } } }, ME))).toBe('340');
    // רק גובה קבלה, בלי גובה מרחב - הרשומה קיימת והפ"מ בלי גובה במרחב
    const onlyRecv = withDeskAlt({ ...base, table_alts: { '7': { alt: null, receive_alt: '300' } } }, ME);
    expect(onlyRecv.alt).toBe('');
    expect(deskAltEntry(onlyRecv, ME)?.receive_alt).toBe('300');
    // פ"מ שאצלי - שני הגבהים הם הגובה שעליו
    expect(handoverAltOf({ alt: '250' })).toBe('250');
  });

  it('פ"מ שאצלי - הגובה האמיתי, גם כשנשארה רשומת דסק', () => {
    const s = { id: 's1', alt: '340', workstation_preset_id: ME, status: 'active', table_alts: { '7': { alt: '220' } } };
    expect(withDeskAlt(s, ME)).toBe(s);
  });
});

describe('sameAlt', () => {
  it('אותו גובה בכתיבות שונות; ריק מול גובה - שונה', () => {
    expect(sameAlt('FL120', '120')).toBe(true);
    expect(sameAlt('12000', '120')).toBe(true);
    expect(sameAlt('240-250', '240-250')).toBe(true);
    expect(sameAlt('', null)).toBe(true);
    expect(sameAlt('', '120')).toBe(false);
    expect(sameAlt('120', '130')).toBe(false);
  });
});

describe('levelAllowed - זוגיות לפי האלפים', () => {
  it('טווח וזוגיות', () => {
    const odd = { alt_min: 120, alt_max: 340, parity: 'odd' as const };
    expect(levelAllowed(130, odd)).toBe(true);
    expect(levelAllowed(140, odd)).toBe(false);
    expect(levelAllowed(110, odd)).toBe(false);
    expect(levelAllowed(350, odd)).toBe(false);
    expect(levelAllowed(240, { alt_min: null, alt_max: null, parity: 'even' })).toBe(true);
  });
});

describe('receiveAltViolations - חריגה מגבהי הקבלה בנקודת ההעברה', () => {
  const me = {
    id: ME,
    relevant_sectors: [],
    classic_transfer_points: [
      { sector_id: 100, ranges: [{ preset_id: ME, alt_min: 120, alt_max: 340, parity: 'odd' }, { preset_id: 3, alt_min: 10, alt_max: 50 }] },
      { sector_id: 200, ranges: [] },
    ],
    classic_receive_points: [{ sector_id: 300, alt_min: 200, alt_max: 250 }],
  };

  it('גובה מחוץ לכלל שלי בנקודה - חריגה; כלל של עמדה אחרת אינו נבדק', () => {
    const v = receiveAltViolations('140', me);
    expect(v.map(x => x.sectorId).sort()).toEqual([100, 300]);
    expect(receiveAltViolations('230', me).map(x => x.sectorId)).toEqual([]);
  });

  it('רק הנקודות המשותפות לעמדה המוסרת', () => {
    const sender = { id: 3, relevant_sectors: [300] };
    expect(receiveAltViolations('140', me, sender).map(x => x.sectorId)).toEqual([300]);
    expect(receiveAltViolations('210', me, sender)).toEqual([]);
  });

  it('רביעייה - כל גבהי המבנה צריכים להיות מותרים', () => {
    const sender = { id: 3, relevant_sectors: [300] };
    expect(receiveAltViolations('240-250', me, sender)).toEqual([]);
    expect(receiveAltViolations('240-260', me, sender).map(x => x.sectorId)).toEqual([300]);
  });

  it('בלי גובה / בלי עמדה - אין חריגה', () => {
    expect(receiveAltViolations('', me)).toEqual([]);
    expect(receiveAltViolations('140', null)).toEqual([]);
  });
});
