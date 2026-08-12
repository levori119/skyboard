import { describe, it, expect } from 'vitest';
import { applyEvent } from './sync.js';
import { buildInsert, buildUpdate } from './sqlbuild.js';

// mock client: מתאים SQL לפי regex ומחזיר rows. שומר את כל הקריאות.
function mockClient(rules = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      for (const r of rules) {
        if (r.match.test(String(sql))) return { rows: r.rows || [], rowCount: (r.rows || []).length };
      }
      return { rows: [], rowCount: 0 };
    },
    find(re) { return this.calls.find(c => re.test(c.sql)); },
  };
}

describe('GAPI sqlbuild', () => {
  it('buildInsert בונה INSERT עם placeholders ו-RETURNING id', () => {
    const { sql, params } = buildInsert('strips', { callsign: 'חנית', gapi_id: 'g1' });
    expect(sql).toBe('INSERT INTO strips (callsign, gapi_id) VALUES ($1, $2) RETURNING id');
    expect(params).toEqual(['חנית', 'g1']);
  });
  it('buildUpdate בונה SET + WHERE עם הפרמטר האחרון', () => {
    const { sql, params } = buildUpdate('closures', { active: false, name: 'x' }, 'id', 5);
    expect(sql).toBe('UPDATE closures SET active = $1, name = $2 WHERE id = $3 RETURNING id');
    expect(params).toEqual([false, 'x', 5]);
  });
});

