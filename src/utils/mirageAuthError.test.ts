import { describe, it, expect } from 'vitest';
import { mirageAuthErrorKey } from './mirageAuthError';

// res מזויף — רק מה שהפונקציה צורכת (status + json)
const res = (status: number, body: any = {}) => ({
  status,
  json: async () => body,
});

describe('mirageAuthErrorKey', () => {
  it('401 עם password_not_set → סיסמה לא הוגדרה', async () => {
    expect(await mirageAuthErrorKey(res(401, { error: 'password_not_set' }))).toBe('login.miragePasswordNotSet');
  });

  it('401 רגיל → אישורים שגויים', async () => {
    expect(await mirageAuthErrorKey(res(401, { error: 'bad_credentials' }))).toBe('login.mirageBadCredentials');
  });

  it('403 עם workstation_not_permitted → אין הרשאה לעמדה', async () => {
    expect(await mirageAuthErrorKey(res(403, { error: 'workstation_not_permitted' }))).toBe('login.mirageWorkstationDenied');
  });

  it('403 רגיל → אין הרשאה לאפליקציה', async () => {
    expect(await mirageAuthErrorKey(res(403, { error: 'not_authorized' }))).toBe('login.mirageDenied');
  });

  it('429 → חסימת ניסיונות', async () => {
    expect(await mirageAuthErrorKey(res(429))).toBe('login.mirageRateLimited');
  });

  it('502 → המיראז\' עצמו לא זמין', async () => {
    expect(await mirageAuthErrorKey(res(502))).toBe('login.mirageUnavailable');
  });

  // הלב של התיקון: כשהשרת של SKY-KING עצמו לא רץ, ה-proxy של Vite מחזיר 500
  // והמשתמש קיבל "שגיאה בכניסה" — כאילו הסיסמה שלו שגויה.
  it('500 → השרת אינו זמין (ולא שגיאת כניסה גנרית)', async () => {
    expect(await mirageAuthErrorKey(res(500))).toBe('login.errorServerDown');
  });

  it('503/504 → השרת אינו זמין', async () => {
    expect(await mirageAuthErrorKey(res(503))).toBe('login.errorServerDown');
    expect(await mirageAuthErrorKey(res(504))).toBe('login.errorServerDown');
  });

  it('4xx לא מוכר → שגיאת כניסה גנרית', async () => {
    expect(await mirageAuthErrorKey(res(404))).toBe('login.errorLogin');
    expect(await mirageAuthErrorKey(res(400))).toBe('login.errorLogin');
  });

  // ה-500 של פרוקסי Vite הוא text/plain — json() זורק
  it('גוף שאינו JSON לא מפיל את המיפוי', async () => {
    const broken = { status: 500, json: async () => { throw new SyntaxError('Unexpected token'); } };
    expect(await mirageAuthErrorKey(broken)).toBe('login.errorServerDown');
    const broken401 = { status: 401, json: async () => { throw new SyntaxError('Unexpected token'); } };
    expect(await mirageAuthErrorKey(broken401)).toBe('login.mirageBadCredentials');
  });
});
