import { describe, it, expect } from 'vitest';
import { applyJoiningAccept, createJoiningSyncGate, formationsInBlocks, buildBlocks } from './joiningPoints';

// "קבל" עם חלוקת גבהים: הפ"מ צריך להופיע **מיד** בבלוקים הסופיים, בלי להיעלם
// ולחזור בין שלבי השמירה (שיבוץ -> פיצול לכל קבוצה -> טעינה).

describe('applyJoiningAccept - המצב הסופי של הקבלה, לפני תשובת השרת', () => {
  const t = { id: 91, strip_id: 7, callsign: 'גיבור', sq: '1234', alt: '090', number_of_formation: 2, squadron: '69' };

  it('גובה אחד: הפ"מ נכנס לנקודה בגובה המתוכנן', () => {
    const r = applyJoiningAccept([], [], 3, t, '080');
    expect(r.strips).toEqual([expect.objectContaining({ joining_point_id: 3, strip_id: 7, planned_alt: '080', callsign: 'גיבור', number_of_formation: 2 })]);
    expect(r.aircraft).toEqual([]);
  });

  it('כמה גבהים: כל מספר במבנה בבלוק שלו - ונפרס מיד בטבלה', () => {
    const r = applyJoiningAccept([], [], 3, t, '080', [{ alt: '080', indices: [1] }, { alt: '100', indices: [2] }]);
    const point = { id: 3, name: 'S', alt_min_ft: 4000, alt_max_ft: 10000, default_step_ft: 1000, steps: [] };
    const map = formationsInBlocks(buildBlocks(point), r.strips, r.aircraft);
    expect(map.get(8000)?.[0]?.indices).toEqual([1]);
    expect(map.get(10000)?.[0]?.indices).toEqual([2]);
  });

  it('פ"מ שכבר רשום בנקודה אחרת יורד ממנה (כמו בשרת), ואין כפילות', () => {
    const strips = [{ joining_point_id: 5, strip_id: 7, planned_alt: '050' }, { joining_point_id: 3, strip_id: 8, planned_alt: '060' }];
    const r = applyJoiningAccept(strips, [], 3, t, '080');
    expect(r.strips.filter(s => String(s.strip_id) === '7')).toEqual([expect.objectContaining({ joining_point_id: 3, planned_alt: '080' })]);
    expect(r.strips.find(s => s.strip_id === 8)).toBe(strips[1]);
  });

  it('גובה אחד מאפס גבהים חריגים ישנים של המבנה', () => {
    const r = applyJoiningAccept([], [{ strip_id: 7, aircraft_idx: 2, alt: '040' }], 3, t, '080');
    expect(r.aircraft[0].alt).toBeNull();
  });

  it('לא משנה את הקלט', () => {
    const strips = [{ joining_point_id: 5, strip_id: 7, planned_alt: '050' }];
    const aircraft = [{ strip_id: 7, aircraft_idx: 2, alt: '040' }];
    applyJoiningAccept(strips, aircraft, 3, t, '080', [{ alt: '080', indices: [1] }, { alt: '100', indices: [2] }]);
    expect(strips[0].joining_point_id).toBe(5);
    expect(aircraft[0].alt).toBe('040');
  });
});

describe('createJoiningSyncGate - תמונה ישנה לא דורסת עדכון מיידי', () => {
  it('בלי פעולה פתוחה - תמונת הפולינג נכנסת', () => {
    const g = createJoiningSyncGate();
    expect(g.canApply(g.stamp())).toBe(true);
  });

  it('בזמן פעולה - תמונת פולינג נדחית', () => {
    const g = createJoiningSyncGate();
    const end = g.begin();
    expect(g.canApply(g.stamp())).toBe(false);
    end();
    expect(g.canApply(g.stamp())).toBe(true);
  });

  it('פולינג שיצא לפני הפעולה וחזר אחריה - נדחה (הוא מלפני השינוי)', () => {
    const g = createJoiningSyncGate();
    const stamp = g.stamp();
    g.begin()();
    expect(g.canApply(stamp)).toBe(false);
  });

  it('סיום כפול של אותה פעולה לא משחרר פעולה אחרת שעדיין פתוחה', () => {
    const g = createJoiningSyncGate();
    const a = g.begin();
    g.begin();
    a(); a();
    expect(g.canApply(g.stamp())).toBe(false);
  });
});
