// סקר משותף עם ספירת מנויים - התיקון לכשל שקט במנוע ה-polling.
//
// `pollingRegistry.register(id)` **מחליף** משימה קיימת באותו מפתח, ו-`unregister`
// **מוחק** אותה. שני רכיבים שסוקרים את אותם נתונים באותו מפתח:
//   1. בזמן ששניהם פתוחים - רק האחרון שנרשם מקבל נתונים; השני קפוא.
//   2. כשאחד נסגר - המשימה נמחקת, והשני **לא סוקר יותר בכלל**.
//
// זה קרה ב-useAirfieldTrips ותוקן שם במזהה לכל צרכן. המעקב החי צורך ערוץ **משותף**
// (המפה וההתרעות חייבות לראות את אותה תמונה), והבדיקות כאן מקבעות שהערוץ לא נופל
// לאותו כשל.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const registry = vi.hoisted(() => ({ register: vi.fn(), unregister: vi.fn() }));
vi.mock('./usePollingRegistry', () => ({ pollingRegistry: registry, usePolling: vi.fn() }));

const { subscribeShared, refreshShared, __sharedChannelSize } = await import('./sharedPolling');

/** מריץ את המשימה שנרשמה אחרונה למפתח - כמו שהמנוע היה עושה בסבב */
async function tick(key: string) {
  const call = [...registry.register.mock.calls].reverse().find(c => c[0] === key);
  await call![1]();
}

beforeEach(() => { registry.register.mockClear(); registry.unregister.mockClear(); });

describe('subscribeShared', () => {
  it('מנוי ראשון רושם משימה אחת', () => {
    const off = subscribeShared('k1', async () => 1, 5000, () => {});
    expect(registry.register).toHaveBeenCalledTimes(1);
    expect(registry.register.mock.calls[0][2]).toBe(5000);
    off();
  });

  it('שני מנויים באותו קצב - משימה אחת, ושניהם מקבלים כל סבב', async () => {
    const a = vi.fn(), b = vi.fn();
    const offA = subscribeShared('k2', async () => 'data', 5000, a);
    const offB = subscribeShared('k2', async () => 'data', 5000, b);
    expect(registry.register).toHaveBeenCalledTimes(1);
    await tick('k2');
    expect(a).toHaveBeenCalledWith('data');
    expect(b).toHaveBeenCalledWith('data');
    offA(); offB();
  });

  // התרחיש שקרה: חלון (5 ש') נפתח מעל ההתראות (15 ש'), ואז נסגר
  it('סגירת מנוי אחד לא עוצרת את הסקר לשני', async () => {
    const alerts = vi.fn(), windowL = vi.fn();
    const offAlerts = subscribeShared('k3', async () => 'x', 15000, alerts);
    const offWindow = subscribeShared('k3', async () => 'x', 5000, windowL);
    offWindow();
    expect(registry.unregister).not.toHaveBeenCalled();
    expect(__sharedChannelSize('k3')).toBe(1);
    alerts.mockClear();
    await tick('k3');
    expect(alerts).toHaveBeenCalledWith('x');
    offAlerts();
  });

  it('רק המנוי האחרון מסיר את המשימה', () => {
    const off1 = subscribeShared('k4', async () => 0, 5000, () => {});
    const off2 = subscribeShared('k4', async () => 0, 5000, () => {});
    off1();
    expect(registry.unregister).not.toHaveBeenCalled();
    off2();
    expect(registry.unregister).toHaveBeenCalledWith('k4');
  });

  // החלון רוצה עדכון כל 5 ש', ההתראות מסתפקות ב-15: הסקר רץ בקצב המהיר מבין השניים
  it('הקצב הוא המהיר מבין המנויים, וחוזר לאיטי כשהמהיר עוזב', () => {
    const offSlow = subscribeShared('k5', async () => 0, 15000, () => {});
    const offFast = subscribeShared('k5', async () => 0, 5000, () => {});
    expect(registry.register.mock.calls.at(-1)![2]).toBe(5000);
    offFast();
    expect(registry.register.mock.calls.at(-1)![2]).toBe(15000);
    offSlow();
  });

  it('מנוי שמצטרף מאוחר מקבל מיד את מה שכבר נטען', async () => {
    const offA = subscribeShared('k6', async () => 'loaded', 5000, () => {});
    await tick('k6');
    const late = vi.fn();
    const offB = subscribeShared('k6', async () => 'loaded', 5000, late);
    expect(late).toHaveBeenCalledWith('loaded');
    offA(); offB();
  });

  // אחרי פעולה (אישור, דחייה) הרכיב מבקש רענון - וכל המנויים צריכים לראות אותו
  it('רענון יזום משדר לכל המנויים', async () => {
    const a = vi.fn(), b = vi.fn();
    const offA = subscribeShared('k7', async () => 'fresh', 5000, a);
    const offB = subscribeShared('k7', async () => 'fresh', 15000, b);
    await refreshShared('k7');
    expect(a).toHaveBeenCalledWith('fresh');
    expect(b).toHaveBeenCalledWith('fresh');
    offA(); offB();
  });

  it('תשובה undefined (כשל רשת) אינה דורסת את הנתונים הקודמים', async () => {
    let answer: string | undefined = 'first';
    const l = vi.fn();
    const off = subscribeShared('k8', async () => answer, 5000, l);
    await tick('k8');
    answer = undefined;
    l.mockClear();
    await tick('k8');
    expect(l).not.toHaveBeenCalled();
    off();
  });
});

describe('המעקב החי עובר דרך הערוץ המשותף', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('useLiveTrips - אותו מנגנון', () => {
    expect(read('src/hooks/useLiveTrips.ts')).toMatch(/subscribeShared(<[^>]+>)?\(/);
  });
});
