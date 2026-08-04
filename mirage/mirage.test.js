// בדיקות לדמו מיראז' — מערכת ניהול משתמשים והרשאות (אפליקציה נפרדת מ-SKY-KING).
// TDD: נכתבו לפני המימוש. מריצים עם `npm test` (vitest).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { createMirageApp } from './app.js';
import { validatePassword, hashPassword, verifyPassword } from './password.js';

// סיסמת בדיקות תקנית: 12+ תווים, אות גדולה+קטנה, ספרה, תו מיוחד
const TEST_PW = 'Skc#2026!Wxyz';
const OTHER_PW = 'Zzq$2027!Abcd';

const SEED = {
  users: [
    { personalNumber: '34234',   firstName: 'יוחאי', lastName: 'שטיינברג', passwordHash: hashPassword(TEST_PW), apps: { 'SKY-KING': ['admin'] } },
    { personalNumber: '5229214', firstName: 'אורן',  lastName: 'בן דור',   passwordHash: hashPassword(TEST_PW), apps: { 'SKY-KING': ['user'] } },
    { personalNumber: '7654321', firstName: 'נועה',  lastName: 'פרץ',      passwordHash: hashPassword(TEST_PW), apps: { 'OTHER-APP': ['user'] } },
    // פורמט מורחב: roles + הגבלת עמדות (לפי id טכני או שם טקסטואלי)
    {
      personalNumber: '1111111', firstName: 'רון', lastName: 'מזרחי', passwordHash: hashPassword(TEST_PW),
      apps: { 'SKY-KING': { roles: ['user'], workstations: [{ id: 2, name: 'עמדה צפון' }, { name: 'עמדה ידנית' }] } },
    },
    // משתמש legacy בלי סיסמה — חייב לקבל password_not_set עד שתוגדר לו
    { personalNumber: '9990001', firstName: 'ותיק', lastName: 'בלי סיסמה', apps: { 'SKY-KING': ['user'] } },
  ],
};

let baseUrl = '';
let server;
let dataFile = '';
let tmpDir = '';

// ניהול המשתמשים דורש אסימון מנהל (ממצא אבטחה SK-54). ADMIN_TOKEN מתמלא
// ב-beforeAll מול משתמש ה-admin שבזרע, ומצורף אוטומטית לכל קריאת ניהול —
// כך הבדיקות עוברות דרך אותו שער כמו מסך הניהול, ולא דרך דלת אחורית.
let ADMIN_TOKEN = '';
const authHeaders = () => (ADMIN_TOKEN ? { Authorization: `Bearer ${ADMIN_TOKEN}` } : {});

const post = (p, body) => fetch(`${baseUrl}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body),
});
const put = (p, body) => fetch(`${baseUrl}${p}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body),
});
const getJson = (p) => fetch(`${baseUrl}${p}`, { headers: authHeaders() });
const del = (p) => fetch(`${baseUrl}${p}`, { method: 'DELETE', headers: authHeaders() });
const authorize = (personalNumber, password = TEST_PW, app = 'SKY-KING') =>
  post('/api/authorize', { app, personalNumber, password });

