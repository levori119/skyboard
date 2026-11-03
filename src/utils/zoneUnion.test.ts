import { describe, it, expect } from 'vitest';
import { unionZones, isSimpleRing, convexHull, type Pt } from './zoneUnion';

const sq = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const area = (r: Pt[]) => { let a = 0; for (let k = 0; k < r.length; k++) { const [x1, y1] = r[k], [x2, y2] = r[(k + 1) % r.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a / 2); };

describe('unionZones - מתאר מקיף לאזורים מחוברים', () => {
  it('אזורים שנוגעים - האיחוד המדויק, בדיוק השטח של שניהם', () => {
    const r = unionZones([sq(0, 0, 10, 10), sq(10, 0, 10, 10)])!;
    expect(isSimpleRing(r)).toBe(true);
    expect(area(r)).toBeCloseTo(200, 5);
  });

  it('אזורים עם פער ביניהם - פוליגון אחד, תקין, שמכסה את שניהם ועוד גשר קטן', () => {
    const r = unionZones([sq(0, 0, 10, 10), sq(14, 2, 10, 10)])!;
    expect(r).not.toBeNull();
    expect(isSimpleRing(r)).toBe(true);
    const a = area(r);
    expect(a).toBeGreaterThan(200);
    expect(a).toBeLessThan(200 + 4 * 12); // הגשר לא גדול מהפער כפול הגובה
  });

  it('כמו בתקלה: אזורים רחוקים באלכסון (705 / 710) - אין חיתוך עצמי', () => {
    const z705: Pt[] = [[20, 10], [30, 5], [35, 30], [5, 35]];
    const z710: Pt[] = [[30, 45], [55, 40], [70, 60], [35, 70]];
    const z709: Pt[] = [[0, 50], [25, 45], [28, 70], [5, 75]];
    const r = unionZones([z705, z710, z709])!;
    expect(isSimpleRing(r)).toBe(true);
    expect(area(r)).toBeGreaterThan(area(z705) + area(z710) + area(z709) - 1e-6);
  });

  it('אזור יחיד / ריק', () => {
    expect(area(unionZones([sq(0, 0, 5, 5)])!)).toBeCloseTo(25, 5);
    expect(unionZones([])).toBeNull();
  });
});

describe('isSimpleRing / convexHull', () => {
  it('מזהה פוליגון "פרפר" כחותך את עצמו', () => {
    expect(isSimpleRing([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(false);
    expect(isSimpleRing(sq(0, 0, 3, 3))).toBe(true);
  });
  it('מעטפת קמורה של ריבוע עם נקודה פנימית', () => {
    expect(convexHull([[0, 0], [4, 0], [4, 4], [0, 4], [2, 2]])).toHaveLength(4);
  });
});

describe('unionZones - סגירה: גשר צר וצמוד, לא משולש רחב', () => {
  it('שני ריבועים עם פער של 2 - השטח הנוסף בערך פער×אורך הצלע הנגדית, לא יותר', () => {
    const r = unionZones([sq(0, 0, 10, 10), sq(12, 0, 10, 10)])!;
    expect(isSimpleRing(r)).toBe(true);
    // גשר מלא לאורך הצלע: 2×10 = 20. הסגירה ממלאת עד זה (ועוד עיגול זעיר בקצוות)
    expect(area(r)).toBeGreaterThan(200);
    expect(area(r)).toBeLessThan(200 + 20 + 3);
  });
  it('אזורים באלכסון (כמו 705/709/710) - תקין, ושטח קטן משל הגשר הקמור הישן', () => {
    const z705: Pt[] = [[20, 10], [30, 5], [35, 30], [5, 35]];
    const z710: Pt[] = [[37, 33], [55, 30], [70, 50], [40, 55]];
    const z709: Pt[] = [[0, 38], [25, 36], [28, 60], [5, 65]];
    const r = unionZones([z705, z710, z709])!;
    expect(isSimpleRing(r)).toBe(true);
    const sum = area(z705) + area(z710) + area(z709);
    expect(area(r)).toBeGreaterThanOrEqual(sum * 0.98);
    expect(area(r)).toBeLessThan(sum * 1.25);
  });
});
