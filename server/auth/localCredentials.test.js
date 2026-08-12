// הזדהות בנתק — קוד אבטחה, ולכן הבדיקות כאן עוינות ולא מאשרות.
//
// כל בדיקה מתארת דרך שבה מישהו נכנס לעמדה בלי שהוא אמור: אסמכתא שפגה,
// סיסמה שהוחלפה, ניחוש בכוח גס, או משתמש שמעולם לא נכנס בעמדה הזו.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createLocalPool } from '../db/localPool.js';
import {
  ensureLocalCredentialsTable, cacheCredential, verifyLocalLogin, purgeExpiredCredentials,
  hashPassword, verifyPassword, createLoginLimiter, LOCAL_LOGIN, CACHE_TTL_DAYS,
} from './localCredentials.js';

const DAY = 86400_000;
const CLAIMS = {
  crewMemberId: 7, name: 'בקר בדיקה', isAdmin: false, isTeamLead: true,
  approvedWorkstations: [3, 4], roles: ['team_lead'],
};

describe('טביעת סיסמה', () => {
  it('אותה סיסמה עם אותו מלח נותנת אותה טביעה', async () => {
    const a = await hashPassword('סיסמה-1234', 'salt-abc');
    const b = await hashPassword('סיסמה-1234', 'salt-abc');
    expect(a.hash).toBe(b.hash);
  });

  it('אותה סיסמה עם מלח אחר נותנת טביעה אחרת - מונע טבלאות מוכנות מראש', async () => {
    const a = await hashPassword('סיסמה-1234');
    const b = await hashPassword('סיסמה-1234');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('הטביעה אינה מכילה את הסיסמה', async () => {
    const { hash } = await hashPassword('סיסמה-סודית-מאוד');
    expect(hash).not.toContain('סודית');
  });

  it('אימות מצליח לסיסמה נכונה ונכשל לשגויה', async () => {
    const { salt, hash } = await hashPassword('נכונה');
    expect(await verifyPassword('נכונה', salt, hash)).toBe(true);
    expect(await verifyPassword('שגויה', salt, hash)).toBe(false);
  });

  it('טביעה פגומה אינה מפילה את השרת - מחזירה false', async () => {
    expect(await verifyPassword('משהו', 'salt', 'לא-הקסדצימלי')).toBe(false);
  });
});

describe('אסמכתאות שמורות בעמדה', () => {
  let pool;

  beforeAll(async () => {
    pool = createLocalPool({ dataDir: 'memory://' });
    await ensureLocalCredentialsTable(pool);
  }, 120_000);

  afterAll(async () => { await pool?.end(); });

  beforeEach(async () => { await pool.query('DELETE FROM local_credentials'); });

  it('כניסה מקומית מצליחה אחרי שנשמרה אסמכתא', async () => {
    await cacheCredential(pool, { personalNumber: '1234567', password: 'סיסמה-טובה', claims: CLAIMS });
    const r = await verifyLocalLogin(pool, { personalNumber: '1234567', password: 'סיסמה-טובה' });
    expect(r.ok).toBe(true);
    expect(r.claims.crewMemberId).toBe(7);
    expect(r.claims.approvedWorkstations).toEqual([3, 4]);
  });

  it('מי שמעולם לא נכנס בעמדה הזו אינו יכול להיכנס בנתק', async () => {
    // זו החלטה ולא מגבלה: אחרת כל עמדה הייתה מקור סמכות עצמאי לכל מספר אישי.
    const r = await verifyLocalLogin(pool, { personalNumber: '9999999', password: 'כל-סיסמה' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(LOCAL_LOGIN.NO_CREDENTIAL);
  });

  it('סיסמה שגויה נדחית', async () => {
    await cacheCredential(pool, { personalNumber: '1234567', password: 'האמיתית', claims: CLAIMS });
    const r = await verifyLocalLogin(pool, { personalNumber: '1234567', password: 'ניחוש' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(LOCAL_LOGIN.BAD_PASSWORD);
  });

  it('אסמכתא פגת תוקף נדחית - עמדה שנשכחה אינה דלת כניסה לצמיתות', async () => {
    const then = Date.now() - (CACHE_TTL_DAYS + 1) * DAY;
    await cacheCredential(pool, { personalNumber: '1234567', password: 'ישנה', claims: CLAIMS, now: then });
    const r = await verifyLocalLogin(pool, { personalNumber: '1234567', password: 'ישנה' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(LOCAL_LOGIN.EXPIRED);
  });

  it('אסמכתא בתוך התוקף מתקבלת - הגבול נבדק ולא רק המקרה הקיצוני', async () => {
    const then = Date.now() - (CACHE_TTL_DAYS - 1) * DAY;
    await cacheCredential(pool, { personalNumber: '1234567', password: 'עדיין', claims: CLAIMS, now: then });
    const r = await verifyLocalLogin(pool, { personalNumber: '1234567', password: 'עדיין' });
    expect(r.ok).toBe(true);
  });

  it('כניסה מחדש מחליפה את האסמכתא - סיסמה שהוחלפה גוברת על הישנה', async () => {
    await cacheCredential(pool, { personalNumber: '1234567', password: 'ישנה', claims: CLAIMS });
    await cacheCredential(pool, { personalNumber: '1234567', password: 'חדשה', claims: CLAIMS });
    expect((await verifyLocalLogin(pool, { personalNumber: '1234567', password: 'חדשה' })).ok).toBe(true);
    expect((await verifyLocalLogin(pool, { personalNumber: '1234567', password: 'ישנה' })).ok).toBe(false);
  });

  it('שמירה בלי סיסמה נדחית ואינה יוצרת שורה ריקה', async () => {
    await expect(cacheCredential(pool, { personalNumber: '1', password: '', claims: {} })).rejects.toThrow();
    const n = await pool.query('SELECT COUNT(*)::int AS n FROM local_credentials');
    expect(n.rows[0].n).toBe(0);
  });

  it('ניקוי מוחק רק את מה שפג', async () => {
    const old = Date.now() - (CACHE_TTL_DAYS + 5) * DAY;
    await cacheCredential(pool, { personalNumber: 'ישן', password: 'a', claims: {}, now: old });
    await cacheCredential(pool, { personalNumber: 'חדש', password: 'b', claims: {} });
    expect(await purgeExpiredCredentials(pool)).toBe(1);
    const left = await pool.query('SELECT personal_number FROM local_credentials');
    expect(left.rows.map(r => r.personal_number)).toEqual(['חדש']);
  });

  it('רושם מתי נעשה שימוש אחרון - ליומן הביקורת', async () => {
    await cacheCredential(pool, { personalNumber: '1234567', password: 'p', claims: CLAIMS });
    await verifyLocalLogin(pool, { personalNumber: '1234567', password: 'p' });
    const r = await pool.query('SELECT last_used_at FROM local_credentials WHERE personal_number=$1', ['1234567']);
    expect(r.rows[0].last_used_at).toBeInstanceOf(Date);
  });
});

describe('הגבלת ניחושים', () => {
  it('נועל אחרי מספר הניסיונות ומשחרר אחרי החלון', () => {
    const lim = createLoginLimiter({ maxAttempts: 3, lockoutMs: 1000 });
    const t = 1_000_000;
    expect(lim.check('u', t).blocked).toBe(false);
    lim.fail('u', t); lim.fail('u', t);
    expect(lim.check('u', t).blocked).toBe(false); // עוד לא
    lim.fail('u', t);
    expect(lim.check('u', t).blocked).toBe(true);
    expect(lim.check('u', t).retryInMs).toBe(1000);
    expect(lim.check('u', t + 1001).blocked).toBe(false); // החלון פג
  });

  it('כניסה מוצלחת מאפסת את המונה', () => {
    const lim = createLoginLimiter({ maxAttempts: 3 });
    lim.fail('u'); lim.fail('u');
    lim.succeed('u');
    lim.fail('u'); lim.fail('u');
    expect(lim.check('u').blocked).toBe(false);
  });

  it('נעילה היא פר-משתמש ואינה חוסמת אחרים באותה עמדה', () => {
    const lim = createLoginLimiter({ maxAttempts: 2 });
    lim.fail('א'); lim.fail('א');
    expect(lim.check('א').blocked).toBe(true);
    expect(lim.check('ב').blocked).toBe(false);
  });
});