// SKY-KING מזויף — מקור שמות העמדות עבור /api/workstation-options
let fakeSkyKing;
let fakeSkyKingUrl = '';

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'mirage-test-'));
  dataFile = path.join(tmpDir, 'data.json');
  writeFileSync(dataFile, JSON.stringify(SEED, null, 2), 'utf8');

  const { createServer } = await import('http');
  fakeSkyKing = createServer((req, res) => {
    if (req.url === '/api/workstation-presets') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([
        { id: 1, name: 'בת"ק דרום', map_id: 9, extra: 'x', preset_role: 'tower', parent_base_id: 7 },
        { id: 2, name: 'עמדה צפון', map_id: 9 },
      ]));
    } else if (req.url === '/api/aviation-bases') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([{ id: 7, name: 'תל נוף', code: 'TLN' }]));
    } else { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => fakeSkyKing.listen(0, resolve));
  fakeSkyKingUrl = `http://localhost:${fakeSkyKing.address().port}`;

  const app = createMirageApp({ dataFile, skykingUrl: fakeSkyKingUrl });
  await new Promise(resolve => { server = app.listen(0, resolve); });
  baseUrl = `http://localhost:${server.address().port}`;

  // הזדהות מנהל — 34234 הוא ה-admic בזרע. חייב לרוץ עם ADMIN_TOKEN ריק,
  // כלומר דרך fetch ישיר, כדי לא להסתמך על עצמו.
  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personalNumber: '34234', password: TEST_PW }),
  });
  ADMIN_TOKEN = (await login.json()).token;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => fakeSkyKing.close(resolve));
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("מיראז' — מדיניות סיסמה חזקה (לפי התקן)", () => {
  const ctx = { personalNumber: '1234567', firstName: 'דנה', lastName: 'כהן' };

  it('סיסמה תקנית עוברת', () => {
    expect(validatePassword('Skc#2026!Wxyz', ctx).ok).toBe(true);
  });

  it('קצרה מ-12 תווים נפסלת', () => {
    const r = validatePassword('Ab1!Ab1!', ctx);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('too_short');
  });

  it('בלי אות גדולה / קטנה / ספרה / תו מיוחד — נפסלת עם הקוד המתאים', () => {
    expect(validatePassword('abc#2026!wxyz', ctx).errors).toContain('missing_upper');
    expect(validatePassword('ABC#2026!WXYZ', ctx).errors).toContain('missing_lower');
    expect(validatePassword('Abcdefg#!hijk', ctx).errors).toContain('missing_digit');
    expect(validatePassword('Abcdefg2026hij', ctx).errors).toContain('missing_special');
  });

  it('מכילה את המספר האישי או את השם — נפסלת', () => {
    expect(validatePassword('Aa1!x1234567yz', ctx).errors).toContain('contains_personal_info');
    expect(validatePassword('Aa1!דנהabcdefg', ctx).errors).toContain('contains_personal_info');
  });

  it('סיסמה נפוצה נפסלת', () => {
    const r = validatePassword('Password123!', ctx);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('common_password');
  });

  it('hash/verify: אימות נכון, דחיית סיסמה שגויה, hash שונה לכל קריאה (salt)', () => {
    const h = hashPassword('Skc#2026!Wxyz');
    expect(verifyPassword('Skc#2026!Wxyz', h)).toBe(true);
    expect(verifyPassword('Skc#2026!Wxyw', h)).toBe(false);
    expect(hashPassword('Skc#2026!Wxyz')).not.toBe(h);
    expect(h).not.toContain('Skc');
  });
});

describe("מיראז' — health", () => {
  it('מחזיר סטטוס תקין ושם שירות', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('MIRAGE');
  });
});

describe("מיראז' — POST /api/authorize (עם סיסמה)", () => {
  it('מספר אישי + סיסמה נכונים → authorized + roles + פרטי משתמש', async () => {
    const res = await authorize('34234');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorized).toBe(true);
    expect(body.roles).toEqual(['admin']);
    expect(body.user.firstName).toBe('יוחאי');
    expect(body.user.fullName).toBe('יוחאי שטיינברג');
  });

  it('סיסמה שגויה → authorized:false, reason=bad_credentials', async () => {
    const body = await (await authorize('34234', 'Wrong#2026!Xyz')).json();
    expect(body.authorized).toBe(false);
    expect(body.reason).toBe('bad_credentials');
  });

  it('מספר אישי לא מוכר → אותה תשובה (bad_credentials) — בלי חשיפת קיום משתמש', async () => {
    const body = await (await authorize('0000000')).json();
    expect(body.authorized).toBe(false);
    expect(body.reason).toBe('bad_credentials');
  });

  it('משתמש ותיק בלי סיסמה → reason=password_not_set', async () => {
    const body = await (await authorize('9990001')).json();
    expect(body.authorized).toBe(false);
    expect(body.reason).toBe('password_not_set');
  });

  it('בלי סיסמה → 400', async () => {
    const res = await post('/api/authorize', { app: 'SKY-KING', personalNumber: '34234' });
    expect(res.status).toBe(400);
  });

  it('משתמש קיים בלי הרשאה לאפליקציה (סיסמה נכונה) → app_not_permitted', async () => {
    const body = await (await authorize('7654321')).json();
    expect(body.authorized).toBe(false);
    expect(body.reason).toBe('app_not_permitted');
  });
});

