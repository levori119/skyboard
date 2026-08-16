// בידוד סביבות בתמונ"א - הצד של **העמדה**.
//
// שני דברים נבדקים כאן, ושניהם "שקטים" מטבעם ולכן דורשים בדיקה:
//   1. מספרי הסביבות בחוזה המאגר ובמודול הסביבה של האפליקציה **מסכימים**.
//      הם משוכפלים בכוונה (שני ריפואים), ודריפט ביניהם היה מוביל את העמדה
//      לחשוב שהיא בדלי אחד והמאגר לדלי אחר.
//   2. תמונה שהגיעה מסביבה אחרת **מוחקת** את המטוסים ואינה מוצגת.
import { describe, it, expect, beforeEach } from 'vitest';
import { envBucket, isValidEnv, parseEnv, scenarioEnv, buildSnapshot, parseSnapshot,
  ENV_MIN, ENV_MAX, FLYING_MAX, DEFAULT_ENV } from '../../shared/airTrafficApi';
import * as appEnv from '../utils/environment';
import { airPictureStore } from './store';

describe('מספרי הסביבות - חוזה המאגר מול מודול הסביבה של העמדה', () => {
  it('אותם גבולות בשני המקומות', () => {
    // אם הבדיקה הזו נופלת, אל תתקן אותה - תקן את הצד שסטה. שני המספרים
    // מתארים את **אותה** מציאות: 50 הסביבות של SKY-KING.
    expect(ENV_MIN).toBe(appEnv.ENV_MIN);
    expect(ENV_MAX).toBe(appEnv.ENV_MAX);
    expect(FLYING_MAX).toBe(appEnv.FLYING_MAX);
  });

  it('"טסה" בשני המודולים היא אותה קבוצה', () => {
    for (let n = ENV_MIN; n <= ENV_MAX; n++) {
      expect(appEnv.isFlyingEnv(n)).toBe(envBucket(n) === 'live');
    }
  });
});

describe('envBucket בעותק העמדה', () => {
  it('1-10 דלי אחד, 11-50 דלי לכל אחת', () => {
    expect(envBucket(1)).toBe('live');
    expect(envBucket(10)).toBe('live');
    expect(envBucket(11)).toBe('env11');
    expect(envBucket(50)).toBe('env50');
  });

  it('סביבה פסולה זורקת', () => {
    expect(() => envBucket(0)).toThrow();
    expect(() => envBucket(51)).toThrow();
  });

  it('parseEnv: חסר = חי, זבל = null', () => {
    expect(parseEnv(null)).toBe(DEFAULT_ENV);
    expect(parseEnv('17')).toBe(17);
    expect(parseEnv('51')).toBeNull();
    expect(parseEnv('abc')).toBeNull();
  });

  it('scenarioEnv: תרחיש בלי סביבה הוא חי', () => {
    expect(scenarioEnv({})).toBe(DEFAULT_ENV);
    expect(scenarioEnv({ env: 23 })).toBe(23);
  });

  it('isValidEnv תואם לטווח', () => {
    expect(isValidEnv(ENV_MIN)).toBe(true);
    expect(isValidEnv(ENV_MAX)).toBe(true);
    expect(isValidEnv(ENV_MAX + 1)).toBe(false);
  });
});

describe('parseSnapshot - שדה env בצד העמדה', () => {
  const track = { id: 't1', cs: 'A', lat: 32, lon: 35, alt: 1000, spd: 300, hdg: 90, cls: 'friend', typ: 'f16' };

  it('סביבה שדווחה נקראת', () => {
    expect(parseSnapshot(buildSnapshot(1000, [track], 17))?.env).toBe(17);
  });

  it('מאגר ותיק בלי env = null, ולא הנחה שזו הסביבה החיה', () => {
    expect(parseSnapshot({ t: 1000, tracks: [track] })?.env).toBeNull();
  });
});

describe('store.setEnvMismatch', () => {
  beforeEach(() => airPictureStore.reset());

  it('מוחק את המטוסים - החריג היחיד לכלל "נתונים נשארים"', () => {
    airPictureStore.setSnapshot(1000, 1, [
      { id: 't1', cs: 'A', lat: 32, lon: 35, alt: 1000, spd: 300, hdg: 90, cls: 'friend', typ: 'f16', resp: '' },
    ], 2000);
    expect(airPictureStore.getSnapshot().tracks).toHaveLength(1);

    airPictureStore.setEnvMismatch('1 ≠ 17');
    const s = airPictureStore.getSnapshot();
    expect(s.status).toBe('envmismatch');
    expect(s.tracks).toHaveLength(0);
    expect(s.error).toBe('1 ≠ 17');
    // גם הזמן מתאפס: תמונה שאינה מוצגת אינה "ישנה", היא לא קיימת.
    expect(s.t).toBe(0);
  });

  it('אותה אי-התאמה פעמיים אינה מייצרת מצב חדש (זהות ל-useSyncExternalStore)', () => {
    airPictureStore.setEnvMismatch('1 ≠ 17');
    const first = airPictureStore.getSnapshot();
    airPictureStore.setEnvMismatch('1 ≠ 17');
    expect(airPictureStore.getSnapshot()).toBe(first);
  });

  it('בניגוד ל-stale/down, שם המטוסים נשארים', () => {
    airPictureStore.setSnapshot(1000, 1, [
      { id: 't1', cs: 'A', lat: 32, lon: 35, alt: 1000, spd: 300, hdg: 90, cls: 'friend', typ: 'f16', resp: '' },
    ], 2000);
    airPictureStore.setStatus('stale');
    expect(airPictureStore.getSnapshot().tracks).toHaveLength(1);
  });
});
