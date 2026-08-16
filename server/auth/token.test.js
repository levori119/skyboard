// בדיקות לאסימון ההזדהות (SK-01). המיקוד הוא במה שתוקף היה מנסה:
// לזייף חתימה, להאריך תוקף, לרדת גרסה, או לגרום לאימות ליפול במקום לדחות.
import { describe, it, expect } from 'vitest';
import { signToken, verifyToken, bearerFrom, assertAuthSecret, DEFAULT_TTL_MS } from './token.js';

describe('חתימה ואימות', () => {
  it('אסימון שנחתם עובר אימות ומחזיר את ה-claims', () => {
    const t = signToken({ crewMemberId: 7, name: 'בקר', isAdmin: false });
    const c = verifyToken(t);
    expect(c.crewMemberId).toBe(7);
    expect(c.name).toBe('בקר');
    expect(c.isAdmin).toBe(false);
    expect(c.exp - c.iat).toBe(DEFAULT_TTL_MS);
  });

  it('שינוי ב-payload מבטל את החתימה', () => {
    const t = signToken({ isAdmin: false });
    const [v, payload, sig] = t.split('.');
    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString());
    forged.isAdmin = true; // בדיוק מה שתוקף היה רוצה
    const evil = `${v}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`;
    expect(verifyToken(evil)).toBe(null);
  });

  it('הארכת תוקף ידנית מבטלת את החתימה', () => {
    const t = signToken({ crewMemberId: 1 }, 1000);
    const [v, payload, sig] = t.split('.');
    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString());
    forged.exp = Date.now() + 10 * 365 * 24 * 3600 * 1000;
    const evil = `${v}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`;
    expect(verifyToken(evil)).toBe(null);
  });

  it('אסימון שפג תוקפו נדחה', () => {
    expect(verifyToken(signToken({ crewMemberId: 1 }, -1))).toBe(null);
  });

  it('תג גרסה שונה נדחה (מניעת downgrade)', () => {
    const t = signToken({ crewMemberId: 1 });
    expect(verifyToken(t.replace(/^v1\./, 'v0.'))).toBe(null);
  });

  it('קלט משובש מוחזר כ-null ולא זורק', () => {
    for (const bad of [null, undefined, '', 'x', 'a.b', 'a.b.c.d', 'v1..', 'v1.%%%.%%%', 123, {}, 'v1.' + 'A'.repeat(5000) + '.x']) {
      expect(verifyToken(bad)).toBe(null);
    }
  });

  it('חתימה באורך שגוי נדחית ולא מפילה את הבקשה', () => {
    const t = signToken({ crewMemberId: 1 });
    const [v, p] = t.split('.');
    expect(verifyToken(`${v}.${p}.AAAA`)).toBe(null);
  });
});

describe('חילוץ מכותרת Authorization', () => {
  const req = (value) => ({ get: () => value, headers: {} });

  it('מקבל Bearer בכל צורת אותיות', () => {
    expect(bearerFrom(req('Bearer abc'))).toBe('abc');
    expect(bearerFrom(req('bearer abc'))).toBe('abc');
    expect(bearerFrom(req('  Bearer   abc  '))).toBe('abc');
  });

  it('דוחה סכמות אחרות וכותרת חסרה', () => {
    expect(bearerFrom(req('Basic abc'))).toBe(null);
    expect(bearerFrom(req('abc'))).toBe(null);
    expect(bearerFrom(req(''))).toBe(null);
    expect(bearerFrom({ headers: {} })).toBe(null);
  });
});

describe('דרישת הסוד', () => {
  const withEnv = (env, fn) => {
    const prevSecret = process.env.AUTH_SECRET;
    const prevNode = process.env.NODE_ENV;
    Object.assign(process.env, env);
    if (env.AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
    try { return fn(); } finally {
      if (prevSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = prevSecret;
      if (prevNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prevNode;
    }
  };

  it('פרודקשן בלי סוד - נכשל בקול (ולא "פתוח כשאינו מוגדר")', () => {
    withEnv({ AUTH_SECRET: undefined, NODE_ENV: 'production' }, () => {
      expect(() => assertAuthSecret()).toThrow(/AUTH_SECRET/);
    });
  });

  it('פרודקשן עם סוד קצר מדי - נכשל גם כן', () => {
    withEnv({ AUTH_SECRET: 'short', NODE_ENV: 'production' }, () => {
      expect(() => assertAuthSecret()).toThrow(/AUTH_SECRET/);
    });
  });

  it('פיתוח בלי סוד - סוד אקראי להרצה, עם דיווח', () => {
    withEnv({ AUTH_SECRET: undefined, NODE_ENV: 'development' }, () => {
      expect(assertAuthSecret()).toEqual({ ok: true, source: 'ephemeral' });
    });
  });

  it('סוד תקין - מזוהה כמגיע מהסביבה', () => {
    withEnv({ AUTH_SECRET: 'x'.repeat(48), NODE_ENV: 'production' }, () => {
      expect(assertAuthSecret()).toEqual({ ok: true, source: 'env' });
    });
  });
});