describe('GAPI sync — applyEvent', () => {
  it('upsert sortie חדש: מכניס שדות תפעוליים + gapi_*, פותר שדה תעופה, מדלג על פנימיים', async () => {
    const client = mockClient([
      { match: /FROM gapi_inbound_events WHERE event_id/, rows: [] },
      { match: /SELECT id, gapi_version FROM strips/, rows: [] },
      { match: /SELECT id FROM aviation_bases/, rows: [{ id: 3 }] },
      { match: /INSERT INTO strips/, rows: [{ id: 42 }] },
      { match: /INSERT INTO strip_aircraft \(/, rows: [{ id: 100 }] },
    ]);
    const event = {
      event_id: 'e1', entity: 'sortie', op: 'upsert', gapi_id: 'S-1', version: 5,
      data: {
        callsign: 'חנית', sq: '12', airborne: true, takeoff_airfield: 'RD',
        x: 999, on_map: true, held_by_workstation: 'w7', sector_id: 4,  // פנימיים — לא אמורים להיכתב
        aircraft: [{ idx: 1, datk: 3, kipa: '4', armaments: [{ name: 'פצצה', quantity: 2 }], systems: [{ name: 'ראדאר', status: 'שמיש' }] }],
      },
    };
    const r = await applyEvent(event, client);
    expect(r.status).toBe('applied');
    expect(r.op).toBe('insert');
    expect(r.localId).toBe(42);

    const ins = client.find(/INSERT INTO strips/);
    expect(ins.sql).toMatch(/callsign/);
    expect(ins.sql).toMatch(/gapi_id/);
    expect(ins.sql).toMatch(/gapi_version/);
    expect(ins.sql).toMatch(/gapi_synced_at/);
    expect(ins.sql).toMatch(/takeoff_airfield_id/);   // נפתר מ-'RD' → 3
    expect(ins.params).toContain(3);
    // שדות פנימיים לא נכתבו
    expect(ins.sql).not.toMatch(/on_map/);
    expect(ins.sql).not.toMatch(/held_by_workstation/);
    expect(ins.sql).not.toMatch(/sector_id/);
    // מטוס נוצר + חימוש/מערכת
    expect(client.find(/INSERT INTO strip_aircraft \(/)).toBeTruthy();
    expect(client.find(/INSERT INTO strip_aircraft_armaments/)).toBeTruthy();
    expect(client.find(/INSERT INTO strip_aircraft_systems/)).toBeTruthy();
    // דדופ נרשם
    expect(client.find(/INSERT INTO gapi_inbound_events/)).toBeTruthy();
  });

  it('טבלת המטוסים: זהות המטוס וצוות האוויר נכתבים, ושדות התקלה של SKY-KING לא נדרסים', async () => {
    const client = mockClient([
      { match: /FROM gapi_inbound_events WHERE event_id/, rows: [] },
      { match: /SELECT id, gapi_version FROM strips/, rows: [] },
      { match: /INSERT INTO strips/, rows: [{ id: 42 }] },
      { match: /INSERT INTO strip_aircraft \(/, rows: [{ id: 100 }] },
    ]);
    await applyEvent({
      event_id: 'e-ac', entity: 'sortie', op: 'upsert', gapi_id: 'S-2', version: 1,
      data: {
        callsign: 'בננה', number_of_formation: '2',
        aircraft: [
          { idx: 1, tail_number: '812', pilot_name: 'רון', navigator_name: 'דנה', sagol_1: '7', sagol_2: '9', datk: 3, kipa: '4' },
          { idx: 2, tail_number: '077' },
          // GAPI לא אמור לקבוע תקלה - היא דיווח של הבקר בעמדה
          { idx: 3, has_fault: true, fault_type: 'מנוע', fault_details: 'רעש חריג' },
        ],
      },
    }, client);

    const ac = client.find(/INSERT INTO strip_aircraft \(/);
    for (const col of ['tail_number', 'pilot_name', 'navigator_name', 'sagol_1', 'sagol_2', 'datk', 'kipa']) {
      expect(ac.sql).toMatch(new RegExp(col));
    }
    expect(ac.params).toEqual([42, 1, '812', 'רון', 'דנה', '7', '9', 3, '4']);
    // שדות התקלה פנימיים ל-SKY-KING: לא בעמודות ולא ב-SET
    expect(ac.sql).not.toMatch(/has_fault/);
    expect(ac.sql).not.toMatch(/fault_type/);
    expect(ac.sql).not.toMatch(/fault_details/);

    // מטוס עם שורה חלקית: מה שנעדר נכתב NULL (replace-set, לא מיזוג פר-שדה)
    const partial = client.calls.filter(c => /INSERT INTO strip_aircraft \(/.test(c.sql))[1];
    expect(partial.params).toEqual([42, 2, '077', null, null, null, null, null, null]);

    // מס"מ 3 → שלוש שורות, ומחיקה של כל idx שאינו ברשימה
    expect(client.calls.filter(c => /INSERT INTO strip_aircraft \(/.test(c.sql))).toHaveLength(3);
    const del = client.find(/DELETE FROM strip_aircraft WHERE strip_id=\$1 AND idx/);
    expect(del.params).toEqual([42, [1, 2, 3]]);
  });

  it('upsert קיים: משתמש ב-UPDATE לפי id', async () => {
    const client = mockClient([
      { match: /FROM gapi_inbound_events WHERE event_id/, rows: [] },
      { match: /SELECT id, gapi_version FROM serials/, rows: [{ id: 7, gapi_version: 2 }] },
    ]);
    const r = await applyEvent(
      { event_id: 'e2', entity: 'serial', op: 'upsert', gapi_id: 'SR-9', version: 5,
        data: { control_station: 'תא1', serial_number: 10, essence: 'מהות' } }, client);
    expect(r.status).toBe('applied');
    expect(r.op).toBe('update');
    const upd = client.find(/UPDATE serials SET/);
    expect(upd).toBeTruthy();
    expect(upd.sql).toMatch(/WHERE id = \$/);
    expect(upd.params).toContain(7);
  });

  it('גרסה ישנה → skipped, לא כותב', async () => {
    const client = mockClient([
      { match: /FROM gapi_inbound_events WHERE event_id/, rows: [] },
      { match: /SELECT id, gapi_version FROM base_statuses/, rows: [{ id: 1, gapi_version: 9 }] },
    ]);
    const r = await applyEvent(
      { event_id: 'e3', entity: 'base_status', op: 'upsert', gapi_id: 'B-1', version: 5, data: { name: 'x' } }, client);
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('stale-version');
    expect(client.find(/UPDATE base_statuses/)).toBeFalsy();
    expect(client.find(/INSERT INTO base_statuses/)).toBeFalsy();
  });

  it('אירוע כפול (event_id קיים) → skipped duplicate', async () => {
    const client = mockClient([
      { match: /FROM gapi_inbound_events WHERE event_id/, rows: [{ '?column?': 1 }] },
    ]);
    const r = await applyEvent(
      { event_id: 'dup', entity: 'closure', op: 'upsert', gapi_id: 'C-1', version: 1, data: { name: 'x' } }, client);
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('duplicate');
    expect(client.find(/INSERT INTO closures/)).toBeFalsy();
  });

  it('delete: מוחק לפי gapi_id', async () => {
    const client = mockClient([
      { match: /FROM gapi_inbound_events WHERE event_id/, rows: [] },
      { match: /DELETE FROM closures WHERE gapi_id/, rows: [] },
    ]);
    const r = await applyEvent(
      { event_id: 'e4', entity: 'closure', op: 'delete', gapi_id: 'C-9' }, client);
    expect(r.status).toBe('applied');
    expect(r.op).toBe('delete');
    expect(client.find(/DELETE FROM closures WHERE gapi_id/)).toBeTruthy();
  });

  it('weather בלי בסיס תואם → skipped', async () => {
    const client = mockClient([
      { match: /FROM gapi_inbound_events WHERE event_id/, rows: [] },
      { match: /SELECT id FROM base_statuses WHERE gapi_id/, rows: [] },
    ]);
    const r = await applyEvent(
      { event_id: 'e5', entity: 'weather', op: 'upsert', gapi_id: 'B-404', data: { pressure_inhg: 29.9 } }, client);
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('no-matching-base');
  });

  it('weather עם בסיס תואם → מעדכן תת-קבוצת שדות', async () => {
    const client = mockClient([
      { match: /FROM gapi_inbound_events WHERE event_id/, rows: [] },
      { match: /SELECT id FROM base_statuses WHERE gapi_id/, rows: [{ id: 8 }] },
    ]);
    const r = await applyEvent(
      { event_id: 'e6', entity: 'weather', op: 'upsert', gapi_id: 'B-8', data: { pressure_inhg: 29.92, atis_text: 'INFO A' } }, client);
    expect(r.status).toBe('applied');
    const upd = client.find(/UPDATE base_statuses SET/);
    expect(upd.sql).toMatch(/pressure_inhg/);
    expect(upd.sql).toMatch(/atis_text/);
    expect(upd.params).toContain(8);
  });

  it('ישות לא מוכרת → rejected', async () => {
    const client = mockClient();
    const r = await applyEvent({ event_id: 'e7', entity: 'nope', op: 'upsert', gapi_id: 'x' }, client);
    expect(r.status).toBe('rejected');
  });
});
