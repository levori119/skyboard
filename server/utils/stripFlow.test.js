// FLOW של פ"מ - הלוגיקה הטהורה בשרת. ראה STRIP_FLOW_SPEC.md.
import { describe, it, expect } from 'vitest';
import { diffAircraftPositions, flowCurrent, lineageSources, mergeLineageEvents, parsePositions } from './stripFlow.js';

const ac = (idx, status = 'none', point_id = null, extra = {}) => ({ idx, status, point_id, ...extra });

describe('parsePositions', () => {
  it('מחרוזת JSON, מערך ו-null', () => {
    expect(parsePositions('[{"idx":1,"status":"taxi","point_id":null}]')).toEqual([ac(1, 'taxi')]);
    expect(parsePositions([ac(2)])).toEqual([ac(2)]);
    expect(parsePositions(null)).toEqual([]);
    expect(parsePositions('not json')).toEqual([]);
  });
});

describe('diffAircraftPositions - אירועי קרקע מתוך עדכון מיקום המטוסים', () => {
  it('אותו מצב שנשלח שוב - אפס אירועים', () => {
    const p = [ac(1, 'taxi', 4), ac(2, 'taxi', 4)];
    expect(diffAircraftPositions(p, p)).toEqual([]);
  });

  it('מבנה שלם שקרא להסעה - אירוע אחד עם כל המטוסים', () => {
    const ev = diffAircraftPositions([ac(1), ac(2)], [ac(1, 'taxi'), ac(2, 'taxi')]);
    expect(ev).toEqual([{ kind: 'taxi', aircraft: [1, 2] }]);
  });

  it('חלק מהמבנה - רק המטוסים שהשתנו', () => {
    const ev = diffAircraftPositions([ac(1, 'taxi'), ac(2)], [ac(1, 'taxi'), ac(2, 'taxi')]);
    expect(ev).toEqual([{ kind: 'taxi', aircraft: [2] }]);
  });

  it('המראה נושאת את מסלול ההמראה, ומסלולים שונים = אירועים נפרדים', () => {
    const ev = diffAircraftPositions(
      [ac(1, 'lineup'), ac(2, 'lineup'), ac(3, 'lineup')],
      [ac(1, 'takeoff', null, { takeoff_runway: '33' }), ac(2, 'takeoff', null, { takeoff_runway: '33' }), ac(3, 'takeoff', null, { takeoff_runway: '29' })],
    );
    expect(ev).toEqual([
      { kind: 'takeoff', aircraft: [1, 2], runway: '33' },
      { kind: 'takeoff', aircraft: [3], runway: '29' },
    ]);
  });

  it('חזרה ל"טרם קרא" אינה שלב ב-FLOW', () => {
    expect(diffAircraftPositions([ac(1, 'taxi')], [ac(1, 'none')])).toEqual([]);
  });

  it('מעבר נקודה - אירוע נקודה עם הנקודה הקודמת, לפני שינוי הסטטוס', () => {
    const ev = diffAircraftPositions([ac(1, 'none', 7)], [ac(1, 'taxi', 9)]);
    expect(ev).toEqual([
      { kind: 'ground_point', aircraft: [1], pointId: 9, fromPointId: 7 },
      { kind: 'taxi', aircraft: [1] },
    ]);
  });

  it('הורדה מנקודה (point_id=null) אינה אירוע נקודה', () => {
    expect(diffAircraftPositions([ac(1, 'taxi', 7)], [ac(1, 'taxi', null)])).toEqual([]);
  });

  it('מטוס שלא היה קודם - נחשב כמי שהיה ב"טרם קרא" בלי נקודה', () => {
    expect(diffAircraftPositions([], [ac(1, 'lineup', 3)])).toEqual([
      { kind: 'ground_point', aircraft: [1], pointId: 3, fromPointId: null },
      { kind: 'lineup', aircraft: [1] },
    ]);
  });
});

const ev = (id, kind, strip_id, at, extra = {}) => ({ id, kind, strip_id, occurred_at: at, preset_name: null, details: {}, ...extra });

