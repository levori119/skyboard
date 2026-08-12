// סביבות תרגול — בדיקות לוגיקת הסביבה בצד הלקוח (TDD, לפני מימוש)
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ENV_MIN, ENV_MAX, FLYING_MAX,
  isFlyingEnv, normalizeEnv, setCurrentEnv, getCurrentEnv,
  shouldTagRequest, envHeaderFor, enterEnvironment,
} from './environment';

describe('environment — סוג סביבה', () => {
  it('1..10 טסות, 11..50 תרגול', () => {
    expect(isFlyingEnv(1)).toBe(true);
    expect(isFlyingEnv(10)).toBe(true);
    expect(isFlyingEnv(11)).toBe(false);
    expect(isFlyingEnv(50)).toBe(false);
  });

  it('קבועים תואמים לשרת', () => {
    expect(ENV_MIN).toBe(1);
    expect(ENV_MAX).toBe(50);
    expect(FLYING_MAX).toBe(10);
  });
});

describe('normalizeEnv — קלט מהמשתמש/מה-session', () => {
  it('מספר או מחרוזת חוקיים → מספר', () => {
    expect(normalizeEnv(7)).toBe(7);
    expect(normalizeEnv('17')).toBe(17);
    expect(normalizeEnv('50')).toBe(50);
  });
  it('לא חוקי → null', () => {
    for (const bad of [0, 51, '0', 'abc', '', null, undefined, 12.5, '12.5']) {
      expect(normalizeEnv(bad as any), `normalizeEnv(${String(bad)})`).toBe(null);
    }
  });
});

describe('current env — מקור אמת אחד ללקוח', () => {
  it('ברירת מחדל 1; set/get עובדים גם בלי sessionStorage (סביבת node)', () => {
    expect(getCurrentEnv()).toBe(1);
    setCurrentEnv(23);
    expect(getCurrentEnv()).toBe(23);
    setCurrentEnv(1);
    expect(getCurrentEnv()).toBe(1);
  });
  it('ערך לא חוקי לא משנה את המצב', () => {
    setCurrentEnv(12);
    setCurrentEnv(99 as any);
    expect(getCurrentEnv()).toBe(12);
    setCurrentEnv(1);
  });
});

describe('תיוג בקשות API בכותרת X-Env', () => {
  it('בקשות /api מקבלות תיוג', () => {
    expect(shouldTagRequest('/api/strips/global')).toBe(true);
    expect(shouldTagRequest('/api/environments')).toBe(true);
  });
  it('בקשות חיצוניות/סטטיות — לא', () => {
    expect(shouldTagRequest('https://example.com/api/x')).toBe(false);
    expect(shouldTagRequest('/assets/map.png')).toBe(false);
    expect(shouldTagRequest('/driver')).toBe(false);
  });
  it('envHeaderFor מחזיר את הסביבה הנוכחית כמחרוזת', () => {
    setCurrentEnv(31);
    expect(envHeaderFor()).toBe('31');
    setCurrentEnv(1);
    expect(envHeaderFor()).toBe('1');
  });
});

// כניסה לסביבה — נקודת כניסה אחת לכל מסלולי הכניסה מהמסך הראשי (עמדה / ניהול /
// תחקיר). באג שנמצא: מסך הניהול נכנס תמיד לסביבה הקודמת (1) כי רק מסלול העמדה
// קבע את הסביבה.
describe('enterEnvironment — קביעת הסביבה לפני כל בקשה', () => {
  afterEach(() => { setCurrentEnv(1); vi.unstubAllGlobals(); });

  it('סביבה טסה — נקבעת מיד, וחותמת הכניסה לא חוסמת גם אם נכשלה', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchSpy);
    await expect(enterEnvironment(7, '/api')).resolves.toBe(true);
    expect(getCurrentEnv()).toBe(7);
  });

  it('סביבת תרגול — ממתין ל-enter (יצירת הסכמה) ומחזיר true בהצלחה', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
    await expect(enterEnvironment(15, '/api')).resolves.toBe(true);
    expect(getCurrentEnv()).toBe(15);
    expect(fetchSpy).toHaveBeenCalledWith('/api/environments/15/enter', { method: 'POST' });
  });

  it('סביבת תרגול — כישלון בהכנת הסכמה מחזיר false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(enterEnvironment(11, '/api')).resolves.toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(enterEnvironment(11, '/api')).resolves.toBe(false);
  });

  it('סביבה לא חוקית — לא משנה מצב ולא פונה לשרת', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    setCurrentEnv(12);
    await expect(enterEnvironment(99, '/api')).resolves.toBe(false);
    expect(getCurrentEnv()).toBe(12);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
