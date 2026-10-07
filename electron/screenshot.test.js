// בדיקות צד הכתיבה של צילום המסך (כפתור 📷) - קובץ אמיתי בתיקייה זמנית.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { safePngName, saveScreenshot } = require('./screenshot.cjs');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyshot-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('safePngName - העמוד מוסר שם, לא נתיב', () => {
  it('שם תקין עובר כמו שהוא', () => {
    expect(safePngName('SKYKING_מגדל_2026-10-07_14-05-09.png')).toBe('SKYKING_מגדל_2026-10-07_14-05-09.png');
  });

  it('נתיב נחתך לשם בלבד - אי-אפשר לכתוב מחוץ ל-Downloads', () => {
    expect(safePngName('..\\..\\Windows\\evil.png')).toBe('evil.png');
    expect(safePngName('../../etc/evil.png')).toBe('evil.png');
    expect(safePngName('C:\\x\\evil.png')).toBe('evil.png');
  });

  it('הסיומת תמיד png', () => {
    expect(safePngName('run.exe')).toBe('run.exe.png');
    expect(safePngName('a.PNG')).toBe('a.PNG');
  });

  it('ריק או לא-מחרוזת - שם ברירת מחדל', () => {
    expect(safePngName('')).toBe('SKYKING.png');
    expect(safePngName(null)).toBe('SKYKING.png');
    expect(safePngName('..')).toBe('SKYKING.png');
  });
});

describe('saveScreenshot', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

  it('כותב לתיקייה ומחזיר את הנתיב המלא', () => {
    const r = saveScreenshot({ dir, name: 'a.png', png });
    expect(r.ok).toBe(true);
    expect(r.path).toBe(path.join(dir, 'a.png'));
    expect(fs.readFileSync(r.path)).toEqual(png);
  });

  it('שם תפוס - לא דורס, מוסיף מספור', () => {
    saveScreenshot({ dir, name: 'a.png', png });
    const r = saveScreenshot({ dir, name: 'a.png', png });
    expect(r.path).toBe(path.join(dir, 'a (2).png'));
    expect(fs.readdirSync(dir).sort()).toEqual(['a (2).png', 'a.png']);
  });

  it('תמונה ריקה - נכשל בלי לכתוב', () => {
    const r = saveScreenshot({ dir, name: 'a.png', png: Buffer.alloc(0) });
    expect(r.ok).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
