import { describe, it, expect } from 'vitest';
import {
  deadReckon, place, visible, applyFilters, capNearest, prepare, ageSec, MAX_TRACKS, countOnScreen,
} from './track';
import type { TrackFilters } from './track';
import type { AirTrack } from '../../shared/airTrafficApi';
import type { MapGeoAnchor } from '../utils/geo';

// עוגן מפה סינתטי: הפינה השמאלית-עליונה (0%,0%) היא 33N/34E, והימנית-תחתונה
// (100%,100%) היא 32N/35E. כך אחוז אחד = 0.01 מעלה, וכל בדיקה קריאה בעין.
const ANCHOR: MapGeoAnchor = { x1: 0, y1: 0, lat1: 33, lon1: 34, x2: 100, y2: 100, lat2: 32, lon2: 35 };

const T = (o: Partial<AirTrack> = {}): AirTrack => ({
  id: 't1', cs: 'אפיק 21', lat: 32.5, lon: 34.5, alt: 20000, spd: 360, hdg: 0,
  cls: 'friend', typ: 'f16', resp: 'צפון', ...o,
});

const ALL: TrackFilters = { classes: ['friend', 'hostile', 'unknown', 'civil'], altMin: null, altMax: null, resp: '' };

describe('deadReckon', () => {
  it('צפונה: מייל אחד = דקת קשת של רוחב', () => {
    // 360 קשר × 10 שניות = מייל אחד = 1/60 מעלה
    const p = deadReckon(T({ hdg: 0 }), 10);
    expect(p.lat).toBeCloseTo(32.5 + 1 / 60, 6);
    expect(p.lon).toBeCloseTo(34.5, 6);
  });

  it('מזרחה: מעלת אורך מתכווצת עם קו הרוחב', () => {
    const p = deadReckon(T({ hdg: 90 }), 10);
    expect(p.lat).toBeCloseTo(32.5, 6);
    // 1 NM מזרחה ב-32.5° = (1/60)/cos(32.5) מעלות - יותר ממעלת רוחב
    expect(p.lon).toBeGreaterThan(34.5 + 1 / 60);
  });

  it('דרומה מוריד קו רוחב', () => {
    expect(deadReckon(T({ hdg: 180 }), 10).lat).toBeLessThan(32.5);
  });

  it('זמן אפס או שלילי לא מזיז', () => {
    expect(deadReckon(T(), 0)).toEqual({ lat: 32.5, lon: 34.5 });
    expect(deadReckon(T(), -5)).toEqual({ lat: 32.5, lon: 34.5 });
  });

  it('מטוס עומד לא זז גם אחרי דקה', () => {
    expect(deadReckon(T({ spd: 0 }), 60).lat).toBeCloseTo(32.5, 9);
  });
});

describe('place', () => {
  it('ממפה נ"צ לאחוזי תמונה', () => {
    const [p] = place([T({ lat: 32.5, lon: 34.5 })], ANCHOR, 0);
    expect(p.x).toBeCloseTo(50, 6);
    expect(p.y).toBeCloseTo(50, 6);
  });

  it('מחשב חשבון לפני ההשלכה - הזמן משפיע על המיקום על המפה', () => {
    const still = place([T({ hdg: 0 })], ANCHOR, 0)[0];
    const moved = place([T({ hdg: 0 })], ANCHOR, 60)[0];
    expect(moved.y).toBeLessThan(still.y); // צפונה = כלפי מעלה במפה הזו
  });
});

describe('visible', () => {
  const at = (x: number, y: number) => ({ ...T(), x, y });

  it('בתוך המפה נשאר', () => {
    expect(visible([at(50, 50)])).toHaveLength(1);
  });

  it('רחוק מחוץ למפה נופל', () => {
    expect(visible([at(200, 50), at(50, -80)])).toHaveLength(0);
  });

  it('שוליים - מטוס שנכנס לתמונה לא קופץ מהקצה', () => {
    expect(visible([at(-5, 50)], 8)).toHaveLength(1);
    expect(visible([at(-5, 50)], 2)).toHaveLength(0);
  });
});

