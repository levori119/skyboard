// **ניהול נהגים: הנהגים המורשים במיראז' לבסיס של השדה.**
//
// בחלון "ניהול נהגים" המפעיל חייב לבחור נהג מהרשימה - ולא להקליד שם ות"ז.
// מורשה = יש לו הרשאת SKY-KING DRIVER במיראז', והבסיס של השדה ברשימת הבסיסים
// שנבחרו לו שם. כך אישור כניסה נרשם רק לנהג שיכול בכלל להיכנס לאפליקציה.
//
// המיראז' כאן הוא שרת אמיתי קטן, וה-DB הוא PGlite: הטענות הן על מה שנשלף
// מהמיראז' בפועל ועל הבסיס שנגזר מהשדה ב-DB.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

let skyServer, mirageServer, base, pool, driversForBase;
let channelBroken = false;

const user = (personalNumber, firstName, lastName, apps) => ({ personalNumber, firstName, lastName, fullName: `${firstName} ${lastName}`, apps, hasPassword: true });
const USERS = [
  user('012345678', 'דני', 'כהן', { 'SKY-KING DRIVER': { roles: ['user'], bases: [{ id: 7, name: 'תל נוף' }, { id: 8, name: 'חצרים' }] } }),
  user('12345682', 'רונית', 'לוי', { 'SKY-KING DRIVER': { roles: ['user'], bases: [{ id: 7, name: 'תל נוף' }] } }),
  // נהג של בסיס אחר
  user('033333334', 'יוסי', 'מזרחי', { 'SKY-KING DRIVER': { roles: ['user'], bases: [{ id: 8, name: 'חצרים' }] } }),
  // בקר - הרשאה ל-SKY-KING בלבד
  user('5551234', 'בקר', 'עמדה', { 'SKY-KING': { roles: ['controller'] } }),
  // נהג בלי תפקיד (ההרשאה הוסרה) - המיראז' לא יכניס אותו
  user('044444442', 'מושבת', 'הרשאה', { 'SKY-KING DRIVER': { roles: [], bases: [{ id: 7, name: 'תל נוף' }] } }),
  // מספר שאינו ת"ז - לא ניתן לשייך אליו נסיעות
  user('12', 'לא', 'תקין', { 'SKY-KING DRIVER': { roles: ['user'], bases: [{ id: 7, name: 'תל נוף' }] } }),
];

beforeAll(async () => {
  const { listen } = await import('../listen.js');
  const fake = express();
  fake.get('/api/users', (req, res) => {
    if (channelBroken) return res.status(401).json({ error: 'bad_service_token' });
    res.json(USERS);
  });
  mirageServer = await listen(fake, 0, '127.0.0.1');
  process.env.MIRAGE_URL = `http://127.0.0.1:${mirageServer.address().port}`;
  delete process.env.MIRAGE_DRIVER_APP_NAME;
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';

  ({ default: pool } = await import('../db/pool.js'));
  await pool.query(`CREATE TABLE public.airfields (id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, base_id INTEGER)`);
  await pool.query(`INSERT INTO airfields (id, name, base_id) VALUES (1, 'שדה תל נוף', 7), (2, 'שדה בלי בסיס', NULL)`);

  const mod = await import('./mirage.js');
  driversForBase = mod.driversForBase;
  const app = express();
  app.use(express.json());
  app.use(mod.default);
  skyServer = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${skyServer.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise(r => skyServer?.close(r));
  await new Promise(r => mirageServer?.close(r));
});

beforeEach(() => { channelBroken = false; });

const list = (q) => fetch(`${base}/api/auth/mirage-drivers${q}`);

describe('GET /api/auth/mirage-drivers', () => {
  it('רק נהגי SKY-KING DRIVER שהבסיס של השדה ברשימה שלהם, ממוינים לפי שם', async () => {
    const r = await list('?airfield_id=1');
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.baseId).toBe(7);
    expect(body.drivers).toEqual([
      { nationalId: '012345678', firstName: 'דני', lastName: 'כהן', fullName: 'דני כהן' },
      { nationalId: '012345682', firstName: 'רונית', lastName: 'לוי', fullName: 'רונית לוי' },
    ]);
  });

  it('שדה בלי בסיס - 409, ולא רשימה ריקה שנראית כמו "אין נהגים"', async () => {
    const r = await list('?airfield_id=2');
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('airfield_without_base');
  });

  it('שדה לא קיים - 404; בלי airfield_id - 400', async () => {
    expect((await list('?airfield_id=99')).status).toBe(404);
    expect((await list('')).status).toBe(400);
  });

  it('ערוץ המיראז\' שבור - 502 mirage_unavailable', async () => {
    channelBroken = true;
    const r = await list('?airfield_id=1');
    expect(r.status).toBe(502);
    expect((await r.json()).error).toBe('mirage_unavailable');
  });
});

describe('driversForBase', () => {
  it('ת"ז מנורמלת ל-9 ספרות; בלי תפקיד, בלי ת"ז תקינה או בסיס אחר - בחוץ', () => {
    expect(driversForBase(USERS, 8).map(d => d.nationalId)).toEqual(['012345678', '033333334']);
    expect(driversForBase(USERS, 7).map(d => d.nationalId)).toEqual(['012345678', '012345682']);
  });

  it('קלט שאינו רשימה - ריק', () => {
    expect(driversForBase(null, 7)).toEqual([]);
  });
});
