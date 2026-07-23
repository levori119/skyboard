// סביבות תרגול — בדיקות מיפוי סביבה→סכמה + הקשר ALS (TDD, לפני מימוש)
import { describe, it, expect } from 'vitest';
import {
  ENV_MIN, ENV_MAX, FLYING_MAX,
  isValidEnv, schemaForEnv, runWithEnv, currentEnv, currentSchema,
} from './env-context.js';

describe('env-context — קבועים', () => {
  it('טווח הסביבות: 1..50, טסות עד 10', () => {
    expect(ENV_MIN).toBe(1);
    expect(ENV_MAX).toBe(50);
    expect(FLYING_MAX).toBe(10);
  });
});

describe('schemaForEnv — מיפוי סביבה לסכמה', () => {
  it('סביבות טסות 1..10 → public (סכמה משותפת)', () => {
    expect(schemaForEnv(1)).toBe('public');
    expect(schemaForEnv(5)).toBe('public');
    expect(schemaForEnv(10)).toBe('public');
  });

  it('סביבות תרגול 11..50 → env_NN', () => {
    expect(schemaForEnv(11)).toBe('env_11');
    expect(schemaForEnv(23)).toBe('env_23');
    expect(schemaForEnv(50)).toBe('env_50');
  });

  it('ערך לא חוקי → זריקה (הגנת SQL injection על שם הסכמה)', () => {
    for (const bad of [0, 51, -3, 1.5, NaN, Infinity, '7', '12; DROP', null, undefined]) {
      expect(() => schemaForEnv(bad), `schemaForEnv(${String(bad)})`).toThrow();
    }
  });

  it('isValidEnv — גבולות', () => {
    expect(isValidEnv(1)).toBe(true);
    expect(isValidEnv(50)).toBe(true);
    expect(isValidEnv(0)).toBe(false);
    expect(isValidEnv(51)).toBe(false);
    expect(isValidEnv(2.5)).toBe(false);
    expect(isValidEnv('3')).toBe(false);
  });
});

describe('runWithEnv — הקשר סביבה (AsyncLocalStorage)', () => {
  it('ברירת מחדל מחוץ להקשר: סביבה 1 / public', () => {
    expect(currentEnv()).toBe(1);
    expect(currentSchema()).toBe('public');
  });

  it('בתוך ההקשר — הסביבה והסכמה הנבחרות; מחזיר את ערך ה-callback', () => {
    const out = runWithEnv(23, () => {
      expect(currentEnv()).toBe(23);
      expect(currentSchema()).toBe('env_23');
      return 'ok';
    });
    expect(out).toBe('ok');
    expect(currentSchema()).toBe('public');
  });

  it('ההקשר שורד await (async chain של בקשת express)', async () => {
    await runWithEnv(12, async () => {
      await new Promise(r => setTimeout(r, 5));
      expect(currentEnv()).toBe(12);
      expect(currentSchema()).toBe('env_12');
    });
  });

  it('הקשרים מקוננים — הפנימי גובר', () => {
    runWithEnv(12, () => {
      runWithEnv(3, () => {
        expect(currentEnv()).toBe(3);
        expect(currentSchema()).toBe('public');
      });
      expect(currentEnv()).toBe(12);
    });
  });

  it('סביבה לא חוקית → זריקה', () => {
    expect(() => runWithEnv(99, () => {})).toThrow();
  });
});