describe("מיראז' — הגבלת ניסיונות (rate limit)", () => {
  it('אחרי 5 כישלונות — חסימה זמנית גם עם סיסמה נכונה', async () => {
    for (let i = 0; i < 5; i++) {
      await authorize('1111111', 'Wrong#2026!Xyz');
    }
    const res = await authorize('1111111');
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.authorized).toBe(false);
    expect(body.reason).toBe('rate_limited');
  });
});

describe("מיראז' — הרשאת עמדות", () => {
  it('פורמט מורחב: authorize מחזיר גם workstations (id טכני או שם טקסט)', async () => {
    const res = await authorize('5229214');
    const body = await res.json();
    expect(body.authorized).toBe(true);
    expect(body.workstations).toEqual([]);
    // המשתמש עם ההגבלה (1111111) חסום כרגע ב-rate limit — בודקים דרך משתמש חדש
    await post('/api/users', {
      personalNumber: '3333333', firstName: 'גל', lastName: 'ים', password: TEST_PW,
      apps: { 'SKY-KING': { roles: ['user'], workstations: [{ id: 2, name: 'עמדה צפון' }] } },
    });
    const b2 = await (await authorize('3333333')).json();
    expect(b2.authorized).toBe(true);
    expect(b2.workstations).toEqual([{ id: 2, name: 'עמדה צפון' }]);
    await del('/api/users/3333333');
  });

  it('GET /api/workstation-options — מושך שמות עמדות מהאפליקציה (SKY-KING)', async () => {
    const res = await getJson('/api/workstation-options');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.workstations).toEqual([
      { id: 1, name: 'בת"ק דרום', role: 'tower', base: 'תל נוף' },
      { id: 2, name: 'עמדה צפון', role: null, base: null },
    ]);
  });

  it('תפקידים מקצועיים (positions) הם ציר נפרד מ-roles ומוחזרים ב-authorize', async () => {
    await post('/api/users', {
      personalNumber: '4444444', firstName: 'שיר', lastName: 'לוי', password: TEST_PW,
      apps: { 'SKY-KING': { roles: ['user'], workstations: [], positions: ['bakar', 'mashak'] } },
    });
    const body = await (await authorize('4444444')).json();
    expect(body.authorized).toBe(true);
    expect(body.roles).toEqual(['user']);            // ההרשאה לא הושפעה
    expect(body.positions).toEqual(['bakar', 'mashak']);
    await del('/api/users/4444444');
  });

  it('כח אדם היא הרשאה נוספת: admin + manpower חיים יחד ושניהם חוזרים', async () => {
    await post('/api/users', {
      personalNumber: '4444447', firstName: 'רותם', lastName: 'שדה', password: TEST_PW,
      apps: { 'SKY-KING': { roles: ['admin', 'manpower'], workstations: [] } },
    });
    const body = await (await authorize('4444447')).json();
    expect(body.authorized).toBe(true);
    expect(body.roles).toEqual(['admin', 'manpower']);
    await del('/api/users/4444447');

    // גם ראש צוות + כח אדם
    await post('/api/users', {
      personalNumber: '4444448', firstName: 'ליאור', lastName: 'גל', password: TEST_PW,
      apps: { 'SKY-KING': { roles: ['team_lead', 'manpower'], workstations: [] } },
    });
    const b2 = await (await authorize('4444448')).json();
    expect(b2.roles).toEqual(['team_lead', 'manpower']);
    await del('/api/users/4444448');
  });

  it('פקח הוא תפקיד נפרד מבקר — שני מקצועות, לא אותו תא', async () => {
    await post('/api/users', {
      personalNumber: '4444446', firstName: 'תמר', lastName: 'אבן', password: TEST_PW,
      apps: { 'SKY-KING': { roles: ['user'], workstations: [], positions: ['pakach'] } },
    });
    const body = await (await authorize('4444446')).json();
    expect(body.positions).toEqual(['pakach']);
    expect(body.positions).not.toContain('bakar');
    await del('/api/users/4444446');
  });

  it('תפקיד לא מוכר נזרק, ומשתמש בלי positions מקבל רשימה ריקה (תאימות לאחור)', async () => {
    await post('/api/users', {
      personalNumber: '4444445', firstName: 'עדי', lastName: 'כהן', password: TEST_PW,
      apps: { 'SKY-KING': { roles: ['user'], workstations: [], positions: ['bakar', 'not_a_position'] } },
    });
    const body = await (await authorize('4444445')).json();
    expect(body.positions).toEqual(['bakar']);
    await del('/api/users/4444445');

    // פורמט ישן (מערך roles בלבד) — positions ריק, בלי לשבור את הכניסה
    const legacy = await (await authorize('34234')).json();
    expect(legacy.authorized).toBe(true);
    expect(legacy.positions).toEqual([]);
  });

  it('workstation-options כש-SKY-KING לא זמין → available:false ורשימה ריקה (הזנה ידנית)', async () => {
    const downApp = createMirageApp({ dataFile, skykingUrl: 'http://localhost:1' });
    const downServer = await new Promise(resolve => { const s = downApp.listen(0, () => resolve(s)); });
    // מופע נפרד — אך אותו סוד חתימה בתהליך, ולכן אסימון המנהל תקף גם מולו
    const res = await fetch(`http://localhost:${downServer.address().port}/api/workstation-options`, { headers: authHeaders() });
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.workstations).toEqual([]);
    await new Promise(resolve => downServer.close(resolve));
  });
});

