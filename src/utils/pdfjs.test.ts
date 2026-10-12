import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// "טעינת העזר נכשלה (n.toHex is not a function)" באלקטרון (2026-10-12).
// pdfjs-dist 5.x בבנייה הרגילה קורא ל-Uint8Array.prototype.toHex ול-API חדשים
// נוספים (Math.sumPrecise, Map.getOrInsert) שאינם ב-Chromium 136 של Electron 36.
// הבנייה ה-legacy נושאת להם מימוש חלופי. Node 22 חסר אותם בדיוק כמו Electron,
// ולכן הבדיקה כאן משחזרת את התקלה בפועל.

/** PDF מינימלי תקין - עמוד אחד ריק */
function tinyPdf(): Uint8Array {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

describe('pdf.js - נטען בסביבה בלי toHex (כמו Electron 36)', () => {
  it('הסביבה כאן אכן חסרה את ה-API (אחרת הבדיקה אינה מוכיחה דבר)', () => {
    expect(typeof (new Uint8Array(1) as any).toHex).toBe('undefined');
  });

  it('הבנייה ה-legacy טוענת PDF ומחשבת לו טביעה (שם נפל toHex)', async () => {
    const { getDocument } = await import('./pdfjs');
    const doc = await getDocument({ data: tinyPdf(), isEvalSupported: false }).promise;
    expect(doc.numPages).toBe(1);
    expect(doc.fingerprints[0]).toMatch(/^[0-9a-f]+$/);
    await doc.destroy();
  }, 30000);
});

describe('אין ייבוא ישיר של pdfjs-dist מחוץ ל-utils/pdfjs.ts', () => {
  // ייבוא של הבנייה הרגילה במקום אחד מחזיר את התקלה באלקטרון - בשקט, ורק שם
  it('כל הקוד עובר דרך המודול המשותף', () => {
    const root = path.resolve(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !p.endsWith(path.join('utils', 'pdfjs.ts'))) {
          if (/from ['"]pdfjs-dist|pdfjs-dist\/build/.test(fs.readFileSync(p, 'utf8'))) offenders.push(path.relative(root, p));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
