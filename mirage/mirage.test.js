// בדיקות לדמו מיראז' — מערכת ניהול משתמשים והרשאות (אפליקציה נפרדת מ-SKY-KING).
// TDD: נכתבו לפני המימוש. מריצים עם `npm test` (vitest).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { createMirageApp } from './app.js';

const SEED = {
  users: [
    { personalNumber: '34234',   firstName: 'יוחאי', lastName: 'שטיינברג', apps: { 'SKY-KING': ['admin'] } },
    { personalNumber: '5229214', firstName: 'אורן',  lastName: 'בן דור',   apps: { 'SKY-KING': ['user'] } },
    { personalNumber: '7654321', firstName: 'נועה',  lastName: 'פרץ',      apps: { 'OTHER-APP': ['user'] } },
    // פורמט מורחב: roles + הגבלת עמדות (לפי id טכני או שם טקסטואלי)
    {
      personalNumber: '1111111', firstName: 'רון', lastName: 'מזרחי',
      apps: { 'SKY-KING': { roles: ['user'], workstations: [{ id: 2, name: 'עמדה צפון' }, { name: 'עמדה ידנית' }] } },
    },
  ],
};

let baseUrl = '';
let server;
let dataFile = '';
let tmpDir = '';

const post = (p, body) => fetch(`${baseUrl}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const put = (p, body) => fetch(`${baseUrl}${p}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

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
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => fakeSkyKing.close(resolve));
  rmSync(tmpDir, { recursive: true, force: true });
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

