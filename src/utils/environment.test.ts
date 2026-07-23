// סביבות תרגול — בדיקות לוגיקת הסביבה בצד הלקוח (TDD, לפני מימוש)
import { describe, it, expect } from 'vitest';
import {
  ENV_MIN, ENV_MAX, FLYING_MAX,
  isFlyingEnv, normalizeEnv, setCurrentEnv, getCurrentEnv,
  shouldTagRequest, envHeaderFor,
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
