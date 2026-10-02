// המיראז' במאגר המקומי - קוד אבטחה, ולכן הבדיקות כאן עוינות ולא מאשרות.
//
// העמדה מחזיקה העתק של משתמשי המיראז' (כולל טביעת הסיסמה) כדי שכל משתמש
// מורשה יוכל להיכנס בנתק, גם אם מעולם לא נכנס בעמדה הזו. כל בדיקה מתארת דרך
// שבה מישהו נכנס בלי שהוא אמור: סיסמה שגויה, משתמש שנמחק במיראז', הרשאה
// שנשללה, או רשימה ריקה שמוחקת את כולם בטעות.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createLocalPool } from '../db/localPool.js';
import { hashPassword } from '../../mirage/password.js';
import {
  ensureMirageReplicaTable, replaceMirageUsers, verifyReplicaLogin, countMirageUsers, REPLICA_LOGIN,
} from './mirageReplica.js';

const PW = 'Skc#2026!Wxyz';
const APP = 'SKY-KING';

const user = (pn, apps, extra = {}) => ({
  personalNumber: pn, firstName: 'בקר', lastName: pn, apps, passwordHash: hashPassword(PW), ...extra,
});

let pool;
beforeAll(async () => {
  pool = createLocalPool({ dataDir: 'memory://' });
  await ensureMirageReplicaTable(pool);
});
afterAll(async () => { await pool?.end(); });

describe('replaceMirageUsers - ההעתק משקף את המיראז\' בדיוק', () => {
  beforeEach(async () => { await replaceMirageUsers(pool, []); });

  it('משתמשים נכנסים להעתק', async () => {
    await replaceMirageUsers(pool, [user('100', { [APP]: ['user'] }), user('200', { [APP]: ['admin'] })]);
    expect(await countMirageUsers(pool)).toBe(2);
  });

  // משתמש שהוסר במיראז' (עזב, הודח) חייב להיעלם גם מהעמדה - אחרת העמדה היא
  // דלת אחורית שנשארת פתוחה למי שכבר אין לו הרשאה.
  it('משתמש שנמחק במיראז\' נמחק מההעתק', async () => {
    await replaceMirageUsers(pool, [user('100', { [APP]: ['user'] }), user('200', { [APP]: ['user'] })]);
    await replaceMirageUsers(pool, [user('100', { [APP]: ['user'] })]);
    expect(await countMirageUsers(pool)).toBe(1);
    const r = await verifyReplicaLogin(pool, { personalNumber: '200', password: PW, appName: APP });
    expect(r.ok).toBe(false);
  });

  it('סיסמה שהוחלפה במיראז\' - הישנה כבר לא נכנסת', async () => {
    await replaceMirageUsers(pool, [user('100', { [APP]: ['user'] })]);
    await replaceMirageUsers(pool, [user('100', { [APP]: ['user'] }, { passwordHash: hashPassword('Other#2027!Pass') })]);
    const r = await verifyReplicaLogin(pool, { personalNumber: '100', password: PW, appName: APP });
    expect(r).toMatchObject({ ok: false, reason: REPLICA_LOGIN.BAD_PASSWORD });
  });

  // תשובה שבורה מהמרכז (null, אובייקט שגיאה) אינה "אין משתמשים". פירוש כזה
  // היה מרוקן את ההעתק ונועל את כל העמדה בנתק הבא.
  it('קלט שאינו מערך נדחה ואינו נוגע בהעתק', async () => {
    await replaceMirageUsers(pool, [user('100', { [APP]: ['user'] })]);
    await expect(replaceMirageUsers(pool, null)).rejects.toThrow();
    await expect(replaceMirageUsers(pool, { error: 'x' })).rejects.toThrow();
    expect(await countMirageUsers(pool)).toBe(1);
  });
});

describe('verifyReplicaLogin', () => {
  beforeAll(async () => {
    await replaceMirageUsers(pool, [
      user('100', { [APP]: { roles: ['team_lead'], workstations: [{ id: 3, name: 'מגדל' }], positions: ['pakach', 'זבל'] } }),
      user('300', { 'OTHER-APP': ['user'] }),
      user('400', { [APP]: ['user'] }, { passwordHash: null }),
    ]);
  });

  it('סיסמה נכונה - נכנס, עם התפקידים והעמדות שהמיראז\' אישר', async () => {
    const r = await verifyReplicaLogin(pool, { personalNumber: '100', password: PW, appName: APP });
    expect(r.ok).toBe(true);
    expect(r.auth).toMatchObject({
      roles: ['team_lead'],
      workstations: [{ id: 3, name: 'מגדל' }],
      positions: ['pakach'],
      user: { firstName: 'בקר', lastName: '100' },
    });
  });

  it('סיסמה שגויה - נדחה', async () => {
    const r = await verifyReplicaLogin(pool, { personalNumber: '100', password: 'wrong', appName: APP });
    expect(r).toMatchObject({ ok: false, reason: REPLICA_LOGIN.BAD_PASSWORD });
  });

  it('משתמש שאינו בהעתק - "לא נמצא", כדי שאפשר יהיה לנסות את האסמכתא השמורה', async () => {
    const r = await verifyReplicaLogin(pool, { personalNumber: '999', password: PW, appName: APP });
    expect(r).toMatchObject({ ok: false, reason: REPLICA_LOGIN.NOT_FOUND });
  });

  it('משתמש בלי הרשאה ל-SKY-KING - נדחה גם עם סיסמה נכונה', async () => {
    const r = await verifyReplicaLogin(pool, { personalNumber: '300', password: PW, appName: APP });
    expect(r).toMatchObject({ ok: false, reason: REPLICA_LOGIN.APP_NOT_PERMITTED });
  });

  it('משתמש בלי סיסמה - נדחה', async () => {
    const r = await verifyReplicaLogin(pool, { personalNumber: '400', password: PW, appName: APP });
    expect(r).toMatchObject({ ok: false, reason: REPLICA_LOGIN.PASSWORD_NOT_SET });
  });
});
