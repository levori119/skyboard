import { describe, it, expect } from 'vitest';
import {
  applyJoiningMove, buildBlocks, dropIndices, formationsInBlocks, isFormationOpen, stripAircraftAlts,
  type JoiningPoint,
} from './joiningPoints';

// גרירה בתוך טבלת נקודת ההצטרפות:
//   גרירת **הפ"מ** -> כל המבנה עובר לבלוק, בלי טופס.
//   גרירת **מטוס** (אחרי פריסה) -> רק הוא עובר. מבנה של מטוס אחד עובר כולו.

const point: JoiningPoint = { id: 1, name: 'STAR', alt_min_ft: 4000, alt_max_ft: 8000, default_step_ft: 1000, steps: [] };
const blocks = buildBlocks(point);

describe('stripAircraftAlts - באיזה בלוק כל מטוס של הפ"מ', () => {
  it('מבנה שלם בגובה אחד', () => {
    const map = formationsInBlocks(blocks, [{ strip_id: 7, alt: '050', number_of_formation: 3 }]);
    expect([...stripAircraftAlts(map, '7')]).toEqual([[1, 5000], [2, 5000], [3, 5000]]);
  });

  it('מבנה מפוצל - כל מטוס בבלוק שלו', () => {
    const map = formationsInBlocks(blocks, [{ strip_id: 7, alt: '050', number_of_formation: 3 }],
      [{ strip_id: 7, aircraft_idx: 3, alt: '070' }]);
    const alts = stripAircraftAlts(map, '7');
    expect(alts.get(1)).toBe(5000);
    expect(alts.get(3)).toBe(7000);
  });
});

describe('dropIndices - מה נשלח לשרת בשחרור על בלוק', () => {
  const four = new Map([[1, 5000], [2, 5000], [3, 5000], [4, 5000]]);

  it('גרירת כל המבנה = כל המבנה ([])', () => {
    expect(dropIndices([1, 2, 3, 4], four, [1, 2, 3, 4], 7000)).toEqual([]);
  });

  it('גרירת מטוס אחד ממבנה של ארבעה = רק הוא', () => {
    expect(dropIndices([1, 2, 3, 4], four, [2], 7000)).toEqual([2]);
  });

  it('מבנה של מטוס אחד = כל המבנה', () => {
    expect(dropIndices([1], new Map([[1, 5000]]), [1], 7000)).toEqual([]);
  });

  it('פ"מ בלי מספר מטוסים ידוע = כל המבנה', () => {
    expect(dropIndices([], new Map(), [], 7000)).toEqual([]);
  });

  it('שחרור על הבלוק שבו הוא כבר נמצא = כלום (null)', () => {
    expect(dropIndices([1, 2, 3, 4], four, [2], 5000)).toBeNull();
    expect(dropIndices([1, 2, 3, 4], four, [1, 2, 3, 4], 5000)).toBeNull();
  });

  it('המטוס האחרון שמצטרף לשאר = המבנה מתאחד ([])', () => {
    const split = new Map([[1, 7000], [2, 7000], [3, 7000], [4, 5000]]);
    expect(dropIndices([1, 2, 3, 4], split, [4], 7000)).toEqual([]);
  });

  it('גרירת חלק מפוצל (3+4) = רק החלק', () => {
    const split = new Map([[1, 5000], [2, 5000], [3, 7000], [4, 7000]]);
    expect(dropIndices([1, 2, 3, 4], split, [3, 4], 6000)).toEqual([3, 4]);
  });

  it('מבנה מפוצל שנגרר כולו מבלוק אחד = כל המבנה', () => {
    const split = new Map([[1, 5000], [2, 5000], [3, 7000], [4, 7000]]);
    expect(dropIndices([1, 2, 3, 4], split, [1, 2, 3, 4], 7000)).toEqual([]);
  });
});

describe('applyJoiningMove - עדכון מיידי על המסך, לפני תשובת השרת', () => {
  const strips = [
    { joining_point_id: 1, strip_id: 7, planned_alt: '050', alt: '050', number_of_formation: 2 },
    { joining_point_id: 1, strip_id: 8, planned_alt: '060', alt: '060', number_of_formation: 1 },
  ];
  const aircraft = [{ strip_id: 7, aircraft_idx: 2, alt: '070', joining_point_id: 1 }];

  it('כל המבנה: הגובה המתוכנן מתעדכן והחריגים מתאפסים', () => {
    const r = applyJoiningMove(strips, aircraft, 1, '7', [], '080');
    expect(r.strips.find(s => s.strip_id === 7)?.planned_alt).toBe('080');
    expect(r.aircraft.find(a => a.strip_id === 7)?.alt).toBeNull();
    expect(r.strips.find(s => s.strip_id === 8)?.planned_alt).toBe('060');
  });

  it('מטוס בודד: רק לו גובה חריג, הפ"מ נשאר', () => {
    const r = applyJoiningMove(strips, [], 1, '7', [1], '040');
    expect(r.strips.find(s => s.strip_id === 7)?.planned_alt).toBe('050');
    expect(r.aircraft).toEqual([expect.objectContaining({ strip_id: 7, aircraft_idx: 1, alt: '040' })]);
  });

  it('מטוס שכבר יש לו שורה - מתעדכן ולא משוכפל', () => {
    const r = applyJoiningMove(strips, aircraft, 1, 's7', [2], '040');
    expect(r.aircraft.filter(a => a.strip_id === 7)).toHaveLength(1);
    expect(r.aircraft[0].alt).toBe('040');
  });

  it('לא משנה את הקלט', () => {
    applyJoiningMove(strips, aircraft, 1, '7', [], '080');
    expect(strips[0].planned_alt).toBe('050');
    expect(aircraft[0].alt).toBe('070');
  });
});

describe('isFormationOpen - פריסת המטוסים כברירת מחדל (הגדרת הנקודה)', () => {
  it('ברירת מחדל מכווץ: פתוח רק מה שנלחץ', () => {
    expect(isFormationOpen(false, new Set(), 'k')).toBe(false);
    expect(isFormationOpen(false, new Set(['k']), 'k')).toBe(true);
  });

  it('פרוס כברירת מחדל: הכל פתוח, ולחיצה מכווצת', () => {
    expect(isFormationOpen(true, new Set(), 'k')).toBe(true);
    expect(isFormationOpen(true, new Set(['k']), 'k')).toBe(false);
  });
});
