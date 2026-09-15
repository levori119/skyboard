// FLOW של פ"מ - הלוגיקה הטהורה בלקוח (שרשרת השלבים והמתארים לתרגום).
import { describe, it, expect } from 'vitest';
import { flowChain, flowEventDescriptor, flowCurrentDescriptor, formatAircraft, type FlowEvent } from './stripFlow';

const ev = (id: number, kind: string, at: string, extra: Partial<FlowEvent> = {}): FlowEvent => ({
  id, kind, strip_id: 5, occurred_at: at, callsign: 'בננה', preset_id: null, preset_name: null,
  point_label: null, crew_member_name: null, details: {}, inherited: false, ...extra,
});

describe('flowChain - השרשרת המרוכזת', () => {
  it('הדוגמה מהאפיון: דת"ק -> הסעה -> המראה -> נקודת העברה -> עמדה -> עמדה', () => {
    const events = [
      ev(1, 'created', '2026-09-15T10:30:00Z', { preset_name: 'מגדל חצור' }),
      ev(2, 'ground_point', '2026-09-15T11:00:00Z', { point_label: 'עמדת המתנה', details: { fromPointType: 'datk', fromPointName: 'דת"ק 8' } }),
      ev(3, 'taxi', '2026-09-15T11:15:00Z'),
      ev(4, 'lineup', '2026-09-15T11:18:00Z'),
      ev(5, 'takeoff', '2026-09-15T11:20:00Z', { details: { runway: '33' } }),
      ev(6, 'transfer_sent', '2026-09-15T11:20:30Z', { point_label: 'פלמח' }),
      ev(7, 'accepted', '2026-09-15T11:22:00Z', { preset_name: '305', point_label: 'פלמח' }),
      ev(8, 'transfer_sent', '2026-09-15T11:40:00Z', { point_label: null, details: { toPresetName: 'בת"ק עזה' } }),
      ev(9, 'accepted', '2026-09-15T11:41:00Z', { preset_name: 'בת"ק עזה' }),
      ev(10, 'accepted', '2026-09-15T12:00:00Z', { preset_name: '306' }),
    ];
    expect(flowChain(events).map(s => [s.kind, s.label])).toEqual([
      ['datk', 'דת"ק 8'],
      ['taxi', null],
      ['takeoff', '33'],
      ['point', 'פלמח'],
      ['station', '305'],
      ['station', 'בת"ק עזה'],
      ['station', '306'],
    ]);
  });

  it('השלב נושא את שעת האירוע', () => {
    const chain = flowChain([ev(3, 'taxi', '2026-09-15T11:15:00Z')]);
    expect(chain[0].at).toBe('2026-09-15T11:15:00Z');
  });

  it('קבלה חוזרת באותה עמדה ברצף - שלב אחד', () => {
    const chain = flowChain([
      ev(1, 'accepted', '2026-09-15T11:00:00Z', { preset_name: '305' }),
      ev(2, 'accepted', '2026-09-15T11:05:00Z', { preset_name: '305' }),
    ]);
    expect(chain).toHaveLength(1);
  });

  it('נחיתה של כמה מטוסים - שלב אחד', () => {
    const chain = flowChain([
      ev(1, 'landed', '2026-09-15T13:00:00Z', { details: { aircraft: [1] } }),
      ev(2, 'landed', '2026-09-15T13:01:00Z', { details: { aircraft: [2] } }),
    ]);
    expect(chain.map(s => s.kind)).toEqual(['landed']);
  });

  it('נקודה בשדה שאינה יציאה מדת"ק, דחייה וביטול - לא בשרשרת (רק בפירוט)', () => {
    const chain = flowChain([
      ev(1, 'ground_point', '2026-09-15T11:00:00Z', { point_label: 'X', details: { fromPointType: 'waiting' } }),
      ev(2, 'rejected', '2026-09-15T11:01:00Z'),
      ev(3, 'cancelled', '2026-09-15T11:02:00Z'),
    ]);
    expect(chain).toEqual([]);
  });

  it('הסעה חוזרת אחרי הסעה (מטוס שני במבנה) - שלב אחד', () => {
    const chain = flowChain([
      ev(1, 'taxi', '2026-09-15T11:00:00Z', { details: { aircraft: [1] } }),
      ev(2, 'taxi', '2026-09-15T11:02:00Z', { details: { aircraft: [2] } }),
    ]);
    expect(chain).toHaveLength(1);
  });
});

