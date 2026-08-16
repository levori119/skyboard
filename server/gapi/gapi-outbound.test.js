import { describe, it, expect } from 'vitest';
import { buildOutboundEvent } from './outbox.js';
import { bodyTouchesOperational, SORTIE_OP_FIELDS } from './hooks.js';

describe('GAPI outbound — buildOutboundEvent', () => {
  it('upsert: מוציא רק שדות תפעוליים + gapi_id/version משורת DB', () => {
    const row = {
      id: 5, gapi_id: 'S-9', gapi_version: 3,
      callsign: 'חנית', airborne: true, sq: '7',
      x: 111, on_map: true, held_by_workstation: 'w1', // פנימיים — לא יוצאים
    };
    const ev = buildOutboundEvent('sortie', 'upsert', row);
    expect(ev.op).toBe('upsert');
    expect(ev.gapi_id).toBe('S-9');
    expect(ev.version).toBe(3);
    expect(ev.data.callsign).toBe('חנית');
    expect(ev.data.airborne).toBe(true);
    expect('x' in ev.data).toBe(false);
    expect('on_map' in ev.data).toBe(false);
    expect('held_by_workstation' in ev.data).toBe(false);
  });

  it('delete: משתמש ב-gapiId שנשמר', () => {
    const ev = buildOutboundEvent('closure', 'delete', null, 'C-3');
    expect(ev).toEqual({ entity: 'closure', op: 'delete', gapi_id: 'C-3' });
  });
});

describe('GAPI outbound — bodyTouchesOperational', () => {
  it('שדה תפעולי → true', () => {
    expect(bodyTouchesOperational({ callSign: 'x' }, SORTIE_OP_FIELDS)).toBe(true);
    expect(bodyTouchesOperational({ airborne: true }, SORTIE_OP_FIELDS)).toBe(true);
  });
  it('רק שדות פנימיים (מיקום) → false (לא מסנכרן החוצה)', () => {
    expect(bodyTouchesOperational({ x: 10, y: 20, onMap: true }, SORTIE_OP_FIELDS)).toBe(false);
    expect(bodyTouchesOperational({}, SORTIE_OP_FIELDS)).toBe(false);
    expect(bodyTouchesOperational(null, SORTIE_OP_FIELDS)).toBe(false);
  });
  it('עריכת טבלת נקודות מכוון בעמדה → true (אחרת השינוי נתקע ב-SKYKING בשקט)', () => {
    expect(bodyTouchesOperational({ targets: [{ name: 'אלפא', aim_point: 'א1' }] }, SORTIE_OP_FIELDS)).toBe(true);
    expect(bodyTouchesOperational({ targets: [] }, SORTIE_OP_FIELDS)).toBe(true);
  });
});

describe('GAPI outbound — טבלת המטוסים יוצאת עם הפ"מ', () => {
  const row = { id: 5, gapi_id: 'S-9', gapi_version: 3, callsign: 'חנית', x: 111 };

  it('aircraft[] נכלל באירוע היוצא עם זהות המטוס, הצוות, החימושים והמערכות', () => {
    const ev = buildOutboundEvent('sortie', 'upsert', row, null, [
      {
        idx: 1, tail_number: '812', pilot_name: 'רון', navigator_name: 'דנה',
        sagol_1: '7', sagol_2: '9', datk: 3, kipa: '4',
        armaments: [{ name: 'פצצה', quantity: 2 }],
        systems: [{ name: 'ראדאר', status: 'שמיש' }],
      },
    ]);
    expect(ev.data.aircraft).toEqual([{
      idx: 1, tail_number: '812', pilot_name: 'רון', navigator_name: 'דנה',
      sagol_1: '7', sagol_2: '9', datk: 3, kipa: '4',
      armaments: [{ name: 'פצצה', quantity: 2 }],
      systems: [{ name: 'ראדאר', status: 'שמיש' }],
    }]);
  });

  it('שדות התקלה של SKY-KING לא יוצאים ל-GAPI', () => {
    const ev = buildOutboundEvent('sortie', 'upsert', row, null, [
      { idx: 1, has_fault: true, fault_type: 'מנוע', fault_details: 'רעש חריג', greens: true, flight_status: 'downwind' },
    ]);
    for (const f of ['has_fault', 'fault_type', 'fault_details', 'greens', 'flight_status']) {
      expect(f in ev.data.aircraft[0]).toBe(false);
    }
  });

  it('בלי שורות מטוסים - המפתח לא נכלל כלל (היעדר ≠ "אין מטוסים")', () => {
    expect('aircraft' in buildOutboundEvent('sortie', 'upsert', row).data).toBe(false);
    expect(buildOutboundEvent('sortie', 'upsert', row, null, []).data.aircraft).toEqual([]);
  });
});

describe('GAPI outbound — טבלת נקודות מכוון יוצאת עם הפ"מ', () => {
  it('aim_points נכללות באירוע היוצא, ושדות פנימיים לא', () => {
    const aim = [{ name: 'אלפא', aim_point: 'א1', coord: 'N3212.4500/E03456.8200', bombs: '2' }];
    const ev = buildOutboundEvent('sortie', 'upsert', {
      id: 5, gapi_id: 'S-9', gapi_version: 3, callsign: 'חנית',
      targets: JSON.stringify(aim), x: 111,
    });
    expect(ev.data.aim_points).toEqual(aim);
    expect('x' in ev.data).toBe(false);
  });
});