describe("מיראז' — ניהול משתמשים (CRUD עם סיסמה)", () => {
  it('GET /api/users מחזיר את משתמשי ה-seed בלי ה-hash', async () => {
    const res = await getJson('/api/users');
    expect(res.status).toBe(200);
    const users = await res.json();
    expect(users.map(u => u.personalNumber)).toContain('34234');
    for (const u of users) {
      expect(u.passwordHash).toBeUndefined();
      expect(u.hasPassword !== undefined).toBe(true);
    }
  });

  it('POST בלי סיסמה → 400', async () => {
    const res = await post('/api/users', { personalNumber: '4444444', firstName: 'בלי', lastName: 'סיסמה', apps: {} });
    expect(res.status).toBe(400);
  });

  it('POST עם סיסמה חלשה → 400 weak_password עם פירוט', async () => {
    const res = await post('/api/users', { personalNumber: '4444444', firstName: 'חלש', lastName: 'מדי', password: 'abc', apps: {} });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('weak_password');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('POST עם סיסמה תקנית → נוצר; authorize עובד עם הסיסמה; ה-hash לא נחשף', async () => {
    const res = await post('/api/users', {
      personalNumber: '1234567', firstName: 'דנה', lastName: 'כהן', password: TEST_PW,
      apps: { 'SKY-KING': { roles: ['team_lead'], workstations: [] } },
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.passwordHash).toBeUndefined();
    const auth = await (await authorize('1234567')).json();
    expect(auth.authorized).toBe(true);
    expect(auth.roles).toEqual(['team_lead']);
  });

  it('POST עם מספר אישי קיים → 409', async () => {
    const res = await post('/api/users', { personalNumber: '34234', firstName: 'כפול', lastName: 'כפול', password: TEST_PW, apps: {} });
    expect(res.status).toBe(409);
  });

  it('PUT מחליף סיסמה: הישנה מפסיקה לעבוד, החדשה עובדת; PUT עם חלשה → 400', async () => {
    const weak = await put('/api/users/1234567', { password: '123' });
    expect(weak.status).toBe(400);
    const res = await put('/api/users/1234567', { password: OTHER_PW });
    expect(res.status).toBe(200);
    const oldAuth = await (await authorize('1234567', TEST_PW)).json();
    expect(oldAuth.reason).toBe('bad_credentials');
    const newAuth = await (await authorize('1234567', OTHER_PW)).json();
    expect(newAuth.authorized).toBe(true);
  });

  it('הקובץ שנשמר מכיל hash ולא סיסמה גלויה', () => {
    const onDisk = readFileSync(dataFile, 'utf8');
    expect(onDisk).not.toContain(TEST_PW);
    expect(onDisk).not.toContain(OTHER_PW);
    const parsed = JSON.parse(onDisk);
    const dana = parsed.users.find(u => u.personalNumber === '1234567');
    expect(dana.passwordHash.startsWith('s2$')).toBe(true);
  });

  it('DELETE מוחק; authorize מחזיר bad_credentials (בלי חשיפת קיום)', async () => {
    const res = await del('/api/users/1234567');
    expect(res.status).toBe(200);
    const auth = await (await authorize('1234567', OTHER_PW)).json();
    expect(auth.authorized).toBe(false);
    expect(auth.reason).toBe('bad_credentials');
  });
});

// ── אתחול ראשוני ואימות ניהול המשתמשים (ממצא אבטחה SK-54) ────────────────────
describe("מיראז' — אימות ניהול המשתמשים (SK-54)", () => {
  let tmp2 = '';
  let srv2;
  let url2 = '';
  const ADMIN = { personalNumber: '8000001', firstName: 'מנהל', lastName: 'ראשון', password: 'Boot#2026!Wxyz' };

  beforeAll(async () => {
    // מאגר ריק לגמרי — כדי לבדוק את מסלול האתחול הראשוני כפי שהוא בפריסה חדשה
    tmp2 = mkdtempSync(path.join(tmpdir(), 'mirage-boot-'));
    const f = path.join(tmp2, 'data.json');
    writeFileSync(f, JSON.stringify({ users: [] }, null, 2), 'utf8');
    const app = createMirageApp({ dataFile: f, skykingUrl: fakeSkyKingUrl });
    srv2 = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
    url2 = `http://localhost:${srv2.address().port}`;
  });
  afterAll(async () => {
    await new Promise(r => srv2.close(r));
    rmSync(tmp2, { recursive: true, force: true });
  });

  const j = { 'Content-Type': 'application/json' };
  const call = (m, p, body, tok) => fetch(`${url2}${p}`, {
    method: m,
    headers: tok ? { ...j, Authorization: `Bearer ${tok}` } : j,
    body: body ? JSON.stringify(body) : undefined,
  });

  it('לפני אתחול: ניהול המשתמשים סגור (401), ולא פתוח', async () => {
    expect((await call('GET', '/api/users')).status).toBe(401);
    expect((await call('POST', '/api/users', { personalNumber: '9', firstName: 'x', password: 'Aa1!aaaaaaaa' })).status).toBe(401);
    expect((await call('PUT', '/api/users/34234', { password: 'Aa1!aaaaaaaa' })).status).toBe(401);
    expect((await call('DELETE', '/api/users/34234')).status).toBe(401);
  });

  it('הניצול מהסקר: קביעת סיסמה + הענקת admin ללא אימות — נחסם', async () => {
    const res = await call('PUT', '/api/users/34234', {
      password: 'Attacker!2026#X',
      apps: { 'SKY-KING': { roles: ['admin'] } },
    });
    expect(res.status).toBe(401);
  });

  it('אתחול ראשוני יוצר מנהל, ומדיניות הסיסמה חלה גם עליו', async () => {
    const weak = await call('POST', '/api/admin/bootstrap', { ...ADMIN, password: '123' });
    expect(weak.status).toBe(400);
    expect((await weak.json()).error).toBe('weak_password');

    const res = await call('POST', '/api/admin/bootstrap', ADMIN);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.hasPassword).toBe(true);
    expect(body.apps['SKY-KING'].roles).toEqual(['admin']);
  });

  it('אחרי שנוצר מנהל — נתיב האתחול נסגר לצמיתות', async () => {
    const res = await call('POST', '/api/admin/bootstrap', { personalNumber: '8000002', firstName: 'שני', password: 'Boot#2026!Wxyz' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('already_initialized');
  });

  it('הזדהות מנהל מנפיקה אסימון שפותח את ניהול המשתמשים', async () => {
    const bad = await call('POST', '/api/admin/login', { personalNumber: ADMIN.personalNumber, password: 'Wrong#2026!Xyz' });
    expect(bad.status).toBe(401);

    const ok = await call('POST', '/api/admin/login', { personalNumber: ADMIN.personalNumber, password: ADMIN.password });
    expect(ok.status).toBe(200);
    const { token } = await ok.json();
    expect((await call('GET', '/api/users', null, token)).status).toBe(200);
  });

  it('משתמש רגיל (לא admin) אינו מקבל אסימון ניהול', async () => {
    const login = await call('POST', '/api/admin/login', { personalNumber: ADMIN.personalNumber, password: ADMIN.password });
    const { token } = await login.json();
    const created = await call('POST', '/api/users', {
      personalNumber: '8000009', firstName: 'רגיל', password: 'Plain#2026!Wxy',
      apps: { 'SKY-KING': { roles: ['user'] } },
    }, token);
    expect(created.status).toBe(201);

    const res = await call('POST', '/api/admin/login', { personalNumber: '8000009', password: 'Plain#2026!Wxy' });
    expect(res.status).toBe(401);
  });

  it('אסימון מזויף אינו פותח דבר', async () => {
    expect((await call('GET', '/api/users', null, 'v1.abc.def')).status).toBe(401);
  });
});

// ── כשל ערוץ מול כשל הרשאה ────────────────────────────────────────────────────
// רגרסיה לתקלה אמיתית: אחרי שנוסף אסימון השירות (SK-54), אי-התאמה בין שני
// התהליכים גרמה למיראז להחזיר 401, ו-SKY-KING מיפה כל תשובה שאינה authorized
// ל-403 "אין לך הרשאה". המפעיל חיפש את הבעיה בהרשאות במקום בתצורה.
// הכלל שנבדק כאן: תקלת תצורה חייבת להיראות אחרת מהחלטה על המשתמש.
describe("מיראז' — כשל ערוץ אינו נראה כשלילת הרשאה", () => {
  let tmp3 = '';
  let srv3;
  let url3 = '';

  beforeAll(async () => {
    tmp3 = mkdtempSync(path.join(tmpdir(), 'mirage-chan-'));
    const f = path.join(tmp3, 'data.json');
    writeFileSync(f, JSON.stringify(SEED, null, 2), 'utf8');
    process.env.MIRAGE_SERVICE_TOKEN = 'service-token-for-channel-test';
    const app = createMirageApp({ dataFile: f, skykingUrl: fakeSkyKingUrl });
    srv3 = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
    url3 = `http://localhost:${srv3.address().port}`;
  });
  afterAll(async () => {
    delete process.env.MIRAGE_SERVICE_TOKEN;
    await new Promise(r => srv3.close(r));
    rmSync(tmp3, { recursive: true, force: true });
  });

  const authorizeWith = (headers) => fetch(`${url3}/api/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ app: 'SKY-KING', personalNumber: '34234', password: TEST_PW }),
  });

  it('בלי אסימון שירות: 401 bad_service_token, ולא תשובת authorized', async () => {
    const res = await authorizeWith({});
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('bad_service_token');
    // הנקודה הקריטית: אין כאן שדה authorized, ולכן קורא שמסתכל רק עליו
    // מסיק בטעות "לא מורשה" במקום "הערוץ שבור"
    expect(body.authorized).toBeUndefined();
  });

  it('עם אסימון שירות שגוי: אותה תשובה', async () => {
    const res = await authorizeWith({ 'X-Service-Token': 'wrong' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('bad_service_token');
  });

  it('עם האסימון הנכון: ההזדהות עוברת רגיל', async () => {
    const res = await authorizeWith({ 'X-Service-Token': 'service-token-for-channel-test' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorized).toBe(true);
    expect(body.roles).toEqual(['admin']);
  });

  it('משתמש אמיתי שאינו מורשה מוחזר כ-authorized:false — סיווג שונה לגמרי', async () => {
    const res = await fetch(`${url3}/api/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Token': 'service-token-for-channel-test' },
      body: JSON.stringify({ app: 'SKY-KING', personalNumber: '7654321', password: TEST_PW }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorized).toBe(false);
    expect(body.error).toBeUndefined(); // אין קוד שגיאת ערוץ
  });
});
