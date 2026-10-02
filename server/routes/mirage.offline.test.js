// כניסה בעמדה מנותקת מול המיראז' שבמאגר המקומי, והנתיב שממנו ההעתק מגיע.
//
// קוד אבטחה - הבדיקות עוינות: מי שאסור לו לקבל טביעות סיסמה (משתמש מחובר,
// בלי אסימון), תשובה שבורה מהמיראז' שמתפרשת כ"אין משתמשים", ומשתמש שהעמדה
// מכירה רק מאסמכתא ישנה כשהמיראז' כבר אומר אחרת.
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import express from 'express';
import { hashPassword } from '../../mirage/password.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const PW = 'Skc#2026!Wxyz';
const STATION = 'station-token-offline-test';

let baseUrl, server, mirageSrv, pool, signToken;
const mirage = { status: 200, body: { ok: true, users: [] } };

beforeAll(async () => {
  // המיראז' המדומה - חייב לעלות לפני טעינת הנתיב, שקורא את MIRAGE_URL בטעינה
  mirageSrv = http.createServer((req, res) => {
    res.writeHead(mirage.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mirage.body));
  });
  await new Promise(r => mirageSrv.listen(0, '127.0.0.1', r));
  process.env.MIRAGE_URL = `http://127.0.0.1:${mirageSrv.address().port}`;
  process.env.STATION_TOKEN = STATION;
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';

  ({ default: pool } = await import('../db/pool.js'));
  ({ signToken } = await import('../auth/token.js'));
  const { ensureMirageReplicaTable, replaceMirageUsers } = await import('../auth/mirageReplica.js');
  const { ensureLocalCredentialsTable } = await import('../auth/localCredentials.js');
  await ensureMirageReplicaTable(pool);
  await ensureLocalCredentialsTable(pool);
  await pool.query('CREATE TABLE IF NOT EXISTS workstation_presets (id INT PRIMARY KEY, name TEXT)');
  await pool.query(`INSERT INTO workstation_presets VALUES (3, 'מגדל'), (4, 'יב"א')`);
  await replaceMirageUsers(pool, [
    { personalNumber: '100', firstName: 'דנה', lastName: 'כהן', passwordHash: hashPassword(PW),
      apps: { 'SKY-KING': { roles: ['team_lead'], workstations: [{ id: 3, name: 'מגדל' }] } } },
    { personalNumber: '300', firstName: 'אחר', lastName: 'א', passwordHash: hashPassword(PW),
      apps: { 'OTHER-APP': ['user'] } },
  ]);

  const { authMiddleware } = await import('../middleware/auth.js');
  const { default: router } = await import('./mirage.js');
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use(router);
  server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(r => server.close(r));
  await new Promise(r => mirageSrv.close(r));
  delete process.env.STATION_TOKEN;
  await pool?.end?.();
});

const login = (personalNumber, password = PW, extra = {}) => fetch(`${baseUrl}/api/auth/mirage-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ personalNumber, password, ...extra }),
});

describe('כניסה בנתק מול המיראז\' שבעמדה', () => {
  it('משתמש שמעולם לא נכנס בעמדה - נכנס, עם התפקידים והעמדות של המיראז\'', async () => {
    const res = await login('100');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('local');
    expect(body.token).toBeTruthy();
    expect(body.roles).toEqual(['team_lead']);
    expect(body.crewMember).toMatchObject({
      personal_id: '100', name: 'דנה כהן', is_team_lead: true, is_admin: false, approved_workstations: [3],
    });
  });

  it('סיסמה שגויה - 401', async () => {
    expect((await login('100', 'wrong')).status).toBe(401);
  });

  it('בלי הרשאה ל-SKY-KING - 403, גם עם סיסמה נכונה', async () => {
    const res = await login('300');
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe('app_not_permitted');
  });

  it('עמדה שאינה ברשימת המיראז\' (החלפת איש צוות) - 403', async () => {
    const res = await login('100', PW, { presetId: 4 });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('workstation_not_permitted');
  });

  it('לא בהעתק ובלי אסמכתא שמורה - 403 no_local_credential, כמו קודם', async () => {
    const res = await login('999');
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('no_local_credential');
  });

  // משתמש שנמצא בהעתק מוכרע **רק** מולו: סיסמה שהוחלפה במיראז' לא נכנסת
  // דרך אסמכתא ישנה שנשמרה בעמדה לפני ההחלפה.
  it('אסמכתא ישנה בעמדה אינה עוקפת את ההעתק', async () => {
    const { cacheCredential } = await import('../auth/localCredentials.js');
    await cacheCredential(pool, { personalNumber: '100', password: 'Old#2025!Pass1', claims: { name: 'ישן' } });
    expect((await login('100', 'Old#2025!Pass1')).status).toBe(401);
  });
});

describe('GET /api/sync/mirror/mirage-users - טביעות סיסמה, לסוכן עמדה בלבד', () => {
  const asStation = () => fetch(`${baseUrl}/api/sync/mirror/mirage-users`, {
    headers: { 'X-Station-Token': STATION, 'X-Station-Key': 'twr-1' },
  });

  it('בלי אסימון - 401', async () => {
    expect((await fetch(`${baseUrl}/api/sync/mirror/mirage-users`)).status).toBe(401);
  });

  it('משתמש מחובר (גם מנהל) - 403', async () => {
    const admin = signToken({ crewMemberId: 1, personalId: '111', name: 'מנהל', isAdmin: true });
    const res = await fetch(`${baseUrl}/api/sync/mirror/mirage-users`, { headers: { Authorization: `Bearer ${admin}` } });
    expect(res.status).toBe(403);
  });

  it('אסימון עמדה - מקבל את רשימת המיראז\'', async () => {
    mirage.status = 200;
    mirage.body = { ok: true, at: '2026-10-02T10:00:00Z', users: [{ personalNumber: '1', passwordHash: 's2$a$b' }] };
    const res = await asStation();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, users: [{ personalNumber: '1' }] });
  });

  // נפילה רגעית של המיראז' אינה "אין משתמשים" - אחרת כל העמדות היו מרוקנות
  // את ההעתק בסיבוב הבא ונועלות את כולם בנתק.
  it('המיראז\' נפל או ענה בלי מערך - 502, ולא רשימה ריקה', async () => {
    mirage.status = 503; mirage.body = { error: 'store_unavailable' };
    expect((await asStation()).status).toBe(502);
    mirage.status = 200; mirage.body = { ok: true };
    expect((await asStation()).status).toBe(502);
  });
});
