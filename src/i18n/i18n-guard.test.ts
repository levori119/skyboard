import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { REGISTRY } from './registry';

/**
 * שומר i18n — נכשל אם מישהו הוסיף **טקסט תצוגה עברי בקוד** במקום ב-registry.
 *
 * למה זה קיים: בלי זה, הטבלה מתיישנת. כל שדה/פעולה חדשים חייבים להירשם
 * ב-src/i18n/registry/<group>.json כדי שיהיה ניתן לשנות את שמם (עברית/אנגלית)
 * בלי לגעת בקוד ובלי build מחדש.
 *
 * מה נבדק:
 *   1. אין טקסט עברי ב-JSX  (>טקסט<)
 *   2. אין טקסט עברי ב-attributes תצוגה (title / placeholder / aria-label / alt)
 *   3. כל tr('group.key') בקוד קיים ב-registry (אין מפתח יתום)
 *   4. לכל מפתח ב-registry יש `he` לא ריק
 *
 * מה **לא** נבדק (בכוונה):
 *   - literals עבריים "רגילים" — הם לרוב **ערכי-נתונים** ('תקין', 'עוזב אזור')
 *     שמושווים/נשמרים ב-DB. תרגומם ישבור לוגיקה. ראה DEV_GUIDE §i18n.
 *   - הערות קוד.
 */

const HEB = /[֐-׿]/;
const ROOT = path.resolve(__dirname, '../..');

// חריגים מוצדקים — עם נימוק. כל תוספת כאן דורשת הסבר.
const ALLOWLIST: Record<string, string> = {
  'src/components/shared/OnScreenKeyboard.tsx':
    'פריסת המקלדת העברית — המקשים עצמם (א,ב,ג...) ותווית הפריסה. אינם טקסט תצוגה לתרגום.',
};

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );
}

function sourceFiles(): { rel: string; src: string }[] {
  const files = [
    ...walk(path.join(ROOT, 'src/components')).filter(f => f.endsWith('.tsx')),
    path.join(ROOT, 'src/App.tsx'),
  ];
  return files
    .filter(f => !f.endsWith('.test.tsx') && !f.endsWith('.test.ts'))
    .map(f => ({ rel: path.relative(ROOT, f).split(path.sep).join('/'), src: fs.readFileSync(f, 'utf8') }))
    .filter(f => !(f.rel in ALLOWLIST));
}

/** מסיר הערות כדי שלא ייחשבו כטקסט תצוגה */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const CODEISH = /=>|;|`|\$\{|\breturn\b|=\s*['"]/;

describe('i18n guard — טקסט תצוגה חייב לחיות ב-registry, לא בקוד', () => {
  it('אין טקסט עברי ב-JSX (>טקסט<)', () => {
    const bad: string[] = [];
    for (const { rel, src } of sourceFiles()) {
      const clean = stripComments(src);
      for (const m of clean.matchAll(/>([^<>{}\n]*[֐-׿][^<>{}\n]*)</g)) {
        const text = m[1].trim();
        if (!text || CODEISH.test(m[1])) continue;
        const line = clean.slice(0, m.index).split('\n').length;
        bad.push(`${rel}:${line}  "${text}"`);
      }
    }
    expect(
      bad,
      `\n❌ נמצא טקסט עברי בקוד. עטוף אותו והוסף ל-registry:\n` +
      `   1. הוסף מפתח ל-src/i18n/registry/<group>.json:  "myKey": { "he": "...", "en": "..." }\n` +
      `   2. בקוד:  {tr('<group>.myKey')}\n` +
      `   (כלי עזר: node scripts/i18n-codemod.mjs <file>)\n\n` +
      bad.slice(0, 20).join('\n')
    ).toEqual([]);
  });

  it('אין טקסט עברי ב-attributes תצוגה (title/placeholder/aria-label/alt)', () => {
    const bad: string[] = [];
    for (const { rel, src } of sourceFiles()) {
      const clean = stripComments(src);
      for (const m of clean.matchAll(/\b(title|placeholder|aria-label|alt)=(["'])([^"'\n]*[֐-׿][^"'\n]*)\2/g)) {
        const line = clean.slice(0, m.index).split('\n').length;
        bad.push(`${rel}:${line}  ${m[1]}="${m[3]}"`);
      }
    }
    expect(
      bad,
      `\n❌ נמצא טקסט עברי ב-attribute תצוגה. השתמש ב-tr():  title={tr('<group>.key')}\n\n` +
      bad.slice(0, 20).join('\n')
    ).toEqual([]);
  });

  it("כל tr('group.key') בקוד קיים ב-registry", () => {
    const dangling: string[] = [];
    for (const { rel, src } of sourceFiles()) {
      for (const m of src.matchAll(/\btr\(\s*'([^']+)'\s*\)/g)) {
        const full = m[1];
        const dot = full.indexOf('.');
        const group = full.slice(0, dot);
        const key = full.slice(dot + 1);
        if (!REGISTRY[group]?.keys?.[key]) {
          const line = src.slice(0, m.index).split('\n').length;
          dangling.push(`${rel}:${line}  tr('${full}')`);
        }
      }
    }
    expect(
      dangling,
      `\n❌ מפתחות יתומים — קיימים בקוד אך לא ב-registry:\n\n` + dangling.slice(0, 20).join('\n')
    ).toEqual([]);
  });

  it('לכל מפתח ב-registry יש טקסט עברי', () => {
    const empty: string[] = [];
    for (const [group, data] of Object.entries(REGISTRY)) {
      for (const [key, entry] of Object.entries(data.keys)) {
        if (!entry.he || !entry.he.trim()) empty.push(`${group}.${key}`);
      }
    }
    expect(empty, `\n❌ מפתחות בלי טקסט עברי:\n${empty.join('\n')}`).toEqual([]);
  });
});