describe('flowCurrent - איפה הפ"מ נמצא עכשיו', () => {
  const strip = (over = {}) => ({ id: 5, landed: false, airborne: false, status: 'active', creator_preset_name: 'מגדל חצור', aircraft_positions: [], ...over });

  it('נחת גובר על הכל', () => {
    expect(flowCurrent({ strip: strip({ landed: true }), pendingTransfer: { point_label: 'פלמח' }, events: [] }))
      .toEqual({ kind: 'landed' });
  });

  it('העברה ממתינה - בנקודת ההעברה, ממתין לעמדה', () => {
    expect(flowCurrent({
      strip: strip({ status: 'pending_transfer' }),
      pendingTransfer: { point_label: 'פלמח', to_preset_name: '305', from_preset_name: 'מגדל חצור' },
      events: [],
    })).toEqual({ kind: 'at_point', point: 'פלמח', toPresetName: '305', fromPresetName: 'מגדל חצור', airborne: false });
  });

  it('בעמדה = העמדה שקיבלה אחרונה, לא עמדה שגררה אליה', () => {
    const events = [
      ev(1, 'accepted', 5, '2026-09-15T11:20:00Z', { preset_name: '305' }),
      ev(2, 'accepted', 5, '2026-09-15T11:40:00Z', { preset_name: '306' }),
    ];
    expect(flowCurrent({ strip: strip({ airborne: true }), pendingTransfer: null, events }))
      .toEqual({ kind: 'at_station', presetName: '306', airborne: true, groundStatus: null });
  });

  it('לא התקבל אף פעם - בעמדה שיצרה אותו', () => {
    expect(flowCurrent({ strip: strip(), pendingTransfer: null, events: [] }))
      .toEqual({ kind: 'at_station', presetName: 'מגדל חצור', airborne: false, groundStatus: null });
  });

  it('במגדל עם מטוסים בהסעה - הסטטוס המתקדם ביותר', () => {
    const s = strip({ aircraft_positions: [ac(1, 'taxi'), ac(2, 'lineup')] });
    expect(flowCurrent({ strip: s, pendingTransfer: null, events: [ev(1, 'taxi', 5, '2026-09-15T11:00:00Z')] }))
      .toEqual({ kind: 'at_station', presetName: 'מגדל חצור', airborne: false, groundStatus: 'lineup' });
  });

  it('סטטוס "המראה" שנשאר על המטוס אחרי קבלה בעמדה אחרת - לא מוצג כסטטוס קרקעי', () => {
    const s = strip({ airborne: true, aircraft_positions: [ac(1, 'takeoff')] });
    const events = [
      ev(1, 'takeoff', 5, '2026-09-15T11:15:00Z'),
      ev(2, 'accepted', 5, '2026-09-15T11:20:00Z', { preset_name: '305' }),
    ];
    expect(flowCurrent({ strip: s, pendingTransfer: null, events }))
      .toEqual({ kind: 'at_station', presetName: '305', airborne: true, groundStatus: null });
  });

  it('בלי עמדה ידועה - לא ידוע', () => {
    expect(flowCurrent({ strip: strip({ creator_preset_name: null }), pendingTransfer: null, events: [] }))
      .toEqual({ kind: 'unknown', airborne: false });
  });
});

describe('ירושת היסטוריה בפיצול ובמיזוג', () => {
  it('lineageSources - פיצול מחזיר מקור עם גבול זמן, מיזוג בלי גבול', () => {
    const events = [
      ev(10, 'split', 8, '2026-09-15T11:30:00Z', { details: { fromStripId: 5 } }),
      ev(11, 'merged', 8, '2026-09-15T12:00:00Z', { details: { sourceStripId: 9 } }),
    ];
    expect(lineageSources(events)).toEqual([
      { stripId: 5, until: '2026-09-15T11:30:00Z' },
      { stripId: 9, until: null },
    ]);
  });

  it('חלק שנולד בפיצול יורש את אירועי המקור עד רגע הפיצול בלבד', () => {
    const byStrip = {
      5: [
        ev(1, 'taxi', 5, '2026-09-15T11:00:00Z'),
        ev(3, 'accepted', 5, '2026-09-15T11:45:00Z', { preset_name: '306' }),
      ],
      8: [
        ev(2, 'split', 8, '2026-09-15T11:30:00Z', { details: { fromStripId: 5 } }),
        ev(4, 'accepted', 8, '2026-09-15T11:50:00Z', { preset_name: '305' }),
      ],
    };
    const out = mergeLineageEvents(8, byStrip);
    expect(out.map(e => e.id)).toEqual([1, 2, 4]);
    expect(out[0].inherited).toBe(true);
    expect(out[1].inherited).toBe(false);
  });

  it('מיזוג - אירועי החלק הממוזג נכנסים, ואירוע משותף (מלפני הפיצול) לא מוכפל', () => {
    const byStrip = {
      5: [ev(1, 'taxi', 5, '2026-09-15T11:00:00Z'), ev(5, 'merged', 5, '2026-09-15T12:00:00Z', { details: { sourceStripId: 8 } })],
      8: [ev(2, 'split', 8, '2026-09-15T11:30:00Z', { details: { fromStripId: 5 } }), ev(4, 'accepted', 8, '2026-09-15T11:50:00Z')],
    };
    const out = mergeLineageEvents(5, byStrip);
    expect(out.map(e => e.id)).toEqual([1, 2, 4, 5]);
  });

  it('מעגל בנתונים (מיזוג הדדי) אינו נתקע', () => {
    const byStrip = {
      1: [ev(1, 'merged', 1, '2026-09-15T12:00:00Z', { details: { sourceStripId: 2 } })],
      2: [ev(2, 'merged', 2, '2026-09-15T12:01:00Z', { details: { sourceStripId: 1 } })],
    };
    expect(mergeLineageEvents(1, byStrip).map(e => e.id)).toEqual([1, 2]);
  });
});
