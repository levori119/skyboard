import { describe, it, expect } from 'vitest';
import { autotrackInputs, fieldTraffic, patternGeoOf } from './patternTrackInputs';
import type { MapGeoAnchor } from '../utils/geo';

// עוגן לינארי: 0% = (32,35), 100% = (32.1,35.1)
const ANCHOR: MapGeoAnchor = { x1: 0, y1: 0, lat1: 32.1, lon1: 35, x2: 100, y2: 100, lat2: 32, lon2: 35.1 };
const POINT = { id: 3, x_pct: 50, y_pct: 50 };

const base = {
  joiningPoints: [POINT],
  joiningPointStrips: [] as Record<string, any>[],
  joiningPointAircraft: [] as Record<string, any>[],
  stripAircraft: {} as Record<string, any[]>,
  presetId: 5,
  anchor: ANCHOR,
};

describe('autotrackInputs - שורות ה-DB למנוע', () => {
  it('פ"מ שממתין בנקודה: כל מטוסי המבנה, עם נ"צ הנקודה', () => {
    const r = autotrackInputs({
      ...base,
      joiningPointStrips: [{ strip_id: 10, joining_point_id: 3, callsign: 'בננה', number_of_formation: '2', workstation_preset_id: 5 }],
    });
    expect(r.strips).toEqual([{ stripId: '10', callSign: 'בננה', formationSize: 2, indices: null }]);
    expect(r.aircraft.map(a => [a.idx, a.pointId, a.inPattern, a.flightStatus])).toEqual([[1, 3, false, 'none'], [2, 3, false, 'none']]);
    expect(r.aircraft[0].pointGeo!.lat).toBeCloseTo(32.05, 6);
  });

  it('פ"מ של עמדה אחרת - לא נכנס', () => {
    const r = autotrackInputs({
      ...base,
      joiningPointStrips: [{ strip_id: 10, joining_point_id: 3, callsign: 'בננה', number_of_formation: '2', workstation_preset_id: 9 }],
    });
    expect(r.strips).toEqual([]);
    expect(r.aircraft).toEqual([]);
  });

  it('מטוס שיצא להקפה: בלי נקודה, עם ההקפה והסטטוס; השאר עדיין בנקודה', () => {
    const r = autotrackInputs({
      ...base,
      joiningPointStrips: [{ strip_id: 10, joining_point_id: 3, callsign: 'בננה', number_of_formation: '2', workstation_preset_id: 5 }],
      joiningPointAircraft: [{ strip_id: 10, aircraft_idx: 1, joining_point_id: 3, in_pattern: true, pattern_id: 7, runway_ident: '36 ', flight_status: 'base', callsign: 'בננה', number_of_formation: '2', workstation_preset_id: 5 }],
    });
    const [one, two] = r.aircraft;
    expect([one.pointId, one.inPattern, one.patternId, one.runwayIdent, one.flightStatus]).toEqual([null, true, 7, '36', 'base']);
    expect([two.pointId, two.inPattern]).toEqual([3, false]);
  });

  it('פ"מ שכל מטוסיו בהקפה (יצא מטבלת הנקודה) - עדיין נעקב', () => {
    const r = autotrackInputs({
      ...base,
      joiningPointAircraft: [{ strip_id: 10, aircraft_idx: 1, in_pattern: true, pattern_id: 7, callsign: 'בננה', number_of_formation: '1', workstation_preset_id: 5 }],
    });
    expect(r.aircraft).toHaveLength(1);
    expect(r.aircraft[0].inPattern).toBe(true);
  });

  it('פ"מ מפוצל: רק המספרים שלו, וגודל המבנה המקורי', () => {
    const r = autotrackInputs({
      ...base,
      joiningPointStrips: [{ strip_id: 11, joining_point_id: 3, callsign: 'בננה', number_of_formation: '2', aircraft_indices: [3, 4], original_formation_count: 4, workstation_preset_id: 5 }],
    });
    expect(r.strips[0]).toEqual({ stripId: '11', callSign: 'בננה', formationSize: 4, indices: [3, 4] });
    expect(r.aircraft.map(a => a.idx)).toEqual([3, 4]);
  });

  it('הסטטוס המקומי (עדכון מיידי) גובר על השורה', () => {
    const r = autotrackInputs({
      ...base,
      joiningPointAircraft: [{ strip_id: 10, aircraft_idx: 1, in_pattern: true, flight_status: 'downwind', callsign: 'בננה', number_of_formation: '1', workstation_preset_id: 5 }],
      stripAircraft: { 10: [{ idx: 1, flight_status: 'final' }] },
    });
    expect(r.aircraft[0].flightStatus).toBe('final');
  });

  it('בלי עוגן או בלי עמדה - אין קלט', () => {
    const rows = { joiningPointStrips: [{ strip_id: 10, joining_point_id: 3, callsign: 'בננה', workstation_preset_id: 5 }] };
    expect(autotrackInputs({ ...base, ...rows, anchor: null }).aircraft).toEqual([]);
    expect(autotrackInputs({ ...base, ...rows, presetId: null }).aircraft).toEqual([]);
  });
});