describe('formatAircraft', () => {
  it('רשימת מטוסים כמו על הסדק: 1+2', () => {
    expect(formatAircraft([2, 1])).toBe('1+2');
    expect(formatAircraft(undefined)).toBe('');
    expect(formatAircraft([])).toBe('');
  });
});

describe('flowEventDescriptor - מפתח תרגום ופרמטרים', () => {
  it('המראה עם מסלול', () => {
    expect(flowEventDescriptor(ev(1, 'takeoff', 'x', { details: { runway: '33' } })))
      .toEqual({ key: 'flow.evTakeoffRunway', params: { runway: '33' } });
  });
  it('המראה בלי מסלול', () => {
    expect(flowEventDescriptor(ev(1, 'takeoff', 'x'))).toEqual({ key: 'flow.evTakeoff', params: {} });
  });
  it('קבלה - עם אופן הקבלה', () => {
    expect(flowEventDescriptor(ev(1, 'accepted', 'x', { preset_name: '305', details: { mode: 'auto' } })))
      .toEqual({ key: 'flow.evAcceptedAuto', params: { station: '305' } });
    expect(flowEventDescriptor(ev(1, 'accepted', 'x', { preset_name: '305', details: { mode: 'map' } })))
      .toEqual({ key: 'flow.evAcceptedMap', params: { station: '305' } });
    expect(flowEventDescriptor(ev(1, 'accepted', 'x', { preset_name: '305' })))
      .toEqual({ key: 'flow.evAccepted', params: { station: '305' } });
  });
  it('שליחה לנקודת העברה מול העברה ישירה לעמדה', () => {
    expect(flowEventDescriptor(ev(1, 'transfer_sent', 'x', { point_label: 'פלמח' })))
      .toEqual({ key: 'flow.evSentPoint', params: { point: 'פלמח' } });
    expect(flowEventDescriptor(ev(1, 'transfer_sent', 'x', { details: { toPresetName: '306' } })))
      .toEqual({ key: 'flow.evSentStation', params: { station: '306' } });
  });
  it('יציאה מדת"ק', () => {
    expect(flowEventDescriptor(ev(1, 'ground_point', 'x', { point_label: 'המתנה', details: { fromPointType: 'datk', fromPointName: 'דת"ק 8' } })))
      .toEqual({ key: 'flow.evLeftDatk', params: { from: 'דת"ק 8', point: 'המתנה' } });
  });
  it('סוג לא מוכר - לא נופל', () => {
    expect(flowEventDescriptor(ev(1, 'weird', 'x'))).toEqual({ key: 'flow.evUnknown', params: { kind: 'weird' } });
  });
});

describe('flowCurrentDescriptor - "נמצא עכשיו"', () => {
  it('בנקודת העברה עם עמדת יעד', () => {
    expect(flowCurrentDescriptor({ kind: 'at_point', point: 'פלמח', toPresetName: '305', fromPresetName: 'מגדל', airborne: true }))
      .toEqual({ key: 'flow.nowAtPointTo', params: { point: 'פלמח', station: '305' } });
  });
  it('בעמדה עם סטטוס קרקעי', () => {
    expect(flowCurrentDescriptor({ kind: 'at_station', presetName: 'מגדל', airborne: false, groundStatus: 'taxi' }))
      .toEqual({ key: 'flow.nowAtStationGround', params: { station: 'מגדל' }, groundStatus: 'taxi' });
  });
  it('נחת / לא ידוע', () => {
    expect(flowCurrentDescriptor({ kind: 'landed' })).toEqual({ key: 'flow.nowLanded', params: {} });
    expect(flowCurrentDescriptor(null)).toEqual({ key: 'flow.nowUnknown', params: {} });
  });
});
