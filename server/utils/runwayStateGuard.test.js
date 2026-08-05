import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * שומר: **אין קריאה ישירה** לטבלאות מצב המסלול מקובץ ראוט.
 *
 * מצב המסלול (סגירה/קיצור, GRF, תאורות, מסלולים בשימוש) שייך ל**מסלול הפיזי**,
 * שיכול להיות מוגדר בכמה שדות ומקושר ביניהם. `SELECT ... FROM runway_notams`
 * ישיר מחזיר רק את מה שנשמר במסלול המקומי - כלומר מפספס בשקט סגירה שנרשמה בשדה
 * המקושר, וזו בדיוק התקלה שהמנגנון הזה בא לפתור.
 *
 * כתיבה (INSERT/UPDATE/DELETE) **מותרת** בראוטים: היא תמיד מקומית.
 * הקריאה עוברת דרך server/utils/runwayState.js בלבד.
 */

const STATE_TABLES = ['runway_notams', 'runway_grf', 'runway_lighting', 'runway_end_use'];
const ROUTES_DIR = path.resolve(__dirname, '../routes');

/** מסיר `DELETE FROM x` ו-`INSERT INTO x` כדי שרק קריאות יישארו. */
const readsOnly = (src) => src
  .replace(/DELETE\s+FROM/gi, 'DELETE__')
  .replace(/INSERT\s+INTO/gi, 'INSERT__');

describe('שומר מצב המסלול - קריאה רק דרך ה-resolver', () => {
  const files = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));

  it('יש קבצי ראוט לסרוק', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  for (const file of files) {
    it(`${file} אינו קורא ישירות מטבלאות מצב המסלול`, () => {
      const src = readsOnly(fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8'));
      const hits = STATE_TABLES.filter(t => new RegExp(`FROM\\s+${t}\\b`, 'i').test(src));
      expect(hits, `${file}: להשתמש ב-resolveNotams/resolveGrf/resolveLighting/resolveEndUse`).toEqual([]);
    });
  }
});