describe('applyFilters', () => {
  const P = (o: Partial<AirTrack>) => ({ ...T(o), x: 50, y: 50 });

  it('סיווג', () => {
    const list = [P({ cls: 'friend' }), P({ cls: 'hostile' })];
    expect(applyFilters(list, { ...ALL, classes: ['hostile'] })).toHaveLength(1);
  });

  it('רשימת סיווגים ריקה מסתירה הכול - "כיביתי הכול" הוא מצב לגיטימי', () => {
    expect(applyFilters([P({})], { ...ALL, classes: [] })).toHaveLength(0);
  });

  it('טווח גובה, כולל חסם צד אחד', () => {
    const list = [P({ alt: 5000 }), P({ alt: 25000 })];
    expect(applyFilters(list, { ...ALL, altMin: 10000 })).toHaveLength(1);
    expect(applyFilters(list, { ...ALL, altMax: 10000 })).toHaveLength(1);
    expect(applyFilters(list, { ...ALL, altMin: 1000, altMax: 30000 })).toHaveLength(2);
  });

  it('אחראיות - ריק = הכול', () => {
    const list = [P({ resp: 'צפון' }), P({ resp: 'דרום' })];
    expect(applyFilters(list, { ...ALL, resp: 'צפון' })).toHaveLength(1);
    expect(applyFilters(list, { ...ALL, resp: '  ' })).toHaveLength(2);
  });
});

describe('capNearest', () => {
  it('מתחת לתקרה - הרשימה חוזרת כמות שהיא, בלי העתקה', () => {
    const list = [{ ...T(), x: 50, y: 50 }];
    expect(capNearest(list, 300)).toBe(list);
  });

  it('חותך את הרחוקים ממרכז המפה, לא את סוף הרשימה', () => {
    const near = { ...T({ id: 'near' }), x: 50, y: 50 };
    const far = { ...T({ id: 'far' }), x: 99, y: 99 };
    // ה"רחוק" ראשון ברשימה - חיתוך נאיבי היה משאיר דווקא אותו
    const out = capNearest([far, near], 1);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('near');
  });

  it('מכבד את תקרת 300 כברירת מחדל', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ ...T({ id: `t${i}` }), x: i % 100, y: 50 }));
    expect(capNearest(many)).toHaveLength(MAX_TRACKS);
  });
});

describe('prepare - השרשרת המלאה', () => {
  it('הסדר הוא נראות → סינון → תקרה', () => {
    // 5 מטוסים במרכז המפה, שניים מהם טורף. תקרה של 2 אחרי סינון לעמית בלבד
    // חייבת להחזיר 2 עמיתים - ולא להתמלא בטורפים שסוננו החוצה.
    const tracks: AirTrack[] = [
      T({ id: 'h1', cls: 'hostile', lat: 32.5, lon: 34.5 }),
      T({ id: 'h2', cls: 'hostile', lat: 32.5, lon: 34.5 }),
      T({ id: 'f1', cls: 'friend', lat: 32.5, lon: 34.5 }),
      T({ id: 'f2', cls: 'friend', lat: 32.5, lon: 34.5 }),
      T({ id: 'far', cls: 'friend', lat: 10, lon: 10 }),
    ];
    const out = prepare(tracks, ANCHOR, 0, { ...ALL, classes: ['friend'] }, 2);
    expect(out.map(t => t.id).sort()).toEqual(['f1', 'f2']);
  });

  it('מטוס מחוץ למפה לא מגיע לתקרה', () => {
    const out = prepare([T({ lat: 10, lon: 10 })], ANCHOR, 0, ALL);
    expect(out).toHaveLength(0);
  });
});

describe('ageSec', () => {
  it('נמדד מול שעון המאגר', () => {
    expect(ageSec(1000, 7000)).toBe(6);
  });

  it('שעון עמדה שמפגר לא מייצר גיל שלילי', () => {
    expect(ageSec(9000, 1000)).toBe(0);
  });
});

describe('countOnScreen', () => {
  const at = (x: number, y: number) => ({ ...T(), x, y });

  it('סופר רק את מה שבתוך גבולות התמונה', () => {
    expect(countOnScreen([at(50, 50), at(0, 0), at(100, 100)])).toBe(3);
  });

  it('**לא** סופר את שולי הסינון - הם נחתכים ע"י הקנבס ואינם נראים', () => {
    // אלו בדיוק המטוסים ש-visible() מכניס (±8%) והקנבס חותך. ספירה שכוללת
    // אותם אומרת "יש מטוס באזור" מול מסך ריק.
    expect(countOnScreen([at(-3, 50), at(104, 50), at(50, -1), at(50, 101)])).toBe(0);
  });

  it('רשימה ריקה = 0', () => {
    expect(countOnScreen([])).toBe(0);
  });
});
