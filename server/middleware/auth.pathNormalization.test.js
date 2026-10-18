// נרמול הנתיב לפני ההחלטה מי רשאי (ביקורת קוד #3, ממצאים 1-2).
//
// ה-Router של Express 5 **אינו רגיש לאותיות** ומקבל לוכסן סופי (strict:false),
// אבל השער השווה את הנתיב כמו שהגיע. התוצאה:
//   - `/API/...` לא התחיל ב-`/api` - והשער ויתר על אימות בכלל, בעוד ה-route
//     עצמו עדיין נתפס. `DELETE /API/activity-log` מחק את היומן בלי אסימון.
//   - `/api/activity-log/` לא תאם את כלל ה-ADMIN המדויק - ונפל לברירת המחדל
//     USER. כל פקח מחובר עקף כך את כללי המנהל.
// הבדיקות כאן נועלות את העיקרון: **כל צורה של אותו נתיב מקבלת אותה דרישה.**
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { signToken } from '../auth/token.js';
import { authMiddleware, requirementFor, canonicalPath, NEED } from './auth.js';
import { isUndoableRequest } from './actionContext.js';

const user = () => signToken({ crewMemberId: 3, personalId: '333', name: 'בקר' });

let baseUrl = '';
let server;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  // route אמיתי בשם הקנוני: Express יתפוס גם את הצורות האחרות - בדיוק מה שהופך
  // את הפער בשער לפרצה
  app.delete('/api/activity-log', (req, res) => res.json({ ok: true, reached: true }));
  app.get('/api/sync/mirror', (req, res) => res.json({ ok: true, reached: true }));
  server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(async () => { await new Promise(r => server.close(r)); });

const call = (method, path, token) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

describe('canonicalPath', () => {
  it('אותיות קטנות, בלי לוכסן סופי, בלי לוכסנים כפולים', () => {
    expect(canonicalPath('/API/Activity-Log/')).toBe('/api/activity-log');
    expect(canonicalPath('/api//activity-log')).toBe('/api/activity-log');
    expect(canonicalPath('/api/activity-log///')).toBe('/api/activity-log');
  });

  it('השורש נשאר שורש', () => {
    expect(canonicalPath('/')).toBe('/');
    expect(canonicalPath('')).toBe('/');
    expect(canonicalPath(undefined)).toBe('/');
  });
});

describe('אותה דרישה לכל צורה של הנתיב', () => {
  const cases = [
    ['DELETE', '/api/activity-log'],
    ['GET', '/api/_diag/env'],
    ['POST', '/api/environments/11/reset'],
    ['PUT', '/api/air-picture/config'],
    ['PUT', '/api/sectors/3'],
    ['GET', '/api/health'],
  ];
  const variants = p => [p.toUpperCase(), `${p}/`, p.replace('/api/', '/api//'), `${p.replace('/api', '/Api')}/`];

  for (const [m, p] of cases) {
    it(`${m} ${p}`, () => {
      const need = requirementFor(m, p);
      for (const v of variants(p)) expect(requirementFor(m, v)).toBe(need);
    });
  }

  it('כלל המנהל נשמר גם עם לוכסן סופי', () => {
    expect(requirementFor('DELETE', '/api/activity-log/')).toBe(NEED.ADMIN);
    expect(requirementFor('GET', '/api/_diag/env/')).toBe(NEED.ADMIN);
  });
});

describe('השער עצמו - בלי אסימון אין כניסה, בשום צורה', () => {
  it('DELETE /API/activity-log בלי אסימון - 401, וה-handler לא נגע', async () => {
    const res = await call('DELETE', '/API/activity-log');
    expect(res.status).toBe(401);
  });

  it('GET /Api/sync/mirror בלי אסימון - 401', async () => {
    const res = await call('GET', '/Api/sync/mirror');
    expect(res.status).toBe(401);
  });

  it('פקח (USER) אינו מוחק את היומן גם עם לוכסן סופי', async () => {
    expect((await call('DELETE', '/api/activity-log/', user())).status).toBe(403);
    expect((await call('DELETE', '/API/ACTIVITY-LOG', user())).status).toBe(403);
  });
});

describe('הביטול (CTRL+Z) רואה את אותו נתיב', () => {
  const req = (method, path) => ({ method, path, user: { role: 'user' } });

  it('כתיבה ב-/API נרשמת כפעולה שניתן לבטל', () => {
    expect(isUndoableRequest(req('POST', '/API/strips'))).toBe(true);
  });

  it('נתיבי הדילוג מדולגים גם באותיות גדולות ועם לוכסן סופי', () => {
    expect(isUndoableRequest(req('POST', '/API/undo/abc'))).toBe(false);
    expect(isUndoableRequest(req('POST', '/api/sync/push/'))).toBe(false);
  });
});