describe("מיראז' — POST /api/authorize", () => {
  it('משתמש מורשה לאפליקציה → authorized + roles + פרטי משתמש', async () => {
    const res = await post('/api/authorize', { app: 'SKY-KING', personalNumber: '34234' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorized).toBe(true);
    expect(body.roles).toEqual(['admin']);
    expect(body.user.firstName).toBe('יוחאי');
    expect(body.user.fullName).toBe('יוחאי שטיינברג');
  });

  it('משתמש קיים בלי הרשאה לאפליקציה → authorized:false, reason=app_not_permitted', async () => {
    const res = await post('/api/authorize', { app: 'SKY-KING', personalNumber: '7654321' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorized).toBe(false);
    expect(body.reason).toBe('app_not_permitted');
  });

  it('מספר אישי לא מוכר → authorized:false, reason=unknown_user', async () => {
    const res = await post('/api/authorize', { app: 'SKY-KING', personalNumber: '0000000' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorized).toBe(false);
    expect(body.reason).toBe('unknown_user');
  });

  it('שדות חסרים → 400', async () => {
    expect((await post('/api/authorize', { app: 'SKY-KING' })).status).toBe(400);
    expect((await post('/api/authorize', { personalNumber: '34234' })).status).toBe(400);
  });
});

describe("מיראז' — הרשאת עמדות", () => {
  it('פורמט מורחב: authorize מחזיר גם workstations (id טכני או שם טקסט)', async () => {
    const res = await post('/api/authorize', { app: 'SKY-KING', personalNumber: '1111111' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorized).toBe(true);
    expect(body.roles).toEqual(['user']);
    expect(body.workstations).toEqual([{ id: 2, name: 'עמדה צפון' }, { name: 'עמדה ידנית' }]);
  });

  it('פורמט ישן (מערך roles): authorize מחזיר workstations ריק — אין הגבלה', async () => {
    const body = await (await post('/api/authorize', { app: 'SKY-KING', personalNumber: '34234' })).json();
    expect(body.authorized).toBe(true);
    expect(body.roles).toEqual(['admin']);
    expect(body.workstations).toEqual([]);
  });

  it('POST משתמש עם הגבלת עמדות → נשמר ומוחזר ב-authorize', async () => {
    const res = await post('/api/users', {
      personalNumber: '2222222', firstName: 'טל', lastName: 'ברק',
      apps: { 'SKY-KING': { roles: ['team_lead'], workstations: [{ name: 'עמדה דרום' }] } },
    });
    expect(res.status).toBe(201);
    const auth = await (await post('/api/authorize', { app: 'SKY-KING', personalNumber: '2222222' })).json();
    expect(auth.authorized).toBe(true);
    expect(auth.roles).toEqual(['team_lead']);
    expect(auth.workstations).toEqual([{ name: 'עמדה דרום' }]);
    await fetch(`${baseUrl}/api/users/2222222`, { method: 'DELETE' });
  });

  it('GET /api/workstation-options — מושך שמות עמדות מהאפליקציה (SKY-KING)', async () => {
    const res = await fetch(`${baseUrl}/api/workstation-options`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    // כולל role (מגדל/יב"א) ו-base (בסיס אב) לחלוקה במסך הניהול; שם עם גרשיים נשמר שלם
    expect(body.workstations).toEqual([
      { id: 1, name: 'בת"ק דרום', role: 'tower', base: 'תל נוף' },
      { id: 2, name: 'עמדה צפון', role: null, base: null },
    ]);
  });

  it('workstation-options כש-SKY-KING לא זמין → available:false ורשימה ריקה (הזנה ידנית)', async () => {
    const downApp = createMirageApp({ dataFile, skykingUrl: 'http://localhost:1' });
    const downServer = await new Promise(resolve => { const s = downApp.listen(0, () => resolve(s)); });
    const res = await fetch(`http://localhost:${downServer.address().port}/api/workstation-options`);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.workstations).toEqual([]);
    await new Promise(resolve => downServer.close(resolve));
  });
});

describe("מיראז' — ניהול משתמשים (CRUD)", () => {
  it('GET /api/users מחזיר את משתמשי ה-seed', async () => {
    const res = await fetch(`${baseUrl}/api/users`);
    expect(res.status).toBe(200);
    const users = await res.json();
    expect(users.map(u => u.personalNumber)).toContain('34234');
  });

  it('POST יוצר משתמש חדש, והוא מקבל הרשאה ב-authorize', async () => {
    const res = await post('/api/users', {
      personalNumber: '1234567', firstName: 'דנה', lastName: 'כהן',
      apps: { 'SKY-KING': ['team_lead'] },
    });
    expect(res.status).toBe(201);
    const auth = await (await post('/api/authorize', { app: 'SKY-KING', personalNumber: '1234567' })).json();
    expect(auth.authorized).toBe(true);
    expect(auth.roles).toEqual(['team_lead']);
  });

  it('POST עם מספר אישי קיים → 409', async () => {
    const res = await post('/api/users', { personalNumber: '34234', firstName: 'כפול', lastName: 'כפול', apps: {} });
    expect(res.status).toBe(409);
  });

  it('PUT מעדכן תפקידים, ו-authorize משקף את השינוי', async () => {
    const res = await put('/api/users/1234567', {
      firstName: 'דנה', lastName: 'כהן', apps: { 'SKY-KING': ['admin'] },
    });
    expect(res.status).toBe(200);
    const auth = await (await post('/api/authorize', { app: 'SKY-KING', personalNumber: '1234567' })).json();
    expect(auth.roles).toEqual(['admin']);
  });

  it('השינויים נשמרים לקובץ הנתונים (persistence)', () => {
    const onDisk = JSON.parse(readFileSync(dataFile, 'utf8'));
    expect(onDisk.users.some(u => u.personalNumber === '1234567')).toBe(true);
  });

  it('DELETE מוחק, ו-authorize מחזיר unknown_user', async () => {
    const res = await fetch(`${baseUrl}/api/users/1234567`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const auth = await (await post('/api/authorize', { app: 'SKY-KING', personalNumber: '1234567' })).json();
    expect(auth.authorized).toBe(false);
    expect(auth.reason).toBe('unknown_user');
  });
});
