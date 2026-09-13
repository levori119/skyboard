// כניסה לאפליקציית DRIVER - דרך המיראז', עם ת"ז כשם משתמש.
//
// מה נבדק: רק מי שיש לו הרשאה לאפליקציית DRIVER במיראז' מקבל אסימון, והאסימון
// נושא את הת"ז שלו - זו הזהות שממנה נגזרות "הנסיעות שלי" (routes/permits.js).
// קוד הגישה המשותף בוטל: הוא לא זיהה אדם, ולכן לא יכול היה לסנן נסיעות.
//
// המיראז' כאן הוא שרת אמיתי קטן על פורט פתוח, ולא mock של fetch: הטענה היא על
// מה SKY-KING שולח לו בפועל (שם האפליקציה, הת"ז) ואיך הוא מפרש את התשובה.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

let skyServer, mirageServer, base;
let lastAuthorize = null;
/** ת"ז -> תשובת המיראז' */
const MIRAGE_USERS = {
  '012345678': { authorized: true, app: 'SKY-KING DRIVER', roles: ['user'], bases: [{ id: 7, name: 'תל נוף' }], user: { fullName: 'דני כהן' } },
  // מורשה לאפליקציה אבל לא שויך לאף בסיס
  '033333334': { authorized: true, app: 'SKY-KING DRIVER', roles: ['user'], bases: [], user: { fullName: 'בלי בסיס' } },
  '087654321': { authorized: false, reason: 'app_not_permitted' },
  '011111118': { authorized: false, reason: 'bad_credentials' },
  '022222226': { authorized: false, reason: 'rate_limited' },
};
let mirageChannelBroken = false;

beforeAll(async () => {
  const { listen } = await import('../listen.js');

  const fake = express();
  fake.use(express.json());
  fake.post('/api/authorize', (req, res) => {
    lastAuthorize = req.body;
    if (mirageChannelBroken) return res.status(401).json({ error: 'bad_service_token' });
    res.json(MIRAGE_USERS[req.body.personalNumber] || { authorized: false, reason: 'bad_credentials' });
  });
  mirageServer = await listen(fake, 0, '127.0.0.1');

  // נקבעים לפני טעינת המודול - שניהם נקראים בזמן הטעינה
  process.env.MIRAGE_URL = `http://127.0.0.1:${mirageServer.address().port}`;
  delete process.env.MIRAGE_DRIVER_APP_NAME;
  delete process.env.SKYKING_LOCAL_DB;
  // pg.Pool מתחבר רק בשאילתה; נתיב הנהג אינו שואל את ה-DB
  process.env.DATABASE_URL = 'postgres://nobody@127.0.0.1:1/none';

  const { default: router } = await import('./mirage.js');
  const app = express();
  app.use(express.json());
  app.use(router);
  skyServer = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${skyServer.address().port}`;
}, 60_000);

afterAll(async () => {
  await new Promise(r => skyServer?.close(r));
  await new Promise(r => mirageServer?.close(r));
});

beforeEach(() => { lastAuthorize = null; mirageChannelBroken = false; });

const login = body => fetch(`${base}/api/auth/driver`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('כניסת נהג ל-DRIVER דרך המיראז\'', () => {
  it('נהג מורשה מקבל אסימון נהג שנושא את הת"ז שלו', async () => {
    const { verifyToken } = await import('../auth/token.js');
    const res = await login({ nationalId: '012345678', password: 'Secret#2026' });
    expect(res.status).toBe(200);
    const body = await res.json();
    const claims = verifyToken(body.token);
    expect(claims.role).toBe('driver');
    expect(claims.nationalId).toBe('012345678');
    expect(claims.baseIds).toEqual([7]);
    expect(body.driver).toEqual({ name: 'דני כהן', nationalId: '012345678', bases: [{ id: 7, name: 'תל נוף' }] });
  });

  // ההרשאה נבדקת מול אפליקציית DRIVER, לא מול SKY-KING - בקר אינו נהג מעצם היותו בקר
  it('שואל את המיראז\' על אפליקציית SKY-KING DRIVER, עם הת"ז כשם המשתמש', async () => {
    await login({ nationalId: '012345678', password: 'Secret#2026' });
    expect(lastAuthorize).toEqual({ app: 'SKY-KING DRIVER', personalNumber: '012345678', password: 'Secret#2026' });
  });

  // נהג בלי בסיס אינו רואה דבר - עדיף לומר לו את זה בכניסה מאשר להציג אפליקציה ריקה
  it('נהג מורשה שלא שויך לאף בסיס נדחה ב-403 no_base_permitted, בלי אסימון', async () => {
    const res = await login({ nationalId: '033333334', password: 'Secret#2026' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('no_base_permitted');
    expect(body.token).toBeUndefined();
  });

  it('ת"ז שהוקלדה עם רווחים ומקפים נשלחת כספרות בלבד', async () => {
    await login({ nationalId: ' 01234-5678 ', password: 'Secret#2026' });
    expect(lastAuthorize.personalNumber).toBe('012345678');
  });

  it('משתמש בלי הרשאה לאפליקציית DRIVER נדחה ב-403', async () => {
    const res = await login({ nationalId: '087654321', password: 'Secret#2026' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_authorized');
  });

  it('ת"ז או סיסמה שגויים - 401, בלי אסימון', async () => {
    const res = await login({ nationalId: '011111118', password: 'wrong' });
    expect(res.status).toBe(401);
    expect((await res.json()).token).toBeUndefined();
  });

  it('חסימת ניסיונות במיראז\' - 429', async () => {
    expect((await login({ nationalId: '022222226', password: 'x' })).status).toBe(429);
  });

  it('בלי ת"ז תקינה או בלי סיסמה - 400, והמיראז\' לא נשאל', async () => {
    expect((await login({ nationalId: '12', password: 'x' })).status).toBe(400);
    expect((await login({ nationalId: '012345678' })).status).toBe(400);
    expect(lastAuthorize).toBeNull();
  });

  // קוד הגישה המשותף בוטל: גוף בפורמט הישן אינו פותח דבר
  it('קוד הגישה המשותף הישן אינו מכניס', async () => {
    process.env.DRIVER_ACCESS_CODE = 'shared-code-123';
    const res = await login({ code: 'shared-code-123' });
    delete process.env.DRIVER_ACCESS_CODE;
    expect(res.status).toBe(400);
  });

  // תקלת תצורה בין השירותים אינה "אין לך הרשאה" - אחרת הנהג מחפש במקום הלא נכון
  it('ערוץ מיראז\' שבור - 502 ולא 403', async () => {
    mirageChannelBroken = true;
    const res = await login({ nationalId: '012345678', password: 'Secret#2026' });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('mirage_unavailable');
  });
});
