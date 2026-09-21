import { describe, it, expect } from 'vitest';
import { createOptimisticOverlay } from './optimisticOverlay';

// שעון ידני - הבדיקות שולטות בזמן, כדי לבדוק TTL בלי להמתין.
const clock = () => {
  let t = 1000;
  return { now: () => t, tick: (ms: number) => { t += ms; } };
};

const rows = (greens: boolean) => [{ strip_id: '7', aircraft_idx: 1, greens, flight_status: 'downwind' }];
const keyOf = (r: any) => `${r.strip_id}|${r.aircraft_idx}`;

describe('createOptimisticOverlay - מה שהפקח שינה נשאר על המסך', () => {
  it('בלי עדכונים פתוחים - התמונה מהשרת עוברת כמות שהיא', () => {
    const o = createOptimisticOverlay();
    const src = rows(false);
    expect(o.apply(src, keyOf, 1)).toBe(src);
  });

  it('תמונה שיצאה לפני הלחיצה לא מחזירה את הערך הישן', () => {
    const c = clock();
    const o = createOptimisticOverlay<{ greens: boolean }>({ now: c.now });
    const fetchedAt = c.now();      // הפולינג יצא
    c.tick(200);
    o.set('7|1', { greens: true }); // הפקח לחץ בזמן שהבקשה באוויר
    c.tick(300);                    // התשובה הישנה חוזרת
    expect(o.apply(rows(false), keyOf, fetchedAt)[0].greens).toBe(true);
  });

  it('אחרי אישור השרת - תמונה שנשלפה אחריו גוברת', () => {
    const c = clock();
    const o = createOptimisticOverlay<{ greens: boolean }>({ now: c.now });
    const seq = o.set('7|1', { greens: true });
    c.tick(400);
    o.confirm('7|1', seq);
    c.tick(100);
    const fetchedAt = c.now();
    expect(o.apply(rows(false), keyOf, fetchedAt)[0].greens).toBe(false);
    expect(o.pending()).toBe(0);
  });

  it('אחרי אישור - תמונה שיצאה עוד לפניו עדיין לא גוברת', () => {
    const c = clock();
    const o = createOptimisticOverlay<{ greens: boolean }>({ now: c.now });
    const seq = o.set('7|1', { greens: true });
    const fetchedAt = c.now();  // יצא יחד עם הלחיצה - השרת עוד לא כתב
    c.tick(400);
    o.confirm('7|1', seq);
    expect(o.apply(rows(false), keyOf, fetchedAt)[0].greens).toBe(true);
  });

  it('כשל בבקשה - העדכון יורד והשרת חוזר לשלוט', () => {
    const c = clock();
    const o = createOptimisticOverlay<{ greens: boolean }>({ now: c.now });
    const seq = o.set('7|1', { greens: true });
    expect(o.drop('7|1', seq)).toBe(true);
    expect(o.apply(rows(false), keyOf, c.now())[0].greens).toBe(false);
  });

  it('לחיצה שנייה גוברת - התשובה של הראשונה לא נוגעת בה', () => {
    const c = clock();
    const o = createOptimisticOverlay<{ greens: boolean }>({ now: c.now });
    const first = o.set('7|1', { greens: true });
    const second = o.set('7|1', { greens: false });
    // הראשונה נכשלה אחרי שהפקח כבר לחץ שוב - לא מוחקים את כוונתו האחרונה
    expect(o.drop('7|1', first)).toBe(false);
    expect(o.apply(rows(true), keyOf, c.now())[0].greens).toBe(false);
    o.confirm('7|1', first);            // אישור מאוחר של הראשונה - לא מפקיע
    c.tick(50);
    expect(o.apply(rows(true), keyOf, c.now())[0].greens).toBe(false);
    o.confirm('7|1', second);
    c.tick(50);
    expect(o.apply(rows(true), keyOf, c.now())[0].greens).toBe(true);
  });

  it('שני שדות של אותו מטוס מתמזגים', () => {
    const c = clock();
    const o = createOptimisticOverlay<Record<string, any>>({ now: c.now });
    o.set('7|1', { greens: true });
    o.set('7|1', { flight_status: 'final' });
    const out = o.apply(rows(false), keyOf, c.now())[0];
    expect(out.greens).toBe(true);
    expect(out.flight_status).toBe('final');
  });

  it('מטוס אחר לא מושפע', () => {
    const c = clock();
    const o = createOptimisticOverlay<{ greens: boolean }>({ now: c.now });
    o.set('7|1', { greens: true });
    const src = [...rows(false), { strip_id: '7', aircraft_idx: 2, greens: false, flight_status: 'base' }];
    const out = o.apply(src, keyOf, c.now());
    expect(out[0].greens).toBe(true);
    expect(out[1].greens).toBe(false);
  });

  it('עדכון שלא אושר יורד אחרי ה-TTL - לא נתקע על המסך לנצח', () => {
    const c = clock();
    const o = createOptimisticOverlay<{ greens: boolean }>({ ttlMs: 5000, now: c.now });
    o.set('7|1', { greens: true });
    c.tick(4000);
    expect(o.apply(rows(false), keyOf, c.now())[0].greens).toBe(true);
    c.tick(2000);
    expect(o.apply(rows(false), keyOf, c.now())[0].greens).toBe(false);
    expect(o.pending()).toBe(0);
  });
});
