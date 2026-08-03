// בדיקות אבטחה לשכבת האימות (SK-01/SK-02). הסקר ציין במפורש שאין ולו בדיקת
// אבטחה אחת - אין טסט שמוודא ש-endpoint מחזיר 401 בלי אסימון. זה הטסט הזה.
//
// העיקרון שנבדק כאן אינו "הנתיבים שרשמנו מוגנים" אלא ההפך: **נתיב שלא סווג
// מוגן אוטומטית**. זו הסיבה שהמדיניות היא deny-by-default, וזו הבדיקה שתתפוס
// router חדש שמישהו יוסיף מחר.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { signToken } from '../auth/token.js';
import { authMiddleware, requirementFor, roleOf, ROLE, NEED } from './auth.js';

const admin = () => signToken({ crewMemberId: 1, personalId: '111', name: 'מנהל', isAdmin: true });
const teamLead = () => signToken({ crewMemberId: 2, personalId: '222', name: 'ראש צוות', isTeamLead: true });
const user = () => signToken({ crewMemberId: 3, personalId: '333', name: 'בקר' });
const driver = () => signToken({ role: 'driver', name: 'driver' });

let baseUrl = '';
let server;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  // handler אחד לכל נתיב: הבדיקה היא על השער, לא על הלוגיקה שמאחוריו
  app.all(/.*/, (req, res) => res.json({ ok: true, user: req.user ?? null }));
  server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(async () => { await new Promise(r => server.close(r)); });

const call = (method, path, token) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

describe('deny by default', () => {
  it('נתיב API שלא סווג דורש זהות', () => {
    expect(requirementFor('GET', '/api/some-brand-new-router')).toBe(NEED.USER);
    expect(requirementFor('POST', '/api/some-brand-new-router')).toBe(NEED.USER);
  });

  it('בלי אסימון - 401 על נתיבים תפעוליים', async () => {
    for (const [m, p] of [['GET', '/api/strips'], ['POST', '/api/strips'], ['GET', '/api/crew-members'], ['GET', '/api/transfers']]) {
      const res = await call(m, p);
      expect(`${m} ${p} => ${res.status}`).toBe(`${m} ${p} => 401`);
    }
  });

  it('אסימון מזויף או משובש - 401', async () => {
    expect((await call('GET', '/api/strips', 'not-a-token')).status).toBe(401);
    const t = user();
    // שינוי תו אחד בחתימה מבטל אותה
    const tampered = t.slice(0, -1) + (t.slice(-1) === 'A' ? 'B' : 'A');
    expect((await call('GET', '/api/strips', tampered)).status).toBe(401);
  });

  it('אסימון שפג תוקפו - 401', async () => {
    const expired = signToken({ crewMemberId: 9, name: 'ישן' }, -1000);
    expect((await call('GET', '/api/strips', expired)).status).toBe(401);
  });

  it('העלאת הרשאה בגוף הבקשה אינה משפיעה - הזהות מהאסימון בלבד', async () => {
    const res = await fetch(`${baseUrl}/api/strips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user()}` },
      body: JSON.stringify({ isAdmin: true, is_admin: true, role: 'admin' }),
    });
    const body = await res.json();
    expect(body.user.isAdmin).toBe(false);
    expect(body.user.role).toBe(ROLE.USER);
  });
});

describe('נתיבים ציבוריים - רשימת היתר מפורשת בלבד', () => {
  it('בריאות, מוכנות, הזדהות, סביבות, תרגומים וסמלים פתוחים', async () => {
    for (const [m, p] of [
      ['GET', '/api/health'], ['GET', '/api/ready'],
      ['POST', '/api/auth/mirage-login'], ['POST', '/api/auth/driver'],
      ['GET', '/api/environments'], ['GET', '/api/translations'],
      ['GET', '/api/emblems/system/micha'],
    ]) {
      expect(`${p} => ${(await call(m, p)).status}`).toBe(`${p} => 200`);
    }
  });

  it('קריאת סמל פתוחה אך כתיבה אליו דורשת מנהל (SK-45)', async () => {
    expect((await call('GET', '/api/emblems/base/1')).status).toBe(200);
    expect((await call('PUT', '/api/emblems/base/1')).status).toBe(401);
    expect((await call('PUT', '/api/emblems/base/1', user())).status).toBe(403);
    expect((await call('PUT', '/api/emblems/base/1', admin())).status).toBe(200);
  });

  it('רשימת הסביבות פתוחה אך איפוס סביבה דורש מנהל (SK-12)', async () => {
    expect((await call('GET', '/api/environments')).status).toBe(200);
    expect((await call('POST', '/api/environments/15/reset')).status).toBe(401);
    expect((await call('POST', '/api/environments/15/reset', teamLead())).status).toBe(403);
    expect((await call('POST', '/api/environments/15/reset', admin())).status).toBe(200);
  });
});

