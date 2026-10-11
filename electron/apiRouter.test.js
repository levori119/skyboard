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
/** הבדיקות הקיימות בודקות את הסף עצמו - בלי בדיקת האישור מול /api/health. */
const NO_CONFIRM = { confirmDown: false };

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

  it('בקשות שיצאו יחד ונפלו יחד בעיכוב בודד - אירוע אחד, לא מעבר למקומי (2026-10-09)', () => {
    // נמדד: הסוכן המתין 10.8 ש' פעם אחת, וכל הבקשות שהיו באוויר נפלו יחד על
    // תקרת הזמן. כל אחת נספרה בנפרד, והעמדה עברה למאגר המקומי מאירוע אחד.
    let t = 1_000_000;
    health = createRemoteHealth({ apiTarget: REMOTE, now: () => t });
    const sent = t;
    t += 8000;
    for (let i = 0; i < 5; i++) health.markDown(sent);
    expect(health.snapshot().online).toBe(true);
  });

  it('נתק אמיתי: גם בקשות שיצאו אחרי הכשל נופלות - עוברים למקומי', () => {
    let t = 1_000_000;
    health = createRemoteHealth({ apiTarget: REMOTE, now: () => t });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      const sent = t;
      t += 8000;
      health.markDown(sent);
      t += 1000;
    }
    expect(health.snapshot().online).toBe(false);
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
    router = createApiRouter({ ...NO_CONFIRM, apiTarget: REMOTE, localTarget: () => LOCAL });
    expect(router.resolve()).toEqual({ which: 'remote', target: REMOTE });
  });

  it('עובר למאגר המקומי אחרי סף הכשלים, ומדווח על כך במצב', () => {
    router = createApiRouter({ ...NO_CONFIRM, apiTarget: REMOTE, localTarget: () => LOCAL });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) router.report('remote', false);
    expect(router.resolve()).toEqual({ which: 'local', target: LOCAL });
    expect(router.status().serving).toBe('local');
    expect(router.status().remote.online).toBe(false);
  });

  it('תשובה מהמאגר המקומי אינה משנה את מצב השרת המרכזי', () => {
    // אחרת נתק היה "נרפא" מעצמו: בקשות שמצליחות מקומית היו נספרות כהצלחה
    // מול המרכזי, העמדה הייתה חוזרת אליו, נכשלת שוב, וחוזר חלילה.
    router = createApiRouter({ ...NO_CONFIRM, apiTarget: REMOTE, localTarget: () => LOCAL });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) router.report('remote', false);
    router.report('local', true);
    router.report('local', true);
    expect(router.resolve().which).toBe('local');
  });

  it('חזרת השרת המרכזי מחזירה את הניתוב אליו', () => {
    router = createApiRouter({ ...NO_CONFIRM, apiTarget: REMOTE, localTarget: () => LOCAL });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) router.report('remote', false);
    expect(router.resolve().which).toBe('local');
    router.health.markUp();
    expect(router.resolve().which).toBe('remote');
  });

  it('המאגר המקומי טרם עלה - נשארים על המרכזי במקום לנתב לשום מקום', () => {
    let local = null;
    router = createApiRouter({ ...NO_CONFIRM, apiTarget: REMOTE, localTarget: () => local });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) router.report('remote', false);
    expect(router.resolve()).toEqual({ which: 'remote', target: REMOTE });
    local = LOCAL; // המאגר סיים לעלות
    expect(router.resolve()).toEqual({ which: 'local', target: LOCAL });
  });

  it('מצב local מנתב מקומית מיד, בלי לחכות לכשל', () => {
    router = createApiRouter({ ...NO_CONFIRM, apiTarget: REMOTE, localTarget: () => LOCAL, mode: 'local' });
    expect(router.resolve().which).toBe('local');
    expect(router.status().remote.online).toBe(true); // לא הוכרז נתק - פשוט לא פונים לשרת
  });

  it('מצב remote משבית את המאגר המקומי לחלוטין', () => {
    router = createApiRouter({ ...NO_CONFIRM, apiTarget: REMOTE, localTarget: () => LOCAL, mode: 'remote' });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) router.report('remote', false);
    expect(router.resolve().which).toBe('remote');
  });

  it('החלפת מצב בזמן ריצה משנה את הניתוב - זה מתג "עבודה מקומית" בממשק', () => {
    router = createApiRouter({ ...NO_CONFIRM, apiTarget: REMOTE, localTarget: () => LOCAL });
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

// ── נתק מדומה - בעמדה הזו בלבד ────────────────────────────────────────────────
// הדרישה: להדליק נתק בעמדה אחת ולראות שהשנייה ממשיכה לעבוד מול המרכז. לכן
// הבדיקות כאן מוודאות שני דברים - שהדימוי באמת מנתק, ושהוא **לא** נוגע במצב
// הקשר האמיתי (אחרת העמדה הייתה נשארת מנותקת גם אחרי כיבוי הכפתור).
describe('נתק מדומה', () => {
  it('chooseTarget: דימוי מנתב למאגר המקומי גם כשהמרכזי חי', () => {
    expect(chooseTarget({ mode: 'auto', remoteOnline: true, hasLocal: true, simulated: true })).toBe('local');
  });

  it('chooseTarget: דימוי גובר גם על mode remote', () => {
    expect(chooseTarget({ mode: 'remote', remoteOnline: true, hasLocal: true, simulated: true })).toBe('local');
  });

  it('chooseTarget: בלי מאגר מקומי הבקשה נכשלת ולא "ממשיכה לעבוד"', () => {
    expect(chooseTarget({ mode: 'auto', remoteOnline: true, hasLocal: false, simulated: true })).toBe('none');
  });

  it('הדלקה מעבירה למקומי, כיבוי מחזיר למרכזי', () => {
    const router = createApiRouter({ ...NO_CONFIRM, apiTarget: REMOTE, localTarget: () => LOCAL });
    expect(router.resolve().which).toBe('remote');

    const on = router.setSimulatedOutage(true);
    expect(on.simulated).toBe(true);
    expect(on.serving).toBe('local');
    expect(router.resolve().target).toBe(LOCAL);

    const off = router.setSimulatedOutage(false);
    expect(off.simulated).toBe(false);
    expect(router.resolve().which).toBe('remote');
    router.health.stop();
  });

  it('כשלים בזמן דימוי אינם מגלגלים את מצב הקשר האמיתי', () => {
    const router = createApiRouter({ ...NO_CONFIRM, apiTarget: REMOTE, localTarget: () => LOCAL });
    router.setSimulatedOutage(true);
    for (let i = 0; i < FAILURE_THRESHOLD + 2; i++) router.report('remote', false);
    router.setSimulatedOutage(false);
    // אילו הכשלים המדומים נספרו, העמדה הייתה נשארת על המאגר המקומי
    expect(router.health.snapshot().online).toBe(true);
    expect(router.resolve().which).toBe('remote');
    router.health.stop();
  });

  it('ניתוב מפורש מגיע ליעד שנדרש, בלי קשר למצב', () => {
    const router = createApiRouter({ ...NO_CONFIRM, apiTarget: REMOTE, localTarget: () => LOCAL });
    expect(router.resolveForced('local').target).toBe(LOCAL);
    expect(router.resolveForced('remote').target).toBe(REMOTE);
    router.health.stop();
  });
});

// ── חזרה מנתק: לא למרכז לפני שהעבודה נדחפה ───────────────────────────────────
// הדיווח: "מטוס בנקודת העברה, מנתק ומחבר את הקשר - זה לא קובע מה שיש בעמדה
// אלא מסנכרן מה שיש במאגר". המנגנון עצמו תקין (יש על כך בדיקות אינטגרציה),
// אבל **הסדר** לא היה: הנתב החזיר את העמדה למרכז ברגע שהקשר חזר, בעוד
// שהדחיפה רצה בדפדפן בטיק הבא. בשניות שביניהן המסך הציג את גרסת המרכז על
// שורות שהעמדה שינתה בנתק - והפ"מ "קפץ אחורה" מול עיני הפקח.
describe('chooseTarget - ניקוז היומן לפני חזרה למרכז', () => {
  const base = { mode: 'auto', hasLocal: true, simulated: false };

  it('הקשר חזר אבל יש עבודה שלא נדחפה - נשארים מקומיים', () => {
    expect(chooseTarget({ ...base, remoteOnline: true, drainPending: true })).toBe('local');
  });

  it('היומן התרוקן - חוזרים למרכז', () => {
    expect(chooseTarget({ ...base, remoteOnline: true, drainPending: false })).toBe('remote');
  });

  it('בלי מאגר מקומי אין מה לנקז - למרכז', () => {
    expect(chooseTarget({ ...base, hasLocal: false, remoteOnline: true, drainPending: true })).toBe('remote');
  });

  // `mode: 'remote'` הוא בקשה מפורשת לעקוף את כל המנגנון (אבחון), ולכן גובר.
  it('mode remote מפורש גובר גם על ניקוז', () => {
    expect(chooseTarget({ ...base, mode: 'remote', remoteOnline: true, drainPending: true })).toBe('remote');
  });

  it('נתק מדומה גובר על הכל', () => {
    expect(chooseTarget({ ...base, simulated: true, remoteOnline: true, drainPending: false })).toBe('local');
  });
});

// ── אישור מול /api/health לפני מעבר למקומי (2026-10-11) ───────────────────────
// הדיווח: "כל הזמן ניתוקים - עבודה מקומית, אין קשר לשרת". הלוג של הסוכן הראה
// שהמרכז לא נפל (uptime 34 שעות) אלא **האט**: בקשות שחיכו יותר מ-8 שניות נספרו
// ככשל קשר, ושלוש כאלה העבירו את כל העמדה למאגר המקומי. איטיות אינה נתק -
// ומעבר למקומי מול מרכז חי מייצר כתיבות שצריך לסנכרן חזרה. לכן לפני המעבר
// שואלים את /api/health, שאינו נוגע ב-DB: עונה = המרכז חי, נשארים.
describe('אישור הנתק מול /api/health', () => {
  const flush = () => new Promise(r => setTimeout(r, 0));
  let health;
  afterEach(() => health?.stop());

  it('המרכז עונה ל-health - איטיות ולא נתק: נשארים מחוברים והמונה מתאפס', async () => {
    const confirmDown = vi.fn(async () => true);
    health = createRemoteHealth({ apiTarget: REMOTE, confirmDown });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) health.markDown();
    await flush();
    expect(confirmDown).toHaveBeenCalledTimes(1);
    expect(health.snapshot().online).toBe(true);
    expect(health.snapshot().failures).toBe(0);
  });

  it('גם health אינו עונה - נתק אמיתי: עוברים למקומי', async () => {
    health = createRemoteHealth({ apiTarget: REMOTE, confirmDown: async () => false });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) health.markDown();
    await flush();
    expect(health.snapshot().online).toBe(false);
    expect(health.snapshot().offlineSince).toBeTypeOf('number');
  });

  it('בדיקת האישור שנזרקה נחשבת כשל - לא נתקעים "מחוברים" לשרת מת', async () => {
    health = createRemoteHealth({ apiTarget: REMOTE, confirmDown: async () => { throw new Error('x'); } });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) health.markDown();
    await flush();
    expect(health.snapshot().online).toBe(false);
  });

  it('כשלים שמגיעים בזמן הבדיקה אינם פותחים בדיקה נוספת', async () => {
    let release;
    const confirmDown = vi.fn(() => new Promise(r => { release = r; }));
    health = createRemoteHealth({ apiTarget: REMOTE, confirmDown });
    for (let i = 0; i < FAILURE_THRESHOLD + 4; i++) health.markDown();
    expect(confirmDown).toHaveBeenCalledTimes(1);
    expect(health.snapshot().online).toBe(true); // עד שהבדיקה מכריעה - לא מחליפים מאגר
    release(false);
    await flush();
    expect(health.snapshot().online).toBe(false);
  });

  it('הצלחה אמיתית בזמן הבדיקה גוברת - לא עוברים למקומי', async () => {
    let release;
    health = createRemoteHealth({ apiTarget: REMOTE, confirmDown: () => new Promise(r => { release = r; }) });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) health.markDown();
    health.markUp();
    release(false);
    await flush();
    expect(health.snapshot().online).toBe(true);
  });

  it('הנתב מאשר כברירת מחדל - בלי אישור מפורש אין מעבר על סמך איטיות', async () => {
    const router = createApiRouter({ apiTarget: REMOTE, localTarget: () => LOCAL, confirmDown: async () => true });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) router.report('remote', false);
    await flush();
    expect(router.resolve().which).toBe('remote');
    router.health.stop();
  });

  it('הנתב בלי confirmDown מפורש משתמש ב-probeOnce של health', () => {
    const router = createApiRouter({ apiTarget: REMOTE, localTarget: () => LOCAL });
    const spy = vi.spyOn(router.health, 'probeOnce').mockResolvedValue(true);
    for (let i = 0; i < FAILURE_THRESHOLD; i++) router.report('remote', false);
    expect(spy).toHaveBeenCalledTimes(1);
    router.health.stop();
  });
});