describe('patternGeoOf - הקפה בנ"צ', () => {
  const row = { id: 7, runway_ident: '36', geometry: { anchor: { x: 50, y: 60 }, bearing: 0, side: 'right', rwyLen: 10, upwind: 5, width: 8, baseExt: 5 } };

  it('שלוש צלעות, והסף הוא סוף הפיינל = עוגן ההקפה', () => {
    const g = patternGeoOf(row, 1, ANCHOR)!;
    expect(g.id).toBe(7);
    expect(g.runwayIdent).toBe('36');
    expect(g.threshold.lat).toBeCloseTo(32.1 - 0.06, 6);
    expect(g.threshold.lon).toBeCloseTo(35.05, 6);
    expect(g.legs.final[1]).toEqual(g.threshold);
    expect(g.legs.base[1]).toEqual(g.legs.final[0]);
    // המסלול: מהסף, rwyLen=10% צפונה
    expect(g.runway[0]).toEqual(g.threshold);
    expect(g.runway[1].lat).toBeCloseTo(32.1 - 0.05, 6);
  });

  it('בלי עוגן - אין', () => expect(patternGeoOf(row, 1, null)).toBeNull());

  it('הסטייה המותרת מפרמטרי ההקפה; NUMERIC מגיע מ-pg כמחרוזת', () => {
    const g = patternGeoOf({ ...row, leg_tolerance_nm: '0.30', alt_tol_above_ft: 800, alt_tol_below_ft: '300' }, 1, ANCHOR)!;
    expect(g.legTolNm).toBe(0.3);
    expect(g.altAboveFt).toBe(800);
    expect(g.altBelowFt).toBe(300);
  });

  it('לא רשום - ברירת מחדל: 0.5 מייל, 1500 מעל, 500 מתחת', () => {
    const none = patternGeoOf(row, 1, ANCHOR)!;
    expect(none.legTolNm).toBeNull();          // המנוע נופל ל-LEG_NM
    expect(none.altAboveFt).toBe(1500);
    expect(none.altBelowFt).toBe(500);
  });

  it('הגובה המתוכנן = פרופיל ההקפה (מעל השדה) + גובה השדה', () => {
    const g = patternGeoOf({ ...row, downwind_alt_ft: 2500, base_alt_ft: 1200 }, 1, ANCHOR, 300)!;
    expect(g.plannedAltFt!('downwind', 0)).toBe(2800);
    expect(g.plannedAltFt!('final', 1)).toBe(300);
    expect(g.plannedAltFt!('final', 0)).toBe(1500);
  });
});

describe('fieldTraffic - תנועת השדה כולה, לזיהוי רכיב זר', () => {
  it('פ"מים מכל העמדות, ומטוסי כל הקפה שלא נחתו', () => {
    const r = fieldTraffic({
      joiningPointStrips: [{ strip_id: 10, joining_point_id: 3, callsign: 'בננה', number_of_formation: '2', workstation_preset_id: 5 }],
      joiningPointAircraft: [
        { strip_id: 20, aircraft_idx: 1, in_pattern: true, pattern_id: 7, flight_status: 'final', callsign: 'תפוח', number_of_formation: '2', workstation_preset_id: 9 },
        { strip_id: 20, aircraft_idx: 2, in_pattern: true, pattern_id: 7, flight_status: 'landed', callsign: 'תפוח', number_of_formation: '2', workstation_preset_id: 9 },
        { strip_id: 10, aircraft_idx: 1, in_pattern: false, pattern_id: 7, callsign: 'בננה', number_of_formation: '2', workstation_preset_id: 5 },
      ],
    });
    expect(r.strips.map(s => s.callSign).sort()).toEqual(['בננה', 'תפוח']);
    expect([...r.occupants.entries()]).toEqual([[7, ['20|1']]]);
  });
});
