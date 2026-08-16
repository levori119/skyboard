// שרידות ל-failover של ה-DB — סיווג השגיאות והשאילתות.
//
// הכלל הקריטי כאן הוא **fail closed**: כל מה שאינו SELECT מובהק נחשב כתיבה
// ואינו משודר שוב. כשה-connection מת אי אפשר לדעת אם ה-INSERT הספיק להתבצע
// בצד השרת, ושידור חוזר היה משכפל פ"מ או העברת עמדה.
import { describe, it, expect } from 'vitest';
import { isTransientDbError, isReadOnlySql } from './pool.js';

describe('isTransientDbError', () => {
  it('מזהה סגירת connection ע"י השרת (failover / restart)', () => {
    for (const code of ['57P01', '57P02', '57P03']) {
      expect(isTransientDbError({ code }), code).toBe(true);
    }
  });

  it('מזהה שגיאות connection של פוסטגרס', () => {
    for (const code of ['08000', '08001', '08003', '08004', '08006', '08007']) {
      expect(isTransientDbError({ code }), code).toBe(true);
    }
  });

  it('מזהה שגיאות רשת ברמת Node', () => {
    for (const code of ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED']) {
      expect(isTransientDbError({ code }), code).toBe(true);
    }
  });

  it('מזהה לפי נוסח ההודעה כשאין קוד', () => {
    expect(isTransientDbError({ message: 'Connection terminated unexpectedly' })).toBe(true);
    expect(isTransientDbError({ message: 'terminating connection due to administrator command' })).toBe(true);
    expect(isTransientDbError({ message: 'socket hang up' })).toBe(true);
  });

  it('שגיאה לוגית אינה זמנית — אסור לשדר שוב', () => {
    expect(isTransientDbError({ code: '23505' })).toBe(false);  // unique_violation
    expect(isTransientDbError({ code: '23503' })).toBe(false);  // foreign_key_violation
    expect(isTransientDbError({ code: '42601' })).toBe(false);  // syntax_error
    expect(isTransientDbError({ code: '42P01' })).toBe(false);  // undefined_table
    expect(isTransientDbError({ message: 'null value in column violates not-null' })).toBe(false);
  });

  it('null/undefined אינם שגיאה זמנית', () => {
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
  });
});

describe('isReadOnlySql — fail closed', () => {
  it('SELECT הוא קריאה', () => {
    expect(isReadOnlySql('SELECT * FROM strips')).toBe(true);
    expect(isReadOnlySql('  select id from sectors ')).toBe(true);
    expect(isReadOnlySql({ text: 'SELECT 1' })).toBe(true);
  });

  it('CTE של קריאה בלבד הוא קריאה', () => {
    expect(isReadOnlySql('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
  });

  it('⚠ כתיבה לעולם אינה משודרת שוב', () => {
    const writes = [
      'INSERT INTO strips (callsign) VALUES ($1)',
      'UPDATE strips SET alt = $1 WHERE id = $2',
      'DELETE FROM strip_transfers WHERE id = $1',
      'TRUNCATE serials',
      'ALTER TABLE strips ADD COLUMN x INT',
      'CREATE TABLE t (id INT)',
      'DROP TABLE t',
      'BEGIN',
      'COMMIT',
    ];
    for (const w of writes) expect(isReadOnlySql(w), w).toBe(false);
  });

  it('⚠ CTE שמכיל כתיבה אינו קריאה', () => {
    expect(isReadOnlySql('WITH d AS (DELETE FROM strips RETURNING id) SELECT * FROM d')).toBe(false);
    expect(isReadOnlySql('WITH i AS (INSERT INTO strips (callsign) VALUES ($1) RETURNING id) SELECT * FROM i')).toBe(false);
  });

  it('הערה בתחילת השאילתה לא מסווה כתיבה ולא פוסלת קריאה', () => {
    expect(isReadOnlySql('-- update the board\nSELECT * FROM strips')).toBe(true);
    expect(isReadOnlySql('/* select */ UPDATE strips SET x = 1')).toBe(false);
  });

  it('שאילתה ריקה אינה קריאה', () => {
    expect(isReadOnlySql('')).toBe(false);
    expect(isReadOnlySql('   ')).toBe(false);
    expect(isReadOnlySql(undefined)).toBe(false);
  });
});
