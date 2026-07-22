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

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'mirage-test-'));
  dataFile = path.join(tmpDir, 'data.json');
  writeFileSync(dataFile, JSON.stringify(SEED, null, 2), 'utf8');
  const app = createMirageApp({ dataFile });
  await new Promise(resolve => { server = app.listen(0, resolve); });
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
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
