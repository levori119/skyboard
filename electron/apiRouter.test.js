// נתב ה-API — ההכרעה "מרכזי או מקומי" היא לב העבודה המנותקת.
//
// שתי טעויות אפשריות כאן, ושתיהן חמורות בעמדה מבצעית:
//   מעבר מוקדם מדי — בקשה בודדת שנפלה מעבירה את הבקר למאגר המקומי, והמידע
//   שעל המסך "קופא" בזמן שהשרת המרכזי חי ומעודכן.
//   מעבר מאוחר מדי — העמדה ממשיכה לנסות שרת מת, וכל פעולה נכשלת.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiRouter, createRemoteHealth, chooseTarget, FAILURE_THRESHOLD } from './apiRouter.cjs';

const LOCAL = 'http://127.0.0.1:3199';
const REMOTE = 'https://sky-king.example';

describe('chooseTarget', () => {
  it('auto: מרכזי כשהוא חי', () => {
    expect(chooseTarget({ mode: 'auto', remoteOnline: true, hasLocal: true })).toBe('remote');
  });
  it('auto: מקומי כשהמרכזי נפל', () => {
    expect(chooseTarget({ mode: 'auto', remoteOnline: false, hasLocal: true })).toBe('local');
  });
  it('local: מקומי גם כשיש רשת - עמדה עצמאית', () => {
    expect(chooseTarget({ mode: 'local', remoteOnline: true, hasLocal: true })).toBe('local');
  });
  it('remote: מרכזי גם כשהוא נפל - ההתנהגות הישנה, בלי מאגר מקומי', () => {
    expect(chooseTarget({ mode: 'remote', remoteOnline: false, hasLocal: true })).toBe('remote');
  });
  it('בלי מאגר מקומי זמין - תמיד מרכזי, גם בנתק', () => {
    // המאגר המקומי עדיין עולה (5ש' בעלייה ראשונה). ניתוב אליו לפני שהוא מוכן
    // היה מחזיר שגיאת חיבור על **כל** בקשה במקום להשאיר את הסיכוי למרכזי.
    expect(chooseTarget({ mode: 'auto', remoteOnline: false, hasLocal: false })).toBe('remote');
    expect(chooseTarget({ mode: 'local', remoteOnline: false, hasLocal: false })).toBe('remote');
  });
});

describe('מצב הקשר לשרת המרכזי', () => {
  let health;
  afterEach(() => health?.stop());

  it('כשל בודד אינו מכריז נתק - זה הסף שמונע החלפת מאגר מהבהבת', () => {
    health = createRemoteHealth({ apiTarget: REMOTE });
    health.markDown();
    expect(health.snapshot().online).toBe(true);
    health.markDown();
    expect(health.snapshot().online).toBe(true);
  });

  it(`${FAILURE_THRESHOLD} כשלים רצופים מכריזים נתק`, () => {
    health = createRemoteHealth({ apiTarget: REMOTE });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) health.markDown();
    expect(health.snapshot().online).toBe(false);
    expect(health.snapshot().offlineSince).toBeTypeOf('number');
  });

  it('הצלחה באמצע מאפסת את המונה - כשלים מפוזרים אינם נתק', () => {
    health = createRemoteHealth({ apiTarget: REMOTE });
    health.markDown();
    health.markDown();
    health.markUp();
    health.markDown();
    health.markDown();
    expect(health.snapshot().online).toBe(true);
  });

  it('חזרה למצב תקין מנקה את זמן הנתק ומודיעה למנויים', () => {
    health = createRemoteHealth({ apiTarget: REMOTE });
    const seen = [];
    health.subscribe(s => seen.push(s.online));
    for (let i = 0; i < FAILURE_THRESHOLD; i++) health.markDown();
    health.markUp();
    expect(seen).toEqual([false, true]);
    expect(health.snapshot().offlineSince).toBeNull();
  });
});

describe('נתב ה-API', () => {
  let router;
  afterEach(() => router?.health.stop());

  it('מנתב למרכזי כל עוד הוא עונה', () => {
    router = createApiRouter({ apiTarget: REMOTE, localTarget: () => LOCAL });
    expect(router.resolve()).toEqual({ which: 'remote', target: REMOTE });
  });

  it('עובר למאגר המקומי אחרי סף הכשלים, ומדווח על כך במצב', () => {
    router = createApiRouter({ apiTarget: REMOTE, localTarget: () => LOCAL });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) router.report('remote', false);
    expect(router.resolve()).toEqual({ which: 'local', target: LOCAL });
    expect(router.status().serving).toBe('local');
    expect(router.status().remote.online).toBe(false);
  });

  it('תשובה מהמאגר המקומי אינה משנה את מצב השרת המרכזי', () => {
    // אחרת נתק היה "נרפא" מעצמו: בקשות שמצליחות מקומית היו נספרות כהצלחה
    // מול המרכזי, העמדה הייתה חוזרת אליו, נכשלת שוב, וחוזר חלילה.
    router = createApiRouter({ apiTarget: REMOTE, localTarget: () => LOCAL });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) router.report('remote', false);
    router.report('local', true);
    router.report('local', true);
    expect(router.resolve().which).toBe('local');
  });

  it('חזרת השרת המרכזי מחזירה את הניתוב אליו', () => {
    router = createApiRouter({ apiTarget: REMOTE, localTarget: () => LOCAL });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) router.report('remote', false);
    expect(router.resolve().which).toBe('local');
    router.health.markUp();
    expect(router.resolve().which).toBe('remote');
  });

  it('המאגר המקומי טרם עלה - נשארים על המרכזי במקום לנתב לשום מקום', () => {
    let local = null;
    router = createApiRouter({ apiTarget: REMOTE, localTarget: () => local });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) router.report('remote', false);
    expect(router.resolve()).toEqual({ which: 'remote', target: REMOTE });
    local = LOCAL; // המאגר סיים לעלות
    expect(router.resolve()).toEqual({ which: 'local', target: LOCAL });
  });

  it('מצב local מנתב מקומית מיד, בלי לחכות לכשל', () => {
    router = createApiRouter({ apiTarget: REMOTE, localTarget: () => LOCAL, mode: 'local' });
    expect(router.resolve().which).toBe('local');
    expect(router.status().remote.online).toBe(true); // לא הוכרז נתק - פשוט לא פונים לשרת
  });

  it('מצב remote משבית את המאגר המקומי לחלוטין', () => {
    router = createApiRouter({ apiTarget: REMOTE, localTarget: () => LOCAL, mode: 'remote' });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) router.report('remote', false);
    expect(router.resolve().which).toBe('remote');
  });

  it('החלפת מצב בזמן ריצה משנה את הניתוב - זה מתג "עבודה מקומית" בממשק', () => {
    router = createApiRouter({ apiTarget: REMOTE, localTarget: () => LOCAL });
    expect(router.resolve().which).toBe('remote');
    router.setMode('local');
    expect(router.resolve().which).toBe('local');
    router.setMode('auto');
    expect(router.resolve().which).toBe('remote');
  });
});

describe('בדיקה תקופתית של השרת המרכזי', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('רצה רק בזמן נתק - כשהשרת חי כל בקשה אמיתית היא כבר עדות למצבו', () => {
    const health = createRemoteHealth({ apiTarget: REMOTE, probeIntervalMs: 1000 });
    const spy = vi.spyOn(health, 'probeOnce');
    vi.advanceTimersByTime(5000);
    expect(spy).not.toHaveBeenCalled(); // מחובר → אין תעבורת בדיקה
    health.stop();
  });
});