describe('הפרדת תפקידים (SK-02)', () => {
  it('מחיקת יומן הביקורת - מנהל בלבד (SK-18)', async () => {
    expect((await call('DELETE', '/api/activity-log')).status).toBe(401);
    expect((await call('DELETE', '/api/activity-log', user())).status).toBe(403);
    expect((await call('DELETE', '/api/activity-log', teamLead())).status).toBe(403);
    expect((await call('DELETE', '/api/activity-log', admin())).status).toBe(200);
  });

  it('רישום ליומן מותר לכל מזוהה - זו פעולה תפעולית', async () => {
    expect((await call('POST', '/api/activity-log', user())).status).toBe(200);
  });

  it('endpoint האבחון - מנהל בלבד (SK-13)', async () => {
    expect((await call('GET', '/api/_diag/env', user())).status).toBe(403);
    expect((await call('GET', '/api/_diag/env', admin())).status).toBe(200);
  });

  it('תרגומים: קריאה לכל, כתיבה למנהל', async () => {
    expect((await call('GET', '/api/translations')).status).toBe(200);
    expect((await call('PUT', '/api/translations', teamLead())).status).toBe(403);
    expect((await call('PUT', '/api/translations', admin())).status).toBe(200);
  });

  it('הגדרות ניהול - ראש צוות ומעלה', async () => {
    for (const p of ['/api/sectors', '/api/maps', '/api/workstation-presets', '/api/bdh', '/api/airfields']) {
      expect(`${p} user => ${(await call('POST', p, user())).status}`).toBe(`${p} user => 403`);
      expect(`${p} lead => ${(await call('POST', p, teamLead())).status}`).toBe(`${p} lead => 200`);
      expect(`${p} admin => ${(await call('POST', p, admin())).status}`).toBe(`${p} admin => 200`);
    }
  });

  it('קריאת הגדרות מותרת לכל מזוהה - הבקר חייב לראות אותן', async () => {
    for (const p of ['/api/sectors', '/api/maps', '/api/workstation-presets', '/api/bdh']) {
      expect(`${p} => ${(await call('GET', p, user())).status}`).toBe(`${p} => 200`);
    }
  });
});

describe('חריגים תפעוליים קודמים לתחיליות הניהול', () => {
  // אלה בדיוק המקומות שבהם סדר הכללים הוא ההבדל בין מערכת שעובדת לבין
  // מערכת שבה פקח לא יכול לסמן התראה או לשנות סטטוס בשטח.
  it('התראת בד"ח מותרת לפקח, בעוד עריכת מסמך הבד"ח אינה', async () => {
    expect((await call('POST', '/api/bdh-alerts', user())).status).toBe(200);
    expect((await call('POST', '/api/bdh', user())).status).toBe(403);
  });

  it('שינוי סטטוס אלמנט מותר, הגדרת סוג אלמנט אינה', async () => {
    expect((await call('PUT', '/api/airfield-elements/5', user())).status).toBe(200);
    expect((await call('PUT', '/api/airfield-element-types/5', user())).status).toBe(403);
  });

  it('הערת סקטור מותרת לבקר, עריכת הסקטור אינה', async () => {
    expect((await call('PUT', '/api/sectors/3/notes', user())).status).toBe(200);
    expect((await call('PUT', '/api/sectors/3', user())).status).toBe(403);
  });

  it('שיבוץ בלוק מותר, הגדרת מרחב בלוקים אינה', async () => {
    expect((await call('POST', '/api/blocks', user())).status).toBe(200);
    expect((await call('POST', '/api/block-spaces', user())).status).toBe(403);
  });
});

describe('אסימון נהג - מוגבל לנתיבי הנהג בלבד', () => {
  it('נהג מגיע לנתיבי הרכב ולמפת הבסיס', async () => {
    for (const p of ['/api/vehicle-requests', '/api/vehicle-gps', '/api/airfields/by-base/7']) {
      expect(`${p} => ${(await call('GET', p, driver())).status}`).toBe(`${p} => 200`);
    }
  });

  it('נהג **אינו** מגיע למידע התפעולי של העמדות', async () => {
    for (const p of ['/api/strips', '/api/transfers', '/api/crew-members', '/api/sectors']) {
      expect(`${p} => ${(await call('GET', p, driver())).status}`).toBe(`${p} => 403`);
    }
  });

  it('בקר מגיע גם לנתיבי הנהג - זימון רכב הוא זרימה משותפת', async () => {
    expect((await call('POST', '/api/vehicle-requests', user())).status).toBe(200);
  });
});

describe('גזירת התפקיד', () => {
  it('התפקיד נגזר מה-claims ולא מקלט חיצוני', () => {
    expect(roleOf({ isAdmin: true })).toBe(ROLE.ADMIN);
    expect(roleOf({ isTeamLead: true })).toBe(ROLE.TEAM_LEAD);
    expect(roleOf({})).toBe(ROLE.USER);
    expect(roleOf({ role: 'driver' })).toBe(ROLE.DRIVER);
    expect(roleOf(null)).toBe(null);
    // admin ב-claims גובר על סימון נהג שגוי, ונהג אינו מקבל admin
    expect(roleOf({ role: 'driver', isAdmin: true })).toBe(ROLE.DRIVER);
  });
});
