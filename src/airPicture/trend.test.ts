import { describe, it, expect } from 'vitest';
import {
  TREND_HOLD_MS, TREND_MIN_FT, nextTrendRef, trendArrowPoints, trendsOf, updateTrendRefs,
  type TrendRef,
} from './trend';
import type { AirTrack } from '../../shared/airTrafficApi';

const track = (id: string, alt: number): AirTrack => ({
  id, cs: id, lat: 32, lon: 34, alt, spd: 300, hdg: 90,
  cls: 'friend', typ: 'jet', resp: '',
});

describe('מגמה אנכית - נגזרת מהשוואת דגימות', () => {
  it('דגימה ראשונה אינה מגמה - אין ממה להשוות', () => {
    expect(nextTrendRef(undefined, 5000, 1000).trend).toBe(null);
  });

  it('עלייה מעל הסף = טיפוס, ירידה = נמיכה', () => {
    const first = nextTrendRef(undefined, 5000, 0);
    expect(nextTrendRef(first, 5000 + TREND_MIN_FT, 1000).trend).toBe('climb');
    expect(nextTrendRef(first, 5000 - TREND_MIN_FT, 1000).trend).toBe('descend');
  });

  it('רעש מדידה מתחת לסף אינו מגמה', () => {
    const first = nextTrendRef(undefined, 5000, 0);
    const noisy = nextTrendRef(first, 5000 + TREND_MIN_FT - 1, 1000);
    expect(noisy.trend).toBe(null);
    // נקודת הייחוס לא זזה - אחרת סחיפה של רגל בכל דגימה לא הייתה נצברת לעולם
    expect(noisy.alt).toBe(5000);
  });

  it('המגמה נשמרת בין חציות סף - החץ לא מהבהב', () => {
    let ref = nextTrendRef(undefined, 5000, 0);
    ref = nextTrendRef(ref, 5200, 1000);
    expect(ref.trend).toBe('climb');
    ref = nextTrendRef(ref, 5210, 2000);   // דגימה שקטה
    expect(ref.trend).toBe('climb');
    ref = nextTrendRef(ref, 5260, 3000);   // עוד אחת
    expect(ref.trend).toBe('climb');
  });

  it('שקט ממושך = מפולס', () => {
    let ref = nextTrendRef(undefined, 5000, 0);
    ref = nextTrendRef(ref, 5200, 1000);
    expect(ref.trend).toBe('climb');
    ref = nextTrendRef(ref, 5205, 1000 + TREND_HOLD_MS);
    expect(ref.trend).toBe(null);
  });

  it('טיפוס שממשיך אחרי שקט חוזר להיות טיפוס', () => {
    let ref: TrendRef | undefined = nextTrendRef(undefined, 5000, 0);
    ref = nextTrendRef(ref, 5300, 1000);
    ref = nextTrendRef(ref, 5305, 1000 + TREND_HOLD_MS);   // הוכרז מפולס
    expect(ref.trend).toBe(null);
    ref = nextTrendRef(ref, 5305 + TREND_MIN_FT, 2000 + TREND_HOLD_MS);
    expect(ref.trend).toBe('climb');
  });

  it('גובה לא סופי אינו מוחק את המגמה הקיימת', () => {
    const ref = { alt: 5000, t: 0, trend: 'climb' as const };
    expect(nextTrendRef(ref, NaN, 1000)).toEqual(ref);
  });
});

describe('מפת המגמות', () => {
  it('מטוס שירד מהאוויר נושר מהמפה', () => {
    const first = updateTrendRefs(null, [track('a', 5000), track('b', 7000)], 0);
    expect([...first.keys()].sort()).toEqual(['a', 'b']);
    const second = updateTrendRefs(first, [track('a', 5000)], 1000);
    expect([...second.keys()]).toEqual(['a']);
  });

  it('המגמה נשמרת בין דגימות לאותו מזהה', () => {
    let refs = updateTrendRefs(null, [track('a', 5000)], 0);
    refs = updateTrendRefs(refs, [track('a', 5400)], 1000);
    expect(trendsOf(refs).get('a')).toBe('climb');
  });

  it('רשימה ריקה מחזירה מפה ריקה ולא נופלת', () => {
    expect(updateTrendRefs(null, null, 0).size).toBe(0);
    expect(trendsOf(null).size).toBe(0);
  });
});

describe('הסמל', () => {
  it('חוד למעלה בטיפוס, למטה בנמיכה, וכלום במפולס', () => {
    const up = trendArrowPoints(10, 'climb');
    const down = trendArrowPoints(10, 'descend');
    expect(up).toHaveLength(3);
    expect(down).toHaveLength(3);
    // החוד הוא הנקודה היחידה על x=0; ב-SVG ציר y גדל כלפי מטה
    expect(up[0]).toEqual({ x: 0, y: -4.5 });
    expect(down[0]).toEqual({ x: 0, y: 4.5 });
    expect(trendArrowPoints(10, null)).toEqual([]);
  });
});
