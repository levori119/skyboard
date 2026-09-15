import { describe, it, expect } from 'vitest';
import { patternTrafficGroups } from './patternTraffic';

const PAT = { id: 7, runway_ident: '36', downwind_alt_ft: 3000, base_alt_ft: 1500, geometry: { anchor: { x: 50, y: 60 }, bearing: 0, side: 'right', rwyLen: 10, upwind: 5, width: 8, baseExt: 5 } };
const PAT2 = { ...PAT, id: 8, runway_ident: '18' };

const row = (over: Record<string, any>) => ({
  strip_id: 10, aircraft_idx: 1, in_pattern: true, pattern_id: 7, runway_ident: '36',
  flight_status: 'downwind', greens: false, callsign: 'בננה', ...over,
});

describe('patternTrafficGroups - טבלת "בהקפה"', () => {
  it('רק מי שבהקפה ולא נחת', () => {
    const g = patternTrafficGroups({
      aircraft: [row({}), row({ aircraft_idx: 2, in_pattern: false }), row({ aircraft_idx: 3, flight_status: 'landed' })],
      patterns: [PAT], trackAltByKey: new Map(), elevFt: 0,
    });
    expect(g.flatMap(x => x.rows).map(r => r.idx)).toEqual([1]);
  });

  it('מקובץ לפי מסלול נחיתה, ובלי מסלול - קבוצה אחרונה', () => {
    const g = patternTrafficGroups({
      aircraft: [row({ runway_ident: '' , pattern_id: null }), row({ strip_id: 11, runway_ident: '36' }), row({ strip_id: 12, runway_ident: '18', pattern_id: 8 })],
      patterns: [PAT, PAT2], trackAltByKey: new Map(), elevFt: 0,
    });
    expect(g.map(x => x.runwayIdent)).toEqual(['18', '36', '']);
  });

  it('ממוין לפי גובה, הגבוה ראשון; גובה הרכיב המשודך גובר על המתוכנן', () => {
    const g = patternTrafficGroups({
      aircraft: [
        row({ strip_id: 1, flight_status: 'final' }),      // מתוכנן: בין 1500 ל-0 → 750
        row({ strip_id: 2, flight_status: 'downwind' }),   // מתוכנן: 3000
        row({ strip_id: 3, flight_status: 'base' }),       // רכיב משודך: 4200
      ],
      patterns: [PAT], trackAltByKey: new Map([['3|1', 4200]]), elevFt: 0,
    });
    const rows = g[0].rows;
    expect(rows.map(r => r.stripId)).toEqual(['3', '2', '1']);
    expect(rows[0]).toMatchObject({ altFt: 4200, altSource: 'track' });
    expect(rows[1]).toMatchObject({ altFt: 3000, altSource: 'planned' });
  });

  it('גובה מתוכנן מוחלט = מעל השדה + גובה השדה', () => {
    const g = patternTrafficGroups({ aircraft: [row({})], patterns: [PAT], trackAltByKey: new Map(), elevFt: 500 });
    expect(g[0].rows[0].altFt).toBe(3500);
  });

  it('התראת ירוקים לפי אותו כלל של הבאנר', () => {
    const g = patternTrafficGroups({
      aircraft: [row({ flight_status: 'base', greens: false }), row({ strip_id: 2, flight_status: 'base', greens: true })],
      patterns: [PAT], trackAltByKey: new Map(), elevFt: 0,
    });
    const byStrip = Object.fromEntries(g[0].rows.map(r => [r.stripId, r.greensAlert]));
    expect(byStrip).toEqual({ 10: true, 2: false });
  });

  it('תווית = או"ק + מספר במבנה', () => {
    const g = patternTrafficGroups({ aircraft: [row({ aircraft_idx: 3 })], patterns: [PAT], trackAltByKey: new Map(), elevFt: 0 });
    expect(g[0].rows[0].label).toBe('בננה3');
  });
});
