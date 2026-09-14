import { describe, it, expect } from 'vitest';
import { LEG_COLORS, legColor, splitRouteLegs, routeArrows } from './driverLogic.js';

// נקודה כל ~111 מ' צפונה
const pt = (i, extra = {}) => ({ lat: 31 + i * 0.001, lon: 34, xPct: 10, yPct: 90 - i * 10, ...extra });

describe('legColor - צבע לכל לג', () => {
  it('הלג הראשון נשאר בצבע הנתיב הקיים, והבאים שונים זה מזה', () => {
    expect(legColor(0)).toBe('#a855f7');
    expect(new Set(LEG_COLORS).size).toBe(LEG_COLORS.length);
    expect(LEG_COLORS.length).toBeGreaterThanOrEqual(4);
  });
  it('מחזורי כשיש יותר לגים מצבעים', () => {
    expect(legColor(LEG_COLORS.length)).toBe(LEG_COLORS[0]);
  });
});

describe('splitRouteLegs - חלוקת הנתיב ללגים בתחנות', () => {
  it('בלי תחנות - לג אחד', () => {
    const route = [pt(0), pt(1), pt(2)];
    expect(splitRouteLegs(route, [])).toEqual([route]);
  });

  it('נקודות isStop מתכנן הנתיב קובעות את החיתוך, והנקודה משותפת לשני הלגים', () => {
    const route = [pt(0), pt(1), pt(2, { isStop: true }), pt(3), pt(4)];
    const legs = splitRouteLegs(route, []);
    expect(legs).toHaveLength(2);
    expect(legs[0]).toEqual(route.slice(0, 3));
    expect(legs[1]).toEqual(route.slice(2));
  });

  it('נתיב שמור בלי isStop - חותכים בנקודה הקרובה לכל תחנה לפי הסדר', () => {
    const route = [0, 1, 2, 3, 4, 5, 6].map(i => pt(i));
    const stops = [{ lat: pt(2).lat, lon: 34.0001 }, { lat: pt(5).lat, lon: 34 }];
    const legs = splitRouteLegs(route, stops);
    expect(legs.map(l => l.length)).toEqual([3, 4, 2]);
    expect(legs[1][0]).toBe(route[2]);
    expect(legs[2][0]).toBe(route[5]);
  });

  it('נתיב הלוך-חזור: התחנה השנייה נחפשת רק אחרי הראשונה', () => {
    // 0→3 צפונה ואז חזרה 3→0; תחנה ב-3 ואחריה תחנה ב-1 (בדרך חזרה)
    const route = [pt(0), pt(1), pt(2), pt(3), pt(2), pt(1), pt(0)];
    const legs = splitRouteLegs(route, [{ lat: pt(3).lat, lon: 34 }, { lat: pt(1).lat, lon: 34 }]);
    expect(legs.map(l => l.length)).toEqual([4, 3, 2]);
  });

  it('תחנה בלי מיקום או רחוקה מהנתיב לא חותכת', () => {
    const route = [pt(0), pt(1), pt(2)];
    expect(splitRouteLegs(route, [{ name: 'טקסט חופשי' }, { lat: 32, lon: 35 }])).toEqual([route]);
  });

  it('תחנה על נקודת המוצא או היעד לא יוצרת לג ריק', () => {
    const route = [pt(0), pt(1), pt(2)];
    expect(splitRouteLegs(route, [{ lat: pt(0).lat, lon: 34 }, { lat: pt(2).lat, lon: 34 }])).toEqual([route]);
  });

  it('נתיב קצר מ-2 נקודות - אין לגים', () => {
    expect(splitRouteLegs([pt(0)], [])).toEqual([]);
    expect(splitRouteLegs(null, [])).toEqual([]);
  });

  it('נתיב בלי נ"צ (רק אחוזים) - חיתוך לפי אחוזים', () => {
    const route = [{ xPct: 0, yPct: 0 }, { xPct: 10, yPct: 0 }, { xPct: 20, yPct: 0 }];
    const legs = splitRouteLegs(route, [{ xPct: 10, yPct: 0.2 }]);
    expect(legs.map(l => l.length)).toEqual([2, 2]);
  });
});

describe('routeArrows - חצי כיוון לאורך הקו', () => {
  it('חץ כל spacing לאורך הקו, בכיוון הנסיעה', () => {
    // קו מזרחה באורך 300: חצים ב-offset=50, 150, 250
    const arrows = routeArrows([{ x: 0, y: 0 }, { x: 300, y: 0 }], 100, 50);
    expect(arrows.map(a => Math.round(a.x))).toEqual([50, 150, 250]);
    arrows.forEach(a => { expect(a.y).toBe(0); expect(a.angle).toBeCloseTo(0); });
  });

  it('זווית במעלות: דרומה (y גדל) = 90, מערבה = 180', () => {
    expect(routeArrows([{ x: 0, y: 0 }, { x: 0, y: 100 }], 100, 50)[0].angle).toBeCloseTo(90);
    expect(Math.abs(routeArrows([{ x: 100, y: 0 }, { x: 0, y: 0 }], 100, 50)[0].angle)).toBeCloseTo(180);
  });

  it('ממשיך את המרחק בין מקטעים - לא מתחיל מחדש בכל פנייה', () => {
    const arrows = routeArrows([{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 200 }], 100, 50);
    expect(arrows).toHaveLength(2);
    expect(arrows[0]).toMatchObject({ x: 50, y: 0 });
    expect(arrows[1].x).toBeCloseTo(60);
    expect(arrows[1].y).toBeCloseTo(90);
    expect(arrows[1].angle).toBeCloseTo(90);
  });

  it('קו קצר מה-offset - חץ אחד באמצע, כדי שלכל לג יהיה כיוון', () => {
    const arrows = routeArrows([{ x: 0, y: 0 }, { x: 20, y: 0 }], 100, 50);
    expect(arrows).toHaveLength(1);
    expect(arrows[0].x).toBeCloseTo(10);
  });

  it('קלט ריק / מקטעים באורך אפס', () => {
    expect(routeArrows([], 100, 50)).toEqual([]);
    expect(routeArrows([{ x: 5, y: 5 }, { x: 5, y: 5 }], 100, 50)).toEqual([]);
  });
});
