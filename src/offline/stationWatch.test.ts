// הנתק שהיה שקוף: עמדה עם סוכן מגישה מקומי ומחזירה 200, ולכן שום כשל
// רשת לא מתרחש - והמסך שתק.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { startStationWatch, readStationServing } from './stationWatch';
import { markOnline, getNetSnapshot, noteStationServing, __resetNetStatus } from './netStatus';

const tick = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { __resetNetStatus(); });

describe('noteStationServing - "מאיפה המידע" הוא ממד נפרד מ-"האם יש קשר"', () => {
  // ⚠️ זו התקלה: markOnline מתאפס כי הסוכן החזיר 200 מהמאגר המקומי, וקודם
  // זה היה מכבה את כל החיווי. הגשה מקומית חייבת לשרוד תשובה מוצלחת.
  it('תשובה מוצלחת אינה מבטלת הגשה מקומית', () => {
    noteStationServing({ serving: 'local', simulated: true }, 1000);
    markOnline(2000);
    const n = getNetSnapshot();
    expect(n.online).toBe(true);           // הקשר לסוכן אכן תקין
    expect(n.degradedSince).toBeNull();    // ו-stale (שנגזר מאלה) יוצא שקר
    expect(n.servingLocal).toBe(true);     // ובכל זאת - המידע מהמאגר המקומי
  });

  it('נתק יזום מסומן כיזום, ונתק שנפל - לא', () => {
    noteStationServing({ serving: 'local', simulated: true }, 1000);
    expect(getNetSnapshot().outageSimulated).toBe(true);
    noteStationServing({ serving: 'local', simulated: false }, 1000);
    expect(getNetSnapshot().outageSimulated).toBe(false);
  });

  // "מאז 14:32" חייב להישאר על רגע תחילת הנתק, אחרת הוא מתעדכן בכל דגימה
  // והמפעיל לא יודע כמה זמן הוא מנותק.
  it('רגע תחילת הנתק אינו נדחף קדימה בכל דגימה', () => {
    noteStationServing({ serving: 'local' }, 1000);
    noteStationServing({ serving: 'local' }, 9999);
    expect(getNetSnapshot().servingLocalSince).toBe(1000);
  });

  it('חזרה למרכז מנקה את החיווי ואת הרגע', () => {
    noteStationServing({ serving: 'local' }, 1000);
    noteStationServing({ serving: 'remote' }, 2000);
    const n = getNetSnapshot();
    expect(n.servingLocal).toBe(false);
    expect(n.servingLocalSince).toBeNull();
  });

  it('אין נתב (אין סוכן) - אין חיווי, ולא ממציאים נתק', () => {
    noteStationServing(null, 1000);
    expect(getNetSnapshot().servingLocal).toBe(false);
  });
});

describe('readStationServing', () => {
  const resp = (body: unknown, ok = true) =>
    ({ ok, json: async () => body }) as Response;

  it('תשובת נתב נקראת', async () => {
    const f = vi.fn(async () => resp({ serving: 'local', simulated: true }));
    expect(await readStationServing('http://127.0.0.1:5100', f as unknown as typeof fetch))
      .toEqual({ serving: 'local', simulated: true });
  });

  // המרכז עונה 401 על הנתיב הזה - זו אינה תשובת נתב
  it('תשובה שאינה ok - null', async () => {
    const f = vi.fn(async () => resp({ serving: 'local' }, false));
    expect(await readStationServing('http://x', f as unknown as typeof fetch)).toBeNull();
  });

  it('תשובה בלי serving - null', async () => {
    const f = vi.fn(async () => resp({ ok: true }));
    expect(await readStationServing('http://x', f as unknown as typeof fetch)).toBeNull();
  });

  it('כשל רשת אינו שובר', async () => {
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    expect(await readStationServing('http://x', f as unknown as typeof fetch)).toBeNull();
  });
});

describe('startStationWatch', () => {
  it('מדגימה הגשה מקומית אל החיווי', async () => {
    const stop = startStationWatch({
      intervalMs: 5, read: async () => ({ serving: 'local', simulated: true }),
    });
    await tick();
    expect(getNetSnapshot().servingLocal).toBe(true);
    stop();
  });

  // פורט סגור: דגימה כל 5 שניות לנצח היא רעש, וגם שורת שגיאה בקונסולה
  it('אחרי שלושה כשלים רצופים מפסיקה לשאול', async () => {
    let calls = 0;
    const stop = startStationWatch({ intervalMs: 1, read: async () => { calls++; return null; } });
    for (let i = 0; i < 40; i++) await tick();
    const after = calls;
    for (let i = 0; i < 40; i++) await tick();
    expect(calls).toBe(after);
    expect(calls).toBeLessThanOrEqual(3);
    expect(getNetSnapshot().servingLocal).toBe(false);
    stop();
  });
});
